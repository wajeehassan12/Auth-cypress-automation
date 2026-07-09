describe('Checky Pro - Check-out-page Automation & Product Flow Verification', () => {

    it('Should login, re-embed script, select Laptop from featured products, and verify cart data matches checkout', () => {
        
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        // Fetch the domain dynamically from cypress.config.js env
        const storeUrl = Cypress.env('STORE_URL');

        if (!email || !password || !storeUrl) {
            throw new Error('Missing configuration parameters in environment options.');
        }

        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        cy.visit('/login');

        cy.contains('Welcome back! Login to Checky Pro', { timeout: 20000 })
            .should('be.visible');

        cy.get('input[type="email"]:visible').should('be.visible').clear().type(email);
        cy.get('input[type="password"]:visible').should('be.visible').clear().type(password, { log: false });
        
        cy.get('button')
            .contains(/Log in/i)
            .should('be.visible')
            .click();

        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        // --- 2. SETTINGS & RE-EMBED ---
        cy.contains('Settings', { timeout: 15000 }).should('be.visible').click();
        cy.url({ timeout: 15000 }).should('include', '/settings');

        cy.contains('Checky Pro Script', { timeout: 15000 }).should('be.visible').click();
        cy.url({ timeout: 15000 }).should('include', '/settings/checky-pro-script');

        cy.get('button')
            .contains(/Re-embed script/i)
            .should('be.visible')
            .click();

        cy.wait('@reEmbedRequest', { timeout: 30000 })
            .then((interception) => {
                expect(interception.response.statusCode).to.eq(200);
            });

        // --- 3. STOREFRONT ORIGIN FLOW ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            
            Cypress.on('uncaught:exception', (err) => {
                if (err.message.includes('registerTool') || err.message.includes('permissions policy')) {
                    return false; 
                }
                return true;
            });

            cy.visit('/', { 
                timeout: 60000,
                pageLoadTimeout: 60000,
                retryOnStatusCodeFailure: true 
            });

            // Fix: Replaced the invalid chainer assertion with a proper dynamic include check
            cy.url({ timeout: 30000 }).should('include', 'checkyprostore');

            cy.contains('Featured products').should('be.visible').scrollIntoView();
            cy.get('a:visible').contains('Laptops').click();
            cy.url().should('include', '/products/laptops');

            cy.get('button[name="add"]').should('be.visible').click();
            cy.contains('View cart').should('be.visible').click();
            cy.url().should('include', '/cart');

            // --- DATA CAPTURE ---
            return cy.get('form[action="/cart"], .cart__footer, main, body')
                .first()
                .should('be.visible')
                .then(($cartContainer) => {
                    let capturedData = { itemCount: "1", totalPrice: "" };

                    const inputVal = $cartContainer.find('input[name="updates[]"], [class*="quantity"] input').first().val();
                    if (inputVal) {
                        capturedData.itemCount = inputVal.trim();
                    } else {
                        const text = $cartContainer.text();
                        const match = text.match(/(\d+)\s*item/i) || text.match(/Quantity:\s*(\d+)/i);
                        if (match) capturedData.itemCount = match[1];
                    }

                    const textContent = $cartContainer.text();
                    const priceMatch = textContent.match(/[€$]\d+[.,]\d{2}/);
                    if (priceMatch) {
                        capturedData.totalPrice = priceMatch[0].replace(/[^0-9.,]/g, '').replace(',', '.');
                    }

                    cy.get('button[name="checkout"]:visible')
                        .should('be.visible')
                        .should('not.be.disabled')
                        .click();

                    return cy.wrap(capturedData);
                });
        }).then((cartData) => {
            cy.url({ timeout: 45000 }).should('include', '/checkout');
            cy.contains('Contact', { timeout: 20000 }).should('be.visible');
            cy.get('input[type="email"]', { timeout: 15000 }).should('be.visible');

            // --- DATA VERIFICATION ---
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