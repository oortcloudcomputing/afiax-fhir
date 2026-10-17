// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
'use client';

import type { JSX } from 'react';
import { useState } from 'react';

import type { OnboardingPacket, OnboardingSubmissionResponse } from '../lib/onboarding-packet';

export function ErpnextOnboardingActions(props: {
  readonly packet: OnboardingPacket;
  readonly externalSignupUrl?: string;
}): JSX.Element {
  const { packet, externalSignupUrl } = props;
  const [state, setState] = useState<'idle' | 'loading' | 'created' | 'error'>('idle');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [leadName, setLeadName] = useState<string | undefined>(undefined);
  const [leadUrl, setLeadUrl] = useState<string | undefined>(undefined);
  const [redirectUrl, setRedirectUrl] = useState<string | undefined>(externalSignupUrl);

  async function handleCreateLead(): Promise<void> {
    setState('loading');
    setMessage(undefined);

    try {
      const response = await fetch('/api/erpnext/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(packet),
      });

      const data = (await response.json()) as OnboardingSubmissionResponse;
      if (data.status === 'created') {
        setState('created');
        setLeadName(data.leadName);
        setLeadUrl(data.leadUrl);
        setRedirectUrl(data.redirectUrl ?? externalSignupUrl);
        setMessage(data.message);
        return;
      }

      setState('error');
      setMessage(data.message);
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'ERPNext onboarding submission failed.');
    }
  }

  function handleCreateLeadClick(): void {
    handleCreateLead().catch(() => undefined);
  }

  return (
    <div className="signup-action-card">
      <button type="button" className="primary-link" onClick={handleCreateLeadClick} disabled={state === 'loading'}>
        {state === 'loading' ? 'Creating ERPNext lead...' : 'Create ERPNext lead'}
      </button>
      {leadUrl ? (
        <a href={leadUrl} className="secondary-link">
          Open ERPNext lead
        </a>
      ) : null}
      {redirectUrl ? (
        <a href={redirectUrl} className="secondary-link">
          Open ERPNext portal
        </a>
      ) : null}
      {message ? <p className="wizard-result-note">{message}</p> : null}
      {leadName ? <p className="muted-copy">ERPNext lead: {leadName}</p> : null}
    </div>
  );
}
