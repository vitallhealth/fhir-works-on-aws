import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { ResourceUtils } from '@smile-cdr/fhirts/dist/library/ResourceUtils/ResourceUtils';
import { Appointment } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/appointment';
import { Task } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/task';
import { Encounter } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/encounter';
import { DiagnosticReport } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/diagnosticReport';
import { Consent } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/consent';
import { Immunization } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/immunization';
import { MedicationStatement } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/medicationStatement';
import { Observation } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/observation';
import { RiskAssessment } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/riskAssessment';
import { Coding } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/coding';
import { FamilyMemberHistory } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/familyMemberHistory';
import { QuestionnaireResponse } from '@smile-cdr/fhirts/dist/FHIR-R4/classes/questionnaireResponse';

interface ErrorDefinition {
  resources: string[];
  resourceTypes: string[];
  handler: (resource: any) => any;
}

const resourceUtils = new ResourceUtils();

// Vetted - does not apply fix unnecessarily
export function fixApp2(appointment: Appointment) {
  console.log(`fixApp2 - handling Appointment ${appointment.id}`);
  if (appointment.end && !appointment.start) {
    console.log('no start date - setting start date to one hour before end date');
    const endDate = new Date(appointment.end);
    const startDate = new Date(appointment.end);
    startDate.setHours(endDate.getHours() - 1);
    appointment.start = startDate.toISOString();
  } else if (appointment.start && !appointment.end) {
    console.log('no end date - setting end date to one hour after start date');
    const startDate = new Date(appointment.start);
    const endDate = new Date(appointment.start);
    startDate.setHours(startDate.getHours() + 1);
    appointment.end = startDate.toISOString();
  } else {
    console.log('nothing to fix...');
    return;
  }
}

// Vetted - does not apply fix unnecessarily
export function fixExt1(resource: Task | Encounter | Appointment | DiagnosticReport) {
  console.log(`fixExt1 - fixing ${resource.resourceType} ${resource.id}`);
  if (!resource.extension) {
    console.log('nothing to fix...');
    return;
  }
  resource.extension = resource.extension.filter((ext) => {
    const isSingleKeyWithUrl = Object.keys(ext).length === 1 && !!ext.url;
    return !isSingleKeyWithUrl;
  });
  if (resource.extension.length == 0) {
    delete resource.extension;
  }
  console.log(`fixed ${resource.resourceType} - removed extensions with URL as only property`);
}

// Vetted - does not apply fix unnecessarily
export function fixPpc1(consent: Consent) {
  console.log(`fixPpc1 - fixing Consent ${consent.id}`);

  if (!consent.policyRule) {
    consent.policyRule = {
      coding: [
        {
          system: 'https://terminology.hl7.org/5.0.0/ValueSet-v3-ActConsentDirective.html',
          code: '_ActConsentDirective',
          display: 'ActConsentDirective'
        }
      ]
    };
    console.log('policy rule missing - added policy rule');
  } else {
    console.log('nothing to fix...');
  }
}

// Vetted - does not apply fix unnecessarily
export function fixPer1(encounter: Encounter) {
  console.log(`fixPer1 - fixing Encounter ${encounter.id}`);
  if (encounter.period?.start && encounter.period?.end) {
    if (encounter.period.start > encounter.period.end) {
      const start = encounter.period.start;
      encounter.period.start = encounter.period.end;
      encounter.period.end = start;
      console.log(`swapped start ${encounter.period.start} and end ${encounter.period.end}`);
    } else {
      console.log('nothing to fix...');
    }
  } else {
    console.log('nothing to fix...');
  }
}

export function fixImmOcc(immunization: Immunization) {
  console.log(`fixImmOcc - fixing Immunization ${immunization.id}`);
  if (!immunization.occurrenceDateTime && !immunization.occurrenceString) {
    console.log('no occurrenceDateTime or occurrenceString found - setting to "unknown"');
    immunization.occurrenceString = 'unknown';
  } else {
    console.log('nothing to fix...');
  }
}

export function fixMedSta(medicationStatement: MedicationStatement) {
  console.log(`fixMedSta - fixing MedicationStatement ${medicationStatement.id}`);
  if (!medicationStatement.medicationCodeableConcept) {
    console.log('no medicationCodeableConcept found - adding default object');
    medicationStatement.medicationCodeableConcept = {
      coding: undefined,
      text: 'TestMedication'
    };
  } else {
    console.log('nothing to fix...');
  }
  console.log('returning medicationStatement object');
  return medicationStatement;
}

