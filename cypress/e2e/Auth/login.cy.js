describe('Checky Pro Login', () => {

  it('Should login successfully with valid credentials', () => {

    // 1. Fix: Used relative path instead of hardcoded URL (Review Item 3)
    cy.visit('/login');

    // Verify the login page is loaded
    cy.contains('Welcome back! Login to Checky Pro')
      .should('be.visible');

    // 2. Fallback: Targeting placeholder attributes until data-cy is added to the HTML source
    cy.get('input[placeholder*="email" i], input[placeholder*="Email" i]')
      .should('be.visible')
      .clear()
      .type(Cypress.env('LOGIN_EMAIL'));

    // 2. Fallback: Targeting placeholder attributes until data-cy is added to the HTML source
    cy.get('input[placeholder*="password" i], input[placeholder*="Password" i]')
      .should('be.visible')
      .clear()
      .type(Cypress.env('LOGIN_PASSWORD'), { log: false }); 

    // 2. Fallback: Targeting the button specifically by its unique type inside the form
    cy.get('form button[type="submit"]')
      .should('be.visible')
      .click();

    // Verify successful login landing zone
    cy.url({ timeout: 15000 }).should('include', '/dashboard');
    cy.url().should('not.include', '/login');

  });

});
