import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Invalid Coupon Fallback Test', () => {

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

    it('Should log in, re-embed, add 3 products, apply invalid coupon, and verify invalid code rejection', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');
        const invalidDiscountCode = Cypress.env('INVALID_DISCOUNT_CODE');

        if (!storeUrl || !invalidDiscountCode) {
            throw new Error('❌ Missing STORE_URL or INVALID_DISCOUNT_CODE in cypress.env.json configuration.');
        }

        // --- 1. SETTINGS & SCRIPT RE-EMBED VIA PAGE OBJECT ---
        cy.visit(`${adminUrl}/dashboard`);
        settingsPage.navigateToScriptSettings();
        settingsPage.reEmbedScript();
        settingsPage.clearStorageAndCookies();

        // --- 2. STOREFRONT ORIGIN & CART JOURNEY (Part 2, Rule 14) ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            const storefrontModule = Cypress.require('../../page-objects/storefrontPage');
            const RawStorefront = storefrontModule.default || storefrontModule;
            const storefront = typeof RawStorefront === 'function' ? new RawStorefront() : RawStorefront;

            const addProductFn = (storefront && typeof storefront.addProductToCart === 'function')
                ? storefront.addProductToCart.bind(storefront)
                : (typeof storefrontModule.addProductToCart === 'function' 
                    ? storefrontModule.addProductToCart.bind(storefrontModule) 
                    : null);

            const products = [
                "Knitted Men's Polo T-shirt",
                "Laptops",
                "Men’s Cable Knit Sweater"
            ];

            products.forEach((product) => {
                if (addProductFn) {
                    addProductFn(product);
                } else {
                    cy.visit(storeUrl);
                    cy.contains('a:visible', product, { timeout: 15000 }).click();
                    cy.get('button[name="add"]', { timeout: 15000 })
                        .should('be.visible')
                        .and('not.be.disabled')
                        .click();
                }
            });

            // Visit cart using absolute storefront path
            cy.visit(`${storeUrl}/cart`);
            cy.url().should('include', '/cart');

            cy.get('button[name="checkout"], input[name="checkout"]')
                .filter(':visible')
                .first()
                .should('be.visible')
                .and('not.be.disabled')
                .click();
        });

        // --- 3. CHECKOUT REDIRECT & STABILIZATION ---
        checkoutPage.stabilizeCheckout();

        // --- 4. DISCOUNT ENTRY & DOM RETRY-ABILITY ASSERTION ---
        let initialTotal = 0;

        const extractPrice = (elementText) => {
            const matches = elementText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
            return matches ? parseFloat(matches[0].replace(/,/g, '')) : parseFloat(elementText.replace(/[^0-9.]/g, ''));
        };

        // Capture initial benchmark total with automatic retry-ability (Part 1, Rule 2 & Part 1, Rule 9)
        cy.contains('div:visible', 'Total', { timeout: 15000 })
            .invoke('text')
            .should('match', /\d+/)
            .then((initialText) => {
                initialTotal = extractPrice(initialText);
                cy.log(`Initial Order Total: €${initialTotal}`);
            });

        // Input invalid discount code
        cy.get('input[name="discount_code"], input[placeholder*="discount" i]', { timeout: 15000 })
            .filter(':visible')
            .first()
            .should('be.visible')
            .clear()
            .type(invalidDiscountCode);

        // Apply coupon without force: true (Part 2, Rule 9)
        cy.get('button:contains("Apply")')
            .filter(':visible')
            .first()
            .should('be.visible')
            .and('not.be.disabled')
            .click();

        // Resilient behavior-based matching for UI error text (Part 2, Rule 5)
        cy.contains(/discount not found|not found|invalid|not valid|enter a valid|expired/i, { timeout: 20000 })
            .should('be.visible');

        // Assert total order price remained unchanged
        cy.contains('div:visible', 'Total', { timeout: 15000 })
            .should(($div) => {
                const finalTotal = extractPrice($div.text());
                expect(
                    finalTotal,
                    '❌ TEST FAILED: Invalid coupon code altered the order total.'
                ).to.equal(initialTotal);
            })
            .then(() => {
                cy.log('✅ PASS: Invalid discount code cleanly blocked and order total remained unchanged.');
            });
    });
});