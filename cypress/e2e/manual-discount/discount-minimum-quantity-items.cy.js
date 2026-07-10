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

        // --- 3. OPEN SHOPIFY STOREFRONT ORIGIN ---
        cy.log('Step 3: Opening Shopify storefront origin...');
        cy.origin(storeUrl, { args: { storeUrl, MIN_QUANTITY_FOR_DISCOUNT } }, ({ storeUrl, MIN_QUANTITY_FOR_DISCOUNT }) => {
            Cypress.on('uncaught:exception', () => false);

            cy.visit('/');

            cy.window().then((win) => {
                if (win.navigator && win.navigator.serviceWorker) {
                    win.navigator.serviceWorker.getRegistrations().then((regs) => {
                        for (let reg of regs) reg.unregister();
                    });
                }
            });

            cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
            cy.get('a:visible').contains('Laptops').click();

            // --- INCREASE ITEMS QUANTITY TO 3 ---
            cy.get('button[name="plus"]', { timeout: 15000 })
                .should('be.visible')
                .click() // 1 -> 2
                .click(); // 2 -> 3

            cy.get('input[name="quantity"]', { timeout: 10000 })
                .should('have.value', String(MIN_QUANTITY_FOR_DISCOUNT));

            cy.get('button[name="add"]').should('be.visible').click();

            cy.contains('View cart').should('be.visible').click();
            cy.url().should('include', '/cart');
            cy.get('button[name="checkout"]:visible').should('be.visible').click();
        });

        // --- 4. CHECKOUT REDIRECT & STABILIZATION ---
        cy.url({ timeout: 45000 }).should('include', '/checkout');
        cy.contains('Contact', { timeout: 25000 }).should('be.visible');

        cy.wait(4000);

        // --- 5. DISCOUNT APPLICATION & QUANTITY BADGE VALIDATION ---
        cy.get('body').then(($body) => {
            let totalQuantity = 0;

            // Target elements matching exact numerical content near the product thumbnails
            const foundBadges = $body.find('span, div, border').filter((i, el) => {
                const text = Cypress.$(el).text().trim();
                return /^\d+$/.test(text) && Cypress.$(el).is(':visible');
            });

            if (foundBadges.length > 0) {
                totalQuantity = parseInt(foundBadges.first().text().trim(), 10);
            }

            cy.log(`Scraped Counter Value from Image: ${totalQuantity}`);

            // Validation check: ensure the counter value equals or exceeds 3
            if (totalQuantity !== MIN_QUANTITY_FOR_DISCOUNT) {
                throw new Error(`❌ TEST FAILED: Image badge counter (${totalQuantity}) does not match the expected target quantity of ${MIN_QUANTITY_FOR_DISCOUNT}.`);
            }

            cy.log(`✅ Success! Image badge counter is exactly ${totalQuantity}. Moving forward...`);

            // Capture initial order price total
            cy.contains('div:visible', 'Total', { timeout: 15000 })
                .invoke('text')
                .then((initialText) => {
                    const initialMatches = initialText.match(/\d+\.\d+/);
                    const initialTotal = initialMatches ? parseFloat(initialMatches[0]) : parseFloat(initialText.replace(/[^0-9.]/g, ''));
                    cy.log(`Initial Clean Total Price: €${initialTotal}`);

                    // Fallback input detection: finding the field via name attribute or case-insensitive text match
                    let $input = $body.find('input[name="discount_code"]');
                    if ($input.length === 0) {
                        $input = $body.find('input').filter((i, el) => {
                            const placeholderText = Cypress.$(el).attr('placeholder') || '';
                            return placeholderText.toLowerCase().includes('discount');
                        });
                    }

                    // Perform interactions on the evaluated element selector safely
                    cy.wrap($input.first(), { timeout: 15000 })
                        .should('be.visible')
                        .clear()
                        .type(discountCode);

                    // Click apply button
                    cy.get('button:contains("Apply")')
                        .should('be.visible')
                        .should('not.be.disabled')
                        .click({ force: true });

                    // Final check: Assert total price dropped from its initial amount
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