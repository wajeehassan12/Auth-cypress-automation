import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Specific Collection Bundle Discount Flow', () => {

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

    it('Should log in, re-embed script, add 3 homepage products to cart, validate items, and apply collection coupon', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');
        const discountCode = Cypress.env('DISCOUNT_CODE_COLLECTION');

        if (!storeUrl || !discountCode) {
            throw new Error('❌ Missing STORE_URL or DISCOUNT_CODE_COLLECTION in cypress.env.json configuration.');
        }

        // Setup intercepts with explicit aliases OUTSIDE cy.origin (Part 1, Rule 11 & Part 2, Rule 11, 14)
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
            // Reusable helper to clean up test layout & add targeted products without static sleeps
            const addProductToCart = (productName) => {
                cy.visit('/');
                cy.contains('Featured products', { timeout: 25000 })
                    .should('be.visible')
                    .scrollIntoView();
                    
                // Account for smart apostrophe differences resiliently (Part 2, Rule 5)
                const searchRegex = new RegExp(productName.replace(/['’]/g, "['’]"), 'i');
                cy.get('a:visible').contains(searchRegex).click();

                cy.get('button[name="add"]', { timeout: 15000 })
                    .should('be.visible')
                    .and('not.be.disabled')
                    .click();

                // Explicitly wait for cart backend AJAX completion (alias intercepted outside cy.origin)
                cy.wait('@addToCart').its('response.statusCode').should('be.oneOf', [200, 204]);
            };

            // Add all 3 items sequentially with network synchronization
            addProductToCart("Knitted Men's Polo T-shirt");
            addProductToCart("Laptops");
            addProductToCart("Men’s Cable Knit Sweater");

            // Navigate to Cart and progress to checkout
            cy.contains('a, button', /View cart/i, { timeout: 15000 })
                .should('be.visible')
                .click();

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

        // --- 4. COLLECTION VALIDATION (Resilient behavior-based matching) (Part 2, Rule 5) ---
        cy.contains(/Polo/i, { timeout: 20000 })
            .scrollIntoView()
            .should('be.visible');

        cy.contains(/Laptop/i, { timeout: 20000 })
            .scrollIntoView()
            .should('be.visible');

        cy.contains(/Sweater|Cable Knit/i, { timeout: 20000 })
            .scrollIntoView()
            .should('be.visible');

        cy.log('✅ Validation successful! Specific collections bundle verified. Applying discount code...');

        // --- 5. DISCOUNT APPLICATION & PRICE DROP ASSERTION ---
        let initialTotal = 0;

        // Capture initial total price with built-in retry-ability (Part 1, Rule 2)
        cy.contains('div:visible', 'Total', { timeout: 15000 })
            .invoke('text')
            .should('match', /\d+/)
            .then((initialText) => {
                const initialMatches = initialText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                initialTotal = initialMatches
                    ? parseFloat(initialMatches[0].replace(/,/g, ''))
                    : parseFloat(initialText.replace(/[^0-9.]/g, ''));
                cy.log(`Initial Order Total: €${initialTotal}`);
            });

        // Enter discount code using resilient combined selector
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
        cy.wait('@applyDiscountCode').its('response.statusCode').should('eq', 200);

        // Assert total price dropped below baseline amount
        cy.contains('div:visible', 'Total', { timeout: 15000 }).should(($div) => {
            const updatedText = $div.text();
            const updatedMatches = updatedText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
            const finalTotal = updatedMatches
                ? parseFloat(updatedMatches[0].replace(/,/g, ''))
                : parseFloat(updatedText.replace(/[^0-9.]/g, ''));

            expect(
                finalTotal,
                '❌ TEST FAILED: Collection discount was submitted but final order total did not decrease.'
            ).to.be.lessThan(initialTotal);
        });
    });
});