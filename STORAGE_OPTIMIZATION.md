# Storage Optimization Summary

## Problem
Browser profiles were accumulating excessive cache data, causing each account folder to grow to **1.5-2.3GB** in size. With multiple accounts, this resulted in **~15GB** of unnecessary storage usage.

## Root Cause
Puppeteer's browser profiles store:
- Page cache (1.3GB per account)
- Code cache (200-900MB per account)
- Service workers, IndexedDB, local storage, etc.

Since all actual data is stored in Supabase (PostgreSQL), these browser caches served no purpose.

## Solution Implemented

### 1. Browser Cache Disabled (src/utils/browser.js:57-68)
Added Chrome flags to prevent cache accumulation:
```javascript
'--disk-cache-size=1',
'--media-cache-size=1',
'--disable-gpu-shader-disk-cache',
'--disable-application-cache',
'--disable-offline-load-stale-cache',
'--disable-back-forward-cache'
```

**Impact:** New browser sessions will only store cookies (~5-10MB per account)

### 2. Cache Cleanup Script (src/cache-cleanup.js)
Created automated tool to remove existing cache folders:
- Safely deletes 16 types of cache folders
- Preserves cookies and essential browser settings
- Supports dry-run mode for preview
- Can target specific accounts or clean all

**Usage:**
```bash
# Preview what will be deleted
npm run cache-cleanup -- --dry-run

# Clean all accounts
npm run cache-cleanup

# Clean specific account
npm run cache-cleanup ucla_apateu
```

## Results

### Before Optimization
- **columbia_apateu:** 1.7GB
- **default:** 1.5GB
- **nyu_apateu:** 1.0GB
- **sf_apateu:** 1.9GB
- **ucb_apateu:** 2.3GB
- **ucla_apateu:** 1.9GB
- **usc_apateu:** 2.0GB
- **uw_apateu:** 1.9GB
- **Total:** ~15GB

### After Optimization
- **columbia_apateu:** 4.2MB
- **default:** 2.6MB
- **nyu_apateu:** 2.2MB
- **sf_apateu:** 9.4MB
- **ucb_apateu:** 9.5MB
- **ucla_apateu:** 5.4MB
- **usc_apateu:** 6.7MB
- **uw_apateu:** 8.8MB
- **Total:** ~48MB

### Storage Reduction: **99.7%** (15GB → 48MB)

## What's Preserved
- Instagram session cookies (for staying logged in)
- Browser profile settings
- Account isolation

## What's Removed
- HTTP cache
- Code cache
- GPU shader cache
- Service workers
- IndexedDB data
- Local/session storage
- All non-essential browser data

## Future Maintenance
With the new browser flags in place, cache folders will no longer accumulate. Each account should stay under 10MB indefinitely. If you notice growth again, simply run:
```bash
npm run cache-cleanup
```
