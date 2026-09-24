// Zero-dependency unit tests for the DubDub language (dub.js). Run with
// `npm test` from this folder, or `node test.js`.
const assert = require("assert");
require("../dub.js");
const { buildDubWord, dubText } = globalThis.Dub;

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log("ok -", name);
  } catch (e) {
    failures++;
    console.log("FAIL -", name, "-", e.message);
  }
}

check("same word always dubs the same way", () => {
  assert.strictEqual(buildDubWord("hello"), buildDubWord("hello"));
  assert.strictEqual(buildDubWord("banana"), buildDubWord("banana"));
});

check("dubbing is case-insensitive at its core", () => {
  assert.strictEqual(buildDubWord("hello").toLowerCase(), buildDubWord("HELLO").toLowerCase());
  assert.strictEqual(buildDubWord("Hello").toLowerCase(), buildDubWord("hello").toLowerCase());
});

check("capitalization is preserved", () => {
  assert.ok(/^[a-z]/.test(buildDubWord("hello")), "lowercase in, lowercase out");
  assert.ok(/^[A-Z]/.test(buildDubWord("Hello")), "Capitalized in, Capitalized out");
  assert.strictEqual(buildDubWord("HELLO"), buildDubWord("HELLO").toUpperCase());
});

check("every dub word is only letters and single spaces", () => {
  for (const word of ["a", "hello", "extraordinary", "dub", "DubDub"]) {
    assert.ok(/^[A-Za-z]+( [A-Za-z]+)*$/.test(buildDubWord(word)), `"${buildDubWord(word)}" from "${word}"`);
  }
});

check("dubText only touches letters, punctuation and spacing survive", () => {
  const input = "Hello, world! Isn't it nice?";
  const out = dubText(input);
  assert.strictEqual(out.match(/[,!?]/g).join(""), ",!?");
  assert.strictEqual(out.split(/\s+/).length, input.split(/\s+/).length);
});

check("longer words trend toward stronger dubs", () => {
  const short = buildDubWord("a").toLowerCase();
  const long = buildDubWord("extraordinary").toLowerCase();
  assert.ok(short.length < long.length, `"${short}" should be shorter than "${long}"`);
});

console.log(failures === 0 ? "ALL TESTS PASSED" : failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