export function fixQty3(observation: Observation) {
  console.log(`fixQty3 - fixing Observation ${observation.id}`);
  if (observation.valueQuantity && !observation.valueQuantity.system) {
    console.log('system missing in valueQuantity - adding default system');
    observation.valueQuantity.system = 'https://vitall.com/documentation';
  } else {
    console.log('system exists in valueQuantity - nothing to fix here');
  }
  if (observation.component) {
    observation.component.forEach((component) => {
      if (component.valueQuantity && !component.valueQuantity.system) {
        console.log("system missing in component's valueQuantity - adding default system");
        component.valueQuantity.system = 'https://vitall.com/documentation';
      }
    });
  }
  console.log('returning Observation object');
  return observation;
}

export function fixRiskAssessment(riskAssessment: any) {
  console.log(`fixRiskAssessment - fixing malformed RiskAssessment ${riskAssessment.id}`);

  const defaultQualitativeRisk: Coding = {
    display: 'Moderate',
    code: 'moderate',
    system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
  };

  riskAssessment.prediction?.forEach((prediction: any) => {
    let qr = prediction.qualitativeRisk;

    if (!qr) {
      // Use default if missing
      prediction.qualitativeRisk = defaultQualitativeRisk;
      return;
    }

    // Unwrap extra nesting
    while (Array.isArray(qr) && qr.length === 1 && Array.isArray(qr[0])) {
      qr = qr[0];
    }

    // Expect [keys, values] structure
    if (Array.isArray(qr) && qr.length === 2 && Array.isArray(qr[0]) && Array.isArray(qr[1])) {
      const keys = qr[0]; // e.g. ['coding', 'text']
      const values = qr[1]; // e.g. [[{...}], 'Low']

      const normalized: any = {};
      keys.forEach((key, idx) => {
        let val = values[idx];

        // Unwrap single-element arrays
        if (Array.isArray(val) && val.length === 1) {
          val = val[0];
        }

        normalized[key] = val;
      });

      // Fallback: if normalized doesn't have both coding & text, use default
      if (!normalized.coding || !normalized.text) {
        console.log('setting qualitativeRisk to default object');
        prediction.qualitativeRisk = defaultQualitativeRisk;
      } else {
        console.log('setting qualitativeRisk to normalized object');
        prediction.qualitativeRisk = normalized;
      }
    } else {
      // Malformed: replace with default
      console.log('setting qualitativeRisk to default object');
      prediction.qualitativeRisk = defaultQualitativeRisk;
    }
  });

  console.log('returning RiskAssessment object');
  return riskAssessment as RiskAssessment;
}

export function fixRiskAssessment2(riskAssessment: any) {
  console.log(`fixRiskAssessment - fixing malformed RiskAssessment ${riskAssessment.id}`);

  const defaultQualitativeRisk: any = {
    coding: [
      {
        display: 'Moderate',
        code: 'moderate',
        system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
      }
    ],
    text: 'Moderate'
  };

  riskAssessment.prediction?.forEach((prediction: any) => {
    let qr = prediction.qualitativeRisk;

    if (!qr) {
      prediction.qualitativeRisk = defaultQualitativeRisk;
      return;
    }

    // unwrap excessive nested arrays
    while (Array.isArray(qr) && qr.length === 1 && Array.isArray(qr[0])) {
      qr = qr[0];
    }

    // expect [keys, values] structure
    if (Array.isArray(qr) && qr.length === 2 && Array.isArray(qr[0]) && Array.isArray(qr[1])) {
      const keys = qr[0];
      const values = qr[1];

      const normalized: any = {};

      keys.forEach((key, idx) => {
        let val = values[idx];

        // unwrap single-element arrays
        if (Array.isArray(val) && val.length === 1) {
          val = val[0];
        }

        normalized[key] = val;
      });

      // FIX: always ensure coding is an array
      if (normalized.coding && !Array.isArray(normalized.coding)) {
        normalized.coding = [normalized.coding];
      }

      if (!normalized.coding || !normalized.text) {
        prediction.qualitativeRisk = defaultQualitativeRisk;
      } else {
        prediction.qualitativeRisk = normalized;
      }
    } else {
      // malformed → use default
      prediction.qualitativeRisk = defaultQualitativeRisk;
    }
  });

  return riskAssessment as RiskAssessment;
}

