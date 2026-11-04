// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya clinical decision support (DHA certification FUNC-CDS-001 and FUNC-MED-001).
//
// Checks a medication order against the patient's allergy list, current medicines, problem list,
// demographics, latest laboratory results and vital signs, and checks new laboratory results and
// vital signs against critical limits. The rules are pure functions so the server (which enforces
// them on write) and the web app (which shows them before the order is signed) give the same answer.
//
// Medicines are matched by active-ingredient name, as named in the KNHTS health products registry
// (MOH-PPB HPT): a product such as "Amoxicillin 500 mg Oral Capsule" (PH12907) or a combination
// such as "Sulfamethoxazole/Trimethoprim" (AC12372) carries its ingredient names in its display.
// All ingredient names below were checked against KNHTS HPT on 2026-11-04, and all ICD-11 codes
// against KNHTS WHO/ICD-11 (MMS 2025-01).
//
// Evidence base, cited on each alert:
//   - BNF Appendix 1 (Interactions) and the WHO Model Formulary, for drug interactions and
//     contraindications;
//   - Kenya HIV Prevention and Treatment Guidelines 2022 (NASCOP), for antiretroviral interactions;
//   - NEWS2 (Royal College of Physicians, 2017), for vital-sign red flags;
//   - CLSI GP47 (Management of Critical- and Significant-Risk Results), for laboratory critical limits.

import type {
  AllergyIntolerance,
  CodeableConcept,
  Condition,
  MedicationRequest,
  MedicationStatement,
  Observation,
  Patient,
  Quantity,
} from '@medplum/fhirtypes';
import { isIcd11CodeUnder, KenyaIcd11System } from './kenya';

/** CodeSystem for Kenya CDS alert categories (DetectedIssue.code). */
export const KenyaCdsAlertCategorySystem = 'https://afiax.africa/CodeSystem/kenya-cds-alert';

/**
 * Extension on a MedicationRequest recording why the prescriber went ahead despite a high-severity
 * alert. Without it, the server rejects the order.
 */
export const KenyaCdsOverrideExtensionUrl = 'https://afiax.africa/fhir/StructureDefinition/kenya-cds-override';

const LOINC = 'http://loinc.org';

export type KenyaCdsSeverity = 'high' | 'moderate' | 'low';

export type KenyaCdsCategory =
  | 'allergy'
  | 'drug-interaction'
  | 'duplicate-therapy'
  | 'drug-condition'
  | 'drug-pregnancy'
  | 'drug-age'
  | 'drug-lab'
  | 'critical-lab'
  | 'critical-vital';

export interface KenyaCdsAlert {
  /** Stable rule id, e.g. "interaction:warfarin+nsaids". */
  readonly id: string;
  readonly severity: KenyaCdsSeverity;
  readonly category: KenyaCdsCategory;
  /** One-line summary. */
  readonly title: string;
  /** What was found in the record. */
  readonly detail: string;
  /** What the clinician should do. */
  readonly recommendation: string;
  /** The evidence the rule is based on. */
  readonly evidence: string;
  /** References of the records that triggered the alert (e.g. "AllergyIntolerance/123"). */
  readonly implicated: readonly string[];
}

/** The patient record the checks use. */
export interface KenyaCdsPatientContext {
  readonly patient?: Patient;
  readonly allergies?: readonly AllergyIntolerance[];
  /** Current medicines: active MedicationRequests and MedicationStatements. */
  readonly medications?: readonly (MedicationRequest | MedicationStatement)[];
  readonly conditions?: readonly Condition[];
  /** Recent laboratory results and vital signs (the latest per test is used). */
  readonly observations?: readonly Observation[];
  /** Date of the check (default now). */
  readonly now?: Date;
}

// ─── Medicine groups ──────────────────────────────────────────────────────────

interface DrugGroup {
  readonly display: string;
  /** Ingredient names (lower case), as named in KNHTS HPT, plus common synonyms. */
  readonly ingredients: readonly string[];
  /** Extra words that identify the group in an allergy record (e.g. "penicillin"). */
  readonly allergyTerms?: readonly string[];
}

