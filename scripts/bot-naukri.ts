import { chromium } from 'playwright';

async function updateNaukriProfile() {
    const browser = await chromium.launch({ headless: false }); 
    const context = await browser.newContext({ storageState: './auth/naukri_session.json' });
    const page = await context.newPage();

    console.log("Navigating to Naukri profile...");
    await page.goto('https://www.naukri.com/mnjuser/profile');
    await page.waitForLoadState('networkidle');

    const headlineWidget = page.locator('.widgetHead', { hasText: 'Resume Headline' }).locator('..');
    const editButton = headlineWidget.locator('.edit');
    
    await editButton.click();
    await page.waitForTimeout(1500);

    const textArea = page.locator('form[name="resumeHeadlineForm"] #resumeHeadlineTxt').or(page.locator('textarea#resumeHeadlineTxt'));
    let currentText = await textArea.inputValue();

    if (currentText.endsWith(' ')) {
        currentText = currentText.trimEnd();
    } else {
        currentText = currentText + ' ';
    }

    await textArea.fill(currentText);
    await page.waitForTimeout(1000);
    
    const saveButton = page.locator('form[name="resumeHeadlineForm"] button[type="submit"]').or(page.locator('button:has-text("Save")'));
    await saveButton.click();

    await page.waitForTimeout(3000);
    console.log("Naukri profile updated successfully!");

    await browser.close();
}
updateNaukriProfile();