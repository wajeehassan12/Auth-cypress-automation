import loginPage from '../../page-objects/login-page';
import resetPasswordPage from '../../page-objects/reset-password-page';

describe('Reset Password Flow', () => {

    beforeEach(() => {
        // Prevent telemetry / log requests from cluttering execution
        cy.intercept('POST', '**/ingest/**', { statusCode: 204 });
    });

    it('should successfully reset password and authenticate user', () => {
        const email = Cypress.env('RESET_EMAIL');
        const inbox = Cypress.env('RESET_INBOX');
        const newPassword = Cypress.env('NEW_PASSWORD');

        if (!email || !inbox || !newPassword) {
            throw new Error('❌ Missing RESET_EMAIL, RESET_INBOX, or NEW_PASSWORD in environment configuration.');
        }

        // --- 1. REQUEST PASSWORD RESET ---
        resetPasswordPage.visitForgotPassword();
        resetPasswordPage.requestPasswordReset(email);

        // ✅ Updated: Matches exact DOM message in CheckyPro
        cy.contains('We have emailed your password reset link.', { timeout: 15000 })
            .should('be.visible');

        // --- 2. FETCH RESET LINK FROM YOPMAIL ---
        cy.openYopmailEmail(inbox);

        // --- 3. COMPLETE RESET WORKFLOW ---
        cy.url({ timeout: 15000 }).should('include', '/reset-password');

        resetPasswordPage.submitNewPassword(email, newPassword);

        // --- 4. VERIFY REDIRECT & RE-AUTHENTICATE ---
        cy.url({ timeout: 15000 }).should('include', '/login');

        resetPasswordPage.getSuccessAlert()
            .should('be.visible');

        // Re-authenticate using central LoginPage Object
        loginPage.login(email, newPassword);

        cy.url({ timeout: 15000 }).should('include', '/dashboard');
        cy.url().should('not.include', '/login');
    });
});