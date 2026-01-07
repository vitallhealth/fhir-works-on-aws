import fs from 'fs';
import path from 'path';

interface Issue {
  severity: string;
  code: string;
  diagnostics: string;
  resourceIds: string[];
}

interface ResourceErrors {
  resourceType: string;
  issues: Issue[];
}

const downloadsDir = process.argv[2] || path.join(__dirname, '../downloads');
const outputFile = path.join(__dirname, 'resourceTypeErrors.jsonl');

function deduplicateByDiagnostics(issues: Issue[]): Issue[] {
  const map = new Map<string, Issue>();
  for (const issue of issues) {
    const key = issue.diagnostics;
    if (map.has(key)) {
      const existing = map.get(key)!;
      existing.resourceIds = Array.from(new Set([...existing.resourceIds, ...issue.resourceIds]));
    } else {
      map.set(key, { ...issue });
    }
  }
  return Array.from(map.values());
}

function extractIssuesFromObject(obj: any): { resourceType: string; issues: Issue[] } | null {
  if (!obj.resourceType || !obj.issues) return null;

  const issues: Issue[] = obj.issues
    .filter((i: any) => i.severity === 'error')
    .map((i: any) => ({
      severity: i.severity,
      code: i.code,
      diagnostics: i.diagnostics,
      resourceIds: i.resourceIds
    }));

  return { resourceType: obj.resourceType, issues };
}

function extractIssuesFromFile(filePath: string): ResourceErrors[] {
  const results: ResourceErrors[] = [];
  let content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return results;

  try {
    // Try to parse the whole file first
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      for (const obj of parsed) {
        const extracted = extractIssuesFromObject(obj);
        if (extracted) results.push(extracted);
      }
    } else {
      const extracted = extractIssuesFromObject(parsed);
      if (extracted) results.push(extracted);
    }
  } catch {
    // Not a single JSON object/array → treat as NDJSON
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsedLine = JSON.parse(line);
        const extracted = extractIssuesFromObject(parsedLine);
        if (extracted) results.push(extracted);
      } catch (err) {
        console.warn(`Failed to parse line in ${filePath}: ${err}`);
      }
    }
  }

  return results;
}

function walkDir(dir: string): ResourceErrors[] {
  const aggregated: ResourceErrors[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      aggregated.push(...walkDir(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ndjson')) {
      aggregated.push(...extractIssuesFromFile(fullPath));
    }
  }

  return aggregated;
}

function main() {
  const allErrors = walkDir(downloadsDir);

  // Group by resourceType
  const grouped = new Map<string, Issue[]>();
  for (const { resourceType, issues } of allErrors) {
    if (!grouped.has(resourceType)) grouped.set(resourceType, []);
    grouped.set(resourceType, grouped.get(resourceType)!.concat(issues));
  }

  const ws = fs.createWriteStream(outputFile, { flags: 'w' });

  for (const [resourceType, issues] of grouped.entries()) {
    ws.write(JSON.stringify({ resourceType, issues: deduplicateByDiagnostics(issues) }) + '\n');
  }

  ws.end();
  console.log(`Done! Output written to ${outputFile}`);
}

main();
