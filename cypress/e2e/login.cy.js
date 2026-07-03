describe('Checky Pro Login', () => {

  it('Should login successfully with valid credentials', () => {

    // Visit the login page
    cy.visit('https://checkypro.robustapps.net/login');

    // Verify the login page is loaded
    cy.contains('Welcome back! Login to Checky Pro')
      .should('be.visible');

    // Enter Email from env variables
    cy.get('input[type="email"]')
      .should('be.visible')
      .type(Cypress.env('LOGIN_EMAIL'));

    // Enter Password from env variables
    cy.get('input[type="password"]')
      .should('be.visible')
      .type(Cypress.env('LOGIN_PASSWORD'), { log: false }); // { log: false } hides the password from Cypress command logs

    // Click the Login button
    cy.contains('button', 'Log in')
      .should('be.visible')
      .click();

    // Verify successful login
    cy.url().should('not.include', '/login');

  });

});