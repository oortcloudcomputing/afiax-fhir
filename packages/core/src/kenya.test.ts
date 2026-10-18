// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Claim, Coverage, Organization, Practitioner } from '@medplum/fhirtypes';
import {
  applyKenyaFacilityRegistryToOrganization,
  applyKenyaPractitionerRegistryToPractitioner,
  buildKenyaCoverageEligibilityExtension,
  buildKenyaFacilityVerificationExtension,
  buildKenyaNationalClaimStatusExtension,
  buildKenyaNationalClaimSubmissionExtension,
  buildKenyaPractitionerVerificationExtension,
  clearKenyaCoverageEligibilitySnapshot,
  clearKenyaFacilityRegistrySnapshot,
  clearKenyaFacilityVerificationSnapshot,
  clearKenyaNationalClaimStatusSnapshot,
  clearKenyaNationalClaimSubmissionSnapshot,
  clearKenyaPractitionerRegistrySnapshot,
  clearKenyaPractitionerVerificationSnapshot,
  findKenyaIdsrImmediateCondition,
  findKenyaKhisWeeklyCondition,
  getKenyaCoverageEligibilityLookupIdentifier,
  getKenyaCoverageEligibilitySnapshot,
  getKenyaFacilityAuthorityIdentifier,
  getKenyaFacilityRegistrySnapshot,
  getKenyaFacilityVerificationSnapshot,
  getKenyaIcd11DiagnosisIssues,
  getKenyaIdsrConditionCode,
  getKenyaNationalClaimStatusSnapshot,
  getKenyaNationalClaimSubmissionSnapshot,
  getKenyaPractitionerAuthorityIdentifier,
  getKenyaPractitionerLookupIdentifier,
  getKenyaPractitionerRegistrySnapshot,
  getKenyaPractitionerVerificationSnapshot,
  isIcd11CodeUnder,
  isKenyaIcd11CodeFormat,
  isKenyaIdsrImmediateNotificationCode,
  isKenyaKhisWeeklyNotificationCode,
  KenyaCoverageNationalIdIdentifierSystem,
  KenyaFacilityAuthorityIdentifierSystem,
  KenyaFacilityRegistrationIdentifierSystem,
  KenyaFacilityVerificationExtension,
  KenyaIcd10System,
  KenyaIcd11System,
  KenyaIdsrCodeSystemIcd10,
  KenyaIdsrCodeSystemIcd11,
  KenyaIdsrConditionDisplay,
  KenyaPractitionerAuthorityIdentifierSystem,
  KenyaPractitionerNationalIdIdentifierSystem,
  KenyaPractitionerVerificationExtension,
  setKenyaCoverageEligibilityLookupIdentifier,
  setKenyaFacilityAuthorityIdentifier,
  setKenyaPractitionerAuthorityIdentifier,
  setKenyaPractitionerLookupIdentifier,
} from './kenya';

