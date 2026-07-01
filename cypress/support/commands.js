Cypress.Commands.add("openYopmailEmail", (inbox) => {

    cy.origin("https://yopmail.com", { args: { inbox } }, ({ inbox }) => {

        cy.visit(`/en/?login=${inbox}`);

        // Wait for email to load
        cy.wait(5000);

        // Read the email body iframe
        cy.get("iframe#ifmail", { timeout: 30000 })
            .its("0.contentDocument.body")
            .should("not.be.empty")
            .then(cy.wrap)
            .then(($body) => {

                // Print HTML to browser console
                console.log($body.html());

                // Extract reset link
                const html = $body.html();

                const match = html.match(/https?:\/\/[^"]*reset-password[^"]*/);

                expect(match, "Reset Password URL").to.not.be.null;

                cy.visit(match[0]);

            });

    });

});