// panel.js — DevBridge DevTools: unified Smart Inspector + tree + a11y + git + verify + AI + X-Ray
const AGENT_URL = "http://127.0.0.1:4321";
const AGENT_TOKEN = "devbridge-local-secret";
const tabId = chrome.devtools.inspectedWindow.tabId;

const port = chrome.runtime.connect({ name: "devbridge-panel" });
port.postMessage({ type: "INIT", tabId });

let currentRecord = null;
let currentFileHash = null;
let currentRuntime = null; // { fiberProps, fiberState, fiberComponent, instanceCount, innerText }
let currentA11yIssues = [];
let latestBackendTrace = null;
let lastCheckpointId = null;
let inspectEnabled = false;
// Unified editor state: 'className' | 'text' | 'prop' | null; 'ai' marks a staged AI element patch
let editMode = null;
let stagedKind = "surgical";
let pendingAiPatch = null; // { start, end, replacement }

const agentStatus = document.getElementById("agent-status");
const componentTree = document.getElementById("component-tree");
const checkpointList = document.getElementById("checkpoint-list");
const codePreview = document.getElementById("code-preview");
const propsPreview = document.getElementById("props-preview");
const inspectorTitle = document.getElementById("inspector-title");
const inspectorFile = document.getElementById("inspector-file");
const instanceMeta = document.getElementById("instance-meta");
const a11yAlerts = document.getElementById("a11y-alerts");
const inputUniversal = document.getElementById("input-universal");
const selectProp = document.getElementById("select-prop");
const editLabel = document.getElementById("edit-label");
const editTypeBadge = document.getElementById("edit-type-badge");
const aiExplanation = document.getElementById("ai-explanation");
const tracesContainer = document.getElementById("traces-container");

const btnInspect = document.getElementById("btn-inspect");
const btnLocate = document.getElementById("btn-locate");
const btnOpenFront = document.getElementById("btn-open-front");
const btnRollback = document.getElementById("btn-rollback");
const btnPreview = document.getElementById("btn-preview");
const btnApply = document.getElementById("btn-apply");
const btnAiFix = document.getElementById("btn-ai-fix");
const btnAiApply = document.getElementById("btn-ai-apply");
const btnCopyBundle = document.getElementById("btn-copy-bundle");
const aiProvider = document.getElementById("modal-ai-provider");
const aiApiKey = document.getElementById("modal-ai-apikey");
const aiModel = document.getElementById("modal-ai-model");
const aiBaseUrl = document.getElementById("modal-ai-baseurl");
const settingsModal = document.getElementById("settings-modal");
const aiSettingsSummary = document.getElementById("ai-settings-summary");

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

