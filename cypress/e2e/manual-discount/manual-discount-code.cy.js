import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';
import storefrontPage from '../../page-objects/storefrontPage';

// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err) => {
    return !err.message.includes('secretKeyVerified is not defined');
});

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Discount Flow', () => {

    it('Should log in, re-embed script, walk through cart checkout, and verify 30% discount', () => {
        
        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';
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

        // Purge storage prior to moving cross-origin
        cy.window().then((win) => {
            win.sessionStorage.clear();
            win.localStorage.clear();
        });
        cy.clearCookies();

        // --- 3. OPEN SHOPIFY STOREFRONT ORIGIN (Using storefrontPage) ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);

            // Require storefront page object from the correct relative path inside cross-origin context
            const storefrontModule = Cypress.require('../../page-objects/storefrontPage');
            const storefront = storefrontModule.default || storefrontModule;

            cy.visit('/');

            // Clean up Service Workers safely
            cy.window().then((win) => {
                if (win.navigator?.serviceWorker) {
                    win.navigator.serviceWorker.getRegistrations().then((regs) => {
                        regs.forEach(reg => reg.unregister());
                    });
                }
            });

            // Add Product via Page Object with safe fallback
            if (typeof storefront.addProductToCart === 'function') {
                storefront.addProductToCart('Laptops');
            } else {
                cy.contains('Featured products', { timeout: 25000 }).scrollIntoView();
                cy.get('a:visible').contains('Laptops').click();
                cy.get('button[name="add"]').click();
            }
            
            // Navigate to checkout
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

        // --- 5. DISCOUNT CODE APPLICATION & MATH VERIFICATION ---
        cy.get('body').then(($body) => {
            const extractPrice = (textVal) => {
                const matches = textVal.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                return matches ? parseFloat(matches[0].replace(/,/g, '')) : parseFloat(textVal.replace(/[^0-9.]/g, ''));
            };

            cy.contains('div:visible', 'Total', { timeout: 15000 }).invoke('text').then((initialText) => {
                const initialTotal = extractPrice(initialText);
                cy.log(`Initial Clean Total Price: €${initialTotal}`);

                // Find discount inputs dynamically
                const inputField = typeof checkoutPage.getDiscountInput === 'function' 
                    ? checkoutPage.getDiscountInput() 
                    : cy.get('input[name="discount_code"]').first();

                inputField.clear().type('YBMKT9Z3AVDP'); 

                const applyBtn = typeof checkoutPage.getApplyButton === 'function' 
                    ? checkoutPage.getApplyButton() 
                    : cy.get('button.discount-apply-button');

                applyBtn.click({ force: true });

                // Wait for the Total text block to change
                cy.contains('div:visible', 'Total', { timeout: 15000 }).should('not.contain', initialText);

                // Math verification block
                cy.contains('div:visible', 'Total').invoke('text').then((updatedText) => {
                    const finalTotal = extractPrice(updatedText);
                    const expectedTotal = initialTotal * 0.70; // 30% reduction
                    const variance = Math.abs(finalTotal - expectedTotal);

                    cy.log(`Updated Total: €${finalTotal} | Expected: €${expectedTotal}`);

                    if (variance <= 0.01) {
                        cy.log('✅ TEST PASSED: Total value reflects a clean 30% reduction!');
                        expect(finalTotal).to.be.closeTo(expectedTotal, 0.01);
                    } else {
                        throw new Error(
                            `❌ TEST FAILED: Applied discount did not reduce total by exactly 30%. ` +
                            `Expected ~€${expectedTotal.toFixed(2)}, but received: €${finalTotal.toFixed(2)}`
                        );
                    }
                });
            });
        });
    });
});