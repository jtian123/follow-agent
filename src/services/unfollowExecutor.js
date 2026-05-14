import { getPage, navigateTo, randomDelay, wait, getCurrentAccount, login } from '../utils/browser.js';
import {
  incrementTodayUnfollowCount,
  getTodayUnfollowCount,
  getCooldownUsernames,
  markAsUnfollowed,
} from '../utils/database.js';
import { existsByXPath, clickByXPath } from '../utils/helpers.js';

const MIN_DELAY = 10000;  // 10 seconds
const MAX_DELAY = 20000;  // 20 seconds

/**
 * Extract list of users that the current account is following
 * @param {number} maxUsers - Maximum number of users to extract (default: 1000)
 * @returns {Promise<Array<string>>} - Array of usernames
 */
export async function extractCurrentFollowing(maxUsers = 1000) {
  const page = getPage();
  const accountName = getCurrentAccount();

  console.log('\n📋 Extracting your current following list...');
  console.log(`   (Using account: ${accountName})\n`);

  // Navigate to Instagram home
  await navigateTo('https://www.instagram.com/');
  await wait(3000);

  // Click on the Profile button in navigation using XPath
  console.log('🔍 Looking for Profile button in navigation...');
  try {
    // Try clicking on link/button containing "Profile" text
    const clicked = await clickByXPath(page, "//a[contains(., 'Profile')] | //span[contains(., 'Profile')]/parent::a | //*[contains(text(), 'Profile')]/ancestor::a");

    if (!clicked) {
      // Fallback: try to find profile link by looking for single-path URLs in nav
      console.log('   ⚠️  Profile text not found, trying alternative method...');
      const altClicked = await page.evaluate(() => {
        const navLinks = document.querySelectorAll('nav a[href^="/"]');
        for (const link of navLinks) {
          const href = link.getAttribute('href');
          const match = href.match(/^\/([^\/]+)\/?$/);
          if (match && match[1] &&
              match[1] !== 'explore' &&
              match[1] !== 'reels' &&
              match[1] !== 'direct' &&
              match[1] !== 'accounts' &&
              match[1] !== 'create') {
            link.click();
            return true;
          }
        }
        return false;
      });

      if (!altClicked) {
        // Check if we've been logged out — if so, re-login and retry
        const isOnLoginPage = await page.$('input[name="username"]');
        if (isOnLoginPage) {
          console.log('\n⚠️  Session expired — Instagram requires you to log in again.');
          console.log('🔐 Please log in manually in the browser window. You have 5 minutes.\n');
          await login();
          // Retry navigation to home and profile click
          await navigateTo('https://www.instagram.com/');
          await wait(3000);
          const retryClicked = await clickByXPath(page, "//a[contains(., 'Profile')] | //span[contains(., 'Profile')]/parent::a | //*[contains(text(), 'Profile')]/ancestor::a");
          if (!retryClicked) throw new Error('Could not find Profile button after re-login');
        } else {
          throw new Error('Could not find Profile button');
        }
      }
    }

    console.log('✅ Clicked Profile button');
    await wait(3000);
  } catch (err) {
    console.error('❌ Error clicking Profile button:', err.message);
    throw err;
  }

  // Get username from current URL
  let loggedInUsername;
  try {
    const currentUrl = page.url();
    const match = currentUrl.match(/instagram\.com\/([^\/\?]+)/);

    if (match && match[1]) {
      loggedInUsername = match[1];
      console.log(`✅ Detected logged-in user: @${loggedInUsername}\n`);
    } else {
      throw new Error('Could not extract username from URL');
    }
  } catch (err) {
    console.error('❌ Error detecting username:', err.message);
    throw err;
  }

  // Find and click the "following" link to open the dialog
  console.log('🔍 Looking for "following" button...');
  try {
    // Try to find and click the following count link (e.g., "123 following")
    const clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const followingLink = links.find(link =>
        link.href.includes('/following') ||
        link.textContent.toLowerCase().includes('following')
      );

      if (followingLink) {
        followingLink.click();
        return true;
      }
      return false;
    });

    if (clicked) {
      console.log('✅ Found and clicked "following" button');
      await wait(2000);
    } else {
      throw new Error('Could not find "following" button on profile');
    }
  } catch (err) {
    console.error('❌ Could not find or click "following" button');
    throw err;
  }

  // Wait for the following dialog to appear
  console.log('⏳ Waiting for following list dialog to load...');
  try {
    await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
  } catch (err) {
    console.error('❌ Following dialog not found. Make sure you\'re logged in and the page loaded correctly.');
    throw err;
  }

  console.log('✅ Following list loaded!\n');

  // Scroll through the dialog to load all users
  console.log('🔄 Scrolling to load all following users...');
  const followingUsers = new Set();
  let previousCount = 0;
  let noChangeCount = 0;

  while (followingUsers.size < maxUsers) {
    // Extract usernames from the dialog
    const newUsers = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return [];

      const userLinks = dialog.querySelectorAll('a[href^="/"][role="link"]');
      const usernames = [];

      userLinks.forEach(link => {
        const href = link.getAttribute('href');
        const username = href.replace(/\//g, '');
        // Filter out empty strings and system links
        if (username && username !== 'explore' && username !== 'reels' && !username.includes('/')) {
          usernames.push(username);
        }
      });

      return usernames;
    });

    // Add new users to set
    newUsers.forEach(username => followingUsers.add(username));

    // Check if we got new users
    if (followingUsers.size === previousCount) {
      noChangeCount++;
      if (noChangeCount >= 3) {
        console.log(`   ✅ Reached end of following list (no new users after 3 attempts)`);
        break;
      }
    } else {
      noChangeCount = 0;
    }

    previousCount = followingUsers.size;
    console.log(`   📊 Extracted ${followingUsers.size} users so far...`);

    // Scroll the dialog - use robust method to find scrollable element
    await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (dialog) {
        // Search ALL elements to find the scrollable one
        const allElements = dialog.querySelectorAll('*');
        const scrollContainer = Array.from(allElements).find(el => {
          return el.scrollHeight > el.clientHeight;
        });
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      }
    });

    await wait(randomDelay(1500, 2500)); // Wait for new users to load
  }

  // IG's following modal renders most-recent follows near the top and older
  // ones toward the bottom. Reverse so the array is oldest-first — the safe
  // direction to unfollow from (avoids same-day follow→unfollow patterns).
  const userList = Array.from(followingUsers).reverse();
  console.log(`\n✅ Extraction complete! Found ${userList.length} users you're following (oldest-first)\n`);

  return userList;
}

