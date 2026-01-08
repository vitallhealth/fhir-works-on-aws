import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { Attachment } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/attachment';
import { Extension } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/extension';
import { DocumentReference } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/documentReference';
import { v4 as uuidv4 } from 'uuid';

// --- CONFIG ---
const ROOT_DIR = path.join('downloaded-bucket', '8d451292-beea-456f-887c-c36c0cc3a62f');

const OUTPUT_FILE = path.join('created_document_references.ndjson');

// Create write stream once (append mode)
const outputStream = fs.createWriteStream(OUTPUT_FILE, { flags: 'a' });

// Process a single NDJSON file line by line
async function processNdjsonFile(filePath: string) {
  const fileStream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    // Parse resource
    let resource: any;
    try {
      resource = JSON.parse(line);
    } catch (err) {
      console.warn(`⚠️ Invalid JSON skipped: ${filePath}`);
      continue;
    }

    if (resource.extension) {
      let docRef: DocumentReference;
      let extensions = resource.extension;
      for (const extension of extensions) {
        if (extension.url && extension.url == 'https://vitall.com/documentation/extensions/attachments') {
          // if docRef is not empty:
          //    append to content field
          // otherwise, create new docRef
          docRef = {
            resourceType: 'DocumentReference',
            id: uuidv4(),
            context: {
              related: resource
            },
            status: 'current',
            content: [
              {
                attachment: extension.valueAttachment
              }
            ]
          };
        }
      }
      console.log(docRef);
    }
  }
}

// Walk all v-* folders and process NDJSON files
async function main() {
  console.log(`Scanning ${ROOT_DIR}`);

  const versionDirs = fs
    .readdirSync(ROOT_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name.startsWith('v'))
    .map((dirent) => path.join(ROOT_DIR, dirent.name));

  for (const versionDir of versionDirs) {
    console.log(`Processing folder: ${versionDir}`);

    const files = fs
      .readdirSync(versionDir)
      .filter((f) => f.endsWith('.ndjson'))
      .map((f) => path.join(versionDir, f));

    for (const file of files) {
      console.log(`  Processing file: ${file}`);
      await processNdjsonFile(file);
    }
  }

  outputStream.end();
  console.log(`\n✅ Done. Output written to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error('Error:', err);
  outputStream.end();
  process.exit(1);
});
