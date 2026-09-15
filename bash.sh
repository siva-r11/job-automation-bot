mkdir job-automation-bot
cd job-automation-bot
mkdir data auth scripts
npm init -y
npm install -D @playwright/test typescript ts-node @types/node
npx playwright install chromium