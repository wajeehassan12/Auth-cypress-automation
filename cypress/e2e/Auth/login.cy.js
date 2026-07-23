import loginPage from '../../page-objects/login-page';

describe('Checky Pro Login', () => {

    it('Should login successfully with valid credentials', () => {
        // Retrieve credentials from environment variables (Part 1, Rule 11)
        const email = Cypress.env('LOGIN_EMAIL');
        const password = Cypress.env('LOGIN_PASSWORD');

        if (!email || !password) {
            throw new Error('❌ Missing LOGIN_EMAIL or LOGIN_PASSWORD in configuration.');
        }

        // Single Page Object call handles visit, header check, login flow, and dashboard redirect assertion (Part 2, Rule 1)
        loginPage.login(email, password);
    });

});