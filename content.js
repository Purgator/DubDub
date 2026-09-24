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

  // Text that lives in an attribute rather than a text node — e.g. a search
  // box's placeholder — is invisible to a text-node walk, but it's still
  // words the user reads, so it gets dubbed the same way. Deliberately
  // excludes "value": that can be real data the user (or the page) put
  // there, not UI chrome.
  const ATTR_NAMES = ["placeholder", "title", "aria-label", "alt"];
  const ATTR_SELECTOR = ATTR_NAMES.map((a) => `[${a}]`).join(",");

  // Original text per node/attribute, so disabling restores the page
  // exactly and re-enabling doesn't need to re-derive anything.
  const originals = new Map();
  const originalAttrs = new Map(); // element -> Map(attrName -> original value)
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

  // Same idempotence trick as ensureDubbed, one attribute at a time. Note:
  // no isSkippable(el) guard here — SKIP_TAGS exists to protect real
  // content inside inputs/textareas, but placeholder/title/aria-label/alt
  // are UI hints on exactly those elements, and are meant to be dubbed.
  function ensureDubbedAttr(el, attr) {
    const raw = el.getAttribute(attr);
    if (!raw || !HAS_LETTER_RE.test(raw)) return;

    let store = originalAttrs.get(el);
    if (!store) {
      store = new Map();
      originalAttrs.set(el, store);
    }
    let original = store.get(attr);
    if (original === undefined || raw !== dubText(original)) {
      original = raw;
      store.set(attr, original);
    }
    const dubbed = dubText(original);
    if (el.getAttribute(attr) !== dubbed) el.setAttribute(attr, dubbed);
  }

  function ensureDubbedAttrs(el) {
    for (const attr of ATTR_NAMES) {
      if (el.hasAttribute(attr)) ensureDubbedAttr(el, attr);
    }
  }

  function restoreAttrs(el) {
    const store = originalAttrs.get(el);
    if (!store) return;
    for (const [attr, original] of store) {
      if (el.getAttribute(attr) !== original) el.setAttribute(attr, original);
    }
  }

  function collectAttrElements(root) {
    if (!(root instanceof Element)) return [];
    const list = ATTR_NAMES.some((a) => root.hasAttribute(a)) ? [root] : [];
    list.push(...root.querySelectorAll(ATTR_SELECTOR));
    return list;
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
    if (nodes.length === 0) return;
    let i = 0;
    function runChunk(deadline) {
      const hasDeadline = deadline && typeof deadline.timeRemaining === "function";
      // Always process at least one item per callback: if the browser ever
      // reports ~0 idle time on every callback (seen on some pages/tabs),
      // a plain "while there's time left" loop would reschedule forever
      // without ever doing any work. One guaranteed item per tick means
      // it always finishes, just maybe gradually instead of in one pass.
      do {
        action(nodes[i++]);
      } while (i < nodes.length && (!hasDeadline || deadline.timeRemaining() > 0));
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
      scheduleWork(collectAttrElements(document.body), ensureDubbedAttrs);
    } else {
      for (const node of originals.keys()) restoreNode(node);
      for (const el of originalAttrs.keys()) restoreAttrs(el);
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
        scheduleWork(collectAttrElements(node), ensureDubbedAttrs);
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
        } else if (m.type === "characterData" || m.type === "attributes") {
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
      attributes: true,
      attributeFilter: ATTR_NAMES,
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
