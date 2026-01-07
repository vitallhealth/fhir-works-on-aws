import * as fs from 'fs';

// Usage: ts-node extractJobIds.ts logs.txt > job-ids.txt

// Regex that captures the job id after "JobId - "
const JOB_ID_REGEX = /JobId\s*-\s*([a-fA-F0-9]+)/;

function extractJobIds(logContent: string): string[] {
  const lines = logContent.split(/\r?\n/);
  const jobIds: string[] = [];

  for (const line of lines) {
    const match = line.match(JOB_ID_REGEX);
    if (match) {
      jobIds.push(match[1]);
    }
  }

  return jobIds;
}

(function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: ts-node extractJobIds.ts <log-file-path>');
    process.exit(1);
  }

  const logContent = fs.readFileSync(filePath, 'utf8');
  const jobIds = extractJobIds(logContent);

  if (jobIds.length === 0) {
    console.error('No job IDs found in the log file.');
    process.exit(1);
  }

  // Output one job ID per line (ideal for piping into your other script)
  for (const id of jobIds) {
    console.log(id);
  }
})();
