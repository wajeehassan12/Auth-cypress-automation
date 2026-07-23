import loginPage from '../../page-objects/login-page';

// Centralized test data object
const testData = {
    invalidEmail: 'invalid_user@test.com',
    invalidPassword: 'WrongPassword123!',
    invalidEmailFormat: 'invalid-email-format'
};

describe('Checky Pro Login - Negative Scenarios', () => {

    beforeEach(() => {
        loginPage.visit();
    });

    it('Should not login with an invalid email', () => {
        const validPassword = Cypress.env('LOGIN_PASSWORD');

        loginPage.attemptLogin(testData.invalidEmail, validPassword);
        loginPage.assertStillOnLoginPage();
        loginPage.assertErrorMessage();
    });

    it('Should not login with an invalid password', () => {
        const validEmail = Cypress.env('LOGIN_EMAIL');

        loginPage.attemptLogin(validEmail, testData.invalidPassword);
        loginPage.assertStillOnLoginPage();
        loginPage.assertErrorMessage();
    });

    it('Should not login with both invalid email and password', () => {
        loginPage.attemptLogin(testData.invalidEmail, testData.invalidPassword);
        loginPage.assertStillOnLoginPage();
        loginPage.assertErrorMessage();
    });

    it('Should not login when email is empty', () => {
        const validPassword = Cypress.env('LOGIN_PASSWORD');

        loginPage.attemptLogin('', validPassword);
        loginPage.assertEmailInvalidState();
        loginPage.assertStillOnLoginPage();
    });

    it('Should not login when password is empty', () => {
        const validEmail = Cypress.env('LOGIN_EMAIL');

        loginPage.attemptLogin(validEmail, '');
        loginPage.assertPasswordInvalidState();
        loginPage.assertStillOnLoginPage();
    });

    it('Should not login when both email and password are empty', () => {
        loginPage.clickSubmit();
        loginPage.assertEmailInvalidState();
        loginPage.assertPasswordInvalidState();
        loginPage.assertStillOnLoginPage();
    });

    it('Should not login with an invalid email format', () => {
        const validPassword = Cypress.env('LOGIN_PASSWORD');

        loginPage.attemptLogin(testData.invalidEmailFormat, validPassword);
        loginPage.assertEmailInvalidState();
        loginPage.assertStillOnLoginPage();
    });

});