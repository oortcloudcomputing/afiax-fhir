// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bot, ClientApplication, ProjectSetting } from '@medplum/fhirtypes';
import type { KeepJobs } from 'bullmq';

export interface MedplumServerConfig {
  port: number;
  baseUrl: string;
  issuer: string;
  jwksUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  introspectUrl: string;
  registerUrl: string;
  appBaseUrl: string;
  logLevel?: string;
  binaryStorage?: string;
  storageBaseUrl: string;
  signingKey?: string;
  signingKeyId?: string;
  signingKeyPassphrase?: string;
  supportEmail: string;
  approvedSenderEmails?: string;
  database: MedplumDatabaseConfig;
  /** @deprecated specify `database.host` and `database.ssl.require` as needed */
  databaseProxyEndpoint?: string;
  readonlyDatabase?: MedplumDatabaseConfig;
  /** @deprecated specify `readonlyDatabase.host` and `readonlyDatabase.ssl.require` as needed */
  readonlyDatabaseProxyEndpoint?: string;
  redis: MedplumRedisConfig;
  /**
   * Optional separate Redis config for caching (resource cache, keyvalue store, server registry, etc.).
   * Falls back to `redis` if not specified.
   * Separating cache from other purposes can improve performance under high load by isolating cache operations.
   */
  cacheRedis?: MedplumRedisConfig;
  /**
   * Optional separate Redis config for rate limiting (HTTP rate limiter, FHIR quota, resource cap).
   * Falls back to `redis` if not specified.
   * Separating rate limiting from other purposes can improve performance under high load by isolating rate limiting operations.
   */
  rateLimitRedis?: MedplumRedisConfig;
  /**
   * Optional separate Redis config for pub/sub (websockets, FHIRcast, agent, MCP).
   * Falls back to `redis` if not specified.
   * Separating pub/sub from other purposes can improve performance under high load by isolating pub/sub operations.
   */
  pubSubRedis?: MedplumRedisConfig;
  /**
   * Optional separate Redis config for BullMQ job queues (all background workers).
   * Falls back to `redis` if not specified.
   * Separating background job queues from other purposes can improve performance under high load by isolating job queue operations.
   */
  backgroundJobsRedis?: MedplumRedisConfig;
  emailProvider?: 'none' | 'awsses' | 'smtp';
  smtp?: MedplumSmtpConfig;
  bullmq?: MedplumBullmqConfig;
  googleClientId?: string;
  googleClientSecret?: string;
  recaptchaSiteKey?: string;
  recaptchaSecretKey?: string;
  maxJsonSize: string;
  maxBatchSize: string;
  allowedOrigins?: string;
  awsRegion: string;
  /** Custom S3 endpoint for S3-compatible binary storage (e.g. MinIO); enables path-style addressing */
  s3Endpoint?: string;
  botLambdaRoleArn: string;
  botLambdaLayerName: string;
  botCustomFunctionsEnabled?: boolean;
  logRequests?: boolean;
  logAuditEvents?: boolean;
  saveAuditEvents?: boolean;
  registerEnabled?: boolean;
  bcryptHashSalt: number;
  introspectionEnabled?: boolean;
  keepAliveTimeout?: number;
  vmContextBotsEnabled?: boolean;
  vmContextBaseUrl?: string;
  shutdownTimeoutMilliseconds?: number;
  heartbeatMilliseconds?: number;
  heartbeatEnabled?: boolean;
  accurateCountThreshold: number;
  maxSearchOffset?: number;
  base64BinaryMaxBytes?: number;
  defaultSuperAdminEmail?: string;
  defaultSuperAdminPassword?: string;
  defaultSuperAdminClientId?: string;
  defaultSuperAdminClientSecret?: string;
  defaultBotRuntimeVersion: NonNullable<Bot['runtimeVersion']>;
  defaultProjectFeatures?: (
    | 'aws-comprehend'
    | 'aws-textract'
    | 'bots'
    | 'cron'
    | 'email'
    | 'google-auth-required'
    | 'graphql-introspection'
    | 'websocket-subscriptions'
    | 'transaction-bundles'
  )[];
  defaultProjectSystemSetting?: ProjectSetting[];
  /** Number of HTTP requests per minute users can make by default; overridable by Project settings */
  defaultRateLimit?: number;
  defaultAuthRateLimit?: number;
  /** Number of FHIR interaction rate limit units per minute users can consume by default; overridable by Project settings */
  defaultFhirQuota?: number;
  /** Optional config for global default for `maxUserWebSocketSubscriptions`; overridable by Project setting: `maxUserWebSocketSubscriptions` */
  defaultMaxUserWebSocketSubscriptions?: number;

