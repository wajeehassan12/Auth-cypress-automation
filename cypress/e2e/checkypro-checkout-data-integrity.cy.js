import loginPage from '../page-objects/login-page';
import settingsPage from '../page-objects/settingsPage';
import checkoutPage from '../page-objects/checkoutPage';

describe('Checky Pro - Check-out-page Automation & Product Flow Verification', () => {

    beforeEach(() => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const adminUrl = Cypress.config('baseUrl');

        if (!email || !password) {
            throw new Error('❌ Missing LOGIN_EMAIL or LOGIN_PASSWORD in cypress.env.json configuration.');
        }

        // Cache session authentication across tests (Part 1, Rule 6 & Part 2, Rule 6)
        cy.session([email, password], () => {
            loginPage.login(email, password, adminUrl);
        });
    });

    it('Should re-embed script, select Laptop, and verify cart data matches checkout', () => {

        // --- 0. CONFIGURATION & URL NORMALIZATION ---
        const adminUrl = Cypress.config('baseUrl');
        let storeUrl = Cypress.env('STORE_URL');

        if (!storeUrl) {
            throw new Error('❌ Missing STORE_URL in cypress.env.json configuration.');
        }

        // Enforce HTTPS protocol to prevent spec bridge mismatch (http -> https)
        if (!storeUrl.startsWith('http://') && !storeUrl.startsWith('https://')) {
            storeUrl = `https://${storeUrl}`;
        } else if (storeUrl.startsWith('http://')) {
            storeUrl = storeUrl.replace('http://', 'https://');
        }

        // --- 1. DASHBOARD & RE-EMBED SCRIPT VIA PAGE OBJECT ---
        cy.visit(`${adminUrl}/dashboard`);
        settingsPage.navigateToScriptSettings();
        settingsPage.reEmbedScript();
        settingsPage.clearStorageAndCookies();

        // --- 2. STOREFRONT ORIGIN FLOW & DATA CAPTURE (Part 2, Rule 14) ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            const storefrontModule = Cypress.require('../page-objects/storefrontPage');
            const TargetExport = storefrontModule.default || storefrontModule;
            const storefront = (typeof TargetExport === 'function') 
                ? new TargetExport() 
                : (TargetExport.storefrontPage || TargetExport);

            cy.visit(storeUrl);

            // Add product via Page Object method or retryable selector fallback
            if (storefront && typeof storefront.addProductToCart === 'function') {
                storefront.addProductToCart('Laptops', 1);
            } else {
                cy.contains('a:visible', 'Laptops', { timeout: 15000 }).click();
                cy.get('button[name="add"]', { timeout: 15000 })
                    .should('be.visible')
                    .and('not.be.disabled')
                    .click();
            }

            // Navigate to Cart Page
            if (storefront && typeof storefront.goToCheckout === 'function') {
                storefront.goToCheckout();
            } else {
                cy.visit(`${storeUrl}/cart`);
            }

            // Capture Cart Details and Proceed to Checkout
            return cy.get('form[action="/cart"], .cart__footer, main, body', { timeout: 15000 })
                .first()
                .then(($cartContainer) => {
                    let capturedData = { itemCount: "1", totalPrice: "" };

                    const inputVal = $cartContainer.find('input[name="updates[]"], [class*="quantity"] input').first().val();
                    if (inputVal) {
                        capturedData.itemCount = inputVal.trim();
                    } else {
                        const match = $cartContainer.text().match(/(\d+)\s*item/i) || $cartContainer.text().match(/Quantity:\s*(\d+)/i);
                        if (match) capturedData.itemCount = match[1];
                    }

                    const priceMatch = $cartContainer.text().match(/[€$]\d+[.,]\d{2}/);
                    if (priceMatch) {
                        capturedData.totalPrice = priceMatch[0].replace(/[^0-9.,]/g, '').replace(',', '.');
                    }

                    // Click checkout without { force: true } (Part 2, Rule 9)
                    cy.get('button[name="checkout"], input[name="checkout"]', { timeout: 15000 })
                        .filter(':visible')
                        .first()
                        .should('be.visible')
                        .and('not.be.disabled')
                        .click();

                    return cy.wrap(capturedData);
                });
        }).then((cartData) => {

            // --- 3. CHECKOUT VERIFICATION VIA PAGE OBJECT ---
            checkoutPage.stabilizeCheckout();

            // Validate Item Quantity at Checkout
            cy.get('body:visible', { timeout: 15000 }).should(($body) => {
                const textContent = $body.text();
                expect(textContent, 'Checkout page should contain captured cart item count').to.include(cartData.itemCount);
            });

            // Validate Pricing Matrix at Checkout
            if (cartData.totalPrice) {
                cy.get('body:visible', { timeout: 15000 }).should(($body) => {
                    const match = $body.text().match(/[€$]\d+[.,]\d{2}/);
                    expect(match, 'Checkout price format should be visible').to.not.be.null;

                    const checkoutPrice = parseFloat(match[0].replace(/[^0-9.,]/g, '').replace(',', '.'));
                    const originalPrice = parseFloat(cartData.totalPrice);
                    expect(checkoutPrice, 'Checkout price matches captured cart total').to.equal(originalPrice);
                });
            }
        });
    });
});