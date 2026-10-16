// Guard: background.js may inject this twice on an already-open tab —
// without this, Chrome throws "Identifier 'inspectMode' has already been declared"
if (!window.__DEVBRIDGE_CONTENT_SCRIPT_LOADED__) {
  window.__DEVBRIDGE_CONTENT_SCRIPT_LOADED__ = true;

  let inspectMode = false;
  let overlay = null;
  let label = null;
  const runtimeErrors = [];
  const networkFailures = [];
  function remember(list, item) {
    list.unshift({ ...item, timestamp: new Date().toISOString() });
    if (list.length > 50) list.length = 50;
  }
  window.addEventListener("error", (event) => {
    remember(runtimeErrors, { kind: "Runtime error", message: event.message || "Unhandled page error", source: event.filename || "unknown", line: event.lineno || 0 });
  }, true);
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason?.message || String(event.reason || "Unhandled promise rejection");
    remember(runtimeErrors, { kind: "Unhandled promise rejection", message: reason });
  }, true);
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "devbridge-runtime") return;
    if (event.data.type === "NETWORK_FAILURE") {
      remember(networkFailures, { kind: "Network failure", message: event.data.errorMessage || `HTTP ${event.data.statusCode}`, url: event.data.url, statusCode: event.data.statusCode, traceId: event.data.traceId, devId: event.data.devId });
    }
  });

  function ensureOverlay() {
    if (overlay) return;
    try {
      overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #3b82f6;background:rgba(59,130,246,0.15);border-radius:4px;display:none;transition:all 40ms ease;";
      label = document.createElement("div");
      label.style.cssText =
        "position:absolute;top:-24px;left:0;background:#1d4ed8;color:#fff;font:11px monospace;padding:2px 6px;border-radius:3px;white-space:nowrap;";
      overlay.appendChild(label);
      document.documentElement.appendChild(overlay);
    } catch (e) {
      console.error("[DevBridge] Overlay creation error:", e);
    }
  }

  // --- React Fiber introspection (works with React 18/19, safe on non-React nodes) ---
  function getFiber(el) {
    try {
      if (!el) return null;
      const key = Object.keys(el).find(
        (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
      );
      return key ? el[key] : null;
    } catch {
      return null;
    }
  }

  function safeSerialize(value, depth = 0) {
    if (depth > 3) return "[depth-limit]";
    if (value == null) return value;
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") return value;
    if (t === "function") return `[function ${value.name || "anonymous"}]`;
    if (Array.isArray(value)) {
      if (value.length > 20) return `[array(${value.length})]`;
      try {
        return value.map((v) => safeSerialize(v, depth + 1));
      } catch {
        return "[unserializable]";
      }
    }
    if (t === "object") {
      // React elements / fibers are huge — summarize instead of dumping
      if (value.$$typeof) return "[ReactElement]";
      if (value._reactInternals || value.stateNode) return "[ComponentInstance]";
      try {
        if (value instanceof HTMLElement) return `[HTMLElement <${value.tagName.toLowerCase()}>]`;
      } catch {
        return "[HTMLElement]";
      }
      const out = {};
      try {
        for (const k of Object.keys(value).slice(0, 30)) {
          if (k === "children") {
            const ch = value[k];
            out[k] = Array.isArray(ch)
              ? `[children x${ch.length}]`
              : typeof ch === "object" && ch !== null
                ? "[child]"
                : safeSerialize(ch, depth + 1);
          } else {
            out[k] = safeSerialize(value[k], depth + 1);
          }
        }
      } catch {
        return "[unserializable]";
      }
      return out;
    }
    return `[${t}]`;
  }

  function extractFiberInfo(el) {
    try {
      const fiber = getFiber(el);
      if (!fiber) return { fiberProps: null, fiberState: null, fiberComponent: null };
      // Props live on memoizedProps of the fiber (strip children to keep it readable)
      const memoizedProps = fiber.memoizedProps || {};
      const { children: _drop, ...restProps } = memoizedProps;
      // Walk up to find the owning component name (function / class / host)
      let node = fiber;
      let fiberComponent = null;
      while (node) {
        const tag = node.tag; // 0=function, 1=class, 5=host
        const type = node.type;
        if ((tag === 0 || tag === 1) && type) {
          fiberComponent = type.displayName || type.name || null;
          break;
        }
        if (tag === 5 && !fiberComponent) {
          fiberComponent = null; // host node, keep looking up
        }
        node = node.return;
        if (!node || !node.return) break;
      }
      // Hooks / class state live on memoizedState chain
      const hooks = [];
      let hook = fiber.memoizedState;
      let guard = 0;
      while (hook && guard < 15) {
        if (hook.memoizedState !== undefined && hook.queue === undefined) {
          // useState / useReducer slot — capture it
          hooks.push(safeSerialize(hook.memoizedState));
        } else if (hook.memoizedState !== null && typeof hook.memoizedState === "object" && hook.queue) {
          hooks.push(safeSerialize(hook.memoizedState));
        }
        hook = hook.next;
        guard++;
      }
      // Class component instance state
      let classState = null;
      if (fiber.stateNode && fiber.stateNode.state && typeof fiber.stateNode.state === "object") {
        classState = safeSerialize(fiber.stateNode.state);
      }
      return {
        fiberProps: safeSerialize(restProps),
        fiberState: classState || (hooks.length ? hooks : null),
        fiberComponent,
      };
    } catch {
      return { fiberProps: null, fiberState: null, fiberComponent: null };
    }
  }

  // Lightweight Accessibility (a11y) audit for a DOM element:
  // missing accessible names, missing img alt / form labels,
  // click-handler divs without roles, and tiny font sizes.
  function scanElementAccessibility(el) {
    try {
      const issues = [];
      const tag = el.tagName.toLowerCase();
      const ariaLabel = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
      const text = (el.innerText || "").trim();

      if (tag === "button" && !text && !ariaLabel) {
        issues.push("CRITICAL: <button> has no accessible text or aria-label.");
      }
      if (tag === "a" && !text && !ariaLabel) {
        issues.push("CRITICAL: <a> link has no discernible text or aria-label.");
      }
      if (tag === "img" && !el.hasAttribute("alt")) {
        issues.push("CRITICAL: <img> element is missing an 'alt' attribute.");
      }
      const hasLabel = Boolean(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
      if ((tag === "input" || tag === "select" || tag === "textarea") && !ariaLabel && !hasLabel) {
        issues.push("HIGH: Form input is missing an associated <label> or aria-label.");
      }
      if (el.hasAttribute("onclick") && tag === "div" && !el.getAttribute("role")) {
        issues.push("HIGH: Non-interactive <div> has click handler without role='button'.");
      }
      try {
        const style = window.getComputedStyle(el);
        if (parseFloat(style.fontSize) < 12) {
          issues.push(`WARN: Font size (${style.fontSize}) is smaller than recommended 12px minimum.`);
        }
      } catch {}
      return issues;
    } catch {
      return [];
    }
  }

  function flashNodes(nodes) {    try {
      nodes.forEach((n, i) => {
        try {
          const prevOutline = n.style.outline;
          const prevTransition = n.style.transition;
          n.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          // Stagger the flash so .map() lists visibly ripple
          setTimeout(() => {
            try {
              n.style.transition = "outline 0.15s ease, box-shadow 0.15s ease";
              n.style.outline = "3px solid #22c55e";
              n.style.boxShadow = "0 0 0 6px rgba(34,197,94,0.35)";
              setTimeout(() => {
                try {
                  n.style.outline = prevOutline;
                  n.style.boxShadow = "";
                  n.style.transition = prevTransition;
                } catch {}
              }, 1200);
            } catch {}
          }, i * 120);
        } catch {}
      });
    } catch {}
  }

  window.addEventListener(
    "mousemove",
    (e) => {
      try {
        if (!inspectMode) return;
        ensureOverlay();
        const target = e.target?.closest?.("[data-dev-id]");
        if (!target) {
          if (overlay) overlay.style.display = "none";
          return;
        }
        const rect = target.getBoundingClientRect();
        const devId = target.getAttribute("data-dev-id");
        if (overlay) {
          overlay.style.display = "block";
          overlay.style.top = `${rect.top}px`;
          overlay.style.left = `${rect.left}px`;
          overlay.style.width = `${rect.width}px`;
          overlay.style.height = `${rect.height}px`;
          if (label) label.textContent = `<${target.tagName.toLowerCase()}> • ${devId}`;
        }
      } catch (err) {
        // Silently catch external extension interference (e.g. showOneChild errors
        // from unrelated extensions must never break our inspect loop)
      }
    },
    true
  );

  window.addEventListener(
    "click",
    (e) => {
      try {
        if (!inspectMode) return;
        const target = e.target?.closest?.("[data-dev-id]");
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();

        const devId = target.getAttribute("data-dev-id");
        inspectMode = false;
        if (overlay) overlay.style.display = "none";

        const nodes = document.querySelectorAll(`[data-dev-id="${devId}"]`);
        const { fiberProps, fiberState, fiberComponent } = extractFiberInfo(target);
        const a11yIssues = scanElementAccessibility(target);

        try {
          chrome.runtime.sendMessage({
            type: "ELEMENT_SELECTED",
            devId,
            tagName: target.tagName.toLowerCase(),
            className: typeof target.className === "string" ? target.className : "",
            innerText: (target.innerText || "").slice(0, 300),
            instanceCount: nodes.length,
            fiberProps,
            fiberState,
            fiberComponent,
            a11yIssues,
          });
        } catch (msgErr) {
          console.error("[DevBridge] Click selection error:", msgErr);
        }
      } catch (err) {
        console.error("[DevBridge] Click selection error:", err);
      }
    },
    true
  );

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (msg.type === "TOGGLE_INSPECT") {
        inspectMode = msg.enabled;
        ensureOverlay();
        if (!inspectMode && overlay) overlay.style.display = "none";
      } else if (msg.type === "LIVE_PREVIEW_CLASSES") {
        try {
          const nodes = document.querySelectorAll(`[data-dev-id="${msg.devId}"]`);
          nodes.forEach((n) => (n.className = msg.className));
        } catch {}
      } else if (msg.type === "LIVE_PREVIEW_TEXT") {
        try {
          const nodes = document.querySelectorAll(`[data-dev-id="${msg.devId}"]`);
          nodes.forEach((n) => {
            // Only replace the first text node so nested markup survives
            const textNode = Array.from(n.childNodes).find(
              (c) => c.nodeType === 3 && c.textContent.trim() !== ""
            );
            if (textNode) textNode.textContent = msg.text;
            else n.innerText = msg.text;
          });
        } catch {}
      } else if (msg.type === "LOCATE_IN_DOM") {
        try {
          const nodes = Array.from(document.querySelectorAll(`[data-dev-id="${msg.devId}"]`));
          flashNodes(nodes);
          try {
            chrome.runtime.sendMessage({
              type: "INSTANCES_FLASHED",
              devId: msg.devId,
              count: nodes.length,
            });
          } catch {}
          if (sendResponse) sendResponse({ count: nodes.length });
        } catch {}
      } else if (msg.type === "LOCATE_DEV_ID") {
        // Back-compat alias for LOCATE_IN_DOM (request/response style)
        try {
          const nodes = document.querySelectorAll(`[data-dev-id="${msg.devId}"]`);
          if (nodes.length === 0) {
            if (sendResponse) sendResponse({ count: 0, a11yIssues: [] });
            return true;
          }
          try {
            nodes[0].scrollIntoView({ behavior: "smooth", block: "center" });
          } catch {}
          nodes.forEach((node) => {
            try {
              const originalOutline = node.style.outline;
              node.style.outline = "4px solid #ef4444";
              setTimeout(() => {
                try {
                  node.style.outline = originalOutline;
                } catch {}
              }, 1500);
            } catch {}
          });
          let a11yIssues = [];
          try {
            a11yIssues = scanElementAccessibility(nodes[0]);
          } catch {}
          if (sendResponse) sendResponse({ count: nodes.length, a11yIssues });
        } catch {}
      } else if (msg.type === "SCAN_PAGE_A11Y") {
        // Full-page audit over mapped elements only
        try {
          const allNodes = document.querySelectorAll("[data-dev-id]");
          const report = [];
          allNodes.forEach((node) => {
            try {
              const issues = scanElementAccessibility(node);
              if (issues.length > 0) {
                report.push({
                  devId: node.getAttribute("data-dev-id"),
                  tagName: node.tagName.toLowerCase(),
                  issues,
                });
              }
            } catch {}
          });
          if (sendResponse) sendResponse({ report });
        } catch {}
        return true;
      } else if (msg.type === "SCAN_DIAGNOSTICS") {
        if (sendResponse) sendResponse({ errors: runtimeErrors.slice(), network: networkFailures.slice() });
        return true;
      }
    } catch (err) {
      console.error("[DevBridge Message Error]:", err);
    }
    return true;
  });
}
