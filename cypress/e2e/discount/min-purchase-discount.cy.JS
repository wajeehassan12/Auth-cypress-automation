// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('secretKeyVerified is not defined')) {
        return false;
    }
    return true;
});

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Minimum-Purchase Discount Flow', () => {

    it('Should log in, re-embed script, walk through cart checkout, and verify 50% discount above €200 minimum purchase', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

        // DISCOUNT_CODE_2 carries a minimum-purchase requirement (>= €200 -> 50% off),
        // unlike DISCOUNT_CODE which applies unconditionally.
        const discountCode = Cypress.env('DISCOUNT_CODE_2') || 'C6DDQT4PDF7T';
        const MIN_PURCHASE_FOR_DISCOUNT = 200;
        const DISCOUNT_RATE = 0.50; // 50% off once minimum purchase is met

        // Centralized domains extracted natively from your cypress.config.js file
        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');

        // Set up network intercepts for dashboard operations
        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        // --- 1. DASHBOARD LOGIN ---
        cy.visit(`${adminUrl}/login`);

        cy.contains('Welcome back! Login to Checky Pro', { timeout: 20000 })
            .should('be.visible');

        cy.get('input[type="email"]').should('be.visible').type(email);
        cy.get('input[type="password"]').should('be.visible').type(password, { log: false });
        cy.contains('button', 'Log in').should('be.visible').click();

        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        // --- 2. SETTINGS & SCRIPT RE-EMBED ---
        cy.contains('Settings', { timeout: 15000 }).should('be.visible').click();
        cy.url({ timeout: 15000 }).should('include', '/settings');

        cy.contains('Checky Pro Script', { timeout: 15000 }).should('be.visible').click();
        cy.url({ timeout: 15000 }).should('include', '/settings/checky-pro-script');

        cy.contains('button', 'Re-embed script').should('be.visible').click();

        // Intercept validation
        cy.wait('@reEmbedRequest', { timeout: 30000 })
            .its('response.statusCode')
            .should('eq', 200);

        // Dynamic server reflection buffer
        cy.wait(3000);

        // Clear cache and storage arrays prior to moving cross-origin
        cy.log('Purging storage configurations to prevent detached origin crashes...');
        cy.window().then((win) => {
            win.sessionStorage.clear();
            win.localStorage.clear();
        });
        cy.clearCookies();

        // --- 3. OPEN SHOPIFY STOREFRONT ORIGIN ---
        cy.log('Step 3: Opening Shopify storefront origin...');
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);

            // Establish cross-origin iframe proxy bridge first
            cy.visit('/');

            // Clean up Service Workers safely using cy.window()
            cy.window().then((win) => {
                if (win.navigator && win.navigator.serviceWorker) {
                    win.navigator.serviceWorker.getRegistrations().then((regs) => {
                        for (let reg of regs) reg.unregister();
                    });
                }
            });

            cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
            cy.get('a:visible').contains('Laptops').click();

            // --- Increase quantity via the '+' stepper button before adding to cart ---
            // Product is €100, so bumping quantity 1 -> 2 lands the subtotal exactly at
            // the €200 minimum-purchase threshold (matches the screenshot reference).
            // NOTE: selector assumes a Shopify Dawn-style quantity stepper
            // (`button[name="plus"]` / `input[name="quantity"]`). Adjust if your theme's
            // markup differs (e.g. custom class names) — inspect the stepper to confirm.
            cy.get('button[name="plus"]', { timeout: 15000 })
                .should('be.visible')
                .click();

            cy.get('input[name="quantity"]', { timeout: 10000 })
                .should('have.value', '2');

            cy.get('button[name="add"]').should('be.visible').click();

            cy.contains('View cart').should('be.visible').click();
            cy.url().should('include', '/cart');
            cy.get('button[name="checkout"]:visible').should('be.visible').click();
        });

        // --- 4. CHECKOUT REDIRECT & STABILIZATION ---
        cy.url({ timeout: 45000 }).should('include', '/checkout');
        cy.contains('Contact', { timeout: 25000 }).should('be.visible');

        // Stabilizing buffer to allow checkout UI layout engines to settle completely
        cy.wait(4000);

        // --- 5. DISCOUNT CODE APPLICATION & MINIMUM-PURCHASE MATH VERIFICATION ---
        // Target only the single isolated text block row displaying the Total amount
        cy.contains('div:visible', 'Total', { timeout: 15000 })
            .invoke('text')
            .then((initialText) => {
                // Isolate the clean numeric currency price string cleanly
                const initialMatches = initialText.match(/\d+\.\d+/);
                const initialTotal = initialMatches ? parseFloat(initialMatches[0]) : parseFloat(initialText.replace(/[^0-9.]/g, ''));
                cy.log(`Initial Clean Total Price: €${initialTotal}`);

                const meetsMinimumPurchase = initialTotal >= MIN_PURCHASE_FOR_DISCOUNT;
                cy.log(`Meets €${MIN_PURCHASE_FOR_DISCOUNT} minimum purchase requirement? ${meetsMinimumPurchase}`);

                // Target the discount input element via its unique name attribute
                cy.get('input[name="discount_code"]', { timeout: 15000 })
                    .filter(':visible')
                    .should('be.visible')
                    .clear()
                    .type(discountCode);

                // Target and click the action class for the apply button matching the DOM layout
                cy.get('button.discount-apply-button')
                    .filter(':visible')
                    .should('be.visible')
                    .should('not.be.disabled')
                    .click();

                // Give the discount/minimum-purchase calculation a moment to settle.
                // We can't assert "total changed" unconditionally here, because a
                // below-minimum cart is expected to leave the total unchanged.
                cy.wait(3000);

                // Extract the final adjusted price directly from the matching total node
                cy.contains('div:visible', 'Total', { timeout: 15000 })
                    .invoke('text')
                    .then((updatedText) => {
                        const updatedMatches = updatedText.match(/\d+\.\d+/);
                        const finalTotal = updatedMatches ? parseFloat(updatedMatches[0]) : parseFloat(updatedText.replace(/[^0-9.]/g, ''));
                        cy.log(`Updated Clean Total Price: €${finalTotal}`);

                        if (meetsMinimumPurchase) {
                            // --- Cart meets the minimum purchase: discount MUST apply at exactly 50% off ---
                            const expectedTotal = initialTotal * (1 - DISCOUNT_RATE);
                            cy.log(`Expected Math Total (50% off): €${expectedTotal}`);

                            const variance = Math.abs(finalTotal - expectedTotal);

                            if (variance <= 0.01) {
                                cy.log('✅ TEST PASSED: Cart met the €200 minimum and total reflects a clean 50% reduction!');
                                expect(finalTotal).to.be.closeTo(expectedTotal, 0.01);
                            } else {
                                throw new Error(
                                    `❌ TEST FAILED: Cart subtotal (€${initialTotal}) met the €${MIN_PURCHASE_FOR_DISCOUNT} ` +
                                    `minimum, so a 50% discount should apply. Expected total near €${expectedTotal.toFixed(2)}, ` +
                                    `but received €${finalTotal.toFixed(2)}.`
                                );
                            }
                        } else {
                            // --- Cart is below the minimum purchase: discount must NOT apply ---
                            const variance = Math.abs(finalTotal - initialTotal);

                            if (variance <= 0.01) {
                                cy.log('✅ TEST PASSED: Cart was below the €200 minimum and the discount was correctly withheld.');
                                expect(finalTotal).to.be.closeTo(initialTotal, 0.01);
                            } else {
                                throw new Error(
                                    `❌ TEST FAILED: Cart subtotal (€${initialTotal}) is below the €${MIN_PURCHASE_FOR_DISCOUNT} ` +
                                    `minimum purchase requirement, so the discount should NOT have applied. ` +
                                    `Expected total to remain €${initialTotal.toFixed(2)}, but received €${finalTotal.toFixed(2)}.`
                                );
                            }
                        }
                    });
            });
    });
});