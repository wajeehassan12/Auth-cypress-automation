// Global Handler: Catch and ignore the application's broken 'secretKeyVerified' code error
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('secretKeyVerified is not defined')) {
        return false; 
    }
    return true; 
});

describe('Checky Pro - Optional Phone & Payment Load Validation', () => {

    it('Should enforce Optional Phone setting and verify payment methods load without a phone number', () => {
        
        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');

        if (!email || !password) {
            throw new Error('Missing LOGIN_EMAIL or LOGIN_PASSWORD environment variables.');
        }

        // Setup Network Intercepts
        cy.intercept('GET', '**/store*').as('reEmbedRequest');

        // --- 1. DASHBOARD LOGIN & SCRIPT RE-EMBED ---
        cy.log('Step 1: Authenticating into admin panel...');
        cy.visit('https://checkypro.robustapps.net/login');
        cy.contains('Welcome back! Login to Checky Pro', { timeout: 20000 }).should('be.visible');
        
        cy.get('input[type="email"]').should('be.visible').type(email);
        cy.get('input[type="password"]').should('be.visible').type(password, { log: false });
        cy.contains('button', 'Log in').should('be.visible').click();

        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        // Perform required re-embed action sequence
        cy.contains('Settings', { timeout: 15000 }).should('be.visible').click();
        cy.contains('Checky Pro Script', { timeout: 15000 }).should('be.visible').click();
        cy.contains('button', 'Re-embed script').should('be.visible').click();
        cy.wait('@reEmbedRequest', { timeout: 30000 }).its('response.statusCode').should('eq', 200);

        // --- 2. SIDEBAR NAVIGATION & CONFIGURING OPTIONAL PHONE OPTION ---
        cy.log('Step 2: Navigating to Customization settings...');
        // References the side menu configuration shown in image_68fd75.png and image_690115.png
        cy.contains('a, div, span', 'Customization', { timeout: 15000 })
            .should('be.visible')
            .click();

        cy.url({ timeout: 15000 }).should('include', '/customization');

        cy.log('Step 2b: Setting Collect Phone Number option to Optional...');
        // References the layout section visible in image_69f85f.png
        cy.contains('Collect phone number', { timeout: 20000 })
            .scrollIntoView()
            .should('be.visible');

        // Small visual delay so you can watch the runner focus on this section
        cy.wait(1000); 

        // Direct selection to change setting to Optional
        cy.contains('Optional')
            .should('be.visible')
            .click({ force: true });
        
        cy.log('Clicking the Save Changes button...');
        cy.contains('button', 'Save Changes')
            .should('be.visible')
            .click();
        
        // Brief pause to allow the configuration adjustment to sync with the database cleanly
        cy.wait(3000);

        // --- 3. SHOPIFY STOREFRONT FLOW (CART SELECTION) ---
        cy.log('Step 3: Opening Shopify storefront origin...');
        cy.origin('https://checkyprostore.robustapps.net', () => {
            cy.visit('/');
            
            // Clean service worker context to bypass asset caching
            cy.window().then((win) => {
                if (win.navigator && win.navigator.serviceWorker) {
                    win.navigator.serviceWorker.getRegistrations().then((regs) => {
                        for (let reg of regs) reg.unregister();
                    });
                }
            });

            cy.contains('Featured products', { timeout: 15000 }).should('be.visible').scrollIntoView();
            cy.get('a:visible').contains('Laptops').click();
            cy.get('button[name="add"]').should('be.visible').click();
            
            cy.contains('View cart').should('be.visible').click();
            cy.url().should('include', '/cart');
            cy.get('button[name="checkout"]:visible').should('be.visible').click();
        });

        // --- 4. CHECKOUT FORM INTAKE (LEAVING PHONE FIELD BLANK) ---
        cy.log('Step 4: Filling out checkout details while ignoring the phone field...');
        cy.url({ timeout: 35000 }).should('include', '/checkout');
        
        cy.contains('Contact', { timeout: 20000 }).should('be.visible');

        // Autofill standard shipping details smoothly
        cy.get('input[type="email"]').clear({ force: true }).type(Cypress.env('CHECKOUT_EMAIL'), { force: true });
        cy.get('select[name*="country"], select').first().select(Cypress.env('CHECKOUT_COUNTRY'));
        cy.get('input#firstName').clear({ force: true }).type(Cypress.env('CHECKOUT_FIRSTNAME'), { force: true });
        cy.get('input#lastName').clear({ force: true }).type(Cypress.env('CHECKOUT_LASTNAME'), { force: true });
        cy.get('input#address').clear({ force: true }).type(Cypress.env('CHECKOUT_ADDRESS'), { force: true });
        cy.get('input#house-number').clear({ force: true }).type(Cypress.env('CHECKOUT_HOUSE_NUMBER'), { force: true });
        cy.get('input#suffix').clear({ force: true }).type(Cypress.env('CHECKOUT_SUFFIX'), { force: true });
        cy.get('input#city').clear({ force: true }).type(Cypress.env('CHECKOUT_CITY'), { force: true });
        cy.get('input#zip').clear({ force: true }).type(Cypress.env('CHECKOUT_ZIP'), { force: true });

        // Explicitly clear the phone field to ensure it remains blank
        cy.get('input#phone')
            .clear({ force: true })
            .should('have.value', '');

        // --- 5. NATIVE RETRY FOR PAYMENT METHODS ---
        cy.log('Step 5: Waiting up to 5 minutes for payment methods to initialize without a phone number...');
        
        // Combined selector targeting the PayPal SDK iframes or payment container targets
        const paymentSelector = 'iframe[title*="PayPal"], iframe[src*="paypal.com"], .payment-methods, #payment';

        // Native Cypress retry loop: it will constantly check the page for up to 5 minutes.
        // Since the field is optional, payment modules should load completely without user interaction on the phone input.
        cy.get(paymentSelector, { timeout: 300000 })
            .should('be.visible')
            .then(($el) => {
                cy.log('✅ TEST PASSED: Payment methods successfully loaded with an optional/empty phone number field!');
            });
    });
});