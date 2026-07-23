class StorefrontPage {
    visitAndClean(storeUrl) {
        cy.visit(storeUrl);
        cy.clearCookies();
        cy.clearLocalStorage();
        cy.window().then((win) => {
            win.sessionStorage.clear();
            if (win.navigator && win.navigator.serviceWorker) {
                win.navigator.serviceWorker.getRegistrations().then((regs) => {
                    for (let reg of regs) {
                        reg.unregister();
                    }
                });
            }
        });
    }

    addLaptopToCart() {
        // Scroll to the featured products/collection section safely
        cy.contains(/Featured products|Products|Laptops/i, { timeout: 25000 })
            .should('be.visible')
            .scrollIntoView();

        // Target visible product card links specifically, filtering out hidden template markup
        cy.get('a.full-unstyled-link, .card__heading a, .product-item a', { timeout: 15000 })
            .filter(':visible')
            .contains(/Laptops/i)
            .first()
            .scrollIntoView()
            .click();

        // Explicitly set quantity to 1 item
        cy.get('input[name="quantity"], [data-cy="quantity-input"]', { timeout: 15000 })
            .should('be.visible')
            .first()
            .clear()
            .type('1');

        // Handle add-to-cart button selection
        cy.get('button[name="add"], [data-cy="add-to-cart-button"]', { timeout: 15000 })
            .should('be.visible')
            .and('not.be.disabled')
            .click();

        // Rely on built-in retry-ability to wait for cart indicator update instead of cy.intercept() inside cy.origin()
        cy.get('.cart-count-bubble, [data-cy="cart-count"], .cart-drawer, cart-notification, span[id*="cart-icon-bubble"]', { timeout: 15000 })
            .should('be.visible');
    }

    proceedToCheckout() {
        // Redirect directly to the cart page to guarantee stable navigation
        cy.visit('/cart', { timeout: 30000 });
        cy.url({ timeout: 15000 }).should('include', '/cart');
        
        // Proceed to checkout page using built-in Cypress retries
        cy.get('[data-cy="checkout-button"], button[name="checkout"], input[name="checkout"], .cart__checkout-button', { timeout: 15000 })
            .should('be.visible')
            .and('not.be.disabled')
            .filter(':visible')
            .first()
            .click();
    }
}

export default new StorefrontPage();