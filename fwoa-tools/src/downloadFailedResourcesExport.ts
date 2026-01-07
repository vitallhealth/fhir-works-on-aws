import AWS from 'aws-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// --- CONFIG ---
const PREFIX = 'failed-resources-export/'; // The folder to download
const OUTPUT_DIR = './failed-resources-export'; // Local destination

const { EXPORT_BUCKET_NAME } = process.env;
dotenv.config({ path: '.env' });

AWS.config.update({ region: 'ca-central-1' });
const s3 = new AWS.S3();

// Ensure local base folder exists
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function listAllObjects(
  bucket: string | undefined,
  prefix: string | undefined
): Promise<AWS.S3.ObjectList> {
  const results: AWS.S3.ObjectList = [];
  let token: string | undefined = undefined;
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

async function downloadObject(key: string, localFilePath: string) {
  ensureDir(path.dirname(localFilePath));
  if (EXPORT_BUCKET_NAME) {
    const data = await s3
      .getObject({
        Bucket: EXPORT_BUCKET_NAME,
        Key: key
      })
      .promise();

    fs.writeFileSync(localFilePath, data.Body as Buffer);
    console.log(`Downloaded: ${localFilePath}`);
  }
}

async function main() {
  console.log(`Listing objects in s3://${EXPORT_BUCKET_NAME}/${PREFIX} ...`);
  const objects = await listAllObjects(EXPORT_BUCKET_NAME, PREFIX);

  if (objects.length === 0) {
    console.log('No objects found.');
    return;
  }

  console.log(`Found ${objects.length} objects. Starting download...`);

  for (const obj of objects) {
    if (!obj.Key) continue;
    if (obj.Key.endsWith('/')) continue; // skip folder placeholders

    const relativePath = obj.Key.replace(PREFIX, '');
    const localPath = path.join(OUTPUT_DIR, relativePath);

    await downloadObject(obj.Key, localPath);
  }

  console.log('Download complete!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