const groups = {
  penicillins: {
    display: 'penicillins',
    ingredients: [
      'amoxicillin',
      'ampicillin',
      'cloxacillin',
      'flucloxacillin',
      'phenoxymethylpenicillin',
      'benzylpenicillin',
      'procaine penicillin',
      'penicillin g',
      'penicillin v',
      'piperacillin',
    ],
    allergyTerms: ['penicillin', 'penicillins', 'beta-lactam', 'beta lactam'],
  },
  cephalosporins: {
    display: 'cephalosporins',
    ingredients: [
      'cefalexin',
      'cephalexin',
      'cefadroxil',
      'cefazolin',
      'cefuroxime',
      'cefixime',
      'cefpodoxime',
      'cefotaxime',
      'ceftriaxone',
      'ceftazidime',
      'cefepime',
    ],
    allergyTerms: ['cephalosporin', 'cephalosporins'],
  },
  sulfonamides: {
    display: 'sulfonamide antibiotics',
    ingredients: [
      'sulfamethoxazole',
      'sulfadoxine',
      'sulfadiazine',
      'sulfasalazine',
      'cotrimoxazole',
      'co-trimoxazole',
    ],
    allergyTerms: ['sulfonamide', 'sulphonamide', 'sulfa', 'sulpha', 'septrin'],
  },
  nsaids: {
    display: 'NSAIDs',
    ingredients: [
      'acetylsalicylic acid',
      'aspirin',
      'ibuprofen',
      'diclofenac',
      'aceclofenac',
      'indomethacin',
      'indometacin',
      'naproxen',
      'mefenamic acid',
      'piroxicam',
      'meloxicam',
      'ketorolac',
      'celecoxib',
      'etoricoxib',
    ],
    allergyTerms: ['nsaid', 'nsaids', 'non-steroidal anti-inflammatory', 'salicylate', 'salicylates'],
  },
  aspirin: { display: 'aspirin', ingredients: ['acetylsalicylic acid', 'aspirin'] },
  warfarin: { display: 'warfarin', ingredients: ['warfarin'] },
  warfarinPotentiators: {
    display: 'antimicrobials that raise the INR',
    ingredients: [
      'metronidazole',
      'fluconazole',
      'erythromycin',
      'clarithromycin',
      'sulfamethoxazole',
      'ciprofloxacin',
    ],
  },
  simvastatin: { display: 'simvastatin', ingredients: ['simvastatin', 'lovastatin'] },
  macrolideInhibitors: { display: 'clarithromycin or erythromycin', ingredients: ['clarithromycin', 'erythromycin'] },
  rifampicin: { display: 'rifampicin', ingredients: ['rifampicin', 'rifampin'] },
  nevirapine: { display: 'nevirapine', ingredients: ['nevirapine'] },
  dolutegravir: { display: 'dolutegravir', ingredients: ['dolutegravir'] },
  lopinavir: { display: 'lopinavir/ritonavir', ingredients: ['lopinavir'] },
  hormonalContraceptives: {
    display: 'hormonal contraceptives',
    ingredients: ['levonorgestrel', 'ethinylestradiol', 'etonogestrel', 'norethisterone', 'desogestrel'],
  },
  enzymeInducers: { display: 'carbamazepine or phenytoin', ingredients: ['carbamazepine', 'phenytoin'] },
  aceInhibitorsOrArbs: {
    display: 'ACE inhibitors or angiotensin receptor blockers',
    ingredients: [
      'enalapril',
      'lisinopril',
      'captopril',
      'ramipril',
      'perindopril',
      'losartan',
      'telmisartan',
      'valsartan',
      'candesartan',
      'irbesartan',
    ],
  },
  potassiumRaising: {
    display: 'potassium-sparing diuretics or potassium supplements',
    ingredients: ['spironolactone', 'amiloride', 'eplerenone', 'potassium chloride'],
  },
  methotrexate: { display: 'methotrexate', ingredients: ['methotrexate'] },
  trimethoprim: { display: 'trimethoprim or co-trimoxazole', ingredients: ['trimethoprim', 'sulfamethoxazole'] },
  pde5Inhibitors: { display: 'sildenafil or tadalafil', ingredients: ['sildenafil', 'tadalafil'] },
  nitrates: {
    display: 'nitrates',
    ingredients: ['glyceryl trinitrate', 'isosorbide mononitrate', 'isosorbide dinitrate', 'nitroglycerin'],
  },
  ciprofloxacin: { display: 'ciprofloxacin', ingredients: ['ciprofloxacin'] },
  theophyllines: { display: 'theophylline or aminophylline', ingredients: ['theophylline', 'aminophylline'] },
  polyvalentCations: {
    display: 'iron, antacids or other polyvalent cations',
    ingredients: [
      'ferrous',
      'aluminum hydroxide',
      'aluminium hydroxide',
      'magnesium trisilicate',
      'magnesium hydroxide',
      'calcium carbonate',
      'zinc sulfate',
      'zinc sulphate',
    ],
  },
  digoxin: { display: 'digoxin', ingredients: ['digoxin'] },
  amiodarone: { display: 'amiodarone', ingredients: ['amiodarone'] },
  nonSelectiveBetaBlockers: {
    display: 'non-selective beta-blockers',
    ingredients: ['propranolol', 'carvedilol', 'timolol'],
  },
  metformin: { display: 'metformin', ingredients: ['metformin'] },
  oxidantAntimalarials: { display: 'primaquine or dapsone', ingredients: ['primaquine', 'dapsone', 'tafenoquine'] },
  tetracyclines: { display: 'tetracyclines', ingredients: ['doxycycline', 'tetracycline', 'oxytetracycline'] },
  teratogens: {
    display: 'medicines contraindicated in pregnancy',
    ingredients: [
      'warfarin',
      'isotretinoin',
      'valproate',
      'valproic acid',
      'methotrexate',
      'misoprostol',
      'mifepristone',
      'enalapril',
      'lisinopril',
      'captopril',
      'ramipril',
      'losartan',
      'telmisartan',
      'valsartan',
      'simvastatin',
      'atorvastatin',
      'rosuvastatin',
      'doxycycline',
      'tetracycline',
    ],
  },
} as const satisfies Record<string, DrugGroup>;

type DrugGroupId = keyof typeof groups;

/** Groups used to detect an allergy to a whole class of medicines. */
const allergyClassGroups: DrugGroupId[] = ['penicillins', 'cephalosporins', 'sulfonamides', 'nsaids'];

/**
 * Normalises text for word matching: lower case, letters and digits only, single spaces, padded.
 * @param text - The text.
 * @returns The normalised text.
 */
function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

function containsTerm(normalizedText: string, term: string): boolean {
  return normalizedText.includes(normalize(term));
}

/**
 * Returns the searchable text of a CodeableConcept: its text and every coding display.
 * @param concept - The concept.
 * @returns The normalised text.
 */
function conceptText(concept: CodeableConcept | undefined): string {
  if (!concept) {
    return ' ';
  }
  return normalize([concept.text, ...(concept.coding ?? []).map((c) => c.display)].filter(Boolean).join(' | '));
}

function inGroup(text: string, group: DrugGroupId): boolean {
  return groups[group].ingredients.some((ingredient) => containsTerm(text, ingredient));
}

/**
 * Returns the ingredient names of the medicine that are known to the CDS rules.
 * @param text - Normalised medicine text.
 * @returns The ingredient names found.
 */
function knownIngredients(text: string): string[] {
  const found = new Set<string>();
  for (const group of Object.values(groups)) {
    for (const ingredient of group.ingredients) {
      if (containsTerm(text, ingredient)) {
        found.add(ingredient);
      }
    }
  }
  return [...found];
}

/**
 * Returns a display name for a medicine.
 * @param concept - The medicine concept.
 * @returns The name.
 */
export function getKenyaMedicationName(concept: CodeableConcept | undefined): string {
  return concept?.text ?? concept?.coding?.find((c) => c.display)?.display ?? concept?.coding?.[0]?.code ?? 'medicine';
}