// ---- Enterprise AI Settings (BYOK) behind a ⚙️ modal ----
// Persisted in localStorage so developers enter the key once; the key is
// only ever sent to the loopback agent (127.0.0.1) inside the AI-fix request.
const LS_PROVIDER = "devbridge.ai.provider";
const LS_MODEL = "devbridge.ai.model";
const LS_APIKEY = "devbridge.ai.apikey";
const LS_BASEURL = "devbridge.ai.baseurl";
let aiSettingsMemory = null;
function readAiSettings() {
  // Live modal fields win while the modal is open; otherwise stored values.
  const live = {
    provider: aiProvider?.value || "",
    apiKey: aiApiKey?.value || "",
    model: aiModel?.value?.trim() || "",
    baseUrl: aiBaseUrl?.value?.trim() || "",
  };
  let stored = aiSettingsMemory;
  try {
    stored = {
      provider: localStorage.getItem(LS_PROVIDER) || "",
      apiKey: localStorage.getItem(LS_APIKEY) || "",
      model: localStorage.getItem(LS_MODEL) || "",
      baseUrl: localStorage.getItem(LS_BASEURL) || "",
    };
    aiSettingsMemory = stored;
  } catch {
    stored = aiSettingsMemory;
  }
  return {
    provider: live.provider || stored?.provider || "gemini",
    apiKey: live.apiKey || stored?.apiKey || "",
    model: live.model || stored?.model || "",
    baseUrl: live.baseUrl || stored?.baseUrl || "",
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
function updateAiSettingsSummary() {
  const s = readAiSettings();
  if (aiSettingsSummary) {
    const bits = [`Provider: ${s.provider}`];
    if (s.model) bits.push(`Model: ${s.model}`);
    bits.push(s.apiKey ? "Key: ●●●● set" : "Key: agent .env");
    aiSettingsSummary.textContent = bits.join(" — ") + " — click ⚙️ to change.";
  }
}
function persistAiSettings() {
  const s = {
    provider: aiProvider?.value || "gemini",
    apiKey: aiApiKey?.value || "",
    model: aiModel?.value?.trim() || "",
    baseUrl: aiBaseUrl?.value?.trim() || "",
  };
  aiSettingsMemory = s;
  try {
    localStorage.setItem(LS_PROVIDER, s.provider);
    localStorage.setItem(LS_APIKEY, s.apiKey);
    localStorage.setItem(LS_MODEL, s.model);
    localStorage.setItem(LS_BASEURL, s.baseUrl);
  } catch {}
  updateAiSettingsSummary();
}
function restoreAiSettings() {
  let saved = null;
  try {
    saved = {
      provider: localStorage.getItem(LS_PROVIDER) || "",
      apiKey: localStorage.getItem(LS_APIKEY) || "",
      model: localStorage.getItem(LS_MODEL) || "",
      baseUrl: localStorage.getItem(LS_BASEURL) || "",
    };
  } catch {}
  if (saved && (saved.provider || saved.apiKey || saved.model || saved.baseUrl)) {
    aiSettingsMemory = saved;
    if (aiProvider && saved.provider) aiProvider.value = saved.provider;
    if (aiApiKey && saved.apiKey) aiApiKey.value = saved.apiKey;
    if (aiModel && saved.model) aiModel.value = saved.model;
    if (aiBaseUrl && saved.baseUrl) aiBaseUrl.value = saved.baseUrl;
    updateAiSettingsSummary();
    return true;
  }
  updateAiSettingsSummary();
  return false;
}
for (const el of [aiProvider, aiApiKey, aiModel, aiBaseUrl]) {
  if (el) el.addEventListener("change", persistAiSettings);
}
const hasSavedSettings = restoreAiSettings();

// ---- Settings modal open/close/save + first-run onboarding ----
function openSettingsModal() {
  if (settingsModal) settingsModal.style.display = "flex";
}
function closeSettingsModal() {
  if (settingsModal) settingsModal.style.display = "none";
}
const btnOpenSettings = document.getElementById("btn-open-settings");
const btnSaveSettings = document.getElementById("btn-save-settings");
const btnCloseSettings = document.getElementById("btn-close-settings");
if (btnOpenSettings) btnOpenSettings.addEventListener("click", openSettingsModal);
if (btnCloseSettings) btnCloseSettings.addEventListener("click", closeSettingsModal);
if (settingsModal) {
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });
}
if (btnSaveSettings) {
  btnSaveSettings.addEventListener("click", () => {
    persistAiSettings();
    closeSettingsModal();
    if (aiExplanation) {
      aiExplanation.textContent = "✅ AI Settings saved successfully!";
      setTimeout(() => {
        if (aiExplanation.textContent.startsWith("✅ AI Settings saved")) aiExplanation.textContent = "";
      }, 2000);
    }
  });
}
// First-run: no saved provider/key yet → open the setup modal automatically.
if (!hasSavedSettings) {
  try {
    openSettingsModal();
  } catch {}
}

// ---- Component Tree + Checkpoints ----
async function loadComponentTree() {
  try {
    const data = await agentFetch("/api/v1/identities");
    agentStatus.textContent = "🟢 Connected";
    agentStatus.className = "pill online";
    renderComponentTree(data.records || []);
    renderCheckpoints(data.checkpoints || []);
  } catch {
    agentStatus.textContent = "🔴 Offline";
    agentStatus.className = "pill offline";
  }
}

