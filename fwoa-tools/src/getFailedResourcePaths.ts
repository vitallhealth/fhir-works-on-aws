import { S3 } from 'aws-sdk';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Usage: ts-node findFailedResources.ts job-ids.txt
// The TXT file should contain one job ID per line.
// Outputs list of failed resource file paths for each job.

dotenv.config({ path: '.env' });

const { IMPORT_OUTPUT_S3_BUCKET_NAME, PREFIX_BASE } = process.env;

async function listFailedFiles(jobId: string) {
  const s3 = new S3();

  const prefix = `${PREFIX_BASE}/1e89513ddc3b6d70e28a363d2e04dad0-FHIR_IMPORT-${jobId}/FAILURE/`;
  const all: string[] = [];
  let ContinuationToken: string | undefined;

  if (IMPORT_OUTPUT_S3_BUCKET_NAME) {
    do {
      const res = await s3
        .listObjectsV2({
          Bucket: IMPORT_OUTPUT_S3_BUCKET_NAME,
          Prefix: prefix,
          ContinuationToken
        })
        .promise();

      for (const obj of res.Contents ?? []) {
        const key = obj.Key ?? '';
        if (!key.endsWith('.json') && !key.endsWith('.ndjson')) continue;
        const relative = key.replace(prefix, '');
        all.push(relative);
      }

      ContinuationToken = res.NextContinuationToken;
    } while (ContinuationToken);
  }

  return all;
}

(async () => {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: ts-node findFailedResources.ts <job-ids-file.txt>');
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const jobIds = fileContent
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (jobIds.length === 0) {
    console.error('Job ID file contains no valid IDs.');
    process.exit(1);
  }

  for (const jobId of jobIds) {
    console.log(`
=== Job ${jobId} ===`);
    const files = await listFailedFiles(jobId);
    for (const f of files) {
      const s3 = new S3();
      const key = `${PREFIX_BASE}/1e89513ddc3b6d70e28a363d2e04dad0-FHIR_IMPORT-${jobId}/FAILURE/${f}`;
      const outDir = `downloads/${jobId}`;
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const outPath = `${outDir}/${f.replace(/\//g, '_')}`;
      if (IMPORT_OUTPUT_S3_BUCKET_NAME) {
        const obj = await s3.getObject({ Bucket: IMPORT_OUTPUT_S3_BUCKET_NAME, Key: key }).promise();
        fs.writeFileSync(outPath, obj.Body as Buffer);
        console.log(`Downloaded ${outPath}`);
      }
    }
  }
})();
