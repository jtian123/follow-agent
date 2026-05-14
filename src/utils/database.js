import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Create PostgreSQL connection pool with timeout handling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for most cloud PostgreSQL providers
  },
  // Connection pool settings to prevent timeouts
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return error if connection takes longer than 10 seconds
  statement_timeout: 10000, // Kill queries that take longer than 10 seconds
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

// Initialize database schema
export async function initDatabase() {
  const client = await pool.connect();
  try {
    // Create followed_accounts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS followed_accounts (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        followed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        pool_source TEXT,
        status TEXT DEFAULT 'followed',
        unfollowed_at TIMESTAMP
      )
    `);

    // Create pools table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pools (
        id SERIAL PRIMARY KEY,
        pool_url TEXT NOT NULL,
        pool_type TEXT NOT NULL,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_extracted INTEGER DEFAULT 0
      )
    `);

    // Create daily_stats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        follows_count INTEGER DEFAULT 0,
        pools_processed INTEGER DEFAULT 0,
        unfollows_count INTEGER DEFAULT 0
      )
    `);

    // Create extracted_users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS extracted_users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        pool_source TEXT,
        pool_type TEXT,
        follow_status TEXT DEFAULT 'pending',
        followed_at TIMESTAMP,
        notes TEXT,
        extracted_by_account TEXT DEFAULT 'default'
      )
    `);

    // Migration: add per-account ownership to followed_accounts. Without
    // this column, all agent accounts share one global table — meaning
    // uw_apateu's unfollow tool can pull rows that ucla_apateu actually
    // followed. Idempotent.
    await client.query(`
      ALTER TABLE followed_accounts
      ADD COLUMN IF NOT EXISTS followed_by_account TEXT
    `);

    // Replace the global UNIQUE(username) with composite UNIQUE(username,
    // followed_by_account) so two accounts can both record following the
    // same user. Old constraint is auto-named by PG.
    await client.query(`
      ALTER TABLE followed_accounts
      DROP CONSTRAINT IF EXISTS followed_accounts_username_key
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS followed_accounts_username_account_key
      ON followed_accounts (username, followed_by_account)
    `);

    // Create indexes for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_followed_username ON followed_accounts(username);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_followed_by_account ON followed_accounts(followed_by_account, status, followed_at);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_extracted_username ON extracted_users(username);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_extracted_status ON extracted_users(follow_status);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_extracted_account ON extracted_users(extracted_by_account);
    `);

    console.log('✅ Database schema initialized');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Check if a specific account already follows this user. Per-account: returns
// false even if a *different* account followed them, since the answer is used
// to decide whether to follow from the current session.
export async function isAlreadyFollowed(username, accountName) {
  const result = await pool.query(
    `SELECT 1 FROM followed_accounts
     WHERE username = $1 AND status = 'followed'
       AND followed_by_account = $2`,
    [username, accountName]
  );
  return result.rows.length > 0;
}

// Add followed account, stamped with the account that did the follow.
export async function addFollowedAccount(username, poolSource, accountName) {
  try {
    await pool.query(
      `INSERT INTO followed_accounts (username, pool_source, followed_by_account)
       VALUES ($1, $2, $3)`,
      [username, poolSource, accountName]
    );
    return true;
  } catch (err) {
    if (err.code === '23505') { // unique violation
      console.log(`⚠️  ${username} already followed by ${accountName}`);
      return false;
    }
    throw err;
  }
}

// Get today's follow count
export async function getTodayFollowCount() {
  const today = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    'SELECT follows_count FROM daily_stats WHERE date = $1',
    [today]
  );
  return result.rows.length > 0 ? result.rows[0].follows_count : 0;
}

// Increment today's follow count with retry logic
export async function incrementTodayFollowCount() {
  const today = new Date().toISOString().split('T')[0];
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await pool.query(`
        INSERT INTO daily_stats (date, follows_count) VALUES ($1, 1)
        ON CONFLICT(date) DO UPDATE SET follows_count = daily_stats.follows_count + 1
      `, [today]);
      return; // Success!
    } catch (err) {
      lastError = err;
      if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
        console.log(`   ⚠️  Database timeout (attempt ${attempt}/${maxRetries}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
      } else {
        throw err; // Non-timeout error, throw immediately
      }
    }
  }

  console.error(`   ❌ Failed to update database after ${maxRetries} attempts:`, lastError.message);
  throw lastError;
}

// Add pool record
export async function addPool(poolUrl, poolType, totalExtracted) {
  try {
    await pool.query(
      'INSERT INTO pools (pool_url, pool_type, total_extracted) VALUES ($1, $2, $3)',
      [poolUrl, poolType, totalExtracted]
    );
    console.log(`✅ Pool record saved to database (${totalExtracted} users)`);
    return true;
  } catch (err) {
    console.error('❌ Error saving pool record to database:', err.message);
    console.error('   Pool URL:', poolUrl);
    console.error('   Pool Type:', poolType);
    console.error('   Total Extracted:', totalExtracted);
    return false;
  }
}

// Get all followed accounts
export async function getAllFollowedAccounts() {
  const result = await pool.query(
    'SELECT * FROM followed_accounts WHERE status = $1 ORDER BY followed_at DESC',
    ['followed']
  );
  return result.rows;
}

// Oldest followed accounts past a cooldown window for a given agent account.
// Restricted to followed_by_account = $accountName so uw_apateu doesn't pull
// rows that ucla_apateu followed.
export async function getOldestFollowedAccounts(limit = 100, minHoursOld = 72, accountName = null) {
  const result = await pool.query(
    `SELECT username, followed_at, pool_source
     FROM followed_accounts
     WHERE status = 'followed'
       AND followed_by_account = $1
       AND followed_at < NOW() - ($2 || ' hours')::INTERVAL
     ORDER BY followed_at ASC
     LIMIT $3`,
    [accountName, String(minHoursOld), limit]
  );
  return result.rows;
}

