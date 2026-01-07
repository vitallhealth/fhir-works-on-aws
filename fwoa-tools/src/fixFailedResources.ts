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

function fixApp2(appointment: Appointment) {
  console.log(`fixApp2 - fixing Appointment ${appointment.id}`);
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
  }
  console.log('returning appointment');
  return appointment;
}

function fixExt1(resource: Task | Encounter | Appointment | DiagnosticReport) {
  console.log(`fixExt1 - fixing ${resource.resourceType} ${resource.id}`);
  if (!resource.extension) {
    console.log('nothing to fix...');
    console.log(`returning ${resource.resourceType}`);
    return resource;
  }
  resource.extension = resource.extension.filter((ext) => {
    const isSingleKeyWithUrl = Object.keys(ext).length === 1 && !!ext.url;
    return !isSingleKeyWithUrl;
  });
  console.log(`returning ${resource.resourceType}`);
  return resource;
}

function fixPpc1(consent: Consent) {
  console.log(`fixPpc1 - fixing Consent ${consent.id}`);

  if (!consent.policyRule) {
    console.log('policy rule missing - adding policy rule');
    consent.policyRule = {
      coding: [
        {
          system: 'https://terminology.hl7.org/5.0.0/ValueSet-v3-ActConsentDirective.html',
          code: '_ActConsentDirective',
          display: 'ActConsentDirective'
        }
      ]
    };
  } else {
    console.log('nothing to fix...');
  }
  console.log('returning Consent object');
  return consent;
}

function fixPer1(encounter: Encounter) {
  console.log(`fixPer1 - fixing Encounter ${encounter.id}`);
  if (encounter.period?.start && encounter.period?.end) {
    console.log(`swapping start ${encounter.period.start} and end ${encounter.period.end}`);
    const start = encounter.period.start;
    encounter.period.start = encounter.period.end;
    encounter.period.end = start;
  } else {
    console.log('nothing to fix...');
  }
  console.log('returning Encounter object');
  return encounter;
}

function fixImmOcc(immunization: Immunization) {
  console.log(`fixImmOcc - fixing Immunization ${immunization.id}`);
  if (!immunization.occurrenceDateTime && !immunization.occurrenceString) {
    console.log('no occurrenceDateTime or occurrenceString found - setting to "unknown"');
    immunization.occurrenceString = 'unknown';
  } else {
    console.log('nothing to fix...');
  }
  console.log('returning Immunization object');
  return immunization;
}

