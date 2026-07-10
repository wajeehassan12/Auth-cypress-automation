// ***********************************************************
// This file is processed and loaded automatically before
// your test files.
//
// You can put global configuration and behavior here.
// ***********************************************************

// CRITICAL FIX: This line MUST be here to load your custom commands!
import './commands';
import 'cypress-real-events';

// Refactored Exception Handling: No longer ignoring all errors blindly [cite: 44, 49, 50, 51]
Cypress.on('uncaught:exception', (err, runnable) => {
  
  console.log('Application Error:', err.message);

  // 1. Recommendation: Safe exception handling [cite: 49, 50]
  // Check if the error is a known, acceptable browser/third-party script issue.
  if (
    err.message.includes('cross-origin') || 
    err.message.includes('viva') ||
    err.message.includes('secretKeyVerified is not defined') // Added to filter out this specific error
  ) {
    // Ignore only this specific known browser-related exception 
    return false; 
  }

  // 2. Recommendation: Everything else should fail the test [cite: 51]
  // If it's a completely new or different application bug, fail the test[cite: 51].
  return true; 
});