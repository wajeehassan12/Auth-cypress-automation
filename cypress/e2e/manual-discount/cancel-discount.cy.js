// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('secretKeyVerified is not defined')) {
        return false;
    }
    return true;
});

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Discount Flow', () => {

    it('Should log in, re-embed script, walk through cart checkout, apply discount, and remove it', () => {

        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
        const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';
        const discountCode = Cypress.env('DISCOUNT_CODE') || 'YBMKT9Z3AVDP';

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
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
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
            cy.get('button[name="add"]').should('be.visible').click();

            cy.contains('View cart').should('be.visible').click();
            cy.url().should('include', '/cart');
            cy.get('button[name="checkout"]:visible').should('be.visible').click();
        });

        // --- 4. CHECKOUT REDIRECT & STABILIZATION ---
        cy.url({ timeout: 45000 }).should('include', '/checkout');
        cy.contains('Contact', { timeout: 25000 }).should('be.visible');

        cy.wait(4000);

        // --- 5. DISCOUNT CODE APPLICATION & REMOVAL ---
        cy.intercept('DELETE', '**/discount').as('deleteDiscount');

        cy.contains('div:visible', 'Total', { timeout: 15000 })
            .invoke('text')
            .then((initialText) => {
                const initialTotal = parseFloat(initialText.replace(/[^0-9.]/g, ''));
                cy.log(`Initial Total Price: €${initialTotal}`);

                cy.get('input[name="discount_code"]', { timeout: 15000 })
                    .filter(':visible')
                    .should('be.visible')
                    .clear()
                    .type(discountCode);

                cy.get('button.discount-apply-button')
                    .filter(':visible')
                    .should('be.visible')
                    .should('not.be.disabled')
                    .click();

                cy.contains('div:visible', 'Total', { timeout: 15000 })
                    .should('not.contain', initialText);

                cy.wait(3000);

                // --- Stop the remove-discount control from opening a new tab ---
                // A real, trusted click follows native anchor behavior (href/target="_blank"),
                // unlike Cypress's old synthetic click. Strip any target="_blank" near the
                // control, and stub window.open as a backup in case it's triggered via JS.
                cy.window().then((win) => {
                    cy.stub(win, 'open').as('windowOpen');
                });

                cy.get('.discount-container').then(($container) => {
                    $container.find('a[target="_blank"]').removeAttr('target');
                    if ($container.is('a[target="_blank"]')) {
                        $container.removeAttr('target');
                    }
                    // Also cover the case where the container itself sits inside an anchor
                    $container.parents('a[target="_blank"]').removeAttr('target');
                });

                // --- Poll for the remove-discount button to actually be enabled, then click it ---
                const tryRemoveDiscount = (attempt = 1, maxAttempts = 12) => {
                    cy.get('.discount-container', { timeout: 15000 }).should('be.visible');

                    cy.get('.discount-container')
                        .find('button.remove-discount-button')
                        .then(($btn) => {
                            const isDisabled = $btn.prop('disabled');
                            cy.log(`Attempt ${attempt}/${maxAttempts} — remove button disabled: ${isDisabled}`);

                            if (!isDisabled) {
                                cy.wrap($btn).realMouseDown();
                                cy.wrap($btn).realMouseUp();
                            } else if (attempt < maxAttempts) {
                                cy.wait(500);
                                tryRemoveDiscount(attempt + 1, maxAttempts);
                            } else {
                                throw new Error(
                                    `Remove-discount button stayed disabled for ${maxAttempts} attempts (~${maxAttempts * 500}ms of polling).`
                                );
                            }
                        });
                };

                cy.screenshot('before-remove-discount-click');
                tryRemoveDiscount();

                // Confirm no new tab was actually spawned
                cy.window().its('open').should('not.be.called');

                cy.log('Waiting for backend server to confirm discount deletion...');
                cy.wait('@deleteDiscount', { timeout: 20000 });

                cy.log('Confirming discount element wrapper is removed from layout...');
                cy.get('.discount-container', { timeout: 15000 })
                    .should('not.exist');

                cy.contains('div:visible', 'Total', { timeout: 15000 })
                    .invoke('text')
                    .then((revertedText) => {
                        const revertedTotal = parseFloat(revertedText.replace(/[^0-9.]/g, ''));
                        cy.log(`Reverted Total Price: €${revertedTotal}`);

                        expect(revertedTotal).to.equal(initialTotal);
                    });

                cy.log('✅ TEST PASSED: Coupon successfully apply-settled and removed via a real trusted click!');
            });
    });
});