/**
 * Build the unfollow target list from the live following list only.
 *
 * Scrapes up to `scanLimit` usernames (oldest-first thanks to the reverse
 * inside extractCurrentFollowing), drops anyone in the 72h cooldown set,
 * and returns the result. The unfollow loop will pick the first
 * `sessionLimit` of these.
 *
 * @param {number} scanLimit - Max usernames to scrape from the live list
 * @param {number} minHoursOld - Cooldown window (hours since follow)
 */
async function getUnfollowCandidates(scanLimit, minHoursOld = 72) {
  const accountName = getCurrentAccount();
  console.log(`\n🔎 Live-scraping ${accountName}'s following list (up to ${scanLimit} users)...`);

  const liveList = await extractCurrentFollowing(scanLimit);

  const cooldown = await getCooldownUsernames(minHoursOld);
  console.log(`   ⏱️  Cooldown set: ${cooldown.size} usernames followed in last ${minHoursOld}h (any account)`);

  const candidates = [];
  let cooldownSkipped = 0;
  for (const u of liveList) {
    if (cooldown.has(u)) { cooldownSkipped++; continue; }
    candidates.push(u);
  }
  console.log(`   ✅ ${candidates.length} eligible candidates after cooldown filter (${cooldownSkipped} skipped)`);
  return { candidates };
}

// Detect the "Follows you" badge that IG shows on a profile when the viewed
// user follows the logged-in account back. We skip mutuals — keeping mutuals
// is the cheapest way to improve the follow:follower ratio without losing
// engagement.
async function isMutualFollower(page) {
  return await page.evaluate(() => {
    // Limit the search to the profile header to avoid false positives in
    // other surfaces (suggestions, related accounts, etc.).
    const header = document.querySelector('header') || document.body;
    const text = header.innerText || '';
    return /\bFollows you\b/i.test(text);
  });
}