  /** Max length of Bot AuditEvent.outcomeDesc when creating a FHIR Resource */
  maxBotLogLengthForResource?: number;

  /** Max length of Bot AuditEvent.outcomeDesc when logging to logger */
  maxBotLogLengthForLogs?: number;

  /** Number of attempts for transactions that fail due to retry-able transaction errors */
  transactionAttempts?: number;

  /** Number of milliseconds to use as a base for exponential backoff in transaction retries */
  transactionExpBackoffBaseDelayMs?: number;

  /** Flag to enable/disable the binary storage auto-downloader service (default 'true' for enabled) */
  autoDownloadEnabled?: boolean;

  /** Flag to enable pre-commit subscriptions for the interceptor pattern (default: false) */
  preCommitSubscriptionsEnabled?: boolean;

  /** Optional list of external authentication providers. */
  externalAuthProviders?: MedplumExternalAuthConfig[];

  /** Optional list of default OAuth2 clients */
  defaultOAuthClients?: ClientApplication[];

  /** Optional flag to enable the MCP server beta */
  mcpEnabled?: boolean;

  /** Optional config for Fission.io bots */
  fission?: MedplumFissionConfig;

  /** Optional config for Knative bots */
  knative?: MedplumKnativeConfig;

  /**
   * Optional minimum LIMIT N for queries generated by FHIR searches.
   *
   * Enforce a floor in the LIMIT N clause of FHIR search SQL queries. If the query planner
   * vastly over estimates how many matching rows exist and we are only asking for a few rows,
   * the planner may choose a sequential scan since it thinks it will surely find enough
   * rows without needing to scan much of the table. Increasing the limit has a dramatic
   * impact on the planner's estimated cost of the sequential scan which makes it more likely
   * for an alternative, index-based plan to be used.
   */
  fhirSearchMinLimit?: number;

  /** Optional flag to discourage seqscan query plans for queries generated by FHIR searches */
  fhirSearchDiscourageSeqScan?: boolean;

  redactAuditEvents?: boolean;

  /** Optional configuration for array column padding to mitigate statistics issues in Postgres. */
  arrayColumnPadding?: {
    [searchParamCode: string]:
      | { resourceType?: string[]; config: ArrayColumnPaddingConfig }
      | { resourceType?: string[]; config: ArrayColumnPaddingConfig }[];
  };

  /** TOTP authenticator window for MFA token validation (default: 1) */
  mfaAuthenticatorWindow?: number;

  /**
   * Optional configuration for background worker pools.
   * Allows running separate server pools for HTTP request serving vs. background job processing.
   */
  workers?: MedplumWorkersConfig;

  /** Optional Kafka configuration for the DHA audit trail streaming pipeline. */
  kafka?: MedplumKafkaConfig;

  /** Optional field-level encryption of stored resource bodies (see fhir/encryption.ts). */
  fieldEncryption?: MedplumFieldEncryptionConfig;

  /** Optional PostgreSQL row-level security for project isolation (see fhir/rls.ts). */
  rowLevelSecurity?: boolean;
}

/** Field-level encryption config: envelope encryption with Vault Transit data keys. */
export interface MedplumFieldEncryptionConfig {
  enabled: boolean;
  /** Resource types to encrypt. Defaults to clinical, identity and payment resources. */
  resourceTypes?: string[];
  /** Hours between data-key rotations (Vault mode). Default 24; 0 disables rotation. */
  rotationHours?: number;
  vault?: {
    /** Vault address, e.g. http://vault.vault.svc.cluster.local:8200 */
    address: string;
    /** Transit secrets engine mount. Default 'transit'. */
    transitMount?: string;
    /** Transit key name. Default 'afiax-fhir'. */
    keyName?: string;
    /** Vault Kubernetes auth role (preferred in-cluster). */
    kubernetesRole?: string;
    /** Vault Kubernetes auth mount. Default 'kubernetes'. */
    kubernetesAuthMount?: string;
    /** Service account token path. Default /var/run/secrets/kubernetes.io/serviceaccount/token */
    kubernetesTokenPath?: string;
    /** Static Vault token — local development only. */
    token?: string;
  };
  /** Base64 32-byte key used instead of Vault — tests and local development only, never production. */
  localKey?: string;
}

