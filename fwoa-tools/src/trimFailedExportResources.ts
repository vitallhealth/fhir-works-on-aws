import fs from 'fs';
import path from 'path';

// Directories
const EXPORT_DIR = 'failed-resources-export';
const IMPORT_DIR = 'failed-resources-import';
const OUTPUT_DIR = 'filtered-failed-resources';

// Helper to recursively ensure directory exists
function ensureDirSync(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Process one file
function processFile(exportFilePath: string, importFilePath: string, outputFilePath: string) {
  // Read import file and collect all resource IDs
  const importLines = fs.readFileSync(importFilePath, 'utf-8').split('\n').filter(Boolean);
  const resourceIds = new Set(importLines.map((line) => JSON.parse(line).resourceId));

  // Read export file line by line and filter by resource IDs
  const exportLines = fs.readFileSync(exportFilePath, 'utf-8').split('\n').filter(Boolean);
  const filteredLines = exportLines.filter((line) => {
    try {
      const obj = JSON.parse(line);
      return resourceIds.has(obj.id);
    } catch {
      return false;
    }
  });

  // Write to output file
  if (filteredLines.length > 0) {
    ensureDirSync(path.dirname(outputFilePath));
    fs.writeFileSync(outputFilePath, filteredLines.join('\n') + '\n', 'utf-8');
    console.log(`Written ${filteredLines.length} lines to ${outputFilePath}`);
  } else {
    console.log(`No matching resources for ${exportFilePath}, skipping output.`);
  }
}

// Recursively process all files
function processDir(exportDir: string, importDir: string, outputDir: string) {
  const items = fs.readdirSync(exportDir, { withFileTypes: true });
  for (const item of items) {
    const exportPath = path.join(exportDir, item.name);
    const importPath = path.join(importDir, item.name);
    const outputPath = path.join(outputDir, item.name);

    if (item.isDirectory()) {
      processDir(exportPath, importPath, outputPath);
    } else if (item.isFile()) {
      if (fs.existsSync(importPath)) {
        processFile(exportPath, importPath, outputPath);
      } else {
        console.warn(`No corresponding import file for ${exportPath}, skipping.`);
      }
    }
  }
}

// Run
processDir(EXPORT_DIR, IMPORT_DIR, OUTPUT_DIR);
