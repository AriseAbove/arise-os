import { emailStatus } from '@/lib/connectors/email';
import { smsStatus } from '@/lib/connectors/sms';
import { calendarStatus } from '@/lib/connectors/gcal';
import { quickbooksStatus } from '@/lib/connectors/quickbooks';
import { alloStatus } from '@/lib/connectors/allo';
import { oneupStatus } from '@/lib/connectors/oneup';
import { llmStatus } from '@/lib/connectors/llm';
import { getBrainProvider } from '@/lib/brain';
import { runtimeEnv } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

async function brainConnectorStatus(): Promise<ConnectorStatus> {
  const status = await getBrainProvider().status();
  return {
    id: 'brain',
    name: 'Knowledge store',
    kind: 'brain',
    state: status.connected ? 'connected' : 'not_configured',
    detail: status.detail,
    meta: { provider: status.provider },
  };
}

const CHECKS: [string, ConnectorStatus['kind'], () => Promise<ConnectorStatus>][] = [
  ['brain', 'brain', brainConnectorStatus],
  ['llm', 'orchestration', llmStatus],
  ['email', 'email', () => emailStatus(runtimeEnv())],
  ['sms', 'sms', () => Promise.resolve(smsStatus(runtimeEnv()))],
  ['calendar', 'calendar', calendarStatus],
  ['quickbooks', 'payments', () => quickbooksStatus(runtimeEnv())],
  ['allo', 'crm', () => alloStatus(runtimeEnv())],
  ['oneup', 'social', () => oneupStatus(runtimeEnv())],
];

export async function allConnectorStatuses(): Promise<ConnectorStatus[]> {
  return Promise.all(
    CHECKS.map(([id, kind, check]) =>
      check().catch(
        (err): ConnectorStatus => ({
          id,
          name: id,
          kind,
          state: 'error',
          detail: err instanceof Error ? err.message : String(err),
        }),
      ),
    ),
  );
}
