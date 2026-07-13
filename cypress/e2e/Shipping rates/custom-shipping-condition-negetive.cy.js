// Global Handler: Catch and ignore the application's broken 'secretKeyVerified' code error
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('secretKeyVerified is not defined')) {
        return false; 
    }
    return true; 
});

describe('Checky Pro - Shipping Rate Creation & Storefront 2-Item Negative Validation', () => {

    it('Should create a 3-4 item shipping rule, add 2 items, and pass if the rule is hidden at checkout', () => {
        
        // --- 0. ENVIRONMENT SETUP ---
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');

        if (!email || !password || !storeUrl) {
            throw new Error('Missing environment or storeUrl configuration parameters.');
        }

        const customShippingName = 'internal negative';

        const PRODUCTS_TO_ADD = [
            { match: /Laptops/i },
            { match: /Cable Knit Sweater/i }
        ];

        // Setup Network Intercepts
        cy.intercept('GET', '**/store*').as('reEmbedRequest');

        // --- 1. DASHBOARD LOGIN & SCRIPT RE-EMBED ---
        cy.log('Step 1: Authenticating into admin panel...');
        cy.visit('/login');
        cy.contains('Welcome back! Login to Checky Pro', { timeout: 20000 }).should('be.visible');
        
        cy.get('input[type="email"]').should('be.visible').type(email);
        cy.get('input[type="password"]').should('be.visible').type(password, { log: false });
        cy.contains('button', 'Log in').should('be.visible').click();

        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        // Perform required re-embed action sequence
        cy.contains('Settings', { timeout: 15000 }).should('be.visible').click();
        cy.contains('Checky Pro Script', { timeout: 15000 }).should('be.visible').click();
        cy.contains('button', 'Re-embed script').should('be.visible').click();
        cy.wait('@reEmbedRequest', { timeout: 30000 }).its('response.statusCode').should('eq', 200);

        // --- 2. SHIPPING RATES CONFIGURATION ---
        cy.log('Step 2: Navigating to Shipping Rates page...');
        cy.contains('a, div, span', 'Shipping Rates', { timeout: 15000 })
            .should('be.visible')
            .click();

        cy.url({ timeout: 15000 }).should('include', '/shipping-rates');

        cy.log('Clicking on Create shipping rate...');
        cy.contains('button', 'Create shipping rate', { timeout: 15000 })
            .should('be.visible')
            .click();

        cy.url({ timeout: 15000 }).should('include', '/shipping-rates/create');

        cy.log(`Filling out Shipping Rate Form General Information using name: ${customShippingName}`);
        cy.get('input[placeholder="Same day shipping"]').type(customShippingName);
        cy.get('input[placeholder="Shipping rate #1"]').type('internal'); 
        cy.get('input[placeholder="Delivery in 7-8 days"]').type('3-9');

        cy.log('Setting up Cart Items conditions (Targeting 3 to 4 items)...');
        cy.contains('div, button, span', 'Cart Items')
            .should('be.visible')
            .click();
        
        cy.contains('div, label, span', 'Minimum quantity')
            .parent()
            .find('input')
            .first()
            .clear()
            .type('3');

        cy.contains('div, label, span', 'Maximum quantity')
            .parent()
            .find('input')
            .last()
            .clear()
            .type('4');

        cy.log('Configuring Shipping Price...');
        cy.get('input[placeholder="0.00"]').clear().type('10');

        cy.log('Saving the newly created shipping rate...');
        cy.contains('button', 'Save').should('be.visible').click();
        cy.url({ timeout: 20000 }).should('include', '/shipping-rates');
        
        // --- 3. CLEAR CACHE & WORKERS BEFORE CROSS-ORIGIN BRIDGE ---
        cy.log('Clearing local caches before cross-origin transition...');
        cy.window().then((win) => {
            win.sessionStorage.clear();
            win.localStorage.clear();
        });
        cy.clearCookies();

        // --- 4. SHOPIFY STOREFRONT ORIGIN FLOW (ADD exactly 2 ITEMS) ---
        cy.log('Step 4: Opening Shopify storefront origin to add 2 products...');
        cy.origin(storeUrl, { args: { storeUrl, PRODUCTS_TO_ADD } }, ({ storeUrl, PRODUCTS_TO_ADD }) => {
            Cypress.on('uncaught:exception', () => false);

            if (window.navigator && window.navigator.serviceWorker) {
                window.navigator.serviceWorker.getRegistrations().then((regs) => {
                    for (let reg of regs) reg.unregister();
                });
            }

            // Loop to add exactly 2 products
            PRODUCTS_TO_ADD.forEach((product, index) => {
                cy.visit('/', { timeout: 60000, retryOnStatusCodeFailure: true });
                cy.contains('Featured products', { timeout: 25000 }).should('be.visible').scrollIntoView();
                cy.get('a:visible', { timeout: 15000 }).contains(product.match).first().click();
                cy.get('button[name="add"]').should('be.visible').click();
                cy.contains(/Added to your cart|View cart/i, { timeout: 15000 }).should('be.visible');

                if (index < PRODUCTS_TO_ADD.length - 1) {
                    cy.get('body').then(($body) => {
                        if ($body.find('[aria-label="Close"]:visible').length) {
                            cy.get('[aria-label="Close"]:visible').first().click();
                        }
                    });
                }
            });
            
            // Navigate to Cart and check out
            cy.visit('/cart', { timeout: 30000 });
            cy.url().should('include', '/cart');
            cy.get('button[name="checkout"]:visible').should('be.visible').click();
        });

        // --- 5. CHECKOUT VERIFICATION ---
        cy.log('Step 5: Verifying arrival at checkout...');
        cy.url({ timeout: 45000 }).should('include', '/checkout');
        cy.contains('Contact', { timeout: 20000 }).should('be.visible');

        // Confirm 2 items exist in checkout
        cy.get('body').then(($body) => {
            const textContent = $body.text();
            expect(textContent).to.match(/Laptops/i);
            expect(textContent).to.match(/Cable Knit Sweater/i);
        });

        // --- 6. TARGETING AND VERIFYING ABSENCE OF NEGATIVE SHIPPING METHOD ---
        cy.log('Step 6: Locating Shipping method section and validating exclusion rules...');
        
        cy.contains('div, h2, h3, span', /Shipping method/i, { timeout: 15000 })
            .should('be.visible')
            .scrollIntoView();

        // Target the area inside the Shipping Method context layout
        cy.contains('div, h2, h3, span', /Shipping method/i)
            .parent()
            .within(() => {
                // Assert that the 'internal negative' shipping method DOES NOT display (Fail if visible, Pass if missing)
                cy.contains('div, span, label, p', new RegExp(customShippingName, 'i'))
                    .should('not.exist');
            });
            
        cy.log('✅ TEST PASSED: The conditional shipping method "internal negative" correctly remained hidden.');
    });
});