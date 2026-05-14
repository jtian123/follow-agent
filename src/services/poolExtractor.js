import { getPage, navigateTo, humanScroll, randomDelay, wait, getCurrentAccount } from '../utils/browser.js';
import { clickByXPath } from '../utils/helpers.js';

// Find and click the followers/following link on a profile page.
// Robust against Instagram swapping <a href> for buttons or delaying render.
async function clickProfileListLink(page, kind) {
  const hrefPattern = `/${kind}/`;

  // Strategy 1: native anchor with href. Use Puppeteer's click for real events.
  try {
    await page.waitForSelector(`a[href*="${hrefPattern}"]`, { timeout: 5000 });
    const link = await page.$(`a[href*="${hrefPattern}"]`);
    if (link) {
      await link.click();
      return { ok: true, strategy: 'anchor' };
    }
  } catch (_) {}

  // Strategy 2: locate by text, click via real mouse event at center coords.
  // page.evaluate returns coordinates; page.mouse.click dispatches a real
  // synthetic mouse event that triggers React/pointer handlers (calling
  // .click() inside the page only fires onclick attrs, not React listeners
  // attached at the root in some Instagram layouts).
  const coords = await page.evaluate((kindArg) => {
    // textContent of "1,234following" (no space) is possible when number/label
    // are sibling spans without whitespace text nodes — allow zero-or-more \s.
    const pattern = new RegExp(`^[\\d,.]+\\s*[KkMm]?\\s*${kindArg}$`, 'i');

    // Pick the smallest matching element (innermost) to avoid grabbing big
    // wrappers whose textContent happens to also match.
    let smallest = null;
    let smallestSize = Infinity;
    for (const el of document.querySelectorAll('a, button, span, div, li')) {
      const text = (el.textContent || '').trim();
      if (!pattern.test(text)) continue;
      const size = (el.outerHTML || '').length;
      if (size < smallestSize) {
        smallestSize = size;
        smallest = el;
      }
    }
    if (!smallest) return null;

    // Walk up to find a clickable ancestor. Broader signals than before:
    // anchor, button, role=button|link, cursor:pointer, or tabindex set.
    let target = smallest;
    let cursor = smallest;
    while (cursor && cursor !== document.body) {
      const tag = cursor.tagName;
      const role = cursor.getAttribute('role');
      const tabindex = cursor.getAttribute('tabindex');
      const style = window.getComputedStyle(cursor);
      if (
        tag === 'A' || tag === 'BUTTON' ||
        role === 'button' || role === 'link' ||
        style.cursor === 'pointer' ||
        tabindex !== null
      ) {
        target = cursor;
        break;
      }
      cursor = cursor.parentElement;
    }

    target.scrollIntoView({ block: 'center' });
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      tag: target.tagName,
      href: target.getAttribute('href'),
      role: target.getAttribute('role'),
      text: (target.textContent || '').trim().slice(0, 80),
    };
  }, kind);

  if (!coords) return { ok: false };

  // Let scrollIntoView settle, then dispatch a real mouse click.
  await wait(300);
  await page.mouse.click(coords.x, coords.y);
  return { ok: true, strategy: 'mouse-click', target: coords };
}

// Instagram's followers/following modal opens in a "mutualOnly" preview
// state when reached by URL navigation (4–5 mutuals + a "See all" link).
// The full virtualized list only mounts after that link is clicked.
// Returns ok=false when the link isn't present (already on the full list).
async function expandToFullList(page, kind) {
  const label = kind === 'followers' ? 'See all followers' : 'See all following';

  const coords = await page.evaluate((labelArg) => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return null;

    let smallest = null;
    let smallestSize = Infinity;
    for (const el of dialog.querySelectorAll('a, button, span, div')) {
      const text = (el.textContent || '').trim();
      if (text.toLowerCase() !== labelArg.toLowerCase()) continue;
      const size = (el.outerHTML || '').length;
      if (size < smallestSize) {
        smallestSize = size;
        smallest = el;
      }
    }
    if (!smallest) return null;

    let target = smallest;
    let cursor = smallest;
    while (cursor && cursor !== dialog) {
      const tag = cursor.tagName;
      const role = cursor.getAttribute('role');
      const tabindex = cursor.getAttribute('tabindex');
      const style = window.getComputedStyle(cursor);
      if (
        tag === 'A' || tag === 'BUTTON' ||
        role === 'button' || role === 'link' ||
        style.cursor === 'pointer' ||
        tabindex !== null
      ) {
        target = cursor;
        break;
      }
      cursor = cursor.parentElement;
    }

    target.scrollIntoView({ block: 'center' });
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      text: (target.textContent || '').trim().slice(0, 80),
    };
  }, label);

  if (!coords) return { ok: false };

  await wait(300);
  await page.mouse.click(coords.x, coords.y);
  return { ok: true, target: coords };
}

