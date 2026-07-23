import registerPage from '../../page-objects/register-page';
import loginPage from '../../page-objects/login-page';

describe('CheckyPro Registration', () => {

    it('Should register a new merchant successfully', () => {
        cy.fixture('registration').then((data) => {
            // Generate dynamic unique email for repeatable test runs (Part 1, Rule 4)
            const uniqueInbox = `store${Date.now()}`;
            const email = `${uniqueInbox}@yopmail.com`;

            // --- STEP 1 & 2: Registration Setup (Part 2, Rule 1) ---
            registerPage.visit();
            registerPage.fillPersonalDetails(data, email);
            registerPage.fillCompanyDetails(data);

            // --- CAPTCHA INTERMISSION ---
            cy.log('Complete CAPTCHA manually in browser, then click Resume.');
            cy.pause();

            registerPage.clickSignUp();
            registerPage.assertEmailVerificationNotice();

            // --- EMAIL VERIFICATION ZONE (Part 2, Rule 14) ---
            cy.origin('https://yopmail.com', { args: { inbox: uniqueInbox } }, ({ inbox }) => {
                cy.visit(`/en/?login=${inbox}`);

                // Dynamic waiting on iframe contents without fixed sleeps (Part 1, Rule 2)
                cy.get('iframe#ifinbox', { timeout: 30000 }).should('be.visible');

                cy.get('iframe#ifinbox')
                    .its('0.contentDocument.body')
                    .should('not.be.empty')
                    .then(cy.wrap)
                    .contains(/verify email address/i)
                    .should('be.visible')
                    .click();

                cy.get('iframe#ifmail', { timeout: 30000 }).should('be.visible');

                cy.get('iframe#ifmail')
                    .its('0.contentDocument.body')
                    .should('not.be.empty')
                    .then(cy.wrap)
                    .find('a[href*="/email/verify/"]')
                    .should('exist')
                    .invoke('attr', 'href')
                    .then((verifyUrl) => {
                        cy.visit(verifyUrl);
                    });
            });

            // --- POST-VERIFICATION LOGIN (Part 2, Rule 1) ---
            // Reuses existing Page Object method instead of inline commands
            loginPage.login(email, data.password);
        });
    });

});