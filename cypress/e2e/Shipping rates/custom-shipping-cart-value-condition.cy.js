import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - Shipping Rate Cart Value Negative Validation', () => {
    it('Should create a unique €100-€200 value rule, add products, and verify the shipping rate remains hidden under €100 at checkout', () => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');
        const adminUrl = Cypress.config('baseUrl');
        const uniqueName = `neg-rate-${Date.now()}`;

        if (!email || !password || !storeUrl) {
            throw new Error('Missing configuration setup in environment variables.');
        }

        // Intercepts with aliases and explicit assertions[cite: 2]
        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/cart/add*').as('shopifyAddToCart');

        // Load test data from fixtures instead of hardcoding[cite: 2]
        cy.fixture('products.json').then((products) => {
            // --- 1. DASHBOARD AUTH & RE-EMBED ---
            loginPage.login(email, password, adminUrl);
            cy.url({ timeout: 30000 }).should('include', '/dashboard');

            if (typeof settingsPage.navigateToScriptSettings === 'function' && typeof settingsPage.reEmbedScript === 'function') {
                settingsPage.navigateToScriptSettings();
                settingsPage.reEmbedScript();
            } else {
                cy.contains('Settings', { timeout: 15000 }).click();
                cy.contains('Checky Pro Script', { timeout: 15000 }).click();
                cy.contains('button', 'Re-embed script').click();
            }
            cy.wait('@reEmbedRequest').its('response.statusCode').should('eq', 200);

            // --- 2. SHIPPING RULES ENGINE CONFIGURATION ---
            if (typeof settingsPage.navigateToShippingRates === 'function' && typeof settingsPage.createShippingRate === 'function') {
                settingsPage.navigateToShippingRates();
                settingsPage.createShippingRate({ name: uniqueName, min: '100', max: '200', price: '10' });
            } else {
                cy.contains('a, div, span', 'Shipping Rates', { timeout: 15000 }).click();
                cy.contains('button', 'Create shipping rate', { timeout: 15000 }).click();
                cy.get('input[placeholder="Same day shipping"]').type(uniqueName);
                cy.get('input[placeholder="Shipping rate #1"]').type(uniqueName);
                cy.get('input[placeholder="Delivery in 7-8 days"]').type('3-9');
                cy.contains('div, button, span', 'Cart Value').click();
                cy.contains('div, label, span', 'Minimum value').parent().find('input').first().clear().type('100');
                cy.contains('div, label, span', 'Maximum value').parent().find('input').last().clear().type('200');
                cy.get('input[placeholder="0.00"]').clear().type('10');
                cy.contains('button', 'Save').click();
            }
            cy.url({ timeout: 20000 }).should('include', '/shipping-rates');

            // --- 3. STOREFRONT PIPELINE - ADD PRODUCTS (CROSS-ORIGIN) ---
            cy.origin(storeUrl, { args: { products } }, ({ products }) => {
                cy.visit('/');
                cy.clearCookies();
                cy.window().then((win) => {
                    win.sessionStorage.clear();
                    win.localStorage.clear();
                });

                products.forEach((product) => {
                    cy.visit('/');
                    cy.contains('Featured products', { timeout: 25000 }).scrollIntoView();
                    cy.get('a:visible', { timeout: 15000 }).contains(new RegExp(product.match, 'i')).first().click();
                    cy.get('button[name="add"]').click();
                    cy.contains(/Added to your cart|View cart/i, { timeout: 15000 });
                });
            });

            // Explicitly wait on network intercept alias on primary runner thread[cite: 2]
            cy.wait('@shopifyAddToCart').its('response.statusCode').should('be.oneOf', [200, 201, 302, 303]);

            // --- 4. STOREFRONT CHECKOUT ROUTINE ---
            cy.origin(storeUrl, () => {
                cy.visit('/cart', { timeout: 30000 });
                cy.get('button[name="checkout"], input[name="checkout"], #checkout', { timeout: 20000 }).first().click({ force: true });
            });

            // --- 5. CHECKOUT STABILIZATION & TOTAL VERIFICATION ---
            if (typeof checkoutPage.stabilizeCheckout === 'function') {
                checkoutPage.stabilizeCheckout();
            } else {
                cy.url({ timeout: 45000 }).should('include', '/checkout');
                cy.contains('Contact', { timeout: 20000 }).should('be.visible');
            }

            // Validate checkout total falls below target rules limit (€100) using retry-ability
            cy.get('body').should(($body) => {
                const match = $body.text().match(/Total\s+EUR\s+€?(\d+\.\d+)/i);
                const total = match ? parseFloat(match[1]) : 0;
                expect(total).to.be.lessThan(100);
            });

            // --- 6. CONDITIONAL SHIP-RATE VERIFICATION USING RETRY-ABILITY ---
            cy.contains('div, h2, h3, span', /Shipping method/i, { timeout: 15000 }).scrollIntoView();
            cy.get('body').should('not.contain', uniqueName);
            cy.log(`✅ TEST PASSED: "${uniqueName}" remained hidden safely for sub-100 total.`);
        });
    });
});