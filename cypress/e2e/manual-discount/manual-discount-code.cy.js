import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import checkoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Discount Flow', () => {

    beforeEach(() => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const adminUrl = Cypress.config('baseUrl');

        if (!email || !password) {
            throw new Error('❌ Missing LOGIN_EMAIL or LOGIN_PASSWORD in cypress.env.json configuration.');
        }

        // Cache session across tests using Page Object Model (Part 1, Rule 6 & Part 2, Rule 1, 6)
        cy.session([email, password], () => {
            loginPage.login(email, password, adminUrl);
        });
    });

    it('Should log in, re-embed script, walk through cart checkout, and verify 30% discount', () => {

        // --- 0. ENVIRONMENT SETUP & PROTOCOL NORMALIZATION ---
        const adminUrl = Cypress.config('baseUrl');
        let storeUrl = Cypress.env('STORE_URL') || 'https://checkyprostore.robustapps.net';
        const validDiscountCode = Cypress.env('DISCOUNT_CODE');

        if (!validDiscountCode) {
            throw new Error('❌ Missing DISCOUNT_CODE in cypress.env.json configuration.');
        }

        // Enforce HTTPS protocol to prevent spec bridge mismatch (http -> https)
        if (!storeUrl.startsWith('http://') && !storeUrl.startsWith('https://')) {
            storeUrl = `https://${storeUrl}`;
        } else if (storeUrl.startsWith('http://')) {
            storeUrl = storeUrl.replace('http://', 'https://');
        }

        // --- 1. SETTINGS & SCRIPT RE-EMBED VIA PAGE OBJECT ---
        cy.visit(`${adminUrl}/dashboard`);
        settingsPage.navigateToScriptSettings();
        settingsPage.reEmbedScript();
        settingsPage.clearStorageAndCookies();

        // --- 2. OPEN SHOPIFY STOREFRONT ORIGIN (Part 2, Rule 14) ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            const storefrontModule = Cypress.require('../../page-objects/storefrontPage');
            
            // Robust module export resolution across the spec bridge
            const TargetExport = storefrontModule.default || storefrontModule;
            const storefront = (typeof TargetExport === 'function') 
                ? new TargetExport() 
                : (TargetExport.storefrontPage || TargetExport);

            // Visit storefront base URL
            cy.visit(storeUrl);

            // Add product via Page Object method or retryable DOM selector fallback
            if (storefront && typeof storefront.addProductToCart === 'function') {
                storefront.addProductToCart('Laptops');
            } else {
                cy.contains('a:visible', 'Laptops', { timeout: 15000 }).click();
                cy.get('button[name="add"]', { timeout: 15000 })
                    .should('be.visible')
                    .and('not.be.disabled')
                    .click();
            }

            // Go to checkout via Page Object method or retryable DOM selector fallback
            if (storefront && typeof storefront.goToCheckout === 'function') {
                storefront.goToCheckout();
            } else {
                cy.visit(`${storeUrl}/cart`);
                cy.get('button[name="checkout"], input[name="checkout"]', { timeout: 15000 })
                    .filter(':visible')
                    .first()
                    .should('be.visible')
                    .and('not.be.disabled')
                    .click();
            }
        });

        // --- 3. CHECKOUT REDIRECT & STABILIZATION ---
        checkoutPage.stabilizeCheckout();

        // --- 4. DISCOUNT CODE APPLICATION & MATH VERIFICATION ---
        const extractPrice = (textVal) => {
            const matches = textVal.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
            return matches ? parseFloat(matches[0].replace(/,/g, '')) : parseFloat(textVal.replace(/[^0-9.]/g, ''));
        };

        let initialTotal = 0;

        // Capture initial total price with automatic Cypress retries (Part 1, Rule 2 & 9)
        cy.contains('div:visible', 'Total', { timeout: 15000 })
            .invoke('text')
            .should('match', /\d+/)
            .then((initialText) => {
                initialTotal = extractPrice(initialText);
                cy.log(`Initial Clean Total Price: €${initialTotal}`);
            });

        // Enter valid discount code using resilient selector
        cy.get('input[name="discount_code"], input[placeholder*="discount" i]', { timeout: 15000 })
            .filter(':visible')
            .first()
            .should('be.visible')
            .clear()
            .type(validDiscountCode);

        // Click apply button without { force: true } (Part 2, Rule 9)
        cy.contains('button:visible', /apply/i, { timeout: 15000 })
            .should('be.visible')
            .and('not.be.disabled')
            .click();

        // Math verification using retry-able assertion block (No fixed cy.wait calls)
        cy.contains('div:visible', 'Total', { timeout: 20000 })
            .should(($totalDiv) => {
                const finalTotal = extractPrice($totalDiv.text());
                const expectedTotal = initialTotal * 0.70; // 30% reduction
                const variance = Math.abs(finalTotal - expectedTotal);

                expect(
                    variance,
                    `❌ Applied discount did not reduce total by 30%. Expected ~€${expectedTotal.toFixed(2)}, got €${finalTotal.toFixed(2)}`
                ).to.be.at.most(0.01);
            })
            .then(() => {
                cy.log('✅ TEST PASSED: Total value reflects a clean 30% reduction!');
            });
    });
});