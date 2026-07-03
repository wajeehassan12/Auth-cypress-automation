describe('Checky Pro - Script Re-embed Flow', () => {

    it('Should login, re-embed the script, wait 3 seconds, and redirect to the store', () => {
        
        // Defend against undefined environment variables
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

        // FIX: Intercept the actual GET request to /store that occurs when clicking re-embed
        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        
        // Prevent telemetry noise from breaking the runner
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        // --- LOGIN ---
        cy.visit('https://checkypro.robustapps.net/login');

        cy.contains('Welcome back! Login to Checky Pro', { timeout: 20000 })
            .should('be.visible');

        cy.get('input[type="email"]')
            .should('be.visible')
            .type(email);

        cy.get('input[type="password"]')
            .should('be.visible')
            .type(password, { log: false });

        cy.contains('button', 'Log in')
            .should('be.visible')
            .click();

        // --- DASHBOARD ---
        cy.url({ timeout: 30000 })
            .should('include', '/dashboard');

        // --- SETTINGS ---
        cy.contains('Settings', { timeout: 15000 })
            .should('be.visible')
            .click();

        cy.url({ timeout: 15000 })
            .should('include', '/settings');

        // --- CHECKY PRO SCRIPT TAB ---
        cy.contains('Checky Pro Script', { timeout: 15000 })
            .should('be.visible')
            .click();

        cy.url({ timeout: 15000 })
            .should('include', '/settings/checky-pro-script');

        // --- CLICK RE-EMBED SCRIPT ---
        cy.contains('button', 'Re-embed script')
            .should('be.visible')
            .click();

        // --- VERIFY API RESPONSE ---
        // This will now successfully match the GET 200 /store request
        cy.wait('@reEmbedRequest', { timeout: 30000 })
            .then((interception) => {
                cy.log(`Method: ${interception.request.method}`);
                cy.log(`URL: ${interception.request.url}`);
                cy.log(`Status: ${interception.response.statusCode}`);

                expect(interception.response.statusCode).to.eq(200);
            });

        // --- WAIT 3 SECONDS ---
        cy.wait(3000);

        // --- OPEN SHOPIFY STORE ---
        cy.origin('https://checkyprostore.robustapps.net', () => {
            cy.visit('/');
            
            cy.url({ timeout: 30000 })
                .should('include', 'checkyprostore.robustapps.net');
        });
    });
});