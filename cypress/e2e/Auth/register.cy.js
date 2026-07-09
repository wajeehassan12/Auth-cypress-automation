describe("CheckyPro Registration", () => {

    it("Register Merchant", () => {
        // Dynamic email generation template (Use dynamic strings or env parameters for test repeatability)
        const email = "store33@yopmail.com";
        const password = "Password@123";
        const inbox = email.split("@")[0];

        // Fix: Removed hardcoded base URL, using relative path (Review Item 3)
        cy.visit("/register");

        // --- STEP 1: Personal Details ---
        cy.get('input[name="name"]', { timeout: 10000 })
            .should("be.visible")
            .clear()
            .type("Test");

        cy.get('input[name="last_name"]')
            .should("be.visible")
            .clear()
            .type("Automate");

        cy.get('input[name="email"]')
            .should("be.visible")
            .clear()
            .type(email);

        cy.get('input[name="phone_number"]')
            .should("be.visible")
            .clear()
            .type("3123456789");

        cy.get('input[name="password"]')
            .should("be.visible")
            .clear()
            .type(password);

        cy.get('input[name="password_confirmation"]')
            .should("be.visible")
            .clear()
            .type(password);

        cy.get('button')
            .contains(/Continue/i)
            .should("be.visible")
            .click();

        // --- STEP 2: Company Details ---
        cy.get('input[name="company_name"]', { timeout: 20000 })
            .should("be.visible");

        cy.get('input[name="company_name"]')
            .clear()
            .type("Automation Company");

        // Country Selection
        cy.get("#incorporationCountryBtn")
            .should("be.visible")
            .click();

        cy.get('span')
            .contains(/United States/i)
            .click({ force: true });

        cy.get("#incorporationCountryName")
            .should("contain", "United States");

        // Shopify Store
        cy.get('input[name="shopify_url"]')
            .should("be.visible")
            .clear()
            .type("store33-2wzacbz8");

        // Monthly Revenue Dropdown
        cy.get("#monthly_revenue")
            .should("be.visible")
            .select("0-15.000");

        // Pixel Integration Dropdown
        cy.get("#pixelIntegrationBtn")
            .should("be.visible")
            .click();

        cy.get('span')
            .contains(/Trackbee.nl/i)
            .click({ force: true });

        cy.get("#pixelIntegrationDisplay")
            .should("contain", "Trackbee.nl");

        // Payment Provider Dropdown
        cy.get("#paymentProviderBtn")
            .should("be.visible")
            .click();

        cy.get('span')
            .contains(/Viva.com/i)
            .click({ force: true });

        cy.get("#paymentProviderDisplay")
            .should("contain", "Viva.com");

        // --- CAPTCHA INTERMISSION ---
        cy.log("Complete the CAPTCHA manually.");
        cy.log("The test is now paused. Complete the CAPTCHA, then click Resume in Cypress.");
        cy.pause();

        // Fix: Removed arbitrary 3000ms delay. We check if the Sign Up button becomes interactable dynamically (Review Item 2)
        cy.get('button')
            .contains(/Sign Up/i)
            .should("be.visible")
            .should("not.be.disabled")
            .click();

        // --- EMAIL VERIFICATION ZONE ---
        cy.url({ timeout: 30000 })
            .should("include", "email");

        cy.log("Email verification page displayed.");

        // --- OPEN YOPMAIL (CROSS-ORIGIN BOUNDARY) ---
        // Fix: Swapped direct unsafe window context manipulation with a clean cy.origin container (Review Item 4)
        cy.origin("https://yopmail.com", { args: { inbox } }, ({ inbox }) => {
            cy.visit(`/en/?login=${inbox}`);

            // Wait for internal layout elements to load instead of cy.wait(5000)
            cy.get("iframe#ifinbox", { timeout: 30000 }).should("be.visible");

            cy.get("iframe#ifinbox")
                .its("0.contentDocument.body")
                .should("not.be.empty")
                .then(cy.wrap)
                .contains(/Verify Email Address/i)
                .click({ force: true });

            // Ensure mail reading frame exists
            cy.get("iframe#ifmail", { timeout: 30000 }).should("be.visible");

            cy.get("iframe#ifmail")
                .its("0.contentDocument.body")
                .should("not.be.empty")
                .then(cy.wrap)
                .find('a[href*="/email/verify/"]')
                .should("exist")
                .invoke("attr", "href")
                .then((verifyUrl) => {
                    // Visit the verification link inside the matching origin sub-domain boundary
                    cy.visit(verifyUrl);
                });
        });

        // --- POST-VERIFICATION LOGIN ---
        cy.url({ timeout: 30000 })
            .should("include", "/email/verify");

        // Fix: Changed hardcoded login navigation to relative path (Review Item 3)
        cy.visit("/login");

        cy.get('input[name="email"]:visible')
            .should("be.visible")
            .clear()
            .type(email);

        cy.get('input[name="password"]:visible')
            .should("be.visible")
            .clear()
            .type(password);

        cy.get('button')
            .contains(/Log in/i)
            .click();

        // --- DASHBOARD LANDING ZONE ---
        cy.url({ timeout: 30000 })
            .should("include", "dashboard");
    });
});