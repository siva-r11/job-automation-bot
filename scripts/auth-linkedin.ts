import { chromium } from 'playwright';

async function generateSession() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Navigating to LinkedIn login...");
    await page.goto('https://www.linkedin.com/login');
    console.log("Please log in manually. Waiting for the feed to load...");
    
    await page.waitForURL('https://www.linkedin.com/feed/', { timeout: 120000 });
    await context.storageState({ path: './auth/linkedin_session.json' });
    
    console.log("LinkedIn authentication saved!");
    await browser.close();
}
generateSession();