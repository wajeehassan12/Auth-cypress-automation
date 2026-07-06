describe('Checky Pro - Check-out-page Automation & Product Flow Verification', () => {

    it('Should login, re-embed script, select Laptop from featured products, and automate form fields up to phone number via environment variables', () => {
        
        // --- ENVIRONMENT VALIDATIONS ---
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

        // --- 3. STOREFRONT ORIGIN FLOW (robustapps.net) ---
        cy.origin('https://checkyprostore.robustapps.net', () => {
            cy.visit('/');
            
            // Clean up Service Workers to prevent proxy routing drops
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

            // Scroll down to Featured Products
            cy.contains('Featured products').should('be.visible').scrollIntoView();
            cy.wait(1000);

            // Target ONLY the anchor element containing 'Laptops' that is visible on screen
            cy.get('a:visible').contains('Laptops').click();

            // Verify navigation to product page
            cy.url().should('include', '/products/laptops');

            // Click "Add to cart" button
            cy.get('button[name="add"]').should('be.visible').click();

            // Click "View cart" from the notification drawer popup
            cy.contains('View cart').should('be.visible').click();

            // Verify landing on the official cart page
            cy.url().should('include', '/cart');

            // Allow custom checkout scripts time to attach click listeners to the page
            cy.wait(3000); 

            // Target only the checkout button that is physically visible on screen
            cy.get('button[name="checkout"]:visible').click();
        });

        // --- 4. RETURNED TO TOP-LEVEL APP ORIGIN & FORM FIELD AUTOMATION ---
        // Verify redirection to Checky Pro custom checkout page
        cy.url({ timeout: 35000 }).should('include', '/checkout');

        // Explicitly verify critical form components exist to guarantee the DOM is fully interactive
        cy.contains('Contact', { timeout: 20000 }).should('be.visible');
        cy.get('input[type="email"]', { timeout: 15000 }).should('be.visible');

        // Fill Contact Email Address Information via Env Configuration
        cy.get('input[type="email"]')
            .clear({ force: true })
            .type(Cypress.env('CHECKOUT_EMAIL'), { force: true });

        // Handle Country Dropdown Selection
        cy.get('select[name*="country"], select')
            .first()
            .select(Cypress.env('CHECKOUT_COUNTRY'));

        // Target First and Last Name input fields via explicit HTML ID attributes
        cy.get('input#firstName')
            .clear({ force: true })
            .type(Cypress.env('CHECKOUT_FIRSTNAME'), { force: true });

        cy.get('input#lastName')
            .clear({ force: true })
            .type(Cypress.env('CHECKOUT_LASTNAME'), { force: true });

        // Target Address and House specification fields safely via exact explicit IDs
        cy.get('input#address')
            .clear({ force: true })
            .type(Cypress.env('CHECKOUT_ADDRESS'), { force: true });

        cy.get('input#house-number')
            .clear({ force: true })
            .type(Cypress.env('CHECKOUT_HOUSE_NUMBER'), { force: true });

        cy.get('input#suffix')
            .clear({ force: true })
            .type(Cypress.env('CHECKOUT_SUFFIX'), { force: true });

        // Target City and Location Region options
        cy.get('input#city')
            .clear({ force: true })
            .type(Cypress.env('CHECKOUT_CITY'), { force: true });

        cy.get('input#zip')
            .clear({ force: true })
            .type(Cypress.env('CHECKOUT_ZIP'), { force: true });

        // Target Phone Input field to complete profile info sequence
        cy.get('input#phone')
            .clear({ force: true })
            .type(Cypress.env('CHECKOUT_PHONE'), { force: true });

        // --- REFRESH AND RELOAD PAUSE ---
        // Explicit 5-second pause to let the dynamic shipping configurations and payment options completely finish reloading
        cy.log('Pausing 5 seconds for payment configurations to safely handle geographic reload rules...');
        cy.wait(5000);

        // Verification step confirming page context is standing by ready at Payment components
        cy.contains('Payment').should('be.visible');
    });
});