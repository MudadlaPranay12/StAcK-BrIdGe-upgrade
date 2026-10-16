const panelPorts = new Map();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "devbridge-panel") return;

  port.onMessage.addListener(async (msg) => {
    if (msg.type === "INIT" && msg.tabId) {
      panelPorts.set(msg.tabId, port);
    } else if (msg.tabId) {
      try {
        await chrome.tabs.sendMessage(msg.tabId, msg);
      } catch (err) {
        // Content script may not be loaded (e.g. page was open before install,
        // or a navigation raced the static content_scripts injection).
        // Auto-inject it on demand, then retry the relay once.
        try {
          await chrome.scripting.executeScript({
            target: { tabId: msg.tabId },
            files: ["content-script.js"],
          });
          await chrome.tabs.sendMessage(msg.tabId, msg);
        } catch (injectErr) {
          console.error("[DevBridge] Injection failed:", injectErr);
        }
      }
    }
  });

  port.onDisconnect.addListener(() => {
    for (const [tabId, p] of panelPorts.entries()) {
      if (p === port) panelPorts.delete(tabId);
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;
  if (tabId && panelPorts.has(tabId)) {
    panelPorts.get(tabId).postMessage(msg);
  }
});
