class SettingsPage {
    // 1. Basic navigation to main Settings
    navigateToSettings() {
        cy.contains('a, button, span', 'Settings', { timeout: 15000 })
            .filter(':visible')
            .first()
            .click();

        cy.url().should('include', '/settings');
    }

    // 2. Sub-navigation to Script Settings tab
    navigateToScriptSettings() {
        this.navigateToSettings();

        cy.contains('a, button, [role="tab"], span', 'Checky Pro Script', { timeout: 15000 })
            .filter(':visible')
            .first()
            .should('be.visible')
            .click();

        cy.url({ timeout: 15000 }).should('include', '/checky-pro-script');
    }

    // 3. Re-embed script with precise route intercepting (Part 1, Rule 11 & Part 2, Rule 11)
    reEmbedScript() {
        // Target exact re-embed route to avoid catching ambient store JS files
        cy.intercept('**/re-embed*').as('reEmbedRequest');

        cy.contains('button', 'Re-embed script', { timeout: 15000 })
            .filter(':visible')
            .first()
            .should('be.visible')
            .click();

        // Retry until response object exists before checking status code
        cy.wait('@reEmbedRequest', { timeout: 30000 })
            .its('response')
            .should('exist')
            .its('statusCode')
            .should('eq', 200);
    }

    // 4. Navigation to Shipping Rates settings section
    navigateToShippingRates() {
        cy.contains('a, button, span', 'Shipping Rates', { timeout: 15000 })
            .filter(':visible')
            .first()
            .click();

        cy.url({ timeout: 15000 }).should('include', '/shipping-rates');
    }

    // 5. Create a new custom shipping rate rule
    createShippingRate({ name, min, max, price }) {
        cy.contains('button', 'Create shipping rate', { timeout: 15000 })
            .filter(':visible')
            .first()
            .click();

        cy.get('input[placeholder="Same day shipping"]', { timeout: 15000 })
            .should('be.visible')
            .type(name);

        cy.get('input[placeholder="Shipping rate #1"]', { timeout: 15000 })
            .should('be.visible')
            .type(name);

        cy.get('input[placeholder="Delivery in 7-8 days"]', { timeout: 15000 })
            .should('be.visible')
            .type('3-9');

        cy.contains('div, button, span', 'Cart Value', { timeout: 15000 })
            .filter(':visible')
            .first()
            .click();

        cy.contains('div, label, span', 'Minimum value', { timeout: 15000 })
            .parent()
            .find('input')
            .first()
            .clear()
            .type(min);

        cy.contains('div, label, span', 'Maximum value', { timeout: 15000 })
            .parent()
            .find('input')
            .last()
            .clear()
            .type(max);

        cy.get('input[placeholder="0.00"]', { timeout: 15000 })
            .first()
            .clear()
            .type(price);

        cy.contains('button', 'Save', { timeout: 15000 })
            .filter(':visible')
            .last()
            .click();
    }

    // 6. Clean session storage and cookies
    clearStorageAndCookies() {
        cy.clearCookies();
        cy.clearLocalStorage();
        cy.window().then((win) => {
            win.sessionStorage.clear();
        });
    }
}

export default new SettingsPage();