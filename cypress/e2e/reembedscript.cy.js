describe('Checky Pro - Script Re-embed Flow', () => {

  it('Should login and successfully re-embed the script', () => {

    // ==========================================
    // 1. LOGIN FLOW
    // ==========================================
    cy.visit('https://checkypro.robustapps.net/login');

    cy.contains('Welcome back! Login to Checky Pro')
      .should('be.visible');

    cy.get('input[type="email"]')
      .should('be.visible')
      .type(Cypress.env('LOGIN_EMAIL'));

    cy.get('input[type="password"]')
      .should('be.visible')
      .type(Cypress.env('LOGIN_PASSWORD'), { log: false });

    cy.contains('button', 'Log in')
      .should('be.visible')
      .click();

    // Verify successful login redirection to dashboard
    cy.url().should('include', '/dashboard');


    // ==========================================
    // 2. NAVIGATE TO SETTINGS
    // ==========================================
    // As seen in image_25d2ba.png, we locate and click 'Settings' in the navigation menu
    cy.contains('Settings')
      .should('be.visible')
      .click();

    // Verify it smoothly transitions to the settings page URL
    cy.url().should('include', '/settings');


    // ==========================================
    // 3. NAVIGATE TO CHECKY PRO SCRIPT TAB
    // ==========================================
    // As seen in image_25d5fb.png, click the inner tab header
    cy.contains('Checky Pro Script')
      .should('be.visible')
      .click();

    // Confirm the URL updates to the script sub-route as shown in image_25d9bf.png
    cy.url().should('include', '/settings/checky-pro-script');


    // ==========================================
    // 4. RE-EMBED THE SCRIPT & VERIFY SUCCESS
    // ==========================================
    // Click the purple button highlighted in image_25d9bf.png
    cy.contains('button', 'Re-embed script')
      .should('be.visible')
      .click();

    // Assert that a success toast, message, or alert appears on screen
    // Note: If your app shows a specific message like "Script re-embedded!", change 'success' to that text.
    cy.contains('success', { matchCase: false })
      .should('be.visible');

  });

});