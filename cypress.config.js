const { defineConfig } = require("cypress");

module.exports = defineConfig({
  // MANDATORY: Disables strict browser security to allow smooth cross-origin 
  // interaction between CheckyPro and the Viva Payments portal.
  chromeWebSecurity: false,

  env: {
    // These can also stay in cypress.env.json.
    // If present in both places, cypress.env.json takes precedence.
  },

  e2e: {
    baseUrl: "https://checkypro.robustapps.net",

    // Extends the timeout limit to give heavy scripts or payment gateways 
    // enough breathing room to trigger the browser's global 'load' event.
    pageLoadTimeout: 90000,

    // Instructs Cypress to actively strip out third-party frame-busting 
    // or obstructive scripts that might interfere with test automation.
    experimentalModifyObstructiveThirdPartyCode: true,

    setupNodeEvents(on, config) {
      console.log("Loaded Cypress Environment Variables:");
      console.log(config.env);

      return config;
    },
  },
});