describe('Checky Pro Login - Negative Scenarios', () => {

  beforeEach(() => {
    cy.visit('https://checkypro.robustapps.net/login');

    
    cy.contains('Welcome back! Login to Checky Pro')
      .should('be.visible');
  });

  it('Should not login with an invalid email', () => {
  
    const invalidEmail = Cypress.env('INVALID_EMAIL') || 'invalid_user@test.com';
    const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

    cy.get('input[type="email"]')
      .type(invalidEmail);

    cy.get('input[type="password"]')
      .type(password, { log: false });

    cy.contains('button', 'Log in')
      .click();

    
    cy.url().should('include', '/login');

    
    cy.contains(/invalid|incorrect|credentials|failed/i)
      .should('be.visible');
  });

  it('Should not login with an invalid password', () => {
    const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';
    const invalidPassword = Cypress.env('INVALID_PASSWORD') || 'WrongPassword!';

    cy.get('input[type="email"]')
      .type(email);

    cy.get('input[type="password"]')
      .type(invalidPassword, { log: false });

    cy.contains('button', 'Log in')
      .click();

    cy.url().should('include', '/login');

    cy.contains(/invalid|incorrect|credentials|failed/i)
      .should('be.visible');
  });

  it('Should not login with both invalid email and password', () => {
    const invalidEmail = Cypress.env('INVALID_EMAIL') || 'invalid_user@test.com';
    const invalidPassword = Cypress.env('INVALID_PASSWORD') || 'WrongPassword!';

    cy.get('input[type="email"]')
      .type(invalidEmail);

    cy.get('input[type="password"]')
      .type(invalidPassword, { log: false });

    cy.contains('button', 'Log in')
      .click();

    cy.url().should('include', '/login');

    cy.contains(/invalid|incorrect|credentials|failed/i)
      .should('be.visible');
  });

  it('Should not login when email is empty', () => {
    const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

    cy.get('input[type="password"]')
      .type(password, { log: false });

    cy.contains('button', 'Log in')
      .click();

    cy.get('input[type="email"]:invalid')
      .should('exist');

    cy.url().should('include', '/login');
  });

  it('Should not login when password is empty', () => {
    const email = Cypress.env('LOGIN_EMAIL') || 'valid_user@test.com';

    cy.get('input[type="email"]')
      .type(email);

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
    const password = Cypress.env('LOGIN_PASSWORD') || 'Password123!';

    cy.get('input[type="email"]')
      .type('invalid-email');

    cy.get('input[type="password"]')
      .type(password, { log: false });

    cy.contains('button', 'Log in')
      .click();

    cy.get('input[type="email"]:invalid')
      .should('exist');

    cy.url().should('include', '/login');
  });

});