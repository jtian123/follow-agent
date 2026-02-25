#!/usr/bin/env node

import { initDatabase, getQueueStats, addPool, closeDatabase } from './utils/database.js';
import { launchBrowser, isLoggedIn, login, closeBrowser, setAccount, wait } from './utils/browser.js';
import { extractUsersFromPool } from './services/poolExtractor.js';

// Parse command line arguments
const args = process.argv.slice(2);

// Check for --account flag
let accountName = process.env.IG_ACCOUNT || 'default';
const accountFlagIndex = args.findIndex(arg => arg === '--account' || arg === '-a');
if (accountFlagIndex !== -1 && args[accountFlagIndex + 1]) {
  accountName = args[accountFlagIndex + 1];
  // Remove account flag and value from args
  args.splice(accountFlagIndex, 2);
}

if (args.length < 2) {
  console.log('\n❌ Usage: npm run extract <pool_url> <pool_type> [target_count] [--account <name>]');
  console.log('\nPool types:');
  console.log('  - post_likers       : Extract users who liked a post');
  console.log('  - post_commenters   : Extract users who commented on a post');
  console.log('  - account_followers : Extract followers of an account');
  console.log('  - account_following : Extract accounts a user is following');
  console.log('\nOptional:');
  console.log('  - target_count      : Number of users to extract (default: 200)');
  console.log('  - --account, -a     : Instagram account to use (default: from IG_ACCOUNT env or "default")');
  console.log('\nExamples:');
  console.log('  npm run extract https://www.instagram.com/username account_followers 300');
  console.log('  npm run extract https://www.instagram.com/username account_followers 300 --account ucla_apateu');
  console.log('  IG_ACCOUNT=ucb_apateu npm run extract https://www.instagram.com/username account_following 200\n');
  process.exit(1);
}

const poolUrl = args[0];
const poolType = args[1];
const targetCount = args[2] ? parseInt(args[2]) : 200;

// Validate pool type
const validPoolTypes = ['post_likers', 'post_commenters', 'account_followers', 'account_following'];
if (!validPoolTypes.includes(poolType)) {
  console.log(`\n❌ Invalid pool type: ${poolType}`);
  console.log(`Valid types: ${validPoolTypes.join(', ')}\n`);
  process.exit(1);
}

// Main function
async function main() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('📥 INSTAGRAM USER POOL EXTRACTOR');
    console.log('='.repeat(60) + '\n');

    // Set account before any browser operations
    console.log(`🔧 Account selected: ${accountName}`);
    setAccount(accountName);

    // Initialize database
    console.log('📦 Initializing database...');
    await initDatabase();

    // Show current queue stats
    const queueStats = await getQueueStats(accountName);
    console.log('\n📊 Current Queue Status:');
    console.log(`   ⏳ Pending users: ${queueStats.pending}`);
    console.log(`   ✅ Followed: ${queueStats.followed}`);
    console.log(`   👥 Already following: ${queueStats.alreadyFollowing}`);
    console.log(`   📈 Total in database: ${queueStats.total}\n`);

    // Launch browser
    console.log('🚀 Launching browser...');
    await launchBrowser();

    // Check login status
    console.log('🔐 Checking login status...');
    const loggedIn = await isLoggedIn();

    if (!loggedIn) {
      await login();
      // Extra wait after fresh login to ensure session is stable
      console.log('⏳ Waiting for session to stabilize...');
      await wait(5000);
    } else {
      console.log('✅ Already logged in!\n');
    }

    // Extract users from pool
    console.log('='.repeat(60));
    const users = await extractUsersFromPool(poolUrl, poolType, targetCount);
    console.log('='.repeat(60) + '\n');

    if (users.length === 0) {
      console.log('❌ No users extracted from pool.\n');
      await closeBrowser();
      await closeDatabase();
      process.exit(0);
    }

    // Save pool info
    await addPool(poolUrl, poolType, users.length);

    // Show updated queue stats
    const updatedStats = await getQueueStats(accountName);
    console.log('\n📊 Updated Queue Status:');
    console.log(`   ⏳ Pending users: ${updatedStats.pending}`);
    console.log(`   ✅ Followed: ${updatedStats.followed}`);
    console.log(`   👥 Already following: ${updatedStats.alreadyFollowing}`);
    console.log(`   📈 Total in database: ${updatedStats.total}\n`);

    // Close browser
    console.log('✅ Extraction completed!');
    await closeBrowser();
    await closeDatabase();

    console.log('\n💡 Next steps:');
    console.log('   1. Run "npm run follow" to start following users from the queue');
    console.log('   2. Or extract more users from another pool\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    await closeBrowser();
    await closeDatabase();
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n\n⏸️  Process interrupted by user');
  await closeBrowser();
  await closeDatabase();
  process.exit(0);
});

// Run the extractor
main();
