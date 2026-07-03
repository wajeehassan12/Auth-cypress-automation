describe("CheckyPro Registration", () => {

    it("Register Merchant", () => {

        const email = "store33@yopmail.com";
        const password = "Password@123";
        const inbox = email.split("@")[0];

        cy.visit("https://checkypro.robustapps.net/register");

        

        cy.get('input[name="name"]', { timeout: 10000 })
            .should("be.visible")
            .clear()
            .type("Test");

        cy.get('input[name="last_name"]')
            .clear()
            .type("Automate");

        cy.get('input[name="email"]')
            .clear()
            .type(email);

        cy.get('input[name="phone_number"]')
            .clear()
            .type("3123456789");

        cy.get('input[name="password"]')
            .clear()
            .type(password);

        cy.get('input[name="password_confirmation"]')
            .clear()
            .type(password);

        cy.contains("button", "Continue")
            .should("be.visible")
            .click();

        // STEP 2
        

        cy.get('input[name="company_name"]', {
            timeout: 20000
        }).should("be.visible");

        cy.get('input[name="company_name"]')
            .clear()
            .type("Automation Company");

        
        // COUNTRY
        

        cy.get("#incorporationCountryBtn")
            .should("be.visible")
            .click();

        cy.contains("span", "United States")
            .click({ force: true });

        cy.get("#incorporationCountryName")
            .should("contain", "United States");


        // SHOPIFY STORE
    

        cy.get('input[name="shopify_url"]')
            .clear()
            .type("store33-2wzacbz8");

    
        // MONTHLY REVENUE
        

        cy.get("#monthly_revenue")
            .select("0-15.000");

        // PIXEL INTEGRATION


        cy.get("#pixelIntegrationBtn")
            .click();

        cy.contains("span", "Trackbee.nl")
            .click({ force: true });

        cy.get("#pixelIntegrationDisplay")
            .should("contain", "Trackbee.nl");

    
        // PAYMENT PROVIDER
    

        cy.get("#paymentProviderBtn")
            .click();

        cy.contains("span", "Viva.com")
            .click({ force: true });

        cy.get("#paymentProviderDisplay")
            .should("contain", "Viva.com");

        cy.log("Complete the CAPTCHA manually.");

cy.log("The test is now paused. Complete the CAPTCHA, then click Resume in Cypress.");

cy.pause();

// Give the page a moment after resuming

cy.wait(3000);

// SIGN UP

cy.contains("button", "Sign Up")
    .should("be.visible")
    .should("not.be.disabled")
    .click();

        // EMAIL VERIFICATION PAGE


        cy.url({ timeout: 30000 })
            .should("include", "email");

        cy.log("Email verification page displayed.");

        cy.wait(3000);

        // OPEN YOPMAIL


        cy.visit(`https://yopmail.com/en/?login=${inbox}`);

        cy.wait(5000);

       

        cy.get("iframe#ifinbox", { timeout: 30000 })
            .its("0.contentDocument.body")
            .should("not.be.empty")
            .then(cy.wrap)
            .contains("Verify Email Address")
            .click({ force: true });

        cy.wait(3000);

       

        cy.get("iframe#ifmail", { timeout: 30000 })
            .its("0.contentDocument.body")
            .should("not.be.empty")
            .then(cy.wrap)
            .find('a[href*="/email/verify/"]')
            .should("exist")
            .invoke("attr", "href")
            .then((verifyUrl) => {

                cy.log("Verification URL:");
                cy.log(verifyUrl);

                cy.visit(verifyUrl);

            });

       

        cy.url({ timeout: 30000 })
            .should("include", "/email/verify");

        cy.wait(3000);

        
        cy.visit("https://checkypro.robustapps.net/login");

        cy.get('input[name="email"]')
            .type(email);

        cy.get('input[name="password"]')
            .type(password);

        cy.contains("button", "Login")
            .click();

        

        cy.url({ timeout: 30000 })
            .should("include", "dashboard");

    });

});