// ***********************************************************
// This file is processed and loaded automatically before
// your test files.
//
// You can put global configuration and behavior here.
// ***********************************************************

// Import custom Cypress commands
import './commands';

// Ignore uncaught JavaScript exceptions from the application
Cypress.on('uncaught:exception', (err, runnable) => {

  console.log('Application Error:', err.message);

  // Prevent Cypress from failing the test
  return false;

});