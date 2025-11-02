# Getting Started Guide

## 🚀 Quick Setup (5 Minutes)

### Prerequisites
- Node.js (v16+) - [Download](https://nodejs.org)
- Instagram account
- Terminal/Command line access

### Installation

```bash
# 1. Navigate to project
cd /Users/jinyaotian/Desktop/Apateu-Marketing/follow-agent

# 2. Install dependencies (first time only)
npm install

# 3. Run the agent
npm start <POOL_URL> <POOL_TYPE>
```

### First Run - Login

On first run, browser opens and you login manually:
1. Enter Instagram credentials
2. Complete 2FA if enabled
3. Agent saves session (auto-login next time)

---

## 📝 Usage Examples

### Pool Types

| Type | What It Does | URL Format | Example |
|------|-------------|------------|---------|
| `post_likers` | Extract users who liked a post | `instagram.com/p/ABC123/` | `npm start https://www.instagram.com/p/ABC123/ post_likers` |
| `post_commenters` | Extract users who commented | `instagram.com/p/ABC123/` | `npm start https://www.instagram.com/p/ABC123/ post_commenters` |
| `account_followers` | Extract followers of account | `instagram.com/username` | `npm start https://www.instagram.com/nike account_followers` |

### Daily Routine (Recommended)

**Morning Session:**
```bash
npm start https://www.instagram.com/p/EXAMPLE1/ post_likers
# Result: ~15 follows in 4 minutes
```

**Evening Session:**
```bash
npm start https://www.instagram.com/p/EXAMPLE2/ account_followers
# Result: ~15 follows in 4 minutes
```

**Daily Total:** ~30 follows in ~8 minutes

---

## 📊 What to Expect

### Startup Output
```
📊 Daily Progress Check:
   ✅ Completed today: 0/30 follows
   🎯 Remaining: 30 follows
   📋 Session limit: 15 follows
   💡 Will extract: 30+ NEW users
```

### Extraction Output
```
🔍 Extracting users from pool...
   📜 Scrolling to extract NEW followers only...
   📊 Found 15 NEW followers so far (target: 30)...
   ✅ Target reached: 35 NEW followers

🎲 Applying 75% selection randomization...
   Selected 26 users from 35 (75% selection)
```

### Follow Process
```
🚀 Starting session: will follow 15 users

[1/15] 👤 Processing: @username
   ✅ Followed @username
   ⏳ Waiting 12s before next user...

📊 SESSION SUMMARY
✅ Successfully followed: 15
📈 Total followed today: 15/30
🎯 Remaining today: 15
```

### Session Duration
- **Extraction:** 1-2 minutes (scrolling to get NEW users)
- **Following:** 3-4 minutes (15 users @ 5-25s each)
- **Total:** ~4-5 minutes per session

---

## 🎯 Finding Good Pools

### Best Practices

**Post Likers (Highest Quality):**
- Recent posts (< 24 hours old)
- 500-5000 likes (sweet spot)
- Your niche/industry
- Avoid mega-viral posts (100k+ likes)

**Account Followers (Good Variety):**
- Competitor accounts
- Influencers in your niche
- Similar business size to yours
- Active accounts (recent posts)

**Post Commenters (Highly Engaged):**
- Posts with questions/engagement
- Giveaway posts
- Controversial/discussion topics

---

## ⚙️ Configuration (Optional)

### Change Daily Limit
Edit `src/services/followExecutor.js`:
```javascript
const DAILY_LIMIT = 30;  // Change to 20 or 40
```

### Change Session Limit
```javascript
const SESSION_LIMIT = 15; // Change to 10 or 20
```

### Change Delays
```javascript
const MIN_DELAY = 5000;   // 5 seconds
const MAX_DELAY = 25000;  // 25 seconds
```

---

## 🛑 Stopping & Resuming

**To Stop:**
- Press `Ctrl + C` in terminal
- Progress is saved automatically
- Safe to stop anytime

**To Resume:**
- Run the same command again
- Agent checks database for progress
- Continues from where you left off

---

## 🔧 Troubleshooting

### "Command not found: npm"
```bash
# Install Node.js from https://nodejs.org
# Then try again
```

### "No NEW users found"
- Pool may have mostly followed users already
- Try a different pool
- Agent filters out already-followed automatically

### "Action blocked"
- Instagram detected automation
- Wait 6-12 hours before trying again
- Reduce daily limit to 20 if this persists

### Force Re-login
```bash
# Delete saved session
rm -rf data/browser-profile/
rm data/cookies.json

# Next run will require login again
```

---

## 📈 Success Metrics

### Track Your Growth

**Weekly:**
- Follows: ~150-200 (30/day × 7 days)
- Time spent: ~1 hour total (~8 min/day)

**Monthly:**
- Follows: ~600-900
- Expected follow-back rate: 10-30% (industry standard)
- New followers: ~60-270/month

### Red Flags (Stop if you see)
- ❌ Multiple action blocks in a week
- ❌ Sudden drop in reach/engagement
- ❌ Instagram warning messages

---

## 💡 Pro Tips

1. **Vary Pools** - Don't use same pool twice
2. **Peak Times** - Run during 9-10 AM and 6-8 PM
3. **Quality Over Quantity** - Choose pools carefully
4. **Monitor Results** - Track which pools give best follow-backs
5. **Stay Active** - Post regularly (3-5x/week)
6. **Mix Manual Activity** - Engage manually too

---

## ✅ Quick Start Checklist

- [ ] Node.js installed
- [ ] Project dependencies installed (`npm install`)
- [ ] Pool URL ready (post or account)
- [ ] Pool type determined
- [ ] Terminal in correct directory
- [ ] Ready to login to Instagram (first run)

**All set? Run:**
```bash
npm start <YOUR_POOL_URL> <POOL_TYPE>
```

---

## 📞 Need Help?

- Check `README.md` for detailed documentation
- Check `VISUAL_GUIDE.md` for what to expect visually
- Review logs in `logs/` directory for errors
- Check database: `db/follow-agent.db`

Happy growing! 🚀
