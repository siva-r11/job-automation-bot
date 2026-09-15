import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.resolve(__dirname, '../data/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const search = config.naukriSearch ?? config.linkedinSearch;

async function applyThroughNaukri() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: './auth/naukri_session.json' });
    const searchPage = await context.newPage();
    let applications = 0;

    try {
        await searchPage.goto('https://www.naukri.com/mnjuser/homepage', { waitUntil: 'domcontentloaded' });
        await ensureAuthenticated(searchPage);
        await searchForJobs(searchPage);

        for (let pageNumber = 1; pageNumber <= search.maxPages && applications < search.maxApplications; pageNumber++) {
            console.log(`\n--- Scanning Naukri Page ${pageNumber} ---`);
            const jobLinks = getJobLinks(searchPage);
            await jobLinks.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
            const jobCount = await jobLinks.count();

            if (jobCount === 0) {
                console.log('No new jobs found on this page.');
                break;
            }

            for (let index = 0; index < jobCount; index++) {
                if (applications >= search.maxApplications) break;

                let jobPage: Page | undefined;

                try {
                    const freshJobLink = getJobLinks(searchPage).nth(index);
                    await freshJobLink.scrollIntoViewIfNeeded();
                    [jobPage] = await Promise.all([
                        context.waitForEvent('page', { timeout: 10000 }),
                        freshJobLink.click()
                    ]);
                    await jobPage.waitForLoadState('domcontentloaded');
                    await ensureAuthenticated(jobPage);

                    if (await isAlreadyApplied(jobPage)) {
                        console.log(`Job ${index + 1}: already applied. Skipping.`);
                        continue;
                    }

                    const externalApply = jobPage.getByRole('button', { name: /apply on company site/i }).first();
                    if (await externalApply.isVisible()) {
                        console.log(`Job ${index + 1}: external application. Skipping.`);
                        continue;
                    }

                    const applyButton = jobPage
                        .getByRole('button', { name: 'Apply', exact: true })
                        .or(jobPage.locator('button#apply-button'))
                        .first();

                    if (!await applyButton.isVisible()) {
                        console.log(`Job ${index + 1}: no Naukri Apply button. Skipping.`);
                        continue;
                    }

                    console.log(`Job ${index + 1}: applying...`);
                    await applyButton.click();
                    await jobPage.waitForTimeout(2500);

                    if (await isAlreadyApplied(jobPage)) {
                        applications++;
                        console.log(`Applied successfully (${applications}/${search.maxApplications}).`);
                    } else {
                        console.log(`Job ${index + 1}: additional questions require manual input. Skipping.`);
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
                    console.log(`Job ${index + 1}: skipped after error: ${message}`);
                } finally {
                    if (jobPage && !jobPage.isClosed()) await jobPage.close();
                    await searchPage.bringToFront();
                }
            }

            if (pageNumber < search.maxPages && applications < search.maxApplications) {
                const nextButton = searchPage
                    .getByRole('link', { name: /next/i })
                    .or(searchPage.getByRole('button', { name: /next/i }))
                    .first();

                if (!await nextButton.isVisible()) break;
                await Promise.all([
                    searchPage.waitForLoadState('domcontentloaded').catch(() => undefined),
                    nextButton.click()
                ]);
            }
        }

        console.log(`\nFinished. Confirmed Naukri applications: ${applications}.`);
    } finally {
        await browser.close();
    }
}

async function searchForJobs(page: Page): Promise<void> {
    console.log(`Searching Naukri for "${search.jobRole}" in "${search.location}"...`);

    const keywordInput = page.locator(
        'input[placeholder*="Enter keyword"]:visible, input[name="keyword"]:visible, input.suggestor-input:visible'
    ).first();
    const locationInput = page.locator(
        'input[placeholder*="location" i]:visible, input[name="location"]:visible'
    ).first();
    const searchButton = page.locator(
        'button:has-text("Search"):visible, button.qsbSubmit:visible, .nI-gNb-sb__icon-wrapper:visible'
    ).first();

    await keywordInput.waitFor({ state: 'visible', timeout: 15000 });
    await keywordInput.fill(search.jobRole);
    await locationInput.fill(search.location);
    await Promise.all([
        page.waitForURL(url => /job-listings|jobs-in-|jobs\?/i.test(url.toString()), { timeout: 15000 }),
        searchButton.click()
    ]);
}

function getJobLinks(page: Page) {
    return page.locator(
        '.srp-jobtuple-wrapper a.title, article.jobTuple a.title, .jobTupleHeader a.title'
    );
}

async function ensureAuthenticated(page: Page): Promise<void> {
    if (/login\.naukri\.com|nlogin/i.test(page.url())) {
        throw new Error('Naukri session expired. Run npm run auth:naukri and try again.');
    }
}

async function isAlreadyApplied(page: Page): Promise<boolean> {
    const appliedState = page
        .getByRole('button', { name: /^Applied$/i })
        .or(page.getByText(/Applied successfully|Application sent/i))
        .first();
    return appliedState.isVisible();
}

applyThroughNaukri().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});