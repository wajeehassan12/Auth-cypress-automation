describe("Reset password", () => {

    const email = "workstore@yopmail.com";
    const inbox = "workstore";
    const newPassword = "Password@1234";

    it("Reset password and login", () => {
        // Mute the noisy local ingest logs so they don't flood your console or UI
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 }).as('ingestLogs');

        
        cy.visit("https://checkypro.robustapps.net/forgot-password");

        cy.get('input[type="email"]')
            .should("be.visible")
            .clear()
            .type(email);

        cy.contains("Reset Password").click();

        
        cy.openYopmailEmail(inbox);


        cy.url({ timeout: 30000 }).should("include", "/reset-password");


        cy.get('input:visible', { timeout: 30000 })
            .should('have.length.at.least', 3);

        // Email
        cy.get('input:visible')
            .eq(0)
            .clear()
            .type(email);

        // Password
        cy.get('input:visible')
            .eq(1)
            .clear()
            .type(newPassword);

        // Confirm Password
        cy.get('input:visible')
            .eq(2)
            .clear()
            .type(newPassword);

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
            .type(email);

        cy.get('input[type="password"]')
            .should("be.visible")
            .clear()
            .type(newPassword);

        cy.contains("Log in").click();

        // Verify successful login
        cy.url({ timeout: 30000 }).should("not.include", "/login");
    });
});