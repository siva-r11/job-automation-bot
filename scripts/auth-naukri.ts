import { chromium } from 'playwright';

async function generateSession() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Navigating to Naukri login...");
    await page.goto('https://login.naukri.com/nLogin/Login.php');
    console.log("Please log in manually. Waiting for the dashboard to load...");
    
    await page.waitForURL('https://www.naukri.com/mnjuser/homepage', { timeout: 120000 });
    await context.storageState({ path: './auth/naukri_session.json' });
    
    console.log("Naukri authentication saved!");
    await browser.close();
}
generateSession();