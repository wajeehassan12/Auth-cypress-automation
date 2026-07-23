import loginPage from '../../page-objects/login-page';
import settingsPage from '../../page-objects/settingsPage';
import storefrontPage from '../../page-objects/storefrontPage';
import checkoutPage from '../../page-objects/checkoutPage';

describe('Checky Pro - Shipping Rate Cart Value Positive Validation (Single Item, Qty 1)', () => {

    it('Should create a unique rule from fixtures, add 1 laptop item, and verify the shipping rate displays at checkout', () => {
        // --- 0. CONFIGURATION & INTERCEPTS ---
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');
        const adminUrl = Cypress.config('baseUrl');
        const uniqueName = `pos-rate-${Date.now()}`;

        if (!email || !password || !storeUrl) {
            throw new Error('Missing configuration setup.');
        }

        cy.intercept('GET', '**/store*').as('reEmbedRequest');

        // Load test data from fixtures
        cy.fixture('shippingRule.json').then((ruleData) => {
            const minVal = ruleData.min || '100';
            const maxVal = ruleData.max || '200';
            const ratePrice = ruleData.price || '10';

            // --- 1. DASHBOARD AUTH & RE-EMBED ---
            loginPage.login(email, password, adminUrl);
            cy.url({ timeout: 30000 }).should('include', '/dashboard');

            settingsPage.navigateToScriptSettings();
            settingsPage.reEmbedScript();
            cy.wait('@reEmbedRequest', { timeout: 30000 });

            // --- 2. SHIPPING RULES ENGINE CONFIGURATION ---
            settingsPage.navigateToShippingRates();
            settingsPage.createShippingRate({ 
                name: uniqueName, 
                min: minVal, 
                max: maxVal, 
                price: ratePrice 
            });
            cy.url({ timeout: 20000 }).should('include', '/shipping-rates');

            // --- 3. STOREFRONT PIPELINE - ADD 1 LAPTOP & PROCEED TO CHECKOUT ---
            cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
                const storefrontMod = Cypress.require('../../page-objects/storefrontPage');
                const sf = storefrontMod.default || storefrontMod;

                sf.visitAndClean(storeUrl);
                sf.addLaptopToCart();
                sf.proceedToCheckout();
            });

            // --- 4. CHECKOUT STABILIZATION & CONDITION VERIFICATION ---
            checkoutPage.stabilizeCheckout();

            cy.get('body').then(($body) => {
                const totalMatch = $body.text().match(/Total\s+EUR\s+€?(\d+\.\d+)/i);
                if (totalMatch) {
                    const checkoutTotal = parseFloat(totalMatch[1]);
                    expect(checkoutTotal).to.be.greaterThan(Number(minVal));
                    expect(checkoutTotal).to.be.lessThan(Number(maxVal));
                }
            });

            // --- 5. CONDITIONAL SHIP-RATE VERIFICATION ---
            cy.contains('div, h2, h3, span', /Shipping method/i, { timeout: 15000 })
                .should('be.visible')
                .scrollIntoView();

            cy.contains('div, h2, h3, span', /Shipping method/i)
                .parent()
                .within(() => {
                    cy.contains('div, span, label, p', new RegExp(uniqueName, 'i'), { timeout: 15000 })
                        .should('be.visible');
                        
                    cy.contains('div, span, label, p', new RegExp(ratePrice, 'i'), { timeout: 15000 })
                        .should('be.visible');
                });
        });
    });
});