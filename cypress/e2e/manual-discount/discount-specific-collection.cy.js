import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';

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
        const discountCode = Cypress.env('DISCOUNT_CODE_COLLECTION'); 

        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');

        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');
        cy.intercept('POST', '**/checkout/*/discount').as('applyDiscountCode');

        // --- 1. DASHBOARD LOGIN (With Page Object & Fallbacks) ---
        if (typeof loginPage.login === 'function') {
            loginPage.login(email, password, adminUrl);
        } else {
            cy.visit(`${adminUrl}/login`);
            cy.url({ timeout: 15000 }).should('include', '/login');
            cy.contains(/welcome back|login/i, { timeout: 20000 }).should('be.visible');
            cy.get('input[type="email"]').should('be.visible').type(email);
            cy.get('input[type="password"]').should('be.visible').type(password, { log: false });
            cy.get('button[type="submit"], button:contains("Log in")').should('be.visible').click();
            cy.url({ timeout: 30000 }).should('include', '/dashboard');
        }

        // --- 2. SETTINGS & SCRIPT RE-EMBED ---
        if (typeof settingsPage.navigateToScriptSettings === 'function') {
            settingsPage.navigateToScriptSettings();
        } else {
            cy.contains('Settings', { timeout: 15000 }).should('be.visible').click();
            cy.url({ timeout: 15000 }).should('include', '/settings');
            cy.contains(/Checky Pro Script|Script Settings/i, { timeout: 15000 }).should('be.visible').click();
            cy.url({ timeout: 15000 }).should('include', '/settings/checky-pro-script');
        }

        if (typeof settingsPage.reEmbedScript === 'function') {
            settingsPage.reEmbedScript();
        } else {
            cy.contains('button', 'Re-embed script').should('be.visible').click();
            cy.wait('@reEmbedRequest', { timeout: 30000 }).its('response.statusCode').should('eq', 200);
            cy.wait(3000);
        }

        // Clean cache to prevent session mixing
        cy.log('Purging storage configurations to prevent detached origin crashes...');
        cy.window().then((win) => {
            win.sessionStorage.clear();
            win.localStorage.clear();
        });
        cy.clearCookies();

        // --- 3. OPEN SHOPIFY STOREFRONT & ADD All 3 PRODUCTS (Clean Sandbox Flow) ---
        cy.log('Step 3: Opening Shopify storefront origin...');
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);

            // Reusable helper to clean up test layout & add targeted products 
            const addProductToCart = (productName) => {
                cy.visit('/');
                cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
                cy.get('a:visible').contains(productName).click();
                cy.get('button[name="add"]', { timeout: 15000 }).should('be.visible').click();
                cy.wait(1500);
            };

            addProductToCart("Knitted Men's Polo T-shirt");
            addProductToCart("Laptops");
            addProductToCart("Men’s Cable Knit Sweater");
            
            // Navigate to Cart and progress to checkout
            cy.contains('View cart', { timeout: 15000 }).should('be.visible').click();
            cy.url().should('include', '/cart');
            cy.get('button[name="checkout"]:visible').should('be.visible').click();
        });

        // --- 4. CHECKOUT REDIRECT & STABILIZATION ---
        if (typeof checkoutPage.stabilizeCheckout === 'function') {
            checkoutPage.stabilizeCheckout();
        } else {
            cy.url({ timeout: 45000 }).should('include', '/checkout');
            cy.contains('Contact', { timeout: 25000 }).should('be.visible');
            cy.wait(4000);
        }

        // --- 5. COLLECTION VALIDATION & DISCOUNT APPLICATION ---
        cy.get('body').then(($body) => {
            const checkoutText = $body.text();

            // Verify the presence of all 3 mandatory campaign items
            const hasPolo = checkoutText.includes("Knitted Men's Polo T-shirt") || checkoutText.includes('Polo');
            const hasLaptop = checkoutText.includes('Laptops');
            const hasSweater = checkoutText.includes('Sweater') || checkoutText.includes('Cable Knit');

            cy.log(`Collection Audit -> Has Polo: ${hasPolo} | Has Laptop: ${hasLaptop} | Has Sweater: ${hasSweater}`);

            if (!hasPolo || !hasLaptop || !hasSweater) {
                throw new Error(`❌ TEST FAILED: Checkout contents do not contain all 3 targeted home page products.`);
            }

            cy.log('✅ Validation successful! Specific collections bundle verified. Applying discount code...');

            // Extract baseline total order pricing
            cy.contains('div:visible', 'Total', { timeout: 15000 })
                .invoke('text')
                .then((initialText) => {
                    const initialMatches = initialText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                    const initialTotal = initialMatches ? parseFloat(initialMatches[0].replace(/,/g, '')) : parseFloat(initialText.replace(/[^0-9.]/g, ''));
                    cy.log(`Initial Order Total: €${initialTotal}`);

                    // Resilient input detection
                    let $input = $body.find('input[name="discount_code"]');
                    if ($input.length === 0) {
                        $input = $body.find('input').filter((i, el) => {
                            const placeholderText = Cypress.$(el).attr('placeholder') || '';
                            return placeholderText.toLowerCase().includes('discount');
                        });
                    }

                    cy.wrap($input.first(), { timeout: 15000 })
                        .should('be.visible')
                        .clear()
                        .type(discountCode);

                    cy.get('button:contains("Apply")')
                        .should('be.visible')
                        .should('not.be.disabled')
                        .click({ force: true });

                    // Wait for the backend transaction response
                    cy.wait('@applyDiscountCode', { timeout: 20000 });

                    // Re-calculate the updated price element and assert reduction
                    cy.contains('div:visible', 'Total', { timeout: 15000 }).should(($div) => {
                        const updatedText = $div.text();
                        const updatedMatches = updatedText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                        const finalTotal = updatedMatches ? parseFloat(updatedMatches[0].replace(/,/g, '')) : parseFloat(updatedText.replace(/[^0-9.]/g, ''));
                        
                        expect(finalTotal).to.be.lessThan(initialTotal);
                    });
                    
                    cy.log('✅ TEST PASSED: Verified all products are in cart and collection discount applied successfully!');
                });
        });
    });
});