describe('Kenya facility verification helpers', () => {
  test('builds and reads facility verification snapshot extensions', () => {
    const organization: Organization = {
      resourceType: 'Organization',
      extension: [
        buildKenyaFacilityVerificationExtension(
          {
            status: 'verified',
            correlationId: 'corr-123',
            message: 'Verified successfully',
            nextState: 'ready-for-registry-check',
            facilityApprovalStatus: 'approved',
            facilityOperationalStatus: 'Operational',
            currentLicenseExpiryDate: '2026-12-31',
            facilityAuthorityIdentifier: '24749',
            facilityAuthoritySystem: 'https://afiax.africa/kenya/identifier/mfl-code',
          },
          '2026-03-20T13:45:00.000Z',
          { reference: 'Task/task-123' }
        ),
      ],
    };

    expect(organization.extension?.[0]?.url).toBe(KenyaFacilityVerificationExtension.baseUrl);
    expect(getKenyaFacilityVerificationSnapshot(organization)).toEqual({
      status: 'verified',
      correlationId: 'corr-123',
      message: 'Verified successfully',
      nextState: 'ready-for-registry-check',
      verifiedAt: '2026-03-20T13:45:00.000Z',
      task: { reference: 'Task/task-123' },
      facilityApprovalStatus: 'approved',
      facilityOperationalStatus: 'Operational',
      currentLicenseExpiryDate: '2026-12-31',
      facilityAuthorityIdentifier: '24749',
      facilityAuthoritySystem: 'https://afiax.africa/kenya/identifier/mfl-code',
    });
  });

  test('gets and sets Kenya facility authority identifier', () => {
    const original: Organization = {
      resourceType: 'Organization',
      identifier: [{ system: 'https://example.com/local-id', value: 'abc' }],
    };

    const updated = setKenyaFacilityAuthorityIdentifier(original, '24749');
    expect(getKenyaFacilityAuthorityIdentifier(updated)).toEqual(
      expect.objectContaining({
        system: KenyaFacilityAuthorityIdentifierSystem,
        value: '24749',
      })
    );
  });

  test('clears Kenya facility verification snapshot', () => {
    const organization: Organization = {
      resourceType: 'Organization',
      extension: [
        {
          url: KenyaFacilityVerificationExtension.baseUrl,
          extension: [{ url: KenyaFacilityVerificationExtension.status, valueCode: 'verified' }],
        },
        { url: 'https://example.com/other', valueString: 'keep-me' },
      ],
    };

    expect(clearKenyaFacilityVerificationSnapshot(organization).extension).toEqual([
      { url: 'https://example.com/other', valueString: 'keep-me' },
    ]);
  });

  test('clears Kenya facility registry snapshot', () => {
    const organization: Organization = {
      resourceType: 'Organization',
      extension: [
        {
          url: 'https://afiax.africa/fhir/StructureDefinition/kenya-facility-registry',
          extension: [{ url: 'facilityCode', valueString: '15409' }],
        },
        { url: 'https://example.com/other', valueString: 'keep-me' },
      ],
    };

    expect(clearKenyaFacilityRegistrySnapshot(organization).extension).toEqual([
      { url: 'https://example.com/other', valueString: 'keep-me' },
    ]);
  });

  test('applies Kenya facility registry data to organization', () => {
    const organization: Organization = {
      resourceType: 'Organization',
      name: 'Local Name',
    };

    const updated = applyKenyaFacilityRegistryToOrganization(
      organization,
      {
        facilityCode: '15409',
        found: 1,
        facilityName: 'Registry Facility',
        registrationNumber: 'REG-001',
        regulator: 'KMPDC',
        approvalStatus: 'yes',
        facilityLevel: 'Level 4',
        facilityCategory: 'Hospital',
        facilityOwner: 'faith-based',
        facilityType: 'Hospital',
        county: 'Nairobi',
        subCounty: 'Westlands',
        ward: 'Parklands',
        operationalStatus: 'active',
        currentLicenseExpiryDate: '2026-12-31',
      },
      '2026-03-20T14:00:00.000Z'
    );

    expect(updated.name).toBe('Registry Facility');
    expect(getKenyaFacilityAuthorityIdentifier(updated)).toEqual(
      expect.objectContaining({
        system: KenyaFacilityAuthorityIdentifierSystem,
        value: '15409',
      })
    );
    expect(updated.identifier).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          system: KenyaFacilityRegistrationIdentifierSystem,
          value: 'REG-001',
        }),
      ])
    );
    expect(getKenyaFacilityRegistrySnapshot(updated)).toEqual({
      facilityCode: '15409',
      found: true,
      facilityName: 'Registry Facility',
      registrationNumber: 'REG-001',
      regulator: 'KMPDC',
      approvalStatus: 'yes',
      facilityLevel: 'Level 4',
      facilityCategory: 'Hospital',
      facilityOwner: 'faith-based',
      facilityType: 'Hospital',
      county: 'Nairobi',
      subCounty: 'Westlands',
      ward: 'Parklands',
      operationalStatus: 'active',
      currentLicenseExpiryDate: '2026-12-31',
      lookedUpAt: '2026-03-20T14:00:00.000Z',
    });
  });

  test('builds and reads practitioner verification snapshot extensions', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      extension: [
        buildKenyaPractitionerVerificationExtension(
          {
            status: 'verified',
            correlationId: 'corr-prac-123',
            message: 'Practitioner verified successfully',
            nextState: 'ready-for-care-delivery',
            practitionerAuthorityIdentifier: '40675898',
            practitionerAuthoritySystem: KenyaPractitionerAuthorityIdentifierSystem,
            registrationNumber: '40675898',
            identificationType: 'ID',
            identificationNumber: '12345678',
            practitionerActiveStatus: 'yes',
          },
          '2026-03-20T15:00:00.000Z',
          { reference: 'Task/task-prac-123' }
        ),
      ],
    };

    expect(practitioner.extension?.[0]?.url).toBe(KenyaPractitionerVerificationExtension.baseUrl);
    expect(getKenyaPractitionerVerificationSnapshot(practitioner)).toEqual({
      status: 'verified',
      correlationId: 'corr-prac-123',
      message: 'Practitioner verified successfully',
      nextState: 'ready-for-care-delivery',
      verifiedAt: '2026-03-20T15:00:00.000Z',
      task: { reference: 'Task/task-prac-123' },
      practitionerAuthorityIdentifier: '40675898',
      practitionerAuthoritySystem: KenyaPractitionerAuthorityIdentifierSystem,
      registrationNumber: '40675898',
      identificationType: 'ID',
      identificationNumber: '12345678',
      practitionerActiveStatus: 'yes',
    });
  });

  test('gets and sets Kenya practitioner identifiers', () => {
    const original: Practitioner = {
      resourceType: 'Practitioner',
      identifier: [{ system: 'https://example.com/local-id', value: 'abc' }],
    };

    const withLookupId = setKenyaPractitionerLookupIdentifier(original, 'ID', '12345678');
    expect(getKenyaPractitionerLookupIdentifier(withLookupId)).toEqual(
      expect.objectContaining({
        identificationType: 'ID',
        identifier: expect.objectContaining({
          system: KenyaPractitionerNationalIdIdentifierSystem,
          value: '12345678',
        }),
      })
    );

    const withAuthorityId = setKenyaPractitionerAuthorityIdentifier(withLookupId, '40675898');
    expect(getKenyaPractitionerAuthorityIdentifier(withAuthorityId)).toEqual(
      expect.objectContaining({
        system: KenyaPractitionerAuthorityIdentifierSystem,
        value: '40675898',
      })
    );
  });

  test('clears Kenya practitioner verification snapshot', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      extension: [
        {
          url: KenyaPractitionerVerificationExtension.baseUrl,
          extension: [{ url: KenyaPractitionerVerificationExtension.status, valueCode: 'verified' }],
        },
        { url: 'https://example.com/other', valueString: 'keep-me' },
      ],
    };

    expect(clearKenyaPractitionerVerificationSnapshot(practitioner).extension).toEqual([
      { url: 'https://example.com/other', valueString: 'keep-me' },
    ]);
  });

  test('clears Kenya practitioner registry snapshot', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      extension: [
        {
          url: 'https://afiax.africa/fhir/StructureDefinition/kenya-practitioner-registry',
          extension: [{ url: 'identificationNumber', valueString: '12345678' }],
        },
        { url: 'https://example.com/other', valueString: 'keep-me' },
      ],
    };

    expect(clearKenyaPractitionerRegistrySnapshot(practitioner).extension).toEqual([
      { url: 'https://example.com/other', valueString: 'keep-me' },
    ]);
  });

  test('applies Kenya practitioner registry data to practitioner', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
    };

    const updated = applyKenyaPractitionerRegistryToPractitioner(
      practitioner,
      {
        identificationType: 'ID',
        identificationNumber: '12345678',
        registrationNumber: '40675898',
        found: 1,
        isActive: 'yes',
      },
      '2026-03-20T16:00:00.000Z'
    );

    expect(getKenyaPractitionerLookupIdentifier(updated)).toEqual(
      expect.objectContaining({
        identificationType: 'ID',
        identifier: expect.objectContaining({
          system: KenyaPractitionerNationalIdIdentifierSystem,
          value: '12345678',
        }),
      })
    );
    expect(getKenyaPractitionerAuthorityIdentifier(updated)).toEqual(
      expect.objectContaining({
        system: KenyaPractitionerAuthorityIdentifierSystem,
        value: '40675898',
      })
    );
    expect(getKenyaPractitionerRegistrySnapshot(updated)).toEqual({
      identificationType: 'ID',
      identificationNumber: '12345678',
      registrationNumber: '40675898',
      found: true,
      isActive: true,
      lookedUpAt: '2026-03-20T16:00:00.000Z',
    });
  });

  test('builds and reads Kenya coverage eligibility snapshot extensions', () => {
    const coverage: Coverage = {
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: { reference: 'Patient/123' },
      payor: [{ reference: 'Organization/sha' }],
      extension: [
        buildKenyaCoverageEligibilityExtension(
          {
            status: 'eligible',
            correlationId: 'corr-cov-123',
            message: 'Coverage is active',
            nextState: 'ready-for-sha-pathway',
            identificationType: 'National ID',
            identificationNumber: '12345678',
            eligible: true,
            fullName: 'Afiax Test Patient',
            reason: 'Active member',
            possibleSolution: 'Proceed to benefits check',
            coverageEndDate: '2026-12-31',
            transitionStatus: 'active',
            requestId: 'dha-req-123',
            requestIdNumber: '12345678',
            requestIdType: 'National ID',
          },
          '2026-03-20T17:00:00.000Z',
          {
            task: { reference: 'Task/task-cov-123' },
            eligibilityRequest: { reference: 'CoverageEligibilityRequest/req-123' },
            eligibilityResponse: { reference: 'CoverageEligibilityResponse/res-123' },
          }
        ),
      ],
    };

    expect(getKenyaCoverageEligibilitySnapshot(coverage)).toEqual({
      status: 'eligible',
      correlationId: 'corr-cov-123',
      message: 'Coverage is active',
      nextState: 'ready-for-sha-pathway',
      checkedAt: '2026-03-20T17:00:00.000Z',
      task: { reference: 'Task/task-cov-123' },
      eligibilityRequest: { reference: 'CoverageEligibilityRequest/req-123' },
      eligibilityResponse: { reference: 'CoverageEligibilityResponse/res-123' },
      identificationType: 'National ID',
      identificationNumber: '12345678',
      eligible: true,
      fullName: 'Afiax Test Patient',
      reason: 'Active member',
      possibleSolution: 'Proceed to benefits check',
      coverageEndDate: '2026-12-31',
      transitionStatus: 'active',
      requestId: 'dha-req-123',
      requestIdNumber: '12345678',
      requestIdType: 'National ID',
    });
  });

  test('gets and sets Kenya coverage eligibility lookup identifier', () => {
    const original: Coverage = {
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: { reference: 'Patient/123' },
      payor: [{ reference: 'Organization/sha' }],
    };

    const updated = setKenyaCoverageEligibilityLookupIdentifier(original, 'National ID', '12345678');
    expect(getKenyaCoverageEligibilityLookupIdentifier(updated)).toEqual(
      expect.objectContaining({
        identificationType: 'National ID',
        identifier: expect.objectContaining({
          system: KenyaCoverageNationalIdIdentifierSystem,
          value: '12345678',
        }),
      })
    );
  });

  test('clears Kenya coverage eligibility snapshot', () => {
    const coverage: Coverage = {
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: { reference: 'Patient/123' },
      payor: [{ reference: 'Organization/sha' }],
      extension: [
        {
          url: 'https://afiax.africa/fhir/StructureDefinition/kenya-coverage-eligibility',
          extension: [{ url: 'status', valueCode: 'eligible' }],
        },
        { url: 'https://example.com/other', valueString: 'keep-me' },
      ],
    };

    expect(clearKenyaCoverageEligibilitySnapshot(coverage).extension).toEqual([
      { url: 'https://example.com/other', valueString: 'keep-me' },
    ]);
  });

  test('builds and reads Kenya national claim submission snapshot extensions', () => {
    const claim: Claim = {
      resourceType: 'Claim',
      status: 'active',
      type: { text: 'Institutional' },
      use: 'claim',
      patient: { reference: 'Patient/123' },
      created: '2026-03-20',
      provider: { reference: 'Organization/456' },
      priority: { text: 'normal' },
      insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/123' } }],
      extension: [
        buildKenyaNationalClaimSubmissionExtension(
          {
            status: 'prepared',
            correlationId: 'corr-claim-123',
            message: 'Kenya SHA claim bundle prepared',
            nextState: 'ready-for-sha-connector',
            shaClaimsEnvironment: 'uat',
            submissionEndpoint: 'https://qa-mis.apeiro-digital.com/v1/shr-med/bundle',
            statusTrackingEndpoint: 'https://qa-mis.apeiro-digital.com/v1/shr-med/claim-status?claim_id=bundle-123',
            responseStatusCode: 202,
            bundleId: 'bundle-123',
            bundleEntryCount: 5,
            workflowBot: 'Bot/bot-claim-123',
            workflowBotStatus: 'triggered',
            workflowBotMessage: 'Configured Kenya claim workflow bot executed successfully.',
          },
          '2026-03-20T18:00:00.000Z',
          { reference: 'Task/task-claim-123' }
        ),
      ],
    };

    expect(getKenyaNationalClaimSubmissionSnapshot(claim)).toEqual({
      status: 'prepared',
      correlationId: 'corr-claim-123',
      message: 'Kenya SHA claim bundle prepared',
      nextState: 'ready-for-sha-connector',
      submittedAt: '2026-03-20T18:00:00.000Z',
      task: { reference: 'Task/task-claim-123' },
      shaClaimsEnvironment: 'uat',
      submissionEndpoint: 'https://qa-mis.apeiro-digital.com/v1/shr-med/bundle',
      statusTrackingEndpoint: 'https://qa-mis.apeiro-digital.com/v1/shr-med/claim-status?claim_id=bundle-123',
      responseStatusCode: 202,
      bundleId: 'bundle-123',
      bundleEntryCount: 5,
      workflowBot: 'Bot/bot-claim-123',
      workflowBotStatus: 'triggered',
      workflowBotMessage: 'Configured Kenya claim workflow bot executed successfully.',
    });
  });

  test('builds and reads Kenya national claim status snapshot extensions', () => {
    const claim: Claim = {
      resourceType: 'Claim',
      status: 'active',
      type: { text: 'Institutional' },
      use: 'claim',
      patient: { reference: 'Patient/123' },
      created: '2026-03-20',
      provider: { reference: 'Organization/456' },
      priority: { text: 'normal' },
      insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/123' } }],
      extension: [
        buildKenyaNationalClaimStatusExtension(
          {
            status: 'adjudicated',
            correlationId: 'corr-claim-status-123',
            message: 'Claim approved for payment',
            nextState: 'ready-for-financial-reconciliation',
            shaClaimsEnvironment: 'uat',
            statusEndpoint: 'https://qa-mis.apeiro-digital.com/v1/shr-med/claim-status?claim_id=bundle-123',
            responseStatusCode: 200,
            claimId: 'bundle-123',
            claimState: 'Payment Approved',
            workflowBot: 'Bot/bot-claim-status-123',
            workflowBotStatus: 'triggered',
            workflowBotMessage: 'Configured Kenya claim workflow bot executed successfully.',
          },
          '2026-03-20T19:00:00.000Z',
          {
            task: { reference: 'Task/task-claim-status-123' },
            claimResponse: { reference: 'ClaimResponse/claim-response-123' },
          }
        ),
      ],
    };

    expect(getKenyaNationalClaimStatusSnapshot(claim)).toEqual({
      status: 'adjudicated',
      correlationId: 'corr-claim-status-123',
      message: 'Claim approved for payment',
      nextState: 'ready-for-financial-reconciliation',
      checkedAt: '2026-03-20T19:00:00.000Z',
      task: { reference: 'Task/task-claim-status-123' },
      claimResponse: { reference: 'ClaimResponse/claim-response-123' },
      shaClaimsEnvironment: 'uat',
      statusEndpoint: 'https://qa-mis.apeiro-digital.com/v1/shr-med/claim-status?claim_id=bundle-123',
      responseStatusCode: 200,
      claimId: 'bundle-123',
      claimState: 'Payment Approved',
      workflowBot: 'Bot/bot-claim-status-123',
      workflowBotStatus: 'triggered',
      workflowBotMessage: 'Configured Kenya claim workflow bot executed successfully.',
    });
  });

  test('clears Kenya national claim submission snapshot', () => {
    const claim: Claim = {
      resourceType: 'Claim',
      status: 'active',
      type: { text: 'Institutional' },
      use: 'claim',
      patient: { reference: 'Patient/123' },
      created: '2026-03-20',
      provider: { reference: 'Organization/456' },
      priority: { text: 'normal' },
      insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/123' } }],
      extension: [
        {
          url: 'https://afiax.africa/fhir/StructureDefinition/kenya-national-claim-submission',
          extension: [{ url: 'status', valueCode: 'prepared' }],
        },
        { url: 'https://example.com/other', valueString: 'keep-me' },
      ],
    };

    expect(clearKenyaNationalClaimSubmissionSnapshot(claim).extension).toEqual([
      { url: 'https://example.com/other', valueString: 'keep-me' },
    ]);
  });

  test('clears Kenya national claim status snapshot', () => {
    const claim: Claim = {
      resourceType: 'Claim',
      status: 'active',
      type: { text: 'Institutional' },
      use: 'claim',
      patient: { reference: 'Patient/123' },
      created: '2026-03-20',
      provider: { reference: 'Organization/456' },
      priority: { text: 'normal' },
      insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/123' } }],
      extension: [
        {
          url: 'https://afiax.africa/fhir/StructureDefinition/kenya-national-claim-status',
          extension: [{ url: 'status', valueCode: 'queued' }],
        },
        { url: 'https://example.com/other', valueString: 'keep-me' },
      ],
    };

    expect(clearKenyaNationalClaimStatusSnapshot(claim).extension).toEqual([
      { url: 'https://example.com/other', valueString: 'keep-me' },
    ]);
  });
});

