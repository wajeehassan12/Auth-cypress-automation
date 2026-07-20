// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('registerTool') || err.message.includes('permissions policy')) {
        return false;
    }
    return true;
});

/**
 * Parses a numeric string that may use EITHER locale convention:
 * - EU style:   "45.076,98"  (. = thousands, , = decimal)
 * - US style:   "45,076.97"  (, = thousands, . = decimal)
 * This matters because on this store the cart page renders EU-style
 * numbers while the checkout page renders US-style numbers — blindly
 * stripping commas (or dots) breaks one of the two formats.
 *
 * Rule: if both separators are present, whichever one appears LAST is
 * the decimal separator (the other is thousands grouping). If only one
 * separator type is present, treat it as decimal only when exactly two
 * digits follow it (e.g. "98,50" -> decimal; "12,345" -> thousands).
 */
function parseLocaleNumber(raw) {
    if (!raw) return NaN;
    let str = String(raw).trim();

    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');

    if (lastComma !== -1 && lastDot !== -1) {
        if (lastComma > lastDot) {
            // EU style: dots are thousands separators, comma is decimal
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            // US style: commas are thousands separators, dot is decimal
            str = str.replace(/,/g, '');
        }
    } else if (lastComma !== -1) {
        const decimals = str.length - lastComma - 1;
        str = decimals === 2
            ? str.replace(',', '.')       // decimal comma, e.g. "98,50"
            : str.replace(/,/g, '');      // thousands comma, e.g. "12,345"
    } else if (lastDot !== -1) {
        const decimals = str.length - lastDot - 1;
        str = decimals === 2
            ? str                          // already decimal dot, e.g. "98.50"
            : str.replace(/\./g, '');      // thousands dot, e.g. "12.345"
    }

    return parseFloat(str);
}

describe('Checky Pro - Check-out-page Automation & Product Flow Verification', () => {

    it('Should login, re-embed script, add multiple featured products, and verify the cart estimated total matches the checkout total amount', () => {

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

                    // 2. Safely capture the current estimated price balance string.
                    const $cartClone = $cartContainer.clone();
                    $cartClone.find('script, style, noscript, template').remove();
                    const fullText = $cartClone.text().replace(/\s+/g, ' ');

                    let estimatedTotal = '';
                    const totalMatch = fullText.match(/\bEstimated total\b[^0-9]{0,30}([\d][\d,.]*\d|\d)/i);
                    if (totalMatch) {
                        estimatedTotal = totalMatch[1];
                    } else {
                        const allPrices = fullText.match(/(?:[€$£]|Rs\.?|PKR|USD|EUR|GBP)\s*([\d][\d,.]*\d|\d)/gi) || [];
                        if (allPrices.length) {
                            const lastPrice = allPrices[allPrices.length - 1].match(/([\d][\d,.]*\d|\d)/);
                            estimatedTotal = lastPrice ? lastPrice[1] : '';
                        }
                    }

                    cy.log(`Cart estimated total (raw): ${estimatedTotal}`);

                    const capturedData = {
                        itemCount: String(totalItemCount),
                        totalPrice: estimatedTotal
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
                    expect(getVisibleText($body)).to.include(cartData.itemCount);
                }
            });

            // Reads only visible, rendered text — strips metadata tags out first.
            function getVisibleText($el) {
                const $clone = $el.clone();
                $clone.find('script, style, noscript, template').remove();
                return $clone.text().replace(/\s+/g, ' ');
            }

            // Target explicit currency notation before dynamic digit chains (positive amounts for final summary total)
            const TOTAL_AMOUNT_RE = /(?:[€$£]|Rs\.?|PKR|USD|EUR|GBP)\s*([\d][\d,.]*\d|\d)/i;

            // Walks up from elements declaring the 'Total' key to gather context from the structural row unit wrapper
            function findCheckoutTotal($body) {
                let result = null;
                $body.find('*').each(function () {
                    if (result) return false;
                    const $el = Cypress.$(this);
                    
                    const ownText = $el.clone().children().remove().end().text().trim();
                    // Match "Total" or "Total due" but reject large parent wrapper sentences
                    if ((!/^total$/i.test(ownText) && !/\bTotal\b/i.test(ownText)) || ownText.length > 40) return;

                    let $row = $el;
                    for (let depth = 0; depth < 6 && $row.length; depth++) {
                        const rowText = getVisibleText($row);
                        const amountMatch = rowText.match(TOTAL_AMOUNT_RE);
                        if (amountMatch) {
                            result = { rowText, amount: amountMatch[1] };
                            return false;
                        }
                        $row = $row.parent();
                    }
                });
                return result;
            }

            // --- ESTIMATED TOTAL (cart) vs FINAL TOTAL (checkout) VERIFICATION ---
            if (cartData.totalPrice) {
                // Ensure hidden checkout side-drawers are active under reactive breakpoints
                cy.get('body').then(($body) => {
                    const $toggle = $body.find(
                        'button:contains("Show order summary"), [class*="summary-toggle"], [aria-expanded="false"][class*="summary"]'
                    ).filter(':visible');
                    if ($toggle.length) {
                        cy.wrap($toggle.first()).click({ force: true });
                    }
                });

                cy.get('body', { timeout: 15000 }).should(($body) => {
                    const found = findCheckoutTotal($body);

                    const pageText = getVisibleText($body);
                    // Match generic fallback strings tracking adjacent monetary items following label boundaries
                    const wholePageMatch = !found && pageText.match(/\bTotal\b[\s\S]{0,100}?(?:[€$£]|Rs\.?|PKR|USD|EUR|GBP)\s*([\d][\d,.]*\d|\d)/i);

                    const rawCheckoutTotal = found
                        ? found.amount
                        : (wholePageMatch ? wholePageMatch[1] : null);

                    if (!rawCheckoutTotal) {
                        expect.fail(`Checkout final "Total" amount should be present. First 400 chars of page text: "${pageText.slice(0, 400)}"`);
                    }

                    // Process contextual numbering models natively via internal helper architecture 
                    const checkoutFinalTotal = parseLocaleNumber(rawCheckoutTotal);
                    const cartEstimatedTotal = parseLocaleNumber(cartData.totalPrice);

                    Cypress.log({ name: 'cart-total', message: `Cart estimated total (parsed): ${cartEstimatedTotal}` });
                    Cypress.log({ name: 'checkout-total', message: `Checkout final total (parsed): ${checkoutFinalTotal}` });
                    if (found) {
                        Cypress.log({ name: 'matched-row', message: `Matched total row text: "${found.rowText}"` });
                    }

                    expect(checkoutFinalTotal).to.equal(cartEstimatedTotal);
                });
            }
        });
    });
});