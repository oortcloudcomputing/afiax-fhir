// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { randomUUID } from 'node:crypto';
import { sendOutcome } from '../fhir/outcomes';
import { getLogger } from '../logger';
import { tryLogin } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { isExternalAuth } from './method';
import { getProjectIdByClientId, sendLoginResult } from './utils';

export const loginValidator = makeValidationMiddleware([
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 8 }).withMessage('Invalid password, must be at least 8 characters'),
]);

export async function loginHandler(req: Request, res: Response): Promise<void> {
  // Resource type can optionally be specified.
  // If specified, only memberships of that type will be returned.
  // If not specified, all memberships will be considered.
  const resourceType = req.body.resourceType as ResourceType | undefined;

  // Project ID can come from one of two sources
  // 1) Passed in explicitly as projectId
  // 2) Implicit with clientId
  // The only rule is that they have to match
  const clientId = req.body.clientId;
  const projectId = await getProjectIdByClientId(req.body.clientId, req.body.projectId as string | undefined);

  // An email domain with its own identity provider (DomainConfiguration) signs in only there, so
  // its sign-in policy, such as multi-factor authentication, cannot be skipped with a password.
  if (await isExternalAuth(req.body.email)) {
    sendOutcome(res, badRequest('Sign in with your organization account', 'email'));
    return;
  }

  const login = await tryLogin({
    authMethod: 'password',
    clientId,
    projectId,
    resourceType,
    scope: req.body.scope || 'openid',
    nonce: req.body.nonce || randomUUID(),
    launchId: req.body.launch,
    codeChallenge: req.body.codeChallenge,
    codeChallengeMethod: req.body.codeChallengeMethod,
    email: req.body.email,
    password: req.body.password,
    remember: req.body.remember,
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
    allowNoMembership: req.body.projectId === 'new',
    origin: req.get('Origin'),
  });

  getLogger().info('Login success', { email: req.body.email, projectId });

  await sendLoginResult(res, login);
}
