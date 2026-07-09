Cypress.Commands.add("openYopmailEmail", (inbox) => {

    cy.origin("https://yopmail.com", { args: { inbox } }, ({ inbox }) => {

        cy.visit(`/en/?login=${inbox}`);

        // Fix: Removed hardcoded cy.wait(5000) (Review Item 2)
        // Instead, we dynamically wait for the email layout iframe to become visible
        cy.get("iframe#ifmail", { timeout: 30000 })
            .should("be.visible");

        // Read the email body iframe
        cy.get("iframe#ifmail")
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

                // Navigate directly to the extracted reset link URL
                cy.visit(match[0]);

            });

    });

});