// Detect the follow-state of the currently-loaded profile by reading the
// primary action button. IG renders this as either <button> or
// <div role="button"> depending on layout/A-B test, so we accept both.
// Returns 'following' | 'requested' | 'follow' | 'unknown'.
//
// 'unknown' means the page hadn't rendered the action button when we looked
// (rate-limit, network hiccup, layout we don't recognize). The caller MUST
// NOT mutate DB state on 'unknown' — destroying state on a detection failure
// is exactly the bug that just cost us 60 rows.
async function getFollowState(page) {
  // Poll briefly for one of the action buttons to render before declaring
  // unknown — IG profiles often paint header before the action button.
  await page.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll('header button, header [role="button"]'));
    return els.some(el => {
      const t = (el.innerText || '').trim();
      return t === 'Follow' || t === 'Following' || t === 'Requested' ||
             t === 'Follow Back' || t === 'Follow back';
    });
  }, { timeout: 5000 }).catch(() => {});

  return await page.evaluate(() => {
    const header = document.querySelector('header') || document.body;
    const els = Array.from(header.querySelectorAll('button, [role="button"]'));
    for (const el of els) {
      const t = (el.innerText || '').trim();
      if (t === 'Following') return 'following';
      if (t === 'Requested') return 'requested';
      if (t === 'Follow' || t === 'Follow Back' || t === 'Follow back') return 'follow';
    }
    return 'unknown';
  });
}

/**
 * Unfollow a list of users with proper rate limiting
 * @param {Array<string>} usernames - Array of usernames to unfollow
 * @param {number} sessionLimit - Max unfollows for this session
 * @returns {Promise<Object>} - Summary of unfollows
 */
export async function executeUnfollows(usernames, sessionLimit = 150) {
  const page = getPage();
  const todayCount = await getTodayUnfollowCount();

  console.log('\n' + '='.repeat(60));
  console.log('🔄 STARTING UNFOLLOW PROCESS');
  console.log('='.repeat(60));
  console.log(`📊 Today's unfollows: ${todayCount}`);
  console.log(`📋 Users in list: ${usernames.length}`);
  console.log(`🎯 Session limit: ${sessionLimit}\n`);

  if (usernames.length === 0) {
    console.log('⚠️  No users to unfollow!');
    return { unfollowed: 0, errors: 0 };
  }

  let unfollowedCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < Math.min(usernames.length, sessionLimit); i++) {
    const username = usernames[i];

    try {
      console.log(`[${i + 1}/${Math.min(usernames.length, sessionLimit)}] 👤 Processing: @${username}`);

      // Navigate to user profile
      await navigateTo(`https://www.instagram.com/${username}/`);
      await wait(randomDelay(2000, 3000));

      // Read the profile's action-button state. Robust against <button> vs
      // <div role="button"> markup variants.
      const state = await getFollowState(page);

      if (state === 'follow') {
        // Positive confirmation we are NOT following — safe to reconcile DB.
        console.log(`   ⏭️  Not following @${username} (button reads "Follow")`);
        try { await markAsUnfollowed(username, getCurrentAccount()); } catch (_) {}
        skippedCount++;
        continue;
      }

      if (state === 'unknown') {
        // Page didn't render an action button we recognize. DO NOT mutate DB
        // here — we don't know the truth. Just skip and try again next run.
        console.log(`   ⚠️  @${username} — could not detect follow state (page may not have loaded). Leaving DB unchanged.`);
        errorCount++;
        continue;
      }

      // Skip mutual followers — improves follow:follower ratio cheaply, and
      // unfollowing engaged accounts is wasteful.
      if (await isMutualFollower(page)) {
        console.log(`   🤝 @${username} follows you back — skipping (mutual)`);
        skippedCount++;
        continue;
      }

      // state is 'following' or 'requested' — proceed to unfollow.
      // Click the action button to open the unfollow menu (covers both
      // <button> and <div role="button"> markup).
      const followingClicked = await page.evaluate(() => {
        const header = document.querySelector('header') || document.body;
        const els = Array.from(header.querySelectorAll('button, [role="button"]'));
        for (const el of els) {
          const t = (el.innerText || '').trim();
          if (t === 'Following' || t === 'Requested') {
            el.click();
            return true;
          }
        }
        return false;
      });

      if (!followingClicked) {
        console.log(`   ⚠️  Could not find Following button for @${username}`);
        errorCount++;
        continue;
      }

      // Wait for the popup menu to appear and become stable
      console.log(`   ⏳ Waiting for menu to appear...`);
      await wait(3000);

      // Find and click "Unfollow" in the popup - must be precise
      console.log(`   🔍 Looking for Unfollow button in menu...`);
      const unfollowClicked = await page.evaluate(() => {
        // Look for all clickable elements
        const allElements = Array.from(document.querySelectorAll('button, div[role="button"], span, div'));

        // Find element with EXACT text "Unfollow" (trimmed, no extra text)
        const unfollowElement = allElements.find(el => {
          const text = el.textContent.trim();
          return text === 'Unfollow';
        });

        if (unfollowElement) {
          console.log('Found Unfollow element:', unfollowElement.tagName, unfollowElement.className);
          unfollowElement.click();
          return true;
        }

        // Fallback: Look for any element containing only "Unfollow" and visible
        const fallbackElement = allElements.find(el => {
          const text = el.textContent.trim();
          const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0;
          return text === 'Unfollow' && isVisible;
        });

        if (fallbackElement) {
          console.log('Found Unfollow (fallback):', fallbackElement.tagName);
          fallbackElement.click();
          return true;
        }

        return false;
      });

      if (unfollowClicked) {
        console.log(`   ✅ Clicked Unfollow button`);
      } else {
        console.log(`   ❌ Could not find Unfollow button`);
      }

      if (unfollowClicked) {
        // Wait for popup to close and page to update
        await wait(2000);

        // Verify by re-reading the action-button state.
        const stateAfter = await getFollowState(page);
        const nowFollowButton = stateAfter === 'follow';

        if (nowFollowButton) {
          console.log(`   ✅ Unfollowed @${username}`);

          // Increment counter
          await incrementTodayUnfollowCount();
          try { await markAsUnfollowed(username, getCurrentAccount()); } catch (_) {}
          unfollowedCount++;
        } else {
          console.log(`   ⚠️  Unfollow action did not complete for @${username} (button still shows Following)`);
          errorCount++;
        }

        await wait(randomDelay(500, 1000));
      } else {
        console.log(`   ⚠️  Unfollow button not found for @${username}`);
        errorCount++;
      }

      // Delay between unfollows (10-20 seconds)
      if (i < Math.min(usernames.length, sessionLimit) - 1) {
        const delay = randomDelay(MIN_DELAY, MAX_DELAY);
        const seconds = Math.floor(delay / 1000);
        console.log(`   ⏳ Waiting ${seconds}s before next user...\n`);
        await wait(delay);
      }

    } catch (err) {
      console.error(`   ❌ Error unfollowing @${username}:`, err.message);
      errorCount++;

      // Check if we got action blocked
      try {
        const actionBlockText = await page.evaluate(() => document.body.innerText);
        if (actionBlockText.includes('Try Again Later') || actionBlockText.includes('Action Blocked')) {
          console.error('\n⛔ ACTION BLOCKED BY INSTAGRAM!');
          console.error('🛑 Stopping to prevent further restrictions.');
          console.error('💡 Wait several hours before trying again.\n');
          break;
        }
      } catch (err) {
        // Ignore evaluation errors
      }
    }
  }

  const summary = {
    unfollowed: unfollowedCount,
    skipped: skippedCount,
    errors: errorCount,
    remaining: usernames.length - Math.min(usernames.length, sessionLimit)
  };

  console.log('\n' + '='.repeat(60));
  console.log('📊 UNFOLLOW SESSION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully unfollowed: ${summary.unfollowed}`);
  console.log(`⏭️  Skipped: ${summary.skipped}`);
  console.log(`❌ Errors: ${summary.errors}`);
  const finalTodayUnfollowCount = await getTodayUnfollowCount();
  console.log(`📈 Total unfollowed today: ${finalTodayUnfollowCount}`);
  console.log(`📋 Remaining in list: ${summary.remaining}`);
  console.log('='.repeat(60) + '\n');

  return summary;
}

