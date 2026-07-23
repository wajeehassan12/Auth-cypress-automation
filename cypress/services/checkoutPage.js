class CheckoutPage {
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
