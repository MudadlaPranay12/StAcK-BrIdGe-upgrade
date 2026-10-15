const panelPorts = new Map();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "devbridge-panel") return;

  port.onMessage.addListener((msg) => {
    if (msg.type === "INIT" && msg.tabId) {
      panelPorts.set(msg.tabId, port);
    } else if (msg.tabId) {
      // Forward commands (like Toggle Inspect or Preview Class) to content script
      chrome.tabs.sendMessage(msg.tabId, msg);
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