// Scroll the user-list modal to load more virtualized rows.
// Picks the scrollable element that contains the most user links (the actual
// list), not just the first wrapper with overflow. Also dispatches scroll/wheel
// events to nudge React/IntersectionObserver-based loaders.
//
// `mode` can be:
//   'bottom' — jump to scrollHeight (default)
//   number   — relative scrollBy (negative = up, positive = down)
async function scrollUserListModal(page, mode = 'bottom') {
  return await page.evaluate((modeArg) => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return { ok: false, reason: 'no-dialog' };

    const candidates = Array.from(dialog.querySelectorAll('*')).filter(el => {
      if (el.scrollHeight <= el.clientHeight + 1) return false;
      const style = window.getComputedStyle(el);
      return style.overflowY === 'auto' || style.overflowY === 'scroll';
    });

    if (candidates.length === 0) {
      const fallback = Array.from(dialog.querySelectorAll('*'))
        .find(el => el.scrollHeight > el.clientHeight + 1);
      if (fallback) candidates.push(fallback);
    }

    let best = null;
    let bestLinks = -1;
    for (const el of candidates) {
      const links = el.querySelectorAll('a[href^="/"]').length;
      if (links > bestLinks) {
        bestLinks = links;
        best = el;
      }
    }

    if (!best) return { ok: false, reason: 'no-scrollable' };

    const before = best.scrollTop;
    if (modeArg === 'bottom') {
      best.scrollTop = best.scrollHeight;
    } else if (typeof modeArg === 'number') {
      best.scrollTop = Math.max(0, best.scrollTop + modeArg);
    }
    best.dispatchEvent(new Event('scroll', { bubbles: true }));
    best.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: typeof modeArg === 'number' ? modeArg : 1000,
      deltaMode: 0,
    }));

    return { ok: true, before, after: best.scrollTop, links: bestLinks };
  }, mode);
}

// Extract users from a pool
export async function extractUsersFromPool(poolUrl, poolType, targetCount = 30) {
  const page = getPage();
  console.log(`🔍 Extracting users from pool: ${poolUrl}`);
  console.log(`📋 Pool type: ${poolType}`);
  console.log(`🎯 Target: ${targetCount}+ NEW users\n`);

  await navigateTo(poolUrl);

  let users = [];

  switch (poolType) {
    case 'post_likers':
      users = await extractPostLikers(targetCount);
      break;
    case 'post_commenters':
      users = await extractPostCommenters(targetCount);
      break;
    case 'account_followers':
      users = await extractAccountFollowers(targetCount);
      break;
    case 'account_following':
      users = await extractAccountFollowing(targetCount);
      break;
    default:
      throw new Error(`Unknown pool type: ${poolType}`);
  }

  console.log(`\n✅ Extraction complete: ${users.length} NEW users found`);
  return users;
}

