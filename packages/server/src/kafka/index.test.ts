// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AuditEvent } from '@medplum/fhirtypes';
import type { KafkaProducer } from './index';
import { _setProducerForTesting, publishAuditEvent, shutdownKafkaProducer } from './index';

function makeAuditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    resourceType: 'AuditEvent',
    id: 'ae-001',
    type: { code: 'rest' },
    recorded: '2026-06-18T00:00:00Z',
    outcome: '0',
    agent: [{ requestor: true }],
    source: { observer: {} },
    meta: { project: 'project-123' },
    ...overrides,
  };
}

describe('Kafka audit publisher', () => {
  afterEach(() => {
    // Reset module state between tests
    _setProducerForTesting(undefined);
    jest.clearAllMocks();
  });

  test('publishAuditEvent is a no-op when producer is not initialised', () => {
    // Should not throw
    expect(() => publishAuditEvent(makeAuditEvent())).not.toThrow();
  });

  test('publishAuditEvent sends message with project ID as key', () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const producer: KafkaProducer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send,
    };
    _setProducerForTesting(producer, 'audit.events');

    publishAuditEvent(makeAuditEvent());

    expect(send).toHaveBeenCalledWith({
      topic: 'audit.events',
      messages: [
        expect.objectContaining({
          key: 'project-123',
          value: expect.stringContaining('"resourceType":"AuditEvent"'),
          headers: expect.objectContaining({
            resourceType: 'AuditEvent',
            projectId: 'project-123',
            eventId: 'ae-001',
          }),
        }),
      ],
    });
  });

  test('publishAuditEvent uses "unknown" key when AuditEvent has no meta.project', () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const producer: KafkaProducer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send,
    };
    _setProducerForTesting(producer);

    publishAuditEvent(makeAuditEvent({ meta: undefined }));

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ key: 'unknown' })],
      })
    );
  });

  test('publishAuditEvent swallows send errors without throwing', async () => {
    const send = jest.fn().mockRejectedValue(new Error('broker down'));
    const producer: KafkaProducer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send,
    };
    _setProducerForTesting(producer);

    // Should not throw even though send rejects
    expect(() => publishAuditEvent(makeAuditEvent())).not.toThrow();

    // Allow the rejected promise to settle
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    expect(send).toHaveBeenCalled();
  });

  test('publishAuditEvent serialises full AuditEvent JSON in message value', () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const producer: KafkaProducer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send,
    };
    _setProducerForTesting(producer);

    const event = makeAuditEvent({ outcome: '4', id: 'ae-error-1' });
    publishAuditEvent(event);

    const [call] = send.mock.calls;
    const value = JSON.parse(call[0].messages[0].value);
    expect(value.resourceType).toBe('AuditEvent');
    expect(value.outcome).toBe('4');
    expect(value.id).toBe('ae-error-1');
  });

  test('shutdownKafkaProducer disconnects and clears the producer', async () => {
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const producer: KafkaProducer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect,
      send: jest.fn().mockResolvedValue(undefined),
    };
    _setProducerForTesting(producer);

    await shutdownKafkaProducer();

    expect(disconnect).toHaveBeenCalled();
    // After shutdown, publish should be a no-op (producer cleared)
    const send2 = jest.fn();
    expect(() => publishAuditEvent(makeAuditEvent())).not.toThrow();
    expect(send2).not.toHaveBeenCalled();
  });

  test('shutdownKafkaProducer is a no-op when producer is not initialised', async () => {
    await expect(shutdownKafkaProducer()).resolves.toBeUndefined();
  });
});
