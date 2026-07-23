import LoginPage from '../../services/login-page'; 
import SettingsPage from '../../page-objects/settingsPage';
import CheckoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - End-to-End Re-embed, Cart Journey & Discount Flow', () => {
    const storeUrl = Cypress.env('STORE_URL');

    beforeEach(() => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const adminUrl = Cypress.config('baseUrl'); 

        if (!email || !password) {
            throw new Error('❌ Missing LOGIN_EMAIL or LOGIN_PASSWORD in cypress.env.json!');
        }

        LoginPage.login(email, password, adminUrl);
    });

    it('Should successfully complete the dashboard setup, cross-origin shopping, and discount application', () => {
        const discountCode = Cypress.env('DISCOUNT_CODE');

        // --- 1. SETTINGS & SCRIPT RE-EMBED ---
        SettingsPage.navigateToSettings();
        SettingsPage.navigateToScriptSettings();
        SettingsPage.reEmbedScript(); // Intercept, click, and alias validation handled cleanly in POM
        SettingsPage.clearStorageAndCookies();

        // --- 2. OPEN SHOPIFY STOREFRONT (Cross-Origin Setup) ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            cy.visit(storeUrl);

            // Clean service workers asynchronously
            cy.window().then((win) => {
                if (win.navigator?.serviceWorker) {
                    return win.navigator.serviceWorker.getRegistrations().then(regs => 
                        Promise.all(regs.map(r => r.unregister()))
                    );
                }
            });

            // ADD TO CART - Built-in retry-ability on resilient selectors (Part 1, Rule 1 & Part 2, Rule 5)
            cy.get('[data-cy="featured-products-heading"], h2', { timeout: 25000 })
                .filter(':visible')
                .first()
                .should('be.visible')
                .scrollIntoView();

            cy.get('[data-cy="category-link-laptops"], a[href*="laptop"]')
                .filter(':visible')
                .first()
                .should('be.visible')
                .click();

            cy.get('[data-cy="add-to-cart-button"], button[name="add"]')
                .filter(':visible')
                .first()
                .should('be.visible')
                .click();

            // PROCEED TO CHECKOUT - Assertion retries instead of cy.wait(ms) (Part 1, Rule 2 & Part 2, Rule 9)
            cy.get('[data-cy="view-cart-button"], a[href*="/cart"]')
                .filter(':visible')
                .first()
                .should('be.visible')
                .click();
            
            cy.url().should('include', '/cart');
            
            cy.get('[data-cy="checkout-button"], button[name="checkout"], input[name="checkout"]')
                .filter(':visible')
                .first()
                .should('be.visible')
                .and('not.be.disabled')
                .click();
        });

        // --- 3. CHECKOUT FLOW ---
        CheckoutPage.stabilizeCheckout();
        CheckoutPage.applyDiscount(discountCode);
        CheckoutPage.removeDiscount();
        CheckoutPage.verifyPriceReverted();
        
        cy.log('✅ TEST PASSED: Setup, purchase journey, and coupon flows verified!');
    });
});