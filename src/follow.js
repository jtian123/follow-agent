#!/usr/bin/env node

import { initDatabase, getTodayFollowCount, getQueueStats, closeDatabase } from './utils/database.js';
import { launchBrowser, isLoggedIn, login, closeBrowser, setAccount } from './utils/browser.js';
import { executeFollowsFromQueue } from './services/followExecutor.js';

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

const sessionLimit = args[0] ? parseInt(args[0]) : 15; // Default: 15 follows per session

// Validate session limit
if (isNaN(sessionLimit) || sessionLimit <= 0) {
  console.log('\n❌ Invalid session limit. Must be a positive number.');
  console.log('\nUsage: npm run follow [session_limit] [--account <name>]');
  console.log('\nOptional:');
  console.log('  - session_limit     : Number of users to follow (default: 15)');
  console.log('  - --account, -a     : Instagram account to use (default: from IG_ACCOUNT env or "default")');
  console.log('\nExamples:');
  console.log('  npm run follow        # Follow up to 15 users (default)');
  console.log('  npm run follow 10     # Follow up to 10 users');
  console.log('  npm run follow 30 --account ucla_apateu     # Follow 30 users with specific account');
  console.log('  IG_ACCOUNT=ucb_apateu npm run follow 20     # Follow 20 users with ucb_apateu\n');
  process.exit(1);
}

// Main function
async function main() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🤖 INSTAGRAM AUTO-FOLLOW AGENT');
    console.log('='.repeat(60) + '\n');

    // Set account before any browser operations
    setAccount(accountName);

    // Initialize database
    console.log('📦 Initializing database...');
    await initDatabase();

    // Show current stats
    const todayCount = await getTodayFollowCount();
    const queueStats = await getQueueStats(accountName);

    console.log('\n📊 Daily Progress:');
    console.log(`   ✅ Completed today: ${todayCount} follows`);
    console.log(`   📋 Session limit: ${sessionLimit} follows\n`);

    console.log('📊 Queue Status:');
    console.log(`   ⏳ Pending users: ${queueStats.pending}`);
    console.log(`   ✅ Followed: ${queueStats.followed}`);
    console.log(`   👥 Already following: ${queueStats.alreadyFollowing}`);
    console.log(`   📈 Total in database: ${queueStats.total}\n`);

    if (queueStats.pending === 0) {
      console.log('⚠️  No pending users in queue!');
      console.log('💡 Run "npm run extract <pool_url> <pool_type>" to add users.\n');
      await closeDatabase();
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

    // Execute follows from queue
    console.log('='.repeat(60));
    console.log('🎯 STARTING FOLLOW PROCESS FROM QUEUE');
    console.log('='.repeat(60));
    await executeFollowsFromQueue(sessionLimit, accountName);

    // Close browser
    console.log('\n✅ Process completed!');
    await closeBrowser();

    // Show final queue stats
    const finalQueueStats = await getQueueStats(accountName);
    console.log('\n📊 Final Queue Status:');
    console.log(`   ⏳ Pending users: ${finalQueueStats.pending}`);
    console.log(`   ✅ Followed: ${finalQueueStats.followed}`);
    console.log(`   👥 Already following: ${finalQueueStats.alreadyFollowing}\n`);

    console.log('💡 Tips:');
    console.log('   - Space out sessions throughout the day for best results');
    console.log('   - Run "npm run extract" to add more users to queue');
    console.log('   - Run "npm run follow" again to continue following\n');

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

// Run the agent
main();
