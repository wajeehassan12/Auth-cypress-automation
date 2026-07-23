import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Minimum-Purchase Discount Flow', () => {

    beforeEach(() => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const adminUrl = Cypress.config('baseUrl');

        if (!email || !password) {
            throw new Error('❌ Missing LOGIN_EMAIL or LOGIN_PASSWORD in cypress.env.json configuration.');
        }

        // Cache session across tests using Page Object Model (Part 1, Rule 6 & Part 2, Rule 1, 6)
        cy.session([email, password], () => {
            loginPage.login(email, password, adminUrl);
        });
    });

    it('Should log in, re-embed script, walk through cart checkout, and verify minimum purchase threshold', () => {

        // --- 0. ENVIRONMENT SETUP & PROTOCOL NORMALIZATION ---
        const adminUrl = Cypress.config('baseUrl');
        let storeUrl = Cypress.env('STORE_URL') || 'https://checkyprostore.robustapps.net';
        const discountCode = Cypress.env('DISCOUNT_CODE_2');
        const MIN_PURCHASE_FOR_DISCOUNT = 200;

        if (!discountCode) {
            throw new Error('❌ Missing DISCOUNT_CODE_2 in cypress.env.json configuration.');
        }

        // Enforce HTTPS protocol to prevent spec bridge mismatch (http -> https)
        if (!storeUrl.startsWith('http://') && !storeUrl.startsWith('https://')) {
            storeUrl = `https://${storeUrl}`;
        } else if (storeUrl.startsWith('http://')) {
            storeUrl = storeUrl.replace('http://', 'https://');
        }

        // --- 1. SETTINGS & SCRIPT RE-EMBED VIA PAGE OBJECT ---
        cy.visit(`${adminUrl}/dashboard`);
        settingsPage.navigateToScriptSettings();
        settingsPage.reEmbedScript();
        settingsPage.clearStorageAndCookies();

        // --- 2. STOREFRONT ORIGIN & CART JOURNEY (Part 2, Rule 14) ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            const storefrontModule = Cypress.require('../../page-objects/storefrontPage');
            const TargetExport = storefrontModule.default || storefrontModule;
            const storefront = (typeof TargetExport === 'function') 
                ? new TargetExport() 
                : (TargetExport.storefrontPage || TargetExport);

            cy.visit(storeUrl);

            // Add product via Page Object method or retryable DOM selector fallback
            if (storefront && typeof storefront.addProductsToCart === 'function') {
                storefront.addProductsToCart('Laptops', 2);
            } else if (storefront && typeof storefront.addProductToCart === 'function') {
                storefront.addProductToCart('Laptops');
            } else {
                cy.contains('a:visible', 'Laptops', { timeout: 15000 }).click();
                cy.get('button[name="plus"]', { timeout: 15000 }).click();
                cy.get('button[name="add"]', { timeout: 15000 })
                    .should('be.visible')
                    .and('not.be.disabled')
                    .click();
            }

            // Go to checkout via Page Object method or retryable DOM selector fallback
            if (storefront && typeof storefront.goToCheckout === 'function') {
                storefront.goToCheckout();
            } else {
                cy.visit(`${storeUrl}/cart`);
                cy.get('button[name="checkout"], input[name="checkout"]', { timeout: 15000 })
                    .filter(':visible')
                    .first()
                    .should('be.visible')
                    .and('not.be.disabled')
                    .click();
            }
        });

        // --- 3. CHECKOUT REDIRECT & STABILIZATION ---
        checkoutPage.stabilizeCheckout();

        // --- 4. CONDITIONAL DISCOUNT APPLICATION & VERIFICATION ---
        const extractPrice = (textVal) => {
            const matches = textVal.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
            return matches ? parseFloat(matches[0].replace(/,/g, '')) : parseFloat(textVal.replace(/[^0-9.]/g, ''));
        };

        cy.contains('div:visible', 'Total', { timeout: 15000 })
            .invoke('text')
            .should('match', /\d+/)
            .then((initialText) => {
                const initialTotal = extractPrice(initialText);
                cy.log(`Initial Clean Total Price: €${initialTotal}`);

                // Enter discount code using resilient selector
                cy.get('input[name="discount_code"], input[placeholder*="discount" i]', { timeout: 15000 })
                    .filter(':visible')
                    .first()
                    .should('be.visible')
                    .clear()
                    .type(discountCode);

                // Click apply button without { force: true } (Part 2, Rule 9)
                cy.contains('button:visible', /apply/i, { timeout: 15000 })
                    .should('be.visible')
                    .and('not.be.disabled')
                    .click();

                // EVALUATE MINIMUM PURCHASE CONDITION
                if (initialTotal >= MIN_PURCHASE_FOR_DISCOUNT) {
                    // CASE A: Minimum purchase met -> Verify discount APPLIED
                    cy.contains('div:visible', 'Total', { timeout: 20000 })
                        .should(($totalDiv) => {
                            const finalTotal = extractPrice($totalDiv.text());
                            expect(
                                finalTotal,
                                `Expected discount to reduce total from initial €${initialTotal}`
                            ).to.be.lessThan(initialTotal);
                        })
                        .then(() => {
                            cy.log(`✅ TEST PASSED: Cart (€${initialTotal}) met €${MIN_PURCHASE_FOR_DISCOUNT} minimum and discount was applied!`);
                        });
                } else {
                    // CASE B: Minimum purchase NOT met -> Verify discount REJECTED
                    cy.contains('div:visible', 'Total', { timeout: 20000 })
                        .should(($totalDiv) => {
                            const finalTotal = extractPrice($totalDiv.text());
                            expect(
                                finalTotal,
                                `Cart total (€${initialTotal}) is below €${MIN_PURCHASE_FOR_DISCOUNT} minimum requirement. Discount must NOT apply.`
                            ).to.equal(initialTotal);
                        })
                        .then(() => {
                            cy.log(`✅ TEST PASSED: Cart (€${initialTotal}) did NOT meet €${MIN_PURCHASE_FOR_DISCOUNT} minimum and discount was correctly rejected!`);
                        });
                }
            });
    });
});