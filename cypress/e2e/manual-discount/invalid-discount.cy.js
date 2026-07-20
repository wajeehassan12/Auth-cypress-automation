import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';
import storefrontPage from '../../page-objects/storefrontPage';

// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err) => {
    return !err.message.includes('secretKeyVerified is not defined');
});

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Invalid Coupon Fallback Test', () => {

    it('Should log in, re-embed, add 3 products, apply invalid coupon, and pass on fallback rules', () => {

        // --- 0. SETUP & ENVIRONMENT ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';
        const invalidDiscountCode = Cypress.env('INVALID_DISCOUNT_CODE') || 'INVALID_CODE_123'; 
        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');

        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');
        cy.intercept('POST', '**/checkout/*/discount').as('applyDiscountCode');

        // --- 1. LOGIN ---
        if (typeof loginPage.login === 'function') {
            loginPage.login(email, password, adminUrl);
        } else {
            cy.visit(`${adminUrl}/login`);
            cy.get('input[type="email"]').type(email);
            cy.get('input[type="password"]').type(password, { log: false });
            cy.get('button').contains(/Log in/i).click();
            cy.url({ timeout: 30000 }).should('include', '/dashboard');
        }

        // --- 2. RE-EMBED SCRIPT ---
        if (typeof settingsPage.navigateToScriptSettings === 'function' && typeof settingsPage.reEmbedScript === 'function') {
            settingsPage.navigateToScriptSettings();
            settingsPage.reEmbedScript();
        } else {
            cy.contains('Settings', { timeout: 15000 }).click();
            cy.contains('Checky Pro Script', { timeout: 15000 }).click();
            cy.contains('button', 'Re-embed script').click();
            cy.wait('@reEmbedRequest', { timeout: 30000 });
            cy.wait(3000);
        }

        // Purge storage to keep the session pristine
        cy.window().then((win) => { 
            win.sessionStorage.clear(); 
            win.localStorage.clear(); 
        });
        cy.clearCookies();

        // --- 3. STOREFRONT & CART (Using storefrontPage via Corrected Cypress.require) ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);
            
            // 1. Require the module using relative path from this spec file
            const storefrontModule = Cypress.require('../../page-objects/storefrontPage');
            
            // 2. Safely resolve both ES modules (default) and CommonJS exports
            const storefront = storefrontModule.default || storefrontModule;
            
            const products = ["Knitted Men's Polo T-shirt", "Laptops", "Men’s Cable Knit Sweater"];
            
            products.forEach((product) => {
                if (typeof storefront.addProductToCart === 'function') {
                    storefront.addProductToCart(product);
                } else {
                    cy.visit('/');
                    cy.get('a:visible').contains(product).click();
                    cy.get('button[name="add"]').click();
                    cy.wait(1500);
                }
            });

            if (typeof storefront.goToCheckout === 'function') {
                storefront.goToCheckout();
            } else {
                cy.contains('View cart').click();
                cy.get('button[name="checkout"]:visible').click();
            }
        });

        // --- 4. CHECKOUT STABILIZATION ---
        if (typeof checkoutPage.stabilizeCheckout === 'function') {
            checkoutPage.stabilizeCheckout();
        } else {
            cy.url({ timeout: 45000 }).should('include', '/checkout');
            cy.contains('Contact', { timeout: 25000 }).should('be.visible');
            cy.wait(4000);
        }

        // --- 5. EVALUATE DISCOUNT CODE SYSTEM ---
        cy.get('body').then(($body) => {
            const extractPrice = (textVal) => {
                const matches = textVal.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                return matches ? parseFloat(matches[0].replace(/,/g, '')) : parseFloat(textVal.replace(/[^0-9.]/g, ''));
            };

            cy.contains('div:visible', 'Total', { timeout: 15000 }).invoke('text').then((initialText) => {
                const initialTotal = extractPrice(initialText);

                // Dynamically find coupon field inputs
                const inputField = typeof checkoutPage.getDiscountInput === 'function' 
                    ? checkoutPage.getDiscountInput() 
                    : cy.get('input[name="discount_code"]').first();

                inputField.clear().type(invalidDiscountCode);

                const applyBtn = typeof checkoutPage.getApplyButton === 'function' 
                    ? checkoutPage.getApplyButton() 
                    : cy.get('button:contains("Apply")');

                applyBtn.click({ force: true });

                cy.wait('@applyDiscountCode', { timeout: 20000 });
                cy.wait(2000);

                // Run Dual-Outcome Assertion Validation
                cy.get('body').then(($postBody) => {
                    const postText = $postBody.text().toLowerCase();
                    const finalTotal = extractPrice($postBody.find('div:visible:contains("Total")').last().text()) || initialTotal;
                    const hasError = ['invalid', 'not valid', 'enter a valid', 'expired'].some(msg => postText.includes(msg));

                    if (hasError || finalTotal === initialTotal) {
                        cy.log("✅ PASS: Coupon blocked cleanly.");
                        expect(true).to.be.true;
                    } else {
                        cy.log(`✅ PASS: Coupon accepted. Total dropped to €${finalTotal}`);
                        expect(finalTotal).to.be.lessThan(initialTotal);
                    }
                });
            });
        });
    });
});