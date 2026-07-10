// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('secretKeyVerified is not defined')) {
        return false;
    }
    return true;
});

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Minimum-Purchase Discount Flow', () => {

    it('Should log in, re-embed script, walk through cart checkout, and verify discount applies above €200 minimum purchase', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

        const discountCode = Cypress.env('DISCOUNT_CODE_2') || 'C6DDQT4PDF7T';
        const MIN_PURCHASE_FOR_DISCOUNT = 200;

        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');

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

        cy.wait('@reEmbedRequest', { timeout: 30000 })
            .its('response.statusCode')
            .should('eq', 200);

        cy.wait(3000);

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

            cy.visit('/');

            cy.window().then((win) => {
                if (win.navigator && win.navigator.serviceWorker) {
                    win.navigator.serviceWorker.getRegistrations().then((regs) => {
                        for (let reg of regs) reg.unregister();
                    });
                }
            });

            cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
            cy.get('a:visible').contains('Laptops').click();

            // --- Increase quantity to 2 products ---
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

        cy.wait(4000);

        // --- 5. DISCOUNT CODE APPLICATION & MINIMUM-PURCHASE VERIFICATION ---
        cy.contains('div:visible', 'Total', { timeout: 15000 })
            .invoke('text')
            .then((initialText) => {
                const initialMatches = initialText.match(/\d+\.\d+/);
                const initialTotal = initialMatches ? parseFloat(initialMatches[0]) : parseFloat(initialText.replace(/[^0-9.]/g, ''));
                cy.log(`Initial Clean Total Price: €${initialTotal}`);

                const meetsMinimumPurchase = initialTotal >= MIN_PURCHASE_FOR_DISCOUNT;
                cy.log(`Meets €${MIN_PURCHASE_FOR_DISCOUNT} minimum purchase requirement? ${meetsMinimumPurchase}`);

                // Explicitly fail the test if the total amount is below 200
                if (!meetsMinimumPurchase) {
                    throw new Error(`❌ TEST FAILED: Cart total (€${initialTotal}) is below the required €${MIN_PURCHASE_FOR_DISCOUNT} minimum purchase amount.`);
                }

                // --- Proceeding with discount application because total is >= 200 ---
                cy.get('input[name="discount_code"]', { timeout: 15000 })
                    .filter(':visible')
                    .should('be.visible')
                    .clear()
                    .type(discountCode);

                // Apply the code
                cy.get('button.discount-apply-button')
                    .filter(':visible')
                    .should('be.visible')
                    .should('not.be.disabled')
                    .click({ force: true });

                // Verify that a discount was applied successfully (total decreased)
                cy.contains('div:visible', 'Total', { timeout: 15000 }).should(($div) => {
                    const updatedText = $div.text();
                    const updatedMatches = updatedText.match(/\d+\.\d+/);
                    const finalTotal = updatedMatches ? parseFloat(updatedMatches[0]) : parseFloat(updatedText.replace(/[^0-9.]/g, ''));
                    
                    expect(finalTotal).to.be.lessThan(initialTotal);
                });
                
                cy.log('✅ TEST PASSED: Cart met the €200 minimum and a discount was successfully applied!');
            });
    });
});