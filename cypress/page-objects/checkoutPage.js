class CheckoutPage {
    stabilizeCheckout() {
        // 1. Wait for checkout page URL to load
        cy.url({ timeout: 45000 }).should('include', '/checkout');
        
        // 2. Assert visibility on elements that are actually visible on screen
        cy.contains('h1:visible, h2:visible, h3:visible, div:visible', /Contact|Delivery/i, { timeout: 30000 })
          .should('be.visible');
    }

    applyDiscount(code) {
        // 1. Locate the visible discount input box
        cy.get('input#discount-base, input[name="discount_code"], .discount-input', { timeout: 25000 })
          .filter(':visible')
          .first()
          .should('be.visible')
          .clear()
          .type(code);

        // 2. Click the Apply button
        cy.get('button.discount-apply-button, .discount-apply-button', { timeout: 15000 })
          .filter(':visible')
          .first()
          .should('be.visible')
          .click();

        // 3. Wait for the applied coupon badge to register on the screen
        cy.contains(code, { timeout: 20000 }).should('be.visible');
        
        // 4. Directly check the parent container of "Total" to ensure it no longer says "100.00"
        cy.contains(/Total/i)
          .parent()
          .should('not.contain', '100.00');
    }

    removeDiscount() {
        // Streamline the command chain so the 15-second timeout protects the entire assertion.
        // Cypress will now gracefully poll the element until it becomes active and enabled!
        cy.get('button.remove-discount-button:visible', { timeout: 15000 })
          .should('not.be.disabled')
          .click();
    }

    verifyPriceReverted() {
        // 1. Verify the checkout total has reverted back to the original price of €100.00
        cy.contains(/Total/i)
          .parent({ timeout: 15000 })
          .should('contain', '100.00');
          
        // 2. Double-check that any active discount badges are gone
        cy.get('body').should('not.contain', 'Discount applied');
    }

    // Integrated from previous core-redirect-026 navigation implementation
    clickStoreLogo() {
        cy.get('body').then(($body) => {
            if ($body.find('img[alt*="Logo"]').length > 0) {
                cy.get('img[alt*="Logo"]').first().click({ force: true });
            } else if ($body.find('[class*="logo"]').length > 0) {
                cy.get('[class*="logo"]').first().click({ force: true });
            } else {
                cy.contains(/Store Logo/i).click({ force: true });
            }
        });
    }
}

export default new CheckoutPage();