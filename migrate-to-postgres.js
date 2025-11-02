#!/usr/bin/env node

/**
 * Migration script to transfer data from SQLite to PostgreSQL
 * Run this ONCE to migrate your existing data to the cloud database
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pg;

// SQLite database path
const sqliteDbPath = join(__dirname, 'db/follow-agent.db');

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 MIGRATING DATA FROM SQLITE TO POSTGRESQL');
    console.log('='.repeat(60) + '\n');

    // Check if .env file exists
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL not found in .env file!');
      console.error('Please create a .env file with your PostgreSQL connection string.');
      console.error('\nExample .env file:');
      console.error('DATABASE_URL=postgresql://postgres:your_password@db.xxx.supabase.co:5432/postgres\n');
      process.exit(1);
    }

    // Open SQLite database
    let sqliteDb;
    try {
      sqliteDb = new Database(sqliteDbPath, { readonly: true });
      console.log('✅ Connected to SQLite database');
    } catch (err) {
      console.error('❌ Could not open SQLite database at:', sqliteDbPath);
      console.error('   If you don\'t have existing data, you can skip this migration.\n');
      process.exit(1);
    }

    // Test PostgreSQL connection
    try {
      await pool.query('SELECT NOW()');
      console.log('✅ Connected to PostgreSQL database\n');
    } catch (err) {
      console.error('❌ Could not connect to PostgreSQL database!');
      console.error('   Error:', err.message);
      console.error('   Please check your DATABASE_URL in .env file\n');
      process.exit(1);
    }

    // Get counts from SQLite
    const followedCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM followed_accounts').get()?.count || 0;
    const poolsCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM pools').get()?.count || 0;
    const dailyStatsCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM daily_stats').get()?.count || 0;
    const extractedCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM extracted_users').get()?.count || 0;

    console.log('📊 Data to migrate from SQLite:');
    console.log(`   - followed_accounts: ${followedCount} rows`);
    console.log(`   - pools: ${poolsCount} rows`);
    console.log(`   - daily_stats: ${dailyStatsCount} rows`);
    console.log(`   - extracted_users: ${extractedCount} rows\n`);

    if (followedCount === 0 && poolsCount === 0 && dailyStatsCount === 0 && extractedCount === 0) {
      console.log('ℹ️  No data found in SQLite database. Nothing to migrate.\n');
      sqliteDb.close();
      await pool.end();
      process.exit(0);
    }

    console.log('⚠️  This will copy all data to PostgreSQL.');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Migrate followed_accounts
    console.log('📤 Migrating followed_accounts...');
    const followedAccounts = sqliteDb.prepare('SELECT * FROM followed_accounts').all();
    for (const row of followedAccounts) {
      try {
        await pool.query(
          'INSERT INTO followed_accounts (username, followed_at, pool_source, status, unfollowed_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING',
          [row.username, row.followed_at, row.pool_source, row.status, row.unfollowed_at]
        );
      } catch (err) {
        console.error(`   ⚠️  Error inserting ${row.username}:`, err.message);
      }
    }
    console.log(`   ✅ Migrated ${followedAccounts.length} rows\n`);

    // Migrate pools
    console.log('📤 Migrating pools...');
    const pools = sqliteDb.prepare('SELECT * FROM pools').all();
    for (const row of pools) {
      try {
        await pool.query(
          'INSERT INTO pools (pool_url, pool_type, processed_at, total_extracted) VALUES ($1, $2, $3, $4)',
          [row.pool_url, row.pool_type, row.processed_at, row.total_extracted]
        );
      } catch (err) {
        console.error(`   ⚠️  Error inserting pool ${row.pool_url}:`, err.message);
      }
    }
    console.log(`   ✅ Migrated ${pools.length} rows\n`);

    // Migrate daily_stats
    console.log('📤 Migrating daily_stats...');
    const dailyStats = sqliteDb.prepare('SELECT * FROM daily_stats').all();
    for (const row of dailyStats) {
      try {
        await pool.query(
          'INSERT INTO daily_stats (date, follows_count, pools_processed, unfollows_count) VALUES ($1, $2, $3, $4) ON CONFLICT (date) DO NOTHING',
          [row.date, row.follows_count, row.pools_processed, row.unfollows_count || 0]
        );
      } catch (err) {
        console.error(`   ⚠️  Error inserting date ${row.date}:`, err.message);
      }
    }
    console.log(`   ✅ Migrated ${dailyStats.length} rows\n`);

    // Migrate extracted_users
    console.log('📤 Migrating extracted_users...');
    const extractedUsers = sqliteDb.prepare('SELECT * FROM extracted_users').all();
    for (const row of extractedUsers) {
      try {
        await pool.query(
          'INSERT INTO extracted_users (username, extracted_at, pool_source, pool_type, follow_status, followed_at, notes, extracted_by_account) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (username) DO NOTHING',
          [row.username, row.extracted_at, row.pool_source, row.pool_type, row.follow_status, row.followed_at, row.notes, row.extracted_by_account || 'default']
        );
      } catch (err) {
        console.error(`   ⚠️  Error inserting ${row.username}:`, err.message);
      }
    }
    console.log(`   ✅ Migrated ${extractedUsers.length} rows\n`);

    // Verify migration
    console.log('🔍 Verifying migration...');
    const pgFollowedCount = (await pool.query('SELECT COUNT(*) as count FROM followed_accounts')).rows[0].count;
    const pgPoolsCount = (await pool.query('SELECT COUNT(*) as count FROM pools')).rows[0].count;
    const pgDailyStatsCount = (await pool.query('SELECT COUNT(*) as count FROM daily_stats')).rows[0].count;
    const pgExtractedCount = (await pool.query('SELECT COUNT(*) as count FROM extracted_users')).rows[0].count;

    console.log('\n📊 Data in PostgreSQL after migration:');
    console.log(`   - followed_accounts: ${pgFollowedCount} rows`);
    console.log(`   - pools: ${pgPoolsCount} rows`);
    console.log(`   - daily_stats: ${pgDailyStatsCount} rows`);
    console.log(`   - extracted_users: ${pgExtractedCount} rows\n`);

    console.log('✅ Migration completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Verify the data in your PostgreSQL database');
    console.log('   2. Run your normal commands (npm run extract, npm run follow, etc.)');
    console.log('   3. Both you and your partner can now use the same database!\n');

    // Close connections
    sqliteDb.close();
    await pool.end();

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run migration
migrate();
