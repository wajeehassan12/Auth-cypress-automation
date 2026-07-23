import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Specific Product Bundle Discount Flow', () => {

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

    it('Should log in, re-embed script, add specific bundle to cart, validate items, and apply coupon', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');
        const discountCode = Cypress.env('DISCOUNT_CODE_SPECIFIC');

        if (!storeUrl || !discountCode) {
            throw new Error('❌ Missing STORE_URL or DISCOUNT_CODE_SPECIFIC in cypress.env.json configuration.');
        }

        // Setup network intercepts with explicit aliases OUTSIDE cy.origin (Part 1, Rule 11 & Part 2, Rule 11, 14)
        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/checkout/*/discount').as('applyDiscountCode');
        cy.intercept('POST', '**/cart/add*').as('addToCart');

        // --- 1. SETTINGS & SCRIPT RE-EMBED VIA PAGE OBJECT ---
        cy.visit(`${adminUrl}/dashboard`);
        settingsPage.navigateToScriptSettings();
        settingsPage.reEmbedScript();

        // Assert backend request completion explicitly via alias (Part 1, Rule 2 & Part 2, Rule 11)
        cy.wait('@reEmbedRequest').its('response.statusCode').should('eq', 200);
        settingsPage.clearStorageAndCookies();

        // --- 2. SHOPIFY STOREFRONT ORIGIN FLOW (Part 2, Rule 14) ---
        cy.origin(storeUrl, () => {
            // Helper function to sequence additions and wait on intercepted requests
            const addProductToCart = (productName) => {
                cy.visit('/');
                cy.contains('Featured products', { timeout: 25000 })
                    .should('be.visible')
                    .scrollIntoView();

                cy.get('a:visible').contains(productName).click();

                cy.get('button[name="add"]', { timeout: 15000 })
                    .should('be.visible')
                    .and('not.be.disabled')
                    .click();

                // Accept AJAX success (200/204) OR HTML form POST redirects (302) (Part 1, Rule 2 & Part 2, Rule 11)
                cy.wait('@addToCart').its('response.statusCode').should('be.oneOf', [200, 204, 302]);
            };

            addProductToCart('Laptops');
            addProductToCart('PlayStation®5 Pro Console');

            // Navigate directly to cart page to avoid ephemeral notification pop-up flakiness (Part 2, Rule 5)
            cy.visit('/cart');
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

        // --- 4. BUNDLE VALIDATION (Resilient behavior-based matching) (Part 2, Rule 5) ---
        cy.contains(/Laptop/i, { timeout: 20000 })
            .scrollIntoView()
            .should('be.visible');

        cy.contains(/PlayStation/i, { timeout: 20000 })
            .scrollIntoView()
            .should('be.visible');

        // --- 5. DISCOUNT ENTRY & PRICE DROP ASSERTION ---
        let initialTotal = 0;

        // Clean price extraction helper function
        const extractPrice = (elementText) => {
            const matches = elementText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
            return matches ? parseFloat(matches[0].replace(/,/g, '')) : parseFloat(elementText.replace(/[^0-9.]/g, ''));
        };

        // Capture pre-discount benchmark with built-in retry-ability (Part 1, Rule 2)
        cy.contains('div:visible', 'Total', { timeout: 15000 })
            .invoke('text')
            .should('match', /\d+/)
            .then((initialText) => {
                initialTotal = extractPrice(initialText);
                cy.log(`Initial Order Total: €${initialTotal}`);
            });

        // Locate coupon field dynamically and enter code
        cy.get('input[name="discount_code"], input[placeholder*="discount" i]', { timeout: 15000 })
            .filter(':visible')
            .first()
            .should('be.visible')
            .clear()
            .type(discountCode);

        // Apply discount code without force: true (Part 2, Rule 9)
        cy.get('button:contains("Apply")')
            .filter(':visible')
            .first()
            .should('be.visible')
            .and('not.be.disabled')
            .click();

        // Explicitly wait for backend discount application request (Part 2, Rule 11)
        cy.wait('@applyDiscountCode').its('response.statusCode').should('be.oneOf', [200, 204, 302]);

        // Assert total price dropped below baseline amount
        cy.contains('div:visible', 'Total', { timeout: 15000 })
            .should(($div) => {
                const finalTotal = extractPrice($div.text());
                expect(
                    finalTotal,
                    '❌ TEST FAILED: Specific product discount was submitted but final order total did not decrease.'
                ).to.be.lessThan(initialTotal);
            })
            .then(($div) => {
                // Safe logging after assertion passes
                const finalTotal = extractPrice($div.text());
                cy.log(`✅ TEST PASSED: Match confirmation verified and bundle code applied successfully! Updated total: €${finalTotal}`);
            });
    });
});