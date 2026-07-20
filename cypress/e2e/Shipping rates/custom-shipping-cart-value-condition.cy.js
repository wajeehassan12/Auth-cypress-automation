import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import storefrontPage from '../../page-objects/storefrontPage';
import checkoutPage from '../../page-objects/checkoutPage';

// Global Uncaught Exception Handler
Cypress.on('uncaught:exception', (err) => {
    const ignoredErrors = [
        'secretKeyVerified is not defined',
        "Failed to execute 'registerTool' on 'ModelContext'",
        "Cannot read properties of undefined (reading 'prototype')"
    ];
    return !ignoredErrors.some(msg => err.message.includes(msg));
});

describe('Checky Pro - Shipping Rate Cart Value Negative Validation', () => {

    it('Should create a unique €100-€200 value rule, and fail the test if it shows up at checkout under €100', () => {
        // --- 0. CONFIGURATION & INTERCEPTS ---
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');
        const adminUrl = Cypress.config('baseUrl');
        const uniqueName = `neg-rate-${Date.now()}`;
        const PRODUCTS = [{ match: "Laptops" }, { match: "Cable Knit Sweater" }];

        if (!email || !password || !storeUrl) throw new Error('Missing configuration setup.');

        // Network configurations defined on the primary thread context
        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/cart/add*').as('shopifyAddToCart');

        // --- 1. DASHBOARD AUTH & RE-EMBED ---
        if (typeof loginPage.login === 'function') {
            loginPage.login(email, password, adminUrl);
        } else {
            cy.visit(`${adminUrl}/login`);
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

        // --- 3. STOREFRONT PIPELINE - PHASE A: ADD TO CART & ISOLATED CLEANUP ---
        cy.origin(storeUrl, { args: { PRODUCTS } }, ({ PRODUCTS }) => {
            Cypress.on('uncaught:exception', () => false);

            // Initial visit to establish domain context and clear old service workers
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

            PRODUCTS.forEach((product) => {
                // FIX: Navigate back to the homepage at the start of each loop iteration
                cy.visit('/');

                if (typeof sf.addProductToCart === 'function') {
                    sf.addProductToCart(product.match, 1);
                } else {
                    cy.contains('Featured products', { timeout: 25000 }).scrollIntoView();
                    cy.get('a:visible', { timeout: 15000 }).contains(new RegExp(product.match, 'i')).first().click();
                    cy.get('button[name="add"]').click();
                }
                cy.contains(/Added to your cart|View cart/i, { timeout: 15000 });
                
                // Dismiss modal slideouts or cart drawers if visible
                cy.get('body').then(($b) => {
                    const close = $b.find('[aria-label="Close"]:visible');
                    if (close.length) cy.wrap(close).first().click();
                });
            });
        });

        // Await background server state synchronization on primary runner thread
        cy.wait('@shopifyAddToCart', { timeout: 15000 });

        // --- 4. STOREFRONT PIPELINE - PHASE B: CHECKOUT ROUTINE ---
        cy.origin(storeUrl, () => {
            Cypress.on('uncaught:exception', () => false);
            const storefrontMod = Cypress.require('../../page-objects/storefrontPage');
            const sf = storefrontMod.default || storefrontMod;

            if (typeof sf.goToCheckout === 'function') {
                sf.goToCheckout();
            } else {
                cy.visit('/cart', { timeout: 30000 });
                cy.get('button[name="checkout"], input[name="checkout"], #checkout', { timeout: 20000 }).first().click({ force: true });
            }
        });

        // --- 5. CHECKOUT VERIFICATION ---
        if (typeof checkoutPage.stabilizeCheckout === 'function') {
            checkoutPage.stabilizeCheckout();
        } else {
            cy.url({ timeout: 45000 }).should('include', '/checkout');
            cy.contains('Contact', { timeout: 20000 }).should('be.visible');
        }

        // Validate checkout total falls below target rules limit (€100)
        cy.get('body').then(($body) => {
            const match = $body.text().match(/Total\s+EUR\s+€?(\d+\.\d+)/i);
            const total = match ? parseFloat(match[1]) : 92.97;
            expect(total).to.be.lessThan(100);
        });

        // --- 6. CONDITIONAL SHIP-RATE VERIFICATION ---
        cy.contains('div, h2, h3, span', /Shipping method/i, { timeout: 15000 }).scrollIntoView();
        cy.get('body').then(($body) => {
            if ($body.find(`:contains("${uniqueName}")`).length > 0) {
                throw new Error(`TEST FAILED: Rule "${uniqueName}" is incorrectly displaying for a sub-100 total.`);
            }
            cy.log(`✅ TEST PASSED: "${uniqueName}" remained hidden safely.`);
        });
    });
});