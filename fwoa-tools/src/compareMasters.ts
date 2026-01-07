import fs from 'fs';
import readline from 'readline';
import { create, DiffPatcher } from 'jsondiffpatch';

const jsonDiff: DiffPatcher = create({
  textDiff: false as any // disables text diffs, no TypeScript errors
});

async function diffNdjsonFiles(originalPath: string, processedPath: string) {
  const origLines = await readNdjsonLines(originalPath);
  const newLines = await readNdjsonLines(processedPath);

  const max = Math.max(origLines.length, newLines.length);

  for (let i = 0; i < max; i++) {
    const origRaw = origLines[i];
    const newRaw = newLines[i];

    if (!origRaw || !newRaw) {
      console.log(`Line ${i + 1}: one entry missing`);
      continue;
    }

    const origJson = JSON.parse(origRaw);
    const newJson = JSON.parse(newRaw);

    const delta = jsonDiff.diff(origJson, newJson);
    if (delta) {
      console.log(`\n======= DIFF ON RESOURCE #${i + 1} (${origJson.resourceType}/${origJson.id}) =======`);
      printDelta(delta);
    }
  }
}

function printDelta(delta: any) {
  for (const key in delta) {
    const val = delta[key];

    if (Array.isArray(val)) {
      if (val.length === 1) {
        console.log(`${key}: ADDED -> ${JSON.stringify(val[0])}`);
      } else if (val.length === 2) {
        console.log(`${key}: CHANGED -> from ${JSON.stringify(val[0])} to ${JSON.stringify(val[1])}`);
      } else if (val.length === 3 && val[1] === 0 && val[2] === 0) {
        console.log(`${key}: REMOVED -> ${JSON.stringify(val[0])}`);
      }
    } else if (typeof val === 'object') {
      printDelta(val); // recurse for nested objects
    }
  }
}

async function readNdjsonLines(filePath: string): Promise<string[]> {
  const lines: string[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) lines.push(line.trim());
  }

  return lines;
}

// Run the diff
diffNdjsonFiles('./master.ndjson', './fixedExport3.ndjson').catch(console.error);
