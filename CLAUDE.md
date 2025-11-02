# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Instagram automation agent that provides:
1. **Auto-follow** - Automatically follow targeted users from specific "pools" (Instagram posts or accounts)
2. **Mass unfollow** - Clean following list by unfollowing current followings
3. **Multi-account support** - Manage multiple Instagram accounts with isolated queues

The agent uses browser automation to mimic human behavior and avoid detection.

**Key Requirements:**
- Browser automation using Puppeteer (run in non-headless mode for human-like behavior)
- User manually provides pool URLs (no automatic pool discovery)
- Flexible daily limits (user-controlled, no hardcoded limits)
- Human-like behavior: random delays, scrolling, mouse movements
- Persistent session and action logging
- Multi-account support with separate sessions and isolated queues
- Cloud PostgreSQL database for real-time data sharing between team members

## Database Setup (PostgreSQL)

This project uses **PostgreSQL** (hosted on Supabase or similar) for shared database access between team members.

### Initial Setup

1. **Create a Supabase account** (or use Neon, Railway, etc.)
   - Sign up at https://supabase.com
   - Create a new project
   - Note your database password

2. **Get PostgreSQL connection string**
   - Go to Project Settings → Database
   - Copy the "Connection string" (URI format)
   - Example: `postgresql://postgres:password@db.xxx.supabase.co:5432/postgres`

3. **Create `.env` file** in project root:
   ```
   DATABASE_URL=postgresql://postgres:your_password@db.xxx.supabase.co:5432/postgres
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Migrate existing data** (if you have SQLite data):
   ```bash
   npm run migrate
   ```
   This will copy all your existing SQLite data to PostgreSQL.

6. **Test the connection**:
   ```bash
   npm run extract -- https://instagram.com/test_account account_followers 10
   ```

### Sharing Database with Team

Both you and your partner should:
1. Have the same `DATABASE_URL` in your `.env` files
2. Run commands normally - all data syncs automatically
3. Both can extract/follow simultaneously without conflicts

**Benefits:**
- ✅ Real-time data synchronization
- ✅ No manual git push/pull of database
- ✅ Both can work simultaneously
- ✅ Shared queue of extracted users
- ✅ Shared follow/unfollow history

## Architecture Strategy

### Core Components

**1. Browser Automation Layer**
- Puppeteer-based browser control
- Session management (cookie persistence)
- Human-like action simulation (delays, scrolling, mouse movement)

**2. Pool Processing Module**
- Accepts pool URL and type (post likers/commenters/account followers/account following)
- Extracts user list from Instagram UI
- Filters against already-followed database

**3. Follow Executor**
- Configurable session limits (default: 15 per session)
- Fast delays between follows (5-25 seconds)
- User controls daily limits (no hardcoded restrictions)
- Error detection and auto-pause on Instagram blocks

**3b. Unfollow Executor**
- Mass unfollow capability for cleaning following list
- Conservative delays (10-20 seconds between unfollows)
- Default session limit: 150 unfollows
- No database tracking (simple and clean)

**4. Data Persistence**
- PostgreSQL database tracking (cloud-hosted for team collaboration):
  - `extracted_users`: extraction queue with per-account isolation (`extracted_by_account`)
  - `followed_accounts`: username, timestamp, pool source, status
  - `pools`: pool URL, type, processed timestamp, total extracted
  - `daily_stats`: date, follows count, unfollows count, pools processed
- Prevents re-following same accounts
- Analytics on pool performance
- Multi-account queue isolation
- Real-time sync between team members

**5. Multi-Account Management**
- Each account has separate browser profile and cookies
- Isolated extraction queues per account (`extracted_by_account` field)
- Switch accounts via `--account` flag or `IG_ACCOUNT` environment variable
- Accounts stored in `data/accounts/<account_name>/`

### Execution Flow

#### Follow Workflow (Two-Step)
```
1. Extract: npm run extract <url> <type> [count] --account <name>
   - Navigate to pool → Open modal → Scroll and extract usernames
   - Save to database with status 'pending' and account tag
   - Build reusable queue

2. Follow: npm run follow [session_limit] --account <name>
   - Pull pending users from account's queue
   - Visit each profile → Check status → Follow if needed
   - Database auto-syncs with Instagram reality
   - User controls session limit (default: 15)
```

#### Unfollow Workflow
```
1. Unfollow: npm run unfollow [session_limit] [max_extract] --account <name>
   - Navigate to profile's following page
   - Scroll and extract all usernames being followed
   - Visit each profile → Click "Following" → "Unfollow"
   - Wait 10-20s between unfollows
   - Default session limit: 150
```

### Safety & Rate Limiting

**Follow Rules:**
- No hardcoded daily limit (user controls via session limits)
- Default session limit: 15 follows
- Inter-follow delay: Random 5-25 seconds (avg ~15s)
- Random pauses: Every 3-7 follows (15-30 sec)
- Error handling: Detect action blocks, auto-pause, alert user

**Unfollow Rules:**
- Default session limit: 150 unfollows
- Inter-unfollow delay: Random 10-20 seconds
- Conservative approach to avoid Instagram restrictions
- Error handling: Detect action blocks, auto-stop

### Browser Behavior Patterns

**To avoid detection:**
- Non-headless browser (visible during development)
- Mouse movement variation (not straight lines)
- Natural scrolling through user lists
- Random hover over profiles without following
- Mix pauses and actions unpredictably
- Maintain persistent cookies (don't re-login each time)

## Development Context

**Technology Stack:**
- Node.js + Puppeteer for browser automation
- PostgreSQL (cloud-hosted) for data persistence and team collaboration
- CLI interface for user interaction

**User Interaction:**
- User manually selects pools (posts/accounts with target audience)
- User specifies pool type (followers/likers/commenters)
- Agent handles extraction, filtering, and following
- Real-time progress feedback in console

**Pool Types:**
- `post_likers`: Users who liked a specific post
- `post_commenters`: Users who commented on a post
- `account_followers`: Followers of a specific account
- `account_following`: Accounts that a specific user is following

## Key Implementation Notes

1. **Session Management**: Store Instagram cookies to avoid repeated logins
2. **State Persistence**: Must be able to stop/resume without losing progress
3. **Queue Management**: Track daily quota, session quota, and already-followed users
4. **Error Recovery**: Handle network issues, Instagram errors, action blocks gracefully
5. **Logging**: Detailed logs for debugging and analytics (which pools convert best)

## Command Structure

### Current Commands

**Extract users from pool:**
```bash
npm run extract -- <pool_url> <pool_type> [target_count] --account <name>
# Example: npm run extract -- https://instagram.com/competitor account_followers 200 --account ucla_apateu
```

**Follow from queue:**
```bash
npm run follow [session_limit] --account <name>
# Example: npm run follow 15 --account ucla_apateu
```

**Unfollow current followings:**
```bash
npm run unfollow [session_limit] [max_extract] --account <name>
# Example: npm run unfollow 150 --account sf_apateu
```

**Cleanup extracted users:**
```bash
npm run cleanup <pool_url> --account <name> --today --dry-run
# Example: npm run cleanup https://instagram.com/badpool/ --account usc_apateu --today
```

**Environment variable alternative (simpler):**
```bash
IG_ACCOUNT=ucla_apateu npm run extract <url> <type> <count>
IG_ACCOUNT=ucla_apateu npm run follow 15
IG_ACCOUNT=sf_apateu npm run unfollow 150
```

All commands:
- Show real-time progress
- Display queue stats and daily counts
- Log all actions to database
- Handle interruptions gracefully
- Support multi-account via `--account` flag or `IG_ACCOUNT` env variable
