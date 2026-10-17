// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Kafka producer for the DHA audit trail streaming pipeline.
 *
 * All AuditEvent resources are published to the configured topic (default: "audit.events")
 * with the project ID as the partition key. Consumers (e.g. OpenSearch Connector) write to
 * a WORM index for the 7-year retention required by HMPR 2025 Reg.12(c).
 *
 * This module is a fire-and-forget side-channel — publishing failures are logged but never
 * propagate to the caller or block FHIR responses.
 */

import type { AuditEvent } from '@medplum/fhirtypes';
import type { Kafka as KafkaClient, SASLOptions } from 'kafkajs';
import type { MedplumKafkaConfig } from '../config/types';

interface KafkaState {
  producer: KafkaProducer | undefined;
  topic: string;
}

/** Minimal interface covering the kafkajs Producer methods we use. Allows clean mocking in tests. */
export interface KafkaProducer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(record: {
    topic: string;
    messages: { key?: string; value: string; headers?: Record<string, string> }[];
  }): Promise<unknown>;
}

const state: KafkaState = {
  producer: undefined,
  topic: 'audit.events',
};

/**
 * Initialises the Kafka producer.  Called once during server startup when `config.kafka` is set.
 * Connection errors are caught and logged; the producer is set to undefined so that subsequent
 * calls to `publishAuditEvent` are silent no-ops rather than crashes.
 * @param config - Kafka broker, topic and authentication settings.
 */
export function initKafkaProducer(config: MedplumKafkaConfig): void {
  // Dynamic require keeps kafkajs out of the module graph when Kafka is not configured,
  // which avoids import-time errors in environments where the package is optional.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Kafka } = require('kafkajs') as { Kafka: typeof KafkaClient };

  const kafka = new Kafka({
    clientId: config.clientId ?? 'afiax-fhir-server',
    brokers: config.brokers,
    ssl: config.ssl,
    sasl: config.sasl as SASLOptions | undefined,
  });

  state.topic = config.auditTopic ?? 'audit.events';
  state.producer = kafka.producer({ allowAutoTopicCreation: false }) as KafkaProducer;

  state.producer.connect().catch((err: Error) => {
    console.error('[kafka] Producer connect failed:', err.message);
    state.producer = undefined;
  });
}

/**
 * Disconnects the Kafka producer.  Called during server shutdown.
 */
export async function shutdownKafkaProducer(): Promise<void> {
  if (state.producer) {
    await state.producer.disconnect().catch((err: Error) => {
      console.error('[kafka] Producer disconnect error:', err.message);
    });
    state.producer = undefined;
  }
}

/**
 * Publishes an AuditEvent to the Kafka audit topic.
 * Fire-and-forget: never throws, never awaited by the caller.
 * No-op when the producer is not initialised (Kafka not configured or connect failed).
 * @param auditEvent - The AuditEvent to publish.
 */
export function publishAuditEvent(auditEvent: AuditEvent): void {
  if (!state.producer) {
    return;
  }
  const projectId = auditEvent.meta?.project ?? 'unknown';
  state.producer
    .send({
      topic: state.topic,
      messages: [
        {
          key: projectId,
          value: JSON.stringify(auditEvent),
          headers: {
            resourceType: 'AuditEvent',
            projectId,
            eventId: auditEvent.id ?? '',
          },
        },
      ],
    })
    .catch((err: Error) => {
      console.error('[kafka] Failed to publish AuditEvent:', err.message);
    });
}

/**
 * Exposed for testing: overrides the internal producer with a mock.
 * @param producer - The producer to use, or undefined to disable publishing.
 * @param topic - The topic to publish to.
 */
export function _setProducerForTesting(producer: KafkaProducer | undefined, topic = 'audit.events'): void {
  state.producer = producer;
  state.topic = topic;
}
