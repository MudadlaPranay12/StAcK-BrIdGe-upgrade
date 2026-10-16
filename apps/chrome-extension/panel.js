// panel.js — DevBridge DevTools panel. All operations below call a real agent
// or browser message; the UI never treats a request as successful before it resolves.
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
  const configError = connectionConfigError();
  if (configError) throw new Error(configError);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let res;
  try {
    res = await fetch(agentEndpoint(path), {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-DevBridge-Token": readConnectionSettings().token,
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    throw new Error(err?.name === "AbortError" ? "Agent request timed out." : `Agent unreachable: ${err.message}`);
  } finally { clearTimeout(timeout); }
  let data;
  try { data = await res.json(); } catch { throw new Error(`Agent returned an invalid response (HTTP ${res.status}).`); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---- Local AI settings (BYOK) ----
// Persisted in localStorage so developers enter the key once; the key is
// only ever sent to the loopback agent (127.0.0.1) inside the AI-fix request.
const LS_PROVIDER = "devbridge.ai.provider";
const LS_MODEL = "devbridge.ai.model";
const LS_APIKEY = "devbridge.ai.apikey";
const LS_BASEURL = "devbridge.ai.baseurl";
const LS_AGENT_URL = "devbridge.agent.url";
const LS_AGENT_TOKEN = "devbridge.agent.token";
const LS_BACKEND_URL = "devbridge.backend.url";
const DEFAULT_AGENT_URL = "http://127.0.0.1:4321";
const DEFAULT_BACKEND_URL = "http://127.0.0.1:4000/api/health";
const agentStatus = document.getElementById("agent-status");
const connectionMessage = document.getElementById("connection-message");
const contentStatus = document.getElementById("content-status");
const identityStatus = document.getElementById("identity-status");
const mappingStatus = document.getElementById("mapping-status");
const traceStatus = document.getElementById("trace-status");
const lastSync = document.getElementById("last-sync");
const projectRoot = document.getElementById("project-root");
const framework = document.getElementById("framework");
const inspectedSite = document.getElementById("inspected-site");
const inspectedUrl = document.getElementById("inspected-url");
const backendAvailability = document.getElementById("backend-availability");
const gitDirectory = document.getElementById("git-directory");
const gitRoot = document.getElementById("git-root");
const gitState = document.getElementById("git-state");
const gitSummary = document.getElementById("git-summary");
const aiDiff = document.getElementById("ai-diff");
const runtimeFindings = document.getElementById("runtime-findings");
const a11yState = document.getElementById("a11y-state");
const issuesState = document.getElementById("issues-state");
const networkState = document.getElementById("network-state");
const backendState = document.getElementById("backend-state");
const inspectorDevId = document.getElementById("inspector-dev-id");
const inspectorTag = document.getElementById("inspector-tag");
const agentUrlInput = document.getElementById("modal-agent-url");
const agentTokenInput = document.getElementById("modal-agent-token");
const backendUrlInput = document.getElementById("modal-backend-url");
const settingsError = document.getElementById("settings-error");
let aiSettingsMemory = null;

function readConnectionSettings() {
  let stored = {};
  try {
    stored = {
      url: localStorage.getItem(LS_AGENT_URL) || DEFAULT_AGENT_URL,
      token: localStorage.getItem(LS_AGENT_TOKEN) || "",
      backendUrl: localStorage.getItem(LS_BACKEND_URL) || DEFAULT_BACKEND_URL,
    };
  } catch {}
  return stored;
}

function setStatus(el, text, tone = "warn") {
  if (!el) return;
  el.textContent = text;
  el.className = `status ${tone}`;
}

function connectionConfigError() {
  const cfg = readConnectionSettings();
  if (!cfg.token) return "Configure the development token in Settings. It must match DEVBRIDGE_TOKEN used by the local agent.";
  try {
    const url = new URL(cfg.url);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) return "The agent endpoint must use http://localhost or http://127.0.0.1.";
  } catch { return "The agent endpoint is not a valid URL."; }
  return "";
}

function agentEndpoint(path) { return `${readConnectionSettings().url.replace(/\/$/, "")}${path}`; }
async function checkBackendAvailability() {
  const endpoint = readConnectionSettings().backendUrl;
  if (!endpoint) { setStatus(backendAvailability, "Not configured", "warn"); return; }
  try {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(endpoint, { signal: controller.signal }); clearTimeout(timeout);
    setStatus(backendAvailability, response.ok ? "Available" : `HTTP ${response.status}`, response.ok ? "good" : "bad");
  } catch { setStatus(backendAvailability, "Unavailable", "bad"); }
}
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
     bits.push(s.apiKey ? "Key: set" : "Key: agent environment");
     aiSettingsSummary.textContent = bits.join(" — ") + " — edit in Settings.";
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
function restoreConnectionSettings() {
  const cfg = readConnectionSettings();
  if (agentUrlInput) agentUrlInput.value = cfg.url;
  if (agentTokenInput) agentTokenInput.value = cfg.token;
  if (backendUrlInput) backendUrlInput.value = cfg.backendUrl;
  return Boolean(cfg.token);
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
const hasSavedSettings = restoreAiSettings();
const hasConnectionSettings = restoreConnectionSettings();

// ---- Settings modal open/close/save + first-run onboarding ----
function openSettingsModal() {
  restoreConnectionSettings();
  if (settingsModal) settingsModal.classList.add("open");
  agentTokenInput?.focus();
}
function closeSettingsModal() {
  if (settingsModal) settingsModal.classList.remove("open");
}
const btnOpenSettings = document.getElementById("btn-open-settings");
const btnSettingsPanel = document.getElementById("btn-settings-panel");
const btnSaveSettings = document.getElementById("btn-save-settings");
const btnCloseSettings = document.getElementById("btn-close-settings");
if (btnOpenSettings) btnOpenSettings.addEventListener("click", openSettingsModal);
if (btnSettingsPanel) btnSettingsPanel.addEventListener("click", openSettingsModal);
if (btnCloseSettings) btnCloseSettings.addEventListener("click", closeSettingsModal);
if (settingsModal) {
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });
}
if (btnSaveSettings) {
  btnSaveSettings.addEventListener("click", async () => {
    const url = agentUrlInput?.value.trim() || "";
    const token = agentTokenInput?.value || "";
    const provider = aiProvider?.value || "gemini";
    let error = "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) error = "Agent endpoint must be a local http URL.";
    } catch { error = "Agent endpoint must be a valid URL."; }
    if (!token) error = "Development token is required to authenticate with the local agent.";
    if (provider === "openai-compatible" && aiBaseUrl?.value.trim()) {
      try { new URL(aiBaseUrl.value.trim()); } catch { error = "AI gateway URL must be a valid URL."; }
    }
    if (error) { if (settingsError) settingsError.textContent = error; return; }
    if (settingsError) settingsError.textContent = "Validating agent connection…";
    const previous = readConnectionSettings();
    try {
      localStorage.setItem(LS_AGENT_URL, url); localStorage.setItem(LS_AGENT_TOKEN, token); localStorage.setItem(LS_BACKEND_URL, backendUrlInput?.value.trim() || "");
      persistAiSettings();
      await agentFetch("/api/v1/status");
      if (settingsError) settingsError.textContent = "Connection validated.";
      closeSettingsModal();
      loadComponentTree();
    } catch (err) {
      localStorage.setItem(LS_AGENT_URL, previous.url || DEFAULT_AGENT_URL); localStorage.setItem(LS_AGENT_TOKEN, previous.token || ""); localStorage.setItem(LS_BACKEND_URL, previous.backendUrl || "");
      if (settingsError) settingsError.textContent = `Could not validate settings: ${err.message}`;
    }
  });
}
// First-run: no saved provider/key yet → open the setup modal automatically.
if (!hasSavedSettings || !hasConnectionSettings) {
  try {
    openSettingsModal();
  } catch {}
}

