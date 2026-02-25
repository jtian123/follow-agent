# Instagram Auto-Follow Agent 🚀

An intelligent Instagram automation tool that helps you grow your audience by automatically following targeted users from specific pools (posts or accounts). **Now with cloud PostgreSQL database for real-time team collaboration!**

## ✨ Key Features

- 🌐 **Cloud Database Sync** - PostgreSQL database enables real-time collaboration between team members
- 🤖 **Browser Automation** - Uses Puppeteer to mimic real human behavior
- ⚡ **Smart Rate Limiting** - Flexible follows/day with intelligent delays (5-25s between follows)
- 🧹 **Mass Unfollow** - Clean your Instagram following list (10-20s delays, 150 unfollow limit per session)
- 👥 **Multi-Account Support** - Manage multiple Instagram accounts with isolated queues
- 🔐 **Session Management** - Persistent login with cookie storage per account
- 📊 **Pool Extraction** - Extract users from post likers, commenters, or account followers
- 💾 **Database Tracking** - PostgreSQL database to prevent re-following and track stats
- 🎭 **Human-like Behavior** - Profile viewing, random skips, varied delays, non-sequential following
- 🛡️ **Action Block Detection** - Automatically stops if Instagram blocks actions

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- A Supabase account (free tier is sufficient)
- Instagram account(s)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jtian123/follow-agent.git
   cd follow-agent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up PostgreSQL database** (Required for team collaboration)

   - Sign up for free at [Supabase](https://supabase.com)
   - Create a new project
   - Get your database connection string:
     - Go to **Project Settings** → **Database**
     - Copy the **Connection string (URI)**
     - It looks like: `postgresql://postgres:password@db.xxx.supabase.co:5432/postgres`

4. **Create `.env` file**

   Create a file named `.env` in the project root:
   ```
   DATABASE_URL=postgresql://postgres:your_password@db.xxx.supabase.co:5432/postgres
   ```
   ⚠️ Replace `your_password` with your actual database password

5. **Migrate existing data** (if you have SQLite data from a previous version)
   ```bash
   npm run migrate
   ```

   If you're starting fresh, skip this step - the database will be initialized automatically.

6. **Test the setup**
   ```bash
   # The first command you run will initialize the database
   npm run extract -- https://instagram.com/test_account account_followers 10
   ```

### For Your Team Members

Share with your partner:
1. This GitHub repository URL
2. The `DATABASE_URL` from your `.env` file (share securely!)

They should:
1. Clone the repo
2. Run `npm install`
3. Create the same `.env` file with the same `DATABASE_URL`
4. Start using commands - all data syncs automatically!

**Benefits:**
- ✅ Real-time data synchronization
- ✅ Both can work simultaneously without conflicts
- ✅ Shared queue of extracted users
- ✅ Shared follow/unfollow history

## 📖 Usage Guide

### Two-Step Workflow (Recommended)

The agent uses a **separated workflow** - extract users once, follow multiple times.

#### Step 1: Extract Users from Pool

Extract target users and build your queue:

```bash
npm run extract -- <pool_url> <pool_type> [target_count] --account <name>
```

**Examples:**
```bash
# Extract followers of a competitor (default account)
npm run extract -- https://www.instagram.com/competitor account_followers 200

# Extract with specific account
npm run extract -- https://www.instagram.com/target account_followers 200 --account ucla_apateu

# Extract users who liked a post
npm run extract -- https://www.instagram.com/p/ABC123/ post_likers 200 --account sf_apateu

# Using environment variable (simpler)
IG_ACCOUNT=ucb_apateu npm run extract https://www.instagram.com/target account_following 200
```

**Pool Types:**
- `account_followers` - Extract followers of an account
- `account_following` - Extract accounts that a user is following
- `post_likers` - Extract users who liked a specific post
- `post_commenters` - Extract users who commented on a post

**What it does:**
- Scrolls through the modal to extract usernames
- Saves users to database with status `pending`
- Skips users already in database
- Can extract 200-500+ users per pool

#### Step 2: Follow Users from Queue

Follow pending users from your queue:

```bash
npm run follow [session_limit] --account <name>
```

**Examples:**
```bash
# Follow up to 15 users (default, safe)
npm run follow

# Follow 20 users with specific account
npm run follow -- 20 --account ucla_apateu

# Using environment variable
IG_ACCOUNT=sf_apateu npm run follow 15
```

**What it does:**
- Pulls pending users from database queue
- Visits each profile and checks follow status
- Auto-syncs database with Instagram reality
- If "Already following" → Updates database (syncs manual follows from phone/web)
- If "Follow" button found → Clicks and records to database
- You control session limit (no hardcoded daily limit)

### Mass Unfollow

Clean your Instagram following list:

```bash
npm run unfollow [session_limit] [max_extract] --account <name>
```

**Examples:**
```bash
# Unfollow 150 users (default, safe)
npm run unfollow --account sf_apateu

# Unfollow 200 users
npm run unfollow 200 --account ucla_apateu

# Using environment variable
IG_ACCOUNT=sf_apateu npm run unfollow 100
```

**Features:**
- Default: 150 unfollows per session (conservative)
- Delays: 10-20 seconds between unfollows
- No database tracking (simple)
- Resumable - run multiple times

### Cleanup Extracted Users

Remove users from your extraction queue:

```bash
npm run cleanup <pool_url> --account <name> [--today] [--dry-run]
```

**Examples:**
```bash
# Preview what would be deleted (dry run)
npm run cleanup https://instagram.com/badpool/ --account ucla_apateu --dry-run

# Delete users from a specific pool
npm run cleanup https://instagram.com/badpool/ --account ucla_apateu

# Delete only today's extractions
npm run cleanup https://instagram.com/badpool/ --account ucla_apateu --today
```

## 👥 Multi-Account Support

Manage multiple Instagram accounts with isolated queues!

**Each account gets:**
- Separate session (cookies + browser profile)
- Isolated queue (extracted users tagged per account)
- Independent statistics

**How it works:**
```bash
# UCLA account extracts users
npm run extract -- <url> account_followers 200 --account ucla_apateu

# SF account extracts different users
npm run extract -- <url> account_followers 200 --account sf_apateu

# UCLA follows from its own queue only
npm run follow 15 --account ucla_apateu

# SF follows from its own queue only
npm run follow 15 --account sf_apateu
```

**Environment variable method (recommended):**
```bash
IG_ACCOUNT=ucla_apateu npm run extract <url> <type> 200
IG_ACCOUNT=ucla_apateu npm run follow 15
IG_ACCOUNT=sf_apateu npm run unfollow 150
```

## 💡 Best Practices

### Recommended Workflow

**Week 1: Build Queue**
```bash
# Extract from multiple pools to build diverse queue
npm run extract -- https://instagram.com/competitor1 account_followers 200
npm run extract -- https://instagram.com/competitor2 account_following 200
npm run extract -- https://instagram.com/p/viral_post post_likers 200
# Queue now has ~600 users
```

**Daily: Follow from Queue**
```bash
# Morning session (15 users)
npm run follow 15

# Evening session (15 users)
npm run follow 15

# Daily total: 30 follows (safe and sustainable)
```

**As Needed: Refill Queue**
```bash
# When queue drops below 100 pending
npm run extract -- <new_pool_url> account_followers 200
```

### Safety Tips

1. **Start Conservative** - Begin with 20-30 follows per day total
2. **Space Out Sessions** - Run 2-3 sessions per day (morning/afternoon/evening)
3. **Choose Quality Pools** - Select posts/accounts with your target audience
4. **Monitor Queue Stats** - Commands show pending/followed/total counts
5. **Take Breaks** - If action blocked, wait 6-12 hours before resuming

**Daily Limits by Account Age:**
- **New accounts (<3 months)**: 15-20 total per day
- **Established accounts (>6 months)**: 30-40 per day
- **Old accounts (>1 year)**: 50+ per day if needed

## 🔧 Technical Details

### Project Structure

```
follow-agent/
├── src/
│   ├── index.js                 # Main entry (single-step)
│   ├── extract.js               # Extract users CLI
│   ├── follow.js                # Follow from queue CLI
│   ├── unfollow.js              # Mass unfollow CLI
│   ├── cleanup.js               # Cleanup CLI
│   ├── services/
│   │   ├── poolExtractor.js     # Pool extraction logic
│   │   ├── followExecutor.js    # Follow execution logic
│   │   └── unfollowExecutor.js  # Unfollow execution logic
│   └── utils/
│       ├── browser.js           # Browser automation
│       ├── database.js          # PostgreSQL operations
│       ├── helpers.js           # Helper functions
│       └── logger.js            # Logging
├── data/accounts/               # Per-account session data
├── migrate-to-postgres.js       # SQLite → PostgreSQL migration
├── .env                         # Database credentials (not in git)
└── package.json
```

### Database Schema (PostgreSQL)

**extracted_users** (Primary Queue)
- `username` - Instagram username
- `extracted_at` - When extracted
- `pool_source` - Pool URL
- `pool_type` - Type of pool
- `follow_status` - `pending`, `followed`, `already_following`, `already_requested`, `error`
- `followed_at` - When followed
- `notes` - Additional info
- `extracted_by_account` - Which account extracted (for queue isolation)

**followed_accounts** (Legacy tracking)
- `username` - Instagram username
- `followed_at` - When followed
- `pool_source` - Pool URL
- `status` - Current status

**pools**
- `pool_url` - Pool URL
- `pool_type` - Pool type
- `processed_at` - When processed
- `total_extracted` - Users extracted

**daily_stats**
- `date` - Date
- `follows_count` - Follows that day
- `unfollows_count` - Unfollows that day
- `pools_processed` - Pools processed

## 🛡️ Safety Features

- **Flexible Session Limits** - You control the pace
- **Smart Delays** - 5-25 seconds between follows (human-like)
- **Random Pauses** - Natural breaks every 3-7 follows
- **Action Block Detection** - Auto-stops if Instagram blocks
- **Duplicate Prevention** - Never re-follow or re-request
- **Profile Viewing** - Occasional post viewing (10% chance)
- **Non-Sequential** - Random order processing

## 📊 Expected Output

### Extract Command
```
📊 Current Queue Status:
   ⏳ Pending users: 0
   ✅ Followed: 0
   👥 Already following: 0

🔍 Extracting from pool...
   📊 Extracted 215 users
   ✅ Added 215 NEW users to queue

📊 Updated Queue Status:
   ⏳ Pending users: 215
   ✅ Followed: 0
```

### Follow Command
```
📊 Queue Status:
   ⏳ Pending users: 215
   ✅ Followed: 0

[1] 👤 Processing: @username1
   ✅ Followed @username1
   ⏳ Waiting 37s...

[2] 👤 Processing: @username2
   ⏭️  Already following @username2
   💾 Updated database

📊 SESSION SUMMARY
✅ Followed: 18
⏭️  Skipped: 2
❌ Errors: 0
```

## ❓ Troubleshooting

### "Action Blocked" Error
- Instagram temporarily blocked following
- **Solution**: Wait 6-12 hours before resuming
- If repeated: reduce daily limit to 15-20 or pause for 2-3 days

### "Follow button not found"
- Profile may be private or UI changed
- **Solution**: Agent will skip and continue automatically

### Database Connection Error
- Check your `.env` file exists and has correct `DATABASE_URL`
- Verify password in connection string is correct
- **Solution**: Re-copy connection string from Supabase

### Login Issues
- Delete `data/accounts/<account_name>/cookies.json` and login again
- Disable 2FA or handle it manually during first login

## 📄 Additional Documentation

- **[SETUP.md](./SETUP.md)** - Detailed PostgreSQL setup guide
- **[CLAUDE.md](./CLAUDE.md)** - Technical architecture for developers

## ⚠️ Disclaimer

This tool is for educational purposes. Use responsibly and respect Instagram's Terms of Service. Excessive automation may result in account restrictions or bans.

**Risk Level:** LOW (3-4/10) with recommended settings (20-30 follows/day)

## 🤝 Contributing

This is a private tool for team use. If you're a team member and want to suggest improvements, discuss with the team lead.

## 📝 License

ISC - For internal team use only.

---

**Made with ❤️ for efficient Instagram growth**

Need help? Check the troubleshooting section or contact your team lead.
