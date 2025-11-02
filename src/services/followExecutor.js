import { getPage, navigateTo, humanClick, randomDelay, humanScroll, wait } from '../utils/browser.js';
import { isAlreadyFollowed, addFollowedAccount, getTodayFollowCount, incrementTodayFollowCount, getPendingUsers, updateUserFollowStatus } from '../utils/database.js';
import { existsByXPath, clickByXPath } from '../utils/helpers.js';

// Removed hardcoded limits - now passed as parameters
const MIN_DELAY = 5000;   // 5 seconds
const MAX_DELAY = 25000;  // 25 seconds
const FOLLOW_PROBABILITY = 0.75; // 75% chance to follow (pre-applied to pool)

// Shuffle array to randomize follow order
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// View profile posts before following (human behavior)
async function viewProfilePosts(page) {
  try {
    // Scroll down to view posts
    await humanScroll(randomDelay(200, 400));
    await wait(randomDelay(1000, 2000));

    // Randomly click on a post (30% chance)
    if (Math.random() < 0.3) {
      const posts = await page.$$('article a[href*="/p/"]');
      if (posts.length > 0) {
        const randomPost = posts[Math.floor(Math.random() * Math.min(posts.length, 3))];
        await randomPost.click();
        console.log(`   👁️  Viewing a post...`);
        await wait(randomDelay(3000, 8000)); // View post for 3-8 seconds

        // Close post (press ESC or click close)
        await page.keyboard.press('Escape');
        await wait(randomDelay(500, 1000));
      }
    }

    // Scroll back up
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await wait(randomDelay(500, 1000));
  } catch (err) {
    // Silently continue if post viewing fails
  }
}

