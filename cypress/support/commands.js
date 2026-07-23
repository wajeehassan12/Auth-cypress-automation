import CryptoJS from 'crypto-js';

// =========================================================================
// 1. Rapyd API Header & Signature Generator Command
// =========================================================================
Cypress.Commands.add('rapydRequest', (method, path, body = null) => {
  const accessKey = Cypress.env('RAPYD_ACCESS_KEY');
  const secretKey = Cypress.env('RAPYD_SECRET_KEY');
  const baseUrl = 'https://sandboxapi.rapyd.net';

  // Generate a random 16-character hexadecimal string
  const salt = CryptoJS.lib.WordArray.random(8).toString(CryptoJS.enc.Hex);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const idempotency = Date.now().toString();
  
  let bodyString = '';
  if (body && Object.keys(body).length > 0) {
    bodyString = JSON.stringify(body);
  }

  // Calculate the signature sequence strictly matching Rapyd's requirement
  const toSign = 
    method.toLowerCase() + 
    path + 
    salt + 
    timestamp + 
    accessKey + 
    secretKey + 
    bodyString;

  const hmac = CryptoJS.HmacSHA256(toSign, secretKey);
  const signature = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(hmac.toString(CryptoJS.enc.Hex)));

  return cy.request({
    method: method,
    url: `${baseUrl}${path}`,
    headers: {
      'Content-Type': 'application/json',
      'access_key': accessKey,
      'salt': salt,
      'timestamp': timestamp,
      'signature': signature,
      'idempotency': idempotency
    },
    body: body,
    failOnStatusCode: false // Safe handling for error assertion tests
  });
});

// =========================================================================
// 2. YOPmail Email Automation Command
// =========================================================================
Cypress.Commands.add("openYopmailEmail", (inbox) => {
  cy.origin("https://yopmail.com", { args: { inbox } }, ({ inbox }) => {
    cy.visit(`/en/?login=${inbox}`);

    // Dynamically wait for the email layout iframe to become visible
    cy.get("iframe#ifmail", { timeout: 30000 })
      .should("be.visible");

    // Read the email body iframe
    cy.get("iframe#ifmail")
      .its("0.contentDocument.body") 
      .should("not.be.empty")
      .then(cy.wrap)
      .then(($body) => {
        // Print HTML to browser console
        console.log($body.html());

        // Extract reset link
        const html = $body.html();
        const match = html.match(/https?:\/\/[^"]*reset-password[^"]*/);

        expect(match, "Reset Password URL").to.not.be.null;

        // Navigate directly to the extracted reset link URL
        cy.visit(match[0]);
      });
  });
});