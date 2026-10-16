import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Northstar Commerce: #root container was not found in index.html.');
}

// NOTE: React.StrictMode is intentionally omitted. The demo is used to verify
// real network behaviour in the DevTools panel, and StrictMode's deliberate
// double-invoked effects would duplicate every request during development.
createRoot(container).render(<App />);
