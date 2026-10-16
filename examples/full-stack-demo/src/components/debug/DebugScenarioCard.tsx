import type { RawResult } from '../../lib/api';
import type { Scenario } from './scenarios';
import { cx } from '../../lib/utils';
import { Button } from '../ui/Button';

export function pillClass(result: RawResult): string {
  if (result.status === 0) return 'is-error';
  if (result.status >= 500) return 'is-5xx';
  if (result.status >= 400) return 'is-4xx';
  return 'is-2xx';
}

function bodyText(result: RawResult): string {
  if (result.networkError) return `✗ ${result.statusText}: ${result.networkError}`;
  if (result.body === null || result.body === '') return '— no response body —';
  if (typeof result.body === 'string') return result.body;
  try {
    return JSON.stringify(result.body, null, 2);
  } catch {
    return result.text;
  }
}

interface DebugScenarioCardProps {
  scenario: Scenario;
  index: number;
  result: RawResult | null;
  running: boolean;
  onRun: () => void;
}

/** One interactive scenario: method, endpoint, expected outcome and last result. */
export function DebugScenarioCard({ scenario, index, result, running, onRun }: DebugScenarioCardProps) {
  return (
    <div className="scenario-card">
      <div className="scenario-head">
        <span className="scenario-index">{index}</span>
        <div className="stack grow" style={{ gap: 4 }}>
          <span className="row row--gap row--wrap">
            <span className={`method method--${scenario.method.toLowerCase()}`}>{scenario.method}</span>
            <span className="scenario-url">{scenario.url}</span>
            <span className="scenario-title">{scenario.title}</span>
          </span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {scenario.description}
          </span>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
          <span className="badge" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
            Expect {scenario.expected}
          </span>
          <Button size="sm" variant={result ? 'secondary' : 'primary'} icon="play" loading={running} onClick={onRun}>
            {result ? 'Run again' : 'Run'}
          </Button>
        </div>
      </div>

      {scenario.note ? <span className="field-hint">ⓘ {scenario.note}</span> : null}

      {result ? (
        <div className="scenario-result">
          <div className="scenario-result-head">
            <span className={cx('status-pill', pillClass(result))}>{result.status === 0 ? (result.statusText === 'Aborted' ? 'ABORTED' : 'ERR') : result.status}</span>
            <span className="strong">{result.statusText}</span>
            <span className="dim">{result.durationMs} ms</span>
            <span className="spacer" />
            <span className="dim mono">{result.meta.correlationId ?? 'no correlation id'}</span>
            {result.meta.traceId ? <span className="dim mono">trace {result.meta.traceId}</span> : null}
          </div>
          <pre className="scenario-result-body">{bodyText(result)}</pre>
        </div>
      ) : (
        <div className="scenario-result">
          <div className="scenario-result-head">
            <span className="status-pill is-pending">not run</span>
            <span className="dim">Click Run to send a real request to the demo API.</span>
          </div>
        </div>
      )}
    </div>
  );
}
