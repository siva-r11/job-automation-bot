import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Load centralized configurations
const configPath = path.resolve(__dirname, '../data/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const { linkedinSearch, answers } = config;

async function startEndToEndApply() {
    const browser = await chromium.launch({ headless: false }); 
    const context = await browser.newContext({ storageState: './auth/linkedin_session.json' });
    const page = await context.newPage();

    let currentPage = 1;
    const maxPages = 5; // Prevent the bot from running forever

    while (currentPage <= maxPages) {
        const startParam = (currentPage - 1) * 25; // LinkedIn paginates by 25
        const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(linkedinSearch.jobRole)}&location=${encodeURIComponent(linkedinSearch.location)}&f_AL=true&start=${startParam}`;
        
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
        console.log(`\n--- Scanning Page ${currentPage} ---`);

        // Wait for the left panel to load job cards
        await page.waitForSelector('.job-card-container', { timeout: 10000 }).catch(() => console.log("No jobs found on this page."));
        const jobCards = page.locator('.job-card-container');
        const jobCardCount = await jobCards.count();
        
        if (jobCardCount === 0) break; 

        // 1. Scroll the left pane to trigger lazy-loading for all 25 cards
        for (let i = 0; i < jobCardCount; i++) {
            await withFreshJobCard(page, i, card => card.scrollIntoViewIfNeeded());
            await page.waitForTimeout(200); 
        }

        const freshJobCardCount = await page.locator('.job-card-container').count();
        
        // 2. Click each job card
        for (let i = 0; i < freshJobCardCount; i++) {
            await withFreshJobCard(page, i, async card => {
                await card.scrollIntoViewIfNeeded();
                await card.click();
            });
            await page.waitForTimeout(2500); // Wait for the right pane to populate

            // 3. Locate the apply button in the right pane
            const rightPane = page.locator('.jobs-search__job-details').or(page.locator('.job-view-layout'));
            const applyButton = rightPane
                .getByRole('button', { name: /^Easy Apply(?: to .*)?$/i })
                .first();
            
            if (await applyButton.isVisible()) {
                console.log(`Applying to job ${i + 1} on page ${currentPage}...`);
                await applyButton.click();
                
                // Trigger the modal flow
                const success = await handleApplicationModal(page);
                if (success) console.log("✅ Successfully submitted.");
                else console.log("⚠️ Skipped (blocked by complex question).");
            } else {
                console.log(`Job ${i + 1} is not Easy Apply. Skipping.`);
            }
        }
        currentPage++;
    }

    console.log("Finished end-to-end execution.");
    await browser.close();
}

async function withFreshJobCard(
    page: Page,
    index: number,
    action: (card: ReturnType<Page['locator']>) => Promise<void>
): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await action(page.locator('.job-card-container').nth(index));
            return;
        } catch (error) {
            const isDetached = error instanceof Error && error.message.includes('not attached to the DOM');
            if (!isDetached || attempt === 3) throw error;
            await page.waitForTimeout(300);
        }
    }
}

async function handleApplicationModal(page: Page): Promise<boolean> {
    let modalOpen = true;
    let submitted = false;
    let stuckCounter = 0; // Prevents infinite loops on broken forms

    while (modalOpen && stuckCounter < 10) {
        await page.waitForTimeout(1500);

        // Analyze all questions currently visible in the modal
        const formGroups = await page.locator('.jobs-easy-apply-form-section__item').all();
        
        for (const group of formGroups) {
            const labelText = await group.innerText().catch(() => '').then(t => t.toLowerCase());

            // A. Handle Text & Number Inputs
            const textInput = group.locator('input[type="text"], input[type="number"]');
            if (await textInput.isVisible()) {
                const currentVal = await textInput.inputValue();
                if (!currentVal) { // Only fill if empty
                    let answered = false;
                    for (const [key, value] of Object.entries(answers.keywords)) {
                        if (labelText.includes(key)) {
                            await textInput.fill(String(value));
                            answered = true; break;
                        }
                    }
                    if (!answered && labelText.includes('experience')) await textInput.fill(answers.generalExperience);
                }
            }

            // B. Handle Radio Buttons (Yes/No)
            const radioGroup = group.locator('fieldset');
            if (await radioGroup.isVisible()) {
                if (labelText.includes('citizenship') || labelText.includes('authorized')) {
                    await radioGroup.locator('label', { hasText: new RegExp(answers.keywords.authorized, "i") }).click().catch(() => {});
                } else if (labelText.includes('sponsorship')) {
                    await radioGroup.locator('label', { hasText: new RegExp(answers.keywords.sponsorship, "i") }).click().catch(() => {});
                }
            }

            // C. Handle File Uploads (Resume)
            const fileInput = group.locator('input[type="file"]');
            if (await fileInput.isVisible() && answers.resumePath) {
                await fileInput.setInputFiles(answers.resumePath).catch(() => console.log("File upload failed."));
            }
        }

        // D. Navigate the Modal
        const nextBtn = page.locator('button[aria-label="Continue to next step"]');
        const reviewBtn = page.locator('button[aria-label="Review your application"]');
        const submitBtn = page.locator('button[aria-label="Submit application"]');
        const errorMsg = page.locator('.artdeco-inline-feedback--error');
        
        if (await submitBtn.isVisible()) {
            await submitBtn.click(); // *** THIS SUBMITS THE APPLICATION ***
            await page.waitForTimeout(3000);
            
            // Close the post-application success modal
            const doneBtn = page.locator('button:has-text("Done"), button[aria-label="Dismiss"]');
            if (await doneBtn.isVisible()) {
                await doneBtn.first().click();
            }
            submitted = true;
            modalOpen = false;
        } 
        else if (await reviewBtn.isVisible()) {
            await reviewBtn.click();
            stuckCounter++;
        } 
        else if (await nextBtn.isVisible()) {
            await nextBtn.click();
            await page.waitForTimeout(1000);
            
            // FAILSAFE: If hitting 'Next' triggers a red validation error (mandatory question we couldn't answer)
            if (await errorMsg.isVisible()) {
                console.log("Encountered unhandled mandatory question. Discarding to prevent freeze...");
                await page.locator('button[aria-label="Dismiss"]').click(); 
                await page.locator('button[data-control-name="discard_application_confirm_btn"]').click();
                modalOpen = false;
            }
            stuckCounter++;
        } else {
            modalOpen = false; 
        }
    }
    return submitted;
}

startEndToEndApply();