// Extract users who liked a post
async function extractPostLikers(targetCount = 200, maxScrolls = 200) {
  const page = getPage();
  const { addExtractedUser, isUserExtracted } = await import('../utils/database.js');
  let users = [];
  let newUsersAdded = 0;

  try {
    // Wait for the post to load
    console.log('   ⏳ Waiting for post to load...');
    await wait(randomDelay(3000, 4000));

    // Try multiple strategies to find and click the likes button
    console.log('   🔍 Looking for likes button...');

    let modalOpened = false;

    // Strategy 1: Look for "X likes" text pattern (current Instagram UI)
    console.log('   🔍 Strategy 1: Looking for "X likes" text...');
    modalOpened = await page.evaluate(() => {
      // Look for elements containing the likes count pattern
      const elements = Array.from(document.querySelectorAll('span, a, button, div'));
      for (const el of elements) {
        const text = el.textContent?.trim() || '';
        // Match patterns like "175 likes" or "1,234 likes" (exact pattern with number + "likes")
        if (text.match(/^\d[\d,]*\s+likes?$/i)) {
          console.log(`Found likes element with text: "${text}"`);
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.click();
          return true;
        }
      }
      return false;
    });

    if (modalOpened) {
      console.log('   ✅ Found and clicked likes button (Strategy 1)');
      await wait(1500);
    }

    // Strategy 2: Try the old link selector
    if (!modalOpened) {
      console.log('   ⚠️  Strategy 1 failed, trying Strategy 2 (old selector)...');
      let likesButton = await page.$('a[href*="/liked_by/"]');
      if (likesButton) {
        console.log('   ✅ Found likes link (Strategy 2)');
        await page.evaluate(el => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, likesButton);
        await wait(500);

        try {
          await likesButton.click({ delay: 100 });
        } catch (e) {
          console.log('   ⚠️  Normal click failed, trying JS click...');
          await page.evaluate(el => el.click(), likesButton);
        }

        await wait(1500);
        modalOpened = true;
      }
    }

    // Strategy 3: Try finding by "Liked by" pattern
    if (!modalOpened) {
      console.log('   ⚠️  Strategy 2 failed, trying Strategy 3 (Liked by pattern)...');
      modalOpened = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('span, a, button, div'));
        for (const el of elements) {
          const text = el.textContent || '';
          // Match "Liked by xxx and others" pattern
          if (text.match(/Liked by/i)) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.click();
            return true;
          }
        }
        return false;
      });

      if (modalOpened) {
        console.log('   ✅ Found and clicked likes element (Strategy 3)');
        await wait(1500);
      }
    }

    // Strategy 4: Try XPath for elements containing "like" near numbers
    if (!modalOpened) {
      console.log('   ⚠️  Strategy 3 failed, trying Strategy 4 (XPath)...');
      // Try various XPath patterns
      const xpathPatterns = [
        "//button[contains(text(), 'like')]",
        "//span[contains(text(), 'like')]",
        "//a[contains(text(), 'like')]",
        "//*[contains(@aria-label, 'like')]"
      ];

      for (const xpath of xpathPatterns) {
        const clicked = await clickByXPath(page, xpath);
        if (clicked) {
          console.log(`   ✅ Clicked likes element via XPath (Strategy 4: ${xpath})`);
          modalOpened = true;
          await wait(1500);
          break;
        }
      }
    }

    if (!modalOpened) {
      throw new Error('Could not find likes button after trying all strategies. The post may not have any likes, or Instagram UI has changed.');
    }

    // Wait for modal to open
    console.log('   ⏳ Waiting for likes modal to open...');
    await wait(randomDelay(2000, 3000));

    // Check if modal actually opened - try multiple selectors
    const modalSelector = 'div[role="dialog"]';
    try {
      await page.waitForSelector(modalSelector, { timeout: 10000 });
      console.log('   ✅ Likes modal opened successfully!');

      // Wait for content to load inside modal
      await wait(2000);
      console.log('   ⏳ Waiting for modal content to fully load...');

    } catch (err) {
      // Take a screenshot for debugging
      console.log('   ⚠️  Modal not found with selector "div[role=dialog]"');
      console.log('   🔍 Checking what elements are present...');

      const pageInfo = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        const modals = document.querySelectorAll('[class*="modal"], [class*="Modal"]');
        return {
          dialogCount: dialogs.length,
          modalCount: modals.length,
          hasOverlay: !!document.querySelector('[class*="overlay"], [class*="Overlay"]')
        };
      });

      console.log(`   📊 Found: ${pageInfo.dialogCount} dialogs, ${pageInfo.modalCount} modals, overlay: ${pageInfo.hasOverlay}`);
      throw new Error('Modal did not open after clicking likes button');
    }

    console.log(`   📜 Scrolling to extract ${targetCount} users (max ${maxScrolls} scrolls)...`);

    let previousCount = 0;

    for (let i = 0; i < maxScrolls; i++) {
      try {
        const usernames = await page.evaluate(() => {
          const userLinks = document.querySelectorAll('div[role="dialog"] a[href^="/"]');
          const users = [];

          userLinks.forEach(link => {
            const href = link.getAttribute('href');
            const username = href.replace('/', '').split('/')[0];

            // Filter out invalid usernames
            if (username &&
                !username.includes('?') &&
                !username.includes('p/') &&
                !username.includes('explore') &&
                !username.includes('reels')) {
              users.push(username);
            }
          });

          return users;
        });

        // Deduplicate
        users = [...new Set([...users, ...usernames])];

        // Update count
        if (users.length !== previousCount) {
          previousCount = users.length;
        }
      } catch (evalError) {
        console.log(`   ⚠️  Error extracting usernames on iteration ${i}: ${evalError.message}`);
        // Continue to next iteration
      }

      try {
        await scrollUserListModal(page);
      } catch (scrollError) {
        console.log(`   ⚠️  Error scrolling: ${scrollError.message}`);
      }

      await wait(randomDelay(1500, 2500));

      if (i % 10 === 0 && i > 0) {
        console.log(`   📊 Extracted ${users.length}/${targetCount} users...`);
      }

      // Early exit if we have enough
      if (users.length >= targetCount) {
        console.log(`\n   ✅ Target reached: ${users.length} users extracted`);
        break;
      }
    }

    // Check if we hit max scrolls without reaching target
    if (users.length < targetCount) {
      console.log(`\n   ⚠️  Reached max scrolls (${maxScrolls}) with ${users.length} users`);
    }

    // Close modal
    const closeButton = await page.$('svg[aria-label="Close"]');
    if (closeButton) {
      await closeButton.click();
      await wait(1000);
    }

  } catch (err) {
    console.error('Error extracting post likers:', err.message);
  }

  console.log(`\n   💾 Saving ${users.length} users to database...`);

  // Get pool info from URL
  const poolUrl = page.url().split('?')[0]; // Remove query params
  const poolType = 'post_likers';
  const accountName = getCurrentAccount();

  // Save to database
  for (const username of users) {
    if (!(await isUserExtracted(username))) {
      if (await addExtractedUser(username, poolUrl, poolType, accountName)) {
        newUsersAdded++;
      }
    }
  }

  console.log(`   ✅ Added ${newUsersAdded} NEW users to queue`);
  console.log(`   ⏭️  Skipped ${users.length - newUsersAdded} (already in database)`);

  return users;
}

