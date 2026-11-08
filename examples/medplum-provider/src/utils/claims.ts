// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { CPT, createReference, HTTP_HL7_ORG, KenyaIcd11System } from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  ClaimDiagnosis,
  ClaimItem,
  Coding,
  Condition,
  Coverage,
  Encounter,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { calculateTotalPrice } from './chargeitems';
import { createSelfPayCoverage } from './coverage';

export async function createClaimFromEncounter(
  medplum: MedplumClient,
  patient: WithId<Patient>,
  encounter: WithId<Encounter>,
  practitioner: WithId<Practitioner>,
  chargeItems: WithId<ChargeItem>[]
): Promise<WithId<Claim> | undefined> {
  const coverageResults = await medplum.searchResources('Coverage', `patient=Patient/${patient.id}&status=active`);
  let coverage: Coverage = coverageResults[0];
  if (!coverage) {
    coverage = await createSelfPayCoverage(medplum, patient);
  }

  const claim: Claim = {
    resourceType: 'Claim',
    status: 'draft',
    type: { coding: [{ code: 'professional' }] },
    use: 'claim',
    created: new Date().toISOString(),
    patient: createReference(patient),
    provider: createReference(practitioner),
    priority: { coding: [{ code: 'normal' }] },
    insurance: [
      {
        sequence: 1,
        focal: true,
        coverage: createReference(coverage),
      },
    ],
    item: getCptChargeItems(chargeItems, createReference(encounter)),
    total: { value: calculateTotalPrice(chargeItems) },
  };
  return medplum.createResource(claim);
}

export function getCptChargeItems(chargeItems: ChargeItem[], encounter: Reference<Encounter>): ClaimItem[] {
  const cptChargeItems = chargeItems.filter((item) => item.code?.coding?.some((coding) => coding.system === CPT));
  return cptChargeItems.map((chargeItem: ChargeItem, index: number) => {
    const modifiers = chargeItem.extension
      ?.filter((ext) => ext.url === 'http://hl7.org/fhir/StructureDefinition/chargeitem-modifier')
      .map((ext) => {
        return ext.valueCodeableConcept;
      })
      .filter((modifier) => modifier !== undefined);

    return {
      sequence: index + 1,
      encounter: [encounter],
      productOrService: {
        coding: chargeItem.code.coding?.filter((coding) => coding.system === CPT),
        text: chargeItem.code.text,
      },
      net: chargeItem.priceOverride,
      ...(modifiers && modifiers.length > 0 ? { modifier: modifiers } : {}),
    };
  });
}

/**
 * Builds a claim's diagnosis list from the encounter's conditions, in rank order. Uses the ICD-10
 * code (from ICD-10-CM) where there is one, otherwise the ICD-11 MMS code (Kenya: SHA / DHA eClaims).
 * @param conditions - The encounter's diagnoses, principal first.
 * @returns The Claim.diagnosis entries.
 */
export const createDiagnosisArray = (conditions: Condition[]): ClaimDiagnosis[] => {
  return conditions.map((condition, index) => {
    const icd10Coding = condition.code?.coding?.find((c) => c.system === `${HTTP_HL7_ORG}/fhir/sid/icd-10-cm`);
    // Kenya (SHA / DHA eClaims) claims carry the ICD-11 MMS code
    const icd11Coding = condition.code?.coding?.find((c) => c.system === KenyaIcd11System);
    let coding: Coding[] = [];
    if (icd10Coding) {
      coding = [{ ...icd10Coding, system: `${HTTP_HL7_ORG}/fhir/sid/icd-10` }];
    } else if (icd11Coding) {
      coding = [icd11Coding];
    }
    return {
      diagnosisCodeableConcept: { coding },
      sequence: index + 1,
      type: [{ coding: [{ code: index === 0 ? 'principal' : 'secondary' }] }],
    };
  });
};