// Usernames currently in cooldown (followed within the last `hoursBack` hours)
// for any account, returned as a Set. Used to filter the live-following-list
// candidate pool. Loose by design — covers legacy NULL-account rows too, on
// the assumption "if any record was made recently, leave that user alone."
export async function getCooldownUsernames(hoursBack = 72) {
  const result = await pool.query(
    `SELECT DISTINCT username FROM followed_accounts
     WHERE status = 'followed'
       AND followed_at >= NOW() - ($1 || ' hours')::INTERVAL`,
    [String(hoursBack)]
  );
  return new Set(result.rows.map(r => r.username));
}

// Mark this account's row for `username` as unfollowed. Also sweeps any
// legacy NULL-account row, since pre-migration data has no clear owner and
// leaving stale 'followed' rows behind would just confuse future runs.
export async function markAsUnfollowed(username, accountName) {
  await pool.query(
    `UPDATE followed_accounts
     SET status = 'unfollowed', unfollowed_at = CURRENT_TIMESTAMP
     WHERE username = $1
       AND status = 'followed'
       AND (followed_by_account = $2 OR followed_by_account IS NULL)`,
    [username, accountName]
  );
}

// Get stats
export async function getStats() {
  const totalFollowedResult = await pool.query(
    'SELECT COUNT(*) as count FROM followed_accounts WHERE status = $1',
    ['followed']
  );
  const todayCount = await getTodayFollowCount();
  const totalPoolsResult = await pool.query('SELECT COUNT(*) as count FROM pools');

  return {
    totalFollowed: parseInt(totalFollowedResult.rows[0].count),
    todayCount,
    totalPools: parseInt(totalPoolsResult.rows[0].count),
    remainingToday: Math.max(0, 30 - todayCount)
  };
}

// ===== NEW WORKFLOW FUNCTIONS =====

// Add extracted user to database
export async function addExtractedUser(username, poolSource, poolType, extractedByAccount = 'default') {
  try {
    const result = await pool.query(
      'INSERT INTO extracted_users (username, pool_source, pool_type, extracted_by_account) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING RETURNING id',
      [username, poolSource, poolType, extractedByAccount]
    );
    return result.rowCount > 0; // Returns true if new user added
  } catch (err) {
    console.error(`Error adding extracted user ${username}:`, err.message);
    return false;
  }
}

// Get pending users to follow (not yet followed) - filtered by account
export async function getPendingUsers(limit = 30, accountName = 'default') {
  const result = await pool.query(`
    SELECT username, pool_source, pool_type, extracted_by_account
    FROM extracted_users
    WHERE follow_status = 'pending' AND extracted_by_account = $1
    ORDER BY extracted_at ASC
    LIMIT $2
  `, [accountName, limit]);
  return result.rows;
}

// Update user follow status
export async function updateUserFollowStatus(username, status, notes = null) {
  await pool.query(`
    UPDATE extracted_users
    SET follow_status = $1, followed_at = CURRENT_TIMESTAMP, notes = $2
    WHERE username = $3
  `, [status, notes, username]);
}

// Get extraction queue stats - filtered by account
export async function getQueueStats(accountName = 'default') {
  const pendingResult = await pool.query(
    'SELECT COUNT(*) as count FROM extracted_users WHERE follow_status = $1 AND extracted_by_account = $2',
    ['pending', accountName]
  );
  const followedResult = await pool.query(
    'SELECT COUNT(*) as count FROM extracted_users WHERE follow_status = $1 AND extracted_by_account = $2',
    ['followed', accountName]
  );
  const alreadyFollowingResult = await pool.query(
    'SELECT COUNT(*) as count FROM extracted_users WHERE follow_status = $1 AND extracted_by_account = $2',
    ['already_following', accountName]
  );
  const totalResult = await pool.query(
    'SELECT COUNT(*) as count FROM extracted_users WHERE extracted_by_account = $1',
    [accountName]
  );

  return {
    pending: parseInt(pendingResult.rows[0].count),
    followed: parseInt(followedResult.rows[0].count),
    alreadyFollowing: parseInt(alreadyFollowingResult.rows[0].count),
    total: parseInt(totalResult.rows[0].count)
  };
}

// Check if user exists in extracted_users
export async function isUserExtracted(username) {
  const result = await pool.query(
    'SELECT username FROM extracted_users WHERE username = $1',
    [username]
  );
  return result.rows.length > 0;
}

// ===== UNFOLLOW FUNCTIONS =====

// Get today's unfollow count
export async function getTodayUnfollowCount() {
  const today = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    'SELECT unfollows_count FROM daily_stats WHERE date = $1',
    [today]
  );
  return result.rows.length > 0 ? result.rows[0].unfollows_count : 0;
}

// Increment today's unfollow count with retry logic
export async function incrementTodayUnfollowCount() {
  const today = new Date().toISOString().split('T')[0];
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await pool.query(`
        INSERT INTO daily_stats (date, unfollows_count) VALUES ($1, 1)
        ON CONFLICT(date) DO UPDATE SET unfollows_count = daily_stats.unfollows_count + 1
      `, [today]);
      return; // Success!
    } catch (err) {
      lastError = err;
      if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
        console.log(`   ⚠️  Database timeout (attempt ${attempt}/${maxRetries}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
      } else {
        throw err; // Non-timeout error, throw immediately
      }
    }
  }

  console.error(`   ❌ Failed to update database after ${maxRetries} attempts:`, lastError.message);
  throw lastError;
}

// Close pool (for graceful shutdown)
export async function closeDatabase() {
  await pool.end();
  console.log('✅ Database connection closed');
}

export default pool;