/**
 * Main function to unfollow stale followings.
 *
 * Args map directly to the CLI: `npm run unfollow -- <sessionLimit> <maxExtract>`.
 *   sessionLimit — max unfollows performed this session
 *   maxExtract   — how many users to scrape from the live following list
 *                  (the deeper into the list, the older the follows we surface)
 *
 * The full live list is scraped up to `maxExtract`, reversed so the bottom
 * of IG's modal (oldest follows) comes first, cooldown-filtered, then the
 * first `sessionLimit` non-mutual non-following entries get unfollowed.
 */
export async function unfollowAll(sessionLimit = 50, maxExtract = 1000, minHoursOld = 72) {
  console.log('\n🚀 Starting unfollow process...');
  console.log(`📊 Session limit: ${sessionLimit} unfollows`);
  console.log(`📜 Live-list scan: up to ${maxExtract} users (oldest-first after reverse)`);
  console.log(`⏱️  Cooldown: only users followed ≥${minHoursOld}h ago`);
  console.log(`🤝 Mutual followers will be skipped\n`);

  const { candidates } = await getUnfollowCandidates(maxExtract, minHoursOld);

  if (candidates.length === 0) {
    console.log('✅ No eligible candidates after cooldown filter — try a larger second arg to scan deeper into the list.');
    return { unfollowed: 0, errors: 0 };
  }

  const summary = await executeUnfollows(candidates, sessionLimit);
  return summary;
}
