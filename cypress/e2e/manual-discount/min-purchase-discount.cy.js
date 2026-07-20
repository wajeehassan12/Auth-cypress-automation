import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';
import storefrontPage from '../../page-objects/storefrontPage';

// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err) => {
    return !err.message.includes('secretKeyVerified is not defined');
});

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Minimum-Purchase Discount Flow', () => {

    it('Should log in, re-embed script, walk through cart checkout, and verify discount applies above €200 minimum purchase', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';
        const discountCode = Cypress.env('DISCOUNT_CODE_2') || 'C6DDQT4PDF7T';
        const MIN_PURCHASE_FOR_DISCOUNT = 200;

        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');

        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        // --- 1. DASHBOARD LOGIN ---
        if (typeof loginPage.login === 'function') {
            loginPage.login(email, password, adminUrl);
        } else {
            cy.visit(`${adminUrl}/login`);
            cy.get('input[type="email"]').type(email);
            cy.get('input[type="password"]').type(password, { log: false });
            cy.get('button').contains(/Log in/i).click();
        }
        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        // --- 2. SETTINGS & SCRIPT RE-EMBED ---
        if (typeof settingsPage.navigateToScriptSettings === 'function' && typeof settingsPage.reEmbedScript === 'function') {
            settingsPage.navigateToScriptSettings();
            settingsPage.reEmbedScript();
        } else {
            cy.contains('Settings', { timeout: 15000 }).click();
            cy.contains('Checky Pro Script', { timeout: 15000 }).click();
            cy.contains('button', 'Re-embed script').click();
        }

        cy.wait('@reEmbedRequest', { timeout: 30000 }).its('response.statusCode').should('eq', 200);
        cy.wait(3000);

        // Purge session artifacts before moving cross-origin
        cy.window().then((win) => {
            win.sessionStorage.clear();
            win.localStorage.clear();
        });
        cy.clearCookies();

        // --- 3. OPEN SHOPIFY STOREFRONT ORIGIN ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);

            // Corrected path here as well to find the Page Object in the cross-origin sandbox
            const storefrontModule = Cypress.require('../../page-objects/storefrontPage');
            const storefront = storefrontModule.default || storefrontModule;

            cy.visit('/');

            // Safely unregister background Service Workers
            cy.window().then((win) => {
                if (win.navigator?.serviceWorker) {
                    win.navigator.serviceWorker.getRegistrations().then((regs) => {
                        regs.forEach(reg => reg.unregister());
                    });
                }
            });

            // Navigate and increase item count to hit minimum threshold
            if (typeof storefront.addProductsToCart === 'function') {
                storefront.addProductsToCart('Laptops', 2);
            } else {
                cy.contains('Featured products', { timeout: 25000 }).scrollIntoView();
                cy.get('a:visible').contains('Laptops').click();
                cy.get('button[name="plus"]', { timeout: 15000 }).click();
                cy.get('input[name="quantity"]').should('have.value', '2');
                cy.get('button[name="add"]').click();
            }

            // Proceed to cart pipeline
            if (typeof storefront.goToCheckout === 'function') {
                storefront.goToCheckout();
            } else {
                cy.contains('View cart').click();
                cy.get('button[name="checkout"]:visible').click();
            }
        });

        // --- 4. CHECKOUT REDIRECT & STABILIZATION ---
        if (typeof checkoutPage.stabilizeCheckout === 'function') {
            checkoutPage.stabilizeCheckout();
        } else {
            cy.url({ timeout: 45000 }).should('include', '/checkout');
            cy.contains('Contact', { timeout: 25000 }).should('be.visible');
            cy.wait(4000);
        }

        // --- 5. DISCOUNT CODE APPLICATION & MINIMUM-PURCHASE VERIFICATION ---
        cy.get('body').then(($body) => {
            const extractPrice = (textVal) => {
                const matches = textVal.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                return matches ? parseFloat(matches[0].replace(/,/g, '')) : parseFloat(textVal.replace(/[^0-9.]/g, ''));
            };

            cy.contains('div:visible', 'Total', { timeout: 15000 }).invoke('text').then((initialText) => {
                const initialTotal = extractPrice(initialText);
                cy.log(`Initial Clean Total Price: €${initialTotal}`);

                // Guard clause to instantly fail if the 2 items didn't cross the €200 mark
                if (initialTotal < MIN_PURCHASE_FOR_DISCOUNT) {
                    throw new Error(`❌ TEST FAILED: Cart total (€${initialTotal}) does not meet the €${MIN_PURCHASE_FOR_DISCOUNT} minimum.`);
                }

                // Interact with UI components via Page Object selectors
                const inputField = typeof checkoutPage.getDiscountInput === 'function' 
                    ? checkoutPage.getDiscountInput() 
                    : cy.get('input[name="discount_code"]').first();

                inputField.clear().type(discountCode);

                const applyBtn = typeof checkoutPage.getApplyButton === 'function' 
                    ? checkoutPage.getApplyButton() 
                    : cy.get('button.discount-apply-button');

                applyBtn.click({ force: true });

                // Assert code calculation applied successfully and total value has shrunk
                cy.contains('div:visible', 'Total', { timeout: 15000 }).should(($div) => {
                    const finalTotal = extractPrice($div.text());
                    expect(finalTotal).to.be.lessThan(initialTotal);
                });

                cy.log(`✅ TEST PASSED: Cart met the €${MIN_PURCHASE_FOR_DISCOUNT} minimum and the discount was validated!`);
            });
        });
    });
});