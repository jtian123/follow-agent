import puppeteer from 'puppeteer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let browser = null;
let page = null;
let currentAccount = null;

// Get account paths based on account name
function getAccountPaths(accountName) {
  const accountDir = join(__dirname, '../../data/accounts', accountName);
  return {
    accountDir,
    cookiesPath: join(accountDir, 'cookies.json'),
    userDataDir: join(accountDir, 'browser-profile')
  };
}

// Set current account (call this before launchBrowser)
export function setAccount(accountName = 'default') {
  currentAccount = accountName;
  console.log(`📱 Using account: ${accountName}`);

  // Create account directory if it doesn't exist
  const { accountDir } = getAccountPaths(accountName);
  if (!fs.existsSync(accountDir)) {
    fs.mkdirSync(accountDir, { recursive: true });
    console.log(`✅ Created account directory: ${accountDir}`);
  }

  return accountName;
}

// Get current account name
export function getCurrentAccount() {
  return currentAccount || 'default';
}

// Launch browser
export async function launchBrowser() {
  // Ensure account is set
  if (!currentAccount) {
    setAccount('default');
  }

  const { cookiesPath, userDataDir } = getAccountPaths(currentAccount);

  browser = await puppeteer.launch({
    headless: false, // Visible browser for human-like behavior
    userDataDir, // Use persistent profile per account
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      // Disable caching to reduce storage usage (cookies still persist)
      '--disk-cache-size=1',
      '--media-cache-size=1',
      '--disable-gpu-shader-disk-cache',
      '--disable-application-cache',
      '--disable-offline-load-stale-cache',
      '--disable-back-forward-cache'
    ],
    defaultViewport: {
      width: 1280,
      height: 800
    }
  });

  page = await browser.newPage();

  // Set user agent
  await page.setUserAgent(USER_AGENT);

  // Remove webdriver property
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
  });

  // Load cookies if they exist
  if (fs.existsSync(cookiesPath)) {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    await page.setCookie(...cookies);
    console.log(`✅ Loaded saved cookies for ${currentAccount}`);
  }

  return { browser, page };
}

// Save cookies
export async function saveCookies() {
  const { cookiesPath } = getAccountPaths(currentAccount || 'default');
  const cookies = await page.cookies();
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  console.log(`✅ Cookies saved for ${currentAccount || 'default'}`);
}

// Check if logged in
export async function isLoggedIn() {
  try {
    // Try networkidle2 first, fall back to domcontentloaded if it times out
    try {
      await page.goto('https://www.instagram.com/', {
        waitUntil: 'networkidle2',
        timeout: 60000 // 60 second timeout
      });
    } catch (err) {
      // If networkidle2 fails, try with domcontentloaded
      console.log(`⚠️  Retrying login check with relaxed conditions...`);
      await page.goto('https://www.instagram.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    }

    await wait(2000);

    // Check for positive signs of being logged in (nav sidebar only exists when logged in)
    const loginForm = await page.$('input[name="username"]');
    if (loginForm) return false;

    // Also confirm we can see logged-in nav elements (home/search/reels icons in sidebar)
    const loggedInNav = await page.$('nav a[href="/"], a[href*="/direct/inbox/"], svg[aria-label="Home"]');
    return loggedInNav !== null;
  } catch (err) {
    console.error('Error checking login status:', err.message);
    return false;
  }
}

// Login to Instagram
export async function login() {
  console.log('🔐 Please login to Instagram manually in the browser...');
  console.log('⏳ Waiting for login...');

  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2' });

  // Wait until user navigates to home page (login successful)
  await page.waitForFunction(
    () => window.location.pathname === '/' || window.location.pathname === '/accounts/onetap/',
    { timeout: 300000 } // 5 minutes to login
  );

  await wait(3000);

  // Save cookies after successful login
  await saveCookies();
  console.log('✅ Login successful!');
}

// Navigate to URL with random delay
export async function navigateTo(url) {
  const delay = randomDelay(2000, 4000);
  await wait(delay);

  try {
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000 // 60 second timeout
    });
  } catch (err) {
    // If networkidle2 fails, try with domcontentloaded
    console.log(`⚠️  Retrying navigation with relaxed conditions...`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
  }

  await wait(randomDelay(1000, 2000));
}

// Random delay helper
export function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Wait/sleep helper (replacement for page.waitForTimeout)
export async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Human-like mouse movement
export async function humanClick(selector) {
  const element = await page.$(selector);
  if (element) {
    const box = await element.boundingBox();
    if (box) {
      // Move to random position within element
      const x = box.x + Math.random() * box.width;
      const y = box.y + Math.random() * box.height;

      await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 10) });
      await wait(randomDelay(100, 300));
      await element.click();
      return true;
    }
  }
  return false;
}

// Scroll with human-like behavior
export async function humanScroll(distance = 300) {
  await page.evaluate((dist) => {
    window.scrollBy({
      top: dist,
      behavior: 'smooth'
    });
  }, distance);
  await wait(randomDelay(500, 1000));
}

// Close browser
export async function closeBrowser() {
  if (browser) {
    await browser.close();
    console.log('🔒 Browser closed');
  }
}

export function getPage() {
  return page;
}

export function getBrowser() {
  return browser;
}
