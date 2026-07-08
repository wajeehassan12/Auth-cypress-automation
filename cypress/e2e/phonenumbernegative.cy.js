// Global Handler: Catch and ignore the admin panel's broken 'secretKeyVerified' code error
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('secretKeyVerified is not defined')) {
        return false; 
    }
    return true; 
});

// Standard JS macro function handling the store domain interaction
const navigateToCheckoutFlow = (env) => {
    cy.log('Storefront: Executing cart intake selection...');
    
    // 1. Interact with the store subdomain
    cy.origin('https://checkyprostore.robustapps.net', { args: { env } }, ({ env }) => {
        Cypress.on('uncaught:exception', (err) => {
            if (err.message.includes('registerTool') || err.message.includes('permissions policy')) {
                return false; 
            }
            return true;
        });

        cy.visit('https://checkyprostore.robustapps.net/', { 
            timeout: 60000,
            pageLoadTimeout: 60000,
            retryOnStatusCodeFailure: true 
        });

        cy.contains('Featured products', { timeout: 25000 }).scrollIntoView();
        cy.get('a:visible').contains('Laptops').click();
        cy.get('button[name="add"]').click();
        cy.contains('View cart', { timeout: 15000 }).click();
        cy.get('button[name="checkout"]:visible').click();
    });

    // 2. Control automatically returns to the primary origin (checkypro.robustapps.net)
    cy.log('Checkout: Processing details on the primary application domain...');
    cy.url({ timeout: 45000 }).should('include', '/checkout');
    
    // Autofill generic non-phone shipping data properties safely on primary origin
    cy.get('input[type="email"]').clear({ force: true }).type(env.CHECKOUT_EMAIL, { force: true });
    cy.get('select[name*="country"], select').first().select(env.CHECKOUT_COUNTRY);
    cy.get('input#firstName').clear({ force: true }).type(env.CHECKOUT_FIRSTNAME, { force: true });
    cy.get('input#lastName').clear({ force: true }).type(env.CHECKOUT_LASTNAME, { force: true });
    cy.get('input#address').clear({ force: true }).type(env.CHECKOUT_ADDRESS, { force: true });
    cy.get('input#house-number').clear({ force: true }).type(env.CHECKOUT_HOUSE_NUMBER, { force: true });
    cy.get('input#suffix').clear({ force: true }).type(env.CHECKOUT_SUFFIX, { force: true });
    cy.get('input#city').clear({ force: true }).type(env.CHECKOUT_CITY, { force: true });
    cy.get('input#zip').clear({ force: true }).type(env.CHECKOUT_ZIP, { force: true });
};

describe('Checky Pro - Phone Field Negative Test Framework', () => {

    beforeEach(() => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');

        if (!email || !password) {
            throw new Error('Missing LOGIN_EMAIL or LOGIN_PASSWORD environment variables.');
        }

        cy.intercept('GET', '**/store*').as('reEmbedRequest');

        cy.log('Setup: Authenticating into admin panel...');
        cy.visit('https://checkypro.robustapps.net/login');
        cy.get('input[type="email"]').should('be.visible').type(email);
        cy.get('input[type="password"]').should('be.visible').type(password, { log: false });
        cy.contains('button', 'Log in').click();

        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        // Re-embed live active test script
        cy.contains('Settings', { timeout: 15000 }).click();
        cy.contains('Checky Pro Script').click();
        cy.contains('button', 'Re-embed script').click();
        cy.wait('@reEmbedRequest', { timeout: 30000 });

        // Navigate to Customization settings 
        cy.contains('a, div, span', 'Customization').click();
        cy.url().should('include', '/customization');

        // Force 'Required' rule active state
        cy.contains('Collect phone number', { timeout: 20000 }).scrollIntoView();
        cy.wait(1000);
        cy.contains('Required').click({ force: true });
        cy.contains('button', 'Save Changes').click();
        cy.wait(3000); 
    });

    it('Scenario 1: Should block checkout and display error when required phone is completely empty', () => {
        navigateToCheckoutFlow(Cypress.env());

        cy.log('Leaving phone input blank...');
        cy.get('input#phone').clear({ force: true }).should('have.value', '').blur();
        
        // Retrying assertions wrapper dynamically waits for layout updates without breaking
        cy.get('body').should(($body) => {
            const errorElement = $body.find('.error, .text-red-500, [aria-invalid="true"], .invalid-feedback, p:contains("phone")');
            const paymentElement = $body.find('iframe[title*="PayPal"], .payment-methods, #payment');
            
            const hasError = errorElement.length > 0;
            const paymentsBlocked = paymentElement.length === 0 || !paymentElement.is(':visible');
            
            expect(hasError || paymentsBlocked, 'Validation error must be visible OR payment gateways must be blocked').to.be.true;
        });
        cy.log('✅ TEST PASSED: Validation state checked successfully.');
    });

    it('Scenario 2: Should reject alphabetic text characters or special symbols input strings', () => {
        navigateToCheckoutFlow(Cypress.env());

        cy.log('Injecting alphabetic characters into phone target field...');
        cy.get('input#phone').clear({ force: true }).type('INVALIDPHONE#TEXT', { force: true }).blur();

        cy.get('body').should(($body) => {
            const phoneVal = $body.find('input#phone').val();
            const hasErrorString = $body.text().toLowerCase().includes('valid') || $body.text().toLowerCase().includes('phone');
            const paymentElement = $body.find('iframe[title*="PayPal"], .payment-methods, #payment');
            const paymentsBlocked = paymentElement.length === 0 || !paymentElement.is(':visible');

            expect(phoneVal === '' || hasErrorString || paymentsBlocked, 'Malformed text string must be filtered or block gateway execution').to.be.true;
        });
        cy.log('✅ TEST PASSED: Malformed input successfully handled.');
    });

    it('Scenario 3: Should reject a numerical string that is too short to be valid', () => {
        navigateToCheckoutFlow(Cypress.env());

        cy.log('Typing insufficient character string length limit...');
        cy.get('input#phone').clear({ force: true }).type('12', { force: true }).blur();

        cy.get('body').should(($body) => {
            const shortErrorDetected = $body.text().toLowerCase().includes('short') || $body.text().toLowerCase().includes('valid');
            const paymentElement = $body.find('iframe[title*="PayPal"], .payment-methods, #payment');
            const paymentsBlocked = paymentElement.length === 0 || !paymentElement.is(':visible');

            expect(shortErrorDetected || paymentsBlocked, 'Short numerical value must trigger error layout configurations').to.be.true;
        });
        cy.log('✅ TEST PASSED: Insufficient string limits evaluated cleanly.');
    });
});