import AWS from 'aws-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// -------- CONFIG ----------

dotenv.config({ path: '.env' });

const JOB_ID_FILE = './job-ids.txt';
const OUTPUT_DIR = './failed-resources-import';
const { IMPORT_OUTPUT_S3_BUCKET_NAME } = process.env;

AWS.config.update({ region: 'ca-central-1' });
const s3 = new AWS.S3();

// ---------------- HELPERS ----------------
function readJobIds(filePath: string): string[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
        .listObjectsV2({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
        .promise();

      if (resp.Contents) results.push(...resp.Contents);
      token = resp.NextContinuationToken;
    } while (token);
  }

  return results;
}

async function downloadObject(key: string, localFilePath: string) {
  ensureDir(path.dirname(localFilePath));
  if (IMPORT_OUTPUT_S3_BUCKET_NAME) {
    const data = await s3.getObject({ Bucket: IMPORT_OUTPUT_S3_BUCKET_NAME, Key: key }).promise();
    fs.writeFileSync(localFilePath, data.Body as Buffer);
    console.log(`Downloaded: ${localFilePath}`);
  }
}

// ---------------- MAIN ----------------
async function main() {
  const jobIds = readJobIds(JOB_ID_FILE);
  console.log(`Loaded ${jobIds.length} job IDs.`);

  for (const jobId of jobIds) {
    const prefix = `staging/migrationoutput/1e89513ddc3b6d70e28a363d2e04dad0-FHIR_IMPORT-${jobId}/FAILURE/`;
    console.log(`Scanning job ${jobId} at prefix: ${prefix}`);

    const objects = await listAllObjects(IMPORT_OUTPUT_S3_BUCKET_NAME, prefix);

    const ndjsonFiles = objects.filter((obj) => obj.Key && obj.Key.endsWith('.ndjson'));

    console.log(`Found ${ndjsonFiles.length} NDJSON files for job ${jobId}.`);

    for (const obj of ndjsonFiles) {
      const key = obj.Key!;
      // Extract the v-folder and file name: .../FAILURE/v1-0/Patient.ndjson
      const parts = key.split('/');
      const vFolderIndex = parts.indexOf('FAILURE') + 1;
      const vFolder = parts[vFolderIndex];
      const fileName = parts[parts.length - 1];

      const localPath = path.join(OUTPUT_DIR, vFolder, fileName);
      await downloadObject(key, localPath);
    }
  }

  console.log('✔ Finished downloading all failed resources.');
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
