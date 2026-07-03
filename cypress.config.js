const { defineConfig } = require("cypress");

module.exports = defineConfig({
  chromeWebSecurity: false,

  env: {
    // These can also stay in cypress.env.json.
    // If present in both places, cypress.env.json takes precedence.
  },

  e2e: {
    baseUrl: "https://checkypro.robustapps.net",

    experimentalModifyObstructiveThirdPartyCode: true,

    setupNodeEvents(on, config) {
      console.log("Loaded Cypress Environment Variables:");
      console.log(config.env);

      return config;
    },
  },
});