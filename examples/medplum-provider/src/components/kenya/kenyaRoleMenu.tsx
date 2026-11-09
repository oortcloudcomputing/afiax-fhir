// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya staff-role menus: a member invited with a Kenya staff role has a UserConfiguration whose menu
// is that role's (front desk, nurse, clinician, pharmacy, laboratory, departments, cashier, facility
// admin). The provider app shows that menu instead of its default one. The server's AccessPolicy for
// the role enforces the same scope; the menu only hides what the role cannot use.

import type { UserConfiguration } from '@medplum/fhirtypes';
import type { NavbarMenu } from '@medplum/react';
import {
  IconBuilding,
  IconCalendarEvent,
  IconClipboardCheck,
  IconFileInvoice,
  IconListCheck,
  IconMail,
  IconReceipt,
  IconSettings,
  IconShieldCheck,
  IconStethoscope,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react';
import type { JSX } from 'react';

/** UserConfiguration.option id carrying the Kenya staff role code (set by the server's role templates). */
export const KenyaStaffRoleOption = 'kenyaStaffRole';

/**
 * Returns the Kenya staff role code from a user configuration.
 * @param config - The signed-in user's configuration.
 * @returns The role code, or undefined if the user has no Kenya staff role.
 */
export function getKenyaStaffRole(config: UserConfiguration | undefined): string | undefined {
  return config?.option?.find((o) => o.id === KenyaStaffRoleOption)?.valueString;
}

/**
 * Builds the navigation for a member with a Kenya staff role. Admin-only screens (`/admin/...`) live
 * in the admin app, so those links point there; without an admin app address they are left out.
 * @param config - The signed-in user's configuration.
 * @param adminAppUrl - The admin app's address (MEDPLUM_ADMIN_APP_URL).
 * @returns The role's menus, or undefined when the user has no Kenya staff role (use the default menu).
 */
export function getKenyaRoleMenus(
  config: UserConfiguration | undefined,
  adminAppUrl?: string
): NavbarMenu[] | undefined {
  if (!getKenyaStaffRole(config) || !config?.menu?.length) {
    return undefined;
  }
  return config.menu
    .map((menu) => ({
      title: menu.title,
      links: (menu.link ?? []).flatMap((link) => {
        const href = resolveTarget(link.target ?? '', adminAppUrl);
        return href ? [{ label: link.name, href, icon: getIcon(link.target ?? '') }] : [];
      }),
    }))
    .filter((menu) => menu.links.length > 0);
}

function resolveTarget(target: string, adminAppUrl: string | undefined): string | undefined {
  if (!target.startsWith('/admin/')) {
    return target;
  }
  return adminAppUrl
    ? new URL(target.slice(1), adminAppUrl.endsWith('/') ? adminAppUrl : adminAppUrl + '/').href
    : undefined;
}

function getIcon(target: string): JSX.Element {
  if (target.startsWith('/kenya/queue')) {
    return <IconListCheck />;
  }
  if (target.startsWith('/onboarding')) {
    return <IconUserPlus />;
  }
  if (target.startsWith('/Patient')) {
    return <IconUsers />;
  }
  if (target.startsWith('/Encounter')) {
    return <IconStethoscope />;
  }
  if (target.startsWith('/schedule')) {
    return <IconCalendarEvent />;
  }
  if (target.startsWith('/Task')) {
    return <IconClipboardCheck />;
  }
  if (target.startsWith('/Communication')) {
    return <IconMail />;
  }
  if (target.startsWith('/Coverage')) {
    return <IconShieldCheck />;
  }
  if (target.startsWith('/Invoice')) {
    return <IconReceipt />;
  }
  if (target.startsWith('/Claim')) {
    return <IconFileInvoice />;
  }
  if (target.startsWith('/admin/project')) {
    return <IconBuilding />;
  }
  return <IconSettings />;
}
