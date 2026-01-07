import * as fs from 'fs';
import * as path from 'path';
import AWS from 'aws-sdk';
import * as dotenv from 'dotenv';

// ---------- CONFIG ----------
const { IMPORT_OUTPUT_S3_BUCKET_NAME, EXPORT_BUCKET_NAME, BULKEXPORT_ROOT_PREFIX } = process.env;

const OUTPUT_PREFIX = 'failed-resources-export';

const JOB_ID_FILE = './job-ids.txt';

dotenv.config({ path: '.env' });

AWS.config.update({ region: 'ca-central-1' });

const s3 = new AWS.S3();

// -------------- HELPERS -------------------

function readJobIds(filePath: string): string[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function listAllObjects(
  bucket: string | undefined,
  prefix: string | undefined
): Promise<AWS.S3.ObjectList> {
  let token: string | undefined = undefined;
  const results: AWS.S3.ObjectList = [];
  if (bucket && prefix) {
    do {
      const resp: AWS.S3.ListObjectsV2Output = await s3
        .listObjectsV2({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token
        })
        .promise();

      if (resp.Contents) {
        results.push(...resp.Contents);
      }

      token = resp.NextContinuationToken;
    } while (token);
  }

  return results;
}

function getFileName(key: string): string {
  return key.substring(key.lastIndexOf('/') + 1);
}

// -------------- MAIN LOGIC -------------------

async function main() {
  // Load job IDs
  const jobIds = readJobIds(JOB_ID_FILE);
  console.log(`Loaded ${jobIds.length} job IDs`);

  const failedFiles: { v: string; file: string }[] = [];

  console.log('Scanning HealthLake failure files...');

  // 1) Collect failed files from HealthLake
  for (const jobId of jobIds) {
    const prefix = `staging/migrationoutput/1e89513ddc3b6d70e28a363d2e04dad0-FHIR_IMPORT-${jobId}/`;

    const objects = await listAllObjects(IMPORT_OUTPUT_S3_BUCKET_NAME, prefix);

    const failureObjects = objects.filter(
      (obj) => obj.Key?.includes('/FAILURE/') && obj.Key.endsWith('.ndjson')
    );

    for (const obj of failureObjects) {
      const key = obj.Key!;
      const parts = key.split('/');
      const failureIndex = parts.indexOf('FAILURE');
      const vFolder = parts[failureIndex + 1]; // ex: "v12"
      failedFiles.push({ v: vFolder, file: getFileName(key) });
    }
  }

  console.log(`Found ${failedFiles.length} failed NDJSON resources.`);

  // 2) Build index of bulk export files, grouped by v-folder
  const uniqueV = [...new Set(failedFiles.map((x) => x.v))];
  const bulkExportIndex: Record<string, string[]> = {};

  console.log('Indexing bulk export bucket...');

  for (const vFolder of uniqueV) {
    const prefix = `${BULKEXPORT_ROOT_PREFIX}/${vFolder}/`;
    const objects = await listAllObjects(EXPORT_BUCKET_NAME, prefix);
    bulkExportIndex[vFolder] = objects.map((o) => o.Key!);
    console.log(`Indexed ${bulkExportIndex[vFolder].length} files under ${prefix}`);
  }

  // 3) Copy originals into /failed-resources-export/ maintaining v-folder
  console.log('Copying matching original files...');

  for (const { v, file } of failedFiles) {
    const candidates = bulkExportIndex[v] || [];
    const originalKey = candidates.find((k) => k.endsWith(`/${file}`));

    if (!originalKey) {
      console.warn(`⚠️ Original not found for: ${v}/${file}`);
      continue;
    }

    const destinationKey = `${OUTPUT_PREFIX}/${v}/${file}`;
    console.log(`Copying ${originalKey} → ${destinationKey}`);
    if (EXPORT_BUCKET_NAME) {
      await s3
        .copyObject({
          Bucket: EXPORT_BUCKET_NAME,
          CopySource: `/${EXPORT_BUCKET_NAME}/${originalKey}`,
          Key: destinationKey
        })
        .promise();
    }
  }

  console.log('✔ Done copying failed resources.');
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
