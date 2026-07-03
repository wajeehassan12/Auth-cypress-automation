describe('Checky Pro Login - Negative Scenarios', () => {

  beforeEach(() => {
    cy.visit('https://checkypro.robustapps.net/login');

    // Verify login page is loaded
    cy.contains('Welcome back! Login to Checky Pro')
      .should('be.visible');
  });

  it('Should not login with an invalid email', () => {

    cy.get('input[type="email"]')
      .type(Cypress.env('INVALID_EMAIL'));

    cy.get('input[type="password"]')
      .type(Cypress.env('LOGIN_PASSWORD'), { log: false });

    cy.contains('button', 'Log in')
      .click();

    // User should remain on login page
    cy.url().should('include', '/login');

    // Verify error message
    cy.contains(/invalid|incorrect|credentials|failed/i)
      .should('be.visible');
  });

  it('Should not login with an invalid password', () => {

    cy.get('input[type="email"]')
      .type(Cypress.env('LOGIN_EMAIL'));

    cy.get('input[type="password"]')
      .type(Cypress.env('INVALID_PASSWORD'), { log: false });

    cy.contains('button', 'Log in')
      .click();

    cy.url().should('include', '/login');

    cy.contains(/invalid|incorrect|credentials|failed/i)
      .should('be.visible');
  });

  it('Should not login with both invalid email and password', () => {

    cy.get('input[type="email"]')
      .type(Cypress.env('INVALID_EMAIL'));

    cy.get('input[type="password"]')
      .type(Cypress.env('INVALID_PASSWORD'), { log: false });

    cy.contains('button', 'Log in')
      .click();

    cy.url().should('include', '/login');

    cy.contains(/invalid|incorrect|credentials|failed/i)
      .should('be.visible');
  });

  it('Should not login when email is empty', () => {

    cy.get('input[type="password"]')
      .type(Cypress.env('LOGIN_PASSWORD'), { log: false });

    cy.contains('button', 'Log in')
      .click();

    cy.get('input[type="email"]:invalid')
      .should('exist');

    cy.url().should('include', '/login');
  });

  it('Should not login when password is empty', () => {

    cy.get('input[type="email"]')
      .type(Cypress.env('LOGIN_EMAIL'));

    cy.contains('button', 'Log in')
      .click();

    cy.get('input[type="password"]:invalid')
      .should('exist');

    cy.url().should('include', '/login');
  });

  it('Should not login when both email and password are empty', () => {

    cy.contains('button', 'Log in')
      .click();

    cy.get('input[type="email"]:invalid')
      .should('exist');

    cy.get('input[type="password"]:invalid')
      .should('exist');

    cy.url().should('include', '/login');
  });

  it('Should not login with an invalid email format', () => {

    cy.get('input[type="email"]')
      .type('invalid-email');

    cy.get('input[type="password"]')
      .type(Cypress.env('LOGIN_PASSWORD'), { log: false });

    cy.contains('button', 'Log in')
      .click();

    cy.get('input[type="email"]:invalid')
      .should('exist');

    cy.url().should('include', '/login');
  });

});
