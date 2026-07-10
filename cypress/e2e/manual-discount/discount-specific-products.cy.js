// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('secretKeyVerified is not defined')) {
        return false;
    }
    return true;
});

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Specific Product Bundle Discount Flow', () => {

    it('Should log in, re-embed script, add specific bundle to cart, validate items, and apply coupon', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

        // ADDED TO ENVIRONMENT CONFIGURATIONS:
        Cypress.env('DISCOUNT_CODE_SPECIFIC', 'FKN8H02ANCWR');
        const discountCode = Cypress.env('DISCOUNT_CODE_SPECIFIC'); 

        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');

        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

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

        // --- 3. OPEN SHOPIFY STOREFRONT & ADD BUNDLE ---
        cy.log('Step 3: Opening Shopify storefront origin...');
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);

            // --- ADD FIRST PRODUCT: LAPTOPS ---
            cy.visit('/');
            cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
            cy.get('a:visible').contains('Laptops').click();
            cy.get('button[name="add"]', { timeout: 15000 }).should('be.visible').click();
            cy.wait(1500); 

            // --- ADD SECOND PRODUCT: PLAYSTATION 5 PRO CONSOLE ---
            cy.visit('/');
            cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
            cy.get('a:visible').contains('PlayStation®5 Pro Console').click();
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

        // --- 5. BUNDLE VALIDATION & DISCOUNT ENTRY ---
        cy.get('body').then(($body) => {
            const checkoutText = $body.text();

            // Check if both required target items exist inside the checkout page context
            const hasLaptop = checkoutText.includes('Laptops');
            const hasPlayStation = checkoutText.includes('PlayStation®5 Pro Console') || checkoutText.includes('PlayStation');

            cy.log(`Validation Audit -> Has Laptop: ${hasLaptop} | Has PlayStation: ${hasPlayStation}`);

            // Conditional constraint: If products do not match the expected bundle, explicitly fail the test execution
            if (!hasLaptop || !hasPlayStation) {
                throw new Error(`❌ TEST FAILED: Checkout contents do not match the required product bundle criteria (Laptop + PlayStation 5 Pro).`);
            }

            cy.log('✅ Validation successful! Specific bundle detected. Proceeding to apply discount code...');

            // Extract baseline total price context
            cy.contains('div:visible', 'Total', { timeout: 15000 })
                .invoke('text')
                .then((initialText) => {
                    const initialMatches = initialText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                    const initialTotal = initialMatches ? parseFloat(initialMatches[0].replace(/,/g, '')) : parseFloat(initialText.replace(/[^0-9.]/g, ''));
                    cy.log(`Initial Order Total: €${initialTotal}`);

                    // Locate coupon field dynamically via text properties or layout fallbacks
                    let $input = $body.find('input[name="discount_code"]');
                    if ($input.length === 0) {
                        $input = $body.find('input').filter((i, el) => {
                            const placeholderText = Cypress.$(el).attr('placeholder') || '';
                            return placeholderText.toLowerCase().includes('discount');
                        });
                    }

                    // Input target validation code configuration
                    cy.wrap($input.first(), { timeout: 15000 })
                        .should('be.visible')
                        .clear()
                        .type(discountCode);

                    // Submit validation changes
                    cy.get('button:contains("Apply")')
                        .should('be.visible')
                        .should('not.be.disabled')
                        .click({ force: true });

                    // Final Check: Verify the price dropped to pass the evaluation pipeline
                    cy.contains('div:visible', 'Total', { timeout: 15000 }).should(($div) => {
                        const updatedText = $div.text();
                        const updatedMatches = updatedText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                        const finalTotal = updatedMatches ? parseFloat(updatedMatches[0].replace(/,/g, '')) : parseFloat(updatedText.replace(/[^0-9.]/g, ''));
                        
                        expect(finalTotal, '❌ TEST FAILED: Bundle discount was entered but did not modify the final cart price.').to.be.lessThan(initialTotal);
                    });
                    
                    cy.log('✅ TEST PASSED: Match confirmation verified and bundle code applied successfully!');
                });
        });
    });
});