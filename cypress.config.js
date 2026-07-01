const { defineConfig } = require("cypress");

module.exports = defineConfig({
  chromeWebSecurity: false,

  e2e: {
    baseUrl: "https://checkypro.robustapps.net",

    experimentalModifyObstructiveThirdPartyCode: true,

    setupNodeEvents(on, config) {
      return config;
    }
  }
});