export function fixRiskAssessment3(riskAssessment: any) {
  console.log(`fixRiskAssessment - fixing malformed RiskAssessment ${riskAssessment?.id ?? '(no id)'}`);

  const defaultQualitativeRisk: any = {
    coding: [
      {
        display: 'Moderate',
        code: 'moderate',
        system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
      }
    ],
    text: 'Moderate'
  };

  const isObject = (v: unknown): v is Record<string, any> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

  const isValidQualitativeRisk = (qr: any): boolean => {
    if (!isObject(qr)) return false;
    if (typeof qr.text !== 'string' || qr.text.trim() === '') return false;

    // coding is optional in some real-world payloads, but in your context you want it
    // If you want to allow text-only, change this to: `return true;`
    if (!Array.isArray(qr.coding) || qr.coding.length === 0) return false;

    // light validation of Coding elements
    return qr.coding.every(
      (c: any) =>
        isObject(c) &&
        typeof c.code === 'string' &&
        c.code.trim() !== '' &&
        typeof c.system === 'string' &&
        c.system.trim() !== ''
    );
  };

  const normalizeCodingIfNeeded = (qr: any): any => {
    // only normalize if it’s an object and coding exists but is not an array
    if (isObject(qr) && qr.coding && !Array.isArray(qr.coding)) {
      return { ...qr, coding: [qr.coding] };
    }
    return qr;
  };

  riskAssessment.prediction?.forEach((prediction: any) => {
    const original = prediction.qualitativeRisk;

    // 1) Missing → set default
    if (!original) {
      prediction.qualitativeRisk = defaultQualitativeRisk;
      return;
    }

    // 2) Already a normal object → keep it (maybe normalize coding if it’s a single object)
    if (isObject(original)) {
      const normalizedObj = normalizeCodingIfNeeded(original);

      // If it’s valid, do nothing (or just apply the minimal coding normalization)
      if (isValidQualitativeRisk(normalizedObj)) {
        // Only assign back if we actually changed something
        if (normalizedObj !== original) prediction.qualitativeRisk = normalizedObj;
        return;
      }

      // Object-shaped but invalid → default
      prediction.qualitativeRisk = defaultQualitativeRisk;
      return;
    }

    // 3) If it’s not an array or object, it’s malformed → default
    if (!Array.isArray(original)) {
      prediction.qualitativeRisk = defaultQualitativeRisk;
      return;
    }

    // 4) Array-form: unwrap excessive nested arrays like [[[ ... ]]] → [...]
    let qr: any = original;
    while (Array.isArray(qr) && qr.length === 1 && Array.isArray(qr[0])) {
      qr = qr[0];
    }

    // 5) Expect [keys, values]
    if (Array.isArray(qr) && qr.length === 2 && Array.isArray(qr[0]) && Array.isArray(qr[1])) {
      const keys = qr[0];
      const values = qr[1];

      // keys should be strings; if not, treat as malformed
      if (!keys.every((k: any) => typeof k === 'string')) {
        prediction.qualitativeRisk = defaultQualitativeRisk;
        return;
      }

      const normalized: any = {};
      keys.forEach((key: string, idx: number) => {
        let val = values[idx];

        // unwrap single-element arrays (your malformed input has coding: [ {..} ])
        if (Array.isArray(val) && val.length === 1) val = val[0];

        normalized[key] = val;
      });

      // ensure coding is an array if present
      if (normalized.coding && !Array.isArray(normalized.coding)) {
        normalized.coding = [normalized.coding];
      }

      // validate final result; default only if still bad
      if (isValidQualitativeRisk(normalized)) {
        prediction.qualitativeRisk = normalized;
      } else {
        prediction.qualitativeRisk = defaultQualitativeRisk;
      }

      return;
    }

    // 6) Any other array-shape → default
    prediction.qualitativeRisk = defaultQualitativeRisk;
  });
}

export function fixTim1(task: Task) {
  console.log(`fixTim1 - fixing Task ${task.id}`);
  task.input?.forEach((inputItem) => {
    const repeat = inputItem.valueTiming?.repeat;
    if (repeat?.duration !== undefined) {
      console.log('duration exists but no unit - adding durationUnit "min"');
      repeat.durationUnit = 'min';
    }
  });

  console.log('returning Task object');
  return task;
}

export function fixFamHistoryExtEmpty(familyMemberHistory: FamilyMemberHistory) {
  console.log(`fixFamHistoryExtEmpty - fixing FamilyMemberHistory ${familyMemberHistory.id}`);
  if (familyMemberHistory.extension?.length == 0) {
    console.log('extension array is empty - removing extension field');
    delete familyMemberHistory.extension;
  } else {
    console.log('extension array not empty or already nonexistent - nothing to fix');
  }
  console.log('returning FamilyMemberHistory object');
  return familyMemberHistory;
}

