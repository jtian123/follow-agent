# SQLite Database Commands Reference

Quick reference for viewing and managing the Instagram Follow Agent database.

---

## Connect to Database

```bash
sqlite3 db/follow-agent.db
```

---

## Inside SQLite Shell - Common Commands

### View All Tables
```sql
.tables
```

### View Table Schema
```sql
.schema extracted_users
.schema followed_accounts
.schema pools
.schema daily_stats
```

### Pretty Output Formatting
```sql
.mode column
.headers on
.width 20 20 15 20
```

---

## Query Examples

### View All Extracted Users
```sql
SELECT * FROM extracted_users;
```

### View First 10 Users
```sql
SELECT * FROM extracted_users LIMIT 10;
```

### Count Users by Status
```sql
SELECT follow_status, COUNT(*) as count
FROM extracted_users
GROUP BY follow_status;
```

### View Only Pending Users
```sql
SELECT username, pool_source, extracted_at
FROM extracted_users
WHERE follow_status = 'pending';
```

### View Recently Extracted Users
```sql
SELECT username, pool_type, follow_status, extracted_at
FROM extracted_users
ORDER BY extracted_at DESC
LIMIT 20;
```

### View Users by Pool Source
```sql
SELECT pool_source, COUNT(*) as count
FROM extracted_users
GROUP BY pool_source;
```

### View Followed Users Today
```sql
SELECT username, followed_at
FROM extracted_users
WHERE follow_status = 'followed'
AND DATE(followed_at) = DATE('now');
```

### View Already Following (Synced from Phone/Web)
```sql
SELECT username, notes, followed_at
FROM extracted_users
WHERE follow_status = 'already_following';
```

### View Users with Errors
```sql
SELECT username, notes, followed_at
FROM extracted_users
WHERE follow_status = 'error';
```

### Search for Specific Username
```sql
SELECT * FROM extracted_users WHERE username LIKE '%search_term%';
```

---

## One-Line Commands (Without Opening SQLite Shell)

### Quick Stats
```bash
sqlite3 db/follow-agent.db "SELECT follow_status, COUNT(*) FROM extracted_users GROUP BY follow_status;"
```

### View All Pending Users
```bash
sqlite3 db/follow-agent.db "SELECT username FROM extracted_users WHERE follow_status = 'pending';"
```

### Count Total Users
```bash
sqlite3 db/follow-agent.db "SELECT COUNT(*) as total FROM extracted_users;"
```

### View Queue Summary
```bash
sqlite3 db/follow-agent.db "
SELECT
  SUM(CASE WHEN follow_status = 'pending' THEN 1 ELSE 0 END) as pending,
  SUM(CASE WHEN follow_status = 'followed' THEN 1 ELSE 0 END) as followed,
  SUM(CASE WHEN follow_status = 'already_following' THEN 1 ELSE 0 END) as already_following,
  COUNT(*) as total
FROM extracted_users;
"
```

### View Daily Stats
```bash
sqlite3 db/follow-agent.db "SELECT * FROM daily_stats ORDER BY date DESC LIMIT 7;"
```

### View All Pools
```bash
sqlite3 db/follow-agent.db "SELECT pool_url, pool_type, total_extracted, processed_at FROM pools ORDER BY processed_at DESC;"
```

---

## Useful SQLite Shell Commands

| Command | Description |
|---------|-------------|
| `.tables` | List all tables |
| `.schema TABLE_NAME` | Show table structure |
| `.mode column` | Column display mode |
| `.mode csv` | CSV output mode |
| `.mode list` | List mode (pipe separated) |
| `.headers on` | Show column headers |
| `.headers off` | Hide column headers |
| `.output file.csv` | Export to CSV |
| `.output stdout` | Back to screen output |
| `.width 10 15 20` | Set column widths |
| `.quit` or `.exit` | Exit SQLite shell |
| `.help` | Show all commands |

---

## Export Data

### Export All Extracted Users to CSV
```bash
sqlite3 db/follow-agent.db <<EOF
.mode csv
.headers on
.output extracted_users.csv
SELECT * FROM extracted_users;
.quit
EOF
```

### Export Pending Users Only
```bash
sqlite3 db/follow-agent.db <<EOF
.mode csv
.headers on
.output pending_users.csv
SELECT username, pool_source, extracted_at FROM extracted_users WHERE follow_status = 'pending';
.quit
EOF
```

