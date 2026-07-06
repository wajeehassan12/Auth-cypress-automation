describe('Checky Pro - Check-out-page Automation & Product Flow Verification', () => {

    it('Should login, re-embed script, select Laptop from featured products, and verify cart data matches checkout', () => {
        
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

            // --- DATA CAPTURE ---
            return cy.get('form[action="/cart"], .cart__footer, main, body')
                .first()
                .should('be.visible')
                .then(($cartContainer) => {
                    
                    let capturedData = { itemCount: "1", totalPrice: "" };

                    // Extract Item Count
                    const inputVal = $cartContainer.find('input[name="updates[]"], [class*="quantity"] input').first().val();
                    if (inputVal) {
                        capturedData.itemCount = inputVal.trim();
                    } else {
                        const text = $cartContainer.text();
                        const match = text.match(/(\d+)\s*item/i) || text.match(/Quantity:\s*(\d+)/i);
                        if (match) capturedData.itemCount = match[1];
                    }

                    // Extract Total Price
                    const textContent = $cartContainer.text();
                    const priceMatch = textContent.match(/[€$]\d+[.,]\d{2}/);
                    if (priceMatch) {
                        capturedData.totalPrice = priceMatch[0].replace(/[^0-9.,]/g, '').replace(',', '.');
                    }

                    // Allow custom checkout scripts time to attach click listeners to the page
                    cy.wait(3000); 

                    // Target only the checkout button that is physically visible on screen
                    cy.get('button[name="checkout"]:visible').click();

                    // Return the captured values out of the cross-origin pipeline block
                    return cy.wrap(capturedData);
                });
        }).then((cartData) => {
            // --- 4. RETURNED TO TOP-LEVEL APP ORIGIN ---
            // Verify redirection to Checky Pro custom checkout page
            cy.url({ timeout: 35000 }).should('include', '/checkout');

            // Explicitly verify critical form components exist to guarantee the DOM is fully interactive
            cy.contains('Contact', { timeout: 20000 }).should('be.visible');
            cy.get('input[type="email"]', { timeout: 15000 }).should('be.visible');

            // --- DATA VERIFICATION ---
            
            // 1. Verify checkout item quantity matches cart count via assertions in a .should() retry loop
            cy.get('body', { timeout: 15000 }).should(($body) => {
                const quantityElement = $body.find('.product-thumbnail__quantity, [class*="badge"], [class*="quantity"], .order-summary');
                
                if (quantityElement.length > 0) {
                    const checkoutCountText = quantityElement.first().text();
                    const checkoutCount = checkoutCountText.replace(/\D/g, '');
                    
                    if (checkoutCount) {
                        expect(checkoutCount).to.equal(cartData.itemCount);
                    } else {
                        expect($body.text()).to.include(cartData.itemCount);
                    }
                } else {
                    expect($body.text()).to.include(cartData.itemCount);
                }
            });

            // 2. Verify checkout final payment matches cart total price
            if (cartData.totalPrice) {
                cy.get('body', { timeout: 15000 }).should(($body) => {
                    const pageText = $body.text();
                    const match = pageText.match(/[€$]\d+[.,]\d{2}/);
                    
                    expect(match).to.not.be.null;
                    const checkoutPrice = match[0].replace(/[^0-9.,]/g, '').replace(',', '.');
                    expect(parseFloat(checkoutPrice)).to.equal(parseFloat(cartData.totalPrice));
                });
            }
        });
    });
});