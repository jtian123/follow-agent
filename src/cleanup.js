#!/usr/bin/env node

import { initDatabase, closeDatabase } from './utils/database.js';
import pool from './utils/database.js';

// Parse command line arguments
const args = process.argv.slice(2);

// Check for --all flag
const allFlag = args.includes('--all');

if (args.length < 1 && !allFlag) {
  console.log('\n❌ Usage: npm run cleanup <pool_url> [--account <name>] [--dry-run]');
  console.log('   OR: npm run cleanup --all [--account <name>] [--dry-run]');
  console.log('\nOptions:');
  console.log('  --all           : Remove ALL pending users (ignores pool_url)');
  console.log('  --account, -a   : Instagram account to filter by (default: all accounts)');
  console.log('  --dry-run       : Preview what would be deleted without actually deleting');
  console.log('  --today         : Only remove users extracted today');
  console.log('  --pending       : Only remove users with status "pending" (default for --all)');
  console.log('\nExamples:');
  console.log('  npm run cleanup --all --account uw_apateu --dry-run');
  console.log('  npm run cleanup --all --account uw_apateu');
  console.log('  npm run cleanup https://www.instagram.com/ditto_usc/ --account usc_apateu --dry-run');
  console.log('  npm run cleanup https://www.instagram.com/ditto_usc/ --account usc_apateu --today\n');
  process.exit(1);
}

const poolUrl = allFlag ? null : args[0];

// Check for flags
let accountName = null;
let dryRun = args.includes('--dry-run');
let todayOnly = args.includes('--today');
let pendingOnly = args.includes('--pending') || allFlag; // Default to pending when using --all

const accountFlagIndex = args.findIndex(arg => arg === '--account' || arg === '-a');
if (accountFlagIndex !== -1 && args[accountFlagIndex + 1]) {
  accountName = args[accountFlagIndex + 1];
}

// Main function
async function main() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🧹 CLEANUP EXTRACTED USERS');
    console.log('='.repeat(60) + '\n');

    // Initialize database
    console.log('📦 Initializing database...');
    await initDatabase();

    // Build query
    let query = 'SELECT * FROM extracted_users WHERE 1=1';
    let params = [];
    let paramCount = 0;

    if (!allFlag && poolUrl) {
      paramCount++;
      query += ` AND pool_source = $${paramCount}`;
      params.push(poolUrl);
    }

    if (accountName) {
      paramCount++;
      query += ` AND extracted_by_account = $${paramCount}`;
      params.push(accountName);
    }

    if (pendingOnly) {
      paramCount++;
      query += ` AND follow_status = $${paramCount}`;
      params.push('pending');
    }

    if (todayOnly) {
      const today = new Date().toISOString().split('T')[0];
      paramCount++;
      query += ` AND DATE(extracted_at) = $${paramCount}`;
      params.push(today);
    }

    // Get users that match the criteria
    const result = await pool.query(query, params);
    const usersToDelete = result.rows;

    if (usersToDelete.length === 0) {
      console.log('ℹ️  No users found matching the criteria.\n');
      await closeDatabase();
      process.exit(0);
    }

    // Show what will be deleted
    console.log(`🔍 Found ${usersToDelete.length} users to remove:\n`);
    if (allFlag) {
      console.log('Mode: Remove ALL pending users');
    } else {
      console.log('Pool URL:', poolUrl);
    }
    if (accountName) console.log('Account:', accountName);
    if (todayOnly) console.log('Filter: Today only');
    if (pendingOnly && !allFlag) console.log('Status: Pending only');
    console.log('');

    // Show breakdown by status
    const statusBreakdown = usersToDelete.reduce((acc, user) => {
      acc[user.follow_status] = (acc[user.follow_status] || 0) + 1;
      return acc;
    }, {});

    console.log('📊 Breakdown by status:');
    Object.entries(statusBreakdown).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });
    console.log('');

    // Show first few usernames as preview
    console.log('👥 Preview (first 10):');
    usersToDelete.slice(0, 10).forEach(user => {
      console.log(`   - ${user.username} (${user.follow_status})`);
    });
    if (usersToDelete.length > 10) {
      console.log(`   ... and ${usersToDelete.length - 10} more`);
    }
    console.log('');

    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes made to database');
      console.log('💡 Remove --dry-run flag to actually delete these users\n');
      await closeDatabase();
      process.exit(0);
    }

    // Confirm deletion
    console.log('⚠️  WARNING: This will permanently delete these users from the database!');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Delete users using PostgreSQL
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const user of usersToDelete) {
        await client.query('DELETE FROM extracted_users WHERE id = $1', [user.id]);
      }

      await client.query('COMMIT');
      console.log(`✅ Successfully deleted ${usersToDelete.length} users from the database\n`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Show updated stats
    if (accountName) {
      const remaining = await pool.query(
        'SELECT COUNT(*) as count FROM extracted_users WHERE extracted_by_account = $1',
        [accountName]
      );
      console.log(`📊 Remaining users for account ${accountName}: ${remaining.rows[0].count}\n`);
    } else {
      const remaining = await pool.query('SELECT COUNT(*) as count FROM extracted_users');
      console.log(`📊 Total remaining users: ${remaining.rows[0].count}\n`);
    }

    await closeDatabase();

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    await closeDatabase();
    process.exit(1);
  }
}

// Run the cleanup
main();