// Extract users who commented on a post
async function extractPostCommenters() {
  const page = getPage();
  let users = [];

  try {
    await wait(randomDelay(2000, 3000));

    // Scroll down to load comments
    for (let i = 0; i < 3; i++) {
      await humanScroll(500);
    }

    // Extract usernames from comments
    const commentUsers = await page.evaluate(() => {
      const commentElements = document.querySelectorAll('a[href^="/"]');
      const usernames = [];

      commentElements.forEach(el => {
        const href = el.getAttribute('href');
        const username = href.replace('/', '').split('/')[0];
        if (username && !username.includes('?') && !username.includes('p/')) {
          usernames.push(username);
        }
      });

      return usernames;
    });

    users.push(...commentUsers);

    // Click "View all comments" if available
    const viewMoreClicked = await clickByXPath(page, "//button[contains(text(), 'View all')]");
    if (viewMoreClicked) {
      await wait(randomDelay(2000, 3000));

      // Extract more usernames
      const moreUsers = await page.evaluate(() => {
        const commentElements = document.querySelectorAll('a[href^="/"]');
        const usernames = [];

        commentElements.forEach(el => {
          const href = el.getAttribute('href');
          const username = href.replace('/', '').split('/')[0];
          if (username && !username.includes('?') && !username.includes('p/')) {
            usernames.push(username);
          }
        });

        return usernames;
      });

      users.push(...moreUsers);
    }

  } catch (err) {
    console.error('Error extracting post commenters:', err.message);
  }

  // Remove duplicates
  return [...new Set(users)];
}