function renderComponentTree(records) {
  if (!records.length) {
    componentTree.innerHTML = `<div style="color:var(--text-muted);">No elements found. Hard refresh page.</div>`;
    return;
  }
  const byId = new Map(records.map((r) => [r.id, r]));
  const childrenOf = new Map();
  const roots = [];
  for (const r of records) {
    if (r.parentId && byId.has(r.parentId)) {
      if (!childrenOf.has(r.parentId)) childrenOf.set(r.parentId, []);
      childrenOf.get(r.parentId).push(r);
    } else {
      roots.push(r);
    }
  }
  const sortByLine = (a, b) => a.start.line - b.start.line || a.start.column - b.start.column;
  roots.sort(sortByLine);
  for (const kids of childrenOf.values()) kids.sort(sortByLine);

  componentTree.innerHTML = "";
  const buildItem = (rec) => {
    const item = document.createElement("div");
    item.className = "tree-item" + (currentRecord?.id === rec.id ? " active" : "");
    item.innerHTML = `<span>&lt;${rec.componentName}&gt; <strong style="color:#60a5fa">${rec.tagName}</strong></span><span style="color:#64748b">:${rec.start.line}</span>`;
    item.title = `${rec.file}:${rec.start.line}:${rec.start.column} (${rec.id})`;
    item.onclick = () => selectIdentity(rec.id, null, []);
    return item;
  };
  const appendSubtree = (container, rec) => {
    container.appendChild(buildItem(rec));
    const kids = childrenOf.get(rec.id);
    if (kids?.length) {
      const wrap = document.createElement("div");
      wrap.className = "tree-children";
      wrap.style.marginLeft = "12px";
      wrap.style.borderLeft = "1px solid var(--border)";
      wrap.style.paddingLeft = "4px";
      for (const k of kids) appendSubtree(wrap, k);
      container.appendChild(wrap);
    }
  };
  for (const r of roots) appendSubtree(componentTree, r);
}

function renderCheckpoints(checkpoints) {
  if (!checkpoints.length) {
    checkpointList.textContent = "No edits yet.";
    return;
  }
  checkpointList.innerHTML = checkpoints
    .map(
      (c) =>
        `<div><code>${String(c.id).slice(0, 12)}</code> • ${c.file}${
          c.verifiedGreen ? ' <span style="color:#4ade80">✔ Green</span>' : ""
        }</div>`
    )
    .join("");
}

function renderA11yIssues(issues) {
  currentA11yIssues = issues || [];
  if (!currentA11yIssues.length) {
    a11yAlerts.innerHTML = "";
    return;
  }
  a11yAlerts.innerHTML = `<div class="a11y-box"><strong>♿ Accessibility Warnings (${currentA11yIssues.length}):</strong><br>${currentA11yIssues.join("<br>")}</div>`;
}

function renderFiberInspector() {
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

// Smart detection: className (static or cn/clsx) > text > static prop.
function detectEditMode() {
  if (currentRecord?.classNameRange) return "className";
  if (currentRecord?.textRange) return "text";
  if ((currentRecord?.stringProps || []).length > 0) return "prop";
  return null;
}

function currentSurgicalRange() {
  if (editMode === "className") return currentRecord?.classNameRange || null;
  if (editMode === "text") return currentRecord?.textRange || null;
  if (editMode === "prop") {
    return currentRecord?.stringProps?.[Number(selectProp.value)] || null;
  }
  return null;
}

function replacementForMode() {
  if (editMode === "className") return `"${inputUniversal.value}"`;
  if (editMode === "prop") return `"${inputUniversal.value}"`;
  return inputUniversal.value;
}

function refreshEditorForMode() {
  const props = currentRecord?.stringProps || [];
  const showPropSelect = editMode === "prop" && props.length > 0;
  selectProp.style.display = showPropSelect ? "" : "none";
  if (showPropSelect) {
    selectProp.innerHTML = "";
    props.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${p.name}="${p.rawValue}"`;
      selectProp.appendChild(opt);
    });
    selectProp.disabled = false;
    inputUniversal.value = props[0].rawValue;
  }
  if (editMode === "className") {
    editLabel.textContent = "Surgical Tailwind / ClassName Editor:";
    editTypeBadge.textContent = "CSS Class";
    inputUniversal.disabled = false;
    inputUniversal.value = currentRecord.classNameRange.rawValue;
  } else if (editMode === "text") {
    editLabel.textContent = "Surgical Text Editor:";
    editTypeBadge.textContent = "Element Text";
    inputUniversal.disabled = false;
    inputUniversal.value = currentRecord.textRange.rawValue;
  } else if (editMode === "prop") {
    editLabel.textContent = "Static Prop Editor:";
    const p = props[Number(selectProp.value) || 0];
    editTypeBadge.textContent = p ? `Prop: ${p.name}` : "Prop";
    inputUniversal.disabled = props.length === 0;
    if (!showPropSelect) {
      selectProp.innerHTML = `<option value="">(No static string props)</option>`;
      inputUniversal.value = "";
      inputUniversal.placeholder = "No editable strings on this element...";
    }
  } else {
    editLabel.textContent = "Live Editor (Class / Text):";
    editTypeBadge.textContent = "—";
    inputUniversal.disabled = true;
    inputUniversal.value = "";
    inputUniversal.placeholder = "No editable static strings on this element...";
  }
  const canEdit = !!editMode;
  btnPreview.disabled = !canEdit;
  btnApply.disabled = !canEdit;
}

if (selectProp) {
  selectProp.addEventListener("change", () => {
    if (editMode !== "prop") return;
    const props = currentRecord?.stringProps || [];
    const p = props[Number(selectProp.value)];
    if (p) {
      inputUniversal.value = p.rawValue;
      editTypeBadge.textContent = `Prop: ${p.name}`;
    }
    // Switching prop target invalidates any staged AI patch
    pendingAiPatch = null;
    stagedKind = "surgical";
    if (btnAiApply) btnAiApply.disabled = true;
  });
}

async function selectIdentity(devId, runtime = null, a11y = []) {
  try {
    const data = await agentFetch(`/api/v1/identity/${devId}`);
    currentRecord = data.record;
    currentFileHash = data.hash;
    pendingAiPatch = null;
    stagedKind = "surgical";
    if (runtime) {
      currentRuntime = {
        fiberProps: runtime.fiberProps ?? null,
        fiberState: runtime.fiberState ?? null,
        fiberComponent: runtime.fiberComponent ?? null,
        instanceCount: runtime.instanceCount ?? 1,
        innerText: runtime.innerText ?? "",
      };
    } else {
      currentRuntime = null;
    }
    renderA11yIssues(a11y);

    inspectorTitle.textContent = `<${currentRecord.componentName}> (${currentRecord.tagName})`;
    inspectorFile.textContent = `${currentRecord.file}:${currentRecord.start.line}:${currentRecord.start.column}`;
    if (instanceMeta) {
      const n = currentRuntime?.instanceCount;
      instanceMeta.textContent =
        n == null ? "" : n > 1 ? `${n} instances of ${currentRecord.id} in DOM` : `1 instance in DOM`;
    }
    codePreview.textContent = data.snippet;

    btnOpenFront.disabled = false;
    btnLocate.disabled = false;
    btnAiFix.disabled = false;
    if (btnLocate && currentRuntime) {
      const n = currentRuntime.instanceCount ?? 1;
      btnLocate.textContent = n > 1 ? `Locate in DOM (${n})` : `Locate in DOM`;
    }
    if (btnAiApply) btnAiApply.disabled = true;
    if (aiExplanation) aiExplanation.textContent = "";

    editMode = detectEditMode();
    refreshEditorForMode();
    renderFiberInspector();
    loadComponentTree();
  } catch (err) {
    // Stale data-dev-id (agent restarted and lost its registry): auto re-sync
    // the tree and show a one-click recovery message instead of a dead end.
    if (/IDENTITY_STALE|Identity not found|re-register/i.test(err.message || "")) {
      inspectorTitle.textContent = "Stale element ID — agent restarted";
      inspectorFile.textContent = "—";
      codePreview.textContent = [
        "⚠️ This element was stamped before the Local Agent last restarted,",
        "so its ID is no longer in the agent registry.",
        "",
        "Recover in 10 seconds:",
        '  1. Hard-refresh your app page (Ctrl+Shift+R) to re-register components.',
        '  2. Click "Sync Tree" above (already re-syncing now) and inspect again.',
      ].join("\n");
      loadComponentTree();
    } else {
      inspectorTitle.textContent = `Error: ${err.message}`;
    }
  }
}

// Button Handlers
btnInspect.addEventListener("click", () => {
  inspectEnabled = !inspectEnabled;
  btnInspect.textContent = inspectEnabled ? "Cancel Inspect" : "Inspect Element";
  port.postMessage({ type: "TOGGLE_INSPECT", tabId, enabled: inspectEnabled });
});

btnLocate.addEventListener("click", () => {
  if (!currentRecord) return;
  const devId = currentRecord.id;
  try {
    chrome.tabs.sendMessage(tabId, { type: "LOCATE_DEV_ID", devId }, (res) => {
      if (chrome.runtime.lastError) {
        port.postMessage({ type: "LOCATE_IN_DOM", tabId, devId });
        return;
      }
      if (res) {
        btnLocate.textContent = `Locate in DOM (${res.count || 0})`;
        if (res.a11yIssues) renderA11yIssues(res.a11yIssues);
        if (instanceMeta && typeof res.count === "number") {
          instanceMeta.textContent =
            res.count > 1 ? `${res.count} instances in DOM — all flashed` : `1 instance in DOM`;
        }
      }
    });
  } catch {
    port.postMessage({ type: "LOCATE_IN_DOM", tabId, devId });
  }
});

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

// Unified live preview: classes and text both preview in the DOM while typing
inputUniversal.addEventListener("input", () => {
  if (!currentRecord || !editMode) return;
  // Typing a manual edit invalidates any staged AI patch
  pendingAiPatch = null;
  stagedKind = "surgical";
  if (btnAiApply) btnAiApply.disabled = true;
  if (editMode === "className") {
    port.postMessage({ type: "LIVE_PREVIEW_CLASSES", tabId, devId: currentRecord.id, className: inputUniversal.value });
  } else if (editMode === "text") {
    port.postMessage({ type: "LIVE_PREVIEW_TEXT", tabId, devId: currentRecord.id, text: inputUniversal.value });
  }
});

btnPreview.addEventListener("click", async () => {
  const range = currentSurgicalRange();
  if (!currentRecord || !range) return;
  stagedKind = "surgical";
  try {
    const res = await agentFetch("/api/v1/patches/preview", {
      method: "POST",
      body: JSON.stringify({
        file: currentRecord.file,
        originalHash: currentFileHash,
        start: range.start,
        end: range.end,
        replacement: replacementForMode(),
      }),
    });
    codePreview.textContent = res.unifiedDiff;
  } catch (err) {
    codePreview.textContent = `❌ Diff / AST Validation Blocked: ${err.message}`;
  }
});

async function doApplyStaged() {
  if (!currentRecord) return;
  // AI element patch takes precedence when one is staged
  if (stagedKind === "ai" && pendingAiPatch) {
    btnAiApply.disabled = true;
    btnApply.disabled = true;
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
      lastCheckpointId = res.checkpointId;
      pendingAiPatch = null;
      stagedKind = "surgical";
      codePreview.textContent = `✅ AI patch applied & AST-verified! Checkpoint: ${res.checkpointId}\nClick "tsc Check" to mark this checkpoint Green — then re-inspect to continue editing.`;
      if (aiExplanation) aiExplanation.textContent += ` ✅ Applied! Checkpoint: ${res.checkpointId}`;
      loadComponentTree();
    } catch (err) {
      codePreview.textContent = `❌ Apply Failed: ${err.message}`;
      btnAiApply.disabled = false;
      btnApply.disabled = false;
    }
    return;
  }
  const range = currentSurgicalRange();
  if (!range) return;
  const replacement = replacementForMode();
  try {
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
    lastCheckpointId = res.checkpointId;
    // Refresh end.column so consecutive edits work without re-inspecting
    range.end = { line: range.start.line, column: range.start.column + replacement.length };
    if (editMode === "className" && currentRecord.classNameRange) {
      currentRecord.classNameRange.rawValue = inputUniversal.value;
    } else if (editMode === "text" && currentRecord.textRange) {
      currentRecord.textRange.rawValue = inputUniversal.value;
    } else if (editMode === "prop") {
      const p = currentRecord?.stringProps?.[Number(selectProp.value)];
      if (p) {
        p.rawValue = inputUniversal.value;
        const opt = selectProp.options[Number(selectProp.value)];
        if (opt) opt.textContent = `${p.name}="${p.rawValue}"`;
        editTypeBadge.textContent = `Prop: ${p.name}`;
      }
    }
    codePreview.textContent = `✅ Applied & AST-verified! Checkpoint: ${res.checkpointId}\nClick "tsc Check" to mark this checkpoint Green.`;
    loadComponentTree();
  } catch (err) {
    codePreview.textContent = `❌ Apply Failed: ${err.message}`;
  }
}

btnApply.addEventListener("click", doApplyStaged);
if (btnAiApply) btnAiApply.addEventListener("click", doApplyStaged);

btnRollback.addEventListener("click", async () => {
  try {
    const res = await agentFetch("/api/v1/patches/rollback", { method: "POST" });
    pendingAiPatch = null;
    stagedKind = "surgical";
    if (btnAiApply) btnAiApply.disabled = true;
    codePreview.textContent = `⏪ Rolled back file: ${res.rolledBack.file}`;
    loadComponentTree();
    if (currentRecord) selectIdentity(currentRecord.id, currentRuntime, currentA11yIssues);
  } catch (err) {
    codePreview.textContent = `Rollback error: ${err.message}`;
  }
});

btnAiFix.addEventListener("click", async () => {
  if (!currentRecord) return;
  const providerLabel = aiProvider?.value || "gemini";
  aiExplanation.textContent = `🤖 AI (${providerLabel}) is analyzing AST source, A11y warnings, and backend traces...`;
  btnAiFix.disabled = true;
  if (btnAiApply) btnAiApply.disabled = true;
  pendingAiPatch = null;

  try {
    const suggestion = await agentFetch("/api/v1/ai/fix", {
      method: "POST",
      body: JSON.stringify({
        devId: currentRecord.id,
        latestTrace: latestBackendTrace,
        a11yIssues: currentA11yIssues,
        aiConfig: currentAiConfig(),
      }),
    });
    if (!suggestion.replacement) throw new Error("AI returned no replacement.");
    pendingAiPatch = {
      start: suggestion.start || currentRecord.start,
      end: suggestion.end || currentRecord.end,
      replacement: suggestion.replacement,
    };
    stagedKind = "ai";
    aiExplanation.textContent = `💡 ${suggestion.explanation || "Suggested AI Fix"}`;
    // Stage as a reviewable unified diff over the element range (AST-validated)
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
    stagedKind = "surgical";
  } finally {
    btnAiFix.disabled = false;
  }
});

// Port & WS Listeners
port.onMessage.addListener((msg) => {
  if (msg.type === "INSTANCES_FLASHED") {
    if (instanceMeta && msg.devId === currentRecord?.id) {
      instanceMeta.textContent =
        msg.count <= 1 ? `1 instance in DOM` : `${msg.count} instances in DOM — all flashed`;
    }
    if (msg.devId === currentRecord?.id) btnLocate.textContent = `Locate in DOM (${msg.count || 0})`;
    return;
  }
  if (msg.type !== "ELEMENT_SELECTED") return;
  inspectEnabled = false;
  btnInspect.textContent = "Inspect Element";
  selectIdentity(
    msg.devId,
    {
      fiberProps: msg.fiberProps,
      fiberState: msg.fiberState,
      fiberComponent: msg.fiberComponent,
      instanceCount: msg.instanceCount,
      innerText: msg.innerText,
    },
    msg.a11yIssues || []
  );
});

function connectWS() {
  let ws;
  try {
    ws = new WebSocket("ws://127.0.0.1:4321");
  } catch {
    agentStatus.textContent = "🔴 Offline";
    agentStatus.className = "pill offline";
    setTimeout(connectWS, 3000);
    return;
  }
  ws.onopen = () => loadComponentTree();
  ws.onclose = () => {
    agentStatus.textContent = "🔴 Offline";
    agentStatus.className = "pill offline";
    setTimeout(connectWS, 3000);
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {}
  };
  ws.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (data.type === "BACKEND_TRACE") {
      latestBackendTrace = data.trace;
      renderTrace(data.trace);
    } else if (data.type === "IDENTITIES_UPDATED") {
      loadComponentTree();
      if (currentRecord && (!data.file || data.file === currentRecord.file)) {
        selectIdentity(currentRecord.id, currentRuntime, currentA11yIssues);
      }
    } else if (data.type === "PATCH_APPLIED" || data.type === "PATCH_ROLLED_BACK") {
      loadComponentTree();
    }
  };
}
connectWS();
loadComponentTree();

function renderTrace(t) {
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

document.getElementById("btn-sync").onclick = loadComponentTree;
document.getElementById("btn-git").onclick = async () => {
  try {
    const res = await agentFetch("/api/v1/git/status");
    codePreview.textContent = [`🌿 Branch: ${res.branch}`, `📋 Status:\n${res.status}`, `\n--- Working Tree Git Diff ---\n${res.diff}`].join("\n");
    renderCheckpoints(res.checkpoints || []);
  } catch (err) {
    codePreview.textContent = `Git Error: ${err.message}`;
  }
};
document.getElementById("btn-tsc").onclick = async () => {
  codePreview.textContent = "⏳ Running `tsc --noEmit` in FRONTEND_ROOT...";
  try {
    const res = await agentFetch("/api/v1/verify", {
      method: "POST",
      body: JSON.stringify({ checkpointId: lastCheckpointId }),
    });
    codePreview.textContent = res.output;
    loadComponentTree();
  } catch (err) {
    codePreview.textContent = `Verification Error: ${err.message}`;
  }
};
document.getElementById("btn-a11y").onclick = () => {
  codePreview.textContent = "♿ Scanning page accessibility on mapped elements...";
  try {
    chrome.tabs.sendMessage(tabId, { type: "SCAN_PAGE_A11Y" }, (res) => {
      if (chrome.runtime.lastError) {
        codePreview.textContent = `A11y scan unavailable: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (!res?.report?.length) {
        codePreview.textContent = "✅ Page Accessibility Scan: 0 issues detected on mapped elements!";
        return;
      }
      codePreview.textContent =
        `♿ Page Accessibility Audit (${res.report.length} elements with warnings):\n\n` +
        res.report.map((r) => `[${r.devId}] <${r.tagName}>:\n  - ${r.issues.join("\n  - ")}`).join("\n\n");
    });
  } catch (err) {
    codePreview.textContent = `A11y scan unavailable: ${err.message}`;
  }
};

// 14. Copy Full-Stack Bug Context Bundle for Cursor AI
btnCopyBundle.addEventListener("click", () => {
  const markdown = [
    `## DevBridge Full-Stack Bug Context`,
    currentRecord
      ? `- **Frontend Component:** \`<${
          currentRecord.componentName
        }>\` at \`${currentRecord.file}:${currentRecord.start.line}:${currentRecord.start.column}\` (ID: \`${currentRecord.id}\`)`
      : `- **Frontend Component:** None selected`,
    editMode === "className" && currentRecord?.classNameRange
      ? `- **className:** \`${currentRecord.classNameRange.rawValue}\``
      : null,
    editMode === "text" && currentRecord?.textRange
      ? `- **innerText:** \`${currentRecord.textRange.rawValue}\``
      : null,
    currentA11yIssues.length
      ? `- **Accessibility Warnings:**\n  - ${currentA11yIssues.join("\n  - ")}`
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
  btnCopyBundle.textContent = "✅ Copied Bundle!";
  setTimeout(() => (btnCopyBundle.textContent = "Copy Cursor Bundle"), 1500);
});
