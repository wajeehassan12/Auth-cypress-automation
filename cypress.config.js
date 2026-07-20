const { defineConfig } = require("cypress");

module.exports = defineConfig({
  // Bypasses cross-origin frame security barriers at the browser level
  chromeWebSecurity: false,

  env: {
    // Target Storefront
    STORE_URL: "https://checkyprostore.robustapps.net",
    
    // Checky-Pro Portal Login
    CHECKY_PRO_LOGIN_URL: "https://checkypro.robustapps.net/login", 
    CHECKY_PRO_USER: "checkydev@yopmail.com",
    CHECKY_PRO_PASS: "12345678",

    // Rapyd Gateway Keys
    RAPYD_ACCESS_KEY: "your_sandbox_access_key_here",    
    RAPYD_SECRET_KEY: "your_sandbox_secret_key_here",

    // Custom Checkout Test Data
    CHECKOUT_EMAIL: "tester@yopmail.com",
    CHECKOUT_COUNTRY: "Netherlands",
    CHECKOUT_FIRSTNAME: "John",
    CHECKOUT_LASTNAME: "Doe",
    CHECKOUT_ADDRESS: "Main Street",
    CHECKOUT_HOUSE_NUMBER: "42",
    CHECKOUT_SUFFIX: "B",
    CHECKOUT_CITY: "Amsterdam",
    CHECKOUT_ZIP: "1011 DJ",
    
    // Phone Number Variable
    CHECKOUT_PHONE: "+31612345678"
  },

  e2e: {
    baseUrl: "https://checkypro.robustapps.net",
    pageLoadTimeout: 90000,
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    
    // Strips out third-party frame-busting security scripts
    experimentalModifyObstructiveThirdPartyCode: true,

    // Allows loading Page Objects/dependencies inside cy.origin()
    experimentalOriginDependencies: true,

    setupNodeEvents(on, config) {
      return config;
    },
  },
});