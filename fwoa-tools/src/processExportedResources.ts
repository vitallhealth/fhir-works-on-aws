import readline from 'readline';

import { S3 } from 'aws-sdk';

import { DocumentReference } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/documentReference';

import { DiagnosticReport } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/diagnosticReport';
import { Observation } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/observation';
import { Condition } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/condition';
import { Procedure } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/procedure';
import { Encounter } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/encounter';
import { Appointment } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/appointment';
import { FamilyMemberHistory } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/familyMemberHistory';
import { Coverage } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/coverage';
import { Consent } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/consent';
import { MedicationStatement } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/medicationStatement';
import { RiskAssessment } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/riskAssessment';
import { Immunization } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/immunization';
import { Task } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/task';
import { QuestionnaireResponse } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/questionnaireResponse';
import { Reference } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/reference';
import { Binary } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/binary';

// import {
//   fixApp3,
//   fixApp2,
//   fixExt1,
//   fixPpc1,
//   fixPer1,
//   fixImmOcc,
//   fixMedSta,
//   fixQty3,
//   fixRiskAssessment3,
//   fixTim1,
//   fixQuestionnairePropIdentifier,
//   fixUnrecognizedProperty
// } from './fixFailedResources';

import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { PassThrough } from 'stream';

type FhirResource =
  | DiagnosticReport
  | Observation
  | Condition
  | Procedure
  | Encounter
  | Appointment
  | FamilyMemberHistory
  | Coverage
  | Consent
  | MedicationStatement
  | RiskAssessment
  | Immunization
  | Task
  | QuestionnaireResponse
  | Binary;

const RESOURCE_CLASS_MAP: Record<string, new () => FhirResource> = {
  DiagnosticReport,
  Observation,
  Condition,
  Procedure,
  Encounter,
  Appointment,
  FamilyMemberHistory,
  Coverage,
  Consent,
  MedicationStatement,
  RiskAssessment,
  Immunization,
  Task,
  QuestionnaireResponse,
  Binary
};

dotenv.config({ path: '.env' });

// --- CONFIG ---
const DOCREF_FOLDER = 'DocumentReferences-v1';
const ATTACHMENTS_EXT_URL = 'https://vitall.com/documentation/extensions/attachments';

const ORIGINAL_EXPORT_BUCKET = requireEnv('EXPORT_BUCKET_NAME', process.env.EXPORT_BUCKET_NAME);

const ORIGINAL_EXPORT_PREFIX = requireEnv('BULKEXPORT_ROOT_PREFIX', process.env.BULKEXPORT_ROOT_PREFIX);

const BINARY_BUCKET_NAME = requireEnv('BINARY_BUCKET_NAME', process.env.BINARY_BUCKET_NAME);

const PROCESSED_EXPORT_PREFIX = requireEnv(
  'PROCESSED_BULKEXPORT_ROOT_PREFIX',
  process.env.PROCESSED_BULKEXPORT_ROOT_PREFIX
);