// Extract followers of an account (SIMPLIFIED - Approach B)
async function extractAccountFollowers(targetCount = 200, maxScrolls = 200) {
  const page = getPage();
  const { addExtractedUser, isUserExtracted } = await import('../utils/database.js');
  let allUsers = [];
  let newUsersAdded = 0;

  try {
    // Wait for profile to load
    await wait(randomDelay(3000, 4000));

    // Click on followers count with multi-strategy fallback
    console.log('   🔍 Looking for "followers" link...');
    const result = await clickProfileListLink(page, 'followers');
    if (!result.ok) {
      throw new Error('Could not find followers link - make sure you are on a profile page');
    }
    console.log(`   ✅ Found followers link via ${result.strategy}${result.target ? ` (clicked <${result.target.tag.toLowerCase()}> "${result.target.text}")` : ''}, clicking...`);

    // Wait for modal to open with increased timeout
    console.log('   ⏳ Waiting for modal to open...');
    await wait(randomDelay(2000, 3000));

    const modalSelector = 'div[role="dialog"]';
    try {
      await page.waitForSelector(modalSelector, { timeout: 10000 });
      console.log('   ✅ Modal opened successfully!');
    } catch (err) {
      throw new Error('Modal did not open - the followers button click may have failed');
    }

    // Expand mutualOnly preview to the full list if the route landed us there.
    const expanded = await expandToFullList(page, 'followers');
    if (expanded.ok) {
      console.log(`   ✅ Expanded preview → full list (clicked "${expanded.target.text}")`);
      await wait(randomDelay(1500, 2500));
    }

    console.log(`   📜 Scrolling to extract ${targetCount} users (max ${maxScrolls} scrolls)...`);

    let stagnantScrolls = 0;
    let lastSeenCount = 0;

    for (let i = 0; i < maxScrolls; i++) {
      const usernames = await page.evaluate(() => {
        const userLinks = document.querySelectorAll('div[role="dialog"] a[href^="/"]');
        const users = [];
        userLinks.forEach(link => {
          const href = link.getAttribute('href');
          const username = href.replace('/', '').split('/')[0];
          if (username &&
              !username.includes('?') &&
              !username.includes('p/') &&
              !username.includes('explore') &&
              !username.includes('reels')) {
            users.push(username);
          }
        });
        return users;
      });

      allUsers = [...new Set([...allUsers, ...usernames])];

      const scrollResult = await scrollUserListModal(page, 'bottom');
      await wait(randomDelay(2500, 4000));

      if (i % 10 === 0 && i > 0) {
        console.log(`   📊 Extracted ${allUsers.length}/${targetCount} users...`);
      }

      if (allUsers.length >= targetCount) {
        console.log(`\n   ✅ Target reached: ${allUsers.length} users extracted`);
        break;
      }

      if (allUsers.length === lastSeenCount) {
        stagnantScrolls++;
        // Nudge: scroll up then back down so the bottom sentinel re-enters
        // the viewport — IntersectionObserver-based loaders only fire on
        // re-entry, not while the sentinel sits in view at scrollTop max.
        if (stagnantScrolls >= 2) {
          await scrollUserListModal(page, -800);
          await wait(randomDelay(1200, 1800));
          await scrollUserListModal(page, 'bottom');
          await wait(randomDelay(2500, 4000));
        }
        if (stagnantScrolls >= 20) {
          console.log(`\n   ⚠️  No new users for ${stagnantScrolls} scrolls — list likely exhausted or throttled (last scroll: ${JSON.stringify(scrollResult)})`);
          break;
        }
      } else {
        stagnantScrolls = 0;
        lastSeenCount = allUsers.length;
      }
    }

    if (allUsers.length < targetCount) {
      console.log(`\n   ⚠️  Stopped with ${allUsers.length} users (target ${targetCount})`);
    }

    const closeButton = await page.$('svg[aria-label="Close"]');
    if (closeButton) {
      await closeButton.click();
      await wait(1000);
    }

  } catch (err) {
    console.error('Error extracting account followers:', err.message);
  }

  console.log(`\n   💾 Saving ${allUsers.length} users to database...`);

  // Get pool info from URL
  const poolUrl = page.url().split('?')[0]; // Remove query params
  const poolType = 'account_followers';
  const accountName = getCurrentAccount();

  // Save to database
  for (const username of allUsers) {
    if (!(await isUserExtracted(username))) {
      if (await addExtractedUser(username, poolUrl, poolType, accountName)) {
        newUsersAdded++;
      }
    }
  }

  console.log(`   ✅ Added ${newUsersAdded} NEW users to queue`);
  console.log(`   ⏭️  Skipped ${allUsers.length - newUsersAdded} (already in database)`);

  return allUsers;
}