// Execute follow actions for a list of users
export async function executeFollows(users, poolSource) {
  const page = getPage();
  const todayCount = await getTodayFollowCount();
  const remaining = DAILY_LIMIT - todayCount;

  console.log(`\n📊 Daily Progress: ${todayCount}/${DAILY_LIMIT} follows`);
  console.log(`📋 Users to process: ${users.length}`);
  console.log(`🎯 Can follow today: ${remaining}\n`);

  if (remaining <= 0) {
    console.log('⛔ Daily limit reached! Come back tomorrow.');
    return { followed: 0, skipped: users.length };
  }

  // Filter out already followed users
  const toFollow = [];
  for (const username of users) {
    if (await isAlreadyFollowed(username)) {
      console.log(`⏭️  Skipping ${username} (already followed)`);
    } else {
      toFollow.push(username);
    }
  }

  console.log(`✅ Filtered: ${toFollow.length} new users to follow\n`);

  // Apply 75% randomization BEFORE visiting profiles (more efficient)
  console.log(`🎲 Applying 75% selection randomization...`);
  const shuffledUsers = shuffleArray(toFollow);
  const randomizedCount = Math.floor(shuffledUsers.length * FOLLOW_PROBABILITY);
  const selectedUsers = shuffledUsers.slice(0, randomizedCount);
  console.log(`   Selected ${selectedUsers.length} users from ${toFollow.length} (75% selection)\n`);

  // Limit to session limit and daily limit
  const maxToFollow = Math.min(selectedUsers.length, SESSION_LIMIT, remaining);
  const sessionUsers = selectedUsers.slice(0, maxToFollow);

  console.log(`🚀 Starting session: will follow ${sessionUsers.length} users\n`);

  let followedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < sessionUsers.length; i++) {
    const username = sessionUsers[i];

    try {
      // Navigate to user profile
      console.log(`[${i + 1}/${sessionUsers.length}] 👤 Processing: @${username}`);
      await navigateTo(`https://www.instagram.com/${username}/`);

      // Wait for profile to load
      await wait(randomDelay(2000, 3000));

      // View profile posts before following (10% chance - human behavior)
      if (Math.random() < 0.10) {
        console.log(`   👁️  Viewing profile posts...`);
        await viewProfilePosts(page);
      }

      // Check if already following
      const isFollowing = await existsByXPath(page, "//button[contains(., 'Following')]");
      if (isFollowing) {
        console.log(`   ⏭️  Already following @${username}`);
        // UPDATE DATABASE: Sync manual follows from phone/web
        await updateUserFollowStatus(username, 'already_following', 'Detected during follow session');
        console.log(`   💾 Updated database (synced from Instagram)\n`);
        continue;
      }

      // Check if "Follow Back" button (user already follows us - skip!)
      const isFollowBack = await existsByXPath(page, "//button[contains(., 'Follow Back') or contains(., 'Follow back')]");
      if (isFollowBack) {
        console.log(`   ⏭️  User @${username} already follows us - skipping follow back`);
        // UPDATE DATABASE: Mark as skipped (they follow us)
        await updateUserFollowStatus(username, 'already_following', 'User follows us - skipped follow back');
        console.log(`   💾 Updated database\n`);
        continue;
      }

      // Check if already requested (for private accounts)
      const isRequested = await existsByXPath(page, "//button[contains(., 'Requested')]");
      if (isRequested) {
        console.log(`   ⏭️  Already requested to follow @${username} (private account)`);
        // UPDATE DATABASE: Mark as already requested
        await updateUserFollowStatus(username, 'already_requested', 'Follow request pending');
        console.log(`   💾 Updated database\n`);
        continue;
      }

      // Find and click follow button (works for both public and private accounts)
      const followClicked = await clickByXPath(page, "//button[contains(., 'Follow') and not(contains(., 'Following')) and not(contains(., 'Requested'))]");

      if (followClicked) {
        // Button clicked successfully - record as followed!
        console.log(`   ✅ Followed/Requested @${username}`);

        await wait(randomDelay(500, 1000));

        const dbSaved = await addFollowedAccount(username, poolSource);
        if (dbSaved) {
          await incrementTodayFollowCount();
          followedCount++;
          // UPDATE extracted_users table as well
          await updateUserFollowStatus(username, 'followed', 'Successfully followed');
        } else {
          console.log(`   ⚠️  Already in database (skipping)`);
        }
      } else {
        console.log(`   ⚠️  Follow button not found for @${username}`);
        // UPDATE DATABASE: Mark as error
        await updateUserFollowStatus(username, 'error', 'Follow button not found');
        errorCount++;
      }

      // Varied delay between follows (45-90 seconds base + random variation)
      if (i < sessionUsers.length - 1) {
        // Add extra random variation to make timing less predictable
        const baseDelay = randomDelay(MIN_DELAY, MAX_DELAY);
        const variation = randomDelay(-5000, 10000); // -5 to +10 seconds variation
        const delay = Math.max(30000, baseDelay + variation); // Never less than 30s

        const seconds = Math.floor(delay / 1000);
        console.log(`   ⏳ Waiting ${seconds}s before next user...\n`);
        await wait(delay);

        // Random longer pause every 3-7 follows
        if ((followedCount + 1) % Math.floor(Math.random() * 4 + 3) === 0) {
          const pauseDelay = randomDelay(15000, 30000); // 15-30 second pause
          const pauseSeconds = Math.floor(pauseDelay / 1000);
          console.log(`   🛑 Taking a break (${pauseSeconds}s)...\n`);
          await wait(pauseDelay);
        }
      }

    } catch (err) {
      console.error(`   ❌ Error following @${username}:`, err.message);
      errorCount++;

      // Check if we got action blocked
      const actionBlockText = await page.evaluate(() => document.body.innerText);
      if (actionBlockText.includes('Try Again Later') || actionBlockText.includes('Action Blocked')) {
        console.error('\n⛔ ACTION BLOCKED BY INSTAGRAM!');
        console.error('🛑 Stopping to prevent further restrictions.');
        console.error('💡 Wait a few hours before trying again.\n');
        break;
      }
    }
  }

  const summary = {
    followed: followedCount,
    errors: errorCount,
    notProcessed: users.length - sessionUsers.length
  };

  console.log('\n' + '='.repeat(50));
  console.log('📊 SESSION SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Successfully followed: ${summary.followed}`);
  console.log(`❌ Errors: ${summary.errors}`);
  console.log(`⏭️  Not processed: ${summary.notProcessed}`);
  const finalTodayCount = await getTodayFollowCount();
  console.log(`📈 Total followed today: ${finalTodayCount}/${DAILY_LIMIT}`);
  console.log(`🎯 Remaining today: ${DAILY_LIMIT - finalTodayCount}`);
  console.log('='.repeat(50) + '\n');

  return summary;
}