### Export Daily Stats
```bash
sqlite3 db/follow-agent.db <<EOF
.mode csv
.headers on
.output daily_stats.csv
SELECT * FROM daily_stats ORDER BY date DESC;
.quit
EOF
```

---

## Database Maintenance

### Delete All Pending Users (BE CAREFUL!)
```sql
DELETE FROM extracted_users WHERE follow_status = 'pending';
```

### Reset a User Back to Pending
```sql
UPDATE extracted_users
SET follow_status = 'pending', followed_at = NULL, notes = NULL
WHERE username = 'username_here';
```

### Remove Duplicate Users
```sql
DELETE FROM extracted_users
WHERE id NOT IN (
  SELECT MIN(id)
  FROM extracted_users
  GROUP BY username
);
```

### Clear All Errors (Reset to Pending)
```sql
UPDATE extracted_users
SET follow_status = 'pending', notes = NULL
WHERE follow_status = 'error';
```

### Vacuum Database (Clean Up Space)
```sql
VACUUM;
```

---

## Typical Workflow for Viewing Your Data

```bash
# 1. Open database
sqlite3 db/follow-agent.db

# 2. Set formatting (inside SQLite shell)
.mode column
.headers on

# 3. View your extracted users
SELECT username, follow_status, extracted_at FROM extracted_users LIMIT 10;

# 4. Check queue stats
SELECT follow_status, COUNT(*) FROM extracted_users GROUP BY follow_status;

# 5. View pools
SELECT pool_url, total_extracted FROM pools;

# 6. Exit
.quit
```

---

## Advanced Queries

### Users Extracted in Last 24 Hours
```sql
SELECT username, pool_type, extracted_at
FROM extracted_users
WHERE extracted_at >= datetime('now', '-1 day')
ORDER BY extracted_at DESC;
```

### Conversion Rate by Pool
```sql
SELECT
  pool_source,
  COUNT(*) as total,
  SUM(CASE WHEN follow_status = 'followed' THEN 1 ELSE 0 END) as followed,
  ROUND(100.0 * SUM(CASE WHEN follow_status = 'followed' THEN 1 ELSE 0 END) / COUNT(*), 2) as conversion_rate
FROM extracted_users
GROUP BY pool_source;
```

### Daily Follow Activity
```sql
SELECT
  DATE(followed_at) as date,
  COUNT(*) as follows,
  follow_status
FROM extracted_users
WHERE followed_at IS NOT NULL
GROUP BY DATE(followed_at), follow_status
ORDER BY date DESC;
```

### Top 10 Most Recent Actions
```sql
SELECT username, follow_status, followed_at, notes
FROM extracted_users
WHERE followed_at IS NOT NULL
ORDER BY followed_at DESC
LIMIT 10;
```

---

## Quick Reference Card

**Most Used Commands:**

```bash
# Connect
sqlite3 db/follow-agent.db

# Inside shell - view data
SELECT * FROM extracted_users LIMIT 10;

# Count by status
SELECT follow_status, COUNT(*) FROM extracted_users GROUP BY follow_status;

# View pools
SELECT * FROM pools;

# Exit
.quit
```

---

## Database Schema Quick Reference

### extracted_users
- `id` - Primary key
- `username` - Instagram username (UNIQUE)
- `extracted_at` - Timestamp when extracted
- `pool_source` - URL of pool
- `pool_type` - account_followers, post_likers, post_commenters
- `follow_status` - pending, followed, already_following, already_requested, error
- `followed_at` - Timestamp of follow action
- `notes` - Additional info

### followed_accounts (Legacy)
- `id` - Primary key
- `username` - Instagram username (UNIQUE)
- `followed_at` - Timestamp
- `pool_source` - URL of pool
- `status` - followed, unfollowed
- `unfollowed_at` - Timestamp

### pools
- `id` - Primary key
- `pool_url` - URL of pool
- `pool_type` - Type of pool
- `processed_at` - Timestamp
- `total_extracted` - Number extracted

### daily_stats
- `id` - Primary key
- `date` - Date (UNIQUE)
- `follows_count` - Number of follows
- `pools_processed` - Number of pools

---

## Troubleshooting

### "Database is locked"
```bash
# Close any open connections and try again
# Or check for background processes:
lsof db/follow-agent.db
```

### View Database File Size
```bash
ls -lh db/follow-agent.db
```

### Backup Database
```bash
cp db/follow-agent.db db/follow-agent-backup-$(date +%Y%m%d).db
```

### Restore from Backup
```bash
cp db/follow-agent-backup-20250105.db db/follow-agent.db
```
