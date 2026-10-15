// panel.js
const AGENT_URL = "http://127.0.0.1:4321";
const AGENT_TOKEN = "devbridge-local-secret";
const tabId = chrome.devtools.inspectedWindow.tabId;

const port = chrome.runtime.connect({ name: "devbridge-panel" });
port.postMessage({ type: "INIT", tabId });

let currentRecord = null;
let currentFileHash = null;
let latestBackendTrace = null;
let currentRuntime = null; // { fiberProps, fiberState, fiberComponent, instanceCount, innerText }
let pendingAiPatch = null; // { start, end, replacement } staged by Gemini, applied via Apply AI Patch
let inspectEnabled = false;

const btnInspect = document.getElementById("btn-inspect");
const btnOpenFront = document.getElementById("btn-open-front");
const btnLocate = document.getElementById("btn-locate");
const btnRollback = document.getElementById("btn-rollback");
const btnPreviewDiff = document.getElementById("btn-preview-diff");
const btnApplyPatch = document.getElementById("btn-apply-patch");
const btnPreviewText = document.getElementById("btn-preview-text");
const btnApplyText = document.getElementById("btn-apply-text");
const btnPreviewProp = document.getElementById("btn-preview-prop");
const btnApplyProp = document.getElementById("btn-apply-prop");
const btnCopyAi = document.getElementById("btn-copy-ai");
const btnAiFix = document.getElementById("btn-ai-fix");
const btnAiApply = document.getElementById("btn-ai-apply");
const aiExplanation = document.getElementById("ai-explanation");
const aiProvider = document.getElementById("ai-provider");
const aiApiKey = document.getElementById("ai-apikey");
const aiModel = document.getElementById("ai-model");
const aiBaseUrl = document.getElementById("ai-baseurl");
const inputClassName = document.getElementById("input-classname");
const inputText = document.getElementById("input-text");
const selectProp = document.getElementById("select-prop");
const inputProp = document.getElementById("input-prop");
const identityMeta = document.getElementById("identity-meta");
const instanceMeta = document.getElementById("instance-meta");
const codePreview = document.getElementById("code-preview");
const propsPreview = document.getElementById("props-preview");
const tracesContainer = document.getElementById("traces-container");

