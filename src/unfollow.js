#!/usr/bin/env node

import { initDatabase, getTodayUnfollowCount, closeDatabase } from './utils/database.js';
import { launchBrowser, isLoggedIn, login, closeBrowser, setAccount } from './utils/browser.js';
import { unfollowAll } from './services/unfollowExecutor.js';

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

const sessionLimit = args[0] ? parseInt(args[0]) : 50; // Default: 50 unfollows per session (conservative for risk reduction)
const maxExtract = args[1] ? parseInt(args[1]) : 1000; // Default: Extract up to 1000 users

// Validate arguments
if (isNaN(sessionLimit) || sessionLimit <= 0) {
  console.log('\n❌ Invalid session limit. Must be a positive number.');
  console.log('\nUsage: npm run unfollow [session_limit] [max_extract] [--account <name>]');
  console.log('\nOptional:');
  console.log('  - session_limit     : Number of users to unfollow (default: 50)');
  console.log('  - max_extract       : Max users to extract from following list (default: 1000)');
  console.log('  - --account, -a     : Instagram account to use (default: from IG_ACCOUNT env or "default")');
  console.log('\nExamples:');
  console.log('  npm run unfollow                            # Unfollow up to 50 users (default)');
  console.log('  npm run unfollow 100                        # Unfollow up to 100 users');
  console.log('  npm run unfollow 50 500 --account sf_apateu # Unfollow 50, scan 500 max');
  console.log('  IG_ACCOUNT=ucb_apateu npm run unfollow      # Unfollow with ucb_apateu account\n');
  process.exit(1);
}

// Main function
async function main() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 INSTAGRAM MASS UNFOLLOW TOOL');
    console.log('='.repeat(60) + '\n');

    // Set account before any browser operations
    setAccount(accountName);

    // Initialize database
    console.log('📦 Initializing database...');
    await initDatabase();

    // Show current stats
    const todayUnfollowCount = await getTodayUnfollowCount();

    console.log('\n📊 Today\'s Progress:');
    console.log(`   ✅ Unfollowed today: ${todayUnfollowCount}`);
    console.log(`   📋 Session limit: ${sessionLimit} unfollows`);
    console.log(`   🔍 Max extract: ${maxExtract} users\n`);

    // Launch browser
    console.log('🚀 Launching browser...');
    await launchBrowser();

    // Check login status
    console.log('🔐 Checking login status...');
    const loggedIn = await isLoggedIn();

    if (!loggedIn) {
      await login();
    } else {
      console.log('✅ Already logged in!\n');
    }

    // Execute mass unfollow
    console.log('='.repeat(60));
    console.log('🎯 STARTING MASS UNFOLLOW PROCESS');
    console.log('='.repeat(60));
    await unfollowAll(sessionLimit, maxExtract);

    // Close browser
    console.log('\n✅ Process completed!');
    await closeBrowser();

    // Show final stats
    const finalUnfollowCount = await getTodayUnfollowCount();
    console.log('\n📊 Final Stats:');
    console.log(`   ✅ Total unfollowed today: ${finalUnfollowCount}\n`);

    console.log('💡 Tips:');
    console.log('   - Run this command again to continue unfollowing more users');
    console.log('   - The script will automatically extract your current following list');
    console.log('   - Use lower session limits if you want to be more conservative\n');

    // Close database connection AFTER all queries are done
    await closeDatabase();

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

// Run the tool
main();
