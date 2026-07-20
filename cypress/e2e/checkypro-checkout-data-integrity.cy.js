// FIX: Changed '../../' to '../' because this file sits directly in the e2e folder
import loginPage from '../page-objects/login-page';
import settingsPage from '../page-objects/settingsPage';
import storefrontPage from '../page-objects/storefrontPage';
import checkoutPage from '../page-objects/checkoutPage';

// Global Uncaught Exception Handler
Cypress.on('uncaught:exception', (err) => {
    const ignoredErrors = ['registerTool', 'permissions policy', 'secretKeyVerified'];
    return !ignoredErrors.some(msg => err.message.includes(msg));
});

describe('Checky Pro - Check-out-page Automation & Product Flow Verification', () => {

    it('Should login, re-embed script, select Laptop from featured products, and verify cart data matches checkout', () => {
        // --- 0. CONFIGURATION & INTERCEPTS ---
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');
        const adminUrl = Cypress.config('baseUrl');

        if (!email || !password || !storeUrl) throw new Error('Missing configuration parameters.');

        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        // --- 1. DASHBOARD AUTH & RE-EMBED ---
        if (typeof loginPage.login === 'function') {
            loginPage.login(email, password, adminUrl);
        } else {
            cy.visit('/login');
            cy.get('input[type="email"]:visible').clear().type(email);
            cy.get('input[type="password"]:visible').clear().type(password, { log: false });
            cy.get('button').contains(/Log in/i).click();
        }
        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        if (typeof settingsPage.reEmbedScript === 'function') {
            if (typeof settingsPage.navigateToScriptSettings === 'function') settingsPage.navigateToScriptSettings();
            settingsPage.reEmbedScript();
        } else {
            cy.contains('Settings', { timeout: 15000 }).click();
            cy.contains('Checky Pro Script', { timeout: 15000 }).click();
            cy.get('button').contains(/Re-embed script/i).click();
        }
        cy.wait('@reEmbedRequest', { timeout: 30000 }).its('response.statusCode').should('eq', 200);

        // --- 2. STOREFRONT ORIGIN FLOW & DATA CAPTURE ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);

            // FIX: Changed '../../' to '../' here as well to match the folder hierarchy
            const storefrontMod = Cypress.require('../page-objects/storefrontPage');
            const sf = storefrontMod.default || storefrontMod;

            cy.visit('/', { timeout: 60000, retryOnStatusCodeFailure: true });
            cy.url({ timeout: 30000 }).should('include', 'checkyprostore');

            if (typeof sf.addProductToCart === 'function') {
                sf.addProductToCart(/Laptops/i, 1);
            } else {
                cy.contains('Featured products').should('be.visible').scrollIntoView();
                cy.get('a:visible').contains('Laptops').click();
                cy.get('button[name="add"]').click();
            }

            if (typeof sf.goToCheckout === 'function') {
                sf.goToCheckout();
            } else {
                cy.contains('View cart').click();
                cy.url().should('include', '/cart');
            }

            // Extract exact UI matrix references for execution validation
            return cy.get('form[action="/cart"], .cart__footer, main, body')
                .first()
                .then(($cartContainer) => {
                    let capturedData = { itemCount: "1", totalPrice: "" };
                    const inputVal = $cartContainer.find('input[name="updates[]"], [class*="quantity"] input').first().val();
                    
                    if (inputVal) {
                        capturedData.itemCount = inputVal.trim();
                    } else {
                        const match = $cartContainer.text().match(/(\d+)\s*item/i) || $cartContainer.text().match(/Quantity:\s*(\d+)/i);
                        if (match) capturedData.itemCount = match[1];
                    }

                    const priceMatch = $cartContainer.text().match(/[€$]\d+[.,]\d{2}/);
                    if (priceMatch) {
                        capturedData.totalPrice = priceMatch[0].replace(/[^0-9.,]/g, '').replace(',', '.');
                    }

                    cy.get('button[name="checkout"]:visible').first().click({ force: true });
                    return cy.wrap(capturedData);
                });
        }).then((cartData) => {
            // --- 3. CHECKOUT VERIFICATION ---
            if (typeof checkoutPage.stabilizeCheckout === 'function') {
                checkoutPage.stabilizeCheckout();
            } else {
                cy.url({ timeout: 45000 }).should('include', '/checkout');
                cy.contains('Contact', { timeout: 20000 }).should('be.visible');
            }

            // Match item quantities using strictly visible layout modules
            cy.get('body:visible').should(($body) => {
                const quantityElement = $body.find('.product-thumbnail__quantity:visible, [class*="badge"]:visible, [class*="quantity"]:visible, .order-summary:visible');
                const checkoutCount = quantityElement.length > 0 ? quantityElement.first().text().replace(/\D/g, '') : null;
                
                if (checkoutCount) {
                    expect(checkoutCount).to.equal(cartData.itemCount);
                } else {
                    expect($body.text()).to.include(cartData.itemCount);
                }
            });

            // Match total pricing matrix boundaries
            if (cartData.totalPrice) {
                cy.get('body:visible').should(($body) => {
                    const match = $body.text().match(/[€$]\d+[.,]\d{2}/);
                    expect(match).to.not.be.null;
                    const checkoutPrice = match[0].replace(/[^0-9.,]/g, '').replace(',', '.');
                    expect(parseFloat(checkoutPrice)).to.equal(parseFloat(cartData.totalPrice));
                });
            }
        });
    });
});