const s3 = new S3();

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing env variable: ${name}`);
  }
  return value;
}

function normalizePrefix(p: string) {
  return p.endsWith('/') ? p : `${p}/`;
}

function hydrateResource(raw: any): FhirResource | undefined {
  const ResourceClass = RESOURCE_CLASS_MAP[raw.resourceType];
  if (!ResourceClass) return undefined;

  return Object.assign(new ResourceClass(), raw);
}

function extractPatientReference(resource: FhirResource): Reference | undefined {
  if ('subject' in resource && resource.subject?.reference?.startsWith('Patient/')) {
    return resource.subject;
  } else if ('patient' in resource && resource.patient?.reference?.startsWith('Patient/')) {
    return resource.patient;
  } else if (resource.resourceType == 'Appointment') {
    if ('participant' in resource) {
      for (const part of resource.participant) {
        if (part.type) {
          for (const t of part.type) {
            if (t.text == 'Patient') {
              return part.actor;
            }
          }
        }
      }
    }
  } else if (resource.resourceType == 'Coverage') {
    if ('beneficiary' in resource && resource.beneficiary?.reference?.startsWith('Patient/')) {
      return resource.beneficiary;
    }
  }
  console.log('Failed to find related patient');
  return undefined;
}

function outKeyForInputKey(inputKey: string) {
  if (ORIGINAL_EXPORT_PREFIX) {
    const rel = inputKey.slice(normalizePrefix(ORIGINAL_EXPORT_PREFIX).length);
    return `${normalizePrefix(PROCESSED_EXPORT_PREFIX)}${rel}`;
  } else {
    throw new Error('outKeyForInputKey failed');
  }
}

function docRefKeyForRun() {
  const processed = normalizePrefix(PROCESSED_EXPORT_PREFIX);
  return `${processed}${DOCREF_FOLDER}/${DOCREF_FOLDER}.ndjson`;
}

function skipObservations(resource: any) {
  if (resource.code.coding) {
    for (const coding of resource.code.coding) {
      if (coding.code == 'skin-lesion' || coding.code == 'cough-audio') {
        console.log(`Skip observation ${resource.id}`);
        return true;
      }
    }
    return false;
  }
}

// Process a single NDJSON file line by line
async function processNdjsonFile(inputKey: string, docRefStream: PassThrough) {
  if (!ORIGINAL_EXPORT_BUCKET || !ORIGINAL_EXPORT_PREFIX || !PROCESSED_EXPORT_PREFIX) {
    console.log(ORIGINAL_EXPORT_BUCKET);
    console.log(ORIGINAL_EXPORT_PREFIX);
    console.log(PROCESSED_EXPORT_PREFIX);
    throw new Error('Missing env variables');
  }

  const readStream = s3.getObject({ Bucket: ORIGINAL_EXPORT_BUCKET, Key: inputKey }).createReadStream();

  const outKey = outKeyForInputKey(inputKey);
  const outStream = new PassThrough();

  const outUpload = s3.upload({
    Bucket: ORIGINAL_EXPORT_BUCKET,
    Key: outKey,
    Body: outStream,
    ContentType: 'application/x-ndjson'
  });

  const rl = readline.createInterface({ input: readStream });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let resource: FhirResource;
    try {
      resource = JSON.parse(line);
    } catch {
      console.warn(`⚠️ Invalid JSON skipped: ${inputKey}`);
      continue;
    }

    if (resource.resourceType == 'Binary') {
      continue;
    }

    const resourceCopy = { ...resource };
    let docRef: DocumentReference | undefined;

    if (resource.resourceType == 'Observation' && skipObservations(resource)) {
      for (const extension of (resourceCopy as any).extension) {
        if (extension.url === ATTACHMENTS_EXT_URL) {
          if (extension.valueAttachment) {
            const res = await s3
              .listObjectsV2({
                Bucket: BINARY_BUCKET_NAME,
                Prefix: `${extension.valueAttachment.id}.`,
                MaxKeys: 50
              })
              .promise();
            const keys = (res.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
            if (keys.length === 1) {
              console.log(`Replacing id ${extension.valueAttachment.id} with ${keys[0]}`);
              extension.valueAttachment.id = keys[0];
            }
            // const suffix = mime.getExtension(extension.valueAttachment.contentType);
            // const new_id = `${extension.valueAttachment.id}.${suffix}`;
            // extension.valueAttachment.id = new_id;
          }
        }
      }
    } else {
      // Attachment removal and DocumentReference creation
      if (resource.extension && Array.isArray((resource as any).extension)) {
        resourceCopy.extension = [];
        for (const extension of (resource as any).extension) {
          if (extension.url === ATTACHMENTS_EXT_URL) {
            if (!docRef) {
              docRef = new DocumentReference();
              docRef.resourceType = 'DocumentReference';
              docRef.id = uuidv4();
              docRef.status = 'current';
              docRef.content = [];
              docRef.category = [
                {
                  coding: [
                    {
                      system: 'http://loinc.org',
                      code: '34133-9',
                      display: 'Summarization of episode note'
                    }
                  ],
                  text: 'Summarization of episode note'
                }
              ];
              docRef.type = {
                coding: [
                  {
                    system: 'http://loinc.org',
                    code: '55108-5',
                    display: 'Clinical presentation Document'
                  }
                ],
                text: 'Clinical presentation Document'
              };
              docRef.context = {
                related: [
                  {
                    reference: `${(resource as any).resourceType}/${(resource as any).id}`
                  }
                ]
              };
            }

            if (extension.valueAttachment) {
              const res = await s3
                .listObjectsV2({
                  Bucket: BINARY_BUCKET_NAME,
                  Prefix: `${extension.valueAttachment.id}.`,
                  MaxKeys: 50
                })
                .promise();
              const keys = (res.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
              if (keys.length === 1) {
                console.log(`Replacing id ${extension.valueAttachment.id} with ${keys[0]}`);
                extension.valueAttachment.id = keys[0];
              }
              docRef.content.push({ attachment: extension.valueAttachment });
            }

            const typedResource = hydrateResource(resource);
            if (typedResource) {
              const patientRef = extractPatientReference(typedResource);
              if (patientRef && docRef) {
                docRef.subject = patientRef;
              }
            }
          } else {
            resourceCopy.extension.push(extension);
          }
        }
        if (resourceCopy.extension.length == 0) {
          delete resourceCopy.extension;
        }
      }
    }

    // Fixes for malformed resources (staging)
    // switch (resourceCopy.resourceType) {
    //   case 'Appointment':
    //     fixApp2(resourceCopy);
    //     fixExt1(resourceCopy);
    //     fixApp3(resourceCopy);
    //     break;
    //   case 'Task':
    //     fixExt1(resourceCopy);
    //     fixTim1(resourceCopy);
    //     break;
    //   case 'Encounter':
    //     fixExt1(resourceCopy);
    //     fixPer1(resourceCopy);
    //     break;
    //   case 'DiagnosticReport':
    //     fixExt1(resourceCopy);
    //     break;
    //   case 'Consent':
    //     fixPpc1(resourceCopy);
    //     break;
    //   case 'Immunization':
    //     fixImmOcc(resourceCopy);
    //     fixUnrecognizedProperty(resourceCopy);
    //     break;
    //   case 'MedicationStatement':
    //     fixMedSta(resourceCopy);
    //     fixUnrecognizedProperty(resourceCopy);
    //     break;
    //   case 'Observation':
    //     fixQty3(resourceCopy);
    //     fixUnrecognizedProperty(resourceCopy);
    //     break;
    //   case 'RiskAssessment':
    //     fixRiskAssessment3(resourceCopy);
    //     break;
    //   case 'FamilyMemberHistory':
    //     fixUnrecognizedProperty(resourceCopy);
    //     break;
    //   case 'QuestionnaireResponse':
    //     fixQuestionnairePropIdentifier(resourceCopy);
    //     break;
    //   default:
    //     console.log(`Unexpected resource type: ${resourceCopy.resourceType}`);
    //     break;
    // }

    // Write modified resource
    outStream.write(JSON.stringify(resourceCopy) + '\n');

    // Write document reference to the one shared document reference ndjson file
    if (docRef) {
      docRefStream.write(JSON.stringify(docRef) + '\n');
    }
  }

  outStream.end();
  await outUpload.promise();
}

// function getResourceType(path: string): string | null {
//   const match = path.match(/\/([^/]+)-v\d+/);
//   return match?.[1] ?? null;
// }

// Walk S3 prefix and process NDJSON files without storing all keys in memory
async function main() {
  const normalizedOriginalPrefix = normalizePrefix(ORIGINAL_EXPORT_PREFIX);
  console.log(`Scanning s3://${ORIGINAL_EXPORT_BUCKET}/${normalizedOriginalPrefix}`);

  // One long-lived stream for all DocumentReferences
  const docRefKey = docRefKeyForRun();
  const docRefStream = new PassThrough();

  const docRefUpload = s3.upload({
    Bucket: ORIGINAL_EXPORT_BUCKET,
    Key: docRefKey,
    Body: docRefStream,
    ContentType: 'application/x-ndjson'
  });

  let ContinuationToken: string | undefined;
  let processedCount = 0;

  try {
    do {
      const res = await s3
        .listObjectsV2({
          Bucket: ORIGINAL_EXPORT_BUCKET,
          Prefix: normalizedOriginalPrefix,
          ContinuationToken,
          MaxKeys: 1000
        })
        .promise();

      for (const obj of res.Contents ?? []) {
        const key = obj.Key;
        if (!key || !key.endsWith('.ndjson')) continue;

        // IMPORTANT: avoid re-processing processed outputs if prefixes overlap
        if (key.startsWith(normalizePrefix(PROCESSED_EXPORT_PREFIX))) continue;

        await processNdjsonFile(key, docRefStream);
        processedCount += 1;
      }

      ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (ContinuationToken);

    // Finish document reference upload
    docRefStream.end();
    await docRefUpload.promise();

    console.log(`\nDone. Processed ${processedCount} files.`);
    console.log(`DocumentReferences written to s3://${ORIGINAL_EXPORT_BUCKET}/${docRefKey}`);
  } catch (err) {
    docRefStream.end();
    throw err;
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
