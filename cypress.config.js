const { defineConfig } = require("cypress");

module.exports = defineConfig({
  chromeWebSecurity: false,

  env: {
    // Save your storefront domain link as a reusable environment variable
    STORE_URL: "https://checkyprostore.robustapps.net",
  },

  e2e: {
    baseUrl: "https://checkypro.robustapps.net",
    pageLoadTimeout: 90000,
    experimentalModifyObstructiveThirdPartyCode: true,
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',

    setupNodeEvents(on, config) {
      return config;
    },
  },
});