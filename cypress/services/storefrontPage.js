import loginPage from '../../page-objects/login-page';
import storefrontPage from '../../page-objects/storefrontPage';
import checkoutPage from '../../page-objects/checkoutPage'; // Already imported here!

Cypress.on('uncaught:exception', (err) => {
    const ignoredErrors = ['secretKeyVerified is not defined', 'registerTool', 'permissions policy'];
    return !ignoredErrors.some(msg => err.message.includes(msg));
});

describe('Checky Pro - CORE-REDIRECT-026 – Checkout Button Stays Active After Returning to Cart', () => {

    it('Should verify the checkout button remains enabled and interactive after navigating back from checkout via Store Logo', () => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');
        const adminUrl = Cypress.config('baseUrl');

        if (!email || !password || !storeUrl) throw new Error('Missing configuration setup.');

        // --- 1. PRE-CONDITION: DASHBOARD LOGIN ---
        loginPage.login(email, password, adminUrl);
        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        cy.clearCookies();
        cy.window().then((win) => { win.sessionStorage.clear(); win.localStorage.clear(); });

        // --- 2. PHASE A: STOREFRONT CARGO LOAD & CHECKOUT REDIRECT ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);
            const sf = Cypress.require('../../page-objects/storefrontPage').default;

            cy.visit('/', { timeout: 60000, retryOnStatusCodeFailure: true });
            sf.addProductToCart(/Laptops/i);
            sf.goToCartPage();
            
            cy.get('button[name="checkout"]:visible').should('be.visible').should('not.be.disabled');
            sf.goToCheckout();
        });

        // --- 3. PHASE B: TARGETING THE STORE LOGO (TOP WINDOW DOMAIN) ---
        cy.url({ timeout: 45000 }).should('include', '/checkout');
        
        // FIX: Removed the buggy inline require() and called the top-level import directly
        checkoutPage.clickStoreLogo();

        // --- 4. PHASE C: RETURN TO CART VIA HOME & EVALUATE ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            Cypress.on('uncaught:exception', () => false);
            const sf = Cypress.require('../../page-objects/storefrontPage').default;
            
            sf.goToCartPage();
            cy.url({ timeout: 20000 }).should('include', '/cart');
            
            cy.get('body').then(($body) => {
                const $button = $body.find('button[name="checkout"]:visible');
                
                if ($button.length > 0 && !$button.prop('disabled') && !$button.hasClass('disabled')) {
                    cy.log('✅ TEST PASSED: Cart page opened and Checkout button remains active and executable.');
                    cy.wrap($button).should('not.be.disabled');
                } else {
                    throw new Error('❌ TEST FAILED: Checkout button became non-interactive or missing upon opening the cart view.');
                }
            });
        });
    });
});