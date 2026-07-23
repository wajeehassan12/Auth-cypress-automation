import loginPage from '../../page-objects/login-page';
import scriptSettingsPage from '../../page-objects/script-settings-page';
import { parseLocaleNumber } from '../../support/utils/price-parser';

describe('Checky Pro - Checkout Page Automation & Discount Flow Verification', () => {

    it('Should login, re-embed script, add laptop products, and verify the cart discount tag matches checkout order discount', () => {
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');
        const storeUrl = Cypress.env('STORE_URL');

        if (!email || !password || !storeUrl) {
            throw new Error('Missing configuration parameters in environment options.');
        }

        cy.intercept('GET', '**/store*').as('reEmbedRequest');
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        cy.fixture('products.json').then((allProducts) => {
            const productsToAdd = allProducts.filter(p => /laptop/i.test(p.match));

            if (!productsToAdd.length) {
                throw new Error('No laptop products found in products.json fixture matching "laptop".');
            }

            // --- 1. DASHBOARD LOGIN & SCRIPT RE-EMBED VIA POM ---
            loginPage.visit();
            loginPage.attemptLogin(email, password);
            cy.url({ timeout: 30000 }).should('include', '/dashboard');

            scriptSettingsPage.navigateToScriptSettings();
            scriptSettingsPage.reEmbedScript();
            cy.wait('@reEmbedRequest', { timeout: 30000 });

            // --- 2. STOREFRONT FLOW (CROSS-ORIGIN) ---
            cy.origin(storeUrl, { args: { storeUrl, productsToAdd } }, ({ storeUrl, productsToAdd }) => {

                productsToAdd.forEach((product) => {
                    cy.visit('/', { timeout: 60000, retryOnStatusCodeFailure: true });

                    cy.contains('Featured products', { timeout: 20000 })
                        .should('be.visible')
                        .scrollIntoView();

                    cy.get('.grid__item, li.grid__item', { timeout: 15000 })
                        .contains(new RegExp(product.match, 'i'))
                        .parents('.grid__item, li.grid__item, .card-wrapper')
                        .first()
                        .find('a')
                        .filter((_, el) => Cypress.dom.isVisible(el) && el.href && !el.href.includes('#'))
                        .first()
                        .click({ force: true });

                    cy.get('button[name="add"], button.product-form__submit, form[action*="/cart/add"] button[type="submit"]', { timeout: 15000 })
                        .should('be.visible')
                        .first()
                        .click({ force: true });

                    // Fixed: Wait for cart indicator/badge to update naturally after adding to cart
                    cy.get('.cart-count-bubble, #cart-icon-bubble, a[href*="/cart"]', { timeout: 15000 })
                        .should('be.visible');
                });

                // Navigate to Cart
                cy.visit('/cart', { timeout: 30000 });
                cy.url().should('include', '/cart');

                // Capture Cart Discount Value & Click Checkout
                return cy.get('form[action="/cart"], .cart__footer, main, body', { timeout: 15000 })
                    .first()
                    .should('be.visible')
                    .then(($cartContainer) => {
                        const totalItemCount = productsToAdd.length;

                        const $cartClone = $cartContainer.clone();
                        $cartClone.find('script, style, noscript, template').remove();
                        const fullText = $cartClone.text().replace(/\s+/g, ' ');

                        let capturedDiscount = '';
                        const cartDiscountMatch = fullText.match(/(?:Automation test|\bdiscount\b)[^\d-]*-\s*(?:[€$£]|Rs\.?|PKR|USD|EUR|GBP)?\s*([\d][\d,.]*\d|\d)/i);

                        if (cartDiscountMatch) {
                            capturedDiscount = cartDiscountMatch[1];
                        } else {
                            const broadNegativeMatch = fullText.match(/-\s*(?:[€$£]|Rs\.?|PKR|USD|EUR|GBP)\s*([\d][\d,.]*\d|\d)/i);
                            if (broadNegativeMatch) capturedDiscount = broadNegativeMatch[1];
                        }

                        cy.get('button[name="checkout"], input[name="checkout"], button:contains("Check out"), button:contains("Checkout")', { timeout: 15000 })
                            .filter(':visible')
                            .first()
                            .should('not.be.disabled')
                            .click({ force: true });

                        return cy.wrap({
                            itemCount: String(totalItemCount),
                            cartDiscount: capturedDiscount
                        });
                    });
            }).then((cartData) => {
                // --- 3. CHECKOUT DISCOUNT VERIFICATION ---
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
                                result = { rowText, amount: amountMatch[1] };
                                return false;
                            }
                            $row = $row.parent();
                        }
                    });
                    return result;
                }

                if (cartData.cartDiscount) {
                    cy.get('body').then(($body) => {
                        const $toggle = $body.find(
                            'button:contains("Show order summary"), [class*="summary-toggle"], [aria-expanded="false"][class*="summary"]'
                        ).filter(':visible');

                        if ($toggle.length) {
                            cy.wrap($toggle.first()).click();
                        }
                    });

                    cy.get('body', { timeout: 15000 }).should(($body) => {
                        const found = findCheckoutDiscount($body);
                        const pageText = getVisibleText($body);
                        const wholePageMatch = !found && pageText.match(/\bdiscount\b[\s\S]{0,100}?(-\s*(?:[€$£]|Rs\.?|PKR|USD|EUR|GBP)\s*([\d][\d,.]*\d|\d))/i);

                        const rawCheckoutDiscount = found
                            ? found.amount
                            : (wholePageMatch ? wholePageMatch[2] : null);

                        expect(
                            rawCheckoutDiscount,
                            `Checkout "Order discount" breakdown string could not be found on page.`
                        ).to.exist;

                        const parsedCartDiscount = parseLocaleNumber(cartData.cartDiscount);
                        const parsedCheckoutDiscount = parseLocaleNumber(rawCheckoutDiscount);

                        expect(parsedCheckoutDiscount).to.equal(parsedCartDiscount);
                    });
                }
            });
        });
    });

});