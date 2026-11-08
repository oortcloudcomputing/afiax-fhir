// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Afiax Kenya country-pack components, shared by the admin app, Afiax Provider and My Afiax.
// Components take callbacks instead of using a router, so any app (staff- or patient-facing) can
// host them; every server call goes through the FHIR API with the signed-in user's own access.

export * from './registration/KenyaPatientRegistration';
export * from './registration/KenyaPatientWizard';
