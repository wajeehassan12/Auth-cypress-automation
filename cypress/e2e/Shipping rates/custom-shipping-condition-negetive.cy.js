import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import storefrontPage from '../../page-objects/storefrontPage';
import checkoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - Shipping Rate Quantity Negative Validation', () => {
    it('Should create a 3-4 item shipping rule, add fewer items, and verify the rate remains hidden at checkout', () => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');
        const adminUrl = Cypress.config('baseUrl');

        if (!email || !password || !storeUrl) {
            throw new Error('Missing configuration setup in environment variables.');
        }

        // --- 0. INTERCEPT ALIASES & FIXTURES ---
        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/cart/add*').as('shopifyAddToCart');
        cy.intercept('POST', '**/shipping-rates*').as('createShippingRate');

        cy.fixture('shippingRule.json').as('shippingRuleData');
        cy.fixture('products.json').as('productsData');

        cy.get('@shippingRuleData').then((ruleData) => {
            cy.get('@productsData').then((products) => {
                const customShippingName = ruleData.name || `qty-rule-${Date.now()}`;

                // --- 1. DASHBOARD AUTH & RE-EMBED ---
                loginPage.login(email, password, adminUrl);
                cy.url({ timeout: 30000 }).should('include', '/dashboard');

                if (typeof settingsPage.navigateToScriptSettings === 'function') {
                    settingsPage.navigateToScriptSettings();
                } else {
                    cy.contains('Settings', { timeout: 15000 }).click();
                    cy.contains('Checky Pro Script', { timeout: 15000 }).click();
                }

                if (typeof settingsPage.reEmbedScript === 'function') {
                    settingsPage.reEmbedScript();
                } else {
                    cy.contains('button', 'Re-embed script').click();
                }
                cy.wait('@reEmbedRequest').its('response.statusCode').should('eq', 200);

                // --- 2. SHIPPING RULES ENGINE CONFIGURATION ---
                if (typeof settingsPage.navigateToShippingRates === 'function') {
                    settingsPage.navigateToShippingRates();
                } else {
                    cy.contains('a, div, span', 'Shipping Rates', { timeout: 15000 }).click();
                }

                if (typeof settingsPage.createShippingRate === 'function') {
                    settingsPage.createShippingRate({
                        name: customShippingName,
                        minQty: ruleData.minQty,
                        maxQty: ruleData.maxQty,
                        price: ruleData.price
                    });
                } else {
                    cy.contains('button', 'Create shipping rate', { timeout: 15000 }).click();
                    cy.get('input[placeholder="Same day shipping"]').type(customShippingName);
                    cy.get('input[placeholder="Shipping rate #1"]').type('internal');
                    cy.get('input[placeholder="Delivery in 7-8 days"]').type('3-9');
                    cy.contains('div, button, span', 'Cart Items').click();
                    cy.contains('div, label, span', 'Minimum quantity').parent().find('input').first().clear().type(ruleData.minQty);
                    cy.contains('div, label, span', 'Maximum quantity').parent().find('input').last().clear().type(ruleData.maxQty);
                    cy.get('input[placeholder="0.00"]').clear().type(ruleData.price);
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

                    // Add items below the minimum threshold to test negative validation
                    const product = products[0];
                    cy.contains('Featured products', { timeout: 25000 }).scrollIntoView();
                    cy.get('a:visible', { timeout: 15000 }).contains(new RegExp(product.match, 'i')).first().click();
                    cy.get('button[name="add"]').should('be.visible').click();
                    cy.contains(/Added to your cart|View cart/i, { timeout: 15000 }).should('be.visible');
                });

                // Explicit network assertion[cite: 2]
                cy.wait('@shopifyAddToCart').its('response.statusCode').should('be.oneOf', [200, 201, 302, 303]);

                // --- 4. STOREFRONT CHECKOUT ROUTINE ---
                cy.origin(storeUrl, () => {
                    cy.visit('/cart', { timeout: 30000 });
                    cy.url().should('include', '/cart');
                    
                    cy.get('cart-items button[name="checkout"], .cart__footer button[name="checkout"], form[action*="/cart"] button[name="checkout"]', { timeout: 20000 })
                        .should('be.visible')
                        .first()
                        .click();
                });

                // --- 5. CHECKOUT STABILIZATION & VERIFICATION ---
                if (typeof checkoutPage.stabilizeCheckout === 'function') {
                    checkoutPage.stabilizeCheckout();
                } else {
                    cy.url({ timeout: 45000 }).should('match', /\/checkout/);
                    cy.contains('Contact', { timeout: 20000 }).should('be.visible');
                }

                cy.get('body').should(($body) => {
                    const text = $body.text();
                    expect(text).to.match(/Laptops|Product/i);
                });

                // --- 6. CONDITIONAL SHIP-RATE VERIFICATION (RETRY-ABILITY) ---
                cy.contains('div, h2, h3, span', /Shipping method/i, { timeout: 15000 }).scrollIntoView();
                cy.contains('div, h2, h3, span', /Shipping method/i)
                    .parent()
                    .should('not.contain', customShippingName);

                cy.log(`✅ TEST PASSED: Shipping rate "${customShippingName}" correctly hidden for sub-minimum quantity cart.`);
            });
        });
    });
});