function fixMedSta(medicationStatement: MedicationStatement) {
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

function fixQty3(observation: Observation) {
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

function fixRiskAssessment(riskAssessment: any) {
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

function fixRiskAssessment2(riskAssessment: any) {
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

function fixTim1(task: Task) {
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

function fixFamHistoryExtEmpty(familyMemberHistory: FamilyMemberHistory) {
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

function fixApp3(appointment: Appointment) {
  console.log(`fixApp3 - fixing Appointment ${appointment.id}`);
  if (appointment.status) {
    console.log(`changing status from ${appointment.status} to "proposed"`);
    appointment.status = 'proposed';
  } else {
    console.log('nothing to fix...');
  }
  console.log('returning Appointment object');
  return appointment;
}

function fixQuestionnairePropIdentifier(questionnaireResponse: any) {
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

function fixUnrecognizedProperty(
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

const sampleImmunization2: Immunization = {
  occurrenceDateTime: '2019-01-23',
  manufacturer: { display: 'Yellowfir' },
  protocolApplied: [{ doseNumberString: '0.5 mL' }],
  resourceType: 'Immunization',
  patient: { reference: 'Patient/6610a609-9349-4a7b-9f1d-2f7fcb0db4c5' },
  meta: {
    lastUpdated: '2022-09-30T14:01:26.452Z',
    versionId: '2',
    tag: [{ display: '2022-09-30T14:01:26.452Z', code: 'originalLastUpdated' }]
  },
  vaccineCode: { text: 'Yellow Feve' },
  occurrenceString: '2019-01-23',
  extension: [{ valueBoolean: true, url: 'https://vitall.com/documentation/extensions/viewed-status' }],
  lotNumber: '9283-LM32',
  status: 'completed',
  route: { text: 'SC' },
  performer: [{ actor: { display: 'Dr. Clark' } }],
  reasonCode: [
    { text: 'Travel', coding: [{ display: 'Travel', code: '281657000', system: 'http://snomed.info/sct' }] }
  ],
  id: 'c1cfd2ca-8c37-49be-8e35-8857fcae7c88'
};

const sampleFamilyMemberHistory3: FamilyMemberHistory = {
  note: [{ text: 'ng hyt jiio iuygv' }],
  condition: [
    {
      code: {
        text: 'Melanoma',
        coding: [{ display: 'Melanoma', system: 'https://vitall.com/documentation' }]
      },
      onsetString: '1'
    },
    {
      code: { text: 'Hernia', coding: [{ display: 'Hernia', system: 'https://vitall.com/documentation' }] },
      onsetString: '2',
      onsetPeriod: { start: '1940-06-11' }
    },
    {
      code: {
        text: 'Aneurysm',
        coding: [{ display: 'Aneurysm', system: 'https://vitall.com/documentation' }]
      },
      onsetString: '3',
      onsetPeriod: { start: '2023-06-20' }
    }
  ],
  deceasedBoolean: false,
  patient: { reference: 'Patient/6610a609-9349-4a7b-9f1d-2f7fcb0db4c5' },
  resourceType: 'FamilyMemberHistory',
  meta: {
    lastUpdated: '2023-06-27T20:04:12.728Z',
    versionId: '11',
    tag: [{ display: '2023-06-27T20:04:12.728Z', code: 'originalLastUpdated' }]
  },
  extension: [
    {
      valueString: 'Maternal',
      url: 'https://vitall.com/documentation/extensions/family-history/maternal-paternal'
    },
    { valueBoolean: true, url: 'https://vitall.com/documentation/extensions/viewed-status' }
  ],
  status: 'completed',
  id: 'db032226-d3a5-41a8-b937-3e260e03cf3e',
  relationship: {
    text: 'maternal grandparent',
    coding: [
      {
        display: 'maternal grandparent',
        code: 'MGRPRN',
        system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode'
      }
    ]
  }
};

const sampleMedicationStatement2: MedicationStatement = {
  effectiveDateTime: '2022-06-20',
  effectivePeriod: { end: '2022-07-01', start: '2022-06-20' },
  category: {
    text: 'Prescription',
    coding: [{ display: 'Prescription', code: 'prescription', system: 'https://vitall.com/documentation' }]
  },
  resourceType: 'MedicationStatement',
  meta: {
    lastUpdated: '2022-10-06T17:30:24.303Z',
    versionId: '1',
    tag: [{ display: '2022-10-06T17:30:24.303Z', code: 'originalLastUpdated' }]
  },
  medicationCodeableConcept: { text: 'ketorolac (Acular)' },
  extension: [
    { valueString: '3 drops', url: 'https://vitall.com/documentation/extensions//medications/dose' },
    { valueString: 'Thrice daily', url: 'https://vitall.com/documentation/extensions/medications/frequency' }
  ],
  dosage: [{ route: { text: 'Topical' } }],
  status: 'unknown',
  subject: { reference: 'Patient/5fad208f-c2a0-4049-bce9-54a51cfe45e6' },
  id: 'fbc00702-8bbe-44fe-9f14-747ed4426c66'
};

const sampleQuestionnaireResponse2: any = {
  questionnaire: 'Questionnaire/e75d583b-47b7-4b9a-b86c-bba55cf56c3c',
  authored: '2025-01-29T02:33:56.765Z',
  identifier: [
    { value: 'demographics-questionnaire-v1', system: 'https://vitall.com/documentation/questionnaires' }
  ],
  source: { reference: 'Patient/2385a5f0-34a6-48a6-a4ed-0e48b3cde2ff' },
  resourceType: 'QuestionnaireResponse',
  meta: {
    lastUpdated: '2025-01-29T02:33:57.699Z',
    versionId: '6',
    tag: [{ display: '2025-01-29T02:33:57.699Z', code: 'originalLastUpdated' }]
  },
  item: [
    { linkId: 'indigenous', answer: [{ valueCoding: { code: 'Prefer not to say' } }] },
    { linkId: 'housing', answer: [{ valueCoding: { code: 'Prefer not to say' } }] },
    { linkId: 'primary-care-provider', answer: [{ valueCoding: { code: 'Do not have a PCP' } }] },
    { linkId: 'patient-identification-number', answer: [{ valueString: '1234' }] }
  ],
  status: 'completed',
  subject: { reference: 'Patient/2385a5f0-34a6-48a6-a4ed-0e48b3cde2ff' },
  id: 'f1f83604-b76a-4d9a-aac6-d3f33e69f07a'
};

const fixedQuestionnaireResponse2: QuestionnaireResponse = {
  questionnaire: 'Questionnaire/e75d583b-47b7-4b9a-b86c-bba55cf56c3c',
  authored: '2025-01-29T02:33:56.765Z',
  identifier: {
    value: 'demographics-questionnaire-v1',
    system: 'https://vitall.com/documentation/questionnaires'
  },
  source: { reference: 'Patient/2385a5f0-34a6-48a6-a4ed-0e48b3cde2ff' },
  resourceType: 'QuestionnaireResponse',
  meta: {
    lastUpdated: '2025-01-29T02:33:57.699Z',
    versionId: '6',
    tag: [{ display: '2025-01-29T02:33:57.699Z', code: 'originalLastUpdated' }]
  },
  item: [
    { linkId: 'indigenous', answer: [{ valueCoding: { code: 'Prefer not to say' } }] },
    { linkId: 'housing', answer: [{ valueCoding: { code: 'Prefer not to say' } }] },
    { linkId: 'primary-care-provider', answer: [{ valueCoding: { code: 'Do not have a PCP' } }] },
    { linkId: 'patient-identification-number', answer: [{ valueString: '1234' }] }
  ],
  status: 'completed',
  subject: { reference: 'Patient/2385a5f0-34a6-48a6-a4ed-0e48b3cde2ff' },
  id: 'f1f83604-b76a-4d9a-aac6-d3f33e69f07a'
};

const sampleQuestionnaireResponse1: any = {
  questionnaire: 'Questionnaire/e75d583b-47b7-4b9a-b86c-bba55cf56c3c',
  authored: '2025-01-27T20:08:16.224Z',
  identifier: [
    { value: 'demographics-questionnaire-v1', system: 'https://vitall.com/documentation/questionnaires' }
  ],
  source: { reference: 'Patient/a250ca27-ff20-4749-80f4-8a45cad1d9cc' },
  resourceType: 'QuestionnaireResponse',
  meta: {
    lastUpdated: '2025-01-27T21:27:32.446Z',
    versionId: '2',
    tag: [{ display: '2025-01-27T21:27:32.446Z', code: 'originalLastUpdated' }]
  },
  item: [
    { linkId: 'indigenous', answer: [{ valueCoding: { code: 'Indigenous' } }] },
    { linkId: 'housing', answer: [{ valueCoding: { code: 'Prefer not to say' } }] },
    { linkId: 'primary-care-provider', answer: [{ valueCoding: { code: 'Yes' } }] },
    { linkId: 'patient-identification-number', answer: [{ valueString: '789' }] }
  ],
  status: 'completed',
  subject: { reference: 'Patient/a250ca27-ff20-4749-80f4-8a45cad1d9cc' },
  id: 'cc759773-bdf1-4efa-8f16-13115946514a'
};

const sampleAppointment2: Appointment = {
  comment: 'gggg',
  participant: [
    {
      type: [{ text: 'Location', coding: [{ code: 'PPRF', system: 'https://vitall.com/documentation' }] }],
      actor: { display: 'Dr. Tom' },
      status: 'accepted'
    }
  ],
  patientInstruction: 'hhh',
  resourceType: 'Appointment',
  meta: {
    lastUpdated: '2022-09-23T15:31:36.730Z',
    versionId: '12',
    tag: [{ display: '2022-09-23T15:31:36.730Z', code: 'originalLastUpdated' }]
  },
  extension: [
    { valueString: 'Curator Entry', url: 'https://vitall.com/documentation/extensions/record-source' },
    { valueBoolean: true, url: 'https://vitall.com/documentation/extensions/viewed-status' },
    { url: 'https://vitall.com/documentation/extensions/associated-records' }
  ],
  status: 'booked',
  start: '2021-04-01T04:30:00-04:00',
  reasonCode: [{ text: 'Weight measurement' }],
  id: '30339a03-3d5d-40ae-b984-f799ef73cbea'
};

const sampleFamilyMemberHistory: FamilyMemberHistory = {
  note: [{ text: 'Description' }],
  deceasedDate: '2022-09-06',
  condition: [
    {
      code: {
        text: 'Fam His Example',
        coding: [{ display: 'Fam His Example', system: 'https://vitall.com/documentation' }]
      },
      onsetPeriod: { start: '2017-10-18' }
    }
  ],
  patient: { reference: 'Patient/6610a609-9349-4a7b-9f1d-2f7fcb0db4c5' },
  resourceType: 'FamilyMemberHistory',
  deceasedBoolean: false,
  meta: {
    lastUpdated: '2023-06-27T20:03:24.549Z',
    versionId: '10',
    tag: [{ display: '2023-06-27T20:03:24.549Z', code: 'originalLastUpdated' }]
  },
  extension: [],
  status: 'completed',
  bornDate: '2010-05-01',
  relationship: {
    text: 'birth mother',
    coding: [
      { display: 'birth mother', code: 'other', system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode' }
    ]
  },
  id: '443c0f4f-820a-441a-aa48-c3e9d4e64b4c'
};

const sampleRiskAssessment1: any = {
  occurrenceDateTime: '2024-04-06T21:13:06.875Z',
  prediction: [
    {
      outcome: {
        text: 'Arterial Stiffness',
        coding: [
          {
            display: 'Arterial Stiffness',
            code: 'arterial-stiffness',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Body Mass Index (BMI)',
        coding: [
          {
            display: 'Body Mass Index (BMI)',
            code: 'body-mass-index',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Body Fat Percentage',
        coding: [
          {
            display: 'Body Fat Percentage',
            code: 'body-fat-percentage',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'High',
              code: 'high',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'High'
        ]
      ]
    },
    {
      outcome: {
        text: 'Blood Pressure',
        coding: [
          { display: 'Blood Pressure', code: 'blood-pressure', system: 'https://vitall.com/documentation' },
          {
            display: 'Blood pressure panel with all children optional',
            code: '85354-9',
            system: 'http://loinc.org'
          }
        ]
      }
    },
    {
      outcome: {
        text: 'Resting Heart Rate',
        coding: [
          {
            display: 'Resting Heart Rate',
            code: 'resting-heart-rate',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Visceral Adiposity Index (VAI)',
        coding: [
          {
            display: 'Visceral Adiposity Index (VAI)',
            code: 'visceral-adiposity-index',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Waist Height Ratio',
        coding: [
          {
            display: 'Waist Height Ratio',
            code: 'body-waist-height',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Waist Hip Ratio',
        coding: [
          { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
          { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      probabilityDecimal: 17,
      outcome: { text: '10 Year Cardiovascular Disease Risk' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      probabilityDecimal: 12,
      outcome: { text: 'Framingham Score' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      relativeRisk: 1.303423614564736,
      outcome: { text: 'Visceral Adiposity Index' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      probabilityDecimal: 2.6830552461820667,
      outcome: { text: 'HbA1c' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: { text: 'HDL Cholesterol' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      outcome: { text: 'LDL Cholesterol' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: { text: 'Triglycerides' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      relativeRisk: 6.5195940837319055,
      outcome: { text: 'Lipid Accumulation Product' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      relativeRisk: 37.3,
      outcome: { text: 'Systemic Low-Grade Inflammation Index' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      relativeRisk: 1.543303729805463,
      outcome: { text: 'Metabolic Health Risk' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'Arterial Stiffness',
        coding: [
          {
            display: 'Arterial Stiffness',
            code: 'arterial-stiffness',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Body Mass Index (BMI)',
        coding: [
          {
            display: 'Body Mass Index (BMI)',
            code: 'body-mass-index',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Body Fat Percentage',
        coding: [
          {
            display: 'Body Fat Percentage',
            code: 'body-fat-percentage',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'High',
              code: 'high',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'High'
        ]
      ]
    },
    {
      outcome: {
        text: 'Resting Heart Rate',
        coding: [
          {
            display: 'Resting Heart Rate',
            code: 'resting-heart-rate',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Visceral Adiposity Index (VAI)',
        coding: [
          {
            display: 'Visceral Adiposity Index (VAI)',
            code: 'visceral-adiposity-index',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Waist Height Ratio',
        coding: [
          {
            display: 'Waist Height Ratio',
            code: 'body-waist-height',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Waist Hip Ratio',
        coding: [
          { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
          { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Anxiety',
        coding: [{ display: 'Anxiety score', code: '94024-7', system: 'http://loinc.org' }]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Depression',
        coding: [{ display: 'Depression score', code: '94022-1', system: 'http://loinc.org' }]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    }
  ],
  method: {
    text: 'Biometric Health Assessment (BHA)',
    coding: [
      {
        display: 'Biometric Health Assessment (BHA)',
        code: 'BHA',
        system: 'https://vitall.com/documentation'
      }
    ]
  },
  resourceType: 'RiskAssessment',
  meta: {
    lastUpdated: '2024-11-17T01:04:07.176Z',
    versionId: '1',
    tag: [{ display: '2024-11-17T01:04:07.176Z', code: 'originalLastUpdated' }]
  },
  basis: [
    { reference: 'Observation/570a067d-c04f-4a64-b103-6ec143dba131' },
    { reference: 'Observation/33c88407-63fe-4a29-8cde-dd0f600e8253' },
    { reference: 'Observation/d10af213-6139-4271-9e1f-c079d6b25b87' },
    { reference: 'Observation/e0b41b08-02f7-4f11-8dd9-654d4e6b35e8' },
    { reference: 'Observation/1f01746d-92c4-4178-b4c7-30612432a5a4' },
    { reference: 'Observation/1edabaae-da09-40d8-aa1e-337b98c788b4' },
    { reference: 'Observation/9b18216d-7316-48b7-b993-8a66dee0443f' },
    { reference: 'Observation/1b9c6b97-5655-4b4b-9914-ecdb7b0d9e76' }
  ],
  status: 'final',
  subject: { reference: 'Patient/91065b88-a8aa-4b75-aa82-54b8281da82b' },
  id: 'f7263358-f9ca-4254-a839-9d23b7b3c098'
};

// const fixedRiskAssessment1: RiskAssessment = {
//   occurrenceDateTime: '2024-04-06T21:13:06.875Z',
//   prediction: [
//     {
//       outcome: {
//         text: 'Arterial Stiffness',
//         coding: [
//           {
//             display: 'Arterial Stiffness',
//             code: 'arterial-stiffness',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Mass Index (BMI)',
//         coding: [
//           {
//             display: 'Body Mass Index (BMI)',
//             code: 'body-mass-index',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Fat Percentage',
//         coding: [
//           {
//             display: 'Body Fat Percentage',
//             code: 'body-fat-percentage',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'High',
//           code: 'high',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'High'
//       }
//     },
//     {
//       outcome: {
//         text: 'Blood Pressure',
//         coding: [
//           { display: 'Blood Pressure', code: 'blood-pressure', system: 'https://vitall.com/documentation' },
//           {
//             display: 'Blood pressure panel with all children optional',
//             code: '85354-9',
//             system: 'http://loinc.org'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         display: 'Moderate',
//         code: 'moderate',
//         system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//       }
//     },
//     {
//       outcome: {
//         text: 'Resting Heart Rate',
//         coding: [
//           {
//             display: 'Resting Heart Rate',
//             code: 'resting-heart-rate',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Visceral Adiposity Index (VAI)',
//         coding: [
//           {
//             display: 'Visceral Adiposity Index (VAI)',
//             code: 'visceral-adiposity-index',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Height Ratio',
//         coding: [
//           {
//             display: 'Waist Height Ratio',
//             code: 'body-waist-height',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Hip Ratio',
//         coding: [
//           { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
//           { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       probabilityDecimal: 17,
//       outcome: { text: '10 Year Cardiovascular Disease Risk' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       probabilityDecimal: 12,
//       outcome: { text: 'Framingham Score' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       relativeRisk: 1.303423614564736,
//       outcome: { text: 'Visceral Adiposity Index' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       probabilityDecimal: 2.6830552461820667,
//       outcome: { text: 'HbA1c' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: { text: 'HDL Cholesterol' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: { text: 'LDL Cholesterol' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: { text: 'Triglycerides' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 6.5195940837319055,
//       outcome: { text: 'Lipid Accumulation Product' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 37.3,
//       outcome: { text: 'Systemic Low-Grade Inflammation Index' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       relativeRisk: 1.543303729805463,
//       outcome: { text: 'Metabolic Health Risk' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Arterial Stiffness',
//         coding: [
//           {
//             display: 'Arterial Stiffness',
//             code: 'arterial-stiffness',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Mass Index (BMI)',
//         coding: [
//           {
//             display: 'Body Mass Index (BMI)',
//             code: 'body-mass-index',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Fat Percentage',
//         coding: [
//           {
//             display: 'Body Fat Percentage',
//             code: 'body-fat-percentage',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'High',
//           code: 'high',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'High'
//       }
//     },
//     {
//       outcome: {
//         text: 'Resting Heart Rate',
//         coding: [
//           {
//             display: 'Resting Heart Rate',
//             code: 'resting-heart-rate',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Visceral Adiposity Index (VAI)',
//         coding: [
//           {
//             display: 'Visceral Adiposity Index (VAI)',
//             code: 'visceral-adiposity-index',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Height Ratio',
//         coding: [
//           {
//             display: 'Waist Height Ratio',
//             code: 'body-waist-height',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Hip Ratio',
//         coding: [
//           { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
//           { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Anxiety',
//         coding: [{ display: 'Anxiety score', code: '94024-7', system: 'http://loinc.org' }]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Depression',
//         coding: [{ display: 'Depression score', code: '94022-1', system: 'http://loinc.org' }]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     }
//   ],
//   method: {
//     text: 'Biometric Health Assessment (BHA)',
//     coding: [
//       {
//         display: 'Biometric Health Assessment (BHA)',
//         code: 'BHA',
//         system: 'https://vitall.com/documentation'
//       }
//     ]
//   },
//   resourceType: 'RiskAssessment',
//   meta: {
//     lastUpdated: '2024-11-17T01:04:07.176Z',
//     versionId: '1',
//     tag: [{ display: '2024-11-17T01:04:07.176Z', code: 'originalLastUpdated' }]
//   },
//   basis: [
//     { reference: 'Observation/570a067d-c04f-4a64-b103-6ec143dba131' },
//     { reference: 'Observation/33c88407-63fe-4a29-8cde-dd0f600e8253' },
//     { reference: 'Observation/d10af213-6139-4271-9e1f-c079d6b25b87' },
//     { reference: 'Observation/e0b41b08-02f7-4f11-8dd9-654d4e6b35e8' },
//     { reference: 'Observation/1f01746d-92c4-4178-b4c7-30612432a5a4' },
//     { reference: 'Observation/1edabaae-da09-40d8-aa1e-337b98c788b4' },
//     { reference: 'Observation/9b18216d-7316-48b7-b993-8a66dee0443f' },
//     { reference: 'Observation/1b9c6b97-5655-4b4b-9914-ecdb7b0d9e76' }
//   ],
//   status: 'final',
//   subject: { reference: 'Patient/91065b88-a8aa-4b75-aa82-54b8281da82b' },
//   id: 'f7263358-f9ca-4254-a839-9d23b7b3c098'
// };

const sampleRiskAssessment2: any = {
  occurrenceDateTime: '2024-04-06T21:13:06.875Z',
  prediction: [
    {
      probabilityDecimal: 17,
      outcome: {
        text: '10 Year Cardiovascular Disease Risk',
        coding: [
          {
            display: 'Cardiovascular disease 10Y risk [Likelihood] ACC-AHA Pooled Cohort by Goff 2013',
            code: '79423-0',
            system: 'https://loinc.org/'
          },
          {
            display: '10 Year Cardiovascular Disease Risk',
            code: '10-year-cardiovascular-disease-risk',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      probabilityDecimal: 12,
      outcome: {
        text: 'Framingham Score',
        coding: [
          {
            display: 'Hard coronary heart disease 10Y risk [#] Framingham.The Adult Treatment Panel III 2001',
            code: '66336-9',
            system: 'https://loinc.org/'
          },
          {
            display: 'Framingham Score',
            code: 'framingham-score',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      probabilityDecimal: 2.6830552461820667,
      outcome: {
        text: 'HbA1c',
        coding: [
          {
            display: 'Hemoglobin A1c/Hemoglobin.total in Blood',
            code: '4548-4',
            system: 'https://loinc.org/'
          },
          { display: 'HbA1c', code: 'hb-a1c', system: 'https://vitall.com/documentation' }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'Total Cholesterol',
        coding: [
          {
            display: 'Cholesterol [Mass/volume] in Serum or Plasma',
            code: '2093-3',
            system: 'https://loinc.org/'
          },
          {
            display: 'Total Cholesterol',
            code: 'total-cholesterol',
            system: 'https://vitall.com/documentation'
          }
        ]
      }
    },
    {
      outcome: {
        text: 'HDL Cholesterol',
        coding: [
          {
            display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma',
            code: '2085-9',
            system: 'https://loinc.org/'
          },
          { display: 'HDL Cholesterol', code: 'hdl-cholesterol', system: 'https://vitall.com/documentation' }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'LDL Cholesterol',
        coding: [
          {
            display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma',
            code: '2089-1',
            system: 'https://loinc.org/'
          },
          { display: 'LDL Cholesterol', code: 'ldl-cholesterol', system: 'https://vitall.com/documentation' }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'Triglycerides',
        coding: [
          {
            display: 'Cholesterol in Triglycerides [Mass/volume] in Serum or Plasma',
            code: '2571-8',
            system: 'https://loinc.org/'
          },
          { display: 'Triglycerides', code: 'triglycerides', system: 'https://vitall.com/documentation' }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      relativeRisk: 6.5195940837319055,
      outcome: {
        text: 'Lipid Accumulation Product',
        coding: [
          {
            display: 'Lipid Accumulation Product',
            code: 'lipid-accumulation-product',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      relativeRisk: 37.3,
      outcome: {
        text: 'Systemic Low-Grade Inflammation Index',
        coding: [
          {
            display: 'Systemic Low-Grade Inflammation Index',
            code: 'systemic-low-grade-inflammation-index',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      relativeRisk: 1.543303729805463,
      outcome: {
        text: 'Metabolic Health Risk',
        coding: [
          {
            display: 'Metabolic Health Risk',
            code: 'metabolic-health-risk',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'Arterial Stiffness',
        coding: [
          {
            display: 'Arterial Stiffness',
            code: 'arterial-stiffness',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Body Mass Index (BMI)',
        coding: [
          {
            display: 'Body Mass Index (BMI)',
            code: 'body-mass-index',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Body Fat Percentage',
        coding: [
          {
            display: 'Body Fat Percentage',
            code: 'body-fat-percentage',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'High',
              code: 'high',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'High'
        ]
      ]
    },
    {
      outcome: {
        text: 'Blood Pressure',
        coding: [
          { display: 'Blood Pressure', code: 'blood-pressure', system: 'https://vitall.com/documentation' },
          {
            display: 'Blood pressure panel with all children optional',
            code: '85354-9',
            system: 'http://loinc.org'
          }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Cardio Respiratory Fitness',
        coding: [
          {
            display: 'Cardio Respiratory Fitness',
            code: 'cardiorespiratory-fitness',
            system: 'https://vitall.com/documentation'
          },
          {
            display: 'Oxygen consumption (VO2)/Body weight [Volume Rate Content] --peak during exercise',
            code: '94122-9',
            system: 'http://loinc.org'
          }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Resting Heart Rate',
        coding: [
          {
            display: 'Resting Heart Rate',
            code: 'resting-heart-rate',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Visceral Adiposity Index (VAI)',
        coding: [
          {
            display: 'Visceral Adiposity Index (VAI)',
            code: 'visceral-adiposity-index',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Waist Height Ratio',
        coding: [
          {
            display: 'Waist Height Ratio',
            code: 'body-waist-height',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Waist Hip Ratio',
        coding: [
          { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
          { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      relativeRisk: 1,
      outcome: {
        text: 'Anxiety',
        coding: [{ display: 'Anxiety score', code: '94024-7', system: 'http://loinc.org' }]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      relativeRisk: 0,
      outcome: {
        text: 'Depression',
        coding: [{ display: 'Depression score', code: '94022-1', system: 'http://loinc.org' }]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    }
  ],
  method: {
    text: 'Biometric Health Assessment (BHA)',
    coding: [
      {
        display: 'Biometric Health Assessment (BHA)',
        code: 'BHA',
        system: 'https://vitall.com/documentation'
      }
    ]
  },
  resourceType: 'RiskAssessment',
  meta: {
    lastUpdated: '2024-11-18T17:03:25.757Z',
    versionId: '1',
    tag: [{ display: '2024-11-18T17:03:25.757Z', code: 'originalLastUpdated' }]
  },
  basis: [
    { reference: 'Observation/7d7bacec-0127-4ec8-86fc-012eb3cff652' },
    { reference: 'Observation/f6af5059-e362-4a3a-ab78-00249fce9ca6' },
    { reference: 'Observation/5b0bff46-8d31-4ae6-a5fe-4138f4cae251' },
    { reference: 'Observation/be9a35a4-9c55-4349-9be0-3bb5bb26c997' },
    { reference: 'Observation/a66b19e7-1345-4ac3-bbb2-3959ba8e193d' },
    { reference: 'Observation/c8b3eae7-01e1-4f7b-b10e-01b0b6e6b669' },
    { reference: 'Observation/b5229751-75ef-4a7e-a5b6-732b86ac442d' },
    { reference: 'Observation/bdfbaf2b-4e7a-4554-a693-eac9b21f674b' },
    { reference: 'Observation/e9accaee-24ea-4c0b-b7b7-d735ea1bf162' }
  ],
  status: 'final',
  subject: { reference: 'Patient/91065b88-a8aa-4b75-aa82-54b8281da82b' },
  id: 'a30ccca1-bd2f-4be7-8db4-14e27fb72527'
};

// const fixedRiskAssessment2: RiskAssessment = {
//   occurrenceDateTime: '2024-04-06T21:13:06.875Z',
//   prediction: [
//     {
//       probabilityDecimal: 17,
//       outcome: {
//         text: '10 Year Cardiovascular Disease Risk',
//         coding: [
//           {
//             display: 'Cardiovascular disease 10Y risk [Likelihood] ACC-AHA Pooled Cohort by Goff 2013',
//             code: '79423-0',
//             system: 'https://loinc.org/'
//           },
//           {
//             display: '10 Year Cardiovascular Disease Risk',
//             code: '10-year-cardiovascular-disease-risk',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       probabilityDecimal: 12,
//       outcome: {
//         text: 'Framingham Score',
//         coding: [
//           {
//             display: 'Hard coronary heart disease 10Y risk [#] Framingham.The Adult Treatment Panel III 2001',
//             code: '66336-9',
//             system: 'https://loinc.org/'
//           },
//           {
//             display: 'Framingham Score',
//             code: 'framingham-score',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       probabilityDecimal: 2.6830552461820667,
//       outcome: {
//         text: 'HbA1c',
//         coding: [
//           {
//             display: 'Hemoglobin A1c/Hemoglobin.total in Blood',
//             code: '4548-4',
//             system: 'https://loinc.org/'
//           },
//           { display: 'HbA1c', code: 'hb-a1c', system: 'https://vitall.com/documentation' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Total Cholesterol',
//         coding: [
//           {
//             display: 'Cholesterol [Mass/volume] in Serum or Plasma',
//             code: '2093-3',
//             system: 'https://loinc.org/'
//           },
//           {
//             display: 'Total Cholesterol',
//             code: 'total-cholesterol',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         display: 'Moderate',
//         code: 'moderate',
//         system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//       }
//     },
//     {
//       outcome: {
//         text: 'HDL Cholesterol',
//         coding: [
//           {
//             display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma',
//             code: '2085-9',
//             system: 'https://loinc.org/'
//           },
//           { display: 'HDL Cholesterol', code: 'hdl-cholesterol', system: 'https://vitall.com/documentation' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'LDL Cholesterol',
//         coding: [
//           {
//             display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma',
//             code: '2089-1',
//             system: 'https://loinc.org/'
//           },
//           { display: 'LDL Cholesterol', code: 'ldl-cholesterol', system: 'https://vitall.com/documentation' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Triglycerides',
//         coding: [
//           {
//             display: 'Cholesterol in Triglycerides [Mass/volume] in Serum or Plasma',
//             code: '2571-8',
//             system: 'https://loinc.org/'
//           },
//           { display: 'Triglycerides', code: 'triglycerides', system: 'https://vitall.com/documentation' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 6.5195940837319055,
//       outcome: {
//         text: 'Lipid Accumulation Product',
//         coding: [
//           {
//             display: 'Lipid Accumulation Product',
//             code: 'lipid-accumulation-product',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 37.3,
//       outcome: {
//         text: 'Systemic Low-Grade Inflammation Index',
//         coding: [
//           {
//             display: 'Systemic Low-Grade Inflammation Index',
//             code: 'systemic-low-grade-inflammation-index',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       relativeRisk: 1.543303729805463,
//       outcome: {
//         text: 'Metabolic Health Risk',
//         coding: [
//           {
//             display: 'Metabolic Health Risk',
//             code: 'metabolic-health-risk',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Arterial Stiffness',
//         coding: [
//           {
//             display: 'Arterial Stiffness',
//             code: 'arterial-stiffness',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Mass Index (BMI)',
//         coding: [
//           {
//             display: 'Body Mass Index (BMI)',
//             code: 'body-mass-index',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Fat Percentage',
//         coding: [
//           {
//             display: 'Body Fat Percentage',
//             code: 'body-fat-percentage',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'High',
//           code: 'high',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'High'
//       }
//     },
//     {
//       outcome: {
//         text: 'Blood Pressure',
//         coding: [
//           { display: 'Blood Pressure', code: 'blood-pressure', system: 'https://vitall.com/documentation' },
//           {
//             display: 'Blood pressure panel with all children optional',
//             code: '85354-9',
//             system: 'http://loinc.org'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Cardio Respiratory Fitness',
//         coding: [
//           {
//             display: 'Cardio Respiratory Fitness',
//             code: 'cardiorespiratory-fitness',
//             system: 'https://vitall.com/documentation'
//           },
//           {
//             display: 'Oxygen consumption (VO2)/Body weight [Volume Rate Content] --peak during exercise',
//             code: '94122-9',
//             system: 'http://loinc.org'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Resting Heart Rate',
//         coding: [
//           {
//             display: 'Resting Heart Rate',
//             code: 'resting-heart-rate',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Visceral Adiposity Index (VAI)',
//         coding: [
//           {
//             display: 'Visceral Adiposity Index (VAI)',
//             code: 'visceral-adiposity-index',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Height Ratio',
//         coding: [
//           {
//             display: 'Waist Height Ratio',
//             code: 'body-waist-height',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Hip Ratio',
//         coding: [
//           { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
//           { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 1,
//       outcome: {
//         text: 'Anxiety',
//         coding: [{ display: 'Anxiety score', code: '94024-7', system: 'http://loinc.org' }]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 0,
//       outcome: {
//         text: 'Depression',
//         coding: [{ display: 'Depression score', code: '94022-1', system: 'http://loinc.org' }]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     }
//   ],
//   method: {
//     text: 'Biometric Health Assessment (BHA)',
//     coding: [
//       {
//         display: 'Biometric Health Assessment (BHA)',
//         code: 'BHA',
//         system: 'https://vitall.com/documentation'
//       }
//     ]
//   },
//   resourceType: 'RiskAssessment',
//   meta: {
//     lastUpdated: '2024-11-18T17:03:25.757Z',
//     versionId: '1',
//     tag: [{ display: '2024-11-18T17:03:25.757Z', code: 'originalLastUpdated' }]
//   },
//   basis: [
//     { reference: 'Observation/7d7bacec-0127-4ec8-86fc-012eb3cff652' },
//     { reference: 'Observation/f6af5059-e362-4a3a-ab78-00249fce9ca6' },
//     { reference: 'Observation/5b0bff46-8d31-4ae6-a5fe-4138f4cae251' },
//     { reference: 'Observation/be9a35a4-9c55-4349-9be0-3bb5bb26c997' },
//     { reference: 'Observation/a66b19e7-1345-4ac3-bbb2-3959ba8e193d' },
//     { reference: 'Observation/c8b3eae7-01e1-4f7b-b10e-01b0b6e6b669' },
//     { reference: 'Observation/b5229751-75ef-4a7e-a5b6-732b86ac442d' },
//     { reference: 'Observation/bdfbaf2b-4e7a-4554-a693-eac9b21f674b' },
//     { reference: 'Observation/e9accaee-24ea-4c0b-b7b7-d735ea1bf162' }
//   ],
//   status: 'final',
//   subject: { reference: 'Patient/91065b88-a8aa-4b75-aa82-54b8281da82b' },
//   id: 'a30ccca1-bd2f-4be7-8db4-14e27fb72527'
// };

const sampleRiskAssessment3: any = {
  occurrenceDateTime: '2024-04-06T21:13:06.875Z',
  prediction: [
    {
      outcome: {
        text: 'Arterial Stiffness',
        coding: [
          {
            display: 'Arterial Stiffness',
            code: 'arterial-stiffness',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Body Mass Index (BMI)',
        coding: [
          {
            display: 'Body Mass Index (BMI)',
            code: 'body-mass-index',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Body Fat Percentage',
        coding: [
          {
            display: 'Body Fat Percentage',
            code: 'body-fat-percentage',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'High',
              code: 'high',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'High'
        ]
      ]
    },
    {
      outcome: {
        text: 'Blood Pressure',
        coding: [
          { display: 'Blood Pressure', code: 'blood-pressure', system: 'https://vitall.com/documentation' },
          {
            display: 'Blood pressure panel with all children optional',
            code: '85354-9',
            system: 'http://loinc.org'
          }
        ]
      }
    },
    {
      outcome: {
        text: 'Resting Heart Rate',
        coding: [
          {
            display: 'Resting Heart Rate',
            code: 'resting-heart-rate',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Visceral Adiposity Index (VAI)',
        coding: [
          {
            display: 'Visceral Adiposity Index (VAI)',
            code: 'visceral-adiposity-index',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Waist Height Ratio',
        coding: [
          {
            display: 'Waist Height Ratio',
            code: 'body-waist-height',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Waist Hip Ratio',
        coding: [
          { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
          { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      probabilityDecimal: 17,
      outcome: {
        text: '10 Year Cardiovascular Disease Risk',
        coding: [
          {
            display: 'Cardiovascular disease 10Y risk [Likelihood] ACC-AHA Pooled Cohort by Goff 2013',
            code: '79423-0',
            system: 'https://loinc.org/'
          },
          {
            display: '10 Year Cardiovascular Disease Risk',
            code: '10-year-cardiovascular-disease-risk',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      probabilityDecimal: 12,
      outcome: {
        text: 'Framingham Score',
        coding: [
          {
            display: 'Hard coronary heart disease 10Y risk [#] Framingham.The Adult Treatment Panel III 2001',
            code: '66336-9',
            system: 'https://loinc.org/'
          },
          {
            display: 'Framingham Score',
            code: 'framingham-score',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      probabilityDecimal: 2.6830552461820667,
      outcome: {
        text: 'HbA1c',
        coding: [
          {
            display: 'Hemoglobin A1c/Hemoglobin.total in Blood',
            code: '4548-4',
            system: 'https://loinc.org/'
          },
          { display: 'HbA1c', code: 'hb-a1c', system: 'https://vitall.com/documentation' }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'HDL Cholesterol',
        coding: [
          {
            display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma',
            code: '2085-9',
            system: 'https://loinc.org/'
          },
          { display: 'HDL Cholesterol', code: 'hdl-cholesterol', system: 'https://vitall.com/documentation' }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'LDL Cholesterol',
        coding: [
          {
            display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma',
            code: '2089-1',
            system: 'https://loinc.org/'
          },
          { display: 'LDL Cholesterol', code: 'ldl-cholesterol', system: 'https://vitall.com/documentation' }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'Triglycerides',
        coding: [
          {
            display: 'Cholesterol in Triglycerides [Mass/volume] in Serum or Plasma',
            code: '2571-8',
            system: 'https://loinc.org/'
          },
          { display: 'Triglycerides', code: 'triglycerides', system: 'https://vitall.com/documentation' }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      relativeRisk: 6.5195940837319055,
      outcome: {
        text: 'Lipid Accumulation Product',
        coding: [
          {
            display: 'Lipid Accumulation Product',
            code: 'lipid-accumulation-product',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      relativeRisk: 37.3,
      outcome: {
        text: 'Systemic Low-Grade Inflammation Index',
        coding: [
          {
            display: 'Systemic Low-Grade Inflammation Index',
            code: 'systemic-low-grade-inflammation-index',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      relativeRisk: 1.543303729805463,
      outcome: {
        text: 'Metabolic Health Risk',
        coding: [
          {
            display: 'Metabolic Health Risk',
            code: 'metabolic-health-risk',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'Arterial Stiffness',
        coding: [
          {
            display: 'Arterial Stiffness',
            code: 'arterial-stiffness',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Body Mass Index (BMI)',
        coding: [
          {
            display: 'Body Mass Index (BMI)',
            code: 'body-mass-index',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Body Fat Percentage',
        coding: [
          {
            display: 'Body Fat Percentage',
            code: 'body-fat-percentage',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'High',
              code: 'high',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'High'
        ]
      ]
    },
    {
      outcome: {
        text: 'Resting Heart Rate',
        coding: [
          {
            display: 'Resting Heart Rate',
            code: 'resting-heart-rate',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Visceral Adiposity Index (VAI)',
        coding: [
          {
            display: 'Visceral Adiposity Index (VAI)',
            code: 'visceral-adiposity-index',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Waist Height Ratio',
        coding: [
          {
            display: 'Waist Height Ratio',
            code: 'body-waist-height',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Waist Hip Ratio',
        coding: [
          { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
          { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      relativeRisk: 1,
      outcome: {
        text: 'Anxiety',
        coding: [{ display: 'Anxiety score', code: '94024-7', system: 'http://loinc.org' }]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      relativeRisk: 0,
      outcome: {
        text: 'Depression',
        coding: [{ display: 'Depression score', code: '94022-1', system: 'http://loinc.org' }]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    }
  ],
  method: {
    text: 'Biometric Health Assessment (BHA)',
    coding: [
      {
        display: 'Biometric Health Assessment (BHA)',
        code: 'BHA',
        system: 'https://vitall.com/documentation'
      }
    ]
  },
  resourceType: 'RiskAssessment',
  meta: {
    lastUpdated: '2024-11-18T16:16:34.380Z',
    versionId: '1',
    tag: [{ display: '2024-11-18T16:16:34.380Z', code: 'originalLastUpdated' }]
  },
  basis: [
    { reference: 'Observation/e179cbdf-452c-4d39-81de-2f0f5a02e532' },
    { reference: 'Observation/245dcb29-4b57-4d0b-a986-dda7965d363a' },
    { reference: 'Observation/57a3667c-bd37-48b6-8da1-12234aa68430' },
    { reference: 'Observation/6142d704-812c-4001-8619-286487fff686' },
    { reference: 'Observation/986fe5d9-b528-412e-9dd4-dd3f3c4cb1e2' },
    { reference: 'Observation/c0d42638-7582-4101-8018-ec04461405d7' },
    { reference: 'Observation/564313fe-096a-4592-8f73-0ee7997f9f2c' },
    { reference: 'Observation/56aee8b2-a94a-4ba0-a7c4-448c549cb1c0' }
  ],
  status: 'final',
  subject: { reference: 'Patient/6610a609-9349-4a7b-9f1d-2f7fcb0db4c5' },
  id: 'dff04b8f-a9fe-4d6a-ad2e-3e4be01927bc'
};

// const fixedRiskAssessment3: RiskAssessment = {
//   occurrenceDateTime: '2024-04-06T21:13:06.875Z',
//   prediction: [
//     {
//       outcome: {
//         text: 'Arterial Stiffness',
//         coding: [
//           {
//             display: 'Arterial Stiffness',
//             code: 'arterial-stiffness',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Mass Index (BMI)',
//         coding: [
//           {
//             display: 'Body Mass Index (BMI)',
//             code: 'body-mass-index',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Fat Percentage',
//         coding: [
//           {
//             display: 'Body Fat Percentage',
//             code: 'body-fat-percentage',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'High',
//           code: 'high',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'High'
//       }
//     },
//     {
//       outcome: {
//         text: 'Blood Pressure',
//         coding: [
//           { display: 'Blood Pressure', code: 'blood-pressure', system: 'https://vitall.com/documentation' },
//           {
//             display: 'Blood pressure panel with all children optional',
//             code: '85354-9',
//             system: 'http://loinc.org'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         display: 'Moderate',
//         code: 'moderate',
//         system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//       }
//     },
//     {
//       outcome: {
//         text: 'Resting Heart Rate',
//         coding: [
//           {
//             display: 'Resting Heart Rate',
//             code: 'resting-heart-rate',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Visceral Adiposity Index (VAI)',
//         coding: [
//           {
//             display: 'Visceral Adiposity Index (VAI)',
//             code: 'visceral-adiposity-index',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Height Ratio',
//         coding: [
//           {
//             display: 'Waist Height Ratio',
//             code: 'body-waist-height',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Hip Ratio',
//         coding: [
//           { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
//           { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       probabilityDecimal: 17,
//       outcome: {
//         text: '10 Year Cardiovascular Disease Risk',
//         coding: [
//           {
//             display: 'Cardiovascular disease 10Y risk [Likelihood] ACC-AHA Pooled Cohort by Goff 2013',
//             code: '79423-0',
//             system: 'https://loinc.org/'
//           },
//           {
//             display: '10 Year Cardiovascular Disease Risk',
//             code: '10-year-cardiovascular-disease-risk',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       probabilityDecimal: 12,
//       outcome: {
//         text: 'Framingham Score',
//         coding: [
//           {
//             display: 'Hard coronary heart disease 10Y risk [#] Framingham.The Adult Treatment Panel III 2001',
//             code: '66336-9',
//             system: 'https://loinc.org/'
//           },
//           {
//             display: 'Framingham Score',
//             code: 'framingham-score',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       probabilityDecimal: 2.6830552461820667,
//       outcome: {
//         text: 'HbA1c',
//         coding: [
//           {
//             display: 'Hemoglobin A1c/Hemoglobin.total in Blood',
//             code: '4548-4',
//             system: 'https://loinc.org/'
//           },
//           { display: 'HbA1c', code: 'hb-a1c', system: 'https://vitall.com/documentation' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'HDL Cholesterol',
//         coding: [
//           {
//             display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma',
//             code: '2085-9',
//             system: 'https://loinc.org/'
//           },
//           { display: 'HDL Cholesterol', code: 'hdl-cholesterol', system: 'https://vitall.com/documentation' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'LDL Cholesterol',
//         coding: [
//           {
//             display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma',
//             code: '2089-1',
//             system: 'https://loinc.org/'
//           },
//           { display: 'LDL Cholesterol', code: 'ldl-cholesterol', system: 'https://vitall.com/documentation' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Triglycerides',
//         coding: [
//           {
//             display: 'Cholesterol in Triglycerides [Mass/volume] in Serum or Plasma',
//             code: '2571-8',
//             system: 'https://loinc.org/'
//           },
//           { display: 'Triglycerides', code: 'triglycerides', system: 'https://vitall.com/documentation' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 6.5195940837319055,
//       outcome: {
//         text: 'Lipid Accumulation Product',
//         coding: [
//           {
//             display: 'Lipid Accumulation Product',
//             code: 'lipid-accumulation-product',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 37.3,
//       outcome: {
//         text: 'Systemic Low-Grade Inflammation Index',
//         coding: [
//           {
//             display: 'Systemic Low-Grade Inflammation Index',
//             code: 'systemic-low-grade-inflammation-index',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       relativeRisk: 1.543303729805463,
//       outcome: {
//         text: 'Metabolic Health Risk',
//         coding: [
//           {
//             display: 'Metabolic Health Risk',
//             code: 'metabolic-health-risk',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Arterial Stiffness',
//         coding: [
//           {
//             display: 'Arterial Stiffness',
//             code: 'arterial-stiffness',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Mass Index (BMI)',
//         coding: [
//           {
//             display: 'Body Mass Index (BMI)',
//             code: 'body-mass-index',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Fat Percentage',
//         coding: [
//           {
//             display: 'Body Fat Percentage',
//             code: 'body-fat-percentage',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'High',
//           code: 'high',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'High'
//       }
//     },
//     {
//       outcome: {
//         text: 'Resting Heart Rate',
//         coding: [
//           {
//             display: 'Resting Heart Rate',
//             code: 'resting-heart-rate',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Visceral Adiposity Index (VAI)',
//         coding: [
//           {
//             display: 'Visceral Adiposity Index (VAI)',
//             code: 'visceral-adiposity-index',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Height Ratio',
//         coding: [
//           {
//             display: 'Waist Height Ratio',
//             code: 'body-waist-height',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Hip Ratio',
//         coding: [
//           { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
//           { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 1,
//       outcome: {
//         text: 'Anxiety',
//         coding: [{ display: 'Anxiety score', code: '94024-7', system: 'http://loinc.org' }]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 0,
//       outcome: {
//         text: 'Depression',
//         coding: [{ display: 'Depression score', code: '94022-1', system: 'http://loinc.org' }]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     }
//   ],
//   method: {
//     text: 'Biometric Health Assessment (BHA)',
//     coding: [
//       {
//         display: 'Biometric Health Assessment (BHA)',
//         code: 'BHA',
//         system: 'https://vitall.com/documentation'
//       }
//     ]
//   },
//   resourceType: 'RiskAssessment',
//   meta: {
//     lastUpdated: '2024-11-18T16:16:34.380Z',
//     versionId: '1',
//     tag: [{ display: '2024-11-18T16:16:34.380Z', code: 'originalLastUpdated' }]
//   },
//   basis: [
//     { reference: 'Observation/e179cbdf-452c-4d39-81de-2f0f5a02e532' },
//     { reference: 'Observation/245dcb29-4b57-4d0b-a986-dda7965d363a' },
//     { reference: 'Observation/57a3667c-bd37-48b6-8da1-12234aa68430' },
//     { reference: 'Observation/6142d704-812c-4001-8619-286487fff686' },
//     { reference: 'Observation/986fe5d9-b528-412e-9dd4-dd3f3c4cb1e2' },
//     { reference: 'Observation/c0d42638-7582-4101-8018-ec04461405d7' },
//     { reference: 'Observation/564313fe-096a-4592-8f73-0ee7997f9f2c' },
//     { reference: 'Observation/56aee8b2-a94a-4ba0-a7c4-448c549cb1c0' }
//   ],
//   status: 'final',
//   subject: { reference: 'Patient/6610a609-9349-4a7b-9f1d-2f7fcb0db4c5' },
//   id: 'dff04b8f-a9fe-4d6a-ad2e-3e4be01927bc'
// };

const sampleRiskAssessment4: any = {
  occurrenceDateTime: '2024-05-06T21:13:06.875Z',
  prediction: [
    {
      probabilityDecimal: 17,
      outcome: {
        text: '10 Year Cardiovascular Disease Risk',
        coding: [
          {
            display: 'Cardiovascular disease 10Y risk [Likelihood] ACC-AHA Pooled Cohort by Goff 2013',
            code: '79423-0',
            system: 'https://loinc.org/'
          },
          {
            display: '10 Year Cardiovascular Disease Risk',
            code: '10-year-cardiovascular-disease-risk',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      probabilityDecimal: 12,
      outcome: {
        text: 'Framingham Score',
        coding: [
          {
            display: 'Hard coronary heart disease 10Y risk [#] Framingham.The Adult Treatment Panel III 2001',
            code: '66336-9',
            system: 'https://loinc.org/'
          },
          {
            display: 'Framingham Score',
            code: 'framingham-score',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      probabilityDecimal: 2.6830552461820667,
      outcome: {
        text: 'HbA1c',
        coding: [
          {
            display: 'Hemoglobin A1c/Hemoglobin.total in Blood',
            code: '4548-4',
            system: 'https://loinc.org/'
          },
          { display: 'HbA1c', code: 'hb-a1c', system: 'https://vitall.com/documentation' }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'Total Cholesterol',
        coding: [
          {
            display: 'Cholesterol [Mass/volume] in Serum or Plasma',
            code: '2093-3',
            system: 'https://loinc.org/'
          },
          {
            display: 'Total Cholesterol',
            code: 'total-cholesterol',
            system: 'https://vitall.com/documentation'
          }
        ]
      }
    },
    {
      outcome: {
        text: 'HDL Cholesterol',
        coding: [
          {
            display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma',
            code: '2085-9',
            system: 'https://loinc.org/'
          },
          { display: 'HDL Cholesterol', code: 'hdl-cholesterol', system: 'https://vitall.com/documentation' }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'LDL Cholesterol',
        coding: [
          {
            display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma',
            code: '2089-1',
            system: 'https://loinc.org/'
          },
          { display: 'LDL Cholesterol', code: 'ldl-cholesterol', system: 'https://vitall.com/documentation' }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'Triglycerides',
        coding: [
          {
            display: 'Cholesterol in Triglycerides [Mass/volume] in Serum or Plasma',
            code: '2571-8',
            system: 'https://loinc.org/'
          },
          { display: 'Triglycerides', code: 'triglycerides', system: 'https://vitall.com/documentation' }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      relativeRisk: 6.5195940837319055,
      outcome: {
        text: 'Lipid Accumulation Product',
        coding: [
          {
            display: 'Lipid Accumulation Product',
            code: 'lipid-accumulation-product',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      relativeRisk: 37.3,
      outcome: {
        text: 'Systemic Low-Grade Inflammation Index',
        coding: [
          {
            display: 'Systemic Low-Grade Inflammation Index',
            code: 'systemic-low-grade-inflammation-index',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      relativeRisk: 1.543303729805463,
      outcome: {
        text: 'Metabolic Health Risk',
        coding: [
          {
            display: 'Metabolic Health Risk',
            code: 'metabolic-health-risk',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'Arterial Stiffness',
        coding: [
          {
            display: 'Arterial Stiffness',
            code: 'arterial-stiffness',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Body Mass Index (BMI)',
        coding: [
          {
            display: 'Body Mass Index (BMI)',
            code: 'body-mass-index',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Body Fat Percentage',
        coding: [
          {
            display: 'Body Fat Percentage',
            code: 'body-fat-percentage',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'High',
              code: 'high',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'High'
        ]
      ]
    },
    {
      outcome: {
        text: 'Blood Pressure',
        coding: [
          { display: 'Blood Pressure', code: 'blood-pressure', system: 'https://vitall.com/documentation' },
          {
            display: 'Blood pressure panel with all children optional',
            code: '85354-9',
            system: 'http://loinc.org'
          }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Cardio Respiratory Fitness',
        coding: [
          {
            display: 'Cardio Respiratory Fitness',
            code: 'cardiorespiratory-fitness',
            system: 'https://vitall.com/documentation'
          },
          {
            display: 'Oxygen consumption (VO2)/Body weight [Volume Rate Content] --peak during exercise',
            code: '94122-9',
            system: 'http://loinc.org'
          }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Resting Heart Rate',
        coding: [
          {
            display: 'Resting Heart Rate',
            code: 'resting-heart-rate',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Visceral Adiposity Index (VAI)',
        coding: [
          {
            display: 'Visceral Adiposity Index (VAI)',
            code: 'visceral-adiposity-index',
            system: 'https://vitall.com/documentation'
          }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Waist Height Ratio',
        coding: [
          {
            display: 'Waist Height Ratio',
            code: 'body-waist-height',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [
            {
              display: 'Moderate',
              code: 'moderate',
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
            }
          ],
          'Moderate'
        ]
      ]
    },
    {
      outcome: {
        text: 'Waist Hip Ratio',
        coding: [
          { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
          { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
        ]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      relativeRisk: 1,
      outcome: {
        text: 'Anxiety',
        coding: [{ display: 'Anxiety score', code: '94024-7', system: 'http://loinc.org' }]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      relativeRisk: 0,
      outcome: {
        text: 'Depression',
        coding: [{ display: 'Depression score', code: '94022-1', system: 'http://loinc.org' }]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    }
  ],
  method: {
    text: 'Biometric Health Assessment (BHA)',
    coding: [
      {
        display: 'Biometric Health Assessment (BHA)',
        code: 'BHA',
        system: 'https://vitall.com/documentation'
      }
    ]
  },
  resourceType: 'RiskAssessment',
  meta: {
    lastUpdated: '2024-11-18T17:18:00.469Z',
    versionId: '1',
    tag: [{ display: '2024-11-18T17:18:00.469Z', code: 'originalLastUpdated' }]
  },
  basis: [
    { reference: 'Observation/6b3e8622-33d2-4598-ae2f-c9c812cd4096' },
    { reference: 'Observation/bdd9a733-a101-4bf6-a049-94cccedabea6' },
    { reference: 'Observation/949daa98-7e89-4c4c-8f8c-551cd8225a5c' },
    { reference: 'Observation/5c481b44-170b-4d3e-b9e5-ff7b64d0668e' },
    { reference: 'Observation/9cc140b4-d095-48d4-812b-1d811c3e0294' },
    { reference: 'Observation/45721128-675a-448c-81f3-47b43ef2ecc6' },
    { reference: 'Observation/1c8de8d6-6f05-4b60-b603-13011a240110' },
    { reference: 'Observation/a66a155a-0dfb-429b-a432-c382e65b3ea5' },
    { reference: 'Observation/72978ad4-f901-4f50-9ceb-76be28e3f802' }
  ],
  status: 'final',
  subject: { reference: 'Patient/91065b88-a8aa-4b75-aa82-54b8281da82b' },
  id: '40b50f2c-7942-4ad4-ac20-a1c2d6467a1c'
};

// const fixedRiskAssessment4: RiskAssessment = {
//   occurrenceDateTime: '2024-05-06T21:13:06.875Z',
//   prediction: [
//     {
//       probabilityDecimal: 17,
//       outcome: {
//         text: '10 Year Cardiovascular Disease Risk',
//         coding: [
//           {
//             display: 'Cardiovascular disease 10Y risk [Likelihood] ACC-AHA Pooled Cohort by Goff 2013',
//             code: '79423-0',
//             system: 'https://loinc.org/'
//           },
//           {
//             display: '10 Year Cardiovascular Disease Risk',
//             code: '10-year-cardiovascular-disease-risk',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: [
//           {
//             display: 'Moderate',
//             code: 'moderate',
//             system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//           }
//         ],
//         text: 'Moderate'
//       }
//     },
//     {
//       probabilityDecimal: 12,
//       outcome: {
//         text: 'Framingham Score',
//         coding: [
//           {
//             display: 'Hard coronary heart disease 10Y risk [#] Framingham.The Adult Treatment Panel III 2001',
//             code: '66336-9',
//             system: 'https://loinc.org/'
//           },
//           {
//             display: 'Framingham Score',
//             code: 'framingham-score',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       probabilityDecimal: 2.6830552461820667,
//       outcome: {
//         text: 'HbA1c',
//         coding: [
//           {
//             display: 'Hemoglobin A1c/Hemoglobin.total in Blood',
//             code: '4548-4',
//             system: 'https://loinc.org/'
//           },
//           { display: 'HbA1c', code: 'hb-a1c', system: 'https://vitall.com/documentation' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Total Cholesterol',
//         coding: [
//           {
//             display: 'Cholesterol [Mass/volume] in Serum or Plasma',
//             code: '2093-3',
//             system: 'https://loinc.org/'
//           },
//           {
//             display: 'Total Cholesterol',
//             code: 'total-cholesterol',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         display: 'Moderate',
//         code: 'moderate',
//         system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//       }
//     },
//     {
//       outcome: {
//         text: 'HDL Cholesterol',
//         coding: [
//           {
//             display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma',
//             code: '2085-9',
//             system: 'https://loinc.org/'
//           },
//           { display: 'HDL Cholesterol', code: 'hdl-cholesterol', system: 'https://vitall.com/documentation' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'LDL Cholesterol',
//         coding: [
//           {
//             display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma',
//             code: '2089-1',
//             system: 'https://loinc.org/'
//           },
//           { display: 'LDL Cholesterol', code: 'ldl-cholesterol', system: 'https://vitall.com/documentation' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Triglycerides',
//         coding: [
//           {
//             display: 'Cholesterol in Triglycerides [Mass/volume] in Serum or Plasma',
//             code: '2571-8',
//             system: 'https://loinc.org/'
//           },
//           { display: 'Triglycerides', code: 'triglycerides', system: 'https://vitall.com/documentation' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 6.5195940837319055,
//       outcome: {
//         text: 'Lipid Accumulation Product',
//         coding: [
//           {
//             display: 'Lipid Accumulation Product',
//             code: 'lipid-accumulation-product',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 37.3,
//       outcome: {
//         text: 'Systemic Low-Grade Inflammation Index',
//         coding: [
//           {
//             display: 'Systemic Low-Grade Inflammation Index',
//             code: 'systemic-low-grade-inflammation-index',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       relativeRisk: 1.543303729805463,
//       outcome: {
//         text: 'Metabolic Health Risk',
//         coding: [
//           {
//             display: 'Metabolic Health Risk',
//             code: 'metabolic-health-risk',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Arterial Stiffness',
//         coding: [
//           {
//             display: 'Arterial Stiffness',
//             code: 'arterial-stiffness',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Mass Index (BMI)',
//         coding: [
//           {
//             display: 'Body Mass Index (BMI)',
//             code: 'body-mass-index',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Fat Percentage',
//         coding: [
//           {
//             display: 'Body Fat Percentage',
//             code: 'body-fat-percentage',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'High',
//           code: 'high',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'High'
//       }
//     },
//     {
//       outcome: {
//         text: 'Blood Pressure',
//         coding: [
//           { display: 'Blood Pressure', code: 'blood-pressure', system: 'https://vitall.com/documentation' },
//           {
//             display: 'Blood pressure panel with all children optional',
//             code: '85354-9',
//             system: 'http://loinc.org'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Cardio Respiratory Fitness',
//         coding: [
//           {
//             display: 'Cardio Respiratory Fitness',
//             code: 'cardiorespiratory-fitness',
//             system: 'https://vitall.com/documentation'
//           },
//           {
//             display: 'Oxygen consumption (VO2)/Body weight [Volume Rate Content] --peak during exercise',
//             code: '94122-9',
//             system: 'http://loinc.org'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Resting Heart Rate',
//         coding: [
//           {
//             display: 'Resting Heart Rate',
//             code: 'resting-heart-rate',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Visceral Adiposity Index (VAI)',
//         coding: [
//           {
//             display: 'Visceral Adiposity Index (VAI)',
//             code: 'visceral-adiposity-index',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Height Ratio',
//         coding: [
//           {
//             display: 'Waist Height Ratio',
//             code: 'body-waist-height',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Hip Ratio',
//         coding: [
//           { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
//           { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 1,
//       outcome: {
//         text: 'Anxiety',
//         coding: [{ display: 'Anxiety score', code: '94024-7', system: 'http://loinc.org' }]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 0,
//       outcome: {
//         text: 'Depression',
//         coding: [{ display: 'Depression score', code: '94022-1', system: 'http://loinc.org' }]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     }
//   ],
//   method: {
//     text: 'Biometric Health Assessment (BHA)',
//     coding: [
//       {
//         display: 'Biometric Health Assessment (BHA)',
//         code: 'BHA',
//         system: 'https://vitall.com/documentation'
//       }
//     ]
//   },
//   resourceType: 'RiskAssessment',
//   meta: {
//     lastUpdated: '2024-11-18T17:18:00.469Z',
//     versionId: '1',
//     tag: [{ display: '2024-11-18T17:18:00.469Z', code: 'originalLastUpdated' }]
//   },
//   basis: [
//     { reference: 'Observation/6b3e8622-33d2-4598-ae2f-c9c812cd4096' },
//     { reference: 'Observation/bdd9a733-a101-4bf6-a049-94cccedabea6' },
//     { reference: 'Observation/949daa98-7e89-4c4c-8f8c-551cd8225a5c' },
//     { reference: 'Observation/5c481b44-170b-4d3e-b9e5-ff7b64d0668e' },
//     { reference: 'Observation/9cc140b4-d095-48d4-812b-1d811c3e0294' },
//     { reference: 'Observation/45721128-675a-448c-81f3-47b43ef2ecc6' },
//     { reference: 'Observation/1c8de8d6-6f05-4b60-b603-13011a240110' },
//     { reference: 'Observation/a66a155a-0dfb-429b-a432-c382e65b3ea5' },
//     { reference: 'Observation/72978ad4-f901-4f50-9ceb-76be28e3f802' }
//   ],
//   status: 'final',
//   subject: { reference: 'Patient/91065b88-a8aa-4b75-aa82-54b8281da82b' },
//   id: '40b50f2c-7942-4ad4-ac20-a1c2d6467a1c'
// };

const sampleRiskAssessment5: any = {
  occurrenceDateTime: '2024-04-06T21:13:06.875Z',
  prediction: [
    {
      outcome: {
        text: 'Arterial Stiffness',
        coding: [
          {
            display: 'Arterial Stiffness',
            code: 'arterial-stiffness',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
        ]
      }
    },
    {
      outcome: {
        text: 'Body Mass Index (BMI)',
        coding: [
          {
            display: 'Body Mass Index (BMI)',
            code: 'body-mass-index',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
        ]
      }
    },
    {
      outcome: {
        text: 'Body Fat Percentage',
        coding: [
          {
            display: 'Body Fat Percentage',
            code: 'body-fat-percentage',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
        ]
      }
    },
    {
      outcome: {
        text: 'Blood Pressure',
        coding: [
          { display: 'Blood Pressure', code: 'blood-pressure', system: 'https://vitall.com/documentation' },
          {
            display: 'Blood pressure panel with all children optional',
            code: '85354-9',
            system: 'http://loinc.org'
          }
        ]
      }
    },
    {
      outcome: {
        text: 'Resting Heart Rate',
        coding: [
          {
            display: 'Resting Heart Rate',
            code: 'resting-heart-rate',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
        ]
      }
    },
    {
      outcome: {
        text: 'Visceral Adiposity Index (VAI)',
        coding: [
          {
            display: 'Visceral Adiposity Index (VAI)',
            code: 'visceral-adiposity-index',
            system: 'https://vitall.com/documentation'
          }
        ]
      }
    },
    {
      outcome: {
        text: 'Waist Height Ratio',
        coding: [
          {
            display: 'Waist Height Ratio',
            code: 'body-waist-height',
            system: 'https://vitall.com/documentation'
          },
          { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
        ]
      }
    },
    {
      outcome: {
        text: 'Waist Hip Ratio',
        coding: [
          { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
          { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
        ]
      }
    },
    {
      probabilityDecimal: 17,
      outcome: { text: '10 Year Cardiovascular Disease Risk' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      probabilityDecimal: 12,
      outcome: { text: 'Framingham Score' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      relativeRisk: 1.303423614564736,
      outcome: { text: 'Visceral Adiposity Index' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      probabilityDecimal: 2.6830552461820667,
      outcome: { text: 'HbA1c' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: { text: 'HDL Cholesterol' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      outcome: { text: 'LDL Cholesterol' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: { text: 'Triglycerides' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      relativeRisk: 6.5195940837319055,
      outcome: { text: 'Lipid Accumulation Product' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      relativeRisk: 37.3,
      outcome: { text: 'Systemic Low-Grade Inflammation Index' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Moderate',
                code: 'moderate',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Moderate'
          ]
        ]
      ]
    },
    {
      relativeRisk: 1.543303729805463,
      outcome: { text: 'Metabolic Health Risk' },
      qualitativeRisk: [
        [
          ['coding', 'text'],
          [
            [
              {
                display: 'Low',
                code: 'low',
                system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
              }
            ],
            'Low'
          ]
        ]
      ]
    },
    {
      outcome: {
        text: 'Anxiety',
        coding: [{ display: 'Anxiety score', code: '94024-7', system: 'http://loinc.org' }]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    },
    {
      outcome: {
        text: 'Depression',
        coding: [{ display: 'Depression score', code: '94022-1', system: 'http://loinc.org' }]
      },
      qualitativeRisk: [
        ['coding', 'text'],
        [
          [{ display: 'Low', code: 'low', system: 'http://terminology.hl7.org/CodeSystem/risk-probability' }],
          'Low'
        ]
      ]
    }
  ],
  method: {
    text: 'Biometric Health Assessment (BHA)',
    coding: [
      {
        display: 'Biometric Health Assessment (BHA)',
        code: 'BHA',
        system: 'https://vitall.com/documentation'
      }
    ]
  },
  resourceType: 'RiskAssessment',
  meta: {
    lastUpdated: '2024-11-16T18:32:12.180Z',
    versionId: '1',
    tag: [{ display: '2024-11-16T18:32:12.180Z', code: 'originalLastUpdated' }]
  },
  basis: [
    { reference: 'Observation/5cc7c781-0bad-4cf1-ac20-41904f286ec8' },
    { reference: 'Observation/62f12d2f-a2f0-40c8-87c4-693055c92660' },
    { reference: 'Observation/fdc74978-f3f3-4d2b-a469-738ab83fcfc3' },
    { reference: 'Observation/23c3496e-2bea-42c6-89fa-ea7d42849adc' },
    { reference: 'Observation/e1e88236-8d3b-4e9f-9d0b-fa60ef3bc6c5' },
    { reference: 'Observation/f9756990-8dcd-46ff-b5fa-ec6766cf0fc1' },
    { reference: 'Observation/045292ec-1e4e-47c6-af94-6a38271570fe' },
    { reference: 'Observation/445fd31a-f6ea-4751-8717-411baa0ad87e' }
  ],
  status: 'final',
  subject: { reference: 'Patient/6610a609-9349-4a7b-9f1d-2f7fcb0db4c5' },
  id: '7675a97b-6820-4d21-b00f-f27b32e7da1a'
};

// const fixedRiskAssessment5: RiskAssessment = {
//   occurrenceDateTime: '2024-04-06T21:13:06.875Z',
//   prediction: [
//     {
//       outcome: {
//         text: 'Arterial Stiffness',
//         coding: [
//           {
//             display: 'Arterial Stiffness',
//             code: 'arterial-stiffness',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Pulse wave velocity', code: '77196-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         display: 'Moderate',
//         code: 'moderate',
//         system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Mass Index (BMI)',
//         coding: [
//           {
//             display: 'Body Mass Index (BMI)',
//             code: 'body-mass-index',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Body mass index (BMI) [Ratio]', code: '39156-5', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         display: 'Moderate',
//         code: 'moderate',
//         system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//       }
//     },
//     {
//       outcome: {
//         text: 'Body Fat Percentage',
//         coding: [
//           {
//             display: 'Body Fat Percentage',
//             code: 'body-fat-percentage',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Percentage of body fat Measured', code: '41982-0', system: 'https://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         display: 'Moderate',
//         code: 'moderate',
//         system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//       }
//     },
//     {
//       outcome: {
//         text: 'Blood Pressure',
//         coding: [
//           { display: 'Blood Pressure', code: 'blood-pressure', system: 'https://vitall.com/documentation' },
//           {
//             display: 'Blood pressure panel with all children optional',
//             code: '85354-9',
//             system: 'http://loinc.org'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         display: 'Moderate',
//         code: 'moderate',
//         system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//       }
//     },
//     {
//       outcome: {
//         text: 'Resting Heart Rate',
//         coding: [
//           {
//             display: 'Resting Heart Rate',
//             code: 'resting-heart-rate',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Heart rate--resting', code: '40443-4', system: 'http://loinc.org' }
//         ]
//       },
//       qualitativeRisk: {
//         display: 'Moderate',
//         code: 'moderate',
//         system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//       }
//     },
//     {
//       outcome: {
//         text: 'Visceral Adiposity Index (VAI)',
//         coding: [
//           {
//             display: 'Visceral Adiposity Index (VAI)',
//             code: 'visceral-adiposity-index',
//             system: 'https://vitall.com/documentation'
//           }
//         ]
//       },
//       qualitativeRisk: {
//         display: 'Moderate',
//         code: 'moderate',
//         system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Height Ratio',
//         coding: [
//           {
//             display: 'Waist Height Ratio',
//             code: 'body-waist-height',
//             system: 'https://vitall.com/documentation'
//           },
//           { display: 'Waist to height ratio', code: '1251557006', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         display: 'Moderate',
//         code: 'moderate',
//         system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//       }
//     },
//     {
//       outcome: {
//         text: 'Waist Hip Ratio',
//         coding: [
//           { display: 'Waist Hip Ratio', code: 'body-waist-hip', system: 'https://vitall.com/documentation' },
//           { display: 'Waist/hip ratio', code: '248367009', system: 'http://snomed.info/sct' }
//         ]
//       },
//       qualitativeRisk: {
//         display: 'Moderate',
//         code: 'moderate',
//         system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//       }
//     },
//     {
//       probabilityDecimal: 17,
//       outcome: { text: '10 Year Cardiovascular Disease Risk' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       probabilityDecimal: 12,
//       outcome: { text: 'Framingham Score' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       relativeRisk: 1.303423614564736,
//       outcome: { text: 'Visceral Adiposity Index' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       probabilityDecimal: 2.6830552461820667,
//       outcome: { text: 'HbA1c' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: { text: 'HDL Cholesterol' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       outcome: { text: 'LDL Cholesterol' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: { text: 'Triglycerides' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 6.5195940837319055,
//       outcome: { text: 'Lipid Accumulation Product' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       relativeRisk: 37.3,
//       outcome: { text: 'Systemic Low-Grade Inflammation Index' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Moderate',
//           code: 'moderate',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Moderate'
//       }
//     },
//     {
//       relativeRisk: 1.543303729805463,
//       outcome: { text: 'Metabolic Health Risk' },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Anxiety',
//         coding: [{ display: 'Anxiety score', code: '94024-7', system: 'http://loinc.org' }]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     },
//     {
//       outcome: {
//         text: 'Depression',
//         coding: [{ display: 'Depression score', code: '94022-1', system: 'http://loinc.org' }]
//       },
//       qualitativeRisk: {
//         coding: {
//           display: 'Low',
//           code: 'low',
//           system: 'http://terminology.hl7.org/CodeSystem/risk-probability'
//         },
//         text: 'Low'
//       }
//     }
//   ],
//   method: {
//     text: 'Biometric Health Assessment (BHA)',
//     coding: [
//       {
//         display: 'Biometric Health Assessment (BHA)',
//         code: 'BHA',
//         system: 'https://vitall.com/documentation'
//       }
//     ]
//   },
//   resourceType: 'RiskAssessment',
//   meta: {
//     lastUpdated: '2024-11-16T18:32:12.180Z',
//     versionId: '1',
//     tag: [{ display: '2024-11-16T18:32:12.180Z', code: 'originalLastUpdated' }]
//   },
//   basis: [
//     { reference: 'Observation/5cc7c781-0bad-4cf1-ac20-41904f286ec8' },
//     { reference: 'Observation/62f12d2f-a2f0-40c8-87c4-693055c92660' },
//     { reference: 'Observation/fdc74978-f3f3-4d2b-a469-738ab83fcfc3' },
//     { reference: 'Observation/23c3496e-2bea-42c6-89fa-ea7d42849adc' },
//     { reference: 'Observation/e1e88236-8d3b-4e9f-9d0b-fa60ef3bc6c5' },
//     { reference: 'Observation/f9756990-8dcd-46ff-b5fa-ec6766cf0fc1' },
//     { reference: 'Observation/045292ec-1e4e-47c6-af94-6a38271570fe' },
//     { reference: 'Observation/445fd31a-f6ea-4751-8717-411baa0ad87e' }
//   ],
//   status: 'final',
//   subject: { reference: 'Patient/6610a609-9349-4a7b-9f1d-2f7fcb0db4c5' },
//   id: '7675a97b-6820-4d21-b00f-f27b32e7da1a'
// };

const sampleObservation3: Observation = {
  effectiveDateTime: '2022-10-05',
  component: [
    {
      valueQuantity: { value: 141, code: 'diastolic', unit: 'mmHg' },
      code: { text: 'Diastolic', coding: [{ display: 'Diastolic', code: 'diastolic' }] }
    },
    {
      valueQuantity: { value: 101, code: 'systolic', unit: 'mmHg' },
      code: { text: 'Systolic', coding: [{ display: 'Systolic', code: 'systolic' }] }
    }
  ],
  category: [
    {
      text: 'Vital Signs',
      coding: [{ display: 'Vital Signs', code: 'vital-signs', system: 'https://vitall.com/documentation' }]
    }
  ],
  resourceType: 'Observation',
  meta: {
    lastUpdated: '2023-11-17T22:17:53.566Z',
    versionId: '6',
    tag: [{ display: '2023-11-17T22:17:53.566Z', code: 'originalLastUpdated' }]
  },
  code: {
    text: 'Blood Pressure',
    coding: [
      { display: 'Blood Pressure', code: 'blood-pressure', system: 'https://vitall.com/documentation' }
    ]
  },
  status: 'final',
  subject: { reference: 'Patient/6610a609-9349-4a7b-9f1d-2f7fcb0db4c5' },
  id: '959530c2-3fff-4e57-9809-07b91d18f5a1'
};

const sampleObservation2: Observation = {
  effectiveDateTime: '2024-09-19T15:32:47.000Z',
  issued: '2024-09-19T15:32:49.171Z',
  valueQuantity: { value: 0, code: 'irregular-heart-beat' },
  category: [{ coding: [{ code: 'scan-data', system: 'https://vitall.com/documentation' }] }],
  resourceType: 'Observation',
  meta: {
    lastUpdated: '2024-09-19T15:32:50.985Z',
    versionId: '1',
    tag: [{ display: '2024-09-19T15:32:50.985Z', code: 'originalLastUpdated' }]
  },
  device: { type: 'face', display: 'Face Scan' },
  code: {
    coding: [
      {
        display: 'Irregular Heart Rate',
        code: 'irregular-heart-beat',
        system: 'https://vitall.com/documentation'
      }
    ]
  },
  status: 'final',
  subject: { reference: 'Patient/7a9ca68d-cc21-4494-beb0-0e743b160f6e' },
  id: 'e5a00225-f7c2-4732-8c02-250511d99eaf'
};

const sampleObservation4: Observation = {
  effectiveDateTime: '2023-05-11T21:03:20Z',
  effectivePeriod: { end: '2023-05-11T21:03:20Z', start: '2023-05-11T21:03:20Z' },
  issued: '2023-05-11T21:06:04.062Z',
  component: [
    {
      valueQuantity: { value: 68, unit: 'mmHg' },
      code: { coding: [{ code: 'diastolic', system: 'https://vitall.com/documentation' }] }
    },
    {
      valueQuantity: { value: 119, unit: 'mmHg' },
      code: { coding: [{ code: 'systolic', system: 'https://vitall.com/documentation' }] }
    }
  ],
  resourceType: 'Observation',
  category: [
    {
      coding: [
        { code: 'validic-device-data', system: 'https://vitall.com/documentation' },
        { code: 'vital-signs', system: 'https://vitall.com/documentation' }
      ]
    }
  ],
  meta: {
    lastUpdated: '2023-11-17T22:17:54.239Z',
    versionId: '3',
    tag: [{ display: '2023-11-17T22:17:54.239Z', code: 'originalLastUpdated' }]
  },
  device: { display: 'withings' },
  code: {
    text: 'Blood Pressure',
    coding: [
      { display: 'Blood Pressure', code: 'blood-pressure', system: 'https://vitall.com/documentation' }
    ]
  },
  status: 'final',
  subject: { reference: 'Patient/01a9184a-29a8-41ea-91bd-3b6751747d7f' },
  id: 'fa41cfb2-e62d-4bc0-81d8-4ea279d930a7'
};

const sampleMedicationStatement: MedicationStatement = {
  resourceType: 'MedicationStatement',
  meta: {
    lastUpdated: '2023-06-22T18:53:46.268Z',
    versionId: '1',
    tag: [{ display: '2023-06-22T18:53:46.268Z', code: 'originalLastUpdated' }]
  },
  status: 'unknown',
  subject: { reference: 'Patient/91065b88-a8aa-4b75-aa82-54b8281da82b' },
  id: 'deb98de3-2902-4433-aa0b-e7f0b1d73f9a'
};

const sampleImmunization: Immunization = {
  patient: { reference: 'Patient/91065b88-a8aa-4b75-aa82-54b8281da82b' },
  resourceType: 'Immunization',
  meta: {
    lastUpdated: '2023-06-22T19:08:14.224Z',
    versionId: '1',
    tag: [{ display: '2023-06-22T19:08:14.224Z', code: 'originalLastUpdated' }]
  },
  vaccineCode: {
    text: 'Anthrax Vaccine',
    coding: [{ display: 'Anthrax Vaccine', code: '24', system: 'https://vitall.com/documentation' }]
  },
  extension: [
    {
      url: 'https://vitall.com/documentation/extensions/associated-records',
      valueReference: { reference: 'Appointment/347e5464-f4a7-4e93-a16a-0abd39b644b3' }
    }
  ],
  status: 'not-done',
  reasonCode: [
    {
      text: 'Standard',
      coding: [{ display: 'Standard', code: '429060002', system: 'http://snomed.info/sct' }]
    }
  ],
  id: '19bab1a2-b937-4405-aba4-72b45bbb5bd0'
};

const sampleEncounter: Encounter = {
  location: [
    {
      location: {
        reference: 'Location/42927ba8-8b54-4272-a167-5099db452386'
      }
    }
  ],
  type: [
    {
      coding: [
        {
          display: 'Emergency Visits',
          code: 'emergency'
        }
      ]
    }
  ],
  participant: [
    {
      type: [
        {
          text: 'Practitioner',
          coding: [
            {
              code: 'practitioner'
            }
          ]
        }
      ],
      individual: {
        display: 'Dr Test'
      }
    }
  ],
  resourceType: 'Encounter',
  meta: {
    lastUpdated: '2022-10-12T14:59:31.537Z',
    versionId: '1',
    tag: [
      {
        display: '2022-10-12T14:59:31.537Z',
        code: 'originalLastUpdated'
      }
    ]
  },
  period: {
    end: '2022-10-02',
    start: '2022-10-05'
  },
  class: {
    display: 'Emergency Visit',
    code: 'emergency'
  },
  status: 'planned',
  diagnosis: [
    {
      condition: {
        display: 'Diagnosis'
      }
    }
  ],
  subject: {
    reference: 'Patient/59b028f8-9417-4dc3-994b-b46ccea12cc5'
  },
  reasonCode: [
    {
      text: 'Visit'
    }
  ],
  id: 'e6a5af2a-fb3e-406e-8251-d8eb38977434'
};

const sampleConsent: Consent = {
  patient: { reference: 'Patient/81a51277-ae1e-41be-97af-ee49473c6e51' },
  category: [
    {
      text: 'Blood Products',
      coding: [
        { display: 'Blood Products', code: 'blood-products', system: 'https://vitall.com/documentation' }
      ]
    }
  ],
  resourceType: 'Consent',
  meta: {
    lastUpdated: '2022-09-14T19:44:30.495Z',
    versionId: '1',
    tag: [{ display: '2022-09-14T19:44:30.495Z', code: 'originalLastUpdated' }]
  },
  scope: {
    text: 'Advanced Care Directive',
    coding: [
      {
        display: 'Advanced Care Directive',
        code: 'adr',
        system: 'http://terminology.hl7.org/CodeSystem/consentscope'
      }
    ]
  },
  extension: [
    { valueString: 'Curator Entry', url: 'https://vitall.com/documentation/extensions/record-source' },
    {
      valueBoolean: true,
      url: 'https://vitall.com/documentation/extensions/legal-directives/blood-products/no-blood-products'
    }
  ],
  status: 'active',
  id: '7b12c75a-7248-41b7-bd1f-22bcfba6732f'
};

const sampleAppointment1: Appointment = {
  serviceType: [
    {
      text: 'Cardiothoracic Surgery',
      coding: [
        {
          display: 'Cardiothoracic Surgery',
          code: '215',
          system: 'http://terminology.hl7.org/CodeSystem/service-type'
        }
      ]
    }
  ],
  participant: [
    {
      type: [{ text: 'Patient', coding: [{ code: 'PAT', system: 'https://vitall.com/documentation' }] }],
      actor: { reference: 'Patient/ffe4654d-ef58-46ec-93d5-8b5cadba7567' },
      status: 'accepted'
    },
    {
      type: [
        { text: 'Practitioner', coding: [{ code: 'PPRF', system: 'https://vitall.com/documentation' }] }
      ],
      status: 'accepted'
    }
  ],
  resourceType: 'Appointment',
  meta: {
    lastUpdated: '2025-01-24T13:56:05.663Z',
    versionId: '1',
    tag: [{ display: '2025-01-24T13:56:05.663Z', code: 'originalLastUpdated' }]
  },
  extension: [
    { valueBoolean: false, url: 'https://vitall.com/documentation/extensions/appointments/show-time' },
    { url: 'https://vitall.com/documentation/extensions/appointments/show-time' }
  ],
  status: 'proposed',
  end: '2025-01-08T16:00:00.000Z',
  reasonCode: [{ text: 'Other test appointment' }],
  id: '0433826d-b542-48d5-87e0-5c3a73a97067'
};

const sampleTask: Task = {
  input: [
    {
      type: { coding: [{ display: 'Routine definition', code: 'routine-definition' }] },
      valueTiming: {
        repeat: {
          timeOfDay: ['14:15:00'],
          period: 1,
          boundsPeriod: { end: '2021-04-30T19:59:59+00:00', start: '2021-04-11T20:00:00+00:00' },
          duration: 15,
          periodUnit: 'd'
        }
      }
    }
  ],
  intent: 'plan',
  resourceType: 'Task',
  meta: {
    lastUpdated: '2022-09-14T19:43:25.349Z',
    versionId: '1',
    tag: [{ display: '2022-09-14T19:43:25.349Z', code: 'originalLastUpdated' }]
  },
  for: { reference: 'Patient/e4cc66e7-fcb6-4506-ba72-880da722c5b4' },
  code: {
    text: 'Physiotherapy exercises (Right Knee)',
    coding: [{ display: 'Physiotherapy exercises (Right Knee)' }]
  },
  extension: [
    { url: 'https://vitall.com/documentation/extensions/routines/recurrence-january' },
    { url: 'https://vitall.com/documentation/extensions/routines/recurrence-february' },
    { url: 'https://vitall.com/documentation/extensions/routines/recurrence-march' },
    { url: 'https://vitall.com/documentation/extensions/routines/recurrence-april' },
    { url: 'https://vitall.com/documentation/extensions/routines/recurrence-may' },
    { url: 'https://vitall.com/documentation/extensions/routines/recurrence-june' },
    { url: 'https://vitall.com/documentation/extensions/routines/recurrence-july' },
    { url: 'https://vitall.com/documentation/extensions/routines/recurrence-august' },
    { url: 'https://vitall.com/documentation/extensions/routines/recurrence-september' },
    { url: 'https://vitall.com/documentation/extensions/routines/recurrence-october' },
    { url: 'https://vitall.com/documentation/extensions/routines/recurrence-november' },
    { url: 'https://vitall.com/documentation/extensions/routines/recurrence-december' }
  ],
  status: 'accepted',
  id: '917bff7b-a684-40b2-ad25-0f29f03b8da7'
};

const errors: ErrorDefinition[] = [
  {
    resources: [
      '0433826d-b542-48d5-87e0-5c3a73a97067',
      '30339a03-3d5d-40ae-b984-f799ef73cbea',
      '718c749f-01f9-49ae-b3c8-dc7559dcb0cb',
      'c7374b66-5dcf-4979-9fcb-54bbc4eed328'
    ],
    resourceTypes: ['Appointment'],
    handler: fixApp2
  },
  {
    resources: [
      '917bff7b-a684-40b2-ad25-0f29f03b8da7',
      '49e17e4e-06e4-4bd7-bd32-332ad5f04bd4',
      'f1ca2556-4a58-4905-b1f2-5769fcc0ea99',
      'e85b483f-06fc-48d1-b2b0-4197295108af',
      '03eb68f2-3022-40e2-a970-9c44d92156a6',
      '9cfbf8ab-7eae-4287-b5f3-3f5a2aac5829',
      'a2ea7b39-6376-481c-9b89-c38c60543876',
      'da3925db-716a-4659-8bf6-fe753f3d291e',
      'c91d7b52-cab7-4eb0-b91d-fee022282105',
      '601e77c9-4b9d-45b9-8cac-4bda108867c9',
      '2b1ae660-73f0-40df-9907-6efb70155da6',
      '53a3b7e5-e6ee-4f8e-aaf7-2b20d58b5942',
      '929b6729-0512-4294-9bce-49b5810e8f53',
      '7996d913-cbed-40ac-b592-dbb447cbb3e5',
      'a6bd8738-1d93-4481-ac40-0d75263f343c',
      'f6b271cd-8de7-4091-82b6-9edea0cd0263',
      '30339a03-3d5d-40ae-b984-f799ef73cbea',
      'c7374b66-5dcf-4979-9fcb-54bbc4eed328',
      '3ac3cab9-9df5-415f-9b7a-093509a76766',
      '3ce607f8-d732-485d-a147-69297caf7285',
      '8ddab4ab-3ea5-472c-a595-29c27728bfbe',
      'ad8c3885-997d-4a6f-922d-11f2dcd4b601',
      'f54652da-2962-4f97-90ab-e79a2b24f1fd',
      '22e20683-037e-482f-a3de-258876fb7230',
      'a5c8c65d-5c23-4254-9f4c-a93da89be864'
    ],
    resourceTypes: ['Task', 'Encounter', 'Appointment', 'DiagnosticReport'],
    handler: fixExt1
  },
  {
    resources: [
      '7b12c75a-7248-41b7-bd1f-22bcfba6732f',
      '4f4620d1-75c5-4d84-bb83-32093361a9e0',
      '245c2bd2-4eae-4948-a352-0d7c921fe1bd',
      'e82c489e-28bd-45f8-a85c-e719218df393',
      '5026a2a9-a4bf-4182-bad6-3704b3f72489',
      '11820d47-9b7f-4b40-8633-4a3d32347914',
      'a45a9d77-b3f5-4ab0-9c59-752d081f309b',
      'f466874d-6172-4cd7-b556-24f5e6af2e32',
      'd817ec2c-6b9f-4b90-b53a-47300c93fca7',
      '35410590-b29d-4447-a8df-c38b4f4f985a',
      '5031241a-45f5-4b60-ac91-98b57da79989',
      '965e0079-18d7-4909-96df-afb95610b11a',
      '8a59ae4f-da8b-4fa3-acb9-259f8d979b33',
      'f953b419-6665-477c-b1df-f135c8cbb2b6',
      'e287ed26-61fb-4f7f-811d-013074774779',
      '2f0674fa-325a-4953-ab4c-eedc785e729b',
      '5b0ecb2a-15be-4094-80c5-72a00bc2e413',
      '423947bd-c259-448e-a73b-dc03c669f910',
      'cb96e425-29b2-48cd-adc9-267942a0f855',
      '68179c69-295f-4a9b-aac6-46295289b476',
      'a8d5dcf8-c312-4834-92cc-ae67c6d78207',
      '4406f131-7100-4f60-a2f9-f8b0b2407fc9',
      'f5641255-28b8-403b-957c-9b2bc1af72e4',
      '384bad17-c3ac-42d2-b383-f024a6ab06e1',
      '8a03d461-a52d-49e2-bcbd-a57c5e38a68b',
      '9b507bcd-3729-4783-9d5b-23f2c4ba4c3c',
      '048ac441-1d4d-4c8c-90ff-13e47a887e5f',
      'df386dd4-fec0-4e11-bcb9-f1368eee80c4',
      '546f4fb1-7359-42d3-8909-d6332c7f895a',
      '9c90387b-2aa8-4146-b59f-38e5cba6276a',
      '3100b59c-fc93-4d3b-bb5f-db585896fba6',
      '6a5ab834-c2ab-4f24-8175-cd1622bbddcd',
      '3daebfb9-fe5e-48b1-bce7-a213b3be3d50',
      'f9128ff1-177e-475d-b35a-66bd4790b46b',
      '01d93545-fdff-4ecb-b13c-9e4a6cec4202',
      '10ac6f1c-067a-43c2-ac31-6be7cd565c2f',
      'e76dadeb-31af-4674-82f6-811964dacf87',
      '68ef9094-7bba-4225-982b-ca43c1cb0bb2',
      'dd0fb973-45cc-4b13-b69e-1f0fd707989d',
      '792e347f-953f-4c6e-b8c6-c044569d179b',
      '8731d28f-5570-417e-b8d1-8b6b4679be71',
      '36a4d8c2-6e72-4e71-83c7-be44ff0550bc',
      'dc1062d5-970d-492f-aca0-793e8ed51cad',
      'd3443264-652b-43be-a3e3-3fe302185c89',
      '95b895ba-74f6-490d-98ce-1260634cd9ee',
      '94c5a280-a3e9-495c-bd35-6b9ee7beb3f7',
      '2139c26a-db74-4663-a4ac-4cecdc09cbc9',
      '9130be6a-2f93-4221-8ab4-9a98d5dc1d9a',
      '8e4239a9-cbe8-44ff-afeb-a82206dc25de',
      '49a4f68a-69aa-4051-87b3-f2346539ba6f',
      '92cf68f1-a5bf-4f7c-b01e-6fca8edf58a3',
      '99445cef-8d8e-4abd-9480-a858e55c06c1'
    ],
    resourceTypes: ['Consent'],
    handler: fixPpc1
  },
  { resources: ['e6a5af2a-fb3e-406e-8251-d8eb38977434'], resourceTypes: ['Encounter'], handler: fixPer1 },
  {
    resources: ['19bab1a2-b937-4405-aba4-72b45bbb5bd0', '94be1eb3-ebb1-43f8-acc3-6c6eeaa128c3'],
    resourceTypes: ['Immunization'],
    handler: fixImmOcc
  },
  {
    resources: [
      'fbc00702-8bbe-44fe-9f14-747ed4426c66',
      'fb1890ba-0eea-488e-8a5d-e7159d853749',
      'c592e9bc-ebbc-413e-95e7-80d477726489',
      'e3a0976d-d8a0-4746-9feb-4db8a1fe0f9b',
      'ba3fd9d7-7733-4402-9e4d-141af720094a',
      '608ed327-ffed-4b4a-b558-06c3c0f9bfae',
      '707d9c85-48e9-40d4-b050-2d4b781cea57',
      '5495247a-85b4-4429-ba21-546fd2a43142',
      '129debef-899e-46d8-9446-5a88edef920a',
      'be0e8b94-c746-480e-91d5-5f1de9e7d128',
      '5308fa8d-06fd-4528-a9b6-d8deb9403235',
      '3d497288-767f-4b34-9d0e-c1f15f04687d',
      '8b270d1d-f7ae-4435-98cf-08c03e59c631',
      'ad406d54-1b51-497e-b096-095693e17a17',
      '91f71432-0733-4bd9-b37a-e54101563b69',
      '7d0a53b5-99a3-4feb-9975-68e227975824',
      'a12bb148-6d69-4657-9a2a-563a0b6ff506',
      'c97b76f7-72c1-421d-aaa4-c5e055b243c1',
      '519b317e-92aa-41be-897a-c2edf623ebe2',
      'c269ec7e-ca23-46e8-9c6b-5763babfaa53',
      'c2a8f482-e079-4563-8fb3-e6720366c9d8',
      'eec2bcc3-5cf7-4cea-ab80-720fb8ad6b3c',
      'ab68c17c-e96b-46bc-874f-7cce4802ded3',
      '818378f8-b9d5-4504-8408-a9c3118c58ce',
      'da0cf13e-4bf1-43de-9f98-ffa4d7fcde97',
      '108663ae-c954-42b5-b44c-944051dc4619',
      '2dee8821-19ff-41f7-a53f-23fb3daf4256',
      '5ba6d41e-1d90-4590-b6f9-bc8b30d47d1e',
      '7de87879-585b-43ce-a071-3ec0039b8450',
      '3cb5b929-228a-46d6-afa3-3a9778564dbf',
      'e10098af-db51-4fec-9ff0-de85b924f616',
      '61cb993b-7e89-4927-b9c5-2cfe8162e579',
      '435c488f-5c50-4b52-b08b-bfe1ec3ca1a7',
      '9faf3f85-5e95-4126-975a-91dac70a4a62',
      'e6e879a2-fde8-4182-b366-adf900118def',
      '5d434498-cf79-405c-91ed-5d11542a85ab',
      '57d4f59e-6930-4a9b-ba59-2f4c4e69d587',
      'ac23da87-1394-4968-85f6-07deda38a853',
      'b04740e5-980b-4a3c-b073-3bf00988f196',
      'a15838d2-07c0-4cd2-b4b5-e52e075b7b01',
      'e750ba39-0404-4a08-aad5-228e6edc9e58',
      'a061b018-cd78-4482-b885-087194e945b6',
      'bbaf2e58-e297-47ac-922c-245a601e09e2',
      '2f195a0d-966c-40b7-8b0a-280395d67c48',
      'f7de51a4-64f3-4c1b-a881-e23d32fecc79',
      '28d361e4-55c5-446e-9b15-ed3c52e4ee83',
      'e7115490-4a8d-4c31-9f6e-a3ea4d8fadc5',
      '07b76d55-37ef-4f0f-a55c-bc8422aecdbc',
      'c5a7abd5-9b3e-4783-a0a3-0d888fd9ff66',
      'c2c3fe16-8021-44ea-8c44-558d9a4f84a2',
      '0cb84d46-8434-4067-90b1-21151c88c771',
      'bd8fe398-2ce5-40c8-add7-7bb4fc1b350f',
      '4dd5db6a-561c-4d8f-85a1-b7bc41f99d22',
      '186a1ab5-e5e6-4287-822b-760c39486dc4',
      'e33e5318-3e24-4894-a7e5-6d674ea04335',
      '169a78ad-62a7-45a4-9015-3b1f1a03037d',
      '571b831b-5d38-463c-95cd-fe5ffac5c5bf',
      'e50627b6-da3f-4d44-9017-63170fc18136',
      '608ef347-3fcd-40ea-9227-d856694c6939',
      'bf8f9097-3975-4f3e-beba-f7dd6b2cb507',
      '4ddec2f2-56bc-426f-862d-abfdaefea935',
      '17c15844-9a84-4eed-82a9-8c747d241a31',
      '9bf88075-d378-40bc-9d38-e0bc4bee9674',
      '247a4c39-554e-4719-9cd3-b7360afedbfc',
      '06a20190-32af-42e6-bddc-872317864979',
      'e823a26c-9f4b-4626-9331-a792bb47161b',
      '19b07fb2-a998-497f-96be-b8c47b38c0b1',
      'd9aab3ca-ff9a-4840-a57f-d5322c6fa1db',
      'b729ccd1-2e9e-41da-b89f-bfcb4be42c5d',
      '6969a926-4392-4b95-ae7a-7a6d6835084a',
      'a1ce5d4c-f135-4a1a-9c4f-8c9d00089ee4',
      '79bf197b-4172-46a1-971c-094bb2b059e6',
      'd394b97c-9522-431e-af89-51dee9601b68',
      '226e0e03-d28e-4378-a3e7-d5bc853a529f',
      '7eb17cd4-aee4-458f-a44a-49fe61966f24',
      '9eced9db-88a9-49e8-b9a9-f067a079c7b8',
      '9acd3913-9e31-4c03-934f-6e0188c554ca',
      'fd92aca2-963f-4c55-899c-cee5e577dc46',
      '45327e59-8194-40ed-9755-527f2ab9d25f',
      '9f774e84-9d96-478d-be1a-c466cb4d03a6',
      '3a46f8ba-7540-473b-9af8-3b838fc53a79',
      'a79ca5c7-b3ca-4ac4-8871-b8e52577b817',
      'abf2edfc-bb2c-48de-ba1c-81960defbfcf',
      '0961a4be-1a05-4b7c-aa9f-b4718fe308ac',
      '9832d545-2832-4243-8c09-281c283a922a',
      'fdf2a73d-5521-466e-96cb-ce94bcbf5294',
      'abae80bd-2a3e-4dea-b7ce-3ab727d0709c',
      '4d5098f1-2719-4bde-8a6b-1cf1f89ba19e',
      '32f18d04-c892-41cc-a55d-c5866894e497',
      '3fcefb0f-df37-4bdf-a318-293069d4f8c6',
      '567fc0bf-5d3a-42ae-bad8-c2596d878549',
      'eec5917f-e453-4af0-b2d7-67e8a590818b',
      'b47913e4-9575-4ffa-ad35-091dc42372f4',
      '73645cc0-2736-47e4-a4a3-82e380a9d2da',
      '0138f786-2837-49cb-a343-6bc14d8ae30e',
      '70dc0b68-688b-4d8e-8b23-7294255d8aa4',
      '2a0264a1-3cb4-48b3-afd8-6322e70bcc4c',
      '896b4610-2638-4793-91ce-f5de3566a8e0',
      '36edcd18-5291-41b6-a6bb-1155a97528f5',
      'df16e979-d28f-48ee-83bc-ee19c21e2ad8',
      'da3d58e3-94e0-4209-b3d7-55abed3e269a',
      'f10a319d-3b75-40ff-92bb-1ac506a9febe',
      '2b8ceff9-f4c6-46ce-8496-90487946d192',
      'd6c003d2-738e-4057-ad17-46e1d3c7c6a2',
      '61732be9-82c6-4ecc-8d95-ca1582d70e1b',
      '172b2674-d92d-4343-8df3-08c7fbdefd56',
      'e66a8527-48f1-4b2f-88e6-f5fa59ed0754',
      '5b341c46-0288-4b2e-92b3-1919f93991cd',
      '50494a6e-025f-4f53-a53f-8df08d4a2608',
      '7f568bd9-8860-4713-8a47-8fe081d9702a',
      '15ee1af6-c9a4-4c64-9f2e-7d850df31e8e',
      '154395f8-d536-4bed-84e9-e646f1d125f7',
      'de77b266-fe96-4e69-bb17-700e35283764',
      'ae6b6915-7c39-4175-86da-0685efd4136a',
      '0bdd2c92-d719-48d7-8cac-da95f2347cf5',
      '8191b5d9-55b6-47ec-b3b5-764712b76ad3',
      '650cc800-58ef-4fe6-bb70-f7ed0cdf74b2',
      '62384291-416a-4b05-b498-5c5eab4679a1',
      '57984229-729d-4bb7-bea5-3d973684afb7',
      '3e2e9af1-a856-4317-b950-768fc4e6145d',
      '9a00e611-cd38-446d-9c1a-e2e207a1453a',
      'eeacf675-3564-4167-9c15-839c9bfb5715',
      '7a881474-7a86-492f-8d8a-6ba71977bf1b',
      '8d0e05c2-2f85-4ed3-bea4-c6b01fbf2eaa',
      'f55fb9f8-f113-47ba-8495-8b0ad1003fba',
      '0c89a704-2487-424e-8675-681907c3eec5',
      '093600c0-0a30-42ba-9960-00ef2faf0471',
      '86b550e0-59c6-4434-a126-b11149b7f917',
      '329acb5c-162f-4022-9a3c-085aa9192c99',
      '8910831b-3207-470d-bd87-dfba94f641c5',
      '49378641-8a57-4c45-b4bd-60475581f52c',
      '2b9f57da-8294-427d-9975-68767ea025e7',
      'c936bc59-94a1-4a0d-8b5b-9d7118b2de20',
      '36ad6834-0bb2-41e1-96e6-33a182258243',
      'cbf82e9b-7af6-4aa5-8a43-e65f3ef1f9b7',
      'b65c86b8-abcf-44c1-9b97-1813071013a2',
      '91647b45-a36d-4881-ba72-4ab685954aa8',
      'e1d70d5c-ef80-4a24-b882-b46d714f0429',
      '938ec178-1079-4ae8-9916-8f920e6040bc',
      'c29bfca5-af21-484b-9427-4794d26eaf3a',
      'ed2783ba-d728-44ac-bf89-8449a3abb847',
      'fa0f7cc8-077a-4293-972b-1398eb0fef3a',
      'da0980e4-43fc-4071-9b23-6453df1a1b04',
      '70eff9c9-767c-4f6a-a980-9007ba5cefaf',
      'd61ad780-5b7c-4470-b07e-69d983055210',
      'a0f55ea1-f093-4c91-8d31-44ef1dbdd3e1',
      '8fa81e3f-d0ef-4e10-b55d-4428c12755f4',
      '4480aa98-b6fb-41ff-b379-0e6e19c8ede8',
      '6c148dbf-10ca-46b6-9533-81eee696c2d7',
      '138cb40a-0ae4-4e15-8d63-2cf1942fd5ab',
      '9444c691-4d1b-4e27-a928-1e172d38a9aa',
      '00186cd5-b519-4a92-ab05-965f8c1968e6',
      '4655bae3-e7ac-457a-aef0-259b5df4afd4',
      '6b324bea-d79f-44bf-815e-3df2b32bbdf2',
      '4b8d4d42-d551-4749-942b-731e9c4b6eed',
      '3b5f833c-cb75-441e-b859-6ce73f40dbb2',
      'b77c57d9-c202-4d16-9f63-4bed4d122fce',
      'c560dbbf-dec8-4d7c-b12b-315efdc2aef0',
      'd426d130-4d06-4e2c-a30e-b29be64a21cb',
      '1aba583c-c969-4f32-8b5f-e8a24774684a',
      '89b82856-88ba-4245-a913-802cad243fe8',
      '78da0505-4098-402d-a49b-c62d3ad4945d',
      '019f4ddc-a3fa-4111-a0c0-82210a405864',
      '7b00a87c-10db-430f-8f15-02def1d5d66a',
      '117eb403-46ab-44cd-b30e-f19639991c3f',
      'fabb1ec2-37d7-4fe4-aefc-76914308f491',
      'e3cfeaab-ee4f-4e27-b106-928618922a7f',
      'e1cb772d-c944-48e0-8602-717c7c608e3e',
      '3163b153-d543-4082-9109-dab40d107b45',
      '257c1875-00e2-4778-9898-b22f6696b18b',
      'a5cdbeaa-f6fd-4bba-9ca2-9da8a0c010fc',
      '6aec7cdc-35ba-4c63-a72c-d8e2db30b2cd',
      'c7d50f9a-0fdf-44c2-b9d4-bf1e0953bbe4',
      '66a1e439-c6dc-4702-bb26-77a0bcc32115',
      'c7c90098-9106-4eb2-a49a-7a1b7e742e8e',
      'c15c816c-e8e6-4af6-b987-1f4ff10d70ce',
      '9676682b-cdec-4c3f-9cd9-7a1bf09dd8e5',
      '03dbdde1-6f79-416a-b3e3-5d4df6ea7767',
      '23ac81f3-4490-4d0f-ba76-d93072a9d396',
      '07295dc6-2224-4a01-be9e-b81cc1432584',
      '25e509a4-b4ee-4350-b130-b42933118f99',
      '03c493dc-8779-4624-8a0d-56a334e0762c',
      'ae2cc8fb-8978-4348-b158-659850fd9f2a',
      '0afceab9-f461-4aa2-b62f-ece9d8c5c795',
      '75292327-94bc-4d2f-b211-0f03d6246ba4',
      '019159fc-29d1-4191-b87c-2d5495aa7332',
      '2009e64f-21c3-4c54-8736-48d27c2beb81',
      '7b117a56-9bb0-48d1-84eb-7d48693a8b04',
      'b4acb9c1-3e89-4b74-aae6-4bebafeb4a80',
      'd2f741fc-5ed0-49c6-a0d0-a0c3c6e76adf',
      '90eef63d-181a-4504-8dad-42dc508bbe88',
      '062ad60d-32cb-4b5c-a3f4-c9f9600a6154',
      '1d184ec4-1e77-4472-8d7b-1a99bd50ae75',
      '7051fad8-77bc-4515-a30e-85b4c60a5a7a',
      '8bf1af0d-b4ed-4791-8403-258f651154e6',
      'd159927e-c8c2-48b4-83f4-75c0f4cb8924',
      '7ff83e65-4257-4663-b10e-1c4a21b01c11',
      '07e7f72f-ca84-4c74-9574-b54d9a03059a',
      '3f407f25-641c-483c-a1a6-c527e1a587cc',
      '1cc9fb01-bdee-4b01-a9e8-4fd5bf200d6c',
      '0840aa82-bccc-4f41-8626-05b155ec412a',
      '230476c8-e003-48fa-9003-ca167d4bd627',
      'ddd428b8-8602-4363-9f18-1a0252f06373',
      '45c78efb-afac-4dfe-ab9e-eef0e0a978c0',
      '15625d2e-f707-4877-8e9c-1b7628123caf',
      'dbe13af6-29a2-4a8d-a959-6a2be4eb60c1',
      'e6bad805-4945-4d49-9d5c-7d659369a355',
      '85d28e95-5721-4d86-afbd-b932adc6aa28',
      'f89dc00b-7f46-418f-ab31-5b8f6c38cb34',
      '763f5cc7-ed26-4dba-a94a-9b17eaa52d1c',
      'af8898ce-00fb-4b9c-8c5b-7a62a4c8e508',
      '1b51139b-ad2f-4746-ad44-481247291a3c',
      '041a61eb-256a-482b-a0bb-c99d6718a5e1',
      '0b7f57eb-7b96-4f7b-a1be-0b1368c31a17',
      'fd4c8f96-d623-4968-a430-1d8ccde5177d',
      '49830211-5015-4ea3-a937-a857af4536bf',
      'e2c402d5-8ea6-46b0-95c5-bf02157125ce',
      'fc63b3d0-b23f-4745-9d06-adfa8046da0c',
      '27d73dd3-8c96-47e3-a99d-d345f7f96242',
      '874bbe4f-f7cd-4941-ba66-6090542ae607',
      '23d98b20-382c-432f-ac4b-5f934724d830',
      '45b7524a-ec6b-4831-b40a-d5cfa3a45bf5',
      '5e951c03-443c-4726-80e5-d997707153c7',
      '40b1ae2e-8b6c-4058-b02b-2d9c04e10d0c',
      'ba320ff2-31de-444f-b38b-3fa9a001fcdf',
      '08703168-bf04-45cb-adc2-c7b45c3b3bed',
      '6653ae8a-1432-4228-8814-7214c48be24e',
      'f411c0c3-1872-479c-85da-bb450cfa052f',
      '05ff63f3-e2cd-4ec9-8c66-b0b4b246acdc',
      'b189eaa2-0daf-45e6-bcb0-f77a1830ed64',
      'ac39a46d-e2f4-4730-b7fd-048c10e46ff6',
      '107eb288-6d3c-4cdc-9559-d79e94ff4e42',
      '5f950d3b-2ea5-41f9-b307-96157c0bd0c9',
      '3fd25fd3-686c-4026-a51d-c5e56fc76081',
      '2841d0c3-9727-4313-8cb5-e3dabee2d260',
      'abee826f-015b-45ca-a4c6-dd3549f97bf2',
      '6c3baf93-2451-4313-b162-7c01052268d7',
      'fd0b3612-19e9-4960-8c49-b3b7d5e61328',
      '78e35abb-ba1d-4c7f-b055-03bb0b4150ab',
      '3f7c5713-7d1a-4c7f-8989-06939753c364',
      'd30e118e-cd9f-4c9f-8a5c-4c3f122c8c6b',
      '974ced4f-11b1-4b17-9cd3-eb9e528d9f21',
      'cff8eb76-2504-4835-be71-b6e488efadd3',
      'd6925359-e430-4cf8-90fa-173c94cd5f24',
      '94d0c5e9-a553-4883-a13d-af9f781ea13c',
      '6467a77f-21c2-4336-b896-9b63a3d4cd7c',
      'bc00b644-2559-4041-8553-79746db0daf6',
      '82b1ae4e-4e2a-458c-a1a8-e9a2a2b54aa9',
      '88c2eab7-f09d-4845-9a78-078b6a5fd56f',
      '0060660a-0a90-43eb-a026-623f0886de32',
      '961de594-53d7-4050-9401-e6d24974282f',
      '422eedda-8408-4127-b96b-7f9cd6cc9158',
      '2fcc4345-aace-4cb3-95e0-d381d96464fd',
      'e93adda2-77db-4a47-8819-44f8c6127187',
      '2c9a1d10-1ce5-4c85-b33a-994ae6395d36',
      '535379bb-3034-4fbc-b61a-26e2feafaf0b',
      '56f717b7-1188-4b38-a95f-227f4daa7c6d',
      '4338ca9d-f96b-4326-9714-cde92399cf8f',
      'aceddab6-9860-4851-81f7-65402b73eb41',
      'dd5e8f8c-75ee-41ba-aa0f-4c8f3e9ffe78',
      '851c3087-8219-475d-85d6-f5fcb9c516b9',
      '3aa81af3-80ad-41d0-b1d5-27e022cf5234',
      '440cac01-dc9c-493f-8eed-024903483e86',
      'be319ead-b564-4eb2-8c38-6e7b0a105345',
      '781a73c4-11a7-44fe-a23a-a15320ef0078',
      'b6c99d5e-494e-4fbc-9300-9b970fda03e7',
      '9cbdaf15-2bcc-4e69-b417-d5ca26f127ca',
      'fba79843-1e18-4f48-88df-89c4852e1379',
      '3c1fc4a4-0ee2-47df-b348-08b1c775a13c',
      '616974e1-fe69-4184-a288-a1282ef9b6c1',
      'f26eab6d-e626-481c-a171-ca604358b7d1',
      '3da52e1e-6412-430e-bb3f-84972d2506ef',
      '2bc381ca-5280-431d-89b7-684f6f4543ba',
      'b5e1a7c7-a996-45c2-bd9f-f5ebfe8503e8',
      '549c1319-b022-4886-b60f-c9e3f1b0f72e',
      'c0efab77-669d-4356-b9bb-67c79c7326a8',
      '0c5acd06-6d79-4130-a836-67e8498c39cf',
      'eb96d2ab-964c-4281-ba47-602f58fc0cc8',
      'f22f0aa7-9870-4557-92f0-cbbff962301c',
      'bcc3e980-a553-44bc-9730-d216a6b4dfd1',
      'f49873cd-6c65-4d04-b6d9-5684991d03ce',
      '2dd2feb8-7daf-4dbb-91c5-0b47675f4d5b',
      '37ca1057-7353-4cfd-8986-8a673dca6532',
      'fb9a6fe1-3930-46d6-8e39-5b5732349321',
      'ec97f0c9-8e7d-41a9-8a8d-0f26bf15325f',
      '6a87ad65-f030-4aa3-b8d9-8ea539ef4aea',
      'c339b013-7e86-406d-9810-3263fa96883f',
      '62a120e0-3ac1-42c8-82bd-cbfb06e1c41d',
      '89a837fd-f1bb-446e-8c70-c4d75ccb07fd',
      '08d079f1-f2d9-4b16-900b-edd1ed15f7bc',
      'df7c5f05-b97e-4ad2-97ad-e227abafc9f1',
      '9cf142ed-4141-4d8f-b84b-a5d5af13cd5b',
      '6372dd24-e130-4d31-96c8-5b0011d36bfa',
      'cf82c0de-ef21-4d3f-95be-f34829a462fc',
      '2873874a-08ce-4986-b69a-0d80a1da3220',
      'fe840d28-f95a-4e5b-ae16-9d67cd1203d4',
      'c390bcce-5e8a-47e1-a370-8238fd16e5ef',
      '02d2ea7c-b006-4d98-b31c-685931d36ce3',
      'b6e40307-cd1f-468e-acac-3096b1396baa',
      '94731db3-2c57-4ff2-92bd-f0a557471a9f',
      '740d9c7e-1459-43a3-9a85-06f621bd2e08',
      '5a479fb6-5fe4-4517-9897-363e3fc9484b',
      'a54b4f11-63a2-4d47-8400-b55f92b82ecf',
      '7ec18e86-f580-483c-b9fa-af34ff6719bc',
      '4ec4001f-0397-4dd6-82a9-4c6507cbcfec',
      '5e93a5af-c59f-40a6-ac45-c162c89589cf',
      '689f30b6-5d45-428e-b471-4dee74e44097',
      '0017aa52-4715-4eb9-93fc-6b000f6ca432',
      'bf34dbff-dbd4-4536-9043-226c6e1929a5',
      '564c2ad5-07c3-47de-8332-53c2d781bd7e',
      'd97cbfb2-9113-4d46-a59a-8b24d964afdc',
      '0633eee7-441f-42c4-a639-d636711a0d2c',
      '3fc4ea86-a47f-4a10-9b0f-a182f373b334',
      '6cb2d5c7-64b3-4c21-af85-ae5268b74c86',
      '7ed73ef1-aefc-41e8-8729-eb87daa5c986',
      '76a21329-1296-4857-90b0-93a28ced0b67',
      '662e150e-b118-4c75-8f33-fd8939d35f82',
      'd2c21e20-36de-4df4-b03b-adf603533585',
      '935adaf4-3163-4001-9758-fdd7df4319b3',
      '6f943356-8642-4e82-92f1-02bd382ee4c7',
      '2a589c1a-b7d3-46e4-9314-830f162700b5',
      '936b7854-9198-44ca-8c46-701d77b6e232',
      '63035ae6-b795-40b8-880e-076757b98f8d',
      '780656d1-f7ad-40dc-b876-8fb3d473188e',
      '20903bb8-2c37-465b-9159-f986bcdd934a',
      'a34654e4-748a-4275-be17-2e61c9b28f0a',
      '6e50b0db-c83a-46ff-b609-54a631c51fe8',
      '779481d3-8d18-48ce-bb85-8106162c792c',
      'cf44ee4f-f78c-49ac-8fe4-213f52b32593',
      'b9400624-ef73-47bb-8836-fbd17970e8fd',
      '78c09b56-22c5-4565-9264-a2717e4247d5',
      '1cc7a81b-abaa-4248-9077-003e10276c38',
      '11eea3ea-5ed1-47ac-91a1-2f8afeb88666',
      'cadf830f-39ea-46d3-b520-e92416105964',
      '83fc92e5-b7be-47f3-b594-1a338d84d8d1',
      '749b2fa7-a6fd-4810-b6fc-a4c661ee7c22',
      'b413273c-8af5-4732-849a-0a1f5459b107',
      '6ecdf51f-8d85-41d0-b03c-e60527fd99f6',
      '7a0bc5ee-bd6f-4d23-8e37-d0cc77c42ba0',
      'd96e6eee-1724-4d87-a9c2-be9ce001ced9',
      '434bf1ab-23a4-475f-8991-ba4211c7be1e',
      '1b18da5e-fe52-4d2d-a34b-d4fc0abf44de',
      '13b44866-c613-4728-b50e-831eb0e9bcbb',
      '4638f3bf-6f98-4031-b664-50bd2bea77c0',
      'e9bba058-3caf-4f09-bb17-fdd782421097',
      'c5159ea6-0437-47fa-9448-a5ff695eb4cf',
      'd14f7105-1f81-472e-9ccc-0e0166a463dc',
      'f639d2a8-7e3d-4938-bb4f-fce3351ee8ec',
      'a4bed32b-b32c-44d3-b1bf-47738e56dad1',
      'b0991ca0-3a22-44f8-8845-6ae6d907ca73',
      '3ae08f73-685c-4e34-b72c-d1b6a0306f75',
      '4e70c2b1-0d2b-4bc0-aa5f-846a5378dba5',
      'fdaf0121-894e-4a8b-a4a4-d95188a88910',
      '51b02385-1975-4ca0-9568-bb2c0e067646',
      'a86f652a-148e-4efb-ab89-278d67de899b',
      'b1bb9be0-8489-44f6-aa3f-5c0bce8ba00a',
      '3ee59e4b-f0ad-44fb-bf4d-49348b7daa67',
      '6fbb9685-945e-49bf-b0bb-8c1f4f6b24a4',
      'c0530a6e-595f-4b8d-8293-978f8b5ea416',
      '44df1ded-34ee-4ec0-befd-e056cec35b4a',
      '589859ab-00db-4d96-8199-82c4e5e12153',
      '4ac0fe8f-6356-4384-a3e9-2057f283a327',
      'ed1df00f-a0ce-41bd-be1e-e3d3f8ceabad',
      '117dffeb-3b08-40e9-b4f4-ddbc18ac6e70',
      '0f14e797-6673-4c65-81de-92bdfe945c50',
      'bf570467-a4be-4267-8101-d33ae42c9c03',
      '3c1f6380-01bd-4a2e-9992-ae79c95a70c1',
      '2dcec2f4-f79d-4e7b-8930-4d97a4446d6c',
      'edfa3f0d-585b-4166-b7b9-1f36c4a02df0',
      'b43b8e3d-b7c0-470a-a8a1-07bcac2ca66e',
      '03320aa6-15eb-4de9-b08c-c90b6d569f05',
      '9b7d289f-8c0e-46cf-90a3-0d1e1b01aaac',
      'eeee5f83-f08b-4c2a-9dd3-fd183a94395b',
      '16944d3a-831b-436e-ad86-358d99eed0f7',
      '9f5fa65a-5059-4474-97c8-fb12f2eee700',
      '8db89952-298c-4e72-979d-cf7fba2fe0bb',
      '02bc6f27-ea29-4c19-a17f-7e34d854f538',
      '5fc6f28c-19a1-4517-9877-ba2d799c7d19',
      '881e6c94-f8bd-4d08-84f2-274f71d752db',
      '31337ba4-616f-4895-90c1-09d58a183878',
      '65aec09e-8376-46ee-a63b-6e5223dcd1f0',
      'd0de1c25-0215-467f-8513-3d1f821e9ac7',
      '626d028b-e674-44c2-8bbf-c8c94e20675a',
      '196488c9-dd2a-4b54-ba2f-ceeb3f140c1a',
      '26bde9de-7bc4-47e5-8b77-37c5db990c5b',
      '1eb13d3e-7ab6-4e99-a75d-e04aacf9e705',
      '7fb3c723-e587-40cb-8f40-03e8b447412a',
      '274d8c2e-1495-4919-80c2-54f1000b6383',
      '2335140b-36c3-4991-8272-fa51c4b4601c',
      '8312ae8a-6d5c-4cf3-9a97-bf8ded590406',
      '98603586-4099-44f7-af6d-e90123fb8820',
      '58b502d6-497c-4c2f-88a4-2cf1cc193af5',
      '74d9ff13-4f12-45ef-939b-d720099ad6d6',
      '12518ef2-e72a-47be-90d2-9350c8bbbdb4',
      '91b7b8a8-3533-4c61-bf39-2b7a482869b9',
      'f66020bf-3690-4422-ad15-8941c491714b',
      'a314db81-aa2e-4bee-8b27-c0b480f88e39',
      'ccfbacb3-e6d8-4f07-97ac-428e77fb38f9',
      'd0d7a063-1b8c-4c95-87af-265b52f3d71f',
      'e89a4c3b-9139-4f00-8a31-ad0b744e541a',
      '350d834c-cea4-414f-8d9e-e7bf7d417813',
      '82a5e6c2-7ac2-45e6-b27a-23872c6916a3',
      'fc61ea7f-d779-4764-ae0e-61c868f2fc12',
      '7a02a588-9480-427a-8bc4-3bed7d138948',
      '51f0f994-bfc7-4e95-96fa-42f73eb77cd6',
      '2dd10fef-659f-4204-97a9-b10c88e2a01a',
      '135e9209-8a30-4e01-a9dd-72b92cc5c74f',
      'ba43f63a-263a-4379-998c-698efe429602',
      '8a49001d-15fe-44b6-90b5-e5ac62fdce53',
      '9cf0f546-4d75-4b93-b911-9064e02e0ded',
      'e9f1b9df-6b63-49f9-be77-84775bfdf72f',
      '36f721bd-b1df-4ca1-9c95-9458a44cc8cf',
      '4c665941-fd53-4fba-b7ba-bcedd3e489ea',
      '5d024c88-b10d-47cf-9076-f1311adaa6b2',
      'af4ca6d3-0d48-4bfb-9fa0-55097747982c',
      'e426d98a-d4c0-49bb-b47f-dc9a156360d6',
      '6fe90383-b68d-4d8f-b074-567ca92fe820',
      '25377689-5a17-40e2-9d2a-9d70bc2d7903',
      '27ddd150-a202-4cca-a21b-dba5bd931bdc',
      'f38dcc87-bacb-4298-801a-a1d736a158bc',
      'd42f7ac4-85fb-4df4-ad2d-a4f00cf47126',
      '9c3396fe-bc95-4f59-99d1-f13c51712101',
      'd29e7ab4-8970-494a-b183-7466c6eb44b3',
      'ca4fe079-4674-4c27-95a5-2bb7ad35a8a7',
      'c322a1e1-7921-4eb5-85b0-9757b32aa9bc',
      'f5a0b18f-4a56-45c5-93c1-7e0f1fa24c9e',
      '77b1e60e-3206-413e-a597-3b3468a15722',
      '367e16f2-3f7f-492d-a4f3-3e11ddc8ca59',
      '80b587ce-800f-417d-b05d-de4b68d09fbe',
      'af0c0f90-c762-4d4a-8a48-cc1b0c54f0f6',
      '479feca0-a6b3-49b6-aaee-ce5a750f9b9d',
      '8a92a862-807f-421e-88f5-0362aeb3dcdf',
      '11dbbeaa-ba75-4015-84bb-6c87877064da',
      'c74ed1d3-da4e-4704-ab32-800fd6b4926a',
      '38deafe5-26d5-4623-9ed6-a8c6ce83221b',
      '89ee819d-979a-4fb2-b5ff-4240df279b18',
      'f3433913-8f07-4d7b-b73f-7dd34bb41ba1',
      'd46bcb69-ab6d-4419-bdc6-3fee3244fae7',
      '2756a89f-1da9-4510-93d6-4682d07018d9',
      '4b1296a7-2d67-4494-83a6-b7e8a9642782',
      '38fec857-0d13-489c-b98d-f41601e2a4c4',
      '27f42ecc-9c4f-4815-988d-5bab2872a3d0',
      '562bcd1c-2a0d-458c-8324-ea9198d69797',
      'c8a49723-d11f-48e9-a6db-432decc43833',
      'bc60aea9-5776-4f2e-971c-4bae14e9eeb2',
      'e8e26a6f-6946-4c33-90d8-48d4635774d3',
      'cceabe4c-6f9d-4cfc-837d-e9d15c4f79c2',
      '01dc28e5-0805-4cf7-9d40-79c20b361f09',
      '6105537a-4463-4231-93bf-9358729cbfbd',
      '8ed30a1d-8227-40d6-803e-c3b34a3bb2a3',
      '6475bcb9-4c80-4bfb-9ebd-479f5c4d7585',
      'f16039a3-2829-4dd8-857f-6205621b1d1f',
      '7fa21442-990c-4f3e-9ae2-eb319d6926fd',
      '2ebb396a-01f1-4523-b453-77471872dcbd',
      'e14af618-7194-4d1f-a81f-831459d4b5fb',
      '684a3562-2c62-4acc-a5c0-982efc31a703',
      'cad90e64-6ece-4d55-96e7-7fba6e330f28',
      '3da0b7e2-87a6-47f4-aa17-c383a47338ee',
      'fc621377-30a8-408b-a883-a349122a4b59',
      '0658317e-c1da-43db-8542-7da4c475781c',
      '80c5e2aa-7968-459d-981f-c8688b54c329',
      '0b9444a6-eccf-4120-a194-3097f70c9969',
      'aa904fe4-09e8-4c24-9078-8726983a2244',
      'd2ae0845-7a58-470e-9def-f366e3f41fb7',
      '4d5f961c-dc57-4fe4-a4d6-4695b395d5e7',
      '87a5d3d8-0667-469d-b128-1610106e0ab4',
      '255877f1-c4d4-4375-b56d-250f607a12b7',
      '77c9e1fd-0981-4bf6-8bcb-f5237c399c36',
      'c298a8aa-7146-4d87-9dac-d30d0aec08f6',
      'c5851112-e839-4439-96dc-5931f4bd2868',
      '9dfcee2c-6d2b-4aaa-a745-a8fdf5fcf6ed',
      'f4abf396-18f4-466d-83e6-cd8178f4d68f',
      '8d2ff697-1598-492a-9afb-9dd5f007c784',
      'ec4d0237-e4d1-4f48-b34b-55dbcf95b108',
      '63a636d3-6582-4e96-8e1f-a5206c876c5a',
      '66b39b98-ee89-4afb-a823-b372eda912c7',
      'af451674-7949-4529-8d51-6cd873a89441',
      '8829ef23-75c2-4b7d-9943-8fd2807ab85c',
      'caaa3f85-460e-4d16-91a1-e5a714e8a724',
      '5c50b7dd-1d1e-4fe6-983b-d03273ea2a5d',
      '03c415cc-f8e5-4b73-9efa-d53f30d21178',
      '493683c0-b20e-4e92-838c-0c299a551574',
      '261fd9f3-81af-4733-b98f-1947825f361d',
      'dc492756-1e6c-4220-8594-2f02af566bee',
      'b613f118-b3e1-4572-b164-7950de676762',
      'a414e71a-b3e9-413a-9fa2-d8236fda65c7',
      'd96f34b5-4455-4e8b-a05f-2458a99bc542',
      'cbecfb98-4ed6-46c5-ac7c-6cc68c53744e',
      'ad4818f6-2556-41e0-819a-3415443f5a6c',
      '4bd2328e-ee51-41fa-80b9-9867cf0e86df',
      'f7431d18-a8b0-4077-a6fc-5d1550d184b0',
      '0d0bb68f-17ce-4d65-b8f0-a2351eee19e3',
      '5dcdb357-bd85-43a3-99e0-b3f47b903df2',
      '95ccd7f8-2ceb-4e06-8aaa-9698bca1d5bc',
      '1db5bc2b-49ff-430e-8295-9262652fac5e',
      'fd1d1afb-8dc2-4c9b-b9d5-da300557ac21',
      '35868dec-11f3-4b1f-8b1b-b5c6053be958',
      '4414d2cb-5e73-4663-b7dd-8d50c37d1382',
      '2c594485-a80c-4b6b-b4d9-bd1344050007',
      'e1078681-27c9-4077-aacd-586adf7dd0e7',
      '3d20bdf8-3818-4e2a-9f1b-8c09479c2755',
      '2b1a1d66-17d6-4488-8fb9-63c41dcff4c7',
      '36ec769b-9ca3-4b83-aa0d-e465325a7950',
      'c69371ca-2da6-434d-b4c0-dd277563bc0d',
      '996c465a-22d8-4ab9-811a-70fcb7b1f163',
      '3d7e9fb8-1ac9-4164-a478-e63c9b1b3437',
      '258673d3-70b0-4cd7-a1d3-d4a86f2fedf9',
      '951f0914-d6e9-43e9-8c65-4b6d51ccff65',
      'f4f4200a-0a93-4d44-bca0-13800fa4f8bd',
      '2920bcaf-8979-4b6c-bd31-92de566e31ad',
      '2a5fa77d-796b-475e-aa40-2991deafa3b5',
      'd8fd293a-77a2-4a4a-a524-36ef7195a571',
      'e77a7a64-291b-47ba-b22a-66eb544dff12',
      '34323057-962d-4e95-af08-22cae2f5a7c1',
      '6cfcfe6e-22f7-4e82-a21a-8f2006cc1e88',
      '14f6318d-1b79-4d8a-9a84-7ac95bd8255c',
      'f20cca7a-aca0-448e-8721-609434d2c1a6',
      '76c67757-fb7d-4276-9bdc-eea6d5da1dbb',
      '9bb83c7f-d483-40d8-93fe-291cc185c55e',
      'b054a219-40fd-4e45-befc-81ba8602d972',
      '7f6db9f8-dd23-40d7-914a-b0935d586a68',
      '5fcdca68-5f25-444c-8c88-82c729646c3b',
      '06558ae5-92c9-4d25-a636-9d178bc1caa5',
      'f78c0022-2dc0-4940-b47b-3113ee87a2ee',
      '8b0b5531-c33c-4d75-b2f7-3628bf2e0a8c',
      '8e70a594-a4ee-4938-a475-e3c77badcce9',
      'c58d49f6-c6fd-47b9-912c-dc5d70fd793a',
      'e809bb85-7b46-47ff-b952-900c9f8ebed9',
      '465cb806-548b-4d7e-a2e5-d991fac8a63a',
      '6d3000c0-e924-4626-8911-a18ce75866a0',
      '8d803b46-5b83-43d8-b5b6-401cf6baac60',
      'c2ce0232-49d9-4c9b-aa84-8c2613c8177f',
      'aee96181-fd33-45ab-834d-f621f755ab62',
      'f8282b75-92f6-4ffc-918c-2d0ed7203197',
      '72bce06a-0d23-4fa6-9c96-5e7913e9b1ab',
      '907a6964-c036-4985-a6a2-f9ef017649c5',
      '6fd0f133-7ba5-4027-be0b-6e10a0e7af90',
      '46ca37cc-2173-4cc5-b7b7-07600f172234',
      'e1eaa813-feef-446b-b323-82b7ec3eec3a',
      '12c3ca46-89fe-4c10-b308-fdead04c3701',
      '6e50e748-d0bb-41bd-b09e-f1cd18bfb1fd',
      '38aa84d5-b3f4-41a2-9573-f154c83879ca',
      'c44e0a9d-4f5f-4d90-8f39-e1ce6e1e3452',
      '6c0d6f07-52d3-404e-a371-1469310d2e61',
      '31cfa7cb-17a0-475a-b01a-9c99e27240f8',
      'a7b3383b-eab4-4684-8aa7-346203dc597a',
      '837136c5-ff9f-4e2a-9412-9e90264bb558',
      '96c0fdec-bac3-470a-8ab5-b45fc7cb22ca',
      '3767bca5-9dc8-4c47-981d-6c906bd55ded',
      '265d025d-9e0f-4ba8-b714-f9dd80a8e39b',
      '85e76d31-494c-4f6f-a4b2-f0a30db1f7dd',
      '0e971ab7-2769-46d5-acc5-a392f25d2cbb',
      '727d3821-c100-4334-a5a0-2610d8d08fc4',
      '5d90aff7-343b-423a-9999-9adf2f182a3a',
      '1add099c-99cf-4bc8-b780-ac1048efb1c5',
      '54abfd22-7b6b-4a78-a53a-7b0bdd426067',
      '54bab4c8-0719-40cb-bcae-4e94eafe86d2',
      '1ba56c6a-6949-461c-a498-397dbf535743',
      '95b104ad-777c-495c-a745-d7add7c91fd7',
      '0fee5ede-285e-4e78-a345-5b5dc888e09b',
      'ea9cd35a-9106-4396-81ab-d4957d7dbaba',
      'df31febe-01c3-49a8-b291-c0673d57cc0f',
      '246c0aa3-e7d3-4dac-8b6d-d27219b1071a',
      'a3d4b634-5f45-4efe-9cc6-e66b44e2cb9c',
      'a4c0f58b-4446-4f92-a238-a625a25d010a',
      '35a11e8e-d4a7-4368-814e-03b4c3300d2a',
      'fb63e0f1-e7d0-4f58-96d7-5ad46a61ddcd',
      'd7f37cdf-3257-4bff-8a79-b7d6110083b3',
      'c21e702e-4f17-455a-b7b6-2a436398cfc0',
      '98b39787-b79d-4276-89d6-9ad99cd3ef06',
      '07f77c86-01a2-42b4-a96a-24ae185f7a8c',
      '5ac93e43-dfaf-4c1b-9f07-28ef9a7665c3',
      '05b0cfba-61db-435a-b79e-edebd2e87fe7',
      'b67d6611-06d6-46f8-9f61-13a3842e4690',
      '215f6d32-d1f5-44bf-96ea-2a39705be825',
      'a436edf3-c445-470e-b34d-0eabd328ecb0',
      '66dec929-74c3-4914-b640-d0f622323a23',
      '014a9bc9-3545-4103-b4e8-91037698aa97',
      'f038c6c2-de53-4acb-a222-7d0f5b22dd75',
      '16c3f353-0338-4c0f-9ba6-d0659c6d5350',
      '847cba56-a4fe-4b70-ab31-c9d310315e36',
      '1b976df2-d00d-42b2-953d-13836da86d49',
      '840d60e2-cc9b-4367-8a22-cc6a6de5cdb0',
      'f68ab5c2-0c8c-4115-aae5-d8312f49f0c0',
      '3349b3b3-74c5-4b72-b7d7-35db27ce949c',
      'cbc941f9-429d-48af-99aa-6ee20f207dc9',
      '052d8baf-7716-4fca-ae0f-2007af442ffa',
      '36d3c344-7c4e-43a7-a594-aae75da39398',
      'ff6e97dc-5f0f-4911-b1f4-3a078dd6ac42',
      '918fd7ed-c42c-4f86-814e-968ec166bff6',
      '96d15b80-f760-4958-b509-b0debd083204',
      '7cd15a8c-f6d0-4f28-8b6c-4ecd972cc1ac',
      '01685065-db38-409e-a7c4-f45b985d7777',
      '06192367-2e27-4b7e-9142-0dc3b46d4a89',
      '464b1b6d-ae67-4e0f-9a89-a5fbf5120f1d',
      '90c3d7c4-20b4-4d18-b514-18127f8de8d9',
      '6df9cf84-0218-4afe-a09a-192ba69878b3',
      'dda6f8e1-d2d2-4419-b2da-29953073defd',
      '39de399b-2bdd-4a0b-a65a-33c79dff5d01',
      '10c80c3c-9fad-4014-883f-a9f09fc227cd',
      'f4304960-cf95-46c6-889e-cfbab2817818',
      '7e43a909-9432-4ec3-a222-17ea8d46ba58',
      '57e9e0c5-f5e9-4281-baa6-1e198580d54e',
      'ec80f199-ae54-4e41-97ce-819f826cba65',
      '9e0b89e1-19b0-4343-85e9-7e1edd139499',
      '6e151f73-9272-4a58-b0b7-65dd7d2cda4f',
      'a1f0c6cf-996a-4e99-b5e1-6dfd362b9e08',
      'd227080b-491c-4791-b84c-4e54c8de8e4f',
      '75c65972-8038-4460-af9a-bc7fae2ac5c0',
      'fa197e07-1d01-4591-95d0-5ac760f723af',
      '8e59cbe0-ec5a-43b1-834c-00f5bb222125',
      '92b3c05c-e60b-4596-aa75-d2b29abfb8f0',
      'a30c17fe-e66f-415b-b64f-dcc6490b3cab',
      'ece0a8c2-11d8-4e82-bab8-20ac3362ca09',
      '6a1fffd9-2924-411f-ac6a-51e4bab14524',
      'c5c2100f-2b11-437f-bd90-3618b75f75df',
      '93f3c372-3c31-4d27-91df-117fbed10dd0',
      '031ebfa7-9069-4429-8f04-e2ba25661d0e',
      'eb5dd998-4549-46da-88e6-f4013d557fe7',
      '215250cb-8ae8-441c-896f-96658a772291',
      'a37870b1-6f14-4da2-8ca5-248be6c8c427',
      'fd0fcd2f-32af-4120-9644-5d2e26ebee01',
      'b126130c-468b-4d82-ae15-41b4d44b8181',
      '85b58242-a819-41f6-b516-d4fde8b434e1',
      '55ab4dac-41f8-4322-bc24-bc3d7eb7ea39',
      'bad264a5-0498-4a1d-ad50-0bc10f1d3d89',
      '7a134ef2-04d5-499e-aa23-b17b7c862931',
      'f0126146-fe7a-4c99-a761-c15147932eb6',
      'd7969b8d-8ab4-4481-8c20-0a7dcbfdf4db',
      'df372fa7-366c-4139-a9a2-d6b73a56998b',
      '045cfc28-cc17-4fdb-b7ed-f10f50da2aa4',
      '82008b2a-cb59-442f-983e-f044db99ff4f',
      '502f93e0-8fa4-4393-98ed-dbe8d3843a70',
      '3c146d22-6982-49fc-ae2e-f4b7032e4ecb',
      '46f24bc6-7629-48b1-8aa8-645d6e836203',
      '01449586-e450-43d2-b235-aa4994dce91e',
      'd239c961-ade5-4af9-b903-b91f1b1e1610',
      'd07e938d-b814-450e-99e9-900d166b3239',
      '8571b4d5-8cea-44e7-8cbf-525143e79a9d',
      '62ab3dba-0ab2-46bd-a158-54f0bc6f3e67',
      'c130457b-3236-475c-b9f3-f6756ec31529',
      '468e7e83-f0c3-4a82-96c7-e1c597d41da0',
      '49c4ae7e-d149-4e7b-a895-859c05a1c50e',
      'c6a8b3ad-415c-48ff-a8bb-f966bfb4200d',
      '51853520-5420-4653-96ae-1564ca0b6ca8',
      '9098b199-96ed-4818-b998-78540f2c8ed3',
      '95e66e17-75a3-4291-917a-eae360bb7016',
      '9ef5b021-3b1f-45e9-8c35-241f942ff720',
      'c2b0bf70-3d67-4be5-9d05-ddd34de7aae3',
      '82cbb008-2534-4176-b6a7-0dea277e38d3',
      'cf7ad0d8-df3e-47ba-8ec3-4d6397a13c25',
      'ab2941d9-7b33-485b-ba7b-435f9231c23b',
      '1e36b295-2a0d-4462-9e80-b9e1779cf974',
      'cf81e429-fb99-4501-862f-79322aa4632e',
      'cfb145e1-138e-4a7c-b05d-875949fe83a9',
      '13441f37-556d-469b-8308-f6b2ed67e7d0',
      'f6ff5497-74dd-4cbd-8400-1a22a3219595',
      'cb5ae18b-7a22-4a91-8afb-3fe17adcc93a',
      '5cc0cf8e-efb8-406d-958c-0233633e601e',
      '66482eed-b91c-44af-9403-755671b9775b',
      'd4bc6ee8-881c-48a6-a57a-d15a1476003d',
      '71cf04f7-9e17-4134-8cfa-a3a2b0f6b2a0',
      'f9a93c61-1774-4131-80ea-74bcf693c4bb',
      '99ab362c-5fdb-48d3-89cd-7eefad0e6bfe',
      '2df7d1f4-a43d-4d60-b55d-a2ff0b00cde1',
      'b38d9435-3d95-4005-8ba8-fe523cbecf16',
      'e57c8eb3-116a-4c07-a2f6-ed7485aab384',
      'bc9c34e1-f266-4378-90cc-af542778092c',
      '69932059-9dde-4c78-b271-9845c827233c',
      '84b92f86-3852-481c-9c3e-c90cc70c564d',
      '2cac75c4-a671-4dc9-aefd-f52015c25845',
      'a2561191-f0e0-44d9-b7e6-bf583ec1f9c6',
      '76c46737-c54a-45b3-9e7d-395ea0f3983f',
      '521edd5e-efa3-4db3-8627-81660b71d1f4',
      '76f6a26b-e110-4baa-8cfe-ab0d7a879987',
      '4f141023-b525-4b4c-b918-03def28509bd',
      '9898c6e0-00c8-41c3-9e0a-177ee0db889a',
      '58ea0223-2f16-4b65-917a-588d70ef1a1e',
      'c4ddea09-29a1-48f4-b025-feac3375cdb1',
      'd8c00a88-8082-436b-9340-11465d4c68dd',
      'e15d2278-b9b1-4523-be88-e1fe9b755425',
      'fa2abe5c-b8c4-42ae-8159-90d5e15ae317',
      '07a3efc4-3dfd-423e-b339-dc4ef1aceef9',
      '4c8bad9c-c727-496d-acc6-b142a6ec868b',
      '8c5bad4f-c590-42b2-afd1-266450d401a5',
      '43501efe-c94f-46e6-bc4f-d1417f662a4b',
      'fafd9fc7-af64-4ec0-9890-6ea3c3cfa117',
      'b6a7ac92-ffba-48db-be29-508528090288',
      '8540ff8e-3131-4f69-b231-6f75043ea3a4',
      'f09dcfa0-9b8f-4e44-ae19-7ce86cf9a81a',
      'd990a360-c0e9-45bd-8381-dabddbc1a41f',
      'cd8f7413-b84d-4fd9-a3b4-6a0e27754375',
      '85c86a96-dc89-4689-b3b8-4a5cfe107e0d',
      '2d9f7355-3958-430b-8eeb-59fcc6ebb7ae',
      '81ac1c80-b1f2-4587-8cdb-a342d5d38327',
      '9f208204-ae58-4d8b-9ac2-5a82a49e3ea4',
      '1c3baf0b-35db-4f87-b6de-096d741365a1',
      '376a8a91-6ce5-468d-8fd6-c1fcc371e46b',
      '061bbb17-687b-4482-9d42-30c71560609c',
      'dbd2712a-0840-46f4-b073-063c209b364c',
      'b813280a-e115-4d81-ab9a-da70f3e473d0',
      '86105d52-f64b-4e2a-956b-e1e95ab1af4f',
      '4e95f8bb-723c-483f-b7f4-5f56800e55c2',
      '1cd456f2-0772-42d7-a77b-15764db79392',
      'b86d6ab9-413f-4df3-99e7-a9e63ae31fa5',
      'a82f37c5-44e7-4014-861c-48ec8428b36a',
      'f650bb76-83b7-4a15-9e9c-e5894b279415',
      '58c245f4-f369-403e-ba00-2a7f77630bc8',
      '26764ecd-4e55-4b82-9174-ff2044fa4353',
      'c4441e9c-6f1d-46d8-ab9d-5a59c0a3d15b',
      '3c01abc2-78fa-45d5-a19c-ca07656c47f3',
      '54f173df-f874-47df-a19a-9ac73c46fde0',
      '3e5f3d52-a16f-40f3-9d66-e63294fec9ca',
      '0eff91c5-c0ef-46b0-a31c-27d294b98087',
      '69b5c9f5-6b64-4824-981b-bdc8aa5e29d8',
      'c63645c5-9c4b-418f-a093-8552329a10df',
      'bfe2fb38-8472-4a85-bffb-734fe8fee150',
      '415ddd20-2a7a-471a-91d9-18c90ef2d015',
      'bc193683-fe5a-431e-807e-dcfaf7c2ef96',
      'f2aadf4e-19fa-4212-8973-06ccab46c18c',
      'd0c99863-05e4-4a64-b608-aac73420785a',
      'e29a3b82-d3db-4724-b9e6-e4498dfe803f',
      'dde8b0ea-d80a-49be-89aa-331bcc85442f',
      '6ffc1a89-addb-4919-a931-cfa6a59d16bc',
      '7024a39b-2421-4eea-b81f-9d7c839da4e5',
      'd200fb1b-c850-47c7-922b-99abcc4f5728',
      '777c3d0b-bc18-4f20-98b1-6b711a9b07d7',
      'e8bf11f9-58eb-4a9d-97f5-48ae86677e10',
      '107564a6-3f6b-40ae-adf0-c5e650d9a8e4',
      'a08fec4a-f33b-4441-a306-b06e27722675',
      '2e6c6406-7d48-43bf-807a-20ff945ad4b0',
      'db9d4041-cc70-4459-a6cf-36284917f47b',
      '6d1947d0-308a-412d-8a8f-b0f89804b0b5',
      '1d95d07d-b85c-48df-94d5-7551194a3545',
      '59ac2bbb-0282-489c-9f2b-30516e049806',
      '06dfd18c-cec5-48d6-9b84-0a0a8ff39180',
      '6c83ae70-9c97-4e59-bc53-4f8c943e4cd6',
      'ae30c8a6-f8dc-4488-9339-8b82ab3228e1',
      '656b28fd-ee9e-4fe7-82f7-f9d94561afb7',
      'ee2b3999-c6b5-4c92-ab8a-2061672ea56d',
      'c4c4085b-f5a8-496d-bd12-90a7425c2ddb',
      '260068de-ed47-42c8-8f26-a4feb81d5863',
      'b34d1e9f-6503-4254-8418-bb02a400c3c9',
      'f613de79-5a17-4888-986c-53eb1027cebe',
      '2dc2ddb2-927a-4dfb-94ee-1b123df246a9',
      '29d3dba5-b423-4fae-a74d-b5872c8b561b',
      'ae395556-f464-444d-9e01-0667c3e2b1c7',
      '0d699a74-5392-4702-997f-80a7e4fb9785',
      'c8c8a54f-273d-486b-a361-0571822a6aef',
      'b334f2c8-d63e-4463-9e5b-a1625b1ef853',
      'c5627375-7c69-46e4-9567-40cdac883f05',
      'a599de03-ad82-4b0a-98c0-48a0552ba71f',
      '3d724773-ed79-480d-b144-7ce99af976c3',
      'da1243db-7e4f-421e-9539-7009942b00f1',
      '66f88401-2bf8-4253-94fa-2587c0c671f8',
      'b882986b-eb11-4d71-add3-e2352abb81da',
      '0ae82e09-5fa6-42a6-be4c-e782e56ea783',
      '0fdfc9ef-40e8-4c78-ba12-98bdde2a7577',
      'd8eefcb8-a597-4f6c-9d9b-9f7b83906c28',
      '6594b230-1fbf-4531-8788-a1d1b6fc6bfe',
      '40e59225-2da8-468b-ac51-60c3c23417dc',
      '3983ff17-ac19-46a8-b07a-07e5edfb1a1b',
      '64455747-7441-4fe1-8520-bb2b7be18164',
      '435599bd-49ec-4fac-8cd5-a0a5bfd4f4f6',
      'd79e6b59-43d6-4edb-a734-5bcb6ce83325',
      '484a6165-1037-428c-b83e-8758f303ce06',
      '9eca3cfe-9908-4f7b-966f-217b3d202988',
      'd67b6979-ec11-409d-b68f-7912e00d2b94',
      'a4a37044-1ffc-478d-b29a-dca954238045',
      'b08790e9-1817-4073-bed0-89e771dc3958',
      '9c1bf43e-9d96-42a5-a98a-6dc26f5f5610',
      '688036b1-7269-48b0-a488-56f6dbd86b06',
      '499ca248-aeaf-4f0d-9f24-356007a51b2d',
      '6961eec9-310d-441f-8ce4-5a11cb452976',
      'e66163a7-72e3-49f5-aa22-9fe743c7892d',
      'acefdd7e-21b8-4ac0-b61f-7fb1500fc57a',
      '3f4a86df-d78a-451e-aa48-03fd49782e2e',
      '7f95e946-b02a-4d20-8f23-621326144143',
      '5268225b-4efd-4e81-b7fd-e0d36ab3b576',
      '58a0a7ec-17ae-4c53-b22f-7707147fb4f2',
      '84dc2ec8-fd8d-44fa-91f3-cce87c39d705',
      '075d6d92-12da-4908-88c2-08be0db1b9f9',
      '4462a5d0-2df0-46aa-ab82-0b7d4e50a83a',
      'bbe1c8f4-c159-426a-bf30-d423086cec86',
      '054fdc96-7423-4ff3-82b8-c8cd6e0eac38',
      'a9d08954-6cea-44e0-a296-5543e7d8473b',
      '4e53ac13-9e89-4461-a6e6-c89442d784f7',
      'd45cd43e-a147-461b-9f6f-46f1402f34bb',
      'e8a9a66c-12e9-47d5-b45a-5402fc8f6a7e',
      '660b9362-872a-4e78-884f-a612675718c6',
      '103d5ac8-70ec-4f9f-8fe9-9f3de0546799',
      'ea9d6245-db54-4180-af7a-adb0f3553f9c',
      'd9beb470-cdd6-4042-912c-dd57b9ca554e',
      '918506e4-49e9-4435-b4ce-5e65011828d8',
      '92eba284-4cc6-485a-b63c-1831fcc6ffbd',
      '6c9e253b-56fd-4b11-ae59-512eeb001c13',
      '78679702-45ff-41d4-8c81-77edc909f068',
      '38a2ed0e-bd50-4d1f-8570-a215bfe63c79',
      'e8def2df-af98-41b7-9115-8156bf3a54c3',
      '45a541cb-952c-4761-8929-8de9c752f7e6',
      '0d364079-41fa-46ba-b7b5-ad5c01a3c37b',
      'e6e062be-219e-4e54-9f01-ccdc17bdb83e',
      'fdf611ce-9204-4745-9f7a-3ec48c6e142c',
      '7d989fd2-9b4f-4748-9392-3bfcf9b36160',
      '6401b072-fa69-4fc7-96f1-044f83a983f1',
      '8b53dc96-a5c1-46e5-8bb7-7fa60999563a',
      '44baabd0-e294-4c97-8bf2-00cea4b42bc5',
      '48edb6c1-5971-43b1-bb6f-24bef5a48c99',
      'a377011c-e191-43ee-a5d0-94b3b2cb056d',
      '6c4e9da1-3168-49ca-9968-e94a753ba4cf',
      '1e1c24de-67d6-49e9-a904-8e9f210860dd',
      '33c2a813-b516-4925-91cb-e4712bcc25e7',
      'c28582ea-33a6-40a1-8c0e-f755c0ad6325',
      '4ef4ac67-3e43-4838-a67e-d07fc4f86769',
      'af623306-8c25-4025-8b3a-9c9852ec5902',
      'bcb96273-c8ea-4889-a2b0-37b28ff99ed5',
      '5d5b94a8-8693-4eea-bf49-ca4243f981e3',
      '93fe552e-f39e-4940-b7d0-3c321a8b4a08',
      '1b4df265-0808-4cae-b444-57a0ecbe92df',
      'fdcc4fdf-21cc-47f2-929e-460767e7be29',
      'caa833cb-18f6-4670-b1d0-e8a7e42d8b16',
      '98d416df-6514-4d9e-86bb-29b56f05e772',
      '131217b7-6f3d-4d62-aea9-74bb2b1e74a1',
      '6d29aea7-8e52-43ef-ab02-0d4b5ea49442',
      '4cfb65d9-e93a-4944-bfc4-e0beda14570e',
      'df5bbbce-846b-4719-917c-03a993c4f3fa',
      'ec62d85e-8df1-4f33-8c9f-202a4f9c4ed4',
      'c8d3d4e3-0c29-4359-b27c-a604f6d3f0cd',
      'a3046983-c6ca-4da2-b692-e02e50fcc1b3',
      '14dfd8d5-0285-4451-84d8-6d6ffae71737',
      'd801a35f-0772-4110-a590-87c76e225ca5',
      'd0ffbf0d-ffa3-43e0-9eca-6a6fa747c38a',
      'f6dff685-2b39-425f-afc6-bd536f6515d0',
      'd6a96513-195e-4e5f-b11b-c47741455627',
      '8b6fa4cc-d9ff-4c47-a182-286dea0f2592',
      '3c788931-4e08-430b-915f-2b5ac1f82a35',
      '06040b97-4524-4dba-9518-b29411777375',
      'c65fe25f-65e5-40a7-96d1-91c739acb7bd',
      'ac9ca75d-421a-4d2f-936a-b153e6995fb3',
      '36bc6565-9503-4e7f-86d3-3464a32c3afe',
      '58b02495-3026-44e4-8b20-9605c45c1b5a',
      '009cdb3e-d103-466f-bdd0-e3956c7857bf',
      '1ee5bb26-dcf9-4439-aba9-99ab70ce317c',
      '6d808ff7-72b7-4606-9dd7-2f8963743b03',
      'eb0be0d7-9613-4bca-ab1e-b11275c54242',
      'c190e0f2-edd0-4a6d-8d25-36205575500f',
      'cef50a25-fba2-4387-b0e1-f399228471e3',
      '6fa75286-7ef8-45df-ae1d-c81c086bd2a0',
      'a0b1f28f-9319-4877-87e4-2ae28ec74fcf',
      'c0ed657c-102d-40f6-b744-4bd08d1937b8',
      '0474627d-cbce-47f0-813f-49d9a5c6bd92',
      'c6e60a8a-2f3d-421a-8fb6-0ac96e493e56',
      'c5e69123-8e76-4dd1-9259-b14bfd42d550',
      '8d53790d-fae8-4df0-943b-f6d7bb83b9bf',
      'f8f39114-b600-4fa4-a577-42f5286b3ef8',
      '15a8ae69-e739-498f-8120-3bccbbd3a1a8',
      'ea55d135-7da4-4be5-b8df-4dd94ad5fde8',
      '85e1c17a-162a-45e4-bf8a-2a2fa7614abd',
      '670b0c17-ebba-46ed-afe2-7c97085700ff',
      '0e57ed14-36ab-4154-9a20-2fa1d5daaa4c',
      'c42094c1-a395-493f-b1c8-a75f68398152',
      '3da79975-2a12-41a1-8212-de8531319c75',
      '399bfde4-3222-4a3f-a12c-ee823beb8dda',
      '50f5ba83-2c3f-484d-8c26-19e6fcbb6f4c',
      'e44120f3-ddd4-4f4b-bf3f-54ab75c49c37',
      'dce36d55-ff4d-4d2d-952d-b2abcbea039b',
      '50f11a29-5abf-4f43-80ef-4855e9fe3bf5',
      '7f9981bc-814b-4c38-8f18-6cf07f145cf2',
      '4dada195-9855-4b2f-9830-5d144533b111',
      '783bbb2e-06ce-4668-bc24-be16574f27c2',
      'b4eda1ef-1c29-47f0-92f6-b20bbfd3e204',
      'a30cd361-29ae-4795-b74c-d4ad48128aaa',
      'b0bf2f63-6a2f-45db-b211-657e42cc5e8d',
      '9ddbf093-01bd-4bdb-bda9-4e52ef966865',
      'be710bbb-8b0a-4fa2-bc4e-10c31808cb87',
      '00870d19-de76-49ee-a6fe-a3aa51f8c0ac',
      '5008f710-e342-4361-a50b-b6e05ce1ff65',
      '800ac60e-acb5-4f8a-9e76-9d8d026fac8c',
      '739dd846-a2f2-4a48-9e10-2c08a2b4d2b6',
      'd3ef36ca-afa4-435c-90b1-a18ce566000c',
      '1480f410-b4a2-4fc2-be56-3f0e0dc179b4',
      '39b37517-5a37-473f-998a-8e2c04dd53e0',
      'b5ea7f07-f779-4978-9b67-21cf37716101',
      '0214c2f8-69f2-493a-be6b-50b903210509',
      '101ebf5b-e762-46d8-997a-2e920ba0df7e',
      '9879efd2-d522-42d2-9a72-e23e9d092474',
      '0688e9fe-9ce9-4049-a864-203d2fb53abd',
      '3091a12e-9c04-43a9-a083-91827e6001f4',
      'adb8f0ec-9d5d-49a6-98e1-81d919159f75',
      '9a56beba-2a85-4aca-ab12-85b954fc4b55',
      'f1d0fa9b-7643-417b-837d-8d32aa1bb34a',
      'ba3b6c61-99cc-41fd-9a16-3123dc83bbaf',
      '08484f1f-0b1e-4986-a1d9-48089ee0b403',
      'e1095956-3675-436e-bc0b-013f4074a17d',
      '55858097-3431-4b64-b6cb-7dbc0e6a6059',
      '257f1db6-73b9-4023-a84e-499155c5bc08',
      'd9272b6f-13d6-4a23-9040-4fc29d8cefcb',
      'a72dadad-033e-422b-be7a-ed3dcf982643',
      '92dd42a3-8761-49d4-bb6c-ff57e1e8b6f0',
      '73f0571f-442d-4163-9823-a005bf0d06e0',
      'b7da8d39-c280-4cbb-9243-022f33171ad1',
      '4a328e69-f938-4c7c-85cb-b14daf84d534',
      'dc7445e7-568c-4397-ae60-8182ba4e5352',
      'a53d95b3-3c94-4911-8e4d-20681bf45f55',
      '545de8a0-6174-4a34-b37f-f57582ff48cb',
      'd73b0763-41a5-4e42-997f-b2565f3d7d6e',
      'ceb64e39-724f-4ebf-86ea-554b5b77e8c3',
      '199238ce-587d-4e4a-9663-57fa72334b99',
      '1b53ea0d-cf5d-4757-8366-1dafdb3edec1',
      '4f3a87dc-069e-4d96-9048-5dda4309e5e4',
      'b20f042f-c952-4990-b09b-de7cac9caab0',
      'a70b23bb-e738-414f-9fb6-b04353dd6625',
      '165fc6f9-e44c-4091-aa66-ce59823a61ef',
      'ac068763-77ff-4d55-aa45-93b49eefee98',
      '8a111f9d-0b1e-4c52-b101-29fa82c38723',
      '0db83e2e-863f-4fb9-8fd8-b8b547fc14cc',
      '9db4a31d-27f7-4c63-b303-97b0f4d39130',
      '30b6a840-4404-4c5c-845d-08eeec3011eb',
      'f28f3cc7-5503-41c9-9c5b-035e00f1885f',
      'dedcfb8d-b97c-4b0a-b29d-98846ace9b99',
      'db69da4e-d8ac-4a88-adf8-f30c40a57b86',
      '805e7a56-5e76-41f0-b3f3-d628741e845f',
      'f9581df8-57d9-425a-9ec1-d2f2ca9b25b7',
      'd866e69e-61f5-45fa-8050-a905b2ef7b07',
      'bb9b192f-b759-4c5f-87fb-1f5b55a4fb05',
      '3fd9aff7-7cb8-4a73-8f46-d035fef2f476',
      '721639dd-19ad-4290-ad0a-089575675cfe',
      '482f1c68-4f2b-4bf0-a0f9-0626d8e5b027',
      '49cf7bf5-a90b-4f07-81be-75dff0121bca',
      '53c0ca30-c98b-47c2-898b-fa54e3a415bc',
      '12f61153-9482-4231-bd3e-9dae2aff7e59',
      '738a496b-31c5-412e-a51c-b9d06e28b3e1',
      'dd20e98c-dfbe-4236-90d5-41a2bc3e2831',
      '45b23cb3-d96f-49cb-94c5-ddddaa250af4',
      '7da2b398-a553-4f76-a3c6-266a550d681c',
      '11b4cbbc-0b72-4571-bec6-16c8fa976d7e',
      'c7ba96cd-2404-4b28-8b40-4ea6362cda6f',
      '50514d1c-c8b8-4646-b92f-3af9ea303a08',
      'dc731aa8-9cc3-44eb-ade5-5d020f076a3d',
      '4dec4a55-ad37-4f10-aea3-cd5432a97aa6',
      'b585012a-79ed-44f7-bccf-ee4185214868',
      '85a65015-0ac8-4623-9170-a0715e4ecaa3',
      '4243173e-cfb4-4720-9efc-ea30dc555702',
      '25390bba-350a-435a-8724-1edea231c855',
      '331cc369-aa46-419b-95df-784afb42e319',
      '3a7cf041-a9cf-432d-9ee3-187490145272',
      '2c2e55a2-1767-4937-b3d8-f1d76ef154b8',
      '2b793ea3-ce94-40aa-9c24-380c4e2dc67c',
      '0b36f2e0-27e9-4176-a741-e9eb273f0a9c',
      '97c06eb4-7588-42b1-8628-e4798d4bac22',
      'd7c86738-5ff5-48c3-9484-603ae74923b9',
      '13cc3e17-78a5-4ac8-9713-b27efbe81df3',
      '1a231b3f-c9fc-4c13-8d5a-c1f860050112',
      'f1b6a8cd-09bb-434e-8928-17fbe110750a',
      '5bd15a77-70c6-4209-9997-78dfb2557df6',
      '8317e327-5e26-4906-8799-57b9d84128ef',
      'f0a96b9f-4b7a-4bec-bffb-1a20e69a6908',
      'e3472dd5-fe99-4df6-9cad-34dcb739771c',
      'f2d4fac8-3821-48be-9b1d-799eca8811d4',
      '5de4ffb7-2609-4e7d-8df1-3af26a1f9e68',
      '0e9ef500-7507-44d2-b4ef-fd7565631843',
      '49f99705-a231-4f06-a3a0-3d4a30dbe6c7',
      '4f9be873-6624-419c-9364-a778f32cfc10',
      '55ec4f5e-cc6d-4f8e-8263-09fd88c31df2',
      'cefe87d2-e9b3-4373-be56-bf814fce0b81',
      '1b4c361a-24ac-4aeb-ad74-9e065a590887',
      'ad779d4a-57d0-4483-9dc9-1231e67b4826',
      '72fb4345-9562-4f8f-ae9b-618a24e0659a',
      '097bbd18-feee-4227-b3e2-1f96671ef99c',
      '7a902787-7ab0-4379-895c-0852004c7800',
      'f4518e3e-f11b-4210-a22e-1a28b7db0750',
      '5516bef5-b18d-47a1-801c-4d6ec294231e',
      'c80f6f10-dc02-4dca-8535-bea4f821a84e',
      'ace38008-69e1-4443-921d-c1f0a3cb0d18',
      '1d5e26e2-baeb-4a89-8d09-98a4d586352b',
      'db861386-d594-442d-96eb-e75d089873c4',
      '5b456e7e-939c-4096-bc81-eb6fafab3e98',
      'a7213e88-7eba-419d-8f05-0f7737fc94b4',
      '7a4a2992-e8a9-4a84-91b7-996b660e7a35',
      '9436f506-57b3-447f-a0e4-1a3ab633f037',
      'fd208313-8419-4cb9-a15b-d21dd6ffc612',
      'cbdb9a21-3334-4214-94cd-65a80afb77b9',
      '5488f53c-b326-495c-9844-58c702d0ac20',
      'fa57f643-57cc-4bf7-8a32-bd4244234b94',
      '834d1c69-560f-47e0-b678-f5ee3eb91acc',
      '859d6c44-be5b-4473-ae93-cd72d3c42460',
      '124a9cf6-ef81-4937-ba53-f898b7e29238',
      'b7622d1b-636f-472e-8e0c-0fd0ab42e49b',
      'a6fdcb6f-00d9-43b6-a650-83338141f288',
      '15c3d7f1-b2f9-4463-a638-22c9426e0299',
      '5f792456-bf76-49dc-80fc-7a2a438045e5',
      'b6051a8b-0e29-4669-90e0-86972e02424d',
      '2f510d8e-b0cf-4a79-8f6b-cac54fb4181e',
      '462b4e12-062c-4119-a832-61b188ce8ea7',
      'eefb756d-3128-440a-9229-e2f66e1a558a',
      '9b5aca7d-267c-4840-b631-7cccec67305d',
      '799639e0-91b7-4821-b2a2-7b954cb50062',
      'e9c0d14b-c999-4368-aae9-93dad60e48fc',
      '8195f535-e8c6-4ab2-b5d6-f381fbd25a54',
      '985b90f1-8505-461c-b6cf-3021a766f5ff',
      '870db297-770a-4fb8-8770-aa12bd7b6c54',
      'd36c41f6-3632-4b2c-a0dd-fa3a2a0689a4',
      'c61984ed-765c-480c-8d57-978e7913852e',
      'cc6f9768-51e2-4eba-889f-bf45dae12668',
      'fa75775f-c33f-406f-9f74-75bd35f6b949',
      'd97b5f54-fb38-4cd7-93aa-528f6f382f20',
      '29a20a38-4a72-4b43-9d73-e0b73a85f2d1',
      'c168cb78-56ec-45f8-981b-0b0ab5c207df',
      'efd55d65-22db-48b2-a161-9d6c764887a9',
      '198c7c6e-1ff3-43f0-a27f-9f4566242dcf',
      '44982271-05ed-49db-bbc2-5b4f2888702a',
      '15d5ac1d-601b-4dc8-82e7-20c5c8effcb1',
      '961684c2-aad2-4b05-9848-bf6275baa886',
      '1625855f-a9b1-453f-bbd9-f3d7d40aa081',
      '6eac6c7a-7701-460e-b201-b6cdafffd9c5',
      'c3edffb9-7011-4679-9597-ea0280c6ccfd',
      '0b7daab4-300e-438d-a72a-451d7c9db2af',
      '0da3b8d5-d40b-468d-b60e-b1339b59af70',
      '648fa3bb-cc44-4a1f-8ea0-51d4a129dbd1',
      '897d9ba6-fa8f-4638-9d77-521cc59c3a99',
      '1f189d9a-2a2d-4210-a16e-02f7d3008379',
      '99e423fe-8a7b-4021-a602-ca32f5b90a08',
      '35b031c5-21e0-4507-b039-09e683169fa5',
      '299af866-3c7f-40e5-8bca-e147cead76b9',
      'f95ebbc3-df97-4b1f-b723-30ae96179656',
      'bdc99045-8143-4293-b73b-66057e71fd96',
      '8e481942-6d96-470e-8f02-34381115be20',
      'ec550965-7146-4f00-a4f8-b6c91694ef7a',
      'dd40177e-4a7d-4eec-ba23-8b018279d997',
      '2f08cfbb-e5f2-46d2-a79c-88e984e7c472',
      'f313bb37-ed86-4782-9443-170ad90627d7',
      'f5514b9a-1959-448d-924a-3826a94b11d5',
      'ab7ac24e-48b8-448a-83b5-117de490e9c0',
      '3593076c-a900-4e66-9d35-1e630cafce94',
      '0c2ef9e7-87d8-4b19-9097-0899c1a93074',
      '867ddf62-35cd-4908-846f-0268a2d87635',
      'abef009f-d9be-4ebb-8732-29ede7072de1',
      '75d2768f-6568-486f-b214-367b13ccb7e8',
      'ba041c8b-edd3-4475-ad87-64f5a99a1e21',
      'e175e941-b42a-4843-8681-cdb02bdd2a16',
      '3b8fee04-80ea-4e60-8b3f-e9727787c931',
      '980ea715-f90a-4c62-a509-32b4a35f718f',
      '5ab429c6-04de-4fad-b950-8fc900c472f1',
      'f995adfd-e0f4-4121-b5ea-b45edb304dee',
      '1384edf1-1a76-4ba4-99ed-d3f9f42668f4',
      'df566fee-4e85-4dd9-86cc-33074aef7bd8',
      '814b5287-6c8f-4dc4-b63f-46f0b552ad09',
      '7d02f478-be4b-4c00-a3e9-fb6418e61043',
      'c9aa464e-f00d-4dfb-8146-b7a944a78d61',
      'df03e9b6-2a05-4320-b12b-3e521b40bdc0',
      'e494e868-02c5-4108-a1fd-88e78815dbdc',
      'ee39c6fc-ed33-44ea-9384-bc2bee841590',
      'e259b4c6-3fc2-46a0-b0a4-b426c2f46f48',
      '2a4c0a04-1368-42bb-adc3-a889fb9c9e35',
      'ad4bdf05-4b97-4160-b431-6d02a84778d7',
      '03f817aa-d443-45a2-a6d3-717dcb925de7',
      '9d170a0d-fd82-44c2-859e-88034647d572',
      '466b7f71-1a68-4864-bad2-635ac9e57775',
      '31f89e4a-9608-4d56-b16c-6d053fc8e979',
      '42e44eb4-0215-45b2-b070-4339af2fdb54',
      '8e172cd0-1c1b-4e41-9575-92b33b8e4281',
      '1c840a0d-89b3-429f-9261-47b6c5edbfdc',
      '67f6e38a-d248-4dcb-94c6-a50c6b305c5d',
      '9eb1d24f-f71b-4019-94cc-e7fc5903e1a3',
      '6b91ebd1-f6ae-4a5c-8e5b-7229c9aa8ae8',
      '76800ae0-8836-487a-ae06-111148f6523b',
      '7b8ed959-2bd5-4729-98c1-9b95e5fb6d52',
      '3e0ffbb3-bc71-4833-b53a-225f2090d931',
      '6d5cc301-3c1f-48db-9749-2a6a4a533207',
      '0bb75c7b-ae72-4f33-9130-6ac316e75b93',
      'a363f55c-e15f-4692-b10b-d1577f937ec4',
      '48200821-fdf3-4896-9d48-ee0675d6c77c',
      '17495d64-530a-49c8-be83-1fe7b52f80d2',
      'd490dbe8-e325-4069-9135-2edb7383c130',
      '6450d184-a3b1-4641-a8eb-dd734ebd8926',
      '3a89809c-99d8-4735-ae1c-bbcaa2b3e7a6',
      '091f5bb6-341b-4fe7-9973-07b207a3b57a',
      '24ce07e1-7137-48ad-aa90-03de3580bed6',
      '05b7ac5f-1bef-4a73-9d8f-1cab9a4ba17b',
      '08809ffd-8053-45c7-800a-795aec80748a',
      '35157890-5446-41e5-ab19-1599189b7dc9',
      'e929d7f0-006e-429b-8fee-199d4c3fc194',
      '44eccec9-22c5-4317-9a15-012b97a3b969',
      '6b3941cf-cac5-4001-827b-e1661b34a714',
      '624c4a95-95a8-4eaf-8203-095d9bd08886',
      '5c285447-1643-4de9-97ab-27410049189d',
      '480ea09e-4a3d-430b-8e18-b73a71429bbc',
      '2add3b06-4e36-414c-887b-3901fa101be2',
      '0648fb4a-2170-476e-b1cf-34fa9d228c5c',
      '7d0d2462-5278-437b-9306-1dde56fbfdd7',
      'a09995ed-6aa9-40f0-9a6b-31c65a86b821',
      '75c234d1-0b36-4d05-869d-bc6be1d84066',
      'b1c2f888-4293-46c7-b743-706a5de13f30',
      '701986a9-c37d-4afd-8856-74f22475b18e',
      '853249d8-abd5-410d-88e2-41b049d65c3b',
      'ed2865e8-3596-4fe7-883e-a09224ee84b0',
      '19bafec1-75cd-4033-b2be-8a499bbb6f2b',
      'dff86666-ba3b-434f-8a52-0c5b2fc019bd',
      'ed065153-f45c-49c8-86cd-bd28e14ad1c8',
      'a4195f2f-d03d-4e2e-979a-965187f38e89',
      'f0a0a057-9553-448e-a2ca-356342b7b3d5',
      'd9a1bba1-dc2b-43a1-bf90-fe472ea7ab86',
      '2c3bd386-6cee-48b8-abf7-a97383fd509e',
      '20133e8f-7acc-4918-8ebd-eb841b317978',
      'b49415e9-23d7-4edb-b7bd-897d4ade133b',
      '7edf4b4d-ee44-4be3-b65e-a062d6e57048',
      '16d1dad0-6183-4de6-9643-13a49098ca60',
      '62e257d5-03bf-42e2-8a02-9d0cfeac60b4',
      '17bdb773-38df-431e-9714-de5837c585f6',
      '0480b584-ae9e-4029-959d-42d1bf40a1d1',
      'fa7fb532-1c14-4e2c-8fa3-33c974cd436b',
      'a9b721d1-75d5-4f6d-be56-d49489015cd2',
      'e2ba107b-97b2-4af9-a0c3-a595b316e037',
      '0206a6db-1aef-472b-b8e4-707edfbbe1a4',
      'c591c893-39b0-4283-a122-d9fca911a3c5',
      '08602ef4-991b-4c2e-b279-bbd1347a3592',
      '8a78fd5f-1980-439f-a7e1-348c9327a49f',
      '87f70eb1-f2dc-413b-a0f4-ae0775b5691d',
      'e2cee8a7-0237-4622-8268-ad811bb7b782',
      'df4c94f6-b443-49a9-994c-977b6591f244',
      'd8738090-70ad-42bf-b588-2d23b3d2ae99',
      '4559b4e3-3784-41e2-a865-a6eb93390e12',
      '32f71b66-83b1-4620-9f65-a4719c767bed',
      'cc8e850a-1a30-4ca1-aea9-ba7ff8eb87ba',
      '5d552325-ec27-471a-bdee-7dbb95f38b1e',
      '01ef18f7-715a-40ee-a1c4-ead642b11e56',
      '58dda973-ce01-48b2-877f-957169890e03',
      'bf09ba3a-1a43-4e33-8982-3e1b9b85ef6e',
      '6267cd32-ad15-42ba-b7fa-6539af5dd6d2',
      'f6c36c8e-e7e3-4a51-a5d7-a5240db99cdd',
      'e2056ea6-fddb-4f21-bf5d-e9d8e1fbaffb',
      '85dfee38-a932-42c3-ae13-2ed9abec21ef',
      '332e2286-b914-4ba2-af33-b2dcc25ee3fb',
      'b96e53f2-b374-436b-aa4f-ed0db8a0b34e',
      'cb59a3ff-67aa-44d3-92b1-06c33a32a735',
      'b3923ef2-992d-4d64-b0b0-ebab0ef3bb1f',
      'e78371cc-d07d-4345-9361-7e5a2497f837',
      'c0f27051-4d85-447e-996b-92e2e58efcec',
      '5271b2d5-0305-42c4-84a6-cb118c88ac2a',
      '56e31b41-d08c-46a6-ad78-528a979fd5b9',
      '0136d216-cb99-456d-b7cb-fa9d18346c8f',
      '2328a8a6-60ba-4789-8c0e-df8d5afe6939',
      '340c4b4d-a4ca-4b3f-a700-c77f5c5817da',
      '8e374cb4-89f0-4975-8c25-31517153167c',
      '2f4a2132-b7e6-4c56-94c2-4363e47eef51',
      '2ffde21b-baa0-475e-bbd8-0004d56daedb',
      '6352298b-cf2d-43de-95c4-e6f65206f36b',
      '204133f1-4ba5-428c-ae0a-3da0809c62a1',
      '4d597dc4-d111-4ea4-b02e-cb64fcf5b2c6',
      'c99c2dbf-18f1-4f2d-8ca8-f231436d8ec3',
      'c1674eb6-c6f9-4f9c-a7b6-96cccc203d8f',
      '4366d529-ca8c-4d19-9794-79cda9da0a20',
      'db41b984-522b-43f2-8dd1-99bf2f29544e',
      '53b30644-8aa1-49b9-ba93-e9c9a62759bb',
      '54ae68bb-12ee-46d7-826a-85954efe872e',
      '916bb11b-0a45-4337-9596-5b6d93cea27b',
      '78cab337-d701-4bc8-954e-fa14453a9c94',
      'cbae124c-c838-4bd8-bb43-992f9a67e7f7',
      'fa41cfb2-e62d-4bc0-81d8-4ea279d930a7',
      'c08819ea-0a4a-4d26-a2bc-3312bb066da8'
    ],
    resourceTypes: ['MedicationStatement', 'Observation'],
    handler: fixUnrecognizedProperty
  },
  {
    resources: ['deb98de3-2902-4433-aa0b-e7f0b1d73f9a', 'fb3beb49-f720-47ee-ac15-5ba7548e22f9'],
    resourceTypes: ['MedicationStatement'],
    handler: fixMedSta
  },
  {
    resources: [
      'e5a00225-f7c2-4732-8c02-250511d99eaf',
      '2050d49a-0f27-4bf8-834b-c3300cb26d6d',
      'defaaa67-ee40-4622-a9eb-a1ef812a9630',
      'e8281c75-1e2c-42f2-a59a-cdc5e149cc6c',
      '8d0ffa2e-33a2-477e-9c9e-0863b9f6a9c1',
      '775645e3-c3ff-4212-9061-2fa7eca40395',
      'cb405002-3111-4a9f-895b-24d4d6cb826d',
      '8595fc4c-79c1-4e97-9bdc-7dd32a416da3',
      '70fbf5ec-f719-42e1-955c-9a1864c45729',
      'f21bfc52-25fa-4b05-ad23-dc165e17129f',
      'b172059f-6f52-4e2b-9c2a-bec27b9b0f0d',
      'e89595b7-555e-40f5-ba11-bc4a675487e7',
      '7c716bbb-0ca8-4a22-a780-e88a4913a576',
      'cf313fde-0669-48fb-bb7c-21477f000435',
      'bd6a7899-349e-46fe-bf52-ca07efb03f5c',
      '22364112-b70c-4da4-b0d7-be09f6d90359',
      '7fe83807-0b04-48ad-a564-32aeace12e24',
      '186f0ed6-d989-4afc-bd01-6ff0862a3deb',
      '7310a4d8-69a4-4399-bd35-56c5fa2db40b',
      '7c1674a7-9274-43a7-8e04-e8917128958d',
      '68575051-2342-476e-b07f-292830b40d95',
      '07faa9b5-098a-4779-81d9-684e6c3dd2a8',
      'd53669dd-7379-4f34-8256-90c1190e17ea',
      '8da1fd9d-6b76-41c1-951e-370485bfd80e',
      'de0ffe09-bef9-4b7b-9793-8770c592edf3',
      'aa69e8db-169a-4997-9f4b-ffb885c3a89c',
      'fc3e2b40-d8fd-46e7-aebe-694e92be3037',
      '1932b65c-b155-4963-ba35-c360cf2db358',
      'e6e5861e-2434-4044-96f7-b9bad9d0308c',
      'd158f696-aba8-40d6-aaa1-ef1791e924d4',
      'e475f005-e925-4435-88d9-a71e17ed5d2a',
      '0d589139-0e9c-4054-a55d-86aaadb28242',
      '01450747-e86a-46ab-a0d2-8cf123884c23',
      '1aac3e16-3673-4366-83cb-9d897f068050',
      'c9bf05ef-053a-442b-a537-27d1e9bf81e0',
      '2d5d4337-3150-4027-9ae3-918a9cc5ac47',
      'c7ebacdb-8786-4493-8de2-571e1edd3597',
      '5d2b72a7-b0ca-471b-9491-f8e026f64c63',
      '6d0f402a-3206-4e59-9d6b-3240e2ae6ee9',
      '5823fb54-c26d-4192-9556-6436fd3fd259',
      '5469871a-4707-453e-b35a-597bd845c8b5',
      'bcf856ae-1969-41df-8818-2d0c7a7ea78e',
      '53392695-2aa3-4461-806a-e9a7d834ef38',
      '3edfcce9-14b0-4b2b-9286-bc22c1c34ffb',
      'ce39aee7-481d-4d8c-9841-a70a94e944e1',
      'db6b7311-e916-42a4-8fc5-684099545fa4',
      '5d3f5473-ea96-4ae8-88a1-1e0ff259221f',
      'b109d30e-448e-47fb-bf61-8fbdfb566801',
      '1365db4a-8ecf-42c6-abec-89692e975d3c',
      'de2919d4-cac9-445c-b9de-6cdb4384f295',
      '7d23b9b9-e269-4fd5-be93-e574bc91608e',
      '40ec949a-9dc2-465f-a821-f252fca28aa9',
      '13564fbb-2375-4258-b19d-537ef7bfd896',
      'dd69287f-a392-4229-b31a-c318ced9eca2',
      'ea820e6d-b551-4efe-8b60-6235f440ebe8',
      '1128cf6d-2654-4a51-920e-7baed004acbd',
      '05004807-04ba-4225-88ef-9544309101a1',
      '50e99209-4b58-4508-ac46-9cb59afce8e1',
      '925e06bc-e973-44aa-b9ff-d55b36006fa2',
      '9299ce50-ef85-4e33-a6ad-c12942b6e0fe',
      '894952de-8356-46f9-a6d5-ca57cf59417c',
      'ea8f70ad-9a78-4582-bde5-03e1e9d3ab20',
      '5c2032e1-e74f-4d97-a15d-9aff235da6a8',
      '9644345c-156d-43b7-bf54-d5f33d02258b',
      'f9e3d998-31e2-4bc2-860c-92c7aaaf7cb6',
      '4b53f7b4-4d04-4d3c-bcb8-db89d1994353',
      '63f11f67-0f72-450e-b5b4-17d5e9feae26',
      '89b5fc5d-dac9-4995-afd5-8b24d6962648',
      'de97b865-ac36-40aa-aee9-38f08d87180a',
      'c20a8090-66bd-4081-8571-a3e89869370e',
      '52c11f45-3a1f-42b5-a725-d87ab617dfe9',
      '11df2eb2-164a-4266-90ee-1b6a0ba914f2',
      'a1e5a525-e896-4a7d-ba29-f803b8389b4b',
      'bfc8f8cd-4504-4d5e-a202-2b5b042d43bd',
      '73ef11cd-6690-43ff-8f48-8f0afa758ec6',
      '68bd8047-8c84-41fc-980a-0388018056ec',
      '3018d369-87a3-4ba9-938c-7b47dcbc8283',
      '1996b1b0-cd6b-42e9-82ce-d534600384ac',
      '96cb0217-2af6-4fb5-9060-d4265e279d6f',
      'f6eb36f7-5778-466c-be33-0612e4d9d988',
      'f293c11a-4dd0-46dc-93e1-82844d542526',
      '2ad447d4-fe19-4675-a391-7d0b1948b366',
      '45cd569f-b639-442e-a641-597321cb3a12',
      '097c31cd-577c-495c-8b18-009f71ed045a',
      '75ed0cb6-4fc0-46d9-9596-8f35a48b1f8a',
      '68a56c96-ce61-4eda-8701-3a0e0510af6a',
      'cf822089-8433-4f60-ab02-1b41da16ac3d',
      '2ba1aee4-c823-4974-845a-1662d966e0c1',
      'a0bf5089-2046-4f2a-bede-e931b1e867f5',
      '5184495d-b9e3-4f9d-bf43-1d85123f195b',
      '26d3bef7-f99d-4511-b8f7-19a070e9a5be',
      '32b41be5-6639-447e-858e-e8e2b0fabef1',
      'f540d536-ab7f-4ccb-81ed-9679016dca3b',
      'e14ef195-48c2-462c-9495-862b7daa6f9e',
      '1e06ad6c-2adc-4d76-bd70-a861e8c02266',
      '906faeb9-a30d-4b90-ad95-d02a14e00a53',
      '84e9e0d7-43c5-4011-9d55-bb9c7d075c50',
      'bb63e780-1012-4881-97c1-584d1e4eb378',
      '021b4da7-098f-4a03-8d0e-d0510c2c175b',
      'b82e41d6-a7fc-40d0-a7de-e2861e28e633',
      '6f8a541e-72f9-4800-bb85-99fdc136c1e5',
      '99d12c66-47d1-4e1a-a73e-a233eb4a43b9',
      '2bdd62d9-8010-45c2-b016-fdc233c48c47',
      '07af67d1-a218-4d80-8d01-de675d9a6eb5',
      '2f9a915a-bf0e-4c56-9aeb-f1e514b7b1ba',
      '4e71f56c-a81e-46e4-b721-7eb2e028a15e',
      '4204c1fc-e517-4fc1-ba9e-9bfc5317be4a',
      '21fab760-5ac4-4188-ac68-ce3134609ad1',
      'ea1f2a1e-ce24-42b5-995f-52efb4f88643',
      'aba6eb7c-0691-432d-8e9a-b96c85beeac6',
      '4bebde56-241f-4498-9dfd-ac0937a1be2e',
      'b16c5cd3-0f39-42da-ac3b-f9f0950148ae',
      '4e2a3309-99e0-4058-8557-a0f6755525d5',
      '03299113-e56b-45a7-bb5b-50ef7962548a',
      '7bb7b9f1-3f4b-4151-affb-8556bb6c4f4e',
      'ee288146-63c7-4e96-85e8-59d13f2091c8',
      '8269bc45-fc62-4d5f-9d0a-76d997651186',
      'c3ebbf5b-ec02-4ff1-a565-4a6b9cdea894',
      '6fa92204-b131-4ec1-9165-5322cb0d8e8e',
      '703ece20-7cb0-4ab1-b628-911e0a059856',
      '12f43066-ae8d-46c2-8045-d194e6bf5a10',
      '120fb81f-7d6c-4d34-97b1-3fd646177f16',
      'aea09bc9-1545-4bf9-8756-65c9977c5a6f',
      '928f6c6e-9d42-48e3-8ae8-8439ea588dbe',
      '59b57bd6-a580-45f9-9406-5ee4148712b8',
      '2bd4492b-55dc-479d-8f07-c2a083d7444e',
      '494f43b6-723e-42b7-842a-5d3116a452e0',
      '6bc340b6-f440-4e5c-92e6-5aee688a9fc7',
      'be5d68f6-5206-4a96-a2a6-72a57fa60974',
      'e772eafa-1fb2-4607-a90b-9103ec0645fd',
      'e8635fb4-427e-45f7-8b61-4a948aac9d6e',
      'e7ae1532-9404-4a3e-a6c3-ea072c86e214',
      '8d1ab75c-3fb8-4a0e-8e82-b61e7a46b1a6',
      '64ab231e-39af-43b7-a66e-74a76309d169',
      '8fe9762a-4130-4413-9c0d-0d5b44ca8b3d',
      '6b02961f-5571-4002-8868-8d9e7cc4ab58',
      'b7331cab-17ca-4976-9cd3-60001741e505',
      '3849bcaf-74e9-4d2b-8804-2cafa109a0c6',
      '41156347-1cfc-4f0e-a7f9-3c5aebd29c08',
      'ea2b796d-8da7-4089-a6ec-3720eeddfcf9',
      'e9320542-ae82-42a1-a1bf-46c497b447b4',
      '7a46153b-76f4-4bad-b57b-96557dfd3298',
      '30b2afa7-171f-4188-a5c8-04dce93bff01',
      '976e9453-0c44-4f29-a8f7-4bacf9ac7f0c',
      'a30db75a-631b-4c7b-8dc5-c9f00e13a9cb',
      'd50b3680-a29e-490d-95c9-0f293461d90c',
      '45aacf2b-48c4-4f87-90cf-a8f644bb3080',
      'eea86fc6-470a-48b9-af3a-d239fa6c9767',
      'bca7fc24-2b4e-4e41-a60f-1d5da0e2fb13',
      'e01dec8b-734f-4405-b796-c77967aa63b9',
      '6284ab51-a3c3-4269-bead-6f370f704bf7',
      '7998b4d6-652d-4fed-9de6-79d23853e471',
      '007ccd45-8c75-47d1-8c37-02c7592fe6d7',
      '13041803-65a1-4873-ab20-66ec51774598',
      '0670d1d7-d63b-45e1-a57a-dda650d05fc0',
      '546b1084-e5f3-4631-8d1b-72d71b2955de',
      'c5075ca1-eb66-4017-b95a-a643241b2fb9',
      '669922f7-7484-4064-b189-d3d83da18009',
      '6ea2b6fe-f3f2-4aec-aa20-f99b52884f60',
      '48ce23ac-80e0-4483-a5b1-022bcccdcbf1',
      '651c13b2-0235-4288-bcd6-cbaa756c2899',
      '9690b147-6c4f-4c9c-b1a9-53b40ba8c035',
      'e957df99-f7dc-46f2-8951-c6c2cd2c64e2',
      'adeeaf7b-9f7d-462e-a9b1-8a6cafccaccc',
      '6088df58-1a57-4e66-aba2-c2835344e010',
      '505efa4f-b3ea-4608-b62f-c003a5ccef83',
      '3c4591b8-2f4f-4a82-b8c0-ad95834d5614',
      'eff3a7d8-d60d-46e0-aa42-4a376e68bcd6',
      'bf9b50dd-645e-4385-b15b-44e1ecdf2a56',
      '7afa3267-fb53-47a9-9659-e0dd1eb98ddf',
      '87792fb2-3e85-4196-afcd-d1f8ea809d09',
      'b6254978-1faa-412f-ba7d-dc77fd80bfb4',
      'f2fbcd70-148b-4137-9dec-9030c0382a4c',
      '399b6df5-4e29-4f12-98e0-cb415b48d6e1',
      '9b7ae190-bd3e-46d2-83ca-6204f35b3268',
      'd6797717-3652-4fcb-a50d-55fc7981dbfd',
      'eff646d9-61cd-4f17-97bc-98ee7240e54c',
      '3859f78e-2dec-4fdc-8fe3-ae0385cc348e',
      '2bb41ff2-15ac-467c-922d-7b26c6f6201c',
      'bfd7bd88-c63d-4a8f-b690-4223b7e444e6',
      '3373d43b-c96b-4963-8f5a-16d1735c0fd9',
      '91ace996-4871-427c-8136-3e6966af74b0',
      'f70307d9-31a7-401c-a85c-e88de72cc9ef',
      '11d8a68d-25e1-4f27-bcc2-0403cb524f73',
      '58f02299-27ff-40dd-8cbd-7ab4e160d719',
      'aae65758-9817-4a57-812e-c3aa8b6a7620',
      'ae30fe4c-1748-4bcf-9055-410fb6bc167b',
      'af0e4f5d-5581-4fe3-a7e0-eadba104cf81',
      'd1948c99-bd57-4871-a744-6f8415d9c252',
      'f7ab495c-e2d7-4773-904a-d52993c75207',
      'd852de82-e888-4465-9712-eceb5cd5ff72',
      'cb16dc92-39c8-4a30-9aed-947a65656320',
      '29f43cd5-345f-45c2-a42c-e583f35f68be',
      'cb46b445-67e7-4fe7-8ab0-a7ec04aa5b0a',
      'd9862299-4e50-4164-b03e-01dd6a3c1d42',
      '310ebc2b-c41c-43bf-a813-a84316df3d31',
      '83650040-d769-4220-9749-27aa6abb7137',
      '52baed25-ddb9-48d8-80c3-87f038691ec2',
      '7e00174c-276c-4067-b70c-c8cfb4c4cd46',
      '457f0c08-131d-48d7-9fc8-7f45daea0b1a',
      '0f18d58a-af8b-41fb-bccf-da2cd062c4a8',
      '92b81213-faa9-42f3-9c90-72a5c3fd86d6',
      '6d5a48d9-b807-4a58-a1db-cae9945cd297',
      '36231906-3a92-48ba-8661-81f159fccea5',
      'b3e05e39-9869-4c85-a9ca-0fab55d3ac67',
      'f37b4f2a-8e37-4d31-873d-eee9011b4dbb',
      '7773e29e-5914-4ac5-a261-43da1360121d',
      '0c9d7397-7054-4a91-9e3c-302168fb2811',
      'b032724f-d883-4bd7-b360-4c72177703c5',
      '4dfe4b16-6669-4fe7-9999-a84f24721342',
      '9e45dbb8-368e-45e6-8bd0-498ce8492a70',
      '2419a51c-0e9b-421f-832d-d91904d56cea',
      '5b967fc1-8dd9-456e-9740-dcb9d1614bcc',
      '34387602-4e6e-4ac2-9100-7cb2f41244c2',
      '43a1c557-6e95-4e84-adda-6e1489ba27b3',
      '356960ee-a22c-4557-a86e-f1856c1b68d5',
      '70c7576e-4e2d-4adc-a4ac-d4a167141c77',
      'e7731814-802f-4950-a4c3-2b3e63768638',
      '08979667-32d5-4736-882a-3c3d1f1aeeba',
      '4daff2a2-45a5-49bf-85ef-352666fb2a16',
      'ec9479f3-e98e-4b39-af8a-4eceb0fa7b9b',
      '6cff1c3a-e1f0-4ab9-afa3-199f7b6f85e9',
      'e30b7e5b-ba47-4a0b-987d-df11a6d8ecb0',
      '01c65aee-3e34-4294-bba7-cfb15e993a5e',
      '94410c8c-8d90-4c17-95de-951589174b6a',
      'c1079bad-1f41-4d47-9375-e216066d50c3',
      '2c9e6006-b86a-4287-80c1-d435b4f0230f',
      'ad0cec55-f647-4980-afba-a1f7dacef875',
      '3cf25b7d-91e5-4e3e-94e9-e72a8b1c45e6',
      '7232ae75-6ed9-4c65-b1fc-d04bb6eeed19',
      'd9e4895f-4052-4886-9708-a8390733fa5b',
      '11ab31aa-ca27-4147-8e67-7935d74aff2a',
      '7a549b4b-7a3a-4b0b-b11c-ec30b3b61d6e',
      'bdf02498-60d3-4809-9e46-467084c8aa5f',
      '4273dfad-1356-4a20-850f-d34fa4522cd4',
      'de56cf31-195d-4789-a6a1-765409a8d197',
      '701fe4b2-0152-4576-af99-b14c4ad37735',
      'f7661472-b4d6-4373-8de7-3d9d9958c8ff',
      '1864ba22-76c4-4062-b107-fbf81f8108fc',
      '1ef13d2e-894b-4a07-9d59-c046f60eb830',
      '997e5daf-c54d-4090-a42d-738fd5f58b95',
      'd69d2fbc-4a56-4a60-989a-366e747c83e7',
      'cd3cb65a-86e5-4bd6-a12a-4becac082946',
      '9285b161-8fd5-4115-af7e-97a687c5a153',
      'f1241aab-bdd4-4006-8b0c-0ad27ed22415',
      '4a4a11ac-bf6c-4de5-92fd-ae4b48befa9c',
      '816b8e27-2cd7-41ee-804b-b81b33055fa6',
      'a1242649-f170-425d-9ee3-2edaca0b03f2',
      '9a52d159-c183-4ee2-a66b-df570270fec2',
      '977751c1-8872-402a-8e37-938158d64748',
      '1e65f4b3-040d-4cd1-8935-1af2e9dfb66d',
      'ee1c28f8-dc28-4484-a65f-83aca2a8fd06',
      '329219b2-82fb-46fd-8cca-e0c3d277fd33',
      '75970561-8af3-475f-a907-1389dcff5bc8',
      'ef05e7d1-5681-482d-b63c-ae4cb626fd1f',
      '9133a25b-534d-4e17-a390-c533bc38efe9',
      'c8528d39-9a31-4f34-b73d-4447c5cf955a',
      '3198bd70-abb9-4136-9484-efed2627ea72',
      'cd006bf3-385f-4b95-8684-3fad0337163d',
      'f201d940-cc32-4873-832b-98a76cc2563e',
      'b7f4cb4e-071f-476f-88ca-3970f9a94edb',
      '9c54f3bb-c11e-4210-a257-58d9fb7ace48',
      '357f0383-86c5-44b5-b68d-212276bd82f1',
      '6c2e767f-f48a-4836-afc3-511efa86a5fb',
      '6adcaeed-57af-4e9f-8874-c61e4b154a40',
      'cd31e239-dfaa-44f5-8e79-501a6a77c88c',
      '060280de-af33-4a77-9328-8b4947c9991f',
      '61db0251-8488-4676-9ff9-8a45c87899d4',
      '1d2443d2-5dca-485c-b000-2f755661ef23',
      '8e493959-16b6-4b00-bd80-a8938480684f',
      'b73b69f0-00fa-49ac-86a6-654abc71f698',
      '89a3deaa-9d4f-4f78-b4cd-6ff86a13065e',
      '6c582f2e-9a34-41eb-8121-61208a3767f4',
      '1125fad7-06a8-4cd9-9938-5ac7e880d099',
      'b362ac9c-6bb6-4245-8e88-cce92822cd24',
      '3601086e-8af0-473d-b21a-1c76a2ba2dbf',
      '236f6187-a685-46fc-bb85-c6cdf0010b58',
      '8aab4e33-e0e9-4245-b411-1bbaeda474a5',
      'ffb79074-af3d-419c-bdf6-6b700b8eabad',
      '10f8b29f-2a54-4c12-8ff8-8effe3d31a61',
      '231f4f0d-c99a-4d21-bc34-ce90ecacb7e5',
      '80b9dbc5-ba4d-48b2-8baf-cd51df5729dd',
      '823ab9ac-5f15-4d61-b57d-e17bd8d16f1d',
      'c4442752-b497-437b-be2c-22e406a34dd0',
      '71991d3f-4980-49aa-a5c3-169a61542922',
      '34f949b4-4fa3-42f6-a6a5-3c47e893e76d',
      'd27f2ca3-47df-4305-8b1e-1cdc5345a76c',
      '91cb7773-8c9c-47a8-ba2e-bb27b9b1f7f5',
      '6b98da3d-f494-465e-b89c-376591fce067',
      'cb0f6d87-0c7d-4bc8-82b7-f02000e5dc30',
      'de6641c7-b8f9-495c-a2f5-0c68bc43453e',
      'e7ee62e2-ac14-45e6-a700-2386454101d1',
      'fb9b8ebd-52cb-4c01-8668-5da233a5f2d8',
      'fd0b60f0-ec55-4a7b-a0d9-969cd847bf22',
      'f59868e3-0e49-46ad-aec5-69486dc07fd0',
      'ce82b1a7-64ba-4313-a755-17dde7a938f2',
      '2544b4f1-db0f-4511-b519-0fa0b37b4c12',
      '36860b58-6aba-48cc-a923-87bb1c684580',
      '76312662-85fb-40c2-b241-edfd66cd60d3',
      '02d60502-27d9-49e4-b383-cc6fa8084744',
      'cf53098d-399b-4121-8bb7-6ff44e32afd9',
      'e7b5454d-6014-4bbc-857a-fa7ae206d61d',
      'af168ad8-1463-4204-a2c8-922ac0d7931b',
      '3e15c93c-311e-4a28-8877-5ddc770d0284',
      'bed92f39-bc6c-4ad6-b0aa-6b9dc51ce045',
      'f06924bd-ccf5-4dcc-a54f-db6306f49ad2',
      'be489ab1-e110-45a8-831e-69b2402d559f',
      '3f0c65da-8972-4811-a169-a0cba68a81e9',
      '650572f4-5a56-4da9-88cb-c810209d0543',
      '54c2f2ca-ae8d-4320-8cb3-24c204d20057',
      'd75ee72a-e723-4ab0-86ee-0ce3e6dcaf65',
      'a3252bc6-46c9-4757-a22d-d5dd7075a80b',
      'e39d89e9-ad19-4c4b-84ab-b9cb45c72d77',
      '5148cbd2-4fc0-4377-8745-9702ffb73ae8',
      '2487db31-2e57-4303-bf12-6cf4f50b0db0',
      '321688bd-63b2-4846-aac1-7962ddd0e7b8',
      'aed6632f-0cb7-4ba3-a6d7-2904cfeec960',
      'e678fc5e-f894-4e97-9cbb-cd5ebe549ef6',
      'ead7e41e-0975-4e3f-a332-993df6aef8bf',
      '75695c26-b990-47df-a973-8e4e03cd9de5',
      '85decdd6-218f-447c-a91d-76bbc9835c9f',
      '34bca553-42e1-4226-8ab8-50e6055e262f',
      'd13f6e60-c792-43a3-ab62-5edb8de640aa',
      'f214aada-b509-48dc-97ab-57c7ba5f3cee',
      'dfb0f2f7-9c33-47d5-a071-72f38adb6292',
      '70e523f8-a6dc-4283-8485-97d7eb574b36',
      'cead7e1e-1593-4221-852e-db969ed6ec4a',
      'df9d5727-a5a3-4592-9a00-cd916f63befe',
      'e1b45755-1f2d-4b92-a92d-45923cb8de0b',
      '9ce83880-ff04-43ea-a6db-9f711fff0bc5',
      'd44be4d1-286d-41c6-ba10-e7dc31d2c83b',
      '98b1cc2f-0971-4f10-8d8a-f080370d17f4',
      '374511b0-7683-442e-9a46-0325acd1ebe1',
      '576997e4-6669-4484-8843-d08192254bff',
      '3c1b79ab-97f2-4bbd-be57-de5658af3561',
      '939fa161-bf67-4551-b9f3-589a217e3257',
      '636e1e78-f9bd-4da3-ba6d-3ac1d5af17ba',
      '96f5431a-2a3b-4f0b-8b01-13927dba15d2',
      'a24daf7a-5553-4a6b-97ae-bbe5f3f079e8',
      '08d2a842-97e7-4b8e-b8f5-a488696bba95',
      'b4b61d30-3430-4d55-bc27-da951bc8f47d',
      '4090bc79-760a-4e67-b2f1-44669f72ce54',
      '291902d4-52bb-4bf9-9013-701858021a34',
      '690184d5-5800-4e73-b131-7243c8e4fbb7',
      '7cfbc7e1-fc67-4b17-aec6-c3fc29ad4336',
      '46979709-181e-4132-90f7-957a6437d25e',
      'bffb38ae-14cd-4b41-8ac5-e31855603230',
      '23b0d425-636e-4d93-9c3f-f60cfea1ec20',
      '48f046e5-ed2e-4c5d-af76-6b658818c6d2',
      'ed1da291-f02a-4b5d-9881-6116039f945c',
      '5deefea2-6b06-450e-8993-ca9dc919003f',
      '8afa9c58-f64c-4ea8-8e57-e521c5704bce',
      'b1f5f4ab-441f-431b-9a5e-068c2db62152',
      '5458e606-a496-45db-8386-d2d239771644',
      '66621896-af06-446a-a6dc-559150c3bef0',
      'd0e760e2-a258-49a1-a0e1-7da2f2de17c6',
      '9615fb1c-d19c-4157-a1d2-3273719d46d4',
      'e3b39b64-388e-4df2-8886-09dfbcec2536',
      '20b4f9b0-7527-4c9a-a4f4-a3ff11636403',
      '4cff0a57-4cad-4c7e-abac-b891a59676d1',
      '00997558-9666-4d56-bcad-9cfd78998a3c',
      '236f30d1-d4ec-45a5-83e0-8a6d0f50ce4c',
      'e3716c4f-0f48-48e8-9b23-06c78b972ee5',
      '9b7503af-7cab-4560-aab5-1bc0fe0426e6',
      'ed278a5b-4795-4e98-ba63-c8a1db648127',
      '35ce9345-af9a-420d-8085-6c931b38f4ca',
      '0f1137f3-0ad0-4b00-be50-3fa4a19e74a5',
      '0e35e39b-8899-4426-8ece-663547ca37de',
      'fbe593ca-cf70-4ed3-8b75-19bf5572a74f',
      '9eb40286-5319-4fa3-b97d-d91546d085a6',
      '15764c09-e6b5-4609-9ddb-bf8a187da9cb',
      '5f75ca9e-bbfe-46a3-81a0-255c6ab8a1db',
      '6c20e88f-8628-4107-984b-487ac28671d6',
      '8bcc9ad9-cb84-4bb1-8a32-634dbbb4c95b',
      '9fec6cb0-d13d-4823-ad21-9da443da868c',
      'e1d7f8db-509c-4607-8384-d205c34cd1fe',
      '76904c42-3f6b-4aba-9798-00a2bd5ad76a',
      'e1feb316-8ba8-41e5-9f0e-1f1e2c93aae0',
      '4756451f-6f10-4559-98ec-a21066da3af0',
      '60f55bf4-c360-462c-b5a6-0c46e257fbbc',
      '7082454f-04ae-403d-a91f-a9ae322023c0',
      '4177989f-ff88-47c1-96d6-2c67cf013d91',
      '0ddc5836-e225-4d98-b91f-b1a76fc0a43f',
      'e99f3f34-aa0a-4137-8a65-396fba217444',
      'd28a0ea7-60bb-4fce-b9d5-23957f69c0a6',
      '1feefbda-99d7-4643-b981-b7222fca18d5',
      '0fc23f87-4928-42ad-b525-205e2f6f2170',
      'ce2d73b0-f10f-4b4f-918b-9d6adcfc407d',
      'f52ea900-c119-42c7-8d7e-953edf1cf40c',
      '36939e83-2c8e-4433-ad56-0004ef23349a',
      'c2bece04-2a7e-45e1-8e89-61ef8abef291',
      '0efd3b17-6416-4919-9ee1-ccdd8aa120dd',
      'd28c0978-7686-415a-ae07-5f27ddcde47e',
      'aec1787c-cb21-4a99-a746-3e9bfd861604',
      '7547ff7c-ba65-4a88-87da-623f96594f79',
      'aeb9bce9-9ff5-4602-ade7-cbc4c15fc422',
      '4f9a157e-a686-4b76-b66c-e7b2cbf39962',
      '38cd1423-b0f8-4d65-b13b-2649585925c9',
      '2bfc5adc-38b7-4313-9835-2afee1b319a0',
      'fa43e44a-ae20-4967-b234-e676ce2dbc1b',
      '7f815be3-f7cc-4fda-82e3-bf865f97cf50',
      'a8c37f43-859d-4f65-be54-ee2b8fbe4cd8',
      '8ff9b443-340e-4952-8c2c-67e0c3fecc16',
      '83b3e537-2a52-4df1-9df8-3c23438a5b4b',
      '15c1a567-fd28-4133-ad6b-70f6ea1da4a8',
      '307d8b6f-22da-45fd-9ad7-1003d9a4279e',
      'f14894fa-5977-4193-9429-ec2de104fd75',
      '2d8ee101-25a0-4c0c-8650-6206fd21569f',
      '00c05bf3-9c76-4954-9c93-c11753a673e6',
      '8ce2b5ed-d086-4e88-8524-edac8aa61736',
      '6ffaecd7-4838-4029-a64d-b42dd8d6675d',
      'd78497a2-43e7-4ed7-bb29-961359ae358b',
      'a7079dd9-2f23-4be1-bf3f-dc6eb00a18de',
      '265bf819-8e4f-46c3-b780-9e92c31c086b',
      '74dd110a-1bb4-4b72-ae37-78aa4d733a88',
      '96e127e4-4a82-4978-91aa-5f2739d8617e',
      'ae7b4bec-07e5-4d53-a695-405409307c1e',
      '29e3fd6c-41f1-41e0-82a0-51d2cf371586',
      '2b4bead5-fd4f-45d4-81e6-863337acef63',
      'f8bb8f8f-a9aa-430c-b2b9-cea1bf406ce3',
      '47e0aa50-15e8-49b5-8cf6-25433f86be0e',
      '7cc09cff-5052-40dd-9ec8-2e01a66d45bd',
      '5ed3a815-567c-4ee3-b0c2-2826313af77b',
      'b02086f5-5835-4b6c-8cbe-ba8e65bee29e',
      'c6930dd9-009b-411b-b873-22579a1b87d5',
      '903b7d08-5f5d-49b7-ab68-f5e2850462cf',
      '5ffb4019-b399-4cfb-8869-667dd3bd3caa',
      '9310c5f6-6dad-40da-b68d-632cdfc27214',
      '7d301f67-52bd-4ced-87b2-ee58cd4066be',
      'c5309077-795a-4495-92db-d11ae8d63c19',
      '1f5b926c-b2cc-4506-945a-a9b0a7119f05',
      '7c380f9f-57e5-43dc-ae46-a56c4524664f',
      'acf91d2d-eda1-49ab-b337-17cbfc8d6cac',
      'e0079963-34cd-4639-a1d9-849e4a129ec8',
      '35a7d38e-de1b-41ec-9ac9-d320d9024ccd',
      '34e98df4-bf17-4a7a-bfc8-077f1ed09aea',
      '792bbb45-0c01-4ad7-a054-957894f0c532',
      '1a78f68c-25f0-45d4-bbce-297f1216a96f',
      '241a62fb-4910-40bf-a436-477521976303',
      '00dbd33e-9caf-436c-a3f3-d7244a498b6e',
      '5f0cb985-a765-42ab-b525-9a636a70101b',
      '4c808eea-ff86-4c06-ba4f-9cb89370191b',
      'fd4f38ee-19af-4d5f-b561-8613d131a6e9',
      '959530c2-3fff-4e57-9809-07b91d18f5a1'
    ],
    resourceTypes: ['Observation'],
    handler: fixQty3
  },
  {
    resources: [
      'f7263358-f9ca-4254-a839-9d23b7b3c098',
      'a30ccca1-bd2f-4be7-8db4-14e27fb72527',
      'dff04b8f-a9fe-4d6a-ad2e-3e4be01927bc',
      '40b50f2c-7942-4ad4-ac20-a1c2d6467a1c',
      '7675a97b-6820-4d21-b00f-f27b32e7da1a'
    ],
    resourceTypes: ['RiskAssessment'],
    handler: fixRiskAssessment
  },
  {
    resources: [
      '917bff7b-a684-40b2-ad25-0f29f03b8da7',
      '49e17e4e-06e4-4bd7-bd32-332ad5f04bd4',
      'f1ca2556-4a58-4905-b1f2-5769fcc0ea99',
      'e85b483f-06fc-48d1-b2b0-4197295108af',
      '03eb68f2-3022-40e2-a970-9c44d92156a6',
      '9cfbf8ab-7eae-4287-b5f3-3f5a2aac5829',
      'a2ea7b39-6376-481c-9b89-c38c60543876',
      'da3925db-716a-4659-8bf6-fe753f3d291e',
      'c91d7b52-cab7-4eb0-b91d-fee022282105',
      '601e77c9-4b9d-45b9-8cac-4bda108867c9',
      '2b1ae660-73f0-40df-9907-6efb70155da6',
      '53a3b7e5-e6ee-4f8e-aaf7-2b20d58b5942',
      '929b6729-0512-4294-9bce-49b5810e8f53',
      '7996d913-cbed-40ac-b592-dbb447cbb3e5',
      'a6bd8738-1d93-4481-ac40-0d75263f343c'
    ],
    resourceTypes: ['Task'],
    handler: fixTim1
  },
  {
    resources: [
      '443c0f4f-820a-441a-aa48-c3e9d4e64b4c',
      '59d0f5bc-ca20-4315-91c1-897b82d02425',
      '61af0687-9790-451a-9974-191ebf785fb4',
      '3c92bb5d-9007-4fda-ab35-d49a0b8c1bec'
    ],
    resourceTypes: ['FamilyMemberHistory'],
    handler: fixFamHistoryExtEmpty
  },
  {
    resources: [
      '443c0f4f-820a-441a-aa48-c3e9d4e64b4c',
      'b6a47d1f-179c-4d39-965c-1f2e02ac38a3',
      '20d10f89-1626-42a0-ad49-02e86f1e7d9a',
      '9b19124e-e813-49a5-bc9e-4e79f41ac682',
      '14cd2fa8-c0f6-4921-8235-683afbda402c',
      'e903d9a2-e00f-419a-b656-b600709e009e'
    ],
    resourceTypes: ['FamilyMemberHistory'],
    handler: fixUnrecognizedProperty
  },
  {
    resources: ['db032226-d3a5-41a8-b937-3e260e03cf3e', 'd9e230bd-59b5-4469-8209-21f28d7ad6e0'],
    resourceTypes: ['FamilyMemberHistory'],
    handler: fixUnrecognizedProperty
  },
  {
    resources: [
      '30339a03-3d5d-40ae-b984-f799ef73cbea',
      '718c749f-01f9-49ae-b3c8-dc7559dcb0cb',
      'c7374b66-5dcf-4979-9fcb-54bbc4eed328'
    ],
    resourceTypes: ['Appointment'],
    handler: fixApp3
  },
  {
    resources: [
      'c1cfd2ca-8c37-49be-8e35-8857fcae7c88',
      'bb60d8df-8056-4b3a-bf7f-bbc7e3dfce90',
      'a30344de-d076-4a29-828f-6831fd244831',
      '2707393f-ecd1-46b5-a233-09c41442560a',
      'c90ce2ad-5694-4715-abdf-367a74bd11a4',
      '590fdd33-dd16-454c-bebd-e824edca89a0',
      'dd8dd717-ccfa-46a5-a75d-c270c86fed5a'
    ],
    resourceTypes: ['Immunization'],
    handler: fixUnrecognizedProperty
  },
  {
    resources: ['cc759773-bdf1-4efa-8f16-13115946514a', 'f1f83604-b76a-4d9a-aac6-d3f33e69f07a'],
    resourceTypes: ['QuestionnaireResponse'],
    handler: fixQuestionnairePropIdentifier
  }
];

const resourceHandlerMap = new Map<string, ((resource: any) => any)[]>();

for (const err of errors) {
  if (!err.handler) continue;
  for (const resourceId of err.resources) {
    const existingHandlers = resourceHandlerMap.get(resourceId) || [];
    existingHandlers.push(err.handler);
    resourceHandlerMap.set(resourceId, existingHandlers);
  }
}

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

// processMasterNdjson().catch((err) => console.error(err));
console.log(JSON.stringify(fixRiskAssessment2(sampleRiskAssessment1)));
console.log(JSON.stringify(fixRiskAssessment2(sampleRiskAssessment2)));
console.log(JSON.stringify(fixRiskAssessment2(sampleRiskAssessment3)));
console.log(JSON.stringify(fixRiskAssessment2(sampleRiskAssessment4)));
console.log(JSON.stringify(fixRiskAssessment2(sampleRiskAssessment5)));
// console.log(resourceUtils.getResourceProperty(sampleFamilyMemberHistory, 'deceasedBoolean'));
