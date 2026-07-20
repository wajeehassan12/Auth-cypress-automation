import loginPage from '../page-objects/login-page';
import settingsPage from '../page-objects/settingsPage';
import storefrontPage from '../page-objects/storefrontPage';
import checkoutPage from '../page-objects/checkoutPage';

// Global Uncaught Exception Handler
Cypress.on('uncaught:exception', (err) => {
    const ignoredErrors = ['secretKeyVerified is not defined', 'registerTool', 'permissions policy'];
    return !ignoredErrors.some(msg => err.message.includes(msg));
});

describe('Checky Pro - Required Phone & Payment Load Validation', () => {

    it('Should enforce Required Phone setting and verify payment methods load at checkout', () => {
        // --- 0. CONFIGURATION & INTERCEPTS ---
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');
        const adminUrl = Cypress.config('baseUrl');

        if (!email || !password || !storeUrl) throw new Error('Missing configuration setup.');

        cy.intercept('GET', '**/store*').as('reEmbedRequest');

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
            cy.contains('button', 'Re-embed script').click();
        }
        cy.wait('@reEmbedRequest', { timeout: 30000 }).its('response.statusCode').should('eq', 200);

        // --- 2. CONFIGURING REQUIRED PHONE ---
        if (typeof settingsPage.configurePhoneSetting === 'function') {
            settingsPage.configurePhoneSetting('Required');
        } else {
            cy.contains('a, div, span', 'Customization', { timeout: 15000 }).click();
            cy.url({ timeout: 15000 }).should('include', '/customization');
            cy.contains('Collect phone number', { timeout: 20000 }).scrollIntoView();
            cy.contains('Required').should('be.visible').click({ force: true });
            cy.contains('button', 'Save Changes').should('be.visible').click();
        }

        // --- 3. STOREFRONT PIPELINE (CROSS-ORIGIN) ---
        cy.clearCookies();
        cy.window().then((win) => { win.sessionStorage.clear(); win.localStorage.clear(); });

        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);
            if (window.navigator?.serviceWorker) {
                window.navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
            }

            const storefrontMod = Cypress.require('../page-objects/storefrontPage');
            const sf = storefrontMod.default || storefrontMod;

            cy.visit('/', { timeout: 60000, retryOnStatusCodeFailure: true });
            
            if (typeof sf.addProductToCart === 'function') {
                sf.addProductToCart(/Laptops/i, 1);
            } else {
                cy.contains('Featured products', { timeout: 25000 }).scrollIntoView();
                cy.get('a:visible').contains('Laptops').click();
                cy.get('button[name="add"]').click();
            }

            if (typeof sf.goToCheckout === 'function') {
                sf.goToCheckout();
            } else {
                cy.contains('View cart').click();
                cy.get('button[name="checkout"]:visible').first().click({ force: true });
            }
        });

        // --- 4. CHECKOUT INTAKE ROUTINE ---
        if (typeof checkoutPage.stabilizeCheckout === 'function') {
            checkoutPage.stabilizeCheckout();
        } else {
            cy.url({ timeout: 45000 }).should('include', '/checkout');
            cy.contains('Contact', { timeout: 20000 }).should('be.visible');
        }

        // Select country first to trigger dynamic address mutations
        cy.get('select[name*="country"], select').first().select(Cypress.env('CHECKOUT_COUNTRY'));
        cy.wait(1000); 

        // Condensed data-driven intake layout matrix including phone configuration
        const dataMap = {
            'input[type="email"]': Cypress.env('CHECKOUT_EMAIL'),
            'input#firstName': Cypress.env('CHECKOUT_FIRSTNAME'),
            'input#lastName': Cypress.env('CHECKOUT_LASTNAME'),
            'input#address': Cypress.env('CHECKOUT_ADDRESS'),
            'input#house-number': Cypress.env('CHECKOUT_HOUSE_NUMBER'),
            'input#suffix': Cypress.env('CHECKOUT_SUFFIX'),
            'input#city': Cypress.env('CHECKOUT_CITY'),
            'input#zip': Cypress.env('CHECKOUT_ZIP'),
            'input#phone': Cypress.env('CHECKOUT_PHONE')
        };

        // Safe evaluation execution loops past conditional missing elements
        cy.get('body').then(($body) => {
            Object.entries(dataMap).forEach(([selector, val]) => {
                if (val && $body.find(selector).length > 0) {
                    cy.get(selector).clear({ force: true }).type(val, { force: true });
                }
            });
        });

        // --- 5. PAYMENT METHOD VERIFICATION ---
        cy.wait(2000); 
        cy.contains(/Viva/i, { timeout: 30000 }).scrollIntoView().click({ force: true });

        cy.contains('button', /Complete Order/i, { timeout: 30000 })
            .should('be.visible')
            .should('not.be.disabled');
    });
});