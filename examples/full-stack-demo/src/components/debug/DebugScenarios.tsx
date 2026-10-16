import { useState } from 'react';
import type { RawResult } from '../../lib/api';
import { SCENARIOS, type Scenario } from './scenarios';
import { DebugScenarioCard } from './DebugScenarioCard';
import { Button } from '../ui/Button';

/** Stateful list of scenarios: runs them on demand and keeps each last result. */
export function DebugScenarios() {
  const [results, setResults] = useState<Record<string, RawResult>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [batchRunning, setBatchRunning] = useState(false);

  async function run(scenario: Scenario): Promise<void> {
    setRunning((current) => ({ ...current, [scenario.id]: true }));
    try {
      const result = await scenario.run();
      setResults((current) => ({ ...current, [scenario.id]: result }));
    } finally {
      setRunning((current) => ({ ...current, [scenario.id]: false }));
    }
  }

  async function runAll() {
    setBatchRunning(true);
    for (const scenario of SCENARIOS) {
      await run(scenario);
    }
    setBatchRunning(false);
  }

  const completed = Object.keys(results).length;

  return (
    <div className="stack stack--gap">
      <div className="row row--between row--gap row--wrap">
        <span className="muted">
          <strong>{completed}</strong> of <strong>{SCENARIOS.length}</strong> scenarios executed in this session.
        </span>
        <div className="row row--gap">
          <Button
            variant="ghost"
            icon="refresh"
            onClick={() => setResults({})}
            disabled={completed === 0 || batchRunning}
          >
            Clear results
          </Button>
          <Button variant="secondary" icon="zap" loading={batchRunning} onClick={runAll}>
            Run all scenarios
          </Button>
        </div>
      </div>

      {SCENARIOS.map((scenario, index) => (
        <DebugScenarioCard
          key={scenario.id}
          scenario={scenario}
          index={index + 1}
          result={results[scenario.id] ?? null}
          running={Boolean(running[scenario.id])}
          onRun={() => void run(scenario)}
        />
      ))}
    </div>
  );
}
