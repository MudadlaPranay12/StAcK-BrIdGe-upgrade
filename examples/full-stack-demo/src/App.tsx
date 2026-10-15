import React, { useState } from 'react';

export function App() {
  const [status, setStatus] = useState<string>('Ready');

  async function triggerFailingCheckout() {
    setStatus('Calling /api/checkout...');
    const res = await fetch('/api/checkout', { method: 'POST' });
    if (!res.ok) {
      setStatus(`Error ${res.status}: Check DevBridge Panel -> Full-Stack X-Ray!`);
    }
  }

  return (
    <div className="max-w-xl mx-auto bg-slate-800 p-8 rounded-xl border border-slate-700">
      <h1 className="text-3xl font-bold text-green-400 mb-4">
        DevBridge Surgical Testbench
      </h1>
      <p className="text-slate-300 mb-6">
        1. Inspect the button below in DevBridge to live-edit its Tailwind classes and apply an atomic patch.
        2. Click the button to trigger a real backend crash and trace it in DevTools.
      </p>
      <button
        onClick={triggerFailingCheckout}
        className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-lg shadow"
      >
        Trigger Failing Checkout API
      </button>
      <div className="mt-4 text-sm font-mono text-amber-300">{status}</div>
    </div>
  );
}