function ref(resource: { resourceType: string; id?: string } | undefined): string[] {
  return resource?.id ? [`${resource.resourceType}/${resource.id}`] : [];
}

// ─── Patient context helpers ──────────────────────────────────────────────────

function isActiveAllergy(allergy: AllergyIntolerance): boolean {
  const clinical = allergy.clinicalStatus?.coding?.[0]?.code;
  const verification = allergy.verificationStatus?.coding?.[0]?.code;
  return (
    clinical !== 'inactive' &&
    clinical !== 'resolved' &&
    verification !== 'refuted' &&
    verification !== 'entered-in-error'
  );
}

function isActiveCondition(condition: Condition): boolean {
  const clinical = condition.clinicalStatus?.coding?.[0]?.code;
  const verification = condition.verificationStatus?.coding?.[0]?.code;
  return (
    clinical !== 'inactive' &&
    clinical !== 'resolved' &&
    clinical !== 'remission' &&
    verification !== 'refuted' &&
    verification !== 'entered-in-error'
  );
}

function isCurrentMedication(medication: MedicationRequest | MedicationStatement): boolean {
  return medication.status === 'active' || medication.status === 'on-hold' || medication.status === 'intended';
}

function getIcd11Codes(condition: Condition): string[] {
  return (condition.code?.coding ?? [])
    .filter((c) => c.system === KenyaIcd11System && c.code)
    .map((c) => c.code as string);
}

function findCondition(conditions: readonly Condition[], matches: (code: string) => boolean): Condition | undefined {
  return conditions.filter(isActiveCondition).find((c) => getIcd11Codes(c).some(matches));
}

function under(...parents: string[]): (code: string) => boolean {
  return (code) => parents.some((parent) => isIcd11CodeUnder(code, parent));
}

/**
 * True when the problem list records a pregnancy: ICD-11 "Pregnant state" (QA41) or any
 * diagnosis from chapter 18, "Pregnancy, childbirth or the puerperium" (codes JA00–JB6Z).
 * @param code - ICD-11 code.
 * @returns True for a pregnancy code.
 */
function isPregnancyCode(code: string): boolean {
  return isIcd11CodeUnder(code, 'QA41') || /^J[AB]/.test(code);
}

/**
 * Returns the patient's age in whole years.
 * @param patient - The patient.
 * @param now - The date of the check.
 * @returns The age, or undefined without a date of birth.
 */
function getAgeYears(patient: Patient | undefined, now: Date): number | undefined {
  if (!patient?.birthDate) {
    return undefined;
  }
  const birth = new Date(patient.birthDate);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) {
    age--;
  }
  return age;
}

function getLoincCodes(concept: CodeableConcept | undefined): string[] {
  return (concept?.coding ?? []).filter((c) => c.system === LOINC && c.code).map((c) => c.code as string);
}

function observationTime(observation: Observation): number {
  const value = observation.effectiveDateTime ?? observation.effectivePeriod?.start ?? observation.issued;
  return value ? new Date(value).getTime() : 0;
}

/**
 * Returns the latest result for any of the given LOINC codes.
 * @param observations - The observations.
 * @param codes - LOINC codes.
 * @returns The latest matching observation.
 */
function latest(observations: readonly Observation[], codes: readonly string[]): Observation | undefined {
  return observations
    .filter((o) => o.status !== 'entered-in-error' && o.status !== 'cancelled' && o.valueQuantity?.value !== undefined)
    .filter((o) => getLoincCodes(o.code).some((c) => codes.includes(c)))
    .sort((a, b) => observationTime(b) - observationTime(a))[0];
}

// ─── Laboratory tests ────────────────────────────────────────────────────────

interface LabTest {
  readonly display: string;
  readonly loinc: readonly string[];
  /** The canonical unit. */
  readonly unit: string;
  /** Factors that convert other UCUM units into the canonical unit. */
  readonly conversions: Record<string, number>;
}

const labs = {
  potassium: {
    display: 'Potassium',
    loinc: ['2823-3', '6298-4'],
    unit: 'mmol/L',
    conversions: { 'mmol/L': 1, 'meq/L': 1, 'mEq/L': 1 },
  },
  sodium: {
    display: 'Sodium',
    loinc: ['2951-2', '2947-0'],
    unit: 'mmol/L',
    conversions: { 'mmol/L': 1, 'meq/L': 1, 'mEq/L': 1 },
  },
  glucose: {
    display: 'Glucose',
    loinc: ['2345-7', '2339-0', '15074-8', '41653-7', '14749-6'],
    unit: 'mmol/L',
    conversions: { 'mmol/L': 1, 'mg/dL': 1 / 18 },
  },
  haemoglobin: { display: 'Haemoglobin', loinc: ['718-7'], unit: 'g/dL', conversions: { 'g/dL': 1, 'g/L': 0.1 } },
  platelets: {
    display: 'Platelets',
    loinc: ['777-3', '26515-7'],
    unit: '10*9/L',
    conversions: { '10*9/L': 1, '10*3/uL': 1, '10^9/L': 1, '10^3/uL': 1 },
  },
  inr: {
    display: 'INR',
    loinc: ['6301-6', '34714-6'],
    unit: '{INR}',
    conversions: { '{INR}': 1, '{ratio}': 1, '1': 1 },
  },
  egfr: {
    display: 'eGFR',
    loinc: ['33914-3', '48642-3', '48643-1', '62238-1', '98979-8'],
    unit: 'mL/min/{1.73_m2}',
    conversions: { 'mL/min/{1.73_m2}': 1, 'mL/min/1.73m2': 1, 'mL/min': 1 },
  },
} as const satisfies Record<string, LabTest>;

/**
 * Returns a lab value in the test's canonical unit.
 * @param test - The lab test.
 * @param quantity - The result.
 * @returns The value, or undefined when the unit is not recognised.
 */
function labValue(test: LabTest, quantity: Quantity | undefined): number | undefined {
  if (quantity?.value === undefined) {
    return undefined;
  }
  const unit = quantity.code ?? quantity.unit;
  if (!unit) {
    return quantity.value;
  }
  const factor = test.conversions[unit];
  return factor === undefined ? undefined : quantity.value * factor;
}

