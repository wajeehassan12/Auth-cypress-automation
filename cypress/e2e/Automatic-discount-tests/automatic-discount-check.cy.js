import loginPage from '../../page-objects/login-page';
import scriptSettingsPage from '../../page-objects/script-settings-page';
import { parseLocaleNumber } from '../../support/utils/price-parser';

describe('Checky Pro - Checkout Page Automation & Product Flow Verification', () => {

    it('Should login, re-embed script, add products, and verify cart total matches checkout total', () => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');

        if (!email || !password || !storeUrl) {
            throw new Error('Missing required environment configuration parameters.');
        }

        cy.fixture('products.json').then((productsToAdd) => {
            // --- 1. DASHBOARD LOGIN & SCRIPT RE-EMBED ---
            loginPage.visit();
            loginPage.attemptLogin(email, password);
            cy.url({ timeout: 30000 }).should('include', '/dashboard');

            scriptSettingsPage.navigateToScriptSettings();
            scriptSettingsPage.reEmbedScript();

            // --- 2. STOREFRONT FLOW (CROSS-ORIGIN) ---
            cy.origin(storeUrl, { args: { storeUrl, productsToAdd } }, ({ storeUrl, productsToAdd }) => {

                // Add products to cart sequentially
                productsToAdd.forEach((product) => {
                    cy.visit('/', { timeout: 60000, pageLoadTimeout: 60000 });
                    cy.url({ timeout: 30000 }).should('include', 'checkyprostore');

                    cy.contains('Featured products', { timeout: 20000 })
                        .should('be.visible')
                        .scrollIntoView();

                    cy.get('a:visible', { timeout: 15000 })
                        .contains(new RegExp(product.match, 'i'))
                        .first()
                        .click();

                    cy.url({ timeout: 15000 }).should('include', '/products/');

                    cy.get('button[name="add"]').should('be.visible').click();

                    // Retryable visibility check for drawer confirmation
                    cy.contains(/added to your cart|view cart/i, { timeout: 15000 }).should('be.visible');
                });

                // Navigate to Cart
                cy.visit('/cart', { timeout: 30000 });
                cy.url().should('include', '/cart');

                // Capture Cart Details
                return cy.get('form[action="/cart"], .cart__footer, main', { timeout: 15000 })
                    .first()
                    .should('be.visible')
                    .then(($cartContainer) => {
                        const $cartClone = $cartContainer.clone();
                        $cartClone.find('script, style, noscript, template').remove();
                        const fullText = $cartClone.text().replace(/\s+/g, ' ');

                        let estimatedTotal = '';
                        const totalMatch = fullText.match(/\bEstimated total\b[^0-9]{0,30}([\d][\d,.]*\d|\d)/i);

                        if (totalMatch) {
                            estimatedTotal = totalMatch[1];
                        } else {
                            const allPrices = fullText.match(/(?:[€$£]|Rs\.?|PKR|USD|EUR|GBP)\s*([\d][\d,.]*\d|\d)/gi) || [];
                            if (allPrices.length) {
                                const lastPrice = allPrices[allPrices.length - 1].match(/([\d][\d,.]*\d|\d)/);
                                estimatedTotal = lastPrice ? lastPrice[1] : '';
                            }
                        }

                        cy.get('button[name="checkout"]:visible')
                            .should('be.visible')
                            .should('not.be.disabled')
                            .click();

                        return cy.wrap({ totalPrice: estimatedTotal });
                    });
            }).then((cartData) => {
                // --- 3. CHECKOUT VERIFICATION ---
                cy.url({ timeout: 45000 }).should('include', '/checkout');
                cy.contains('Contact', { timeout: 20000 }).should('be.visible');

                if (cartData.totalPrice) {
                    cy.get('body', { timeout: 20000 }).should(($body) => {
                        const $clone = $body.clone();
                        $clone.find('script, style, noscript, template').remove();
                        const pageText = $clone.text().replace(/\s+/g, ' ');

                        // Handles both full checkout total labels and responsive mobile drawer toggles (e.g. "Show summary€90,153.95")
                        const totalMatch = pageText.match(/(?:Show summary|Estimated total|\bTotal\b)[^0-9]{0,30}([\d][\d,.]*\d|\d)/i)
                            || pageText.match(/(?:[€$£]|Rs\.?|PKR|USD|EUR|GBP)\s*([\d][\d,.]*\d|\d)/i);

                        expect(
                            totalMatch, 
                            `Checkout final total should be present on page. First 300 chars: "${pageText.slice(0, 300)}..."`
                        ).to.exist;

                        const checkoutFinalTotal = parseLocaleNumber(totalMatch[1]);
                        const cartEstimatedTotal = parseLocaleNumber(cartData.totalPrice);

                        expect(checkoutFinalTotal).to.equal(cartEstimatedTotal);
                    });
                }
            });
        });
    });

});