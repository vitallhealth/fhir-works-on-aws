import fs from 'fs';
import path from 'path';

const IMPORT_DIR = 'failed-resources-import';
const OUTPUT_FILE = 'unique-error-issues-with-resources-and-types.json';

// Recursively gather all JSON lines from import directory
function gatherImportFiles(dir: string): string[] {
  let files: string[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const itemPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files = files.concat(gatherImportFiles(itemPath));
    } else if (item.isFile()) {
      files.push(itemPath);
    }
  }
  return files;
}

// Map diagnostics -> issue metadata
interface IssueRecord {
  severity: string;
  code: string;
  diagnostics: string;
  resources: Set<string>;
  resourceTypes: Set<string>;
}

const allErrorIssues = new Map<string, IssueRecord>();

const importFiles = gatherImportFiles(IMPORT_DIR);

for (const filePath of importFiles) {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const resourceId = obj.resourceId;
      const resourceType = obj.resourceType;
      const issues = obj.UpdateResourceResponse?.jsonBlob?.issue || [];

      for (const issue of issues) {
        if (issue.severity === 'error') {
          const { location, ...cleanIssue } = issue;

          const diagnostics = cleanIssue.diagnostics;

          if (!allErrorIssues.has(diagnostics)) {
            // Create new record
            allErrorIssues.set(diagnostics, {
              severity: cleanIssue.severity,
              code: cleanIssue.code,
              diagnostics,
              resources: new Set([resourceId]),
              resourceTypes: new Set([resourceType])
            });
          } else {
            // Add to existing record
            const rec = allErrorIssues.get(diagnostics)!;
            rec.resources.add(resourceId);
            rec.resourceTypes.add(resourceType);
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to parse line in ${filePath}: ${err}`);
    }
  }
}

// Convert Sets to arrays for output
const outputArray = Array.from(allErrorIssues.values()).map((issue) => ({
  ...issue,
  resources: Array.from(issue.resources),
  resourceTypes: Array.from(issue.resourceTypes)
}));

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputArray, null, 2), 'utf-8');

console.log(`Wrote ${outputArray.length} unique error issues (with resource IDs & types) to ${OUTPUT_FILE}`);
