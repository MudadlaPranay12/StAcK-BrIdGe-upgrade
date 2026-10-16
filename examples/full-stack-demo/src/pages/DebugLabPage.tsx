import { useDocumentTitle } from '../lib/hooks';
import { PageHeader } from '../components/layout/PageHeader';
import { Alert, Card, CardBody, CardHeader } from '../components/ui/Display';
import { DebugScenarios } from '../components/debug/DebugScenarios';
import { InspectorFixtures } from '../components/debug/InspectorFixtures';

const ENDPOINTS: Array<{ method: string; path: string; purpose: string }> = [
  { method: 'GET', path: '/api/debug/health', purpose: 'Baseline 200 with service metadata' },
  { method: 'POST', path: '/api/debug/validate', purpose: '400 with field-level validation issues' },
  { method: 'GET', path: '/api/debug/protected', purpose: '401 without the demo auth header' },
  { method: 'GET', path: '/api/debug/not-found', purpose: '404 resource-not-found envelope' },
  { method: 'GET', path: '/api/debug/crash', purpose: 'Real traced 500 from the backend' },
  { method: 'GET', path: '/api/debug/slow?ms=2500', purpose: 'A long-running request' },
  { method: 'GET', path: '/api/debug/timeout?ms=12000', purpose: 'Aborted by the client after 1.5s' },
  { method: 'POST', path: '/api/checkout', purpose: 'The preserved original failing checkout' },
];

/** Compact reference of exactly which server routes the lab can trigger. */
function EndpointReference() {
  return (
    <Card>
      <CardHeader title="Endpoint reference" subtitle="Every scenario calls one of these real routes" />
      <CardBody flush>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Method</th>
                <th>Path</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((endpoint) => (
                <tr key={`${endpoint.method} ${endpoint.path}`}>
                  <td>
                    <span className="mono strong">{endpoint.method}</span>
                  </td>
                  <td>
                    <span className="mono">{endpoint.path}</span>
                  </td>
                  <td className="muted">{endpoint.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

export function DebugLabPage() {
  useDocumentTitle('Debug Lab — Northstar Commerce');

  return (
    <div className="page">
      <PageHeader
        eyebrow="Debug Lab"
        title="Debug Lab"
        subtitle="Trigger real requests — success and failure — and inspect them in the StackBridge panel."
      />

      <Alert tone="warn" title="These buttons hit the real API">
        Each scenario issues a genuine HTTP request through <span className="mono">fetch</span>, so the
        StackBridge extension can correlate the network entry with a backend trace. Nothing here is
        mocked or simulated.
      </Alert>

      <DebugScenarios />

      <EndpointReference />

      <InspectorFixtures />
    </div>
  );
}

export default DebugLabPage;
