"use strict";

const BASE = 33;

function encode(values) {
  if (!Array.isArray(values)) throw new Error("values must be an array");
  if (values.length > 255) throw new Error("too many values");
  const bytes = [];
  let acc = 0;
  let bits = 0;
  for (const raw of values) {
    const v = Number(raw);
    if (!Number.isInteger(v) || v < 0 || v > 63) throw new Error("values must be 0..63");
    acc = (acc << 6) | v;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  if (bits > 0) bytes.push((acc << (8 - bits)) & 0xff);
  return String.fromCharCode(BASE + values.length) + bytes.map((b) => String.fromCharCode(BASE + b)).join("");
}

function decode(packet) {
  if (typeof packet !== "string" || packet.length === 0) throw new Error("packet must be a non-empty string");
  const count = packet.charCodeAt(0) - BASE;
  if (count < 0 || count > 255) throw new Error("bad packet header");
  const bytes = [];
  for (let i = 1; i < packet.length; i++) {
    const b = packet.charCodeAt(i) - BASE;
    if (b < 0 || b > 255) throw new Error("bad packet byte");
    bytes.push(b);
  }
  const out = [];
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 6 && out.length < count) {
      bits -= 6;
      out.push((acc >> bits) & 63);
    }
  }
  if (out.length !== count) throw new Error("truncated packet");
  return out;
}

module.exports = { encode, decode };