describe('Kenya IDSR/KHIS dual ICD-11/ICD-10 coding', () => {
  test('recognises ICD-11 MMS notifiable codes (preferred standard)', () => {
    expect(isKenyaIdsrImmediateNotificationCode('1A00')).toBe(true); // Cholera
    expect(isKenyaIdsrImmediateNotificationCode('1E71')).toBe(true); // Mpox
    expect(isKenyaIdsrImmediateNotificationCode('RA01.0')).toBe(true); // COVID-19
  });

  test('still recognises legacy ICD-10 notifiable codes (transition support)', () => {
    expect(isKenyaIdsrImmediateNotificationCode('A00')).toBe(true); // Cholera
    expect(isKenyaIdsrImmediateNotificationCode('B04')).toBe(true); // Mpox
    expect(isKenyaIdsrImmediateNotificationCode('U07.1')).toBe(true); // COVID-19
  });

  test('rejects non-notifiable codes in either system', () => {
    expect(isKenyaIdsrImmediateNotificationCode('CA23')).toBe(false); // Asthma (ICD-11)
    expect(isKenyaIdsrImmediateNotificationCode('J45')).toBe(false); // Asthma (ICD-10)
  });

  test('matches Condition coded with ICD-11 system + ICD-11 code', () => {
    expect(getKenyaIdsrConditionCode({ code: { coding: [{ system: KenyaIdsrCodeSystemIcd11, code: '1A00' }] } })).toBe(
      '1A00'
    );
  });

  test('matches Condition coded with ICD-10 system + ICD-10 code', () => {
    expect(getKenyaIdsrConditionCode({ code: { coding: [{ system: KenyaIdsrCodeSystemIcd10, code: 'A00' }] } })).toBe(
      'A00'
    );
  });

  test('does not match ICD-10 code falsely tagged with the ICD-11 system', () => {
    // A00 is not a valid ICD-11 MMS code, so a coding that claims ICD-11 but
    // carries the ICD-10 value must NOT match.
    expect(
      getKenyaIdsrConditionCode({ code: { coding: [{ system: KenyaIdsrCodeSystemIcd11, code: 'A00' }] } })
    ).toBeUndefined();
  });

  test('matches codings with no system against both code sets (legacy data)', () => {
    expect(getKenyaIdsrConditionCode({ code: { coding: [{ code: '1A00' }] } })).toBe('1A00');
    expect(getKenyaIdsrConditionCode({ code: { coding: [{ code: 'A00' }] } })).toBe('A00');
  });

  test('display map resolves both ICD-11 and ICD-10 keys to the same label', () => {
    expect(KenyaIdsrConditionDisplay['1A00']).toBe('Cholera');
    expect(KenyaIdsrConditionDisplay['A00']).toBe('Cholera');
  });

  test('KHIS weekly recognises ICD-11 and ICD-10 codes including weekly-only entries', () => {
    expect(isKenyaKhisWeeklyNotificationCode('1F40.0')).toBe(true); // Malaria P. falciparum (ICD-11)
    expect(isKenyaKhisWeeklyNotificationCode('B50')).toBe(true); // Malaria P. falciparum (ICD-10)
    expect(isKenyaKhisWeeklyNotificationCode('1A00')).toBe(true); // Cholera (immediate superset, ICD-11)
  });
});

