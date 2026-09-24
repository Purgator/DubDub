// The DubDub language: every word maps to exactly one "dub" word, forever.
// Pure, dependency-free logic shared by the content script and the popup
// (plain script, attaches to globalThis — see alias.js in PlusOne for the
// same pattern).
(function () {
  "use strict";

  // FNV-1a: small, fast, and stable across sessions/browsers — the whole
  // "always the same word" guarantee rests on this being a pure function
  // of the lowercase word, no Math.random, no Date, no storage.
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // Longer words feel "stronger" and get a beefier dub — a couple of
  // hash-picked variants per tier keep it from being too repetitive.
  const TIERS = [
    ["dub"],
    ["dub", "dubb", "duub"],
    ["duub", "dubub", "dubb dub"],
    ["duub dub", "dub duub", "dubdub"],
    ["dub dub dub", "duuub dub", "dub duub dub"],
  ];

  function tierFor(lower, hash) {
    const lengthTier = Math.min(3, Math.floor(lower.length / 4));
    const jitter = hash % 2; // deterministic nudge, not randomness
    return Math.min(TIERS.length - 1, lengthTier + jitter);
  }

  function isAllUpper(word) {
    return word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase();
  }

  function isCapitalized(word) {
    const first = word[0];
    return first !== first.toLowerCase() && first === first.toUpperCase();
  }

  // Reapply the original word's casing so a dub word blends into the
  // sentence instead of shouting "SHOUTING" -> "dub" or "Word" -> "dub".
  function matchCase(dub, original) {
    if (isAllUpper(original)) return dub.toUpperCase();
    if (isCapitalized(original)) return dub[0].toUpperCase() + dub.slice(1);
    return dub;
  }

  // The one rule of DubDub: same input word (case-insensitive) always
  // produces the same output, everywhere, every time.
  function buildDubWord(word) {
    const lower = word.toLowerCase();
    const hash = fnv1a(lower);
    const variants = TIERS[tierFor(lower, hash)];
    const dub = variants[hash % variants.length];
    return matchCase(dub, word);
  }

  const WORD_RE = /\p{L}+/gu;

  function dubText(text) {
    return text.replace(WORD_RE, (word) => buildDubWord(word));
  }

  globalThis.Dub = { fnv1a, buildDubWord, dubText };
})();
