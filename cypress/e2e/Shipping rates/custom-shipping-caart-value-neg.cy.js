import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';

describe('Checky Pro - Shipping Rate Cart Value Negative Validation (Below 100)', () => {

    it('Should create a €100-€200 rule, add 1 Polo (total below 100), and pass if the shipping rate does NOT display', () => {
        
        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        let storeUrl = Cypress.env('STORE_URL');

        if (!email || !password || !storeUrl) {
            throw new Error('Missing environment or storeUrl configuration parameters.');
        }

        if (!storeUrl.startsWith('http')) {
            storeUrl = `https://${storeUrl}`;
        }

        const uniqueName = `neg-rate-${Date.now()}`;
        const adminUrl = Cypress.config('baseUrl'); 

        // Setup admin intercept for script re-embed
        cy.intercept('GET', '**/store*').as('reEmbedRequest');

        // Load test data from fixture file
        cy.fixture('products.json').then((products) => {
            const rawProduct = products[0] || {};
            const productToAdd = {
                match: rawProduct.match || "Knitted Men's Polo T-shirt",
                quantity: rawProduct.quantity || 1
            };

            // --- 1. DASHBOARD LOGIN & SCRIPT RE-EMBED VIA PAGE OBJECT MODEL ---
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
            cy.wait('@reEmbedRequest', { timeout: 30000 }).its('response.statusCode').should('eq', 200);

            // --- 2. SHIPPING RATES CONFIGURATION ---
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
            
            // --- 3. CLEAR CACHE & WORKERS ---
            cy.window().then((win) => {
                win.sessionStorage.clear();
                win.localStorage.clear();
            });
            cy.clearCookies();

            // --- 4. STOREFRONT ORIGIN FLOW (ADD PRODUCT & CLICK CHECKOUT) ---
            cy.origin(storeUrl, { args: { productToAdd } }, ({ productToAdd }) => {
                cy.visit('/');

                cy.window().then((win) => {
                    if (win.navigator?.serviceWorker) {
                        win.navigator.serviceWorker.getRegistrations().then((regs) => {
                            regs.forEach(reg => reg.unregister());
                        });
                    }
                });

                // Add product to cart
                cy.contains('Featured products', { timeout: 25000 }).scrollIntoView();
                cy.get('a:visible', { timeout: 15000 }).contains(productToAdd.match).first().click();
                
                cy.get('body').then(($body) => {
                    if ($body.find('input[name="quantity"]').length > 0) {
                        cy.get('input[name="quantity"]').clear().type(String(productToAdd.quantity));
                    }
                });

                cy.get('button[name="add"], button.product-form__submit').first().click();

                // Navigate to cart and proceed to checkout (triggers cross-origin redirect to Checky Pro)
                cy.visit('/cart', { timeout: 30000 });
                cy.url().should('include', '/cart');
                cy.get('button[name="checkout"], input[name="checkout"], #checkout, [href*="checkout"], button:contains("Check out"), button:contains("Checkout")', { timeout: 20000 })
                    .filter(':visible')
                    .first()
                    .click({ force: true });
            });

            // --- 5. CHECKY PRO CHECKOUT & VALIDATION ORIGIN ---
            cy.origin('https://checkypro.robustapps.net', { args: { uniqueName } }, ({ uniqueName }) => {
                cy.url({ timeout: 45000 }).should('include', '/checkout');
                cy.contains('Contact', { timeout: 20000 }).should('be.visible');

                // Validate checkout total is below 100 using built-in Cypress retry-ability
                cy.get('body').should(($body) => {
                    const totalMatch = $body.text().match(/Total\s+EUR\s+€?(\d+\.\d+)/i);
                    if (totalMatch) {
                        expect(parseFloat(totalMatch[1])).to.be.lessThan(100);
                    }
                });

                // --- 6. CONDITIONAL VERIFICATION USING RETRY-ABILITY ---
                cy.contains('div, h2, h3, span', /Shipping method/i, { timeout: 15000 }).scrollIntoView();
                cy.get('body').should('not.contain', uniqueName);
            });

            cy.log(`✅ TEST PASSED: Total amount is below 100 and the shipping rate "${uniqueName}" did not display.`);
        });
    });
});