// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Code,
  Divider,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Stepper,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { KenyaIhrAssessmentAnswers } from '@medplum/core';
import {
  findKenyaIhrCondition,
  formatDateTime,
  getProjectSettingString,
  KenyaIhrAssessmentTaskCode,
  KenyaIhrEscalationStages,
  KenyaIhrNotificationTaskCode,
  KenyaIhrQuestions,
  KenyaIhrTaskTypeSystem,
  normalizeErrorString,
} from '@medplum/core';
import type { Condition, DocumentReference, Parameters, Reference, Task } from '@medplum/fhirtypes';
import { MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

export interface ConditionIhrPanelProps {
  readonly condition: Condition;
}

type Answer = 'yes' | 'no' | '';

function getOutput(
  params: Parameters | undefined,
  name: string
): NonNullable<Parameters['parameter']>[number] | undefined {
  return params?.parameter?.find((p) => p.name === name);
}

export function ConditionIhrPanel(props: ConditionIhrPanelProps): JSX.Element | null {
  const medplum = useMedplum();
  if (!props.condition.id || getProjectSettingString(medplum.getProject(), 'countryPack') !== 'kenya') {
    return null;
  }
  return <ConditionIhrPanelContent {...props} />;
}

function ConditionIhrPanelContent({ condition }: ConditionIhrPanelProps): JSX.Element {
  const medplum = useMedplum();
  const match = findKenyaIhrCondition(condition.code);

  const [assessmentTask, setAssessmentTask] = useState<Task>();
  const [notificationTask, setNotificationTask] = useState<Task>();
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [answers, setAnswers] = useState<Record<keyof KenyaIhrAssessmentAnswers, Answer>>({
    seriousImpact: '',
    unusualOrUnexpected: '',
    internationalSpread: '',
    travelOrTradeRestrictions: '',
  });
  const [travelHistory, setTravelHistory] = useState('');
  const [controlMeasures, setControlMeasures] = useState('');
  const [caseCount, setCaseCount] = useState<number | string>(1);
  const [deathCount, setDeathCount] = useState<number | string>(0);
  const [escalationNote, setEscalationNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [rationale, setRationale] = useState<string>();
  const [report, setReport] = useState<DocumentReference>();

  const loadTasks = useCallback(async (): Promise<void> => {
    const find = async (code: string): Promise<Task | undefined> =>
      (
        await medplum.searchResources(
          'Task',
          { focus: `Condition/${condition.id}`, code: `${KenyaIhrTaskTypeSystem}|${code}`, _sort: '-_lastUpdated' },
          { cache: 'no-cache' }
        )
      )[0];
    const [assessment, notification] = await Promise.all([
      find(KenyaIhrAssessmentTaskCode),
      find(KenyaIhrNotificationTaskCode),
    ]);
    setAssessmentTask(assessment);
    setNotificationTask(notification);
    const reportRef = notification?.output?.[0]?.valueReference;
    setReport(reportRef ? await medplum.readReference(reportRef as Reference<DocumentReference>) : undefined);
    setLoaded(true);
  }, [medplum, condition.id]);

  useEffect(() => {
    loadTasks().catch((err) => setError(normalizeErrorString(err)));
  }, [loadTasks]);

  async function runAssessment(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const parameter: NonNullable<Parameters['parameter']> = [];
      for (const q of KenyaIhrQuestions) {
        if (answers[q.key]) {
          parameter.push({ name: q.key, valueBoolean: answers[q.key] === 'yes' });
        }
      }
      if (travelHistory.trim()) {
        parameter.push({ name: 'travelHistory', valueString: travelHistory.trim() });
      }
      if (controlMeasures.trim()) {
        parameter.push({ name: 'controlMeasures', valueString: controlMeasures.trim() });
      }
      parameter.push({ name: 'caseCount', valueInteger: Number(caseCount) || 1 });
      parameter.push({ name: 'deathCount', valueInteger: Number(deathCount) || 0 });
      const result: Parameters = await medplum.post(
        medplum.fhirUrl('Condition', condition.id as string, '$ihr-assessment'),
        {
          resourceType: 'Parameters',
          parameter,
        }
      );
      const notifiable = getOutput(result, 'notifiable')?.valueBoolean;
      setRationale(getOutput(result, 'rationale')?.valueString);
      showNotification({
        color: notifiable ? 'red' : 'green',
        message: notifiable ? 'IHR-notifiable: report generated and escalation started' : 'Not notifiable to WHO',
      });
      setShowForm(false);
      await loadTasks();
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setBusy(false);
    }
  }

  async function escalate(): Promise<void> {
    if (!notificationTask?.id) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await medplum.post(medplum.fhirUrl('Task', notificationTask.id, '$ihr-escalate'), {
        resourceType: 'Parameters',
        parameter: escalationNote.trim() ? [{ name: 'note', valueString: escalationNote.trim() }] : [],
      });
      setEscalationNote('');
      showNotification({ color: 'green', message: 'Escalation step recorded' });
      await loadTasks();
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setBusy(false);
    }
  }

  function downloadReport(): void {
    const attachment = report?.content?.[0]?.attachment;
    if (!attachment?.data) {
      return;
    }
    const blob = new Blob([atob(attachment.data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.title ?? 'ihr-notification.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const stageIndex = KenyaIhrEscalationStages.findIndex((s) => s.code === notificationTask?.businessStatus?.text);
  const reportJson = report?.content?.[0]?.attachment?.data ? atob(report.content[0].attachment.data) : undefined;
  const canAssess = !notificationTask && (assessmentTask?.status !== 'completed' || showForm);

  return (
    <Stack gap="sm" mt="md" data-testid="ihr-panel">
      <Divider />
      <Group justify="space-between">
        <Title order={4}>IHR (2005) International Notification</Title>
        {match ? (
          <Badge color={match.category === 'always-notifiable' ? 'red' : 'orange'}>
            {match.category === 'always-notifiable' ? 'IHR: always notifiable' : 'IHR: assessment required'}
          </Badge>
        ) : (
          <Badge color="gray">Not an IHR Annex 2 disease</Badge>
        )}
      </Group>

      {match && (
        <Text size="sm">
          {match.display} is listed in IHR (2005) Annex 2.{' '}
          {match.category === 'always-notifiable'
            ? 'A single case must be notified to WHO through the National IHR Focal Point within 24 hours.'
            : 'Assess it with the IHR decision instrument: it is notifiable to WHO if at least 2 of the 4 criteria apply.'}
        </Text>
      )}

      {error && <Alert color="red">{error}</Alert>}
      {rationale && (
        <Alert color="blue" variant="light">
          {rationale}
        </Alert>
      )}

      {loaded && assessmentTask && !notificationTask && assessmentTask.status === 'completed' && !showForm && (
        <Alert color="green" variant="light" title="Assessed: not notifiable to WHO">
          <Stack gap={4}>
            <Text size="sm">{assessmentTask.note?.at(-1)?.text}</Text>
            <Button size="xs" variant="default" w="fit-content" onClick={() => setShowForm(true)}>
              Reassess
            </Button>
          </Stack>
        </Alert>
      )}

      {loaded && !match && !assessmentTask && !notificationTask && !showForm && (
        <Button variant="default" w="fit-content" onClick={() => setShowForm(true)}>
          Assess as an event of potential international concern
        </Button>
      )}

      {loaded && canAssess && (match || showForm) && (
        <Stack gap="xs">
          {assessmentTask?.restriction?.period?.end && (
            <Text size="sm" c="dimmed">
              Assessment due by {formatDateTime(assessmentTask.restriction.period.end)}
            </Text>
          )}
          {match?.category !== 'always-notifiable' &&
            KenyaIhrQuestions.map((q) => (
              <Group key={q.key} justify="space-between" wrap="nowrap">
                <Text size="sm">{q.text}</Text>
                <SegmentedControl
                  size="xs"
                  aria-label={q.text}
                  value={answers[q.key]}
                  onChange={(value) => setAnswers({ ...answers, [q.key]: value as Answer })}
                  data={[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                  ]}
                />
              </Group>
            ))}
          <Textarea
            label="Exposure and travel history"
            autosize
            minRows={2}
            value={travelHistory}
            onChange={(e) => setTravelHistory(e.currentTarget.value)}
          />
          <Textarea
            label="Control measures taken"
            autosize
            minRows={2}
            value={controlMeasures}
            onChange={(e) => setControlMeasures(e.currentTarget.value)}
          />
          <Group grow>
            <NumberInput label="Cases in this event" min={1} value={caseCount} onChange={setCaseCount} />
            <NumberInput label="Deaths" min={0} value={deathCount} onChange={setDeathCount} />
          </Group>
          <Button w="fit-content" loading={busy} onClick={() => runAssessment().catch(console.error)}>
            Run IHR assessment
          </Button>
        </Stack>
      )}

      {notificationTask && (
        <Stack gap="xs">
          <Alert color="red" variant="light" title="Notifiable to WHO">
            WHO must be notified through the National IHR Focal Point
            {notificationTask.restriction?.period?.end
              ? ` by ${formatDateTime(notificationTask.restriction.period.end)}`
              : ' within 24 hours'}{' '}
            (IHR Article 6).
          </Alert>
          <Stepper active={stageIndex + 1} orientation="vertical" size="sm">
            {KenyaIhrEscalationStages.slice(1).map((s) => (
              <Stepper.Step key={s.code} label={s.display} />
            ))}
          </Stepper>
          {notificationTask.note?.map((n, i) => (
            <Text key={i} size="xs" c="dimmed">
              {n.time ? formatDateTime(n.time) : ''}: {n.text}
            </Text>
          ))}
          {notificationTask.status !== 'completed' && (
            <Group align="end">
              <TextInput
                label={`Record: ${KenyaIhrEscalationStages[stageIndex + 1]?.display ?? ''}`}
                placeholder="Who was contacted, how, reference number"
                style={{ flex: 1 }}
                value={escalationNote}
                onChange={(e) => setEscalationNote(e.currentTarget.value)}
              />
              <Button loading={busy} onClick={() => escalate().catch(console.error)}>
                Record step
              </Button>
            </Group>
          )}
          <Group>
            {report && <MedplumLink to={report}>IHR report ({report.id})</MedplumLink>}
            {reportJson && (
              <Button size="xs" variant="default" onClick={downloadReport}>
                Download report
              </Button>
            )}
          </Group>
          {reportJson && (
            <Code block mah={300} style={{ overflow: 'auto' }}>
              {reportJson}
            </Code>
          )}
        </Stack>
      )}
    </Stack>
  );
}
