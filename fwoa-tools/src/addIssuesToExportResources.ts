import fs from 'fs';
import path from 'path';

const FILTERED_DIR = 'filtered-failed-resources';
const IMPORT_DIR = 'failed-resources-import';

// Helper to recursively ensure directory exists
function ensureDirSync(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Append issues to one file
function appendIssues(filteredFilePath: string, importFilePath: string) {
  if (!fs.existsSync(importFilePath)) {
    console.warn(`No import file for ${filteredFilePath}, skipping.`);
    return;
  }

  // Build a map from resourceId -> error issues
  const importLines = fs.readFileSync(importFilePath, 'utf-8').split('\n').filter(Boolean);
  const issueMap = new Map<string, any[]>();

  for (const line of importLines) {
    try {
      const obj = JSON.parse(line);
      const issues =
        obj.UpdateResourceResponse?.jsonBlob?.issue?.filter((i: any) => i.severity === 'error') || [];
      if (issues.length > 0) {
        issueMap.set(obj.resourceId, issues);
      }
    } catch (err) {
      console.warn(`Failed to parse import line: ${err}`);
    }
  }

  // Read filtered file
  const filteredLines = fs.readFileSync(filteredFilePath, 'utf-8').split('\n').filter(Boolean);

  const updatedLines = filteredLines.map((line) => {
    try {
      const resource = JSON.parse(line);
      if (issueMap.has(resource.id)) {
        resource.issues = issueMap.get(resource.id);
      }
      return JSON.stringify(resource);
    } catch {
      return line; // keep line as-is if parse fails
    }
  });

  fs.writeFileSync(filteredFilePath, updatedLines.join('\n') + '\n', 'utf-8');
  console.log(`Appended issues to ${filteredFilePath}`);
}

// Recursively process directory
function processDir(filteredDir: string, importDir: string) {
  const items = fs.readdirSync(filteredDir, { withFileTypes: true });

  for (const item of items) {
    const filteredPath = path.join(filteredDir, item.name);
    const importPath = path.join(importDir, item.name);

    if (item.isDirectory()) {
      processDir(filteredPath, importPath);
    } else if (item.isFile()) {
      appendIssues(filteredPath, importPath);
    }
  }
}

processDir(FILTERED_DIR, IMPORT_DIR);
