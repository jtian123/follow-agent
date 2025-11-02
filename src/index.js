#!/usr/bin/env node

import { initDatabase, getStats, addPool } from './utils/database.js';
import { launchBrowser, isLoggedIn, login, closeBrowser } from './utils/browser.js';
import { extractUsersFromPool } from './services/poolExtractor.js';
import { executeFollows } from './services/followExecutor.js';

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('\n❌ Usage: npm start <pool_url> <pool_type>');
  console.log('\nPool types:');
  console.log('  - post_likers       : Extract users who liked a post');
  console.log('  - post_commenters   : Extract users who commented on a post');
  console.log('  - account_followers : Extract followers of an account');
  console.log('\nExample:');
  console.log('  npm start https://www.instagram.com/p/ABC123/ post_likers\n');
  process.exit(1);
}

const poolUrl = args[0];
const poolType = args[1];

// Validate pool type
const validPoolTypes = ['post_likers', 'post_commenters', 'account_followers'];
if (!validPoolTypes.includes(poolType)) {
  console.log(`\n❌ Invalid pool type: ${poolType}`);
  console.log(`Valid types: ${validPoolTypes.join(', ')}\n`);
  process.exit(1);
}

// Main function
async function main() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🤖 INSTAGRAM AUTO-FOLLOW AGENT');
    console.log('='.repeat(60) + '\n');

    // Initialize database
    console.log('📦 Initializing database...');
    await initDatabase();

    // Show current stats with smart session planning
    const stats = await getStats();
    const sessionLimit = 15;
    const extractTarget = Math.min(sessionLimit * 2, stats.remainingToday * 2); // 2x session limit or 2x remaining

    console.log('\n📊 Daily Progress Check:');
    console.log(`   ✅ Completed today: ${stats.todayCount}/30 follows`);
    console.log(`   🎯 Remaining: ${stats.remainingToday} follows`);
    console.log(`   📋 Session limit: ${sessionLimit} follows`);
    console.log(`   💡 Will extract: ${extractTarget}+ NEW users (2x session limit)`);
    console.log(`   📈 Total ever followed: ${stats.totalFollowed}`);
    console.log(`   🗂️  Pools processed: ${stats.totalPools}\n`);

    if (stats.remainingToday <= 0) {
      console.log('🎉 Daily goal completed! Come back tomorrow.\n');
      process.exit(0);
    }

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

    // Extract users from pool
    console.log('='.repeat(60));
    const users = await extractUsersFromPool(poolUrl, poolType, extractTarget);
    console.log('='.repeat(60) + '\n');

    if (users.length === 0) {
      console.log('❌ No users found in pool. Exiting.\n');
      await closeBrowser();
      process.exit(0);
    }

    // Save pool info
    await addPool(poolUrl, poolType, users.length);

    // Execute follows
    console.log('='.repeat(60));
    console.log('🎯 STARTING FOLLOW PROCESS');
    console.log('='.repeat(60));
    await executeFollows(users, poolUrl);

    // Close browser
    console.log('\n✅ Process completed!');
    await closeBrowser();

    console.log('\n💡 Tip: Space out your sessions throughout the day for best results.');
    console.log('💡 Run again with a different pool to continue following.\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    await closeBrowser();
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n\n⏸️  Process interrupted by user');
  await closeBrowser();
  process.exit(0);
});

// Run the agent
main();