export interface ArrayColumnPaddingConfig {
  /** Count of distinct padding elements to choose from for padding elements  */
  readonly m: number;
  /**
   * The lambda from the poisson distribution to achieve the desired padding
   * element frequency with the desired confidence. See {@link https://github.com/medplum/medplum/issues/7539}
   * or comments in `packages/server/src/fhir/token-column.ts` for in depth discussion.
   */
  readonly lambda: number;
  /** The postgres statistics target for the array column */
  readonly statisticsTarget: number;
}

/**
 * The SSL configuration for the database.
 */
export interface MedplumDatabaseSslConfig {
  ca?: string;
  key?: string;
  cert?: string;
  rejectUnauthorized?: boolean;
  require?: boolean;
}

/**
 * Based on AWS Secrets Manager for databases.
 * See: https://docs.aws.amazon.com/secretsmanager/latest/userguide/secretsmanager-userguide.pdf
 */
export interface MedplumDatabaseConfig {
  host?: string;
  port?: number;
  dbname?: string;
  username?: string;
  password?: string;
  ssl?: MedplumDatabaseSslConfig;
  queryTimeout?: number;
  runMigrations?: boolean;
  /**
   * Prevent post-deploy migrations from being automatically run after server startup.
   * Setting this to `true` is not recommended except for advanced use cases.
   */
  disableRunPostDeployMigrations?: boolean;
  maxConnections?: number;
  disableConnectionConfiguration?: boolean;
}

export interface MedplumRedisConfig {
  host?: string;
  port?: number;
  password?: string;
  /** The logical database to use for Redis. See: https://redis.io/commands/select/. Default is `0`. */
  db?: number;
  tls?: Record<string, unknown>;
}

export interface MedplumSmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface MedplumBullmqConfig {
  /**
   * Amount of jobs that a single worker is allowed to work on in parallel.
   * @see {@link https://docs.bullmq.io/guide/workers/concurrency}
   */
  concurrency?: number;
  removeOnComplete: KeepJobs;
  removeOnFail: KeepJobs;
}

export interface MedplumExternalAuthConfig {
  readonly issuer: string;
  readonly userInfoUrl: string;
}

export type WorkerName =
  | 'subscription'
  | 'download'
  | 'cron'
  | 'reindex'
  | 'batch'
  | 'post-deploy-migration'
  | 'set-accounts';

export interface MedplumWorkersConfig {
  /**
   * Which workers to run on this server instance. Include '*' to enable all workers.
   * If undefined/omitted: all workers run (backwards compatible default)
   * Specify an empty array to run no workers e.g. for an HTTP-only pool.
   */
  enabled?: (WorkerName | '*')[];

  /**
   * Per-worker BullMQ overrides, merged on top of global `bullmq` config.
   * Only takes effect for workers that are enabled.
   */
  bullmq?: Partial<Record<WorkerName, Partial<MedplumBullmqConfig>>>;
}

export interface MedplumFissionConfig {
  readonly namespace: string;
  readonly fieldManager: string;
  readonly environmentName: string;
  readonly routerHost: string;
  readonly routerPort: number;
}

export interface MedplumKnativeConfig {
  readonly invocationUrl: string;
  readonly authHeader?: string;
  readonly authToken?: string;
  readonly timeoutMilliseconds?: number;
}

/** Kafka producer config for the DHA-mandated audit event streaming pipeline. */
export interface MedplumKafkaConfig {
  /** Kafka broker addresses, e.g. ["broker1:9092", "broker2:9092"] */
  brokers: string[];
  /** Client ID reported to Kafka brokers (default: "afiax-fhir-server") */
  clientId?: string;
  /** Topic to publish AuditEvent records to (default: "audit.events") */
  auditTopic?: string;
  /** Enable TLS for broker connections */
  ssl?: boolean;
  /** Optional SASL credentials for broker authentication */
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
}
