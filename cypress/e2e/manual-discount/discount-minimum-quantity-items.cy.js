import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Minimum-Quantity Discount Flow', () => {

    beforeEach(() => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const adminUrl = Cypress.config('baseUrl');

        if (!email || !password) {
            throw new Error('❌ Missing LOGIN_EMAIL or LOGIN_PASSWORD in cypress.env.json configuration.');
        }

        // Cache session across tests
        cy.session([email, password], () => {
            loginPage.login(email, password, adminUrl);
        });
    });

    it('verify discount applies at minimum 3 quantities', () => {
        // --- 0. ENVIRONMENT SETUP ---
        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');
        const discountCode = Cypress.env('DISCOUNT_CODE_2');
        const MIN_QUANTITY_FOR_DISCOUNT = 3;

        if (!storeUrl || !discountCode) {
            throw new Error('❌ Missing STORE_URL or DISCOUNT_CODE_2 in cypress.env.json configuration.');
        }

        // --- 1. SETTINGS & SCRIPT RE-EMBED ---
        cy.visit(`${adminUrl}/dashboard`);
        settingsPage.navigateToScriptSettings();
        settingsPage.reEmbedScript();
        settingsPage.clearStorageAndCookies();

        // --- 2. SHOPIFY STOREFRONT ORIGIN FLOW ---
        cy.origin(
            storeUrl,
            { args: { MIN_QUANTITY_FOR_DISCOUNT } },
            ({ MIN_QUANTITY_FOR_DISCOUNT }) => {
                cy.visit('/');

                // Clean service workers asynchronously without static wait calls
                cy.window().then((win) => {
                    if (win.navigator?.serviceWorker) {
                        return win.navigator.serviceWorker.getRegistrations().then((regs) =>
                            Promise.all(regs.map((r) => r.unregister()))
                        );
                    }
                });

                // Behavior-based navigation to target product
                cy.contains('Featured products', { timeout: 25000 })
                    .should('be.visible')
                    .scrollIntoView();

                cy.get('a:visible').contains(/Laptops/i).click();

                // Increment item quantity dynamically
                const clicksNeeded = MIN_QUANTITY_FOR_DISCOUNT - 1;
                for (let i = 0; i < clicksNeeded; i++) {
                    cy.get('button[name="plus"]', { timeout: 15000 })
                        .should('be.visible')
                        .and('not.be.disabled')
                        .click();
                }

                cy.get('input[name="quantity"]')
                    .should('have.value', String(MIN_QUANTITY_FOR_DISCOUNT));

                // Add to cart & initiate checkout redirect
                cy.get('button[name="add"]').should('be.visible').click();

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
            }
        );

        // --- 3. CHECKOUT REDIRECT & STABILIZATION ---
        checkoutPage.stabilizeCheckout();

        // --- 4. QUANTITY BADGE VALIDATION ---
        cy.contains('Laptops', { timeout: 20000 })
            .should('be.visible')
            .parents()
            .find('span, div, [class*="badge"], [data-cy*="badge"]')
            .filter(':visible')
            .filter((_, el) => /^\d+$/.test(Cypress.$(el).text().trim()))
            .first()
            .invoke('text')
            .then((text) => {
                const totalQuantity = parseInt(text.trim(), 10);
                expect(totalQuantity).to.eq(
                    MIN_QUANTITY_FOR_DISCOUNT,
                    `Quantity badge (${totalQuantity}) must match expected minimum required quantity (${MIN_QUANTITY_FOR_DISCOUNT})`
                );
            });

        // --- 5. DISCOUNT APPLICATION & PRICE DROP ASSERTION ---
        let initialTotal = 0;

        // Capture initial total price with built-in retryability
        cy.contains('div:visible', 'Total', { timeout: 15000 })
            .invoke('text')
            .should('match', /\d+/)
            .then((initialText) => {
                const matches = initialText.match(/\d+\.\d+/);
                initialTotal = matches ? parseFloat(matches[0]) : parseFloat(initialText.replace(/[^0-9.]/g, ''));
                cy.log(`Initial Total Price: €${initialTotal}`);
            });

        // Enter discount code using combined selector
        cy.get('input[name="discount_code"], input[placeholder*="discount" i]', { timeout: 15000 })
            .filter(':visible')
            .first()
            .should('be.visible')
            .clear()
            .type(discountCode);

        // Apply discount code
        cy.get('button:contains("Apply")')
            .filter(':visible')
            .first()
            .should('be.visible')
            .and('not.be.disabled')
            .click();

        // Assert total price dropped below initial amount
        cy.contains('div:visible', 'Total', { timeout: 15000 }).should(($div) => {
            const updatedText = $div.text();
            const matches = updatedText.match(/\d+\.\d+/);
            const finalTotal = matches ? parseFloat(matches[0]) : parseFloat(updatedText.replace(/[^0-9.]/g, ''));

            expect(
                finalTotal,
                '❌ TEST FAILED: Discount was submitted but final checkout value did not drop.'
            ).to.be.lessThan(initialTotal);
        });
    });
});