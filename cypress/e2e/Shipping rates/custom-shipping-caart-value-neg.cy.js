import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';
import storefrontPage from '../../page-objects/storefrontPage';

// Global Handler: Catch and ignore application specific layout, permissions, and prototype errors
Cypress.on('uncaught:exception', (err) => {
    if (err.message.includes('secretKeyVerified is not defined') ||
        err.message.includes("Failed to execute 'registerTool' on 'ModelContext'") ||
        err.message.includes("Cannot read properties of undefined (reading 'prototype')")) {
        return false;
    }
    return true;
});

describe('Checky Pro - Shipping Rate Cart Value Negative Validation (Below 100)', () => {

    it('Should create a €100-€200 rule, add 1 Polo (total below 100), and pass if the shipping rate does NOT display', () => {
        
        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');

        if (!email || !password || !storeUrl) {
            throw new Error('Missing environment or storeUrl configuration parameters.');
        }

        const uniqueName = `neg-rate-${new Date().getTime()}`;
        const PRODUCT_TO_ADD = { match: "Knitted Men's Polo T-shirt", quantity: 1 };
        const adminUrl = Cypress.config('baseUrl'); 

        // Setup primary and storefront intercepts outside of origin boundaries
        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/cart/add*').as('shopifyAddToCart');

        // --- 1. DASHBOARD LOGIN & SCRIPT RE-EMBED ---
        if (typeof loginPage.login === 'function') {
            loginPage.login(email, password, adminUrl);
        } else {
            cy.visit(`${adminUrl}/login`);
            cy.get('input[type="email"]').type(email);
            cy.get('input[type="password"]').type(password, { log: false });
            cy.contains('button', 'Log in').click();
        }
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

        // --- 4. SHOPIFY STOREFRONT ORIGIN FLOW ---
        // PART A: Add target product to cart
        cy.origin(storeUrl, { args: { PRODUCT_TO_ADD } }, ({ PRODUCT_TO_ADD }) => {
            Cypress.on('uncaught:exception', () => false);

            const storefrontModule = Cypress.require('../../page-objects/storefrontPage');
            const storefront = storefrontModule.default || storefrontModule;

            cy.visit('/');

            cy.window().then((win) => {
                if (win.navigator?.serviceWorker) {
                    win.navigator.serviceWorker.getRegistrations().then((regs) => {
                        regs.forEach(reg => reg.unregister());
                    });
                }
            });

            if (typeof storefront.addProductToCart === 'function') {
                storefront.addProductToCart(PRODUCT_TO_ADD.match, PRODUCT_TO_ADD.quantity);
            } else {
                cy.contains('Featured products', { timeout: 25000 }).scrollIntoView();
                cy.get('a:visible', { timeout: 15000 }).contains(PRODUCT_TO_ADD.match).first().click();
                cy.get('input[name="quantity"]').clear().type(PRODUCT_TO_ADD.quantity);
                cy.get('button[name="add"]').click();
            }
            
            cy.contains(/Added to your cart|View cart/i, { timeout: 15000 });
        });

        // SAFE ZONE: Wait for background AJAX network request to settle on primary thread
        cy.wait('@shopifyAddToCart', { timeout: 15000 }).its('response.statusCode').should('eq', 200);

        // PART B: Navigate to Cart Pipeline and Checkout
        cy.origin(storeUrl, () => {
            Cypress.on('uncaught:exception', () => false);

            const storefrontModule = Cypress.require('../../page-objects/storefrontPage');
            const storefront = storefrontModule.default || storefrontModule;

            if (typeof storefront.goToCheckout === 'function') {
                storefront.goToCheckout();
            } else {
                cy.visit('/cart', { timeout: 30000 });
                cy.url().should('include', '/cart');
                cy.get('button[name="checkout"], input[name="checkout"], #checkout, [href*="checkout"]', { timeout: 20000 })
                    .should('be.visible')
                    .first()
                    .click({ force: true });
            }
        });

        // --- 5. CHECKOUT VERIFICATION ---
        if (typeof checkoutPage.stabilizeCheckout === 'function') {
            checkoutPage.stabilizeCheckout();
        } else {
            cy.url({ timeout: 45000 }).should('include', '/checkout');
            cy.contains('Contact', { timeout: 20000 }).should('be.visible');
        }

        // Validate checkout total is below 100
        cy.get('body').then(($body) => {
            const totalMatch = $body.text().match(/Total\s+EUR\s+€?(\d+\.\d+)/i);
            if (totalMatch) {
                expect(parseFloat(totalMatch[1])).to.be.lessThan(100);
            }
        });

        // --- 6. CONDITIONAL VERIFICATION ---
        cy.contains('div, h2, h3, span', /Shipping method/i, { timeout: 15000 }).scrollIntoView();

        cy.get('body').then(($body) => {
            if ($body.find(`:contains("${uniqueName}")`).length > 0) {
                throw new Error(`TEST FAILED: Total amount is below 100, but the custom shipping rate "${uniqueName}" is incorrectly displaying.`);
            }
            cy.log(`✅ TEST PASSED: Total amount is below 100 and the shipping rate "${uniqueName}" did not display.`);
        });
    });
});