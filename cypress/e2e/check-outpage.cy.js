describe('Checky Pro - Check-out-page Automation', () => {

    it('Should login, re-embed the script, wait 3 seconds, and redirect to the store', () => {
        
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');

        if (!email || !password) {
            throw new Error('Missing LOGIN_EMAIL or LOGIN_PASSWORD environment variables.');
        }

        // Setup global network intercepts for the Dashboard origin
        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        // --- 1. DASHBOARD LOGIN ---
        cy.visit('https://checkypro.robustapps.net/login');

        cy.contains('Welcome back! Login to Checky Pro', { timeout: 20000 })
            .should('be.visible');

        cy.get('input[type="email"]').should('be.visible').type(email);
        cy.get('input[type="password"]').should('be.visible').type(password, { log: false });
        cy.contains('button', 'Log in').should('be.visible').click();

        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        // --- 2. SETTINGS & RE-EMBED ---
        cy.contains('Settings', { timeout: 15000 }).should('be.visible').click();
        cy.url({ timeout: 15000 }).should('include', '/settings');

        cy.contains('Checky Pro Script', { timeout: 15000 }).should('be.visible').click();
        cy.url({ timeout: 15000 }).should('include', '/settings/checky-pro-script');

        cy.contains('button', 'Re-embed script').should('be.visible').click();

        // Verify Dashboard API Response
        cy.wait('@reEmbedRequest', { timeout: 30000 })
            .then((interception) => {
                expect(interception.response.statusCode).to.eq(200);
            });

        cy.wait(3000);

        // --- 3. CROSS-ORIGIN STOREFRONT & CHECKOUT VERIFICATION ---
        cy.origin('https://checkyprostore.robustapps.net', () => {
            cy.visit('/');
            
            // Unregister Service Workers
            cy.window().then((win) => {
                if (win.navigator && win.navigator.serviceWorker) {
                    win.navigator.serviceWorker.getRegistrations().then((registrations) => {
                        for (let registration of registrations) {
                            registration.unregister();
                        }
                    });
                }
            });

            cy.url({ timeout: 30000 }).should('include', 'checkyprostore.robustapps.net');
            cy.wait(3000);

            // Go to Product Page
            cy.visit('/products/men-s-cable-knit-sweater-classic-pullover');
            cy.url().should('include', '/products/men-s-cable-knit-sweater-classic-pullover');

            // Click Add to Cart
            cy.get('button[name="add"]').should('be.visible').click({ force: true });

            // Allow custom app click-handlers to mount/bind to the DOM
            cy.wait(5000); 

            // Submit the checkout form programmatically
            cy.get('button[name="checkout"]')
                .closest('form')
                .submit();

            // --- ALL CHECKOUT ASSERTIONS MUST REMAIN INSIDE THE ORIGIN BLOCK ---
            cy.url({ timeout: 35000 }).should('include', '/checkout');

            cy.contains('Contact', { timeout: 20000 }).should('be.visible');
            cy.contains('Delivery').should('be.visible');
            cy.get('input[type="email"]').should('be.visible');
        });
    });
});

