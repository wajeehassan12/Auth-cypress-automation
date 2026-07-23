class RegisterPage {
    visit() {
        cy.visit('/register');
        cy.url({ timeout: 15000 }).should('include', '/register');
    }

    fillPersonalDetails(data, email) {
        cy.get('input[name="name"]', { timeout: 15000 }).should('be.visible').clear().type(data.firstName);
        cy.get('input[name="last_name"]').should('be.visible').clear().type(data.lastName);
        cy.get('input[name="email"]').should('be.visible').clear().type(email);
        cy.get('input[name="phone_number"]').should('be.visible').clear().type(data.phone);
        cy.get('input[name="password"]').should('be.visible').clear().type(data.password, { log: false });
        cy.get('input[name="password_confirmation"]').should('be.visible').clear().type(data.password, { log: false });

        cy.contains('button', /continue/i)
            .should('be.visible')
            .click();
    }

    fillCompanyDetails(data) {
        cy.get('input[name="company_name"]', { timeout: 20000 }).should('be.visible').clear().type(data.companyName);

        // Incorporation Country
        cy.get('#incorporationCountryBtn').should('be.visible').click();
        cy.get('span').contains(new RegExp(data.country, 'i')).should('be.visible').click();
        cy.get('#incorporationCountryName').should('contain', data.country);

        // Shopify URL
        cy.get('input[name="shopify_url"]').should('be.visible').clear().type(data.shopifyUrl);

        // Monthly Revenue
        cy.get('#monthly_revenue').should('be.visible').select(data.revenue);

        // Pixel Integration
        cy.get('#pixelIntegrationBtn').should('be.visible').click();
        cy.get('span').contains(new RegExp(data.pixelIntegration, 'i')).should('be.visible').click();
        cy.get('#pixelIntegrationDisplay').should('contain', data.pixelIntegration);

        // Payment Provider
        cy.get('#paymentProviderBtn').should('be.visible').click();
        cy.get('span').contains(new RegExp(data.paymentProvider, 'i')).should('be.visible').click();
        cy.get('#paymentProviderDisplay').should('contain', data.paymentProvider);
    }

    clickSignUp() {
        cy.contains('button', /sign up/i)
            .should('be.visible')
            .should('not.be.disabled')
            .click();
    }

    assertEmailVerificationNotice() {
        cy.url({ timeout: 30000 }).should('include', 'email');
    }
}

export default new RegisterPage();