async function agentFetch(path, options = {}) {
  const res = await fetch(`${AGENT_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-DevBridge-Token": AGENT_TOKEN,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Generic surgical patch helper — refreshes range end so consecutive edits work without re-inspect
async function applyRangePatch(range, replacement, onApplied) {
  const res = await agentFetch("/api/v1/patches/apply", {
    method: "POST",
    body: JSON.stringify({
      file: currentRecord.file,
      originalHash: currentFileHash,
      start: range.start,
      end: range.end,
      replacement,
    }),
  });
  currentFileHash = res.newHash;
  // Replacement is single-line from here on (quotes included for literals)
  range.end = {
    line: range.start.line,
    column: range.start.column + replacement.length,
  };
  // Any manual edit invalidates a staged AI element patch — re-generate it.
  pendingAiPatch = null;
  if (typeof btnAiApply !== "undefined" && btnAiApply) btnAiApply.disabled = true;
  if (onApplied) onApplied(res);
  return res;
}

async function previewRangePatch(range, replacement) {
  const res = await agentFetch("/api/v1/patches/preview", {
    method: "POST",
    body: JSON.stringify({
      file: currentRecord.file,
      originalHash: currentFileHash,
      start: range.start,
      end: range.end,
      replacement,
    }),
  });
  codePreview.textContent = res.unifiedDiff;
}

// 1. Toggle Inspect Mode
btnInspect.addEventListener("click", () => {
  inspectEnabled = !inspectEnabled;
  btnInspect.textContent = inspectEnabled ? "Cancel Inspect" : "Inspect Element";
  port.postMessage({ type: "TOGGLE_INSPECT", tabId, enabled: inspectEnabled });
});

// 1b. Locate in DOM — flash + scroll to every live node with this data-dev-id
if (btnLocate) {
  btnLocate.addEventListener("click", () => {
    if (!currentRecord) return;
    port.postMessage({ type: "LOCATE_IN_DOM", tabId, devId: currentRecord.id });
    if (instanceMeta) instanceMeta.textContent = `Locating ${currentRecord.id} in DOM…`;
  });
}

// 2. Receive Selected Element from Content Script
port.onMessage.addListener(async (msg) => {
  if (msg.type === "INSTANCES_FLASHED") {
    if (instanceMeta && msg.devId === currentRecord?.id) {
      instanceMeta.textContent =
        msg.count <= 1
          ? `1 instance in DOM`
          : `${msg.count} instances in DOM (e.g. .map() loop) — all flashed`;
    }
    return;
  }
  if (msg.type !== "ELEMENT_SELECTED") return;
  inspectEnabled = false;
  btnInspect.textContent = "Inspect Element";

  try {
    const data = await agentFetch(`/api/v1/identity/${msg.devId}`);
    currentRecord = data.record;
    currentFileHash = data.hash;
    currentRuntime = {
      fiberProps: msg.fiberProps ?? null,
      fiberState: msg.fiberState ?? null,
      fiberComponent: msg.fiberComponent ?? null,
      instanceCount: msg.instanceCount ?? 1,
      innerText: msg.innerText ?? "",
    };

    identityMeta.innerHTML = `<strong>&lt;${currentRecord.componentName}&gt;</strong> (${currentRecord.tagName}) — <code>${currentRecord.file}:${currentRecord.start.line}:${currentRecord.start.column}</code>`;
    codePreview.textContent = data.snippet;
    btnOpenFront.disabled = false;
    // New selection invalidates any previously staged AI patch
    pendingAiPatch = null;
    if (btnAiFix) btnAiFix.disabled = false;
    if (btnAiApply) btnAiApply.disabled = true;
    if (aiExplanation) aiExplanation.textContent = "";
    if (btnLocate) {
      btnLocate.disabled = false;
      btnLocate.textContent =
        currentRuntime.instanceCount > 1
          ? `Locate in DOM (${currentRuntime.instanceCount})`
          : `Locate in DOM`;
    }
    if (instanceMeta) {
      instanceMeta.textContent =
        currentRuntime.instanceCount > 1
          ? `${currentRuntime.instanceCount} instances of ${currentRecord.id} in DOM`
          : `1 instance in DOM`;
    }

    if (currentRecord.classNameRange) {
      inputClassName.disabled = false;
      inputClassName.value = currentRecord.classNameRange.rawValue;
      btnPreviewDiff.disabled = false;
      btnApplyPatch.disabled = false;
    } else {
      inputClassName.disabled = true;
      inputClassName.value = "(No static className attribute on this element)";
      btnPreviewDiff.disabled = true;
      btnApplyPatch.disabled = true;
    }

    // Surgical text editor
    if (currentRecord.textRange) {
      inputText.disabled = false;
      inputText.value = currentRecord.textRange.rawValue;
      btnPreviewText.disabled = false;
      btnApplyText.disabled = false;
    } else {
      inputText.disabled = true;
      inputText.value = "(No single static text child on this element)";
      btnPreviewText.disabled = true;
      btnApplyText.disabled = true;
    }

    // Static prop editor
    const props = currentRecord.stringProps || [];
    selectProp.innerHTML = "";
    if (props.length > 0) {
      props.forEach((p, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `${p.name}="${p.rawValue}"`;
        selectProp.appendChild(opt);
      });
      selectProp.disabled = false;
      inputProp.disabled = false;
      inputProp.value = props[0].rawValue;
      btnPreviewProp.disabled = false;
      btnApplyProp.disabled = false;
    } else {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(No static string props)";
      selectProp.appendChild(opt);
      selectProp.disabled = true;
      inputProp.disabled = true;
      inputProp.value = "";
      btnPreviewProp.disabled = true;
      btnApplyProp.disabled = true;
    }

    // Live React props & state inspector
    renderFiberInspector();
  } catch (err) {
    identityMeta.textContent = `Error resolving identity: ${err.message}`;
  }
});

function renderFiberInspector() {
  if (!propsPreview) return;
  if (!currentRuntime) {
    propsPreview.textContent = "// Inspect an element to see its live runtime props/state...";
    return;
  }
  const lines = [];
  if (currentRuntime.fiberComponent) lines.push(`Component (fiber): ${currentRuntime.fiberComponent}`);
  lines.push(`Instances in DOM: ${currentRuntime.instanceCount ?? 1}`);
  lines.push(`Props: ${JSON.stringify(currentRuntime.fiberProps ?? "(no fiber — static DOM node)", null, 2)}`);
  lines.push(`State/Hooks: ${JSON.stringify(currentRuntime.fiberState ?? "(no hooks/class state)", null, 2)}`);
  propsPreview.textContent = lines.join("\n");
}

if (selectProp) {
  selectProp.addEventListener("change", () => {
    const props = currentRecord?.stringProps || [];
    const p = props[Number(selectProp.value)];
    if (p) inputProp.value = p.rawValue;
  });
}

// 3. Live DOM Preview while typing classes / text
inputClassName.addEventListener("input", () => {
  if (!currentRecord) return;
  port.postMessage({
    type: "LIVE_PREVIEW_CLASSES",
    tabId,
    devId: currentRecord.id,
    className: inputClassName.value,
  });
});

if (inputText) {
  inputText.addEventListener("input", () => {
    if (!currentRecord?.textRange) return;
    port.postMessage({
      type: "LIVE_PREVIEW_TEXT",
      tabId,
      devId: currentRecord.id,
      text: inputText.value,
    });
  });
}

// 4. Stage & Preview Unified Diff (className)
btnPreviewDiff.addEventListener("click", async () => {
  if (!currentRecord?.classNameRange) return;
  try {
    await previewRangePatch(currentRecord.classNameRange, `"${inputClassName.value}"`);
  } catch (err) {
    codePreview.textContent = `Diff Error: ${err.message}`;
  }
});

// 4b. Preview Text Diff
if (btnPreviewText) {
  btnPreviewText.addEventListener("click", async () => {
    if (!currentRecord?.textRange) return;
    try {
      await previewRangePatch(currentRecord.textRange, inputText.value);
    } catch (err) {
      codePreview.textContent = `Diff Error: ${err.message}`;
    }
  });
}

// 4c. Preview Prop Diff
if (btnPreviewProp) {
  btnPreviewProp.addEventListener("click", async () => {
    const p = currentRecord?.stringProps?.[Number(selectProp.value)];
    if (!p) return;
    try {
      await previewRangePatch(p, `"${inputProp.value}"`);
    } catch (err) {
      codePreview.textContent = `Diff Error: ${err.message}`;
    }
  });
}

// 5. Apply Atomic Patch (Updated to refresh end.column for consecutive edits)
btnApplyPatch.addEventListener("click", async () => {
  if (!currentRecord?.classNameRange) return;
  const newLiteral = `"${inputClassName.value}"`;
  try {
    const res = await applyRangePatch(currentRecord.classNameRange, newLiteral);
    currentRecord.classNameRange.rawValue = inputClassName.value;
    codePreview.textContent = `✅ Applied safely! Checkpoint: ${res.checkpointId}`;
  } catch (err) {
    codePreview.textContent = `❌ Apply Blocked: ${err.message}`;
  }
});

// 5b. Apply Text Patch
if (btnApplyText) {
  btnApplyText.addEventListener("click", async () => {
    if (!currentRecord?.textRange) return;
    try {
      const res = await applyRangePatch(currentRecord.textRange, inputText.value);
      currentRecord.textRange.rawValue = inputText.value;
      codePreview.textContent = `✅ Text applied! Checkpoint: ${res.checkpointId}`;
    } catch (err) {
      codePreview.textContent = `❌ Apply Blocked: ${err.message}`;
    }
  });
}

// 5c. Apply Prop Patch
if (btnApplyProp) {
  btnApplyProp.addEventListener("click", async () => {
    const p = currentRecord?.stringProps?.[Number(selectProp.value)];
    if (!p) return;
    const newLiteral = `"${inputProp.value}"`;
    try {
      const res = await applyRangePatch(p, newLiteral);
      p.rawValue = inputProp.value;
      // Refresh dropdown label
      const opt = selectProp.options[Number(selectProp.value)];
      if (opt) opt.textContent = `${p.name}="${p.rawValue}"`;
      codePreview.textContent = `✅ Prop ${p.name} applied! Checkpoint: ${res.checkpointId}`;
    } catch (err) {
      codePreview.textContent = `❌ Apply Blocked: ${err.message}`;
    }
  });
}

// Enterprise AI Settings (BYOK) — session-only, never written to disk.
// Keys live in the panel's JS memory (+ chrome.storage.session when available)
// and are sent per-request to the loopback agent, which holds them only in
// memory for that single upstream call.
const AI_SESSION_KEY = "devbridge-ai-settings";
let aiSettingsMemory = null;
function readAiSettings() {
  return {
    provider: aiProvider?.value || "gemini",
    apiKey: aiApiKey?.value || "",
    model: aiModel?.value?.trim() || "",
    baseUrl: aiBaseUrl?.value?.trim() || "",
  };
}
function currentAiConfig() {
  const s = readAiSettings();
  const cfg = { provider: s.provider };
  if (s.apiKey) cfg.apiKey = s.apiKey;
  if (s.model) cfg.model = s.model;
  // Only send baseUrl for custom gateways; the agent ignores it otherwise.
  if (s.provider === "openai-compatible" && s.baseUrl) cfg.baseUrl = s.baseUrl;
  return cfg;
}
async function persistAiSettings() {
  const s = readAiSettings();
  aiSettingsMemory = s;
  try {
    if (chrome?.storage?.session) await chrome.storage.session.set({ [AI_SESSION_KEY]: s });
  } catch {}
}
async function restoreAiSettings() {
  let saved = aiSettingsMemory;
  try {
    if (!saved && chrome?.storage?.session) {
      const got = await chrome.storage.session.get(AI_SESSION_KEY);
      saved = got?.[AI_SESSION_KEY] || null;
    }
  } catch {}
  if (saved) {
    if (aiProvider && saved.provider) aiProvider.value = saved.provider;
    if (aiApiKey && saved.apiKey) aiApiKey.value = saved.apiKey;
    if (aiModel && saved.model) aiModel.value = saved.model;
    if (aiBaseUrl && saved.baseUrl) aiBaseUrl.value = saved.baseUrl;
  }
}
for (const el of [aiProvider, aiApiKey, aiModel, aiBaseUrl]) {
  if (el) el.addEventListener("change", persistAiSettings);
}
restoreAiSettings();

// 5d. AI Visual Delta & Quick Fix (any configured provider proposes element replacement, staged as preview)
if (btnAiFix) {
  btnAiFix.addEventListener("click", async () => {
    if (!currentRecord) return;
    const providerLabel = aiProvider?.value || "gemini";
    aiExplanation.textContent = `🤖 AI (${providerLabel}) is analyzing source & error context...`;
    btnAiFix.disabled = true;
    if (btnAiApply) btnAiApply.disabled = true;
    pendingAiPatch = null;

    try {
      const suggestion = await agentFetch("/api/v1/ai/fix", {
        method: "POST",
        body: JSON.stringify({
          devId: currentRecord.id,
          latestTrace: latestBackendTrace,
          aiConfig: currentAiConfig(),
        }),
      });

      if (!suggestion.replacement) throw new Error("AI returned no replacement.");
      pendingAiPatch = {
        start: suggestion.start || currentRecord.start,
        end: suggestion.end || currentRecord.end,
        replacement: suggestion.replacement,
      };

      aiExplanation.textContent = `💡 ${suggestion.explanation || "Suggested AI Fix"}`;

      // Stage as a reviewable unified diff over the element range
      const res = await agentFetch("/api/v1/patches/preview", {
        method: "POST",
        body: JSON.stringify({
          file: currentRecord.file,
          originalHash: currentFileHash,
          start: pendingAiPatch.start,
          end: pendingAiPatch.end,
          replacement: pendingAiPatch.replacement,
        }),
      });
      codePreview.textContent = res.unifiedDiff;
      if (btnAiApply) btnAiApply.disabled = false;
    } catch (err) {
      aiExplanation.textContent = `❌ AI Error: ${err.message}`;
      pendingAiPatch = null;
    } finally {
      btnAiFix.disabled = false;
    }
  });
}

// 5e. Apply the staged AI patch (kept separate: AI replaces the whole element,
// while Apply Atomic Patch replaces only className)
if (btnAiApply) {
  btnAiApply.addEventListener("click", async () => {
    if (!currentRecord || !pendingAiPatch) return;
    btnAiApply.disabled = true;
    try {
      const res = await agentFetch("/api/v1/patches/apply", {
        method: "POST",
        body: JSON.stringify({
          file: currentRecord.file,
          originalHash: currentFileHash,
          start: pendingAiPatch.start,
          end: pendingAiPatch.end,
          replacement: pendingAiPatch.replacement,
        }),
      });
      currentFileHash = res.newHash;
      // Simplest safe invalidation: require re-inspect after an element-level AI
      // patch since all tracked AST ranges may have shifted.
      aiExplanation.textContent += ` ✅ Applied! Checkpoint: ${res.checkpointId} — please re-inspect to continue editing.`;
      codePreview.textContent = `✅ AI patch applied! Checkpoint: ${res.checkpointId}`;
      pendingAiPatch = null;
    } catch (err) {
      codePreview.textContent = `❌ Apply Blocked: ${err.message}`;
      btnAiApply.disabled = false;
    }
  });
}

// 6. Rollback Last Patch
btnRollback.addEventListener("click", async () => {
  try {
    const res = await agentFetch("/api/v1/patches/rollback", { method: "POST" });
    pendingAiPatch = null;
    if (btnAiApply) btnAiApply.disabled = true;
    codePreview.textContent = `Rolled back ${res.rolledBack.file} to checkpoint ${res.rolledBack.id}`;
  } catch (err) {
    codePreview.textContent = `Rollback Error: ${err.message}`;
  }
});

// 7. Open Frontend in Cursor / VS Code
btnOpenFront.addEventListener("click", async () => {
  if (!currentRecord) return;
  await agentFetch("/api/v1/ide/open", {
    method: "POST",
    body: JSON.stringify({
      file: currentRecord.file,
      line: currentRecord.start.line,
      column: currentRecord.start.column + 1,
      target: "frontend",
      editor: "cursor",
    }),
  });
});

// 8. Real-time WebSocket Listener for Correlated Backend Crashes
const ws = new WebSocket("ws://127.0.0.1:4321");
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "BACKEND_TRACE") {
    latestBackendTrace = data.trace;
    renderBackendTrace(data.trace);
  }
};

function renderBackendTrace(t) {
  const div = document.createElement("div");
  div.className = "trace-box";
  div.innerHTML = `
    <div><strong>[${t.method} ${t.url} → ${t.statusCode}]</strong> (Trace: <code>${t.traceId}</code>)</div>
    <div>Triggered by DOM ID: <code>${t.triggeredByDevId || "unknown"}</code></div>
    <div style="color:#fca5a5;margin:4px 0;">Error: ${t.errorMessage}</div>
    <div>Backend Source: <code>${t.backendFile || "unmapped"}:${t.backendLine || "?"}</code></div>
  `;
  if (t.backendFile) {
    const btn = document.createElement("button");
    btn.style.marginTop = "6px";
    btn.textContent = `Open Backend in Cursor (${t.backendFile}:${t.backendLine})`;
    btn.onclick = () =>
      agentFetch("/api/v1/ide/open", {
        method: "POST",
        body: JSON.stringify({
          file: t.backendFile,
          line: t.backendLine,
          column: t.backendColumn || 1,
          target: "backend",
          editor: "cursor",
        }),
      });
    div.appendChild(btn);
  }
  tracesContainer.prepend(div);
}

// 9. Copy Full-Stack Bug Context Bundle for Cursor AI
btnCopyAi.addEventListener("click", () => {
  const markdown = [
    `## DevBridge Full-Stack Bug Context`,
    currentRecord
      ? `- **Frontend Component:** \`<${
          currentRecord.componentName
        }>\` at \`${currentRecord.file}:${currentRecord.start.line}:${currentRecord.start.column}\` (ID: \`${currentRecord.id}\`)`
      : `- **Frontend Component:** None selected`,
    currentRecord?.classNameRange
      ? `- **className:** \`${currentRecord.classNameRange.rawValue}\``
      : null,
    currentRecord?.textRange
      ? `- **innerText:** \`${currentRecord.textRange.rawValue}\``
      : null,
    currentRuntime
      ? [
          `- **DOM Instances:** \`${currentRuntime.instanceCount ?? 1}\``,
          `- **Live Props:** \`${JSON.stringify(currentRuntime.fiberProps)}\``,
          `- **Live State/Hooks:** \`${JSON.stringify(currentRuntime.fiberState)}\``,
        ].join("\n")
      : null,
    latestBackendTrace
      ? [
          `- **Failed Request:** \`${latestBackendTrace.method} ${latestBackendTrace.url}\` (Status ${latestBackendTrace.statusCode}, Trace \`${latestBackendTrace.traceId}\`)`,
          `- **Triggered By UI Element:** \`${latestBackendTrace.triggeredByDevId || "N/A"}\``,
          `- **Backend Crash Location:** \`${latestBackendTrace.backendFile}:${latestBackendTrace.backendLine}:${latestBackendTrace.backendColumn}\``,
          `- **Backend Error Message:** \`${latestBackendTrace.errorMessage}\``,
        ].join("\n")
      : `- **Backend Trace:** No recent errors captured`,
  ]
    .filter(Boolean)
    .join("\n");

  navigator.clipboard.writeText(markdown);
  btnCopyAi.textContent = "Copied Markdown Bundle!";
  setTimeout(() => (btnCopyAi.textContent = "Copy Full-Stack Bug Bundle for Cursor AI"), 1500);
});
