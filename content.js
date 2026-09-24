// DubDub content script: replaces every word of the page with its DubDub
// translation, live, and restores the original text when turned off.
(function () {
  "use strict";

  const { dubText } = globalThis.Dub;

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
    "IFRAME", "CODE", "PRE",
  ]);
  const HAS_LETTER_RE = /\p{L}/u;

  // Original text per node, so disabling restores the page exactly and
  // re-enabling doesn't need to re-derive anything.
  const originals = new Map();
  let enabled = false;
  let observer = null;

  function isSkippable(el) {
    return SKIP_TAGS.has(el.tagName) || el.isContentEditable;
  }

  function isInsideSkippable(node) {
    for (let el = node.parentElement; el; el = el.parentElement) {
      if (isSkippable(el)) return true;
    }
    return false;
  }

  // Idempotent by construction: if the node already shows the dub of its
  // known original, writing it again is a no-op, so re-running this from a
  // mutation caused by our own previous write never loops or reprocesses.
  function ensureDubbed(node) {
    if (isInsideSkippable(node)) return;
    const raw = node.nodeValue;
    if (!raw || !HAS_LETTER_RE.test(raw)) return;

    let original = originals.get(node);
    if (original === undefined || raw !== dubText(original)) {
      // First sight of this node, or the page changed its text itself.
      original = raw;
      originals.set(node, original);
    }
    const dubbed = dubText(original);
    if (node.nodeValue !== dubbed) node.nodeValue = dubbed;
  }

  function restoreNode(node) {
    const original = originals.get(node);
    if (original !== undefined && node.nodeValue !== original) {
      node.nodeValue = original;
    }
  }

  function collectTextNodes(root) {
    const nodes = [];
    if (root.nodeType === Node.TEXT_NODE) {
      nodes.push(root);
      return nodes;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  // Spreads a big list of nodes over idle time so a huge page never blocks
  // the main thread in one long task (smooth scrolling, no jank, no drain).
  function scheduleWork(nodes, action) {
    let i = 0;
    function runChunk(deadline) {
      const hasDeadline = deadline && typeof deadline.timeRemaining === "function";
      while (i < nodes.length && (!hasDeadline || deadline.timeRemaining() > 0)) {
        action(nodes[i++]);
      }
      if (i < nodes.length) scheduleNext();
    }
    function scheduleNext() {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(runChunk, { timeout: 200 });
      } else {
        requestAnimationFrame(() => runChunk(null));
      }
    }
    scheduleNext();
  }

  function setEnabled(next) {
    enabled = next;
    if (enabled) {
      scheduleWork(collectTextNodes(document.body), ensureDubbed);
    } else {
      for (const node of originals.keys()) restoreNode(node);
    }
  }

  // Mutations are batched and flushed shortly after they happen — busy SPAs
  // mutate constantly, and re-dubbing on every single mutation would be
  // wasteful; one pass per batch is imperceptible and battery-friendly.
  // Scheduled via both requestAnimationFrame (imperceptible on a visible
  // tab) and a short timeout (so a backgrounded tab — where rAF is paused —
  // still catches up instead of getting stuck with undubbed text).
  let pending = new Set();
  let flushScheduled = false;

  function flushPending() {
    if (!flushScheduled) return; // already run via the other scheduling path
    flushScheduled = false;
    const batch = pending;
    pending = new Set();
    if (!enabled) return;
    for (const node of batch) {
      if (node.nodeType === Node.TEXT_NODE) {
        ensureDubbed(node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        scheduleWork(collectTextNodes(node), ensureDubbed);
      }
    }
  }

  function startObserving() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!enabled) return;
      for (const m of mutations) {
        if (m.type === "childList") {
          for (const node of m.addedNodes) pending.add(node);
        } else if (m.type === "characterData") {
          pending.add(m.target);
        }
      }
      if (pending.size && !flushScheduled) {
        flushScheduled = true;
        requestAnimationFrame(flushPending);
        setTimeout(flushPending, 120);
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  async function isEnabledForHost(host) {
    const { enabled: globalEnabled = true, exceptions = [] } = await chrome.storage.sync.get({
      enabled: true,
      exceptions: [],
    });
    if (!globalEnabled) return false;
    return !exceptions.some((entry) => host === entry || host.endsWith("." + entry));
  }

  async function refresh() {
    setEnabled(await isEnabledForHost(location.hostname));
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && (changes.enabled || changes.exceptions)) refresh();
  });

  function boot() {
    refresh().then(startObserving);
  }

  if (document.body) {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();