describe('Kenya IDSR ICD-11 code table', () => {
  test.each([
    ['1B93', 'Plague'],
    ['1B97', 'Anthrax'],
    ['1C15', 'Neonatal tetanus'],
    ['1C17', 'Diphtheria'],
    ['1C1C', 'Meningococcal disease'],
    ['1D61', 'Arenaviral haemorrhagic fever'],
    ['1D60.0', 'Ebola virus disease'],
    ['1D60.1', 'Marburg virus disease'],
    ['1D86', 'Viral haemorrhagic fever, not elsewhere classified'],
  ])('%s is %s', (code, display) => {
    expect(findKenyaIdsrImmediateCondition(code, KenyaIcd11System)?.display).toBe(display);
  });

  test('matches ICD-11 child codes under a notifiable parent', () => {
    expect(findKenyaIdsrImmediateCondition('1B93.2', KenyaIcd11System)?.display).toBe('Plague');
    expect(findKenyaIdsrImmediateCondition('1D60.01', KenyaIcd11System)?.display).toBe('Ebola virus disease');
    expect(findKenyaIdsrImmediateCondition('1C1C.0', KenyaIcd11System)?.display).toBe('Meningococcal disease');
  });

  test('matches postcoordinated ICD-11 codes by their stem code', () => {
    expect(findKenyaIdsrImmediateCondition('1A00&XN6S0', KenyaIcd11System)?.display).toBe('Cholera');
  });

  test('does not confuse siblings with a notifiable code', () => {
    // 1D65 is SARS and 1D62 is hantavirus disease — neither is on the immediate list as such.
    expect(findKenyaIdsrImmediateCondition('1D62', KenyaIcd11System)).toBeUndefined();
    expect(findKenyaIdsrImmediateCondition('1D60.Z', KenyaIcd11System)).toBeUndefined();
  });

  test('matches ICD-10 dotted children for legacy records', () => {
    expect(findKenyaIdsrImmediateCondition('A20.2', KenyaIcd10System)?.display).toBe('Plague');
  });

  test('KHIS weekly matches corrected ICD-11 codes', () => {
    expect(findKenyaKhisWeeklyCondition({ system: KenyaIcd11System, code: '1A40' })?.icd10).toBe('A09');
    expect(findKenyaKhisWeeklyCondition({ system: KenyaIcd11System, code: '1F54.0' })?.display).toBe('Leishmaniasis');
    expect(findKenyaKhisWeeklyCondition({ system: KenyaIcd11System, code: 'CA40.0Z' })?.display).toBe('Pneumonia');
    // 1A90 is chancroid, not a diarrhoeal disease
    expect(findKenyaKhisWeeklyCondition({ system: KenyaIcd11System, code: '1A90' })).toBeUndefined();
  });

  test('uses the KNHTS-verified codes for TB, meningitis, leptospirosis and VHF', () => {
    const weekly = (code: string): string | undefined =>
      findKenyaKhisWeeklyCondition({ system: KenyaIcd11System, code })?.display;
    expect(weekly('1B10.Z')).toBe('Tuberculosis of the respiratory system');
    expect(weekly('1B11.0')).toBe('Tuberculosis of the nervous system');
    expect(weekly('1B14')).toBeUndefined(); // latent TB is not a notifiable case
    expect(weekly('1D01.0Z')).toBe('Bacterial meningitis');
    expect(weekly('1D01.Z')).toBe('Meningitis (other infectious / unspecified)');
    expect(weekly('1C8E.Z')).toBe('Viral meningitis');
    expect(weekly('1B91')).toBe('Leptospirosis');
    expect(weekly('1B90')).toBeUndefined(); // rat-bite fever
    expect(weekly('CA00')).toBe('Acute nasopharyngitis (ARI)');
    expect(weekly('1C1E')).toBeUndefined(); // pinta
    expect(findKenyaIdsrImmediateCondition('1D49', KenyaIcd11System)?.display).toBe('Crimean-Congo haemorrhagic fever');
    expect(findKenyaIdsrImmediateCondition('RA01.1', KenyaIcd11System)?.display).toBe('COVID-19');
  });
});

