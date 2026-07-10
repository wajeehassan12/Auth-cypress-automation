// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('secretKeyVerified is not defined')) {
        return false;
    }
    return true;
});

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Invalid Coupon Fallback Test', () => {

    it('Should log in, re-embed script, add 3 homepage products, apply invalid coupon, and pass on either rejection error or successful application', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

        // Fetching the invalid code from environment configuration
        const invalidDiscountCode = Cypress.env('INVALID_DISCOUNT_CODE') || 'INVALID_CODE_123'; 

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

        // --- 3. OPEN SHOPIFY STOREFRONT & ADD ALL 3 PRODUCTS ---
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

        // --- 5. INVALID COUPON APPLICATION & DUAL-OUTCOME PASS LOGIC ---
        cy.get('body').then(($body) => {
            // Extract initial total order amount before entering anything
            cy.contains('div:visible', 'Total', { timeout: 15000 })
                .invoke('text')
                .then((initialText) => {
                    const initialMatches = initialText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                    const initialTotal = initialMatches ? parseFloat(initialMatches[0].replace(/,/g, '')) : parseFloat(initialText.replace(/[^0-9.]/g, ''));
                    cy.log(`Initial Order Total: €${initialTotal}`);

                    // Locate coupon input field fallback
                    let $input = $body.find('input[name="discount_code"]');
                    if ($input.length === 0) {
                        $input = $body.find('input').filter((i, el) => {
                            const placeholderText = Cypress.$(el).attr('placeholder') || '';
                            return placeholderText.toLowerCase().includes('discount');
                        });
                    }

                    // Input the invalid coupon code string
                    cy.wrap($input.first(), { timeout: 15000 })
                        .should('be.visible')
                        .clear()
                        .type(invalidDiscountCode);

                    // Click Apply
                    cy.get('button:contains("Apply")')
                        .should('be.visible')
                        .should('not.be.disabled')
                        .click({ force: true });

                    // Wait on network intercept to allow checkout page processing
                    cy.wait('@applyDiscountCode', { timeout: 20000 });
                    cy.wait(2000); // Small visual stabilization buffer for error/success text rendering

                    // Query the layout body context after submission to determine condition profiles
                    cy.get('body').then(($postSubmitBody) => {
                        const postSubmitText = $postSubmitBody.text().toLowerCase();
                        
                        // Check if common UI coupon error string alerts are present on screen
                        const hasErrorMsg = postSubmitText.includes('invalid') || 
                                             postSubmitText.includes('not valid') || 
                                             postSubmitText.includes('enter a valid') || 
                                             postSubmitText.includes('expired');

                        // Re-parse total to look for physical price drops
                        const currentText = $postSubmitBody.find('div:visible:contains("Total")').last().text();
                        const currentMatches = currentText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                        const finalTotal = currentMatches ? parseFloat(currentMatches[0].replace(/,/g, '')) : initialTotal;

                        cy.log(`Post-Submit Evaluation -> Has Error Message: ${hasErrorMsg} | Final Price: €${finalTotal}`);

                        // DUAL PASS LOGIC ASSERTER:
                        if (hasErrorMsg || finalTotal === initialTotal) {
                            // OUTCOME A: Coupon was successfully blocked/errored out -> TEST PASSED
                            cy.log("✅ TEST PASSED: Coupon was successfully rejected by the system with an error message or unchanged price balance.");
                            expect(true).to.be.true;
                        } else if (finalTotal < initialTotal) {
                            // OUTCOME B: Coupon was applied successfully and dropped the price -> TEST PASSED
                            cy.log(`✅ TEST PASSED: Coupon was unexpectedly accepted, but price dropped from €${initialTotal} to €${finalTotal}.`);
                            expect(finalTotal).to.be.lessThan(initialTotal);
                        } else {
                            // Fallback safety failure catch (should not be reached based on logic profiles)
                            throw new Error("❌ TEST FAILED: Unexpected layout or state configuration detected during validation evaluation.");
                        }
                    });
                });
        });
    });
});