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

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Specific Product Bundle Discount Flow', () => {

    it('Should log in, re-embed script, add specific bundle to cart, validate items, and apply coupon', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';
        
        Cypress.env('DISCOUNT_CODE_SPECIFIC', 'FKN8H02ANCWR');
        const discountCode = Cypress.env('DISCOUNT_CODE_SPECIFIC'); 

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

        // Purge storage configurations
        cy.log('Purging storage configurations to prevent detached origin crashes...');
        cy.window().then((win) => {
            win.sessionStorage.clear();
            win.localStorage.clear();
        });
        cy.clearCookies();

        // --- 3. OPEN SHOPIFY STOREFRONT & ADD BUNDLE (Clean Sandbox Flow) ---
        cy.log('Step 3: Opening Shopify storefront origin...');
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);

            // Reusable inline helper to clean layout and sequence product additions
            const addProductToCart = (productName) => {
                cy.visit('/');
                cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
                cy.get('a:visible').contains(productName).click();
                cy.get('button[name="add"]', { timeout: 15000 }).should('be.visible').click();
                cy.wait(1500);
            };

            addProductToCart('Laptops');
            addProductToCart('PlayStation®5 Pro Console');
            
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

        // --- 5. BUNDLE VALIDATION & DISCOUNT ENTRY ---
        cy.get('body').then(($body) => {
            const checkoutText = $body.text();

            // Perform structural bundle sanity checks
            const hasLaptop = checkoutText.includes('Laptops');
            const hasPlayStation = /PlayStation/i.test(checkoutText);

            if (!hasLaptop || !hasPlayStation) {
                throw new Error(`❌ TEST FAILED: Checkout contents do not match bundle criteria (Laptop + PlayStation).`);
            }

            // Simple price extraction parser
            const extractPrice = (textValue) => {
                const matches = textValue.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
                return matches ? parseFloat(matches[0].replace(/,/g, '')) : parseFloat(textValue.replace(/[^0-9.]/g, ''));
            };

            // Grab pre-discount benchmark
            cy.contains('div:visible', 'Total', { timeout: 15000 })
                .invoke('text')
                .then((initialText) => {
                    const initialTotal = extractPrice(initialText);
                    cy.log(`Initial Order Total: €${initialTotal}`);

                    // Locate coupon field dynamically
                    let $input = $body.find('input[name="discount_code"]');
                    if ($input.length === 0) {
                        $input = $body.find('input').filter((i, el) => {
                            const placeholderText = Cypress.$(el).attr('placeholder') || '';
                            return placeholderText.toLowerCase().includes('discount');
                        });
                    }

                    cy.wrap($input.first(), { timeout: 15000 }).should('be.visible').clear().type(discountCode);
                    cy.get('button:contains("Apply")').should('be.visible').should('not.be.disabled').click({ force: true });

                    // Assert total price dropped to pass test pipeline
                    cy.contains('div:visible', 'Total', { timeout: 15000 }).should(($div) => {
                        expect(extractPrice($div.text())).to.be.lessThan(initialTotal);
                    });
                    
                    cy.log('✅ TEST PASSED: Match confirmation verified and bundle code applied successfully!');
                });
        });
    });
});