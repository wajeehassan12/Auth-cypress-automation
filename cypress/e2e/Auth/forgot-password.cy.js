describe("Reset password", () => {

    it("Reset password and login", () => {
        // Mute noisy ingest logs
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        // --- REQUEST RESET ---
        // Uses relative path matching the root domain configuration [cite: 38, 39]
        cy.visit("/forgot-password");

        // Fix: Standard clean CSS selector to locate the visible email field safely
        cy.get('input[type="email"]:visible, input:visible')
            .first()
            .should("be.visible")
            .clear()
            .type(Cypress.env('RESET_EMAIL'));

        // Target the reset button case-insensitively using regex matching
        cy.get('button')
            .contains(/Reset Password/i)
            .click();

        // --- FETCH LINK FROM YOPMAIL ---
        cy.openYopmailEmail(Cypress.env('RESET_INBOX'));

        // --- COMPLETE RESET WORKFLOW ---
        cy.url({ timeout: 30000 }).should("include", "/reset-password");

        cy.get('input:visible', { timeout: 30000 })
            .should('have.length.at.least', 3);

        cy.get('input:visible').eq(0).clear().type(Cypress.env('RESET_EMAIL'));
        cy.get('input:visible').eq(1).clear().type(Cypress.env('NEW_PASSWORD'), { log: false });
        cy.get('input:visible').eq(2).clear().type(Cypress.env('NEW_PASSWORD'), { log: false });

        cy.get('button')
            .contains(/Update Password/i)
            .click();

        // --- VERIFY LOGIN & RE-AUTH ---
        cy.url({ timeout: 30000 }).should("include", "/login");

        cy.contains("Your password has been reset.")
            .should("be.visible");

        // Use clean standard selectors on the main login form
        cy.get('input[type="email"]:visible')
            .first()
            .should("be.visible")
            .clear()
            .type(Cypress.env('RESET_EMAIL'));

        cy.get('input[type="password"]:visible')
            .first()
            .should("be.visible")
            .clear()
            .type(Cypress.env('NEW_PASSWORD'), { log: false });

        cy.get('button')
            .contains(/Log in/i)
            .click();

        cy.url({ timeout: 30000 }).should('include', '/dashboard');
        cy.url().should("not.include", "/login");
    });
});