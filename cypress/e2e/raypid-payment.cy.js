// --- GLOBAL EXCEPTION HANDLER ---
Cypress.on('uncaught:exception', () => {
  return false; 
});

describe('Checky-Pro & Shopify Checkout Flow', () => {

  // STEP 1: Login
  it('should log into Checky-Pro and trigger script re-embedding', () => {
    cy.visit('/login');
    cy.get('input[type="email"]').type(Cypress.env('CHECKY_PRO_USER'));
    cy.get('input[type="password"]').type(Cypress.env('CHECKY_PRO_PASS'), { log: false });
    cy.get('button[type="submit"]').click();
    cy.url().should('include', '/dashboard');
    cy.contains('a', 'Settings').click({ force: true });
    cy.contains('Checky Pro Script').click({ force: true });
    cy.contains('Re-embed script').click({ force: true });
    cy.wait(2000);
  });

  // STEP 2: Shopify Add-to-Cart & Checkout
  it('should purchase a laptop and complete the checkout', () => {
    const storeUrl = Cypress.env('STORE_URL');

    cy.clearCookies();

    // 1. SHOPIFY FLOW
    cy.origin(storeUrl, { args: { storeUrl } }, ({ storeUrl }) => {
        Cypress.on('uncaught:exception', () => false);
        cy.visit('/');
        cy.get('a:visible').contains('Laptops').click();
        cy.get('button[name="add"]').click();
        cy.contains('View cart').click();
        cy.get('button[name="checkout"]:visible').click();
    }); 

    // 2. FILL CHECKOUT DETAILS
    cy.url({ timeout: 35000 }).should('include', '/checkout');
    cy.get('input[type="email"]').clear({ force: true }).type(Cypress.env('CHECKOUT_EMAIL'), { force: true });
    cy.get('input#firstName').clear({ force: true }).type(Cypress.env('CHECKOUT_FIRSTNAME'), { force: true });
    cy.get('input#lastName').clear({ force: true }).type(Cypress.env('CHECKOUT_LASTNAME'), { force: true });
    cy.get('input#address').clear({ force: true }).type(Cypress.env('CHECKOUT_ADDRESS'), { force: true });
    cy.get('input#city').clear({ force: true }).type(Cypress.env('CHECKOUT_CITY'), { force: true });
    cy.get('input#zip').clear({ force: true }).type(Cypress.env('CHECKOUT_ZIP'), { force: true });

    // 3. INTERCEPT THE ACTUAL SUBMISSION
    // This watches for the network request that triggers when you click "Pay"
    // Use a wildcard to catch any POST request to your checkout path
    cy.intercept('POST', '**/checkout/**').as('paymentSubmission');

    // 4. TRIGGER THE REAL BUTTON CLICK
    // This lets the browser handle the cookies and headers, avoiding the 405 error
    cy.contains('button', 'Pay').click({ force: true }); // Ensure this selector matches your actual Pay button

    // 5. WAIT FOR THE SUBMISSION
    cy.wait('@paymentSubmission').then((interception) => {
        cy.log('Request captured, processing payment success...');
        
        // 6. DISPATCH SUCCESS BYPASS
        // Now that the network request is triggered, we bypass the Rapyd UI
        cy.window().then((win) => {
            const mockSuccessEvent = new CustomEvent('onCheckoutPaymentSuccess', {
                detail: {
                    id: 'payment_mock_success_bypass',
                    status: 'CLO', 
                    amount: 100.00,
                    currency: 'EUR'
                }
            });
            win.dispatchEvent(mockSuccessEvent);
        });
    });

    // 7. VERIFY REDIRECT
    cy.url({ timeout: 35000 }).should('include', '/payment-success');
  });
});