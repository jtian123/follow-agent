# Multi-Account Management Guide

This guide explains how to manage multiple Instagram accounts with the follow-agent.

## Overview

The agent supports multiple Instagram accounts by storing separate sessions (cookies and browser profiles) for each account. You can easily switch between accounts using command-line flags or environment variables.

## Account Storage Structure

Each account gets its own isolated directory:
```
data/
└── accounts/
    ├── default/
    │   ├── cookies.json
    │   └── browser-profile/
    ├── ucla_apateu/
    │   ├── cookies.json
    │   └── browser-profile/
    └── ucb_apateu/
        ├── cookies.json
        └── browser-profile/
```

## How to Switch Accounts

### Method 1: Using Environment Variable (Recommended - Simpler)

Set the `IG_ACCOUNT` environment variable:

```bash
# Extract with specific account
IG_ACCOUNT=ucla_apateu npm run extract https://instagram.com/competitor account_followers 200

# Follow with specific account
IG_ACCOUNT=ucla_apateu npm run follow 15

# Different account
IG_ACCOUNT=ucb_apateu npm run follow 20
```

### Method 2: Using Command-Line Flags

Use `--account` or `-a` flag with `--` separator:

```bash
# Extract with specific account (note the -- after extract)
npm run extract -- https://instagram.com/competitor account_followers 200 --account ucla_apateu

# Follow with specific account
npm run follow -- 15 --account ucla_apateu

# Short form
npm run follow -- 20 -a ucb_apateu
```

**Important:** The `--` after `extract` or `follow` is required when using flags. It tells npm to pass everything after it to the script.

## First-Time Setup for New Account

When using an account for the first time:

1. Run any command with the new account name:
   ```bash
   IG_ACCOUNT=ucb_apateu npm run extract https://instagram.com/test account_followers 10
   ```

2. The browser will open and you'll need to **manually login** to Instagram with that account

3. After login, the session is saved automatically in `data/accounts/ucb_apateu/`

4. Future runs with `--account ucb_apateu` will use the saved session (no re-login needed)

## Workflow Examples

### Scenario 1: Managing Two School Accounts (Isolated Queues)

```bash
# Morning: UCLA extracts and follows
IG_ACCOUNT=ucla_apateu npm run extract https://instagram.com/ucla_housing account_followers 200
IG_ACCOUNT=ucla_apateu npm run follow 15
# UCLA's queue: 185 pending users (200 - 15)

# Afternoon: UCB extracts and follows
IG_ACCOUNT=ucb_apateu npm run extract https://instagram.com/ucb_housing account_followers 200
IG_ACCOUNT=ucb_apateu npm run follow 15
# UCB's queue: 185 pending users (completely separate from UCLA)

# Evening: Back to UCLA (continues from UCLA's queue)
IG_ACCOUNT=ucla_apateu npm run follow 15
# UCLA's queue: 170 pending users (185 - 15)
# Note: UCB's queue unchanged (still 185 pending)
```

**Key Point:** Each account has its own isolated queue. UCLA following 30 users doesn't affect UCB's queue at all.

### Scenario 2: Different Pools for Different Accounts

```bash
# UCLA builds its queue from UCLA-related accounts
IG_ACCOUNT=ucla_apateu npm run extract https://instagram.com/uclasubletting account_followers 300
IG_ACCOUNT=ucla_apateu npm run extract https://instagram.com/ucla account_following 200
# UCLA's queue: 500 pending users

# UCB builds its queue from UCB-related accounts
IG_ACCOUNT=ucb_apateu npm run extract https://instagram.com/ucberkeley account_followers 300
IG_ACCOUNT=ucb_apateu npm run extract https://instagram.com/berkeley_sublets account_following 200
# UCB's queue: 500 pending users (completely separate from UCLA)

# Now follow from each queue independently
IG_ACCOUNT=ucla_apateu npm run follow 20  # Follows from UCLA's 500-user queue
IG_ACCOUNT=ucb_apateu npm run follow 20   # Follows from UCB's 500-user queue
```

## Important Notes

### Database Considerations

✅ **Queue Isolation Implemented:** The SQLite database is shared, but queues are **completely isolated per account**:
- `ucla_apateu` extracts users → Tagged with `extracted_by_account = 'ucla_apateu'`
- `ucb_apateu` extracts users → Tagged with `extracted_by_account = 'ucb_apateu'`
- Following with `ucla_apateu` → **Only** pulls from users tagged with `ucla_apateu`
- Following with `ucb_apateu` → **Only** pulls from users tagged with `ucb_apateu`

**Example:**
```bash
# Extract 100 users with UCLA account
IG_ACCOUNT=ucla_apateu npm run extract https://instagram.com/target account_followers 100

# Check UCLA's queue stats
IG_ACCOUNT=ucla_apateu npm run follow 0
# Shows: 100 pending users

# Check UCB's queue stats
IG_ACCOUNT=ucb_apateu npm run follow 0
# Shows: 0 pending users (UCLA's extraction doesn't affect UCB)
```

**Benefits:**
- ✅ Each account has isolated queue
- ✅ Shared database (efficient, single file)
- ✅ No cross-contamination between accounts
- ✅ Accurate stats per account

### Existing Database Migration

If you have existing data from before this update:
- Existing extracted users are automatically tagged as `extracted_by_account = 'default'`
- Use `--account default` (or no flag) to access these users
- No data loss, fully backward compatible

### Session Isolation

- Each account has its own browser profile and cookies
- Logging into one account doesn't affect others
- You can be "logged in" to multiple accounts simultaneously (different sessions)

