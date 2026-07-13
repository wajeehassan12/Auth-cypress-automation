// Global Handler: Catch and ignore application specific layout, permissions, and prototype errors
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('secretKeyVerified is not defined')) {
        return false; 
    }
    if (err.message.includes("Failed to execute 'registerTool' on 'ModelContext'")) {
        return false;
    }
    if (err.message.includes("Cannot read properties of undefined (reading 'prototype')")) {
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

        const timestamp = new Date().getTime();
        const uniqueName = `neg-rate-${timestamp}`;

        // Exactly ONE product block configured to match your target shirt with quantity 1
        const PRODUCT_TO_ADD = { match: /Knitted Men's Polo T-shirt/i, quantity: 1 };

        // Setup Network Intercepts
        cy.intercept('GET', '**/store*').as('reEmbedRequest');

        // --- 1. DASHBOARD LOGIN & SCRIPT RE-EMBED ---
        cy.log('Step 1: Authenticating into admin panel...');
        cy.visit('/login');
        cy.contains('Welcome back! Login to Checky Pro', { timeout: 20000 }).should('be.visible');
        
        cy.get('input[type="email"]').should('be.visible').type(email);
        cy.get('input[type="password"]').should('be.visible').type(password, { log: false });
        cy.contains('button', 'Log in').should('be.visible').click();

        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        cy.contains('Settings', { timeout: 15000 }).should('be.visible').click();
        cy.contains('Checky Pro Script', { timeout: 15000 }).should('be.visible').click();
        cy.contains('button', 'Re-embed script').should('be.visible').click();
        cy.wait('@reEmbedRequest', { timeout: 30000 }).its('response.statusCode').should('eq', 200);

        // --- 2. SHIPPING RATES CONFIGURATION ---
        cy.log('Step 2: Navigating to Shipping Rates page...');
        cy.contains('a, div, span', 'Shipping Rates', { timeout: 15000 })
            .should('be.visible')
            .click();

        cy.url({ timeout: 15000 }).should('include', '/shipping-rates');

        cy.log('Clicking on Create shipping rate...');
        cy.contains('button', 'Create shipping rate', { timeout: 15000 })
            .should('be.visible')
            .click();

        cy.url({ timeout: 15000 }).should('include', '/shipping-rates/create');

        cy.log(`Filling out Shipping Rate Form with unique tag: ${uniqueName}`);
        cy.get('input[placeholder="Same day shipping"]').type(uniqueName);
        cy.get('input[placeholder="Shipping rate #1"]').type(uniqueName); 
        cy.get('input[placeholder="Delivery in 7-8 days"]').type('3-9');

        cy.log('Setting up Cart Value conditions (Targeting €100 to €200)...');
        cy.contains('div, button, span', 'Cart Value')
            .should('be.visible')
            .click();
        
        cy.contains('div, label, span', 'Minimum value')
            .parent()
            .find('input')
            .first()
            .clear()
            .type('100');

        cy.contains('div, label, span', 'Maximum value')
            .parent()
            .find('input')
            .last()
            .clear()
            .type('200');

        cy.log('Configuring Shipping Price...');
        cy.get('input[placeholder="0.00"]').clear().type('10');

        cy.log('Saving the newly created shipping rate...');
        cy.contains('button', 'Save').should('be.visible').click();
        cy.url({ timeout: 20000 }).should('include', '/shipping-rates');
        
        // --- 3. CLEAR CACHE & WORKERS BEFORE CROSS-ORIGIN BRIDGE ---
        cy.log('Clearing local caches before cross-origin transition...');
        cy.window().then((win) => {
            win.sessionStorage.clear();
            win.localStorage.clear();
        });
        cy.clearCookies();

        // --- 4. SHOPIFY STOREFRONT ORIGIN FLOW ---
        cy.log("Step 4: Opening Shopify storefront origin to add Knitted Men's Polo T-shirt...");
        cy.origin(storeUrl, { args: { storeUrl, PRODUCT_TO_ADD } }, ({ storeUrl, PRODUCT_TO_ADD }) => {
            Cypress.on('uncaught:exception', () => false);

            if (window.navigator && window.navigator.serviceWorker) {
                window.navigator.serviceWorker.getRegistrations().then((regs) => {
                    for (let reg of regs) reg.unregister();
                });
            }

            cy.visit('/', { timeout: 60000, retryOnStatusCodeFailure: true });
            cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
            cy.get('a:visible', { timeout: 15000 }).contains(PRODUCT_TO_ADD.match).first().click();
            
            // Set quantity to exactly 1
            cy.get('input[name="quantity"]').should('be.visible').clear().type(PRODUCT_TO_ADD.quantity);

            cy.get('button[name="add"]').should('be.visible').click();
            cy.contains(/Added to your cart|View cart/i, { timeout: 15000 }).should('be.visible');
            
            cy.visit('/cart', { timeout: 30000 });
            cy.url().should('include', '/cart');
            cy.get('button[name="checkout"]:visible').should('be.visible').click();
        });

        // --- 5. CHECKOUT VERIFICATION ---
        cy.log('Step 5: Verifying arrival at checkout...');
        cy.url({ timeout: 45000 }).should('include', '/checkout');
        cy.contains('Contact', { timeout: 20000 }).should('be.visible');

        // Confirm checkout total amount value falls safely below 100
        cy.get('body').then(($body) => {
            const bodyText = $body.text();
            const totalMatch = bodyText.match(/Total\s+EUR\s+€?(\d+\.\d+)/i);
            if (totalMatch) {
                const checkoutTotal = parseFloat(totalMatch[1]);
                cy.log(`Parsed Checkout Total Amount: €${checkoutTotal}`);
                expect(checkoutTotal).to.be.lessThan(100);
            }
        });

        // --- 6. CONDITIONAL VERIFICATION (PASS IF HIDDEN, FAIL IF DISPLAYED) ---
        cy.log('Step 6: Confirming custom shipping rate is hidden when below 100...');
        
        cy.contains('div, h2, h3, span', /Shipping method/i, { timeout: 15000 })
            .should('be.visible')
            .scrollIntoView();

        cy.get('body').then(($body) => {
            const isShippingMethodShowing = $body.find(`:contains("${uniqueName}")`).length > 0;

            if (isShippingMethodShowing) {
                // If it displays when it shouldn't, fail the test
                throw new Error(`TEST FAILED: Total amount is below 100, but the custom shipping rate "${uniqueName}" is incorrectly displaying.`);
            } else {
                // If it does not display, the test passes
                cy.log(`✅ TEST PASSED: Total amount is below 100 and the shipping rate "${uniqueName}" did not display.`);
            }
        });
    });
});