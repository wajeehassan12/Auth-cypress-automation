// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('secretKeyVerified is not defined')) {
        return false;
    }
    return true;
});

describe("Checky Pro - End-to-End Re-embed, Cart Journey & Discount Rejection Pass Verification", () => {

    it("Should add Polo T-shirt, attempt to apply discount, confirm it is NOT applied, and PASS the test", () => {

        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

        // Uses the third discount code from your environment JSON
        const discountCode = Cypress.env('DISCOUNT_CODE_3') || 'FKN8H02ANCWR'; 

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

        // --- 3. OPEN SHOPIFY STOREFRONT & ADD ONLY POLO T-SHIRT ---
        cy.log('Step 3: Opening Shopify storefront origin...');
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);

            // --- ADD ONLY THE POLO SHIRT ---
            cy.visit('/');
            cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
            cy.get('a:visible').contains("Knitted Men's Polo T-shirt").click();
            cy.get('button[name="add"]', { timeout: 15000 }).should('be.visible').click();
            
            // Navigate to Cart and proceed to Checkout
            cy.contains('View cart', { timeout: 15000 }).should('be.visible').click();
            cy.url().should('include', '/cart');
            cy.get('button[name="checkout"]:visible').should('be.visible').click();
        });

        // --- 4. CHECKOUT REDIRECT & STABILIZATION ---
        cy.url({ timeout: 45000 }).should('include', '/checkout');
        cy.contains('Contact', { timeout: 25000 }).should('be.visible');

        cy.wait(4000);

        // --- 5. ATTEMPT DISCOUNT APPLICATION & ASSERT REJECTION ---
        cy.get('body').then(($body) => {
            const checkoutText = $body.text();

            // Verify item profile context before interacting
            const hasPolo = checkoutText.includes("Knitted Men's Polo T-shirt") || checkoutText.includes('Polo');
            if (!hasPolo) {
                throw new Error("❌ TEST FAILED: Setup issue—Knitted Men's Polo T-shirt was not successfully added to checkout.");
            }

            // Capture initial order total price
            cy.contains('div:visible', 'Total', { timeout: 15000 })
                .invoke('text')
                .then((initialText) => {
                    const initialMatches = initialText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                    const initialTotal = initialMatches ? parseFloat(initialMatches[0].replace(/,/g, '')) : parseFloat(initialText.replace(/[^0-9.]/g, ''));
                    cy.log(`Pre-discount Order Total: €${initialTotal}`);

                    // Locate coupon field dynamically via names or layout placeholders
                    let $input = $body.find('input[name="discount_code"]');
                    if ($input.length === 0) {
                        $input = $body.find('input').filter((i, el) => {
                            const placeholderText = Cypress.$(el).attr('placeholder') || '';
                            return placeholderText.toLowerCase().includes('discount');
                        });
                    }

                    // Type in the restricted bundle code
                    cy.wrap($input.first(), { timeout: 15000 })
                        .should('be.visible')
                        .clear()
                        .type(discountCode);

                    // Click Apply
                    cy.get('button:contains("Apply")')
                        .should('be.visible')
                        .should('not.be.disabled')
                        .click({ force: true });

                    cy.wait(3000); // Allow server processing time to evaluate and reject code

                    // Fixed: Using .then() instead of .should() to allow clean command queuing
                    cy.contains('div:visible', 'Total', { timeout: 15000 }).then(($div) => {
                        const updatedText = $div.text();
                        const updatedMatches = updatedText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                        const finalTotal = updatedMatches ? parseFloat(updatedMatches[0].replace(/,/g, '')) : parseFloat(updatedText.replace(/[^0-9.]/g, ''));
                        
                        cy.log(`Post-discount Order Total: €${finalTotal}`);

                        // Expectation: The price should equal the initial total because the discount must not apply
                        expect(finalTotal, "System successfully restricted code application for non-bundle collections.").to.equal(initialTotal);
                    });
                });
        });
    });
});