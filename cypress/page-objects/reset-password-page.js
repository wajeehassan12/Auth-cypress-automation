class ResetPasswordPage {
    visitForgotPassword() {
        cy.visit('/forgot-password');
    }

    requestPasswordReset(email) {
        cy.get('input[type="email"], [data-cy="reset-email-input"]')
            .should('be.visible')
            .clear()
            .type(email);

        cy.contains('button', /Reset Password/i)
            .should('be.visible')
            .and('not.be.disabled')
            .click();
    }

    submitNewPassword(email, newPassword) {
        cy.get('input:visible')
            .should('have.length.at.least', 3);

        cy.get('input:visible').eq(0)
            .should('be.visible')
            .clear()
            .type(email);

        cy.get('input:visible').eq(1)
            .should('be.visible')
            .clear()
            .type(newPassword, { log: false });

        cy.get('input:visible').eq(2)
            .should('be.visible')
            .clear()
            .type(newPassword, { log: false });

        cy.contains('button', /Update Password/i)
            .should('be.visible')
            .and('not.be.disabled')
            .click();
    }

    getSuccessAlert() {
        return cy.contains("Your password has been reset.");
    }
}

export default new ResetPasswordPage();