describe('Kenya ICD-11 code helpers', () => {
  test.each(['1A00', 'RA01.0', '1D60.01', '1C1A.0', 'CA40.0Z', '1A00&XN6S0', '1D60.0/1A00'])(
    'accepts ICD-11 code %s',
    (code) => {
      expect(isKenyaIcd11CodeFormat(code)).toBe(true);
    }
  );

  test.each(['A00', 'J18.9', 'U07.1', '1IO0', '', '1A00.123', 'abc'])('rejects non-ICD-11 code %s', (code) => {
    expect(isKenyaIcd11CodeFormat(code)).toBe(false);
  });

  test('isIcd11CodeUnder follows the hierarchy', () => {
    expect(isIcd11CodeUnder('1B93', '1B93')).toBe(true);
    expect(isIcd11CodeUnder('1B93.2', '1B93')).toBe(true);
    expect(isIcd11CodeUnder('1D60.0Y', '1D60.0')).toBe(true);
    expect(isIcd11CodeUnder('1B930', '1B93')).toBe(false);
    expect(isIcd11CodeUnder('1D60.1', '1D60.0')).toBe(false);
  });
});

describe('getKenyaIcd11DiagnosisIssues', () => {
  test('accepts a Condition coded in ICD-11 with an additional ICD-10 coding', () => {
    expect(
      getKenyaIcd11DiagnosisIssues({
        resourceType: 'Condition',
        subject: { reference: 'Patient/p1' },
        code: {
          coding: [
            { system: KenyaIcd11System, code: '1F40', display: 'Malaria due to Plasmodium falciparum' },
            { system: KenyaIcd10System, code: 'B50' },
          ],
        },
      })
    ).toEqual([]);
  });

  test('rejects a Condition coded only in ICD-10', () => {
    const issues = getKenyaIcd11DiagnosisIssues({
      resourceType: 'Condition',
      subject: { reference: 'Patient/p1' },
      code: { coding: [{ system: KenyaIcd10System, code: 'B50' }] },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].expression).toBe('Condition.code');
    expect(issues[0].message).toContain('ICD-11 MMS');
  });

  test('rejects a text-only diagnosis', () => {
    expect(
      getKenyaIcd11DiagnosisIssues({
        resourceType: 'Condition',
        subject: { reference: 'Patient/p1' },
        code: { text: 'Fever' },
      })
    ).toHaveLength(1);
  });

  test('rejects an ICD-10 code mislabelled with the ICD-11 system', () => {
    const issues = getKenyaIcd11DiagnosisIssues({
      resourceType: 'Condition',
      subject: { reference: 'Patient/p1' },
      code: { coding: [{ system: KenyaIcd11System, code: 'B50' }] },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("'B50' is not a valid ICD-11 MMS code");
  });

  test('ignores a Condition without a code', () => {
    expect(getKenyaIcd11DiagnosisIssues({ resourceType: 'Condition', subject: { reference: 'Patient/p1' } })).toEqual(
      []
    );
  });

  test('checks each Claim diagnosis', () => {
    const claim: Claim = {
      resourceType: 'Claim',
      status: 'active',
      type: { text: 'Institutional' },
      use: 'claim',
      patient: { reference: 'Patient/p1' },
      created: '2026-10-17',
      provider: { reference: 'Organization/o1' },
      priority: { text: 'normal' },
      insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/c1' } }],
      diagnosis: [
        { sequence: 1, diagnosisCodeableConcept: { coding: [{ system: KenyaIcd11System, code: 'CA40' }] } },
        { sequence: 2, diagnosisCodeableConcept: { coding: [{ system: KenyaIcd10System, code: 'J18' }] } },
        { sequence: 3, diagnosisReference: { reference: 'Condition/c1' } },
      ],
    };
    const issues = getKenyaIcd11DiagnosisIssues(claim);
    expect(issues).toHaveLength(1);
    expect(issues[0].expression).toBe('Claim.diagnosis[1].diagnosisCodeableConcept');
  });
});
