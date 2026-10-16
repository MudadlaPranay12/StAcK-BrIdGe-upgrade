// Debug Lab scenario catalogue. Every scenario performs a real HTTP request
// against the running demo API so the StackBridge panel can observe it.

import { rawRequest, type RawResult } from '../../lib/api';

export interface Scenario {
  id: string;
  method: 'GET' | 'POST';
  url: string;
  title: string;
  description: string;
  expected: string;
  tone: 'success' | 'warn' | 'danger' | 'info';
  note?: string;
  run: () => Promise<RawResult>;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'health',
    method: 'GET',
    url: '/api/debug/health',
    title: 'Healthy request',
    description: 'A normal 200 response with uptime and service metadata. The baseline for correlation.',
    expected: '200 OK',
    tone: 'success',
    run: () => rawRequest('/api/debug/health'),
  },
  {
    id: 'validate',
    method: 'POST',
    url: '/api/debug/validate',
    title: 'Validation error',
    description: 'Submits an invalid payload so the API returns field-level issues in a 400 response.',
    expected: '400 Bad Request',
    tone: 'warn',
    run: () => rawRequest('/api/debug/validate', { method: 'POST', body: { email: 'not-an-email', quantity: 0 } }),
  },
  {
    id: 'unauthorized',
    method: 'GET',
    url: '/api/debug/protected',
    title: 'Unauthorized request',
    description: 'Calls a demo endpoint without the required X-Demo-Auth header to produce a 401.',
    expected: '401 Unauthorized',
    tone: 'warn',
    run: () => rawRequest('/api/debug/protected'),
  },
  {
    id: 'authorized',
    method: 'GET',
    url: '/api/debug/protected',
    title: 'Authorized request',
    description: 'Same endpoint, this time with the demo header "northstar-demo", returning a 200.',
    expected: '200 OK',
    tone: 'success',
    run: () => rawRequest('/api/debug/protected', { headers: { 'X-Demo-Auth': 'northstar-demo' } }),
  },
  {
    id: 'not-found',
    method: 'GET',
    url: '/api/debug/not-found',
    title: 'Resource not found',
    description: 'Requests a deliberately missing resource to demonstrate a clean 404 envelope.',
    expected: '404 Not Found',
    tone: 'warn',
    run: () => rawRequest('/api/debug/not-found'),
  },
  {
    id: 'crash',
    method: 'GET',
    url: '/api/debug/crash',
    title: 'Server error (traced)',
    description: 'Dereferences an undefined value on the server, producing a real 500 and a backend stack trace.',
    expected: '500 Internal Server Error',
    tone: 'danger',
    note: 'Watch the StackBridge panel to see the exact backend source line.',
    run: () => rawRequest('/api/debug/crash'),
  },
  {
    id: 'slow',
    method: 'GET',
    url: '/api/debug/slow?ms=2500',
    title: 'Slow request',
    description: 'The server waits before responding so you can observe a long-running request in the timeline.',
    expected: '200 OK after ~2.5s',
    tone: 'info',
    run: () => rawRequest('/api/debug/slow?ms=2500'),
  },
  {
    id: 'timeout',
    method: 'GET',
    url: '/api/debug/timeout?ms=12000',
    title: 'Client-side abort',
    description: 'The request is aborted after 1.5s while the server would wait 12s, showing an aborted network entry.',
    expected: 'Aborted by the client',
    tone: 'info',
    run: () => {
      const controller = new AbortController();
      window.setTimeout(() => controller.abort(), 1500);
      return rawRequest('/api/debug/timeout?ms=12000', { signal: controller.signal });
    },
  },
  {
    id: 'checkout',
    method: 'POST',
    url: '/api/checkout',
    title: 'Preserved failing checkout',
    description: 'The original demo failure route. Always crashes so frontend and backend traces can be correlated.',
    expected: '500 Internal Server Error',
    tone: 'danger',
    note: 'This is the same route the checkout page can trigger on purpose.',
    run: () => rawRequest('/api/checkout', { method: 'POST' }),
  },
];
