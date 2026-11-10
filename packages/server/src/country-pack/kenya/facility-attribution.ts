// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Which facility a case is reported under (IDSR immediate notifications and the weekly MOH 505):
//   1. the service provider of the Condition's Encounter, if that is one of the project's facilities;
//   2. otherwise, the project's only facility, if it has exactly one;
//   3. otherwise the case is unattributed and is not reported under any facility.
// A facility is an Organization in the project with an MFL code (the KHIS org unit).

import type { WithId } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { Condition, Encounter, Organization } from '@medplum/fhirtypes';
import type { KenyaContext } from './job-context';

export const KenyaMflCodeSystem = 'https://afiax.africa/kenya/identifier/mfl-code';

/**
 * Returns the MFL code of an Organization, if it has one.
 * @param organization - The Organization.
 * @returns The MFL code.
 */
export function getMflCode(organization: Organization | undefined): string | undefined {
  return organization?.identifier?.find((i) => i.system === KenyaMflCodeSystem && i.value)?.value;
}

/** DHA Facility Registry code (FID-...), for facilities the registry knows by FR code only. */
export const KenyaFrCodeSystem = 'https://afiax.africa/kenya/identifier/fr-code';

/**
 * The code a facility is identified by in Kenyan reporting: its MFL code, or else its DHA Facility
 * Registry (FR) code. Some registered facilities have no MFL code (the registry has none for them).
 * KHIS submissions still need the MFL code: see getMflCode.
 * @param organization - The facility.
 * @returns The MFL code, else the FR code, else undefined.
 */
export function getKenyaFacilityReportingCode(organization: Organization | undefined): string | undefined {
  return (
    getMflCode(organization) ?? organization?.identifier?.find((i) => i.system === KenyaFrCodeSystem && i.value)?.value
  );
}

/**
 * Returns the project's facilities: Organizations with an MFL code or a DHA Facility Registry code.
 * @param ctx - The context.
 * @returns The facilities.
 */
export async function getKenyaFacilities(ctx: KenyaContext): Promise<WithId<Organization>[]> {
  const organizations = await ctx.systemRepo.searchResources<Organization>({
    resourceType: 'Organization',
    filters: [{ code: '_project', operator: Operator.EQUALS, value: ctx.project.id }],
    count: 1000,
  });
  return organizations.filter((o) => !!getKenyaFacilityReportingCode(o));
}

/** Resolves the reporting facility of Conditions, caching Encounter lookups. */
export class KenyaFacilityAttribution {
  readonly facilities: WithId<Organization>[];
  private readonly ctx: KenyaContext;
  private readonly facilityIds: Set<string>;
  private readonly encounterFacility = new Map<string, string | undefined>();

  constructor(ctx: KenyaContext, facilities: WithId<Organization>[]) {
    this.ctx = ctx;
    this.facilities = facilities;
    this.facilityIds = new Set(facilities.map((f) => f.id));
  }

  /**
   * Builds an attribution helper for the project's facilities.
   * @param ctx - The context.
   * @returns The helper.
   */
  static async load(ctx: KenyaContext): Promise<KenyaFacilityAttribution> {
    return new KenyaFacilityAttribution(ctx, await getKenyaFacilities(ctx));
  }

  /**
   * Returns the id of the facility the Condition is reported under, or undefined if unattributed.
   * @param condition - The Condition.
   * @returns The facility Organization id.
   */
  async getFacilityId(condition: Condition): Promise<string | undefined> {
    const encounterRef = condition.encounter?.reference;
    if (encounterRef) {
      if (!this.encounterFacility.has(encounterRef)) {
        let facilityId: string | undefined;
        try {
          const encounter = await this.ctx.systemRepo.readReference<Encounter>({ reference: encounterRef });
          const providerRef = encounter.serviceProvider?.reference;
          facilityId = providerRef?.startsWith('Organization/') ? providerRef.split('/')[1] : undefined;
        } catch {
          facilityId = undefined;
        }
        this.encounterFacility.set(encounterRef, facilityId);
      }
      const facilityId = this.encounterFacility.get(encounterRef);
      if (facilityId && this.facilityIds.has(facilityId)) {
        return facilityId;
      }
    }
    return this.facilities.length === 1 ? this.facilities[0].id : undefined;
  }

  /**
   * Returns the facility the Condition is reported under, or undefined if unattributed.
   * @param condition - The Condition.
   * @returns The facility Organization.
   */
  async getFacility(condition: Condition): Promise<WithId<Organization> | undefined> {
    const id = await this.getFacilityId(condition);
    return this.facilities.find((f) => f.id === id);
  }
}
