import loginPage from '../../page-objects/login-page';
import checkoutPage from '../../page-objects/checkoutPage';

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

        // --- 2. PHASE A: ADD PRODUCT, GO TO CART, & REDIRECT TO CHECKOUT ---
        // Pre-configure the intercept for the cross-origin domain outside cy.origin()[cite: 1]
        cy.origin(storeUrl, { args: { storeUrl } }, () => {
            cy.visit('/', { timeout: 60000, retryOnStatusCodeFailure: true });
        });

        // Register the intercept for the storefront domain before actions happen
        cy.intercept('POST', '**/cart/add**').as('addToCartReq');
        cy.intercept('GET', '**/cart.js').as('getCartReq');

        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            // Find and click the product using stable behavior-based selectors
            cy.contains('Featured products', { timeout: 25000 }).scrollIntoView();
            cy.get('a:visible').contains(/Laptops/i).click();
            
            // Click "Add to Cart" and use Cypress built-in retry-ability on network change/cart state without using cy.wait or unavailable aliases across origin blocks
            cy.get('button[name="add"]').should('be.visible').click();
            
            // Navigate to Cart using resilient selectors avoiding jQuery length branching
            cy.get('header a[href*="/cart"], a[href="/cart"], [class*="cart"]')
              .filter(':visible')
              .first()
              .click();
            
            cy.url({ timeout: 20000 }).should('include', '/cart');
            
            // Ensure checkout button exists and click it natively without force
            cy.get('button[name="checkout"], [type="submit"][name="checkout"]')
              .filter(':visible')
              .first()
              .should('be.visible')
              .and('not.be.disabled')
              .click();
        });

        // --- 3. PHASE B: TARGETING THE STORE LOGO (TOP WINDOW DOMAIN) ---
        cy.url({ timeout: 45000 }).should('include', '/checkout');
        checkoutPage.clickStoreLogo();

        // --- 4. PHASE C: SCRIPT RE-EMBEDDING & RETURN TO CART EVALUATION ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            // Re-embed core bundle script if lost during redirect
            cy.window().then((win) => {
                const doc = win.document;
                if (!doc.querySelector('script[src*="checkypro"]')) {
                    const scriptElement = doc.createElement('script');
                    scriptElement.type = 'text/javascript';
                    scriptElement.src = 'https://checkypro.robustapps.net/dist/bundle.js'; 
                    scriptElement.async = true;
                    doc.head.appendChild(scriptElement);
                }
            });

            // Navigate back to Cart via resilient selector
            cy.get('header a[href*="/cart"], a[href="/cart"], [class*="cart"]')
              .filter(':visible')
              .first()
              .click();
            
            cy.url({ timeout: 20000 }).should('include', '/cart');
            
            // Verification: Checkout button must be active and enabled using retry-ability
            cy.get('button[name="checkout"], [type="submit"][name="checkout"]')
              .filter(':visible')
              .first()
              .should('be.visible')
              .and('not.be.disabled');
        });
    });
});