function format(value: number): string {
  return String(Math.round(value * 10) / 10);
}

// ─── Medication order checks ─────────────────────────────────────────────────

interface InteractionRule {
  readonly id: string;
  readonly a: DrugGroupId;
  readonly b: DrugGroupId;
  readonly severity: KenyaCdsSeverity;
  readonly effect: string;
  readonly recommendation: string;
  readonly evidence: string;
}

const BNF = 'BNF Appendix 1 (Interactions)';
const NASCOP = 'Kenya HIV Prevention and Treatment Guidelines 2022 (NASCOP)';

const interactions: readonly InteractionRule[] = [
  {
    id: 'warfarin+nsaids',
    a: 'warfarin',
    b: 'nsaids',
    severity: 'high',
    effect: 'NSAIDs increase the risk of serious bleeding with warfarin.',
    recommendation:
      'Avoid the combination; use paracetamol for pain. If unavoidable, add gastro-protection and monitor the INR.',
    evidence: BNF,
  },
  {
    id: 'warfarin+potentiators',
    a: 'warfarin',
    b: 'warfarinPotentiators',
    severity: 'high',
    effect: 'These antimicrobials inhibit warfarin metabolism and can raise the INR sharply.',
    recommendation:
      'Choose another antimicrobial if possible; otherwise check the INR within 3–5 days and reduce the warfarin dose.',
    evidence: BNF,
  },
  {
    id: 'simvastatin+macrolides',
    a: 'simvastatin',
    b: 'macrolideInhibitors',
    severity: 'high',
    effect: 'Clarithromycin and erythromycin raise simvastatin levels, risking myopathy and rhabdomyolysis.',
    recommendation: 'Withhold simvastatin for the course of the macrolide, or use azithromycin instead.',
    evidence: BNF,
  },
  {
    id: 'rifampicin+nevirapine',
    a: 'rifampicin',
    b: 'nevirapine',
    severity: 'high',
    effect: 'Rifampicin lowers nevirapine levels, risking HIV treatment failure.',
    recommendation: 'Do not combine. Switch the ART regimen to one compatible with TB treatment.',
    evidence: NASCOP,
  },
  {
    id: 'rifampicin+dolutegravir',
    a: 'rifampicin',
    b: 'dolutegravir',
    severity: 'high',
    effect: 'Rifampicin halves dolutegravir levels.',
    recommendation: 'Give dolutegravir 50 mg twice daily during TB treatment and for 2 weeks after rifampicin stops.',
    evidence: NASCOP,
  },
  {
    id: 'rifampicin+lopinavir',
    a: 'rifampicin',
    b: 'lopinavir',
    severity: 'high',
    effect: 'Rifampicin markedly lowers lopinavir levels.',
    recommendation: 'Avoid; use rifabutin, or super-boost lopinavir/ritonavir as per the national ART guidelines.',
    evidence: NASCOP,
  },
  {
    id: 'rifampicin+contraceptives',
    a: 'rifampicin',
    b: 'hormonalContraceptives',
    severity: 'moderate',
    effect: 'Rifampicin makes hormonal contraceptives less effective.',
    recommendation:
      'Advise an additional or alternative method (copper IUD or DMPA) during and for 4 weeks after treatment.',
    evidence: BNF,
  },
  {
    id: 'enzyme-inducers+contraceptives',
    a: 'enzymeInducers',
    b: 'hormonalContraceptives',
    severity: 'moderate',
    effect: 'Carbamazepine and phenytoin make hormonal contraceptives less effective.',
    recommendation: 'Advise a copper IUD or DMPA instead of oral or implant contraception.',
    evidence: BNF,
  },
  {
    id: 'acei+potassium',
    a: 'aceInhibitorsOrArbs',
    b: 'potassiumRaising',
    severity: 'moderate',
    effect: 'The combination can cause dangerous hyperkalaemia.',
    recommendation: 'Check potassium and renal function before starting and within 1 week.',
    evidence: BNF,
  },
  {
    id: 'methotrexate+trimethoprim',
    a: 'methotrexate',
    b: 'trimethoprim',
    severity: 'high',
    effect: 'Trimethoprim with methotrexate can cause fatal bone-marrow suppression.',
    recommendation: 'Avoid the combination; choose another antimicrobial.',
    evidence: BNF,
  },
  {
    id: 'pde5+nitrates',
    a: 'pde5Inhibitors',
    b: 'nitrates',
    severity: 'high',
    effect: 'Sildenafil or tadalafil with nitrates can cause profound hypotension.',
    recommendation: 'Contraindicated. Do not give together.',
    evidence: BNF,
  },
  {
    id: 'ciprofloxacin+theophylline',
    a: 'ciprofloxacin',
    b: 'theophyllines',
    severity: 'moderate',
    effect: 'Ciprofloxacin raises theophylline levels, risking seizures and arrhythmias.',
    recommendation: 'Use another antibiotic, or reduce the theophylline dose and monitor levels.',
    evidence: BNF,
  },
  {
    id: 'dolutegravir+cations',
    a: 'dolutegravir',
    b: 'polyvalentCations',
    severity: 'moderate',
    effect: 'Iron, antacids and other polyvalent cations reduce dolutegravir absorption.',
    recommendation: 'Take dolutegravir 2 hours before or 6 hours after these medicines.',
    evidence: NASCOP,
  },
  {
    id: 'digoxin+amiodarone',
    a: 'digoxin',
    b: 'amiodarone',
    severity: 'moderate',
    effect: 'Amiodarone raises digoxin levels.',
    recommendation: 'Halve the digoxin dose and monitor digoxin levels and heart rate.',
    evidence: BNF,
  },
];

