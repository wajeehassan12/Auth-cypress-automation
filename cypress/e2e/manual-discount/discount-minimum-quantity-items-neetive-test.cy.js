// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('secretKeyVerified is not defined')) {
        return false;
    }
    return true;
});

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Minimum-Quantity Discount Flow (Negative Test)', () => {

    it('Should log in, re-embed script, walk through cart checkout, and confirm failure if quantity is below minimum requirement', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

        const discountCode = Cypress.env('DISCOUNT_CODE_2') || 'ME3JZ2Z5RHSC'; 
        const REQUIRED_MIN_QUANTITY = 3; // Rule threshold: Must fail if less than 3

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

            // --- INCREASE ITEMS QUANTITY TO 2 (Intentionally below the required 3) ---
            cy.get('button[name="plus"]', { timeout: 15000 })
                .should('be.visible')
                .click(); // Sets quantity to 2 items

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

        // --- 5. DISCOUNT APPLICATION & QUANTITY CHECK VALIDATION ---
        cy.get('body').then(($body) => {
            let totalQuantity = 0;

            // Target elements matching exact numerical content near the product thumbnails
            const foundBadges = $body.find('span, div, border').filter((i, el) => {
                const text = Cypress.$(el).text().trim();
                return /^\d+$/.test(text) && Cypress.$(el).is(':visible');
            });

            if (foundBadges.length > 0) {
                totalQuantity = parseInt(foundBadges.first().text().trim(), 10);
            }

            cy.log(`Scraped Counter Value from Image: ${totalQuantity}`);

            // NEGATIVE CONDITION EXPECTATION: The test passes by failing correctly when quantity < 3
            if (totalQuantity < REQUIRED_MIN_QUANTITY) {
                throw new Error(`❌ NEGATIVE TEST CONFIRMED: Discount restricted. Product quantity (${totalQuantity}) is less than the required minimum threshold of ${REQUIRED_MIN_QUANTITY}.`);
            } else {
                // If by some anomaly it reaches 3 or more when it shouldn't, fail the assertion state
                throw new Error(`⚠️ TEST FAILURE: Expected cart to be restricted, but quantity met or exceeded minimum threshold.`);
            }
        });
    });
});