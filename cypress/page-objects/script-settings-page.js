class ScriptSettingsPage {
    navigateToScriptSettings() {
        cy.contains('Settings', { timeout: 15000 }).should('be.visible').click();
        cy.url({ timeout: 15000 }).should('include', '/settings');

        cy.contains('Checky Pro Script', { timeout: 15000 }).should('be.visible').click();
        cy.url({ timeout: 15000 }).should('include', '/settings/checky-pro-script');
    }

    reEmbedScript() {
        cy.intercept('GET', '**/store*').as('reEmbedRequest');

        cy.contains('button', /re-embed script/i)
            .should('be.visible')
            .click();

        cy.wait('@reEmbedRequest', { timeout: 30000 })
            .its('response.statusCode')
            .should('eq', 200);
    }
}

export default new ScriptSettingsPage();