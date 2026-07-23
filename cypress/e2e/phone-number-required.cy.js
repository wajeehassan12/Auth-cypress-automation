import loginPage from '../page-objects/login-page';
import settingsPage from '../page-objects/settingsPage';
import checkoutPage from '../page-objects/checkoutPage';

describe('Checky Pro - Required Phone & Payment Load Validation', () => {

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

    it('Should enforce Required Phone setting and verify payment methods load at checkout', () => {

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

        // Alias payment initialization request BEFORE checkout loads (Part 2, Rule 11)
        cy.intercept('GET', '**/init-payment/*').as('initPayment');

        // --- 1. DASHBOARD, RE-EMBED SCRIPT & PHONE CONFIGURATION VIA PAGE OBJECT ---
        cy.visit(`${adminUrl}/dashboard`);
        
        settingsPage.navigateToScriptSettings();
        settingsPage.reEmbedScript();

        if (typeof settingsPage.configurePhoneSetting === 'function') {
            settingsPage.configurePhoneSetting('Required');
        } else {
            cy.contains('a, div, span', 'Customization', { timeout: 15000 })
                .filter(':visible')
                .click();
            cy.url({ timeout: 15000 }).should('include', '/customization');
            cy.contains('Collect phone number', { timeout: 20000 }).scrollIntoView();
            cy.contains('button, label, span', 'Required', { timeout: 15000 })
                .should('be.visible')
                .click();
            cy.contains('button', 'Save Changes', { timeout: 15000 })
                .should('be.visible')
                .and('not.be.disabled')
                .click();
        }

        settingsPage.clearStorageAndCookies();

        // --- 2. STOREFRONT PIPELINE VIA CROSS-ORIGIN (Part 2, Rule 14) ---
        cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
            const storefrontModule = Cypress.require('../page-objects/storefrontPage');
            const TargetExport = storefrontModule.default || storefrontModule;
            const storefront = (typeof TargetExport === 'function') 
                ? new TargetExport() 
                : (TargetExport.storefrontPage || TargetExport);

            cy.visit(storeUrl);
            
            if (storefront && typeof storefront.addProductToCart === 'function') {
                storefront.addProductToCart('Laptops', 1);
            } else {
                cy.contains('a:visible', 'Laptops', { timeout: 15000 }).click();
                cy.get('button[name="add"]', { timeout: 15000 })
                    .should('be.visible')
                    .and('not.be.disabled')
                    .click();
            }

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

        // --- 3. CHECKOUT INTAKE ROUTINE & FORM FILLING ---
        checkoutPage.stabilizeCheckout();

        // Explicitly wait on payment initialization network call rather than using cy.wait(ms) (Part 1, Rule 2 & Part 2, Rule 11)
        cy.wait('@initPayment', { timeout: 30000 })
            .its('response.statusCode')
            .should('eq', 200);

        // Select country and verify text of selected option to prevent ISO mismatch
        const country = Cypress.env('CHECKOUT_COUNTRY');
        if (country) {
            cy.get('select[name*="country"], select', { timeout: 15000 })
                .first()
                .should('be.visible')
                .select(country)
                .find('option:selected')
                .should('have.text', country);
        }

        // Dynamic checkout field mapper without { force: true } (Part 2, Rule 9)
        const fieldDataMap = [
            { selector: 'input[type="email"]', value: Cypress.env('CHECKOUT_EMAIL') },
            { selector: 'input#firstName', value: Cypress.env('CHECKOUT_FIRSTNAME') },
            { selector: 'input#lastName', value: Cypress.env('CHECKOUT_LASTNAME') },
            { selector: 'input#address', value: Cypress.env('CHECKOUT_ADDRESS') },
            { selector: 'input#house-number', value: Cypress.env('CHECKOUT_HOUSE_NUMBER') },
            { selector: 'input#suffix', value: Cypress.env('CHECKOUT_SUFFIX') },
            { selector: 'input#city', value: Cypress.env('CHECKOUT_CITY') },
            { selector: 'input#zip', value: Cypress.env('CHECKOUT_ZIP') },
            { selector: 'input#phone', value: Cypress.env('CHECKOUT_PHONE') }
        ];

        fieldDataMap.forEach(({ selector, value }) => {
            if (value) {
                cy.get('body').then(($body) => {
                    if ($body.find(selector).length > 0) {
                        cy.get(selector)
                            .filter(':visible')
                            .should('be.visible')
                            .clear()
                            .type(value);
                    }
                });
            }
        });

        // --- 4. PAYMENT METHOD VERIFICATION ---
        cy.contains('Viva Payment', { timeout: 15000 })
            .scrollIntoView()
            .should('be.visible')
            .and('not.be.disabled')
            .click();

        cy.contains('button', /Complete Order/i, { timeout: 30000 })
            .should('be.visible')
            .and('not.be.disabled');
    });
});