// Extract accounts that a user is following (SIMPLIFIED - Approach B)
async function extractAccountFollowing(targetCount = 200, maxScrolls = 200) {
  const page = getPage();
  const { addExtractedUser, isUserExtracted } = await import('../utils/database.js');
  let allUsers = [];
  let newUsersAdded = 0;

  try {
    // Wait for profile to load
    await wait(randomDelay(3000, 4000));

    // Click on following count with multi-strategy fallback
    console.log('   🔍 Looking for "following" link...');
    const result = await clickProfileListLink(page, 'following');
    if (!result.ok) {
      throw new Error('Could not find following link - make sure you are on a profile page');
    }
    console.log(`   ✅ Found following link via ${result.strategy}${result.target ? ` (clicked <${result.target.tag.toLowerCase()}> "${result.target.text}")` : ''}, clicking...`);

    // Wait for modal to open with increased timeout
    console.log('   ⏳ Waiting for modal to open...');
    await wait(randomDelay(2000, 3000));

    const modalSelector = 'div[role="dialog"]';
    try {
      await page.waitForSelector(modalSelector, { timeout: 10000 });
      console.log('   ✅ Modal opened successfully!');
    } catch (err) {
      throw new Error('Modal did not open - the following button click may have failed');
    }

    // Expand mutualOnly preview to the full list if the route landed us there.
    const expanded = await expandToFullList(page, 'following');
    if (expanded.ok) {
      console.log(`   ✅ Expanded preview → full list (clicked "${expanded.target.text}")`);
      await wait(randomDelay(1500, 2500));
    }

    console.log(`   📜 Scrolling to extract ${targetCount} users (max ${maxScrolls} scrolls)...`);

    let stagnantScrolls = 0;
    let lastSeenCount = 0;

    for (let i = 0; i < maxScrolls; i++) {
      const usernames = await page.evaluate(() => {
        const userLinks = document.querySelectorAll('div[role="dialog"] a[href^="/"]');
        const users = [];
        userLinks.forEach(link => {
          const href = link.getAttribute('href');
          const username = href.replace('/', '').split('/')[0];
          if (username &&
              !username.includes('?') &&
              !username.includes('p/') &&
              !username.includes('explore') &&
              !username.includes('reels')) {
            users.push(username);
          }
        });
        return users;
      });

      allUsers = [...new Set([...allUsers, ...usernames])];

      const scrollResult = await scrollUserListModal(page, 'bottom');
      await wait(randomDelay(2500, 4000));

      if (i % 10 === 0 && i > 0) {
        console.log(`   📊 Extracted ${allUsers.length}/${targetCount} users...`);
      }

      if (allUsers.length >= targetCount) {
        console.log(`\n   ✅ Target reached: ${allUsers.length} users extracted`);
        break;
      }

      if (allUsers.length === lastSeenCount) {
        stagnantScrolls++;
        // Nudge: scroll up then back down so the bottom sentinel re-enters
        // the viewport — IntersectionObserver-based loaders only fire on
        // re-entry, not while the sentinel sits in view at scrollTop max.
        if (stagnantScrolls >= 2) {
          await scrollUserListModal(page, -800);
          await wait(randomDelay(1200, 1800));
          await scrollUserListModal(page, 'bottom');
          await wait(randomDelay(2500, 4000));
        }
        if (stagnantScrolls >= 20) {
          console.log(`\n   ⚠️  No new users for ${stagnantScrolls} scrolls — list likely exhausted or throttled (last scroll: ${JSON.stringify(scrollResult)})`);
          break;
        }
      } else {
        stagnantScrolls = 0;
        lastSeenCount = allUsers.length;
      }
    }

    if (allUsers.length < targetCount) {
      console.log(`\n   ⚠️  Stopped with ${allUsers.length} users (target ${targetCount})`);
    }

    const closeButton = await page.$('svg[aria-label="Close"]');
    if (closeButton) {
      await closeButton.click();
      await wait(1000);
    }

  } catch (err) {
    console.error('Error extracting account following:', err.message);
  }

  console.log(`\n   💾 Saving ${allUsers.length} users to database...`);

  // Get pool info from URL
  const poolUrl = page.url().split('?')[0]; // Remove query params
  const poolType = 'account_following';
  const accountName = getCurrentAccount();

  // Save to database
  for (const username of allUsers) {
    if (!(await isUserExtracted(username))) {
      if (await addExtractedUser(username, poolUrl, poolType, accountName)) {
        newUsersAdded++;
      }
    }
  }

  console.log(`   ✅ Added ${newUsersAdded} NEW users to queue`);
  console.log(`   ⏭️  Skipped ${allUsers.length - newUsersAdded} (already in database)`);

  return allUsers;
}
