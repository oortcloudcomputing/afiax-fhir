// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The printed prescription (ADR-016 step 1): one page per visit listing each medicine with its
// prescription code and a QR code of that code, so any pharmacy can scan or type it. The QR holds
// only the code: no patient or medicine details are encoded in it.

import {
  calculateAge,
  formatHumanName,
  getKenyaFacilityAuthorityIdentifier,
  getKenyaPractitionerAuthorityIdentifier,
  getKenyaDoseUnit,
  getKenyaPrescriptionCode,
  KenyaPractitionerKmpdcRegistrationSystem,
} from '@medplum/core';
import type { Encounter, MedicationRequest, Organization, Patient, Practitioner } from '@medplum/fhirtypes';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

export interface KenyaPrescriptionDocument {
  readonly encounter: Encounter;
  readonly patient: Patient;
  readonly requests: MedicationRequest[];
  /** Prescribers by reference string, e.g. "Practitioner/123". */
  readonly prescribers: Record<string, Practitioner | undefined>;
  readonly facility?: Organization;
  /** When the document was printed. */
  readonly printedAt: string;
}

/**
 * Whether a medication request belongs on a printed prescription: active or on hold, with a code.
 * @param request - The MedicationRequest.
 * @returns True when it should be printed.
 */
export function isPrintableKenyaPrescription(request: MedicationRequest): boolean {
  return (request.status === 'active' || request.status === 'on-hold') && !!getKenyaPrescriptionCode(request);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Age in words: years from 2, else months, else days.
 * @param birthDate - The birth date.
 * @param on - The date to work out the age on (ISO date-time).
 * @returns The age, e.g. "38 years".
 */
function ageInWords(birthDate: string, on: string): string {
  const { years, months, days } = calculateAge(birthDate, on.slice(0, 10));
  if (years >= 2) {
    return plural(years, 'year');
  }
  return months >= 1 ? plural(months, 'month') : plural(days, 'day');
}

/**
 * Quantity with its unit, plural where countable: "15 capsules", "100 mL".
 * @param value - The quantity.
 * @param unit - The unit (a KenyaDoseUnits code, or free text).
 * @returns The quantity in words.
 */
function quantityInWords(value: number, unit: string | undefined): string {
  const known = getKenyaDoseUnit(unit);
  const word = known?.countable && value !== 1 ? known.plural : (known?.display ?? unit);
  return word ? `${value} ${word}` : `${value}`;
}

function patientIdentifiers(patient: Patient): string {
  return (patient.identifier ?? [])
    .filter((i) => i.value && !i.value.startsWith('urn:') && (i.type?.text || i.type?.coding?.[0]?.display))
    .map((i) => `${i.type?.text ?? i.type?.coding?.[0]?.display}: ${i.value}`)
    .join('   ');
}

function prescriberLine(practitioner: Practitioner | undefined): string {
  if (!practitioner) {
    return 'Prescriber: not recorded';
  }
  const licence =
    getKenyaPractitionerAuthorityIdentifier(practitioner)?.value ??
    practitioner.identifier?.find((i) => i.system === KenyaPractitionerKmpdcRegistrationSystem)?.value;
  return `${formatHumanName(practitioner.name?.[0], { prefix: true }) || 'Prescriber'}${
    licence ? `   Licence no. ${licence}` : ''
  }`;
}

function medicineRow(request: MedicationRequest, prescriber: Practitioner | undefined): Content {
  const code = getKenyaPrescriptionCode(request) as string;
  const medicine = request.medicationCodeableConcept?.text ?? request.medicationCodeableConcept?.coding?.[0]?.display;
  const dose = request.dosageInstruction?.[0]?.text;
  const quantity = request.dispenseRequest?.quantity;
  const validUntil = request.dispenseRequest?.validityPeriod?.end;
  return {
    columns: [
      { width: 90, stack: [{ qr: code, fit: 84 }] },
      {
        width: '*',
        stack: [
          { text: medicine ?? 'Medicine not recorded', bold: true, fontSize: 12 },
          dose ? { text: dose, margin: [0, 2, 0, 0] } : '',
          {
            text: [
              quantity?.value !== undefined ? `Quantity: ${quantityInWords(quantity.value, quantity.unit)}` : '',
              validUntil ? `${quantity?.value !== undefined ? '   ' : ''}Valid until: ${validUntil}` : '',
            ].join(''),
            margin: [0, 2, 0, 0],
          },
          { text: prescriberLine(prescriber), fontSize: 9, color: '#444444', margin: [0, 2, 0, 0] },
          { text: code, bold: true, fontSize: 14, characterSpacing: 1, margin: [0, 6, 0, 0] },
        ],
      },
    ],
    columnGap: 12,
    margin: [0, 8, 0, 8],
    unbreakable: true,
  };
}

/**
 * Builds the printed prescription.
 * @param doc - The visit, patient, prescriptions and prescribers.
 * @returns The pdfmake document definition.
 */
export function buildKenyaPrescriptionDocument(doc: KenyaPrescriptionDocument): TDocumentDefinitions {
  const { patient, requests, prescribers, facility } = doc;
  const facilityCode = getKenyaFacilityAuthorityIdentifier(facility)?.value;
  const age = patient.birthDate ? ageInWords(patient.birthDate, doc.printedAt) : undefined;
  const sex = patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : undefined;
  const identifiers = patientIdentifiers(patient);
  const rows: Content[] = [];
  requests.forEach((request, index) => {
    if (index > 0) {
      rows.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#bbbbbb' }] });
    }
    rows.push(medicineRow(request, prescribers[request.requester?.reference ?? '']));
  });

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: 'Helvetica', fontSize: 10 },
    info: { title: 'Prescription' },
    footer: (currentPage: number, pageCount: number): Content => ({
      text: `Electronic prescription (DHA Kenya ePrescription). Any pharmacy can scan the QR code or type the code.   Printed ${doc.printedAt.slice(0, 16).replace('T', ' ')} UTC   Page ${currentPage} of ${pageCount}`,
      fontSize: 7,
      color: '#666666',
      margin: [40, 20, 40, 0],
    }),
    content: [
      { text: facility?.name ?? 'Health facility', bold: true, fontSize: 14 },
      facilityCode ? { text: `MFL code ${facilityCode}`, fontSize: 9, color: '#444444' } : '',
      { text: 'PRESCRIPTION', bold: true, fontSize: 16, margin: [0, 12, 0, 8] },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [
              {
                stack: [
                  { text: formatHumanName(patient.name?.[0]) || 'Patient', bold: true, fontSize: 12 },
                  {
                    text: [age ? `Age ${age}` : '', sex ? `${age ? '   ' : ''}Sex: ${sex}` : ''].join(''),
                  },
                  identifiers ? { text: identifiers, fontSize: 9 } : '',
                ],
              },
              {
                text: `Date: ${(requests[0]?.authoredOn ?? doc.printedAt).slice(0, 10)}`,
                alignment: 'right',
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 8],
      },
      ...rows,
      { text: 'Signature: ______________________________', margin: [0, 24, 0, 0] },
    ],
  };
}
