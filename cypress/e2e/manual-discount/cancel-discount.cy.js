import LoginPage from '../../page-objects/login-page';
import SettingsPage from '../../page-objects/settingsPage';
import StorefrontPage from '../../page-objects/storefrontPage';
import CheckoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Discount Flow', () => {
    const storeUrl = Cypress.env('STORE_URL');

    beforeEach(() => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');

        if (!email || !password) {
            throw new Error('❌ Missing LOGIN_EMAIL or LOGIN_PASSWORD in cypress.env.json!');
        }

        // Cache session to stay authenticated across runs/retries
        LoginPage.loginViaSession(email, password);
    });

    it('Should successfully complete the dashboard setup, cross-origin shopping, and discount application', () => {
        // 🚨 Read directly from cypress.env.json
        const discountCode = Cypress.env('DISCOUNT_CODE');

        if (!discountCode) {
            throw new Error('❌ Missing DISCOUNT_CODE in cypress.env.json! Please define it.');
        }

        // --- 1. SETTINGS & SCRIPT RE-EMBED ---
        LoginPage.visit(); // Navigates to base URL; session handles authentication instantly
        SettingsPage.navigateToSettings();
        SettingsPage.navigateToScriptSettings();
        SettingsPage.reEmbedScript();
        SettingsPage.clearStorageAndCookies();

        // --- 2. OPEN SHOPIFY STOREFRONT (Cross-Origin Setup) ---
        cy.origin(storeUrl, { args: { storeUrl, discountCode } }, ({ storeUrl, discountCode }) => {
            // Uncaught exception override for storefront domain
            Cypress.on('uncaught:exception', () => false);

            cy.visit('/');
            
            // Clean up Service Workers
            cy.window().then((win) => {
                if (win.navigator && win.navigator.serviceWorker) {
                    win.navigator.serviceWorker.getRegistrations().then((regs) => {
                        for (let reg of regs) reg.unregister();
                    });
                }
            });

            // 🛒 2a. Verify Storefront has loaded
            cy.get('body').then(($body) => {
                if ($body.find('[data-cy="featured-products-heading"]:visible').length > 0) {
                    cy.get('[data-cy="featured-products-heading"]')
                      .filter(':visible')
                      .scrollIntoView();
                } else {
                    cy.contains('h2:visible, h1:visible, :visible', /Featured products|Featured/i, { timeout: 25000 })
                      .first()
                      .scrollIntoView();
                }
            });

            // 🛒 2b. Click on the VISIBLE Laptops card/product link
            cy.get('body').then(($body) => {
                if ($body.find('[data-cy="category-link-laptops"]:visible').length > 0) {
                    cy.get('[data-cy="category-link-laptops"]').filter(':visible').click({ force: true });
                } else {
                    cy.contains('a:visible, h3:visible', /Laptops/i, { timeout: 15000 })
                      .first()
                      .click({ force: true });
                }
            });

            // Verify product page navigation has fully completed before finding buy buttons
            cy.url({ timeout: 15000 }).should('match', /\/(products|collections)\//);

            // 🛒 2c. Add to Cart
            cy.get('body').then(($body) => {
                if ($body.find('[data-cy="add-to-cart-button"]:visible').length > 0) {
                    cy.get('[data-cy="add-to-cart-button"]').filter(':visible').click({ force: true });
                } else {
                    cy.contains('button:visible, input[type="submit"]:visible, :visible', /Add to cart|Add to Bag/i, { timeout: 15000 })
                      .first()
                      .click({ force: true });
                }
            });

            // 🛒 2d. State update delay followed by direct visit
            cy.wait(3000); 
            cy.visit('/cart');
            cy.url({ timeout: 15000 }).should('include', '/cart');

            // CART GUARD: Wait until the Laptops product is actually rendered in the cart list
            cy.contains(/Laptops|Laptop/i, { timeout: 15000 }).should('be.visible');

            // 🛒 2e. Proceed to Checkout
            cy.get('body').then(($body) => {
                const checkoutSelectors = [
                    '[data-cy="checkout-button"]',
                    'button[name="checkout"]',
                    'input[name="checkout"]',
                    '#checkout',
                    '.cart__checkout-button',
                    'form[action="/cart"] button[type="submit"]'
                ];
                
                let clicked = false;
                for (const selector of checkoutSelectors) {
                    if ($body.find(selector + ':visible').length > 0) {
                        cy.get(selector).filter(':visible').first().click({ force: true });
                        clicked = true;
                        break;
                    }
                }

                if (!clicked) {
                    cy.contains('button:visible, a:visible, :visible', /Checkout|Check out|Proceed/i, { timeout: 15000 })
                      .first()
                      .click({ force: true });
                }
            });
        });

        // --- 3. CHECKOUT FLOW ---
        CheckoutPage.stabilizeCheckout();
        CheckoutPage.applyDiscount(discountCode);
        CheckoutPage.removeDiscount();
        CheckoutPage.verifyPriceReverted();
        
        cy.log('✅ TEST PASSED: Setup, purchase journey, and coupon flows verified!');
    });
});