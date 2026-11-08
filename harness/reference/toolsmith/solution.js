"use strict";

function parseDuration(text) {
  if (typeof text !== "string") return null;
  const m = text.trim().match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m) return null;
  const [, d, h, min, s] = m;
  if (d === undefined && h === undefined && min === undefined && s === undefined) return null;
  return (Number(d || 0) * 86400) + (Number(h || 0) * 3600) + (Number(min || 0) * 60) + Number(s || 0);
}

function formatBytes(n) {
  const value = Number(n);
  if (!Number.isFinite(value) || value < 0) return "0 B";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let v = value;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx++;
  }
  if (idx === 0) return `${Math.round(v)} B`;
  return `${v.toFixed(1)} ${units[idx]}`;
}

function slugify(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function chunk(array, size) {
  const n = Number(size);
  if (!Number.isInteger(n) || n <= 0) throw new Error("size must be a positive integer");
  const out = [];
  for (let i = 0; i < array.length; i += n) out.push(array.slice(i, i + n));
  return out;
}

module.exports = { parseDuration, formatBytes, slugify, chunk };
