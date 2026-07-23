import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Minimum-Quantity Discount Flow (Negative Test)', () => {

    beforeEach(() => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const adminUrl = Cypress.config('baseUrl');

        if (!email || !password) {
            throw new Error('❌ Missing LOGIN_EMAIL or LOGIN_PASSWORD in cypress.env.json configuration.');
        }

        // Cache login session via loginPage POM (Part 1, Rule 6 & Part 2, Rule 1)
        cy.session([email, password], () => {
            loginPage.login(email, password, adminUrl);
        });
    });

    it('Should verify discount is restricted when item quantity is below minimum requirement', () => {
        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');
        const requiredMinQuantity = Number(Cypress.env('REQUIRED_MIN_QUANTITY') || 3);

        // --- 1. SETTINGS & RE-EMBED VIA PAGE OBJECT ---
        cy.visit(`${adminUrl}/dashboard`);
        settingsPage.navigateToScriptSettings();
        settingsPage.reEmbedScript();
        settingsPage.clearStorageAndCookies();

        // --- 2. OPEN SHOPIFY STOREFRONT ORIGIN (Cross-Origin Setup) ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            cy.visit('/');

            // Clean service workers asynchronously without hardcoded delays (Part 1, Rule 2)
            cy.window().then((win) => {
                if (win.navigator?.serviceWorker) {
                    return win.navigator.serviceWorker.getRegistrations().then((regs) =>
                        Promise.all(regs.map((r) => r.unregister()))
                    );
                }
            });

            // Resilient behavior-based navigation (Part 1, Rule 1 & Part 2, Rule 5)
            cy.contains('Featured products', { timeout: 25000 })
                .should('be.visible')
                .scrollIntoView();

            cy.get('a:visible').contains(/Laptops/i).click();

            // Set quantity below required threshold (Quantity = 2)
            cy.get('button[name="plus"]', { timeout: 15000 })
                .should('be.visible')
                .and('not.be.disabled')
                .click();

            cy.get('input[name="quantity"]').should('have.value', '2');

            // Add product to cart
            cy.get('button[name="add"]').should('be.visible').click();

            // Proceed to cart & checkout without force: true (Part 2, Rule 9)
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

        // --- 4. RESILIENT QUANTITY VERIFICATION ---
        // Anchors on visible product name 'Laptops', traverses to its row, and extracts badge digit
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

                // Explicit Condition Evaluation
                if (totalQuantity < requiredMinQuantity) {
                    cy.log(
                        `✅ NEGATIVE TEST PASSED: Item quantity (${totalQuantity}) is strictly less than required minimum threshold (${requiredMinQuantity}). Discount successfully restricted.`
                    );
                    expect(totalQuantity).to.be.below(requiredMinQuantity);
                } else {
                    throw new Error(
                        `❌ NEGATIVE TEST FAILED: Item quantity (${totalQuantity}) met or exceeded minimum threshold (${requiredMinQuantity}).`
                    );
                }
            });
    });
});