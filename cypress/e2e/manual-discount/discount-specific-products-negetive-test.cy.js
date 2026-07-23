import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Discount Rejection Pass Verification', () => {

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

    it('Should add Polo T-shirt, attempt to apply discount, confirm it is NOT applied, and PASS the test', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');
        const discountCode = Cypress.env('DISCOUNT_CODE_3');

        if (!storeUrl || !discountCode) {
            throw new Error('❌ Missing STORE_URL or DISCOUNT_CODE_3 in cypress.env.json configuration.');
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
            cy.visit('/');
            cy.contains('Featured products', { timeout: 25000 })
                .should('be.visible')
                .scrollIntoView();

            // Account for smart apostrophe differences resiliently (Part 2, Rule 5)
            cy.get('a:visible')
                .contains(/Knitted Men['’]s Polo T-shirt/i)
                .click();

            cy.get('button[name="add"]', { timeout: 15000 })
                .should('be.visible')
                .and('not.be.disabled')
                .click();

            // Explicitly wait for cart backend AJAX completion (Part 1, Rule 2 & Part 2, Rule 11)
            cy.wait('@addToCart').its('response.statusCode').should('be.oneOf', [200, 204]);

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

        // --- 4. ITEM PRESENCE VALIDATION (Part 2, Rule 5) ---
        cy.contains(/Polo/i, { timeout: 20000 })
            .scrollIntoView()
            .should('be.visible');

        // --- 5. ATTEMPT DISCOUNT APPLICATION & ASSERT REJECTION ---
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
                cy.log(`Pre-discount Order Total: €${initialTotal}`);
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

        // Explicitly wait for backend discount response (Part 2, Rule 11)
        cy.wait('@applyDiscountCode').its('response.statusCode').should('be.oneOf', [200, 400, 422]);

        // Validate final price remains unaltered (discount rejected as expected)
        cy.contains('div:visible', 'Total', { timeout: 15000 })
            .should(($div) => {
                const finalTotal = extractPrice($div.text());
                // Strictly use assertions inside .should() to maintain retryability
                expect(
                    finalTotal,
                    'System successfully restricted discount application for non-qualifying products.'
                ).to.equal(initialTotal);
            })
            .then(($div) => {
                // Perform logging safely in a chained .then() block after retry assertions succeed
                const finalTotal = extractPrice($div.text());
                cy.log(`Post-discount Order Total: €${finalTotal}`);
            });
    });
});