class LoginPage {
    /**
     * Visits the login page and verifies header visibility.
     * @param {string} [adminUrl] - Optional base/admin URL override
     */
    visit(adminUrl) {
        const targetPath = adminUrl ? `${adminUrl}/login` : '/login';
        cy.visit(targetPath);
        cy.url({ timeout: 15000 }).should('include', '/login');

        // Retryable header verification (replaces synchronous $body checks - Part 2, Rule 3)
        cy.contains(/welcome back|login|sign in/i, { timeout: 15000 })
            .should('be.visible');
    }

    /**
     * Clears and types the email address (if provided).
     * @param {string} email
     */
    typeEmail(email) {
        const emailField = cy.get('input[type="email"]', { timeout: 15000 })
            .should('be.visible')
            .clear();

        if (email) {
            emailField.type(email);
        }
    }

    /**
     * Clears and types the password (if provided).
     * @param {string} password
     */
    typePassword(password) {
        const passwordField = cy.get('input[type="password"]', { timeout: 15000 })
            .should('be.visible')
            .clear();

        if (password) {
            passwordField.type(password, { log: false });
        }
    }

    /**
     * Clicks the login form submit button.
     */
    clickSubmit() {
        cy.contains('button', /log in|login|submit/i)
            .should('be.visible')
            .click();
    }

    /**
     * Fills the login form fields and submits.
     * @param {string} email
     * @param {string} password
     */
    attemptLogin(email, password) {
        this.typeEmail(email);
        this.typePassword(password);
        this.clickSubmit();
    }

    /**
     * Full end-to-end positive login flow.
     * @param {string} email - User login email
     * @param {string} password - User login password
     * @param {string} [adminUrl] - Optional base/admin URL override
     */
    login(email, password, adminUrl) {
        this.visit(adminUrl);
        this.attemptLogin(email, password);

        // Assert successful redirection to dashboard
        cy.url({ timeout: 30000 }).should('include', '/dashboard');
    }

    // --- ASSERTION HELPERS FOR NEGATIVE SUITES ---

    /** Asserts that a server or validation error message is displayed. */
    assertErrorMessage() {
        cy.contains(/invalid|incorrect|credentials|failed/i, { timeout: 15000 })
            .should('be.visible');
    }

    /** Asserts native HTML5 form validation failure on the email field. */
    assertEmailInvalidState() {
        cy.get('input[type="email"]:invalid').should('exist');
    }

    /** Asserts native HTML5 form validation failure on the password field. */
    assertPasswordInvalidState() {
        cy.get('input[type="password"]:invalid').should('exist');
    }

    /** Asserts that the browser remains on the login route. */
    assertStillOnLoginPage() {
        cy.url({ timeout: 15000 }).should('include', '/login');
    }
}

export default new LoginPage();