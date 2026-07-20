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

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Minimum-Quantity Discount Flow', () => {

    it('verify discount applies at minimum 3 quantities', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';
        const discountCode = Cypress.env('DISCOUNT_CODE_2') || 'ME3JZ2Z5RHSC'; 
        const MIN_QUANTITY_FOR_DISCOUNT = 3;

        const adminUrl = Cypress.config('baseUrl');
        const storeUrl = Cypress.env('STORE_URL');

        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        // --- 1. DASHBOARD LOGIN ---
        if (typeof loginPage.login === 'function') {
            loginPage.login(email, password, adminUrl);
        } else {
            cy.visit(`${adminUrl}/login`);
            cy.url({ timeout: 15000 }).should('include', '/login');
            
            // Resilient fallback check instead of static exact strings
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

        // --- 3. OPEN SHOPIFY STOREFRONT ORIGIN (INLINE ONLY) ---
        cy.log('Step 3: Opening Shopify storefront origin...');
        cy.origin(
            storeUrl, 
            { args: { MIN_QUANTITY_FOR_DISCOUNT } }, 
            ({ MIN_QUANTITY_FOR_DISCOUNT }) => {
                Cypress.on('uncaught:exception', () => false);

                // 1. Visit Storefront and clear active Service Workers
                cy.visit('/');
                cy.window().then((win) => {
                    if (win.navigator && win.navigator.serviceWorker) {
                        win.navigator.serviceWorker.getRegistrations().then((regs) => {
                            for (let reg of regs) reg.unregister();
                        });
                    }
                });

                // 2. Locate product and scale up the quantity
                cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
                cy.get('a:visible').contains('Laptops').click();

                // Dynamically click "+" button based on the target quantity
                const clicksNeeded = MIN_QUANTITY_FOR_DISCOUNT - 1;
                for (let i = 0; i < clicksNeeded; i++) {
                    cy.get('button[name="plus"]', { timeout: 15000 })
                        .should('be.visible')
                        .click();
                }

                cy.get('input[name="quantity"]', { timeout: 10000 })
                    .should('have.value', String(MIN_QUANTITY_FOR_DISCOUNT));

                // 3. Add to cart & initiate checkout redirect
                cy.get('button[name="add"]').should('be.visible').click();
                cy.contains('View cart').should('be.visible').click();
                cy.url().should('include', '/cart');
                cy.get('button[name="checkout"]:visible').should('be.visible').click();
            }
        );

        // --- 4. CHECKOUT REDIRECT & STABILIZATION ---
        if (typeof checkoutPage.stabilizeCheckout === 'function') {
            checkoutPage.stabilizeCheckout();
        } else {
            cy.url({ timeout: 45000 }).should('include', '/checkout');
            cy.contains('Contact', { timeout: 25000 }).should('be.visible');
            cy.wait(4000);
        }

        // --- 5. DISCOUNT APPLICATION & QUANTITY BADGE VALIDATION ---
        cy.get('body').then(($body) => {
            let totalQuantity = 0;

            const foundBadges = $body.find('span, div, border').filter((i, el) => {
                const text = Cypress.$(el).text().trim();
                return /^\d+$/.test(text) && Cypress.$(el).is(':visible');
            });

            if (foundBadges.length > 0) {
                totalQuantity = parseInt(foundBadges.first().text().trim(), 10);
            }

            cy.log(`Scraped Counter Value: ${totalQuantity}`);

            if (totalQuantity !== MIN_QUANTITY_FOR_DISCOUNT) {
                throw new Error(`❌ TEST FAILED: Image badge counter (${totalQuantity}) does not match expected quantity of ${MIN_QUANTITY_FOR_DISCOUNT}.`);
            }

            cy.log(`✅ Success! Image badge counter is exactly ${totalQuantity}. Moving forward...`);

            // Capture initial order price total
            cy.contains('div:visible', 'Total', { timeout: 15000 })
                .invoke('text')
                .then((initialText) => {
                    const initialMatches = initialText.match(/\d+\.\d+/);
                    const initialTotal = initialMatches ? parseFloat(initialMatches[0]) : parseFloat(initialText.replace(/[^0-9.]/g, ''));
                    cy.log(`Initial Clean Total Price: €${initialTotal}`);

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

                    // Assert total price dropped
                    cy.contains('div:visible', 'Total', { timeout: 15000 }).should(($div) => {
                        const updatedText = $div.text();
                        const updatedMatches = updatedText.match(/\d+\.\d+/);
                        const finalTotal = updatedMatches ? parseFloat(updatedMatches[0]) : parseFloat(updatedText.replace(/[^0-9.]/g, ''));
                        
                        expect(finalTotal, '❌ TEST FAILED: Discount was submitted but final cart value did not drop.').to.be.lessThan(initialTotal);
                    });
                    
                    cy.log('✅ TEST PASSED: Verified counter quantity is 3 and discount successfully applied!');
                });
        });
    });
});