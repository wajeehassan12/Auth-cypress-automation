class SettingsPage {
    navigateToScriptSettings() {
        // 1. Ensure we are actually on the settings page first
        cy.url().then((currentUrl) => {
            if (!currentUrl.includes('/settings')) {
                cy.log('Not on settings page. Navigating to Settings...');
                cy.contains('Settings', { timeout: 15000 })
                  .should('be.visible')
                  .click();
                
                // Wait for the URL transition to complete
                cy.url({ timeout: 15000 }).should('include', '/settings');
            }
        });

        // 2. Find and click the script settings option
        // Added .scrollIntoView() and increased timeout to handle rendering lag
        cy.contains(/Checky Pro Script|Script Settings/i, { timeout: 15000 })
            .scrollIntoView()
            .should('be.visible')
            .click();
        
        // 3. Confirm we reached the script settings page
        cy.url({ timeout: 15000 }).should('include', '/checky-pro-script');
    }

    reEmbedScript() {
        cy.contains('button', 'Re-embed script', { timeout: 15000 })
            .scrollIntoView()
            .should('be.visible')
            .click();
        
        // Wait for the background network request to finish successfully
        cy.wait('@reEmbedRequest', { timeout: 30000 })
            .its('response.statusCode')
            .should('eq', 200);
    }
}

export default new SettingsPage();