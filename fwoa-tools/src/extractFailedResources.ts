import * as fs from 'fs';
import * as path from 'path';

// Usage:
// ts-node extractResourceIds.ts downloads/<jobId>
// or to scan all jobs:
// ts-node extractResourceIds.ts downloads

interface FailedLine {
  resourceId?: string;
  resourceType?: string;
}

function extractFromFile(filePath: string): string[] {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const parsed: FailedLine = JSON.parse(line);

      if (parsed.resourceId && parsed.resourceType) {
        out.push(`${parsed.resourceType}/${parsed.resourceId}`);
      }
    } catch (err) {
      console.error(`Failed to parse line in ${filePath}:`, err);
    }
  }

  return out;
}

(function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: ts-node extractResourceIds.ts <directory>');
    process.exit(1);
  }

  const root = path.resolve(dir);
  const results: string[] = [];

  function walkDir(current: string) {
    for (const entry of fs.readdirSync(current)) {
      const full = path.join(current, entry);
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        walkDir(full);
      } else if (entry.endsWith('.json') || entry.endsWith('.ndjson')) {
        const extracted = extractFromFile(full);
        results.push(...extracted);
      }
    }
  }

  walkDir(root);

  // Write results
  const outPath = 'extracted-resources.txt';
  fs.writeFileSync(outPath, results.join('\n') + '\n', 'utf8');

  console.log(`Extracted ${results.length} resource IDs.`);
  console.log(`Saved to ${outPath}`);
})();
