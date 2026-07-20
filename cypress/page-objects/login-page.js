class LoginPage {
    login(email, password, adminUrl) {
        // Visit the login url and wait for it to resolve
        cy.visit(`${adminUrl}/login`);
        cy.url({ timeout: 15000 }).should('include', '/login');

        // Robust header detection: matches "Welcome back", "Login", "Sign in" case-insensitively
        cy.get('body', { timeout: 20000 }).then(($body) => {
            const headingRegex = /welcome back|login|sign in/i;
            if (headingRegex.test($body.text())) {
                cy.contains(headingRegex, { timeout: 10000 }).should('be.visible');
            }
        });

        // Use standard input elements to verify the page is fully ready
        cy.get('input[type="email"]', { timeout: 15000 })
            .should('be.visible')
            .clear()
            .type(email);

        cy.get('input[type="password"]')
            .should('be.visible')
            .clear()
            .type(password, { log: false });

        // Click login button (targets type="submit" or text options dynamically)
        cy.get('button[type="submit"], button:contains("Log in"), button:contains("Login")')
            .should('be.visible')
            .click();

        cy.url({ timeout: 30000 }).should('include', '/dashboard');
    }
}

export default new LoginPage();