function checkAllergies(drugText: string, drugName: string, allergies: readonly AllergyIntolerance[]): KenyaCdsAlert[] {
  const alerts: KenyaCdsAlert[] = [];
  for (const allergy of allergies.filter(isActiveAllergy)) {
    const allergyText = normalize(
      [conceptText(allergy.code), ...(allergy.reaction ?? []).map((r) => conceptText(r.substance))].join(' ')
    );
    const allergyName = getKenyaMedicationName(allergy.code);
    const criticality = allergy.criticality === 'high' ? ' (high criticality)' : '';

    // The same ingredient, or a member of a class the patient is allergic to
    const sameIngredient = knownIngredients(drugText).find((i) => containsTerm(allergyText, i));
    const sameClass = allergyClassGroups.find(
      (g) =>
        inGroup(drugText, g) &&
        (inGroup(allergyText, g) || (groups[g] as DrugGroup).allergyTerms?.some((t) => containsTerm(allergyText, t)))
    );
    if (sameIngredient || sameClass) {
      alerts.push({
        id: `allergy:${allergy.id ?? allergyName}`,
        severity: 'high',
        category: 'allergy',
        title: `Allergy: ${drugName} conflicts with recorded allergy to ${allergyName}`,
        detail: sameIngredient
          ? `The patient has a recorded allergy to ${allergyName}${criticality}; ${drugName} contains ${sameIngredient}.`
          : `The patient has a recorded allergy to ${allergyName}${criticality}; ${drugName} is one of the ${groups[sameClass as DrugGroupId].display}.`,
        recommendation:
          'Do not prescribe. Choose an agent from a different class, or record why the benefit outweighs the risk.',
        evidence: 'WHO Model Formulary; patient allergy list',
        implicated: ref(allergy),
      });
      continue;
    }

    // Penicillin allergy and a cephalosporin: low but real cross-reactivity
    const penicillinAllergic =
      inGroup(allergyText, 'penicillins') || groups.penicillins.allergyTerms.some((t) => containsTerm(allergyText, t));
    if (penicillinAllergic && inGroup(drugText, 'cephalosporins')) {
      alerts.push({
        id: `allergy-cross:${allergy.id ?? allergyName}`,
        severity: 'moderate',
        category: 'allergy',
        title: `Possible cross-reactivity: ${drugName} in a patient allergic to ${allergyName}`,
        detail: `About 1–2% of patients with penicillin allergy react to cephalosporins; the risk is higher after an immediate (anaphylactic) reaction.`,
        recommendation:
          'Avoid if the penicillin reaction was anaphylaxis, angioedema or urticaria; otherwise give with monitoring.',
        evidence: 'BNF (Penicillins: cautions); WHO Model Formulary',
        implicated: ref(allergy),
      });
    }
  }
  return alerts;
}

function checkInteractions(
  drugText: string,
  drugName: string,
  medications: readonly (MedicationRequest | MedicationStatement)[],
  orderId: string | undefined
): KenyaCdsAlert[] {
  const alerts: KenyaCdsAlert[] = [];
  const drugIngredients = knownIngredients(drugText);
  for (const medication of medications.filter(isCurrentMedication)) {
    if (orderId && medication.resourceType === 'MedicationRequest' && medication.id === orderId) {
      continue;
    }
    const otherText = conceptText(medication.medicationCodeableConcept);
    const otherName = getKenyaMedicationName(medication.medicationCodeableConcept);

    const duplicate = drugIngredients.find((i) => containsTerm(otherText, i));
    if (duplicate) {
      alerts.push({
        id: `duplicate:${duplicate}`,
        severity: 'moderate',
        category: 'duplicate-therapy',
        title: `Duplicate therapy: the patient is already on ${otherName}`,
        detail: `${drugName} and ${otherName} both contain ${duplicate}.`,
        recommendation: 'Stop one of them, or confirm the second prescription is intended.',
        evidence: 'Patient medication list',
        implicated: ref(medication),
      });
    }

    for (const rule of interactions) {
      const forward = inGroup(drugText, rule.a) && inGroup(otherText, rule.b);
      const backward = inGroup(drugText, rule.b) && inGroup(otherText, rule.a);
      if (forward || backward) {
        alerts.push({
          id: `interaction:${rule.id}`,
          severity: rule.severity,
          category: 'drug-interaction',
          title: `Interaction: ${drugName} with ${otherName}`,
          detail: rule.effect,
          recommendation: rule.recommendation,
          evidence: rule.evidence,
          implicated: ref(medication),
        });
      }
    }
  }
  return alerts;
}

function checkConditions(drugText: string, drugName: string, conditions: readonly Condition[]): KenyaCdsAlert[] {
  const alerts: KenyaCdsAlert[] = [];
  const add = (
    id: string,
    group: DrugGroupId,
    matches: (code: string) => boolean,
    severity: KenyaCdsSeverity,
    detail: string,
    recommendation: string
  ): void => {
    if (!inGroup(drugText, group)) {
      return;
    }
    const condition = findCondition(conditions, matches);
    if (condition) {
      const conditionName = getKenyaMedicationName(condition.code);
      alerts.push({
        id: `condition:${id}`,
        severity,
        category: 'drug-condition',
        title: `${drugName} with ${conditionName} on the problem list`,
        detail,
        recommendation,
        evidence: 'BNF; WHO Model Formulary (contraindications)',
        implicated: ref(condition),
      });
    }
  };

  add(
    'nsaid-peptic-ulcer',
    'nsaids',
    under('DA60', 'DA61', 'DA63'),
    'high',
    'NSAIDs can cause bleeding or perforation of a peptic ulcer.',
    'Avoid; use paracetamol. If an NSAID is essential, add a proton-pump inhibitor.'
  );
  add(
    'nsaid-kidney',
    'nsaids',
    under('GB60', 'GB61', 'GB6Z'),
    'moderate',
    'NSAIDs can worsen kidney function.',
    'Avoid if possible; otherwise use the lowest dose for the shortest time and check renal function.'
  );
  add(
    'nsaid-heart-failure',
    'nsaids',
    under('BD10', 'BD11', 'BD12', 'BD13', 'BD1Z'),
    'moderate',
    'NSAIDs cause fluid retention and can worsen heart failure.',
    'Avoid; use paracetamol.'
  );
  add(
    'beta-blocker-asthma',
    'nonSelectiveBetaBlockers',
    under('CA23'),
    'high',
    'Non-selective beta-blockers can cause severe bronchospasm in asthma.',
    'Avoid; if a beta-blocker is needed use a cardioselective one (e.g. bisoprolol) with caution.'
  );
  add(
    'metformin-kidney',
    'metformin',
    under('GB60', 'GB61', 'GB6Z'),
    'moderate',
    'Metformin accumulates in kidney disease and can cause lactic acidosis.',
    'Check the eGFR: reduce the dose below 45 and stop below 30 mL/min/1.73m².'
  );
  add(
    'oxidant-g6pd',
    'oxidantAntimalarials',
    under('3A10.0'),
    'high',
    'Primaquine and dapsone cause haemolysis in G6PD deficiency.',
    'Do not give primaquine at the standard dose; seek specialist advice (weekly dosing under supervision).'
  );

  // Pregnancy
  if (inGroup(drugText, 'teratogens')) {
    const pregnancy = findCondition(conditions, isPregnancyCode);
    if (pregnancy) {
      alerts.push({
        id: 'pregnancy:teratogen',
        severity: 'high',
        category: 'drug-pregnancy',
        title: `${drugName} is contraindicated in pregnancy`,
        detail: `The problem list records a pregnancy (${getKenyaMedicationName(pregnancy.code)}).`,
        recommendation: 'Choose a medicine that is safe in pregnancy, or document specialist advice.',
        evidence: 'WHO Model Formulary (pregnancy); BNF Appendix 4',
        implicated: ref(pregnancy),
      });
    }
  }
  return alerts;
}

