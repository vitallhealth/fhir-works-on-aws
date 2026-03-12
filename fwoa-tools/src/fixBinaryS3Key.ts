import { S3 } from 'aws-sdk';
import * as dotenv from 'dotenv';

const s3 = new S3();

dotenv.config({ path: '.env' });
const ORIGINAL_EXPORT_BUCKET = process.env.BINARY_BUCKET_NAME!;
const DRY_RUN = (process.env.DRY_RUN ?? 'true') === 'true';

// UUID pattern (8-4-4-4-12 hex)
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

// Matches: some/path/{uuid}_1.ext
const UUID_1_REGEX = new RegExp(`^(.*\\/)?(${UUID})_1(\\.[^\\/]+)$`);

async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3
      .headObject({
        Bucket: bucket,
        Key: key
      })
      .promise();
    return true;
  } catch (err: any) {
    if (err.code === 'NotFound' || err.statusCode === 404) {
      return false;
    }
    throw err;
  }
}

function getTargetKey(sourceKey: string): string | null {
  const match = sourceKey.match(UUID_1_REGEX);
  if (!match) return null;

  const prefix = match[1] ?? '';
  const uuid = match[2];
  const ext = match[3];

  return `${prefix}${uuid}${ext}`;
}

async function copyObject(bucket: string, sourceKey: string, targetKey: string) {
  await s3
    .copyObject({
      Bucket: bucket,
      Key: targetKey,
      CopySource: `${bucket}/${encodeURIComponent(sourceKey)}`,
      MetadataDirective: 'COPY'
    })
    .promise();
}

async function processBucket() {
  let ContinuationToken: string | undefined;
  let scanned = 0;
  let candidates = 0;
  let copied = 0;
  let alreadyExists = 0;

  do {
    const res = await s3
      .listObjectsV2({
        Bucket: ORIGINAL_EXPORT_BUCKET,
        ContinuationToken,
        MaxKeys: 1000
      })
      .promise();

    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      scanned++;

      const targetKey = getTargetKey(obj.Key);
      if (!targetKey) continue;

      candidates++;

      const exists = await objectExists(ORIGINAL_EXPORT_BUCKET, targetKey);
      if (exists) {
        alreadyExists++;
        continue;
      }

      if (DRY_RUN) {
        console.log(
          `[DRY RUN] would copy s3://${ORIGINAL_EXPORT_BUCKET}/${obj.Key} -> s3://${ORIGINAL_EXPORT_BUCKET}/${targetKey}`
        );
        continue;
      }

      console.log(
        `copying s3://${ORIGINAL_EXPORT_BUCKET}/${obj.Key} -> s3://${ORIGINAL_EXPORT_BUCKET}/${targetKey}`
      );

      await copyObject(ORIGINAL_EXPORT_BUCKET, obj.Key, targetKey);
      copied++;
    }

    ContinuationToken = res.NextContinuationToken;
  } while (ContinuationToken);

  console.log({
    scanned,
    candidates,
    alreadyExists,
    copied: DRY_RUN ? 0 : copied,
    dryRun: DRY_RUN
  });
}

processBucket().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
