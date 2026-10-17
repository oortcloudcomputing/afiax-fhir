// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from 'next/server';

import { getErpnextConfig, getErpnextLeadUrl, getErpnextMissingEnv, postErpnextResource } from '../../../../lib/erpnext';
import {
  buildOnboardingComment,
  normalizeOnboardingPacket,
  validateOnboardingPacket,
} from '../../../../lib/onboarding-packet';
import type { OnboardingPacket, OnboardingSubmissionResponse } from '../../../../lib/onboarding-packet';

interface LeadDocument {
  readonly name?: string;
}

interface CommentDocument {
  readonly name?: string;
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function buildLeadPayload(packet: OnboardingPacket, leadSource: string, leadStatus?: string): Record<string, unknown> {
  return compactObject({
    doctype: 'Lead',
    lead_name: packet.contactName,
    company_name: packet.organizationName,
    email_id: packet.workEmail,
    source: leadSource,
    status: leadStatus,
    country: packet.country,
  });
}

function buildCommentPayload(packet: OnboardingPacket, leadName: string): Record<string, unknown> {
  return {
    doctype: 'Comment',
    comment_type: 'Comment',
    reference_doctype: 'Lead',
    reference_name: leadName,
    content: buildOnboardingComment(packet),
  };
}

export async function POST(request: Request): Promise<NextResponse<OnboardingSubmissionResponse>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Request body must be valid JSON.',
      },
      { status: 400 }
    );
  }

  const packet = normalizeOnboardingPacket(body as Record<string, unknown>);
  const missingPacketFields = validateOnboardingPacket(packet);
  if (missingPacketFields.length > 0) {
    return NextResponse.json(
      {
        status: 'error',
        message: `Missing onboarding fields: ${missingPacketFields.join(', ')}.`,
      },
      { status: 400 }
    );
  }

  const config = getErpnextConfig();
  const missingEnv = getErpnextMissingEnv(config);
  if (missingEnv.length > 0) {
    return NextResponse.json({
      status: 'not_configured',
      message: 'ERPNext API credentials are not configured yet.',
      missingEnv,
    });
  }

  try {
    const leadResult = await postErpnextResource<LeadDocument>(config, 'Lead', buildLeadPayload(packet, config.leadSource, config.leadStatus));
    const leadName = leadResult.data?.name;

    if (!leadName) {
      throw new Error('ERPNext lead creation succeeded but no lead name was returned.');
    }

    const commentResult = await postErpnextResource<CommentDocument>(config, 'Comment', buildCommentPayload(packet, leadName));

    return NextResponse.json({
      status: 'created',
      message: 'ERPNext lead and onboarding note created successfully.',
      submissionMode: 'direct_lead',
      leadName,
      leadUrl: getErpnextLeadUrl(config, leadName),
      commentName: commentResult.data?.name,
      redirectUrl: config.redirectUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'ERPNext onboarding submission failed.',
      },
      { status: 502 }
    );
  }
}
