import { getPage, navigateTo, humanScroll, randomDelay, wait, getCurrentAccount } from '../utils/browser.js';
import { clickByXPath } from '../utils/helpers.js';

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

      // Scroll modal to bottom
      try {
        await page.evaluate(() => {
          const dialog = document.querySelector('div[role="dialog"]');
          if (dialog) {
            const allElements = dialog.querySelectorAll('*');
            const scrollContainer = Array.from(allElements).find(el => {
              return el.scrollHeight > el.clientHeight;
            });
            if (scrollContainer) {
              scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
          }
        });
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

    // Click on followers count with retry logic
    console.log('   🔍 Looking for "followers" link...');
    let followersLink = await page.$('a[href*="/followers/"]');

    if (!followersLink) {
      console.log('   ⚠️  Followers link not found, waiting and retrying...');
      await wait(2000);
      followersLink = await page.$('a[href*="/followers/"]');
    }

    if (!followersLink) {
      throw new Error('Could not find followers link - make sure you are on a profile page');
    }

    console.log('   ✅ Found followers link, clicking...');
    await followersLink.click();

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

    console.log(`   📜 Scrolling to extract ${targetCount} users (max ${maxScrolls} scrolls)...`);

    let previousCount = 0;

    for (let i = 0; i < maxScrolls; i++) {
      // Extract ALL usernames from modal (SIMPLIFIED - no button detection)
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
      allUsers = [...new Set([...allUsers, ...usernames])];

      // Update count
      if (allUsers.length !== previousCount) {
        previousCount = allUsers.length;
      }

      // Scroll modal to bottom
      await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (dialog) {
          const allElements = dialog.querySelectorAll('*');
          const scrollContainer = Array.from(allElements).find(el => {
            return el.scrollHeight > el.clientHeight;
          });
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        }
      });

      await wait(randomDelay(1500, 2500));

      if (i % 10 === 0 && i > 0) {
        console.log(`   📊 Extracted ${allUsers.length}/${targetCount} users...`);
      }

      // Early exit if we have enough
      if (allUsers.length >= targetCount) {
        console.log(`\n   ✅ Target reached: ${allUsers.length} users extracted`);
        break;
      }
    }

    // Check if we hit max scrolls without reaching target
    if (allUsers.length < targetCount) {
      console.log(`\n   ⚠️  Reached max scrolls (${maxScrolls}) with ${allUsers.length} users`);
    }

    // Close modal
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

    // Click on following count with retry logic
    console.log('   🔍 Looking for "following" link...');
    let followingLink = await page.$('a[href*="/following/"]');

    if (!followingLink) {
      console.log('   ⚠️  Following link not found, waiting and retrying...');
      await wait(2000);
      followingLink = await page.$('a[href*="/following/"]');
    }

    if (!followingLink) {
      throw new Error('Could not find following link - make sure you are on a profile page');
    }

    console.log('   ✅ Found following link, clicking...');
    await followingLink.click();

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

    console.log(`   📜 Scrolling to extract ${targetCount} users (max ${maxScrolls} scrolls)...`);

    let previousCount = 0;

    for (let i = 0; i < maxScrolls; i++) {
      // Extract ALL usernames from modal (SIMPLIFIED - no button detection)
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
      allUsers = [...new Set([...allUsers, ...usernames])];

      // Update count
      if (allUsers.length !== previousCount) {
        previousCount = allUsers.length;
      }

      // Scroll modal to bottom
      await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (dialog) {
          const allElements = dialog.querySelectorAll('*');
          const scrollContainer = Array.from(allElements).find(el => {
            return el.scrollHeight > el.clientHeight;
          });
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        }
      });

      await wait(randomDelay(1500, 2500));

      if (i % 10 === 0 && i > 0) {
        console.log(`   📊 Extracted ${allUsers.length}/${targetCount} users...`);
      }

      // Early exit if we have enough
      if (allUsers.length >= targetCount) {
        console.log(`\n   ✅ Target reached: ${allUsers.length} users extracted`);
        break;
      }
    }

    // Check if we hit max scrolls without reaching target
    if (allUsers.length < targetCount) {
      console.log(`\n   ⚠️  Reached max scrolls (${maxScrolls}) with ${allUsers.length} users`);
    }

    // Close modal
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
