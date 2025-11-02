import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOGS_DIR = join(__dirname, '../../logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Get current date for log filename
function getLogFileName() {
  const date = new Date().toISOString().split('T')[0];
  return join(LOGS_DIR, `follow-agent-${date}.log`);
}

// Log to file
export function logToFile(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;

  fs.appendFileSync(getLogFileName(), logMessage);
}

// Log error
export function logError(error, context = '') {
  const message = context ? `${context}: ${error.message}` : error.message;
  logToFile(message, 'ERROR');
  logToFile(error.stack, 'ERROR');
}

// Log follow action
export function logFollow(username, success, poolSource) {
  const status = success ? 'SUCCESS' : 'FAILED';
  const message = `Follow ${status} - @${username} from ${poolSource}`;
  logToFile(message, 'ACTION');
}

// Log session summary
export function logSessionSummary(summary) {
  const message = `Session Summary - Followed: ${summary.followed}, Errors: ${summary.errors}, Skipped: ${summary.skipped}`;
  logToFile(message, 'SUMMARY');
}

// Log pool extraction
export function logPoolExtraction(poolUrl, poolType, userCount) {
  const message = `Pool Extraction - URL: ${poolUrl}, Type: ${poolType}, Users: ${userCount}`;
  logToFile(message, 'POOL');
}

export default {
  logToFile,
  logError,
  logFollow,
  logSessionSummary,
  logPoolExtraction
};
