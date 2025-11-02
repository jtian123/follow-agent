# PostgreSQL Setup Guide

This guide will help you set up the cloud PostgreSQL database so you and your partner can share data in real-time.

## Quick Setup (5 minutes)

### Step 1: Get PostgreSQL Connection String

You already have a Supabase project! Now get the connection string:

1. **Go to your Supabase project dashboard**
2. Click **"Project Settings"** (gear icon on left sidebar)
3. Click **"Database"** section
4. Scroll down to **"Connection string"**
5. Select the **"URI"** tab
6. Copy the connection string (looks like this):
   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
7. **IMPORTANT**: Replace `[YOUR-PASSWORD]` with the database password you set when creating the project

### Step 2: Create .env File

1. In your project folder, create a file named `.env` (note the dot at the beginning)
2. Add this line (replace with your actual connection string):
   ```
   DATABASE_URL=postgresql://postgres.xxx:your_password@db.xxx.supabase.co:5432/postgres
   ```
3. Save the file

**Example `.env` file:**
```
DATABASE_URL=postgresql://postgres.bbiuitlnnikbmwyrmnrf:MySecurePass123@db.bbiuitlnnikbmwyrmnrf.supabase.co:5432/postgres
```

### Step 3: Migrate Your Existing Data (Optional)

If you have existing data in SQLite that you want to keep:

```bash
npm run migrate
```

This will copy all your existing data to PostgreSQL. If you're starting fresh, skip this step.

### Step 4: Test the Connection

Run any command to verify it works:

```bash
npm run extract -- https://instagram.com/test_account account_followers 10 --account test
```

You should see: `✅ Connected to PostgreSQL database`

## For Your Partner

Your partner needs to:

1. Clone the GitHub repository
2. Run `npm install`
3. Create the same `.env` file with the **same DATABASE_URL**
4. Start using the commands

That's it! You'll now both share the same database in real-time.

## Troubleshooting

### Error: "Could not connect to PostgreSQL"

- Check that your `.env` file is in the project root folder
- Verify the password in your connection string is correct
- Make sure there are no spaces around the `=` sign in `.env`
- Try surrounding the connection string with quotes:
  ```
  DATABASE_URL="postgresql://postgres..."
  ```

### Error: "MODULE_NOT_FOUND: dotenv"

Run:
```bash
npm install
```

### Verify Your Setup

To check if everything works:
```bash
node -e "require('dotenv').config(); console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Found' : '❌ Missing')"
```

## Benefits of Cloud PostgreSQL

✅ **Real-time sync** - Both you and your partner see the same data instantly
✅ **No conflicts** - PostgreSQL handles concurrent access properly
✅ **No manual syncing** - No need to git push/pull the database
✅ **Reliable** - Cloud-hosted with automatic backups
✅ **Scalable** - Works for any team size

## Next Steps

Once setup is complete, use the tool normally:

```bash
# Extract users
npm run extract -- <pool_url> <pool_type> [count] --account <name>

# Follow users
npm run follow [session_limit] --account <name>

# Unfollow users
npm run unfollow [session_limit] --account <name>
```

All data is automatically shared between team members!
