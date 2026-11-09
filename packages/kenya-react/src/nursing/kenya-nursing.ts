// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya nursing records:
// - doses given (or not given) against a prescription, as MedicationAdministration (FHIR R4; DHA's
//   IGs have no MedicationAdministration profile);
// - nursing notes, as DocumentReference following DHA's Kenya Core DocumentReference profile (status,
//   type, subject, content), typed LOINC 34746-8 "Nurse Note".

import { createReference } from '@medplum/core';
import type {
  DocumentReference,
  Encounter,
  MedicationAdministration,
  MedicationRequest,
  Reference,
} from '@medplum/fhirtypes';

export const KenyaCoreDocumentReferenceProfile =
  'https://fhir.dha.go.ke/core/StructureDefinition/kenya-core-documentreference';

/** LOINC "Nurse Note" document type. */
export const NurseNoteType = { system: 'http://loinc.org', code: '34746-8', display: 'Nurse Note' };

export interface KenyaDoseInput {
  readonly request: MedicationRequest;
  readonly encounter: Encounter;
  /** True if the dose was given; false records that it was not given. */
  readonly given: boolean;
  /** When it was given (or due), ISO dateTime; defaults to now. */
  readonly when?: string;
  /** What was given, e.g. "500 mg orally". Defaults to the prescription's dosage text. */
  readonly doseText?: string;
  /** Why it was not given, or a note on the dose. */
  readonly note?: string;
  /** The nurse (signed-in practitioner). */
  readonly performer?: Reference;
}

/**
 * Builds a MedicationAdministration for a dose given (or not given) against a prescription.
 * @param input - The prescription, visit and dose details.
 * @returns The MedicationAdministration to create.
 */
export function buildKenyaMedicationAdministration(input: KenyaDoseInput): MedicationAdministration {
  const doseText = input.doseText?.trim() || input.request.dosageInstruction?.[0]?.text;
  const note = input.note?.trim();
  return {
    resourceType: 'MedicationAdministration',
    status: input.given ? 'completed' : 'not-done',
    statusReason: !input.given && note ? [{ text: note }] : undefined,
    medicationCodeableConcept: input.request.medicationCodeableConcept,
    medicationReference: input.request.medicationCodeableConcept ? undefined : input.request.medicationReference,
    subject: input.request.subject,
    context: createReference(input.encounter),
    effectiveDateTime: input.when ?? new Date().toISOString(),
    performer: input.performer
      ? [{ actor: input.performer as NonNullable<MedicationAdministration['performer']>[number]['actor'] }]
      : undefined,
    request: createReference(input.request as MedicationRequest & { id: string }),
    dosage: doseText ? { text: doseText } : undefined,
    note: input.given && note ? [{ text: note }] : undefined,
  };
}

/**
 * Builds a nursing note for a visit.
 * @param encounter - The visit.
 * @param text - The note.
 * @param author - The nurse (signed-in practitioner).
 * @returns The DocumentReference to create.
 */
export function buildKenyaNursingNote(encounter: Encounter, text: string, author?: Reference): DocumentReference {
  const now = new Date().toISOString();
  return {
    resourceType: 'DocumentReference',
    meta: { profile: [KenyaCoreDocumentReferenceProfile] },
    status: 'current',
    docStatus: 'final',
    type: { coding: [NurseNoteType], text: 'Nursing note' },
    subject: encounter.subject as DocumentReference['subject'],
    date: now,
    author: author ? [author as NonNullable<DocumentReference['author']>[number]] : undefined,
    content: [
      {
        attachment: {
          contentType: 'text/plain',
          data: encodeBase64(text.trim()),
          title: 'Nursing note',
          creation: now,
        },
      },
    ],
    context: { encounter: [createReference(encounter as Encounter & { id: string })] },
  };
}

/**
 * Reads a nursing note's text.
 * @param note - The DocumentReference.
 * @returns The note text.
 */
export function getKenyaNursingNoteText(note: DocumentReference): string {
  const data = note.content?.[0]?.attachment?.data;
  return data ? decodeBase64(data) : '';
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function decodeBase64(data: string): string {
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
