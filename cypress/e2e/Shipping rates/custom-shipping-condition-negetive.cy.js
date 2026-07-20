import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import storefrontPage from '../../page-objects/storefrontPage';
import checkoutPage from '../../page-objects/checkoutPage';

// Global Uncaught Exception Handler
Cypress.on('uncaught:exception', (err) => {
    const ignoredErrors = ['secretKeyVerified is not defined'];
    return !ignoredErrors.some(msg => err.message.includes(msg));
});

describe('Checky Pro - Shipping Rate Quantity Negative Validation', () => {

    it('Should create a 3-4 item shipping rule, add 2 items, and pass if it falls back to native Shopify checkout', () => {
        // --- 0. CONFIGURATION & INTERCEPTS ---
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');
        const adminUrl = Cypress.config('baseUrl');
        const customShippingName = 'internal negative';
        const PRODUCTS_TO_ADD = [{ match: /Laptops/i }, { match: /Cable Knit Sweater/i }];

        if (!email || !password || !storeUrl) throw new Error('Missing configuration setup.');

        // Main thread intercept
        cy.intercept('GET', '**/store*').as('reEmbedRequest');

        // --- 1. DASHBOARD AUTH & RE-EMBED ---
        if (typeof loginPage.login === 'function') {
            loginPage.login(email, password, adminUrl);
        } else {
            cy.visit('/login');
            cy.get('input[type="email"]').type(email);
            cy.get('input[type="password"]').type(password, { log: false });
            cy.contains('button', 'Log in').click();
        }
        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        if (typeof settingsPage.reEmbedScript === 'function') {
            if (typeof settingsPage.navigateToScriptSettings === 'function') settingsPage.navigateToScriptSettings();
            settingsPage.reEmbedScript();
        } else {
            cy.contains('Settings', { timeout: 15000 }).click();
            cy.contains('Checky Pro Script', { timeout: 15000 }).click();
            cy.contains('button', 'Re-embed script').click();
        }
        cy.wait('@reEmbedRequest', { timeout: 30000 });

        // --- 2. SHIPPING RULES ENGINE CONFIGURATION ---
        if (typeof settingsPage.createShippingRate === 'function') {
            if (typeof settingsPage.navigateToShippingRates === 'function') settingsPage.navigateToShippingRates();
            settingsPage.createShippingRate({ name: customShippingName, minQty: '3', maxQty: '4', price: '10' });
        } else {
            cy.contains('a, div, span', 'Shipping Rates', { timeout: 15000 }).click();
            cy.contains('button', 'Create shipping rate', { timeout: 15000 }).click();
            cy.get('input[placeholder="Same day shipping"]').type(customShippingName);
            cy.get('input[placeholder="Shipping rate #1"]').type('internal');
            cy.get('input[placeholder="Delivery in 7-8 days"]').type('3-9');
            cy.contains('div, button, span', 'Cart Items').click();
            cy.contains('div, label, span', 'Minimum quantity').parent().find('input').first().clear().type('3');
            cy.contains('div, label, span', 'Maximum quantity').parent().find('input').last().clear().type('4');
            cy.get('input[placeholder="0.00"]').clear().type('10');
            cy.contains('button', 'Save').click();
        }
        cy.url({ timeout: 20000 }).should('include', '/shipping-rates');

        // --- 3. STOREFRONT PIPELINE - ADD TO CART & ISOLATED CLEANUP ---
        cy.origin(storeUrl, { args: { PRODUCTS_TO_ADD } }, ({ PRODUCTS_TO_ADD }) => {
            Cypress.on('uncaught:exception', () => false);

            cy.visit('/');
            
            cy.clearCookies();
            cy.window().then((win) => {
                win.sessionStorage.clear();
                win.localStorage.clear();
                if (win.navigator?.serviceWorker) {
                    win.navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
                }
            });

            const storefrontMod = Cypress.require('../../page-objects/storefrontPage');
            const sf = storefrontMod.default || storefrontMod;

            PRODUCTS_TO_ADD.forEach((product, index) => {
                cy.visit('/');
                if (typeof sf.addProductToCart === 'function') {
                    sf.addProductToCart(product.match, 1);
                } else {
                    cy.contains('Featured products', { timeout: 25000 }).scrollIntoView();
                    cy.get('a:visible', { timeout: 15000 }).contains(product.match).first().click();
                    cy.get('button[name="add"]').click();
                }

                // Confirm item interface loaded
                cy.contains(/Added to your cart|View cart/i, { timeout: 15000 }).should('be.visible');
                
                // FIX: Replaced cy.intercept with a reliable 3-second hard wait block.
                // This gives Shopify's background asynchronous AJAX system plenty of time to fully 
                // commit the cart session items to cookies before the loop reloads the layout via cy.visit().
                cy.wait(3000);

                if (index < PRODUCTS_TO_ADD.length - 1) {
                    cy.get('body').then(($b) => {
                        const close = $b.find('[aria-label="Close"]:visible, .modal-close:visible, .drawer__close:visible');
                        if (close.length) cy.wrap(close).first().click();
                    });
                }
            });

            // --- 4. STOREFRONT PIPELINE - PHASE B: CHECKOUT ROUTINE ---
            if (typeof sf.goToCheckout === 'function') {
                sf.goToCheckout();
            } else {
                cy.visit('/cart', { timeout: 30000 });
                cy.url().should('include', '/cart');
                
                // Wait for Checky Pro's rules evaluation script to process the cart quantity criteria
                cy.wait(4000);
                
                cy.get('button[name="checkout"], input[name="checkout"], #checkout, [action="/cart"] button[type="submit"]', { timeout: 20000 })
                    .first()
                    .click({ force: true });
            }
        });

        // --- 5. CHECKOUT VERIFICATION ---
        if (typeof checkoutPage.stabilizeCheckout === 'function') {
            checkoutPage.stabilizeCheckout();
        } else {
            cy.url({ timeout: 45000 }).should('match', /\/checkout/);
            cy.contains('Contact', { timeout: 20000 }).should('be.visible');
        }

        cy.get('body').then(($body) => {
            const text = $body.text();
            expect(text).to.match(/Laptops/i);
            expect(text).to.match(/Cable Knit Sweater/i);
        });

        // --- 6. CONDITIONAL SHIP-RATE VERIFICATION ---
        cy.contains('div, h2, h3, span', /Shipping method/i, { timeout: 15000 }).scrollIntoView();
        cy.contains('div, h2, h3, span', /Shipping method/i)
            .parent()
            .within(() => {
                cy.contains('div, span, label, p', new RegExp(customShippingName, 'i')).should('not.exist');
            });
    });
});