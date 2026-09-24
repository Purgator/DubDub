// Generates the extension icons as PNG files with zero dependencies.
// Design: playful pink-to-purple rounded tile, a bold white "DD" wordmark
// with a faint offset echo behind it — two dubs, doubled.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// ---- tiny PNG encoder -------------------------------------------------------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- vector-ish drawing with signed distances --------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

function sdRoundedBox(x, y, half, r) {
  const qx = Math.abs(x) - half + r, qy = Math.abs(y) - half + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}
// Box with independent half-width/half-height (the "D" spine).
function sdBoxAsym(x, y, hw, hh, r) {
  const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

// A "D": a vertical spine unioned with the right half of a thick ring, the
// ring cut at the spine's centerline so the two pieces fuse into one glyph.
const SPINE_HW = 0.1, SPINE_HH = 0.62, SPINE_R = 0.05;
const RING_R = 0.62, RING_T = 0.24;
function sdLetterD(x, y, cx) {
  const spine = sdBoxAsym(x - cx, y, SPINE_HW, SPINE_HH, SPINE_R);
  const dRing = Math.abs(Math.hypot(x - cx, y) - RING_R) - RING_T / 2;
  const bowl = Math.max(dRing, cx - x); // keep only the right half of the ring
  return Math.min(spine, bowl);
}

// Two D's side by side, forming the "DD" wordmark, centered at the origin.
const LETTER_GAP = 0.14;
const CX1 = -0.8, CX2 = 0.17; // spine x-positions, see tools/gen-icons.js notes below

function sdWordmark(x, y) {
  return Math.min(sdLetterD(x, y, CX1), sdLetterD(x, y, CX2));
}

function shade(u, v) {
  // Playful pink-to-purple gradient, top to bottom.
  const top = [0x8a, 0x5c, 0xff], bottom = [0xff, 0x5d, 0xa2];
  const t = clamp01((v + 1) / 2);
  let r = mix(top[0], bottom[0], t), g = mix(top[1], bottom[1], t), b = mix(top[2], bottom[2], t);

  // Rounded tile with transparent corners.
  const dTile = sdRoundedBox(u, v, 0.94, 0.28);
  let a = clamp01(0.5 - dTile * 90);

  // Faint echo of the wordmark, offset down-right — the "double" of DubDub.
  const dEcho = sdWordmark(u - 0.07, v - 0.07);
  const echo = clamp01(0.5 - dEcho * 60) * 0.35;
  r = mix(r, 255, echo); g = mix(g, 255, echo); b = mix(b, 255, echo);

  // Solid white wordmark on top.
  const dWord = sdWordmark(u, v);
  const word = clamp01(0.5 - dWord * 90);
  r = mix(r, 255, word); g = mix(g, 255, word); b = mix(b, 255, word);

  return [r, g, b, a * 255];
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4; // supersampling factor — small icons need the extra smoothing
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
        const v = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
        const [cr, cg, cb, ca] = shade(u, v);
        r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
      }
      const i = (py * size + px) * 4;
      if (a > 0) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; }
      buf[i + 3] = a / (SS * SS);
    }
  }
  return encodePNG(size, buf);
}

for (const size of [16, 32, 48, 128]) {
  const name = `icon${size}.png`;
  fs.writeFileSync(path.join(OUT, name), render(size));
  console.log('wrote', name);
}
