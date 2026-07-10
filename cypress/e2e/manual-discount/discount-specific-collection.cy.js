// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('secretKeyVerified is not defined')) {
        return false;
    }
    return true;
});

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Specific Collection Bundle Discount Flow', () => {

    it('Should log in, re-embed script, add 3 homepage products to cart, validate items, and apply collection coupon', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

        // FETCHED DIRECTLY FROM CYPRESS.ENV CONFIGURATIONS File
        const discountCode = Cypress.env('DISCOUNT_CODE_COLLECTION'); 

        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');

        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');
        
        // INTERCEPT FOR THE DISCOUNT APPLICATION NETWORK CALL
        cy.intercept('POST', '**/checkout/*/discount').as('applyDiscountCode');

        // --- 1. DASHBOARD LOGIN ---
        cy.visit(`${adminUrl}/login`);

        cy.contains('Welcome back! Login to Checky Pro', { timeout: 20000 })
            .should('be.visible');

        cy.get('input[type="email"]').should('be.visible').type(email);
        cy.get('input[type="password"]').should('be.visible').type(password, { log: false });
        cy.contains('button', 'Log in').should('be.visible').click();

        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        // --- 2. SETTINGS & SCRIPT RE-EMBED ---
        cy.contains('Settings', { timeout: 15000 }).should('be.visible').click();
        cy.url({ timeout: 15000 }).should('include', '/settings');

        cy.contains('Checky Pro Script', { timeout: 15000 }).should('be.visible').click();
        cy.url({ timeout: 15000 }).should('include', '/settings/checky-pro-script');

        cy.contains('button', 'Re-embed script').should('be.visible').click();

        cy.wait('@reEmbedRequest', { timeout: 30000 })
            .its('response.statusCode')
            .should('eq', 200);

        cy.wait(3000);

        cy.log('Purging storage configurations to prevent detached origin crashes...');
        cy.window().then((win) => {
            win.sessionStorage.clear();
            win.localStorage.clear();
        });
        cy.clearCookies();

        // --- 3. OPEN SHOPIFY STOREFRONT & ADD All 3 PRODUCTS ---
        cy.log('Step 3: Opening Shopify storefront origin...');
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);

            // --- ADD FIRST PRODUCT: KNITTED MEN'S POLO T-SHIRT ---
            cy.visit('/');
            cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
            cy.get('a:visible').contains("Knitted Men's Polo T-shirt").click();
            cy.get('button[name="add"]', { timeout: 15000 }).should('be.visible').click();
            cy.wait(1500);

            // --- ADD SECOND PRODUCT: LAPTOPS ---
            cy.visit('/');
            cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
            cy.get('a:visible').contains('Laptops').click();
            cy.get('button[name="add"]', { timeout: 15000 }).should('be.visible').click();
            cy.wait(1500); 

            // --- ADD THIRD PRODUCT: MEN'S CABLE KNIT SWEATER ---
            cy.visit('/');
            cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
            cy.get('a:visible').contains("Men’s Cable Knit Sweater").click();
            cy.get('button[name="add"]', { timeout: 15000 }).should('be.visible').click();
            
            // Navigate to Cart and head to Checkout
            cy.contains('View cart', { timeout: 15000 }).should('be.visible').click();
            cy.url().should('include', '/cart');
            cy.get('button[name="checkout"]:visible').should('be.visible').click();
        });

        // --- 4. CHECKOUT REDIRECT & STABILIZATION ---
        cy.url({ timeout: 45000 }).should('include', '/checkout');
        cy.contains('Contact', { timeout: 25000 }).should('be.visible');

        cy.wait(4000);

        // --- 5. COLLECTION VALIDATION & DISCOUNT APPLICATION ---
        cy.get('body').then(($body) => {
            const checkoutText = $body.text();

            // Audit the 3 specific items in the checkout frame
            const hasPolo = checkoutText.includes("Knitted Men's Polo T-shirt") || checkoutText.includes('Polo');
            const hasLaptop = checkoutText.includes('Laptops');
            const hasSweater = checkoutText.includes('Sweater') || checkoutText.includes('Cable Knit');

            cy.log(`Collection Audit -> Has Polo: ${hasPolo} | Has Laptop: ${hasLaptop} | Has Sweater: ${hasSweater}`);

            // Ensure all 3 matching items are part of this transaction snapshot
            if (!hasPolo || !hasLaptop || !hasSweater) {
                throw new Error(`❌ TEST FAILED: Checkout contents do not contain all 3 targeted home page products.`);
            }

            cy.log('✅ Validation successful! Specific collections bundle verified. Applying discount code...');

            // Extract initial total order amount
            cy.contains('div:visible', 'Total', { timeout: 15000 })
                .invoke('text')
                .then((initialText) => {
                    const initialMatches = initialText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                    const initialTotal = initialMatches ? parseFloat(initialMatches[0].replace(/,/g, '')) : parseFloat(initialText.replace(/[^0-9.]/g, ''));
                    cy.log(`Initial Order Total: €${initialTotal}`);

                    // Locate coupon field input fallback
                    let $input = $body.find('input[name="discount_code"]');
                    if ($input.length === 0) {
                        $input = $body.find('input').filter((i, el) => {
                            const placeholderText = Cypress.$(el).attr('placeholder') || '';
                            return placeholderText.toLowerCase().includes('discount');
                        });
                    }

                    // Input target discount string validation
                    cy.wrap($input.first(), { timeout: 15000 })
                        .should('be.visible')
                        .clear()
                        .type(discountCode);

                    // Submit code payload adjustments
                    cy.get('button:contains("Apply")')
                        .should('be.visible')
                        .should('not.be.disabled')
                        .click({ force: true });

                    // Wait on the intercepted network request to guarantee the server trip resolved
                    cy.wait('@applyDiscountCode', { timeout: 20000 });

                    // Use a deterministic retry assertion loop to wait for total price to drop
                    cy.contains('div:visible', 'Total', { timeout: 15000 }).should(($div) => {
                        const updatedText = $div.text();
                        const updatedMatches = updatedText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                        const finalTotal = updatedMatches ? parseFloat(updatedMatches[0].replace(/,/g, '')) : parseFloat(updatedText.replace(/[^0-9.]/g, ''));
                        
                        // Asserts reduction over continuous retry blocks
                        expect(finalTotal).to.be.lessThan(initialTotal);
                    });
                });
        });
    });
});