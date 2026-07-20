// Global Exception Handler to catch leaky client-side exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
    if (err.message.includes('registerTool') || err.message.includes('permissions policy')) {
        return false;
    }
    return true;
});

/**
 * Parses a numeric string that may use EITHER locale convention:
 * - EU style:   "36.061,58"  (. = thousands, , = decimal)
 * - US style:   "36,061.58"  (, = thousands, . = decimal)
 */
function parseLocaleNumber(raw) {
    if (!raw) return NaN;
    let str = String(raw).trim();

    // Strip away minus signs, currency symbols, words, or parentheses to isolate just digits and separators
    str = str.replace(/[^0-9.,]/g, '');

    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');

    if (lastComma !== -1 && lastDot !== -1) {
        if (lastComma > lastDot) {
            // EU style
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            // US style
            str = str.replace(/,/g, '');
        }
    } else if (lastComma !== -1) {
        const decimals = str.length - lastComma - 1;
        str = decimals === 2 ? str.replace(',', '.') : str.replace(/,/g, '');
    } else if (lastDot !== -1) {
        const decimals = str.length - lastDot - 1;
        str = decimals === 2 ? str : str.replace(/\./g, '');
    }

    return parseFloat(str);
}

describe('Checky Pro - Check-out-page Automation & Discount Flow Verification', () => {

    it('Should login, re-embed script, add products, and verify the cart discount tag matches the checkout order discount', () => {

        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');

        if (!email || !password || !storeUrl) {
            throw new Error('Missing configuration parameters in environment options.');
        }

        const PRODUCTS_TO_ADD = [
            { match: /Laptops/i },
            { match: /Cable Knit Sweater/i }
        ];

        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        // --- 1. DASHBOARD LOGIN ---
        cy.visit('/login');
        cy.contains('Welcome back! Login to Checky Pro', { timeout: 20000 }).should('be.visible');
        cy.get('input[type="email"]:visible').clear().type(email);
        cy.get('input[type="password"]:visible').clear().type(password, { log: false });
        cy.get('button').contains(/Log in/i).click();
        cy.url({ timeout: 30000 }).should('include', '/dashboard');

        // --- 2. SETTINGS & RE-EMBED ---
        cy.contains('Settings', { timeout: 15000 }).click();
        cy.contains('Checky Pro Script', { timeout: 15000 }).click();
        cy.get('button').contains(/Re-embed script/i).click();
        cy.wait('@reEmbedRequest', { timeout: 30000 });

        // --- 3. STOREFRONT ORIGIN FLOW ---
        cy.origin(storeUrl, { args: { storeUrl, PRODUCTS_TO_ADD } }, ({ storeUrl, PRODUCTS_TO_ADD }) => {

            Cypress.on('uncaught:exception', (err) => {
                if (err.message.includes('registerTool') || err.message.includes('permissions policy')) {
                    return false;
                }
                return true;
            });

            PRODUCTS_TO_ADD.forEach((product, index) => {
                cy.visit('/', { timeout: 60000, retryOnStatusCodeFailure: true });
                cy.contains('Featured products', { timeout: 20000 }).scrollIntoView();
                cy.get('a:visible', { timeout: 15000 }).contains(product.match).first().click();
                cy.get('button[name="add"]').click();
                cy.contains(/Added to your cart|View cart/i, { timeout: 15000 }).should('be.visible');

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

            // --- CAPTURE CART DISCOUNT VALUE ---
            return cy.get('form[action="/cart"], .cart__footer, main, body')
                .first()
                .should('be.visible')
                .then(($cartContainer) => {
                    let totalItemCount = PRODUCTS_TO_ADD.length;

                    const $cartClone = $cartContainer.clone();
                    $cartClone.find('script, style, noscript, template').remove();
                    const fullText = $cartClone.text().replace(/\s+/g, ' ');

                    // Match just the numerical part inside the discount tag window
                    let capturedDiscount = '';
                    const cartDiscountMatch = fullText.match(/(?:Automation test|\bdiscount\b)[^\d-]*-\s*(?:[€$£]|Rs\.?|PKR|USD|EUR|GBP)?\s*([\d][\d,.]*\d|\d)/i);
                    
                    if (cartDiscountMatch) {
                        capturedDiscount = cartDiscountMatch[1]; // Index 1 grabs ONLY the isolated digits/dots/commas
                    } else {
                        const broadNegativeMatch = fullText.match(/-\s*(?:[€$£]|Rs\.?|PKR|USD|EUR|GBP)\s*([\d][\d,.]*\d|\d)/i);
                        if (broadNegativeMatch) capturedDiscount = broadNegativeMatch[1];
                    }

                    cy.log(`Captured Cart Discount (raw numerical context): ${capturedDiscount}`);

                    const capturedData = {
                        itemCount: String(totalItemCount),
                        cartDiscount: capturedDiscount
                    };

                    cy.get('button[name="checkout"]:visible').click();
                    return cy.wrap(capturedData);
                });
        }).then((cartData) => {
            cy.url({ timeout: 45000 }).should('include', '/checkout');
            cy.contains('Contact', { timeout: 20000 }).should('be.visible');

            function getVisibleText($el) {
                const $clone = $el.clone();
                $clone.find('script, style, noscript, template').remove();
                return $clone.text().replace(/\s+/g, ' ');
            }

            const DISCOUNT_AMOUNT_RE = /-\s*(?:[€$£]|Rs\.?|PKR|USD|EUR|GBP)\s*([\d][\d,.]*\d|\d)/i;

            function findCheckoutDiscount($body) {
                let result = null;
                $body.find('*').each(function () {
                    if (result) return false;
                    const $el = Cypress.$(this);
                    
                    const ownText = $el.clone().children().remove().end().text().trim();
                    if (!/\bdiscount\b/i.test(ownText) || ownText.length > 60) return;

                    let $row = $el;
                    for (let depth = 0; depth < 6 && $row.length; depth++) {
                        const rowText = getVisibleText($row);
                        const amountMatch = rowText.match(DISCOUNT_AMOUNT_RE);
                        if (amountMatch) {
                            result = { rowText, amount: amountMatch[1] }; // Index 1 isolates the pure digit string
                            return false;
                        }
                        $row = $row.parent();
                    }
                });
                return result;
            }

            // --- VERIFY DISCOUNT VALUE MATCHES ---
            if (cartData.cartDiscount) {
                cy.get('body').then(($body) => {
                    const $toggle = $body.find(
                        'button:contains("Show order summary"), [class*="summary-toggle"], [aria-expanded="false"][class*="summary"]'
                    ).filter(':visible');
                    if ($toggle.length) {
                        cy.wrap($toggle.first()).click({ force: true });
                    }
                });

                cy.get('body', { timeout: 15000 }).should(($body) => {
                    const found = findCheckoutDiscount($body);

                    const pageText = getVisibleText($body);
                    const wholePageMatch = !found && pageText.match(/\bdiscount\b[\s\S]{0,100}?(-\s*(?:[€$£]|Rs\.?|PKR|USD|EUR|GBP)\s*([\d][\d,.]*\d|\d))/i);

                    const rawCheckoutDiscount = found
                        ? found.amount
                        : (wholePageMatch ? wholePageMatch[2] : null);

                    if (!rawCheckoutDiscount) {
                        expect.fail(`Checkout "Order discount" breakdown string could not be found.`);
                    }

                    const parsedCartDiscount = parseLocaleNumber(cartData.cartDiscount);
                    const parsedCheckoutDiscount = parseLocaleNumber(rawCheckoutDiscount);

                    Cypress.log({ name: 'cart-discount', message: `Cart discount amount (parsed): ${parsedCartDiscount}` });
                    Cypress.log({ name: 'checkout-discount', message: `Checkout discount amount (parsed): ${parsedCheckoutDiscount}` });

                    expect(parsedCheckoutDiscount).to.equal(parsedCartDiscount);
                });
            }
        });
    });
});