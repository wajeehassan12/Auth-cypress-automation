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

describe("Checky Pro - End-to-End Re-embed, Cart Journey & Discount Rejection Pass Verification", () => {

    it("Should add Polo T-shirt, attempt to apply discount, confirm it is NOT applied, and PASS the test", () => {

        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';
        const discountCode = Cypress.env('DISCOUNT_CODE_3') || 'FKN8H02ANCWR'; 

        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');

        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        // --- 1. DASHBOARD LOGIN (Page Object with Safe Fallback) ---
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

        // Clean local cache storage
        cy.log('Purging storage configurations to prevent detached origin crashes...');
        cy.window().then((win) => {
            win.sessionStorage.clear();
            win.localStorage.clear();
        });
        cy.clearCookies();

        // --- 3. OPEN SHOPIFY STOREFRONT & ADD ONLY POLO T-SHIRT (Clean Sandbox Flow) ---
        cy.log('Step 3: Opening Shopify storefront origin...');
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);

            cy.visit('/');
            cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
            cy.get('a:visible').contains("Knitted Men's Polo T-shirt").click();
            cy.get('button[name="add"]', { timeout: 15000 }).should('be.visible').click();
            
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

        // --- 5. ATTEMPT DISCOUNT APPLICATION & ASSERT REJECTION ---
        cy.get('body').then(($body) => {
            // Setup verify checks
            const hasPolo = /Knitted Men's Polo T-shirt|Polo/i.test($body.text());
            if (!hasPolo) {
                throw new Error("❌ TEST FAILED: Setup issue—Knitted Men's Polo T-shirt was not successfully added to checkout.");
            }

            // Clean price-extraction helper to shorten validation logic
            const extractPrice = (elementText) => {
                const matches = elementText.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                return matches ? parseFloat(matches[0].replace(/,/g, '')) : parseFloat(elementText.replace(/[^0-9.]/g, ''));
            };

            // Grab pre-discount benchmark
            cy.contains('div:visible', 'Total', { timeout: 15000 })
                .invoke('text')
                .then((initialText) => {
                    const initialTotal = extractPrice(initialText);
                    cy.log(`Pre-discount Order Total: €${initialTotal}`);

                    // Locate coupon field dynamically
                    let $input = $body.find('input[name="discount_code"]');
                    if ($input.length === 0) {
                        $input = $body.find('input').filter((i, el) => {
                            const placeholderText = Cypress.$(el).attr('placeholder') || '';
                            return placeholderText.toLowerCase().includes('discount');
                        });
                    }

                    // Apply the discount
                    cy.wrap($input.first(), { timeout: 15000 }).should('be.visible').clear().type(discountCode);
                    cy.get('button:contains("Apply")').should('be.visible').should('not.be.disabled').click({ force: true });

                    cy.wait(3000); // Allow discount rejection calculation trip to finalize

                    // Validate final price is unaltered
                    cy.contains('div:visible', 'Total', { timeout: 15000 }).then(($div) => {
                        const finalTotal = extractPrice($div.text());
                        cy.log(`Post-discount Order Total: €${finalTotal}`);
                        
                        expect(finalTotal, "System successfully restricted code application for non-bundle collections.").to.equal(initialTotal);
                    });
                });
        });
    });
});