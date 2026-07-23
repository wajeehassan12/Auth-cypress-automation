const { defineConfig } = require("cypress");

module.exports = defineConfig({
  env: {
    // Target Storefront & Service URLs (Part 1, Rule 11)
    STORE_URL: "https://checkyprostore.robustapps.net",
    CHECKY_PRO_LOGIN_URL: "https://checkypro.robustapps.net/login",

    // Authentication Credentials (Part 1, Rule 11)
    LOGIN_EMAIL: "checkydev@yopmail.com",
    LOGIN_PASSWORD: "12345678",

    // Test Discount Codes
    DISCOUNT_CODE_SPECIFIC: "FKN8H02ANCWR",
    DISCOUNT_CODE_3: "DISCOUNT30",

    // Gateway Sandbox Keys
    RAPYD_ACCESS_KEY: "your_sandbox_access_key_here",
    RAPYD_SECRET_KEY: "your_sandbox_secret_key_here"
  },

  e2e: {
    baseUrl: "https://checkypro.robustapps.net",
    pageLoadTimeout: 90000,
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",

    // Configure retries for CI runs as an environment safety net (Part 1, Rule 13 & Part 2, Rule 12)
    retries: {
      runMode: 2,
      openMode: 0
    },

    // Allows loading Page Objects/dependencies inside cy.origin() (Part 2, Rule 14)
    experimentalOriginDependencies: true,

    // Safely strips third-party frame-busting security scripts
    experimentalModifyObstructiveThirdPartyCode: true,

    setupNodeEvents(on, config) {
      return config;
    }
  }
});