// ---- Component Tree + Checkpoints ----
async function loadComponentTree() {
  const configError = connectionConfigError();
  if (configError) {
    setStatus(agentStatus, "Not configured", "bad");
    setStatus(identityStatus, "Blocked", "bad");
    setStatus(mappingStatus, "Unavailable", "bad");
    if (connectionMessage) connectionMessage.textContent = configError;
    return;
  }
  setStatus(agentStatus, "Checking…", "warn");
  try {
    const [data, status] = await Promise.all([agentFetch("/api/v1/identities"), agentFetch("/api/v1/status")]);
    setStatus(agentStatus, "Connected", "good");
    setStatus(identityStatus, `${data.records?.length || 0} registered`, "good");
    setStatus(mappingStatus, status.sourceMapping?.available ? "Available" : "Waiting for Vite", status.sourceMapping?.available ? "good" : "warn");
    setStatus(traceStatus, status.backendTraces?.available ? "Available" : "Waiting for traces", status.backendTraces?.available ? "good" : "warn");
    projectRoot.textContent = status.projectRoot || "Not reported";
    if (lastSync) lastSync.textContent = new Date().toLocaleTimeString();
    if (connectionMessage) connectionMessage.textContent = status.sourceMapping?.message || "Agent authenticated and reachable.";
    checkBackendAvailability();
    renderComponentTree(data.records || []);
    renderCheckpoints(data.checkpoints || []);
  } catch (err) {
    setStatus(agentStatus, "Unavailable", "bad");
    setStatus(identityStatus, "Failed", "bad");
    setStatus(mappingStatus, "Unavailable", "bad");
    if (connectionMessage) connectionMessage.textContent = err.message;
  }
}

