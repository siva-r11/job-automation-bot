## Job Automation Bot

Automate job applications and profile updates with Playwright.

### Setup

Run these commands once to create the project and install its dependencies:

```bash
mkdir job-automation-bot
cd job-automation-bot
mkdir data auth scripts
npm init -y
npm install -D @playwright/test typescript ts-node @types/node
npx playwright install chromium
```

### Generate Sessions

Run the authentication scripts once every few weeks, or whenever your stored sessions expire:

```bash
npm run auth:linkedin
npm run auth:naukri
```

The authentication sessions are stored in the `auth` directory.

### Run the Bots

After authentication, run these commands whenever you want the bots to work:

```bash
npm run apply:linkedin
npm run apply:naukri
npm run update:naukri
```

The Naukri bot fills the homepage keyword and location fields, clicks Search, and opens each job in a new tab. After clicking a direct `Apply` button, it closes that tab and returns to the results tab for the next job. It skips external applications and jobs that require additional manual questions. Configure its role, location, page limit, and application limit under `naukriSearch` in `data/config.json`.

### Change the Role

To apply for a different role, open `data/config.json` and change the relevant job title to a value such as `SDET` or `Software Test Engineer`. Then run the corresponding script again:

```bash
npm run apply:linkedin
npm run apply:naukri
```