export function fixApp3(appointment: Appointment) {
  console.log(`fixApp3 - fixing Appointment ${appointment.id}`);
  if (!appointment.start || !appointment.end) {
    if (appointment.status != 'proposed') {
      console.log(`changing status from ${appointment.status} to "proposed"`);
      appointment.status = 'proposed';
    } else {
      console.log('nothing to fix...');
    }
  }
  console.log('returning Appointment object');
  return appointment;
}

export function fixQuestionnairePropIdentifier(questionnaireResponse: any) {
  console.log(
    `fixQuestionnairePropIdentifier - fixing malformed QuestionnaireResponse ${questionnaireResponse.id}`
  );
  if (questionnaireResponse.identifier?.length == 1) {
    console.log('questionnaireReponse array contains object - set questionnaire response to internal object');
    questionnaireResponse.identifier = questionnaireResponse.identifier[0];
  } else {
    console.log('unexpected length - nothing to fix...');
  }

  console.log('returning QuestionnaireResponse object');
  return questionnaireResponse as QuestionnaireResponse;
}

export function fixUnrecognizedProperty(
  resource: MedicationStatement | Observation | FamilyMemberHistory | Immunization
) {
  console.log(`fixUnrecognizedProperty - fixing ${resource.resourceType} ${resource.id}`);
  switch (resource.resourceType) {
    case 'MedicationStatement':
      if (resource.effectiveDateTime && resource.effectivePeriod) {
        console.log('effectiveDateTime and effectivePeriod exist - removing effectiveDateTime');
        delete resource.effectiveDateTime;
      } else {
        console.log('nothing to fix...');
      }
      console.log(`returning ${resource.resourceType} object`);
      return resource as MedicationStatement;
    case 'Observation':
      if (resource.effectiveDateTime && resource.effectivePeriod) {
        console.log('effectiveDateTime and effectivePeriod exist - removing effectiveDateTime');
        delete resource.effectiveDateTime;
      } else {
        console.log('nothing to fix...');
      }
      console.log(`returning ${resource.resourceType} object`);
      return resource as Observation;
    case 'FamilyMemberHistory':
      let familyMemberHistory = resource as FamilyMemberHistory;
      if (familyMemberHistory.hasOwnProperty('deceasedBoolean') && familyMemberHistory.deceasedDate) {
        console.log('deceasedBoolean and deceasedDate exist - removing deceasedDate');
        delete familyMemberHistory.deceasedDate;
      } else {
        console.log('nothing to fix...');
      }
      familyMemberHistory.condition?.forEach((condition) => {
        if (condition.onsetString && condition.onsetPeriod) {
          console.log('onsetString and onsetPeriod exist - removing onsetString');
          delete condition.onsetString;
        } else {
          console.log('nothing to fix...');
        }
      });
      console.log(`returning ${resource.resourceType} object`);
      return familyMemberHistory;
    case 'Immunization':
      let immunization = resource as Immunization;
      if (immunization.occurrenceDateTime && immunization.occurrenceString) {
        console.log('occurrenceDateTime and occurrenceString exist - removing occurrenceString');
        delete immunization.occurrenceString;
      } else {
        console.log('nothing to fix...');
      }
      console.log(`returning ${resource.resourceType} object`);
      return immunization;
    default:
      console.log('Unknown resource');
  }
  console.log('Error - resource did not return');
}

const resourceHandlerMap = new Map<string, ((resource: any) => any)[]>();

const MASTER_FILE = path.resolve('master.ndjson');
const OUTPUT_FILE = path.resolve('processed.ndjson');

async function processMasterNdjson() {
  const readStream = fs.createReadStream(MASTER_FILE);
  const writeStream = fs.createWriteStream(OUTPUT_FILE);
  const rl = readline.createInterface({ input: readStream });

  let totalResources = 0;
  let handledResources = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalResources++;
    try {
      const resource = JSON.parse(line);

      // check if we have a handler for this resource ID
      const handlers = resourceHandlerMap.get(resource.id);
      let processedResource = resource;

      if (handlers) {
        handledResources++;
        for (const handler of handlers) {
          processedResource = handler(processedResource);
        }
        writeStream.write(JSON.stringify(processedResource) + '\n');
      }
    } catch (err) {
      console.error('Failed to parse JSON line:', line);
    }
  }

  writeStream.end();
  console.log('Processing complete. Output written to processed.ndjson');
  console.log(`\nSummary:`);
  console.log(`Total resources processed: ${totalResources}`);
  console.log(`Resources with handlers applied: ${handledResources}`);
}