function checkAge(drugText: string, drugName: string, patient: Patient | undefined, now: Date): KenyaCdsAlert[] {
  const age = getAgeYears(patient, now);
  if (age === undefined) {
    return [];
  }
  const alerts: KenyaCdsAlert[] = [];
  if (age < 16 && inGroup(drugText, 'aspirin')) {
    alerts.push({
      id: 'age:aspirin-child',
      severity: 'high',
      category: 'drug-age',
      title: `${drugName} in a child aged ${age}`,
      detail: 'Aspirin in children under 16 can cause Reye’s syndrome.',
      recommendation:
        'Use paracetamol or ibuprofen instead (aspirin only on specialist advice, e.g. Kawasaki disease).',
      evidence: 'BNF for Children; WHO Model Formulary for Children',
      implicated: ref(patient),
    });
  }
  if (age < 8 && inGroup(drugText, 'tetracyclines')) {
    alerts.push({
      id: 'age:tetracycline-child',
      severity: 'moderate',
      category: 'drug-age',
      title: `${drugName} in a child aged ${age}`,
      detail: 'Tetracyclines stain developing teeth and affect bone growth in children under 8.',
      recommendation: 'Choose another antibiotic unless there is no alternative.',
      evidence: 'BNF for Children; WHO Model Formulary for Children',
      implicated: ref(patient),
    });
  }
  return alerts;
}

function checkLabs(drugText: string, drugName: string, observations: readonly Observation[]): KenyaCdsAlert[] {
  const alerts: KenyaCdsAlert[] = [];
  const add = (
    id: string,
    test: LabTest,
    drugGroups: DrugGroupId[],
    isAbnormal: (value: number) => boolean,
    severity: KenyaCdsSeverity,
    detail: (value: string) => string,
    recommendation: string
  ): void => {
    if (!drugGroups.some((g) => inGroup(drugText, g))) {
      return;
    }
    const result = latest(observations, test.loinc);
    const value = labValue(test, result?.valueQuantity);
    if (result && value !== undefined && isAbnormal(value)) {
      alerts.push({
        id: `lab:${id}`,
        severity,
        category: 'drug-lab',
        title: `${drugName}: latest ${test.display} is ${format(value)} ${test.unit}`,
        detail: detail(format(value)),
        recommendation,
        evidence: BNF,
        implicated: ref(result),
      });
    }
  };

  add(
    'potassium-high',
    labs.potassium,
    ['aceInhibitorsOrArbs', 'potassiumRaising'],
    (v) => v > 5.5,
    'high',
    (v) => `Potassium is ${v} mmol/L (above 5.5); ${drugName} raises potassium further.`,
    'Do not start until potassium is below 5.5 mmol/L; review other potassium-raising medicines.'
  );
  add(
    'egfr-metformin',
    labs.egfr,
    ['metformin'],
    (v) => v < 30,
    'high',
    (v) => `eGFR is ${v} mL/min/1.73m² (below 30); metformin is contraindicated.`,
    'Do not prescribe metformin; choose another glucose-lowering medicine.'
  );
  add(
    'egfr-nsaid',
    labs.egfr,
    ['nsaids'],
    (v) => v < 30,
    'moderate',
    (v) => `eGFR is ${v} mL/min/1.73m² (below 30); NSAIDs can cause further kidney injury.`,
    'Avoid NSAIDs; use paracetamol.'
  );
  add(
    'inr-high',
    labs.inr,
    ['warfarin', 'nsaids'],
    (v) => v > 4,
    'high',
    (v) => `INR is ${v} (above 4); bleeding risk is high.`,
    'Withhold warfarin and recheck the INR; avoid NSAIDs.'
  );
  add(
    'platelets-low',
    labs.platelets,
    ['warfarin', 'nsaids'],
    (v) => v < 50,
    'high',
    (v) => `Platelets are ${v} ×10⁹/L (below 50); bleeding risk is high.`,
    'Avoid anticoagulants and NSAIDs until the platelet count recovers.'
  );
  return alerts;
}

/**
 * Checks a medication order against the patient's record (DHA FUNC-CDS-001, FUNC-MED-001).
 * @param medication - The medicine being ordered.
 * @param context - The patient's record.
 * @param orderId - Id of the order being checked, so it is not compared with itself.
 * @returns The alerts, most severe first.
 */
export function checkKenyaMedicationOrder(
  medication: CodeableConcept | undefined,
  context: KenyaCdsPatientContext,
  orderId?: string
): KenyaCdsAlert[] {
  const drugText = conceptText(medication);
  const drugName = getKenyaMedicationName(medication);
  const now = context.now ?? new Date();
  const alerts = [
    ...checkAllergies(drugText, drugName, context.allergies ?? []),
    ...checkInteractions(drugText, drugName, context.medications ?? [], orderId),
    ...checkConditions(drugText, drugName, context.conditions ?? []),
    ...checkAge(drugText, drugName, context.patient, now),
    ...checkLabs(drugText, drugName, context.observations ?? []),
  ];
  return sortKenyaCdsAlerts(dedupe(alerts));
}

