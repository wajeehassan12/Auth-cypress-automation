// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('registerTool') || err.message.includes('permissions policy')) {
        return false;
    }
    return true;
});

describe('Checky Pro - Check-out-page Automation & Product Flow Verification', () => {

    it('Should login, re-embed script, add multiple featured products, and verify discounted totals match at checkout', () => {

        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');

        if (!email || !password || !storeUrl) {
            throw new Error('Missing configuration parameters in environment options.');
        }

        // Featured products to add to the cart
        const PRODUCTS_TO_ADD = [
            { match: /Laptops/i },
            { match: /Cable Knit Sweater/i },
            { match: /PlayStation.*Pro Console/i }
        ];

        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        // --- 1. DASHBOARD LOGIN ---
        cy.visit('/login');

        cy.contains('Welcome back! Login to Checky Pro', { timeout: 20000 })
            .should('be.visible');

        cy.get('input[type="email"]:visible').should('be.visible').clear().type(email);
        cy.get('input[type="password"]:visible').should('be.visible').clear().type(password, { log: false });

        cy.get('button')
            .contains(/Log in/i)
            .should('be.visible')
            .click();

        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        // --- 2. SETTINGS & RE-EMBED ---
        cy.contains('Settings', { timeout: 15000 }).should('be.visible').click();
        cy.url({ timeout: 15000 }).should('include', '/settings');

        cy.contains('Checky Pro Script', { timeout: 15000 }).should('be.visible').click();
        cy.url({ timeout: 15000 }).should('include', '/settings/checky-pro-script');

        cy.get('button')
            .contains(/Re-embed script/i)
            .should('be.visible')
            .click();

        cy.wait('@reEmbedRequest', { timeout: 30000 })
            .then((interception) => {
                expect(interception.response.statusCode).to.eq(200);
            });

        // --- 3. STOREFRONT ORIGIN FLOW ---
        cy.origin(storeUrl, { args: { storeUrl, PRODUCTS_TO_ADD } }, ({ storeUrl, PRODUCTS_TO_ADD }) => {

            Cypress.on('uncaught:exception', (err) => {
                if (err.message.includes('registerTool') || err.message.includes('permissions policy')) {
                    return false;
                }
                return true;
            });

            // --- ADD EACH FEATURED PRODUCT TO THE CART ---
            PRODUCTS_TO_ADD.forEach((product, index) => {
                cy.visit('/', {
                    timeout: 60000,
                    pageLoadTimeout: 60000,
                    retryOnStatusCodeFailure: true
                });

                cy.url({ timeout: 30000 }).should('include', 'checkyprostore');

                cy.contains('Featured products', { timeout: 20000 })
                    .should('be.visible')
                    .scrollIntoView();

                cy.get('a:visible', { timeout: 15000 })
                    .contains(product.match)
                    .first()
                    .click();

                cy.url({ timeout: 15000 }).should('include', '/products/');

                cy.get('button[name="add"]').should('be.visible').click();

                // Wait for the confirmation/drawer before moving on
                cy.contains(/Added to your cart|View cart/i, { timeout: 15000 }).should('be.visible');

                // Dismiss the cart drawer/notification to proceed with next selections
                if (index < PRODUCTS_TO_ADD.length - 1) {
                    cy.get('body').then(($body) => {
                        if ($body.find('[aria-label="Close"]:visible').length) {
                            cy.get('[aria-label="Close"]:visible').first().click();
                        }
                    });
                }
            });

            // --- GO TO CART ---
            cy.visit('/cart', { timeout: 30000 });
            cy.url().should('include', '/cart');

            // --- DATA CAPTURE ---
            return cy.get('form[action="/cart"], .cart__footer, main, body')
                .first()
                .should('be.visible')
                .then(($cartContainer) => {

                    // 1. Total item count evaluation
                    let totalItemCount = 0;
                    const $qtyInputs = $cartContainer.find('input[name="updates[]"], [class*="quantity"] input');
                    if ($qtyInputs.length) {
                        $qtyInputs.each((i, el) => {
                            const val = parseInt(Cypress.$(el).val(), 10);
                            if (!isNaN(val)) totalItemCount += val;
                        });
                    } else {
                        totalItemCount = PRODUCTS_TO_ADD.length;
                    }

                    // 2. Safely capture the current estimated price balance string
                    const fullText = $cartContainer.text().replace(/\s+/g, ' ');

                    let estimatedTotal = '';
                    const totalMatch = fullText.match(/\bEstimated total\b\s*[€$]\s*([\d,.]+)/i);
                    if (totalMatch) {
                        estimatedTotal = totalMatch[1];
                    } else {
                        const allPrices = fullText.match(/[€$]\s*([\d,.]+)/g) || [];
                        if (allPrices.length) {
                            estimatedTotal = allPrices[allPrices.length - 1].replace(/[^\d.,]/g, '');
                        }
                    }

                    let discountText = '';
                    const discountMatch = fullText.match(/([\w\s]+)\(-\s*[€$]\s*[\d,.]+\)/i);
                    if (discountMatch) {
                        discountText = discountMatch[0].trim();
                        cy.log(`Discount applied on cart: ${discountText}`);
                    }

                    const capturedData = {
                        itemCount: String(totalItemCount),
                        totalPrice: estimatedTotal,
                        discountText
                    };

                    cy.get('button[name="checkout"]:visible')
                        .should('be.visible')
                        .should('not.be.disabled')
                        .click();

                    return cy.wrap(capturedData);
                });
        }).then((cartData) => {
            cy.url({ timeout: 45000 }).should('include', '/checkout');
            cy.contains('Contact', { timeout: 20000 }).should('be.visible');
            cy.get('input[type="email"]', { timeout: 15000 }).should('be.visible');

            // --- ITEM COUNT VERIFICATION ---
            cy.get('body', { timeout: 15000 }).should(($body) => {
                const $qtyBadges = $body.find('.product-thumbnail__quantity, [class*="badge"], [class*="quantity"]');
                if ($qtyBadges.length > 0) {
                    let checkoutCount = 0;
                    $qtyBadges.each((i, el) => {
                        const val = parseInt(Cypress.$(el).text().replace(/\D/g, ''), 10);
                        if (!isNaN(val)) checkoutCount += val;
                    });
                    expect(String(checkoutCount)).to.equal(cartData.itemCount);
                } else {
                    expect($body.text()).to.include(cartData.itemCount);
                }
            });

            // --- TOTAL AMOUNT VERIFICATION ---
            if (cartData.totalPrice) {
                cy.get('body', { timeout: 15000 }).should(($body) => {
                    const pageText = $body.text().replace(/\s+/g, ' ');

                    // Dynamic regex safely bypasses intermediate characters like "EUR" and captures standard formatted numbers
                    const totalLineMatch =
                        pageText.match(/\bEstimated total\b(?:[\s\w]*)[€$]\s*([\d,.]+)/i) ||
                        pageText.match(/\bOrder total\b(?:[\s\w]*)[€$]\s*([\d,.]+)/i) ||
                        pageText.match(/(?<!Sub)\bTotal\b(?:[\s\w]*)[€$]\s*([\d,.]+)/i);

                    expect(totalLineMatch, 'checkout total should be present').to.not.be.null;

                    // Clean formatting commas away before completing assertion check
                    const checkoutTotal = parseFloat(totalLineMatch[1].replace(/,/g, ''));
                    const cartTotal = parseFloat(cartData.totalPrice.replace(/,/g, ''));

                    expect(checkoutTotal).to.equal(cartTotal);
                });
            }
        });
    });
});