// NEW: Execute follows from database queue (not from passed array)
export async function executeFollowsFromQueue(sessionLimit = 15, accountName = 'default') {
  const page = getPage();
  const todayCount = await getTodayFollowCount();

  console.log(`\n📊 Daily Progress: ${todayCount} follows completed today`);
  console.log(`🎯 This session: Will follow up to ${sessionLimit} users\n`);

  // Get pending users from database (filtered by account)
  const pendingUsers = await getPendingUsers(sessionLimit * 2, accountName); // Get 2x to account for already-following

  if (pendingUsers.length === 0) {
    console.log('⚠️  No pending users in queue!');
    console.log('💡 Run "npm run extract <pool_url> <pool_type>" to add users to queue.\n');
    return { followed: 0, skipped: 0 };
  }

  console.log(`📋 Found ${pendingUsers.length} pending users in queue`);
  console.log(`🚀 Will process up to ${sessionLimit} users this session\n`);

  let followedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let processedCount = 0;

  for (const user of pendingUsers) {
    // Stop if we hit session limit
    if (followedCount >= sessionLimit) {
      console.log(`\n✅ Session limit reached (${sessionLimit} follows)!`);
      break;
    }

    const username = user.username;
    const poolSource = user.pool_source;
    processedCount++;

    try {
      // Navigate to user profile
      console.log(`[${processedCount}] 👤 Processing: @${username}`);
      await navigateTo(`https://www.instagram.com/${username}/`);

      // Wait for profile to load
      await wait(randomDelay(2000, 3000));

      // View profile posts before following (10% chance - human behavior)
      if (Math.random() < 0.10) {
        console.log(`   👁️  Viewing profile posts...`);
        await viewProfilePosts(page);
      }

      // Check if already following
      const isFollowing = await existsByXPath(page, "//button[contains(., 'Following')]");
      if (isFollowing) {
        console.log(`   ⏭️  Already following @${username}`);
        // UPDATE DATABASE: Sync manual follows from phone/web
        await updateUserFollowStatus(username, 'already_following', 'Detected during follow session');
        console.log(`   💾 Updated database (synced from Instagram)\n`);
        skippedCount++;
        continue;
      }

      // Check if "Follow Back" button (user already follows us - skip!)
      const isFollowBack = await existsByXPath(page, "//button[contains(., 'Follow Back') or contains(., 'Follow back')]");
      if (isFollowBack) {
        console.log(`   ⏭️  User @${username} already follows us - skipping follow back`);
        // UPDATE DATABASE: Mark as skipped (they follow us)
        await updateUserFollowStatus(username, 'already_following', 'User follows us - skipped follow back');
        console.log(`   💾 Updated database\n`);
        skippedCount++;
        continue;
      }

      // Check if already requested (for private accounts)
      const isRequested = await existsByXPath(page, "//button[contains(., 'Requested')]");
      if (isRequested) {
        console.log(`   ⏭️  Already requested to follow @${username} (private account)`);
        // UPDATE DATABASE: Mark as already requested
        await updateUserFollowStatus(username, 'already_requested', 'Follow request pending');
        console.log(`   💾 Updated database\n`);
        skippedCount++;
        continue;
      }

      // Find and click follow button (works for both public and private accounts)
      const followClicked = await clickByXPath(page, "//button[contains(., 'Follow') and not(contains(., 'Following')) and not(contains(., 'Requested'))]");

      if (followClicked) {
        // Button clicked successfully - record as followed!
        console.log(`   ✅ Followed/Requested @${username}`);

        await wait(randomDelay(500, 1000));

        await addFollowedAccount(username, poolSource);
        await incrementTodayFollowCount();
        followedCount++;
        // UPDATE extracted_users table as well
        await updateUserFollowStatus(username, 'followed', 'Successfully followed');
      } else {
        console.log(`   ⚠️  Follow button not found for @${username}`);
        // UPDATE DATABASE: Mark as error
        await updateUserFollowStatus(username, 'error', 'Follow button not found');
        errorCount++;
      }

      // Varied delay between follows
      if (processedCount < pendingUsers.length && followedCount < sessionLimit) {
        // Add extra random variation to make timing less predictable
        const baseDelay = randomDelay(MIN_DELAY, MAX_DELAY);
        const variation = randomDelay(-5000, 10000); // -5 to +10 seconds variation
        const delay = Math.max(30000, baseDelay + variation); // Never less than 30s

        const seconds = Math.floor(delay / 1000);
        console.log(`   ⏳ Waiting ${seconds}s before next user...\n`);
        await wait(delay);

        // Random longer pause every 3-7 follows
        if ((followedCount + 1) % Math.floor(Math.random() * 4 + 3) === 0) {
          const pauseDelay = randomDelay(15000, 30000); // 15-30 second pause
          const pauseSeconds = Math.floor(pauseDelay / 1000);
          console.log(`   🛑 Taking a break (${pauseSeconds}s)...\n`);
          await wait(pauseDelay);
        }
      }

    } catch (err) {
      console.error(`   ❌ Error following @${username}:`, err.message);
      await updateUserFollowStatus(username, 'error', err.message);
      errorCount++;

      // Check if we got action blocked
      const actionBlockText = await page.evaluate(() => document.body.innerText);
      if (actionBlockText.includes('Try Again Later') || actionBlockText.includes('Action Blocked')) {
        console.error('\n⛔ ACTION BLOCKED BY INSTAGRAM!');
        console.error('🛑 Stopping to prevent further restrictions.');
        console.error('💡 Wait a few hours before trying again.\n');
        break;
      }
    }
  }

  const summary = {
    followed: followedCount,
    skipped: skippedCount,
    errors: errorCount
  };

  console.log('\n' + '='.repeat(50));
  console.log('📊 SESSION SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Successfully followed: ${summary.followed}`);
  console.log(`⏭️  Skipped (already following): ${summary.skipped}`);
  console.log(`❌ Errors: ${summary.errors}`);
  const finalTodayCount2 = await getTodayFollowCount();
  console.log(`📈 Total followed today: ${finalTodayCount2}`);
  console.log('='.repeat(50) + '\n');

  return summary;
}
