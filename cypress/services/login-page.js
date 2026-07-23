class LoginPage {
    login(email, password, adminUrl) {
        cy.visit(`${adminUrl}/login`);
        cy.get('input[type="email"]:visible').clear().type(email);
        cy.get('input[type="password"]:visible').clear().type(password, { log: false });
        cy.get('button').contains(/Log in/i).click();
    }
}

export default new LoginPage();