// ─── Result checks ───────────────────────────────────────────────────────────

interface ResultLimit {
  readonly id: string;
  readonly display: string;
  readonly loinc: readonly string[];
  readonly unit: string;
  readonly conversions: Record<string, number>;
  readonly low?: { readonly value: number; readonly severity: KenyaCdsSeverity; readonly meaning: string };
  readonly high?: { readonly value: number; readonly severity: KenyaCdsSeverity; readonly meaning: string };
  readonly category: 'critical-lab' | 'critical-vital';
  readonly evidence: string;
  readonly recommendation: string;
  /** Adult thresholds: not applied to children under 16. */
  readonly adultOnly?: boolean;
}

const NEWS2 = 'NEWS2 (Royal College of Physicians, 2017): single-parameter red score';
const CLSI = 'CLSI GP47 laboratory critical-value limits';

const resultLimits: readonly ResultLimit[] = [
  // Vital signs: NEWS2 parameters scoring 3 (red), plus severe hypertension
  {
    id: 'respiratory-rate',
    display: 'Respiratory rate',
    loinc: ['9279-1'],
    unit: '/min',
    conversions: { '/min': 1 },
    low: { value: 8, severity: 'high', meaning: 'bradypnoea' },
    high: { value: 25, severity: 'high', meaning: 'tachypnoea' },
    category: 'critical-vital',
    evidence: NEWS2,
    recommendation: 'Urgent clinical review; assess airway and breathing and repeat observations.',
    adultOnly: true,
  },
  {
    id: 'oxygen-saturation',
    display: 'Oxygen saturation',
    loinc: ['59408-5', '2708-6'],
    unit: '%',
    conversions: { '%': 1 },
    low: { value: 91, severity: 'high', meaning: 'hypoxaemia' },
    category: 'critical-vital',
    evidence: NEWS2,
    recommendation: 'Give oxygen to a target of 94–98% and review urgently.',
  },
  {
    id: 'systolic-bp',
    display: 'Systolic blood pressure',
    loinc: ['8480-6'],
    unit: 'mm[Hg]',
    conversions: { 'mm[Hg]': 1, mmHg: 1 },
    low: { value: 90, severity: 'high', meaning: 'hypotension' },
    high: { value: 180, severity: 'high', meaning: 'severe hypertension' },
    category: 'critical-vital',
    evidence: `${NEWS2}; ISH 2020 hypertension guideline (severe hypertension ≥180/110)`,
    recommendation: 'Repeat the reading; if confirmed, review urgently for shock or hypertensive emergency.',
    adultOnly: true,
  },
  {
    id: 'diastolic-bp',
    display: 'Diastolic blood pressure',
    loinc: ['8462-4'],
    unit: 'mm[Hg]',
    conversions: { 'mm[Hg]': 1, mmHg: 1 },
    high: { value: 110, severity: 'high', meaning: 'severe hypertension' },
    category: 'critical-vital',
    evidence: 'ISH 2020 hypertension guideline (severe hypertension ≥180/110)',
    recommendation: 'Repeat the reading; if confirmed, assess for end-organ damage and treat urgently.',
    adultOnly: true,
  },
  {
    id: 'heart-rate',
    display: 'Heart rate',
    loinc: ['8867-4'],
    unit: '/min',
    conversions: { '/min': 1 },
    low: { value: 40, severity: 'high', meaning: 'bradycardia' },
    high: { value: 131, severity: 'high', meaning: 'tachycardia' },
    category: 'critical-vital',
    evidence: NEWS2,
    recommendation: 'Urgent clinical review; check an ECG.',
    adultOnly: true,
  },
  {
    id: 'temperature',
    display: 'Body temperature',
    loinc: ['8310-5'],
    unit: 'Cel',
    conversions: { Cel: 1 },
    low: { value: 35, severity: 'high', meaning: 'hypothermia' },
    high: { value: 39.1, severity: 'moderate', meaning: 'high fever' },
    category: 'critical-vital',
    evidence: NEWS2,
    recommendation: 'Review for sepsis: test for malaria, take blood cultures where available and treat the cause.',
  },
  // Laboratory critical values
  {
    id: 'potassium',
    ...labs.potassium,
    low: { value: 2.8, severity: 'high', meaning: 'severe hypokalaemia' },
    high: { value: 6.2, severity: 'high', meaning: 'severe hyperkalaemia' },
    category: 'critical-lab',
    evidence: CLSI,
    recommendation: 'Notify the clinician now; get an ECG and treat as a potassium emergency.',
  },
  {
    id: 'sodium',
    ...labs.sodium,
    low: { value: 120, severity: 'high', meaning: 'severe hyponatraemia' },
    high: { value: 160, severity: 'high', meaning: 'severe hypernatraemia' },
    category: 'critical-lab',
    evidence: CLSI,
    recommendation: 'Notify the clinician now; correct slowly under monitoring.',
  },
  {
    id: 'glucose',
    ...labs.glucose,
    low: { value: 2.8, severity: 'high', meaning: 'hypoglycaemia' },
    high: { value: 25, severity: 'high', meaning: 'severe hyperglycaemia' },
    category: 'critical-lab',
    evidence: CLSI,
    recommendation: 'Treat now: give glucose for hypoglycaemia; assess for DKA/HHS for hyperglycaemia.',
  },
  {
    id: 'haemoglobin',
    ...labs.haemoglobin,
    low: { value: 7, severity: 'high', meaning: 'severe anaemia' },
    category: 'critical-lab',
    evidence: `${CLSI}; WHO haemoglobin thresholds for severe anaemia`,
    recommendation: 'Assess for transfusion and look for bleeding or haemolysis (e.g. malaria).',
  },
  {
    id: 'platelets',
    ...labs.platelets,
    low: { value: 50, severity: 'high', meaning: 'severe thrombocytopenia' },
    category: 'critical-lab',
    evidence: CLSI,
    recommendation: 'Review for bleeding; stop anticoagulants and antiplatelets.',
  },
  {
    id: 'inr',
    ...labs.inr,
    high: { value: 5, severity: 'high', meaning: 'over-anticoagulation' },
    category: 'critical-lab',
    evidence: `${CLSI}; BNF (warfarin: management of high INR)`,
    recommendation: 'Withhold warfarin; give vitamin K if bleeding or INR above 8.',
  },
];

