// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Afiax Kenya country-pack components, shared by the admin app, Afiax Provider and My Afiax.
// Components take callbacks instead of using a router, so any app (staff- or patient-facing) can
// host them; every server call goes through the FHIR API with the signed-in user's own access.

export * from './clinical/CdsAlertList';
export * from './clinical/clinical-utils';
export * from './coding/kenya-diagnosis';
export * from './coding/kenya-visit-type';
export * from './coding/KenyaVisitTypeSelect';
export * from './coding/KnhtsCodeInput';
export * from './common/ConfirmButton';
export * from './orders/KenyaEncounterOrders';
export * from './orders/KenyaOrderEntry';
export * from './orders/KenyaOrderHistory';
export * from './queues/KenyaDepartmentQueue';
export * from './registration/KenyaPatientRegistration';
export * from './registration/KenyaPatientWizard';
