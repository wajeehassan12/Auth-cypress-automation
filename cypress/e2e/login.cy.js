describe('Checky Pro Login', () => {

  it('Should login successfully with valid credentials', () => {

    // Visit the login page
    cy.visit('https://checkypro.robustapps.net/login');

    // Verify the login page is loaded
    cy.contains('Welcome back! Login to Checky Pro')
      .should('be.visible');

    // Enter Email
    cy.get('input[type="email"]')
      .should('be.visible')
      .type('checkydev@yopmail.com');

    // Enter Password
    cy.get('input[type="password"]')
      .should('be.visible')
      .type('12345678');

    // Click the Login button
    cy.contains('button', 'Log in')
      .should('be.visible')
      .click();

    // Verify successful login
    cy.url().should('not.include', '/login');

  });

});