function renderComponentTree(records) {
  if (!records.length) {
    componentTree.textContent = "No identity records found. Confirm the Vite plugin is running, then hard-refresh the inspected page.";
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
    const label = document.createElement("span");
    label.textContent = `<${rec.componentName}> ${rec.tagName}`;
    const line = document.createElement("span");
    line.className = "muted";
    line.textContent = `:${rec.start.line}`;
    item.append(label, line);
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
  if (btnRollback) btnRollback.disabled = checkpoints.length === 0;
  if (!checkpoints.length) {
    checkpointList.textContent = "No edits yet.";
    return;
  }
  checkpointList.textContent = "";
  for (const c of checkpoints) {
    const row = document.createElement("div");
    row.className = "small";
    row.textContent = `${String(c.id).slice(0, 12)} • ${c.file}${c.verifiedGreen ? " • Verified" : ""}`;
    checkpointList.appendChild(row);
  }
}

function renderA11yIssues(issues) {
  currentA11yIssues = issues || [];
  if (!currentA11yIssues.length) {
    a11yAlerts.textContent = "No accessibility issues found in the mapped elements.";
    a11yAlerts.className = "finding good";
    return;
  }
  a11yAlerts.textContent = "";
  a11yAlerts.className = "finding";
  const title = document.createElement("strong"); title.textContent = `Accessibility issues (${currentA11yIssues.length})`;
  a11yAlerts.appendChild(title);
  for (const issue of currentA11yIssues) { const item = document.createElement("div"); item.textContent = issue; a11yAlerts.appendChild(item); }
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
  if (editMode === "className") return currentRecord?.classNameRange?.syntax === "template" ? `\`${inputUniversal.value}\`` : `"${inputUniversal.value}"`;
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
      setStatus(contentStatus, "Connected", "good");
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
    if (inspectorDevId) inspectorDevId.textContent = currentRecord.id;
    if (inspectorTag) inspectorTag.textContent = currentRecord.tagName;
    setStatus(mappingStatus, "Available", "good");
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
    setStatus(contentStatus, "Failed", "bad");
    // Stale data-dev-id (agent restarted and lost its registry): auto re-sync
    // the tree and show a one-click recovery message instead of a dead end.
    if (/IDENTITY_STALE|Identity not found|re-register/i.test(err.message || "")) {
      inspectorTitle.textContent = "Stale element ID — agent restarted";
      inspectorFile.textContent = "—";
      if (inspectorDevId) inspectorDevId.textContent = devId || "—";
      if (inspectorTag) inspectorTag.textContent = "—";
      setStatus(mappingStatus, "Stale identity", "bad");
      codePreview.textContent = [
        "This element was stamped before the Local Agent last restarted.",
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
  const oldText = btnOpenFront.textContent;
  btnOpenFront.disabled = true; btnOpenFront.textContent = "Opening…";
  try {
    await agentFetch("/api/v1/ide/open", { method: "POST", body: JSON.stringify({ file: currentRecord.file, line: currentRecord.start.line, column: currentRecord.start.column + 1, target: "frontend", editor: "cursor" }) });
    if (connectionMessage) connectionMessage.textContent = "IDE open request sent.";
  } catch (err) { if (connectionMessage) connectionMessage.textContent = `IDE navigation failed: ${err.message}`; }
  finally { btnOpenFront.disabled = false; btnOpenFront.textContent = oldText; }
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
  const oldText = btnPreview.textContent; btnPreview.disabled = true; btnPreview.textContent = "Validating…";
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
    if (aiDiff) aiDiff.textContent = res.unifiedDiff;
  } catch (err) {
    codePreview.textContent = `Patch preview blocked: ${err.message}`;
  } finally { btnPreview.disabled = false; btnPreview.textContent = oldText; }
});

async function doApplyStaged() {
  if (!currentRecord) return;
  if (!window.confirm("Apply this validated patch to the source file? This changes a file on disk.")) return;
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
      codePreview.textContent = `AI patch applied and AST-verified. Checkpoint: ${res.checkpointId}\nRun typecheck to verify it.`;
      if (aiDiff) aiDiff.textContent = codePreview.textContent;
      if (aiExplanation) aiExplanation.textContent += ` Applied. Checkpoint: ${res.checkpointId}`;
      loadComponentTree();
    } catch (err) {
      codePreview.textContent = `Apply failed: ${err.message}`;
      btnAiApply.disabled = false;
      btnApply.disabled = false;
    }
    return;
  }
  const range = currentSurgicalRange();
  if (!range) return;
  const replacement = replacementForMode();
  btnApply.disabled = true;
  const applyText = btnApply.textContent; btnApply.textContent = "Applying…";
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
      codePreview.textContent = `Patch applied and AST-verified. Checkpoint: ${res.checkpointId}\nRun typecheck to verify it.`;
    loadComponentTree();
  } catch (err) {
    codePreview.textContent = `Apply failed: ${err.message}`;
  } finally { btnApply.disabled = false; btnApply.textContent = applyText; }
}