### Security

- Cookie files contain sensitive session data
- Make sure to add `data/` to `.gitignore` (already done)
- Don't share your `data/accounts/` directory

## Troubleshooting

### "Could not find following/followers link"
- Make sure you're logged into the correct account
- Delete the account's cookies and login again:
  ```bash
  rm -rf data/accounts/ucla_apateu/cookies.json
  ```

### Account keeps logging out
- Instagram may have detected automation
- Wait 24 hours before using that account again
- Consider reducing follow rates for that account

### Wrong account is being used
- Make sure you're passing `--account` flag or setting `IG_ACCOUNT` environment variable
- Check the console output - it shows: `📱 Using account: <name>`

## Default Account

If you don't specify an account, the agent uses `default`:
```bash
npm run follow 15
# Uses: data/accounts/default/
```

This is useful if you only have one Instagram account.

## Mass Unfollow: Cleaning Your Following List

Use the unfollow command to remove users from your current following list. This is useful when you want to restart your profile or clean up your account.

### Basic Usage

```bash
# Unfollow 150 users (default)
IG_ACCOUNT=sf_apateu npm run unfollow

# Unfollow 200 users
npm run unfollow 200 --account sf_apateu

# Unfollow 100 users, extract max 500 from following list
npm run unfollow -- 200 200 --account ucb_apateu
```

### How It Works

1. **Extracts your following list** - Scrolls through your profile's following page
2. **Visits each profile** - Goes to each user one by one
3. **Unfollows** - Clicks "Following" → "Unfollow"
4. **Waits 10-20s** - Between each unfollow (safe delays)
5. **Stops at limit** - Default 150 per session

### Common Scenarios

**Scenario 1: Fresh start for new marketing campaign**
```bash
# Run multiple sessions to clean entire following list
IG_ACCOUNT=sf_apateu npm run unfollow 150  # Session 1
# Wait 1-2 hours
IG_ACCOUNT=sf_apateu npm run unfollow 150  # Session 2
# Repeat until list is clean
```

**Scenario 2: Clean up before rebranding**
```bash
# Remove all current followings before new strategy
IG_ACCOUNT=ucla_apateu npm run unfollow 200
```

### Important Notes

⚠️ **The unfollow is permanent** - Users are removed from your following list on Instagram

✅ **No database tracking** - Unfollow doesn't save which users were unfollowed (keeps it simple)

✅ **Resumable** - Run the command multiple times to continue unfollowing

✅ **Safe delays** - 10-20 seconds between unfollows (conservative)

✅ **High default limit** - 150 per session (can be adjusted)

## Cleanup: Removing Extracted Users

If you accidentally extracted users from a "dirty" pool or made a mistake, you can remove them using the cleanup command.

### Basic Usage

**Step 1: Dry run (preview what will be deleted):**
```bash
npm run cleanup https://www.instagram.com/ditto_usc/ --account usc_apateu --today --dry-run
```

**Step 2: Actually delete the users:**
```bash
npm run cleanup https://www.instagram.com/ditto_usc/ --account usc_apateu --today
```

### Cleanup Options

The cleanup command accepts these flags:

- `--account <name>` or `-a <name>`: Filter by account (e.g., `usc_apateu`)
- `--today`: Only remove users extracted today
- `--dry-run`: Preview what would be deleted without actually deleting

### Examples

**Remove users extracted today from a specific pool:**
```bash
npm run cleanup https://www.instagram.com/ditto_usc/ --account usc_apateu --today
```

**Remove ALL users from a pool (all dates):**
```bash
npm run cleanup https://www.instagram.com/ditto_usc/ --account usc_apateu
```

**Remove from all accounts (not filtered by account):**
```bash
npm run cleanup https://www.instagram.com/ditto_usc/
```

**Always test first with dry-run:**
```bash
# This shows what WOULD be deleted without actually deleting
npm run cleanup https://www.instagram.com/badpool/ --account usc_apateu --dry-run
```

### What the Cleanup Shows

When you run cleanup, it will display:
- Total number of users to be removed
- Breakdown by status (pending/followed/already_following)
- Preview of first 10 usernames
- A 5-second countdown before deletion (press Ctrl+C to cancel)

### Common Scenarios

**Scenario 1: Just extracted from wrong pool this morning**
```bash
# Extract accidentally ran
npm run extract https://www.instagram.com/spam_account/ account_followers 200 --account usc_apateu

# Realize mistake, remove them
npm run cleanup https://www.instagram.com/spam_account/ --account usc_apateu --today
```

**Scenario 2: Pool has "dirty" accounts mixed in**
```bash
# You extracted 300 users but realized pool has fake accounts
npm run cleanup https://www.instagram.com/ditto_usc/ --account usc_apateu

# Then extract from a better pool
npm run extract https://www.instagram.com/quality_account/ account_followers 300 --account usc_apateu
```

**Scenario 3: Want to re-extract from same pool with different settings**
```bash
# Remove old extraction
npm run cleanup https://www.instagram.com/target/ --account usc_apateu

# Re-extract with higher count
npm run extract https://www.instagram.com/columbiasubletting/ account_following 500 --account columbia_apateu
```

### Important Notes

⚠️ **The cleanup is permanent** - deleted users are removed from the database and cannot be recovered

✅ **Always use --dry-run first** to preview what will be deleted

✅ **The --today flag is safest** when you just want to undo a recent extraction

✅ **Cleanup only affects extracted_users table** - it doesn't remove from followed_accounts (history of actual follows stays intact)