function toUnit(limit: ResultLimit, quantity: Quantity): number | undefined {
  if (quantity.value === undefined) {
    return undefined;
  }
  const unit = quantity.code ?? quantity.unit;
  if (limit.id === 'temperature' && unit === '[degF]') {
    return ((quantity.value - 32) * 5) / 9;
  }
  if (!unit) {
    return quantity.value;
  }
  const factor = limit.conversions[unit];
  return factor === undefined ? undefined : quantity.value * factor;
}

function resultAlert(
  limit: ResultLimit,
  observation: Observation,
  value: number,
  bound: NonNullable<ResultLimit['low']>,
  direction: 'low' | 'high'
): KenyaCdsAlert {
  const comparison = direction === 'low' ? `at or below ${bound.value}` : `at or above ${bound.value}`;
  return {
    id: `${limit.category}:${limit.id}-${direction}`,
    severity: bound.severity,
    category: limit.category,
    title: `${limit.display} ${format(value)} ${limit.unit}: ${bound.meaning}`,
    detail: `${limit.display} is ${comparison} ${limit.unit}.`,
    recommendation: limit.recommendation,
    evidence: limit.evidence,
    implicated: ref(observation),
  };
}

/**
 * Checks a laboratory result or vital sign against critical limits (DHA FUNC-CDS-001): NEWS2 red
 * scores for vital signs and CLSI critical values for laboratory results. Blood pressure panels are
 * checked by component. A result the laboratory flags as critical (interpretation HH, LL or AA) is
 * always reported.
 * @param observation - The observation.
 * @param patient - The patient (adult vital-sign thresholds are not applied under 16).
 * @param now - The date of the check (default now).
 * @returns The alerts, most severe first.
 */
export function checkKenyaObservation(observation: Observation, patient?: Patient, now = new Date()): KenyaCdsAlert[] {
  if (observation.status === 'entered-in-error' || observation.status === 'cancelled') {
    return [];
  }
  const age = getAgeYears(patient, now);
  const isChild = age !== undefined && age < 16;
  const alerts: KenyaCdsAlert[] = [];

  const parts: { code: CodeableConcept | undefined; quantity: Quantity | undefined }[] = [
    { code: observation.code, quantity: observation.valueQuantity },
    ...(observation.component ?? []).map((c) => ({ code: c.code, quantity: c.valueQuantity })),
  ];
  for (const part of parts) {
    if (!part.quantity) {
      continue;
    }
    const codes = getLoincCodes(part.code);
    const limit = resultLimits.find((l) => l.loinc.some((c) => codes.includes(c)));
    if (!limit || (limit.adultOnly && isChild)) {
      continue;
    }
    const value = toUnit(limit, part.quantity);
    if (value === undefined) {
      continue;
    }
    if (limit.low && value <= limit.low.value) {
      alerts.push(resultAlert(limit, observation, value, limit.low, 'low'));
    } else if (limit.high && value >= limit.high.value) {
      alerts.push(resultAlert(limit, observation, value, limit.high, 'high'));
    }
  }

  const flaggedCritical = observation.interpretation?.some((i) =>
    i.coding?.some((c) => c.code === 'HH' || c.code === 'LL' || c.code === 'AA')
  );
  if (flaggedCritical && alerts.length === 0) {
    const name = getKenyaMedicationName(observation.code);
    alerts.push({
      id: 'critical-lab:flagged',
      severity: 'high',
      category: 'critical-lab',
      title: `${name}: critical result flagged by the laboratory`,
      detail: 'The laboratory marked this result as critical.',
      recommendation: 'Review the result and notify the responsible clinician now.',
      evidence: CLSI,
      implicated: ref(observation),
    });
  }
  return sortKenyaCdsAlerts(alerts);
}

/**
 * Checks a new laboratory result against the patient's current medicines (e.g. a high INR in a
 * patient on warfarin).
 * @param observation - The new result.
 * @param medications - The patient's current medicines.
 * @returns The alerts.
 */
export function checkKenyaResultAgainstMedications(
  observation: Observation,
  medications: readonly (MedicationRequest | MedicationStatement)[]
): KenyaCdsAlert[] {
  const alerts: KenyaCdsAlert[] = [];
  for (const medication of medications.filter(isCurrentMedication)) {
    alerts.push(
      ...checkLabs(
        conceptText(medication.medicationCodeableConcept),
        getKenyaMedicationName(medication.medicationCodeableConcept),
        [observation]
      ).map((a) => ({ ...a, implicated: [...a.implicated, ...ref(medication)] }))
    );
  }
  return sortKenyaCdsAlerts(dedupe(alerts));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const severityRank: Record<KenyaCdsSeverity, number> = { high: 0, moderate: 1, low: 2 };

/**
 * Sorts alerts most severe first.
 * @param alerts - The alerts.
 * @returns The sorted alerts.
 */
export function sortKenyaCdsAlerts(alerts: KenyaCdsAlert[]): KenyaCdsAlert[] {
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

function dedupe(alerts: KenyaCdsAlert[]): KenyaCdsAlert[] {
  const seen = new Set<string>();
  return alerts.filter((a) => {
    const key = `${a.id}|${a.implicated.join(',')}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Returns the override reason recorded on a MedicationRequest, if any.
 * @param request - The MedicationRequest.
 * @returns The reason.
 */
export function getKenyaCdsOverrideReason(request: MedicationRequest): string | undefined {
  return request.extension?.find((e) => e.url === KenyaCdsOverrideExtensionUrl)?.valueString?.trim() || undefined;
}
