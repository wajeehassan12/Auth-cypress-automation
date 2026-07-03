describe('Checky Pro - Script Re-embed Flow', () => {

    it('Should login, re-embed the script, wait 3 seconds, and redirect to the store', () => {

        // ==========================================
        // LOGIN
        // ==========================================

        cy.visit('https://checkypro.robustapps.net/login');

        cy.contains('Welcome back! Login to Checky Pro', {
            timeout: 20000
        }).should('be.visible');

        cy.get('input[type="email"]')
            .should('be.visible')
            .type(Cypress.env('LOGIN_EMAIL'));

        cy.get('input[type="password"]')
            .should('be.visible')
            .type(Cypress.env('LOGIN_PASSWORD'), { log: false });

        cy.contains('button', 'Log in')
            .should('be.visible')
            .click();

        // Dashboard Loaded
        cy.url({ timeout: 30000 })
            .should('include', '/dashboard');

        // ==========================================
        // SETTINGS
        // ==========================================

        cy.contains('Settings', { timeout: 15000 })
            .should('be.visible')
            .click();

        cy.url({ timeout: 15000 })
            .should('include', '/settings');

        // ==========================================
        // CHECKY PRO SCRIPT TAB
        // ==========================================

        cy.contains('Checky Pro Script', { timeout: 15000 })
            .should('be.visible')
            .click();

        cy.url({ timeout: 15000 })
            .should('include', '/settings/checky-pro-script');

        // ==========================================
        // INTERCEPT RE-EMBED API
        // ==========================================

        cy.intercept('**/script/re-embed').as('reEmbedRequest');

        // ==========================================
        // CLICK RE-EMBED SCRIPT
        // ==========================================

        cy.contains('button', 'Re-embed script')
            .should('be.visible')
            .click();

        // ==========================================
        // VERIFY API RESPONSE
        // ==========================================

        cy.wait('@reEmbedRequest', { timeout: 30000 })
            .then((interception) => {

                cy.log(`Method: ${interception.request.method}`);
                cy.log(`URL: ${interception.request.url}`);
                cy.log(`Status: ${interception.response.statusCode}`);

                expect(interception.response.statusCode).to.eq(200);

            });

        // ==========================================
        // WAIT 3 SECONDS
        // ==========================================

        cy.wait(3000);

        // ==========================================
        // OPEN SHOPIFY STORE
        // ==========================================

        cy.visit('https://checkyprostore.robustapps.net/');

        cy.url({ timeout: 30000 })
            .should('include', 'checkyprostore.robustapps.net');

    });

});