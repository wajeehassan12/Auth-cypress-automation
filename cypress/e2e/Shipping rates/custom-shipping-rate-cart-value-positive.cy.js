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

describe('Checky Pro - Shipping Rate Cart Value Positive Validation (Single Item, Qty 1)', () => {

    it('Should create a unique €100-€200 rule, add 1 Laptop (Qty 1), and pass if the shipping rate displays', () => {
        // --- 0. CONFIGURATION & INTERCEPTS ---
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');
        const adminUrl = Cypress.config('baseUrl');
        const uniqueName = `pos-rate-${Date.now()}`;
        const PRODUCT_TO_ADD = { match: /Laptops/i, quantity: 1 };

        if (!email || !password || !storeUrl) throw new Error('Missing configuration setup.');

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

        // --- 3. STOREFRONT PIPELINE - ADD TO CART & ISOLATED CLEANUP ---
        cy.origin(storeUrl, { args: { PRODUCT_TO_ADD } }, ({ PRODUCT_TO_ADD }) => {
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

            cy.visit('/');
            if (typeof sf.addProductToCart === 'function') {
                sf.addProductToCart(PRODUCT_TO_ADD.match, PRODUCT_TO_ADD.quantity);
            } else {
                cy.contains('Featured products', { timeout: 25000 }).scrollIntoView();
                cy.get('a:visible', { timeout: 15000 }).contains(PRODUCT_TO_ADD.match).first().click();
                cy.get('input[name="quantity"]').should('be.visible').clear().type(PRODUCT_TO_ADD.quantity);
                cy.get('button[name="add"]').click();
            }

            cy.contains(/Added to your cart|View cart/i, { timeout: 15000 }).should('be.visible');
            cy.wait(3000); 

            // --- 4. STOREFRONT PIPELINE - PHASE B: CHECKOUT ROUTINE ---
            if (typeof sf.goToCheckout === 'function') {
                sf.goToCheckout();
            } else {
                cy.visit('/cart', { timeout: 30000 });
                cy.url().should('include', '/cart');
                
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
            const totalMatch = $body.text().match(/Total\s+EUR\s+€?(\d+\.\d+)/i);
            if (totalMatch) {
                const checkoutTotal = parseFloat(totalMatch[1]);
                expect(checkoutTotal).to.be.greaterThan(100);
                expect(checkoutTotal).to.be.lessThan(200);
            }
        });

        // --- 6. CONDITIONAL SHIP-RATE VERIFICATION ---
        cy.contains('div, h2, h3, span', /Shipping method/i, { timeout: 15000 }).scrollIntoView();
        cy.contains('div, h2, h3, span', /Shipping method/i)
            .parent()
            .within(() => {
                // FIX: Added ':visible' pseudo-selectors to isolate active elements and ignore hidden responsive elements
                cy.contains('div:visible, span:visible, label:visible, p:visible', new RegExp(uniqueName, 'i'), { timeout: 15000 })
                    .should('be.visible');
                    
                cy.contains('div:visible, span:visible, label:visible, p:visible', /10\.00/i, { timeout: 15000 })
                    .should('be.visible');
            });
    });
});