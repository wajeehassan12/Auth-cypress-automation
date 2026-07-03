describe("Reset password", () => {

    it("Reset password and login", () => {
        // Mute the noisy local ingest logs so they don't flood your console or UI
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        // --- REQUEST RESET ---
        cy.visit("https://checkypro.robustapps.net/forgot-password");

        cy.get('input[type="email"]')
            .should("be.visible")
            .clear()
            .type(Cypress.env('RESET_EMAIL'));

        cy.contains("Reset Password").click();

        // --- FETCH LINK FROM YOPMAIL ---
        cy.openYopmailEmail(Cypress.env('RESET_INBOX'));

        // --- COMPLETE RESET WORKFLOW ---
        cy.url({ timeout: 30000 }).should("include", "/reset-password");

        // Wait for visible inputs
        cy.get('input:visible', { timeout: 30000 })
            .should('have.length.at.least', 3);

        // Email
        cy.get('input:visible')
            .eq(0)
            .clear()
            .type(Cypress.env('RESET_EMAIL'));

        // Password
        cy.get('input:visible')
            .eq(1)
            .clear()
            .type(Cypress.env('NEW_PASSWORD'), { log: false });

        // Confirm Password
        cy.get('input:visible')
            .eq(2)
            .clear()
            .type(Cypress.env('NEW_PASSWORD'), { log: false });

        // Update Password
        cy.contains("Update Password").click();

        // --- VERIFY LOGIN & RE-AUTH ---
        cy.url({ timeout: 30000 }).should("include", "/login");

        // Verify success message
        cy.contains("Your password has been reset.")
            .should("be.visible");

        // Login with new password
        cy.get('input[type="email"]')
            .should("be.visible")
            .clear()
            .type(Cypress.env('RESET_EMAIL'));

        cy.get('input[type="password"]')
            .should("be.visible")
            .clear()
            .type(Cypress.env('NEW_PASSWORD'), { log: false });

        cy.contains("Log in").click();

        // Verify successful login landing zone
        cy.url({ timeout: 30000 }).should('include', '/dashboard');
        cy.url().should("not.include", "/login");
    });
});