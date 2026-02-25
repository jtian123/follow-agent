#!/usr/bin/env node

import fs from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ACCOUNTS_DIR = join(__dirname, '../data/accounts');

// Folders to delete from browser profiles (these rebuild automatically)
const CACHE_FOLDERS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'ShaderCache',
  'GrShaderCache',
  'Service Worker',
  'CertificateRevocation',
  'IndexedDB',
  'Local Storage',
  'Session Storage',
  'WebStorage',
  'GraphiteDawnCache',
  'component_crx_cache',
  'extensions_crx_cache'
];

function getDirectorySize(dirPath) {
  try {
    const result = execSync(`du -sh "${dirPath}" 2>/dev/null | cut -f1`).toString().trim();
    return result;
  } catch (err) {
    return 'N/A';
  }
}

function deleteCacheFolders(accountName, dryRun = false) {
  const browserProfileDir = join(ACCOUNTS_DIR, accountName, 'browser-profile');

  if (!fs.existsSync(browserProfileDir)) {
    return { deleted: 0, size: '0B' };
  }

  const sizeBefore = getDirectorySize(browserProfileDir);
  let deletedCount = 0;
  let totalSize = 0;

  // Delete cache folders in browser-profile root
  for (const folder of CACHE_FOLDERS) {
    const folderPath = join(browserProfileDir, folder);
    if (fs.existsSync(folderPath)) {
      const size = getDirectorySize(folderPath);
      if (!dryRun) {
        fs.rmSync(folderPath, { recursive: true, force: true });
      }
      console.log(`  ${dryRun ? '[DRY RUN]' : '✅'} Deleted: ${folder} (${size})`);
      deletedCount++;
    }
  }

  // Delete cache folders in Default profile
  const defaultProfileDir = join(browserProfileDir, 'Default');
  if (fs.existsSync(defaultProfileDir)) {
    for (const folder of CACHE_FOLDERS) {
      const folderPath = join(defaultProfileDir, folder);
      if (fs.existsSync(folderPath)) {
        const size = getDirectorySize(folderPath);
        if (!dryRun) {
          fs.rmSync(folderPath, { recursive: true, force: true });
        }
        console.log(`  ${dryRun ? '[DRY RUN]' : '✅'} Deleted: Default/${folder} (${size})`);
        deletedCount++;
      }
    }
  }

  const sizeAfter = dryRun ? sizeBefore : getDirectorySize(browserProfileDir);

  return {
    deleted: deletedCount,
    sizeBefore,
    sizeAfter
  };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const specificAccount = args.find(arg => !arg.startsWith('--'));

  console.log('\n' + '='.repeat(60));
  console.log('🧹 BROWSER CACHE CLEANUP TOOL');
  console.log('='.repeat(60) + '\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No files will be deleted\n');
  }

  if (!fs.existsSync(ACCOUNTS_DIR)) {
    console.log('❌ No accounts directory found');
    process.exit(1);
  }

  const accounts = specificAccount
    ? [specificAccount]
    : fs.readdirSync(ACCOUNTS_DIR).filter(name => {
        const stat = fs.statSync(join(ACCOUNTS_DIR, name));
        return stat.isDirectory();
      });

  if (accounts.length === 0) {
    console.log('❌ No accounts found');
    process.exit(1);
  }

  let totalDeletedCount = 0;

  for (const account of accounts) {
    console.log(`\n📱 Account: ${account}`);
    const result = deleteCacheFolders(account, dryRun);

    if (result.deleted === 0) {
      console.log('  ℹ️  No cache folders found');
    } else {
      console.log(`\n  📊 Size before: ${result.sizeBefore}`);
      if (!dryRun) {
        console.log(`  📊 Size after:  ${result.sizeAfter}`);
      }
      console.log(`  🗑️  Deleted ${result.deleted} cache folder(s)`);
      totalDeletedCount += result.deleted;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Cleanup complete! Total folders ${dryRun ? 'would be' : ''} deleted: ${totalDeletedCount}`);
  console.log('='.repeat(60) + '\n');

  if (dryRun) {
    console.log('💡 Run without --dry-run to actually delete the cache folders\n');
  } else {
    console.log('💡 Cache folders will no longer accumulate due to updated browser settings\n');
  }
}

main();
