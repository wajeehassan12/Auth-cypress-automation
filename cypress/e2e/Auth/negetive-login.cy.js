describe('Checky Pro Login - Negative Scenarios', () => {

  beforeEach(() => {
    // Fix: Replaced hardcoded URL with relative path (Review Item 3)
    cy.visit('/login');

    cy.contains('Welcome back! Login to Checky Pro')
      .should('be.visible');
  });

  it('Should not login with an invalid email', () => {
    const invalidEmail = Cypress.env('INVALID_EMAIL') || 'invalid_user@test.com';
    const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

    // Fix: Standard clean CSS selectors targeting visible elements safely (Review Item 1)
    cy.get('input[type="email"]:visible')
      .type(invalidEmail);

    cy.get('input[type="password"]:visible')
      .type(password, { log: false });

    cy.get('button')
      .contains(/Log in/i)
      .click();

    cy.url().should('include', '/login');

    cy.contains(/invalid|incorrect|credentials|failed/i)
      .should('be.visible');
  });

  it('Should not login with an invalid password', () => {
    const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
    const invalidPassword = Cypress.env('INVALID_PASSWORD') || 'WrongPassword!';

    cy.get('input[type="email"]:visible')
      .type(email);

    cy.get('input[type="password"]:visible')
      .type(invalidPassword, { log: false });

    cy.get('button')
      .contains(/Log in/i)
      .click();

    cy.url().should('include', '/login');

    cy.contains(/invalid|incorrect|credentials|failed/i)
      .should('be.visible');
  });

  it('Should not login with both invalid email and password', () => {
    const invalidEmail = Cypress.env('INVALID_EMAIL') || 'invalid_user@test.com';
    const invalidPassword = Cypress.env('INVALID_PASSWORD') || 'WrongPassword!';

    cy.get('input[type="email"]:visible')
      .type(invalidEmail);

    cy.get('input[type="password"]:visible')
      .type(invalidPassword, { log: false });

    cy.get('button')
      .contains(/Log in/i)
      .click();

    cy.url().should('include', '/login');

    cy.contains(/invalid|incorrect|credentials|failed/i)
      .should('be.visible');
  }); 

  it('Should not login when email is empty', () => {
    const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

    cy.get('input[type="password"]:visible')
      .type(password, { log: false });

    cy.get('button')
      .contains(/Log in/i)
      .click();

    cy.get('input[type="email"]:invalid')
      .should('exist');

    cy.url().should('include', '/login');
  });

  it('Should not login when password is empty', () => {
    const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';

    cy.get('input[type="email"]:visible')
      .type(email);

    cy.get('button')
      .contains(/Log in/i)
      .click();

    cy.get('input[type="password"]:invalid')
      .should('exist');

    cy.url().should('include', '/login');
  });

  it('Should not login when both email and password are empty', () => {
    cy.get('button')
      .contains(/Log in/i)
      .click();

    cy.get('input[type="email"]:invalid')
      .should('exist');

    cy.get('input[type="password"]:invalid')
      .should('exist');

    cy.url().should('include', '/login');
  });

  it('Should not login with an invalid email format', () => {
    const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

    cy.get('input[type="email"]:visible')
      .type('invalid-email');

    cy.get('input[type="password"]:visible')
      .type(password, { log: false });

    cy.get('button')
      .contains(/Log in/i)
      .click();

    cy.get('input[type="email"]:invalid')
      .should('exist');

    cy.url().should('include', '/login');
  });

});