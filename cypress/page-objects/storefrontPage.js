class StorefrontPage {
    visitAndClean(storeUrl) {
        cy.visit(storeUrl);

        // Clean up service workers
        cy.window().then((win) => {
            if (win.navigator && win.navigator.serviceWorker) {
                win.navigator.serviceWorker.getRegistrations().then((regs) => {
                    for (let reg of regs) reg.unregister();
                });
            }
        });
    }

    addLaptopToCart() {
        cy.get('[data-cy="featured-products-heading"]', { timeout: 25000 })
            .should('be.visible')
            .scrollIntoView();

        cy.get('[data-cy="category-link-laptops"]').click();
        cy.get('[data-cy="add-to-cart-button"]').should('be.visible').click();
    }

    proceedToCheckout() {
        cy.get('[data-cy="view-cart-button"]').should('be.visible').click();
        cy.url().should('include', '/cart');
        cy.get('[data-cy="checkout-button"]:visible').should('be.visible').click();
    }
}

export default new StorefrontPage();