btnApply.addEventListener("click", doApplyStaged);
if (btnAiApply) btnAiApply.addEventListener("click", doApplyStaged);

btnRollback.addEventListener("click", async () => {
  if (!window.confirm("Rollback the most recent checkpoint? The file must not have changed since that patch was applied.")) return;
  btnRollback.disabled = true;
  const oldText = btnRollback.textContent; btnRollback.textContent = "Rolling back…";
  try {
    const res = await agentFetch("/api/v1/patches/rollback", { method: "POST" });
    pendingAiPatch = null;
    stagedKind = "surgical";
    if (btnAiApply) btnAiApply.disabled = true;
    codePreview.textContent = `Rolled back file: ${res.rolledBack.file}`;
    loadComponentTree();
    if (currentRecord) selectIdentity(currentRecord.id, currentRuntime, currentA11yIssues);
  } catch (err) {
    codePreview.textContent = `Rollback error: ${err.message}`;
  } finally { btnRollback.disabled = false; btnRollback.textContent = oldText; }
});

btnAiFix.addEventListener("click", async () => {
  if (!currentRecord) return;
  const providerLabel = aiProvider?.value || "gemini";
  aiExplanation.textContent = `AI (${providerLabel}) is analyzing source, accessibility findings, and backend traces…`;
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
    aiExplanation.textContent = suggestion.explanation || "Suggested AI fix";
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
    if (aiDiff) aiDiff.textContent = res.unifiedDiff;
    if (btnAiApply) btnAiApply.disabled = false;
  } catch (err) {
    aiExplanation.textContent = `AI error: ${err.message}`;
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
  let wsToken = "";
  try {
    const cfgError = connectionConfigError();
    if (cfgError) { setStatus(traceStatus, "Waiting for agent", "warn"); return; }
    const cfg = readConnectionSettings();
    wsToken = cfg.token;
    ws = new WebSocket(`${cfg.url.replace(/^http/, "ws")}/`);
  } catch {
    setStatus(agentStatus, "Unavailable", "bad");
    setTimeout(connectWS, 3000);
    return;
  }
  ws.onopen = () => { ws.send(JSON.stringify({ type: "AUTH", token: wsToken })); loadComponentTree(); };
  ws.onclose = () => {
    setStatus(traceStatus, "Disconnected", "bad");
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
      setStatus(traceStatus, "Available", "good"); setStatus(backendState, "Issues found", "bad");
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
  const summary = document.createElement("strong"); summary.textContent = `[${t.method} ${t.url} → ${t.statusCode}]`;
  const traceId = document.createElement("div"); traceId.textContent = `Correlation ID: ${t.traceId || "unavailable"}`;
  const trigger = document.createElement("div"); trigger.textContent = `Triggered by DOM ID: ${t.triggeredByDevId || "unknown"}`;
  const error = document.createElement("div"); error.className = "error-text"; error.textContent = `Error: ${t.errorMessage || "Unknown backend error"}`;
  const source = document.createElement("div"); source.textContent = `Backend source: ${t.backendFile || "unmapped"}:${t.backendLine || "?"}`;
  div.append(summary, traceId, trigger, error, source);
  if (t.backendFile) {
    const btn = document.createElement("button");
    btn.style.marginTop = "6px";
    btn.textContent = `Open Backend in Cursor (${t.backendFile}:${t.backendLine})`;
     btn.onclick = async () => {
       btn.disabled = true; btn.textContent = "Opening backend source…";
       try { await agentFetch("/api/v1/ide/open", {
         method: "POST",
        body: JSON.stringify({
          file: t.backendFile,
          line: t.backendLine,
          column: t.backendColumn || 1,
          target: "backend",
          editor: "cursor",
        }),
       }); } catch (err) { error.textContent = `Backend navigation failed: ${err.message}`; } finally { btn.disabled = false; btn.textContent = `Open backend source (${t.backendFile}:${t.backendLine || "?"})`; }
     };
    div.appendChild(btn);
  }
  tracesContainer.prepend(div);
}

document.getElementById("btn-sync").onclick = loadComponentTree;
document.getElementById("btn-git").onclick = async () => {
  const button = document.getElementById("btn-git"); const oldText = button.textContent; button.disabled = true; button.textContent = "Inspecting…";
  try {
    const res = await agentFetch("/api/v1/git/status");
    gitDirectory.textContent = res.checkedDirectory || "—"; gitRoot.textContent = res.repositoryRoot || "Not a repository";
    gitState.textContent = `${res.message} State: ${res.state}.`;
    gitState.className = `notice ${res.state === "clean" ? "success-text" : res.state === "dirty" ? "error-text" : ""}`;
    gitSummary.textContent = [`State: ${res.state}`, `Branch: ${res.branch || "—"}`, `Status:\n${res.status || "—"}`, `Files: ${(res.files || []).length}`, "", "--- Diff (staged + unstaged) ---", res.diff || "No diff available.", res.diffTruncated ? "[Diff truncated at 20,000 characters]" : ""].join("\n");
    renderCheckpoints(res.checkpoints || []);
  } catch (err) {
    gitState.textContent = `Git inspection failed: ${err.message}`; gitState.className = "notice error-text"; gitSummary.textContent = err.message;
  } finally { button.disabled = false; button.textContent = oldText; }
};
document.getElementById("btn-tsc").onclick = async () => {
  const button = document.getElementById("btn-tsc"); const oldText = button.textContent; button.disabled = true; button.textContent = "Checking…"; gitSummary.textContent = "Running TypeScript verification in the configured project root…";
  try {
    const res = await agentFetch("/api/v1/verify", {
      method: "POST",
      body: JSON.stringify({ checkpointId: lastCheckpointId }),
    });
    gitSummary.textContent = `${res.state || (res.ok ? "passed" : "failed")}\n${res.output}`;
    loadComponentTree();
  } catch (err) {
    gitSummary.textContent = `Verification failed: ${err.message}`;
  } finally { button.disabled = false; button.textContent = oldText; }
};
document.getElementById("btn-a11y").onclick = () => {
  const button = document.getElementById("btn-a11y"); button.disabled = true; button.textContent = "Scanning…"; setStatus(a11yState, "Running", "warn");
  try {
    chrome.tabs.sendMessage(tabId, { type: "SCAN_PAGE_A11Y" }, (res) => {
      if (chrome.runtime.lastError) {
        setStatus(a11yState, "Failed", "bad"); runtimeFindings.textContent = `Accessibility scan unavailable: ${chrome.runtime.lastError.message}`; button.disabled = false; button.textContent = "Scan mapped elements";
        return;
      }
      if (!res?.report?.length) {
        setStatus(a11yState, "Passed", "good"); renderA11yIssues([]); button.disabled = false; button.textContent = "Scan mapped elements";
        return;
      }
      setStatus(a11yState, `${res.report.length} issues`, "bad");
      const issues = res.report.flatMap((r) => r.issues.map((issue) => `[${r.devId}] <${r.tagName}>: ${issue}`)); renderA11yIssues(issues);
      button.disabled = false; button.textContent = "Scan mapped elements";
    });
  } catch (err) {
    setStatus(a11yState, "Failed", "bad"); runtimeFindings.textContent = `Accessibility scan unavailable: ${err.message}`; button.disabled = false; button.textContent = "Scan mapped elements";
  }
};

document.getElementById("btn-issues").onclick = () => {
  const button = document.getElementById("btn-issues"); button.disabled = true; button.textContent = "Reading…"; setStatus(issuesState, "Running", "warn"); setStatus(networkState, "Running", "warn");
  chrome.tabs.sendMessage(tabId, { type: "SCAN_DIAGNOSTICS" }, (res) => {
    if (chrome.runtime.lastError || !res) { setStatus(issuesState, "Failed", "bad"); runtimeFindings.textContent = `Diagnostics unavailable: ${chrome.runtime.lastError?.message || "No response"}`; button.disabled = false; button.textContent = "Inspect runtime issues"; return; }
    const errors = res.errors || []; const network = res.network || [];
    setStatus(issuesState, errors.length ? `${errors.length} issues` : "Passed", errors.length ? "bad" : "good"); setStatus(networkState, network.length ? `${network.length} failures` : "Passed", network.length ? "bad" : "good");
    runtimeFindings.textContent = "";
    for (const finding of [...errors, ...network]) { const item = document.createElement("div"); item.className = "finding error"; item.textContent = `${finding.kind || "Runtime"}: ${finding.message || finding.url || "Unknown issue"}`; runtimeFindings.appendChild(item); }
    if (!errors.length && !network.length) { const item = document.createElement("div"); item.className = "finding good"; item.textContent = "No captured console, runtime, or network failures."; runtimeFindings.appendChild(item); }
    button.disabled = false; button.textContent = "Inspect runtime issues";
  });
};

// 14. Copy Full-Stack Bug Context Bundle for Cursor AI
btnCopyBundle.addEventListener("click", async () => {
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

  const oldText = btnCopyBundle.textContent; btnCopyBundle.disabled = true; btnCopyBundle.textContent = "Copying…";
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this DevTools panel.");
    await navigator.clipboard.writeText(markdown);
    btnCopyBundle.textContent = "Copied";
  } catch (err) { codePreview.textContent = `Clipboard copy failed: ${err.message}\n\n${markdown}`; btnCopyBundle.textContent = "Copy failed — see source"; }
  finally { setTimeout(() => { btnCopyBundle.disabled = false; btnCopyBundle.textContent = oldText; }, 1800); }
});

// Lightweight navigation keeps the narrow panel from becoming one long screen.
for (const tab of document.querySelectorAll("[data-tab]")) {
  tab.addEventListener("click", () => {
    const name = tab.dataset.tab;
    for (const button of document.querySelectorAll("[data-tab]")) button.setAttribute("aria-selected", button === tab ? "true" : "false");
    for (const panel of document.querySelectorAll(".tab-panel")) { const active = panel.id === `${name}-panel`; panel.classList.toggle("active", active); panel.hidden = !active; }
  });
}

chrome.devtools.inspectedWindow.eval("({ url: location.href, framework: window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ? 'React' : 'Detected from page' })", (result) => {
  if (chrome.runtime.lastError || !result) return;
  inspectedUrl.textContent = result.url || "—";
  try { inspectedSite.textContent = new URL(result.url).host; } catch { inspectedSite.textContent = "Inspected tab"; }
  framework.textContent = result.framework || "Unknown";
});
