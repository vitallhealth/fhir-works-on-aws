import fs from 'fs';
import path from 'path';
import readline from 'readline';

const ROOT_DIR = path.resolve('failed-resources-to-fix');
const OUTPUT_FILE = path.resolve('master.ndjson');

async function findNdjsonFiles(dir: string, fileList: string[] = []) {
  const files = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      await findNdjsonFiles(fullPath, fileList);
    } else if (file.isFile() && file.name.endsWith('.ndjson')) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

async function combineNdjsonFiles() {
  console.log(`Searching for .ndjson files in: ${ROOT_DIR}`);

  const ndjsonFiles = await findNdjsonFiles(ROOT_DIR);

  if (ndjsonFiles.length === 0) {
    console.log('No .ndjson files found.');
    return;
  }

  console.log(`Found ${ndjsonFiles.length} NDJSON files.`);
  console.log(`Writing combined output to: ${OUTPUT_FILE}`);

  const writeStream = fs.createWriteStream(OUTPUT_FILE);

  for (const file of ndjsonFiles) {
    console.log(`Processing ${file}`);

    const readStream = fs.createReadStream(file);
    const rl = readline.createInterface({ input: readStream });

    for await (const line of rl) {
      if (line.trim()) {
        writeStream.write(line + '\n');
      }
    }
  }

  writeStream.end();
  console.log('Done. Combined NDJSON created!');
}

combineNdjsonFiles().catch((err) => console.error(err));
