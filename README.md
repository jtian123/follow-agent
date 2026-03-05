# Instagram Growth Agent

A tool that automatically finds and follows potential customers on Instagram — so you don't have to do it manually.

---

## How It Works

1. You give it a target (a competitor's account, or a popular post)
2. It scrapes the followers/likers from that target
3. It automatically follows them one by one, with human-like delays
4. Later, you can mass-unfollow people who didn't follow back

---

## First-Time Setup

> Do this once before anything else.

**1. Install Node.js** if you don't have it → [nodejs.org](https://nodejs.org) (download the LTS version)

**2. Open Terminal**, navigate to this folder, and run:
```bash
npm install
```

**3. Create a `.env` file** in this folder with the database URL (ask your team lead for this):
```
DATABASE_URL=postgresql://...
```

That's it. You're ready.

---

## Daily Usage

### Step 1 — Find people to follow (Extract)

Pick a target Instagram account or post, then run:

```bash
npm run extract -- <instagram_url> <type> <how_many> --account <your_account>
```

**Examples:**
```bash
# Get 200 followers from a competitor
npm run extract -- https://www.instagram.com/somecompetitor account_followers 200 --account ucla_apateu

# Get people who liked a specific post
npm run extract -- https://www.instagram.com/p/ABC123/ post_likers 200 --account ucla_apateu
```

**Types you can use:**
| Type | What it grabs |
|---|---|
| `account_followers` | People who follow that account |
| `account_following` | People that account follows |
| `post_likers` | People who liked a post |
| `post_commenters` | People who commented on a post |

The agent will open a browser, scroll through the list, and save everyone to a queue.

---

### Step 2 — Start following (Follow)

Once you've extracted users, run this to start following them:

```bash
npm run follow -- <how_many> --account <your_account>
```

**Examples:**
```bash
# Follow 15 people (safe default)
npm run follow -- 15 --account ucla_apateu

# Follow 30 people
npm run follow -- 30 --account ucla_apateu
```

The agent visits each profile and follows them with random pauses (5–25 seconds) to look human. It won't follow the same person twice.

---

### Unfollow people who didn't follow back

```bash
npm run unfollow -- <how_many> --account <your_account>
```

**Examples:**
```bash
# Unfollow 150 people (default)
npm run unfollow -- --account sf_apateu

# Unfollow 200 people
npm run unfollow -- 200 --account sf_apateu
```

The agent will go through your following list and unfollow them one by one (10–20 second delays).

---

## Multiple Accounts

Each account has its own separate queue. Just swap the `--account` name:

```bash
npm run follow -- 15 --account ucla_apateu
npm run follow -- 15 --account sf_apateu
npm run follow -- 15 --account usc_apateu
```

---

## How many should I follow per day?

| Account Age | Safe Daily Limit |
|---|---|
| New (< 3 months) | 15–20 per day |
| Medium (3–6 months) | 20–30 per day |
| Established (> 6 months) | 30–50 per day |

Split into 2–3 sessions throughout the day (morning + evening works great).

---

## Troubleshooting

**"Action Blocked" error**
Instagram temporarily restricted the account. Stop for 6–12 hours, then continue with a lower number.

**Browser opens but nothing happens / login screen appears**
The session expired. Just log in manually in the browser window that opens — the agent will wait up to 5 minutes for you.

**"Could not find Profile button"**
Same as above — you've been logged out. Log in when the browser opens.

**Want to remove bad extractions?**
```bash
npm run cleanup -- https://instagram.com/badpool/ --account ucla_apateu --dry-run
# Remove --dry-run to actually delete
```

---

## Need help?

Contact your team lead or check with whoever set this up.
