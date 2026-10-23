// Generates cover.png (800x534) for gladys-flexit: plain Node, no dependency.
// A house, a ventilation unit with its rotating heat exchanger, air arrows, a
// small flame (fireplace mode) and local network waves on a deep blue
// gradient (no brand logo). Usage: node scripts/cover.mjs cover.png
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = 800;
const H = 534;
const px = Buffer.alloc(W * H * 3);
const set = (x, y, [r, g, b], a = 1) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = px[i] * (1 - a) + r * a;
  px[i + 1] = px[i + 1] * (1 - a) + g * a;
  px[i + 2] = px[i + 2] * (1 - a) + b * a;
};
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const t = (x / W + y / H) / 2;
    set(x, y, [20 + 25 * t, 50 + 40 * t, 110 + 60 * t]);
  }
}
const white = [255, 255, 255];
const dark = [18, 30, 60];
const orange = [250, 140, 60];
const yellow = [255, 210, 90];
const glass = [160, 205, 240];
const disc = (cx, cy, r, color, alpha = 1) => {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y += 1) {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x += 1) {
      const a = Math.max(0, Math.min(1, r - Math.hypot(x - cx, y - cy) + 0.5));
      if (a > 0) set(x, y, color, a * alpha);
    }
  }
};
const arc = (cx, cy, r, width, from, to, color) => {
  for (let y = Math.floor(cy - r - width); y <= cy + r + width; y += 1) {
    for (let x = Math.floor(cx - r - width); x <= cx + r + width; x += 1) {
      const angle = Math.atan2(y - cy, x - cx);
      if (angle < from || angle > to) continue;
      const a = Math.max(
        0,
        Math.min(1, width / 2 - Math.abs(Math.hypot(x - cx, y - cy) - r) + 0.5),
      );
      if (a > 0) set(x, y, color, a);
    }
  }
};
const box = (x0, y0, x1, y1, r, color, alpha = 1) => {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const cx = Math.min(Math.max(x, x0 + r), x1 - r);
      const cy = Math.min(Math.max(y, y0 + r), y1 - r);
      const a = Math.max(0, Math.min(1, r - Math.hypot(x - cx, y - cy) + 0.5));
      if (a > 0) set(x, y, color, a * alpha);
    }
  }
};
const line = (x0, y0, x1, y1, width, color) => {
  const minX = Math.floor(Math.min(x0, x1) - width);
  const maxX = Math.ceil(Math.max(x0, x1) + width);
  const minY = Math.floor(Math.min(y0, y1) - width);
  const maxY = Math.ceil(Math.max(y0, y1) + width);
  const len2 = (x1 - x0) ** 2 + (y1 - y0) ** 2;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / len2));
      const d = Math.hypot(x - (x0 + t * (x1 - x0)), y - (y0 + t * (y1 - y0)));
      const a = Math.max(0, Math.min(1, width / 2 - d + 0.5));
      if (a > 0) set(x, y, color, a);
    }
  }
};

disc(400, 270, 250, white, 0.06);

// The house.
line(110, 250, 400, 70, 16, white);
line(400, 70, 690, 250, 16, white);
line(160, 220, 160, 470, 16, white);
line(640, 220, 640, 470, 16, white);
line(160, 470, 640, 470, 16, white);

// The unit: a box with a rotating heat exchanger (a wheel with spokes).
box(210, 250, 470, 430, 24, white);
disc(320, 340, 72, dark);
for (let k = 0; k < 8; k += 1) {
  const a = (k * Math.PI) / 4;
  line(320, 340, 320 + 60 * Math.cos(a), 340 + 60 * Math.sin(a), 6, glass);
}
arc(320, 340, 60, 6, -Math.PI, Math.PI, glass);
disc(320, 340, 12, white);
box(410, 280, 450, 300, 6, orange);
box(410, 315, 450, 335, 6, dark);
box(410, 350, 450, 370, 6, dark);

// Air arrows, in and out.
for (const [y, dir] of [
  [290, 1],
  [390, -1],
]) {
  const x0 = dir > 0 ? 500 : 600;
  const x1 = dir > 0 ? 600 : 500;
  line(x0, y, x1, y, 10, white);
  line(x1, y, x1 - dir * 22, y - 18, 10, white);
  line(x1, y, x1 - dir * 22, y + 18, 10, white);
}

// A stove with a small flame (fireplace mode), on the floor.
box(530, 425, 610, 462, 8, dark);
disc(570, 438, 14, orange);
disc(570, 424, 9, orange);
disc(570, 414, 5, orange);
disc(570, 442, 7, yellow);

// Local network waves above the roof (no cloud).
for (const r of [22, 42, 62]) {
  arc(400, 150, r, 9, -2.4, -0.74, white);
}
disc(400, 150, 7, white);

// PNG encoding.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y += 1) {
  raw[y * (W * 3 + 1)] = 0;
  px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(process.argv[2] ?? 'cover.png', png);
console.log('cover', png.length, 'bytes');
