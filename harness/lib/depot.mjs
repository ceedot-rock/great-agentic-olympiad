import crypto from "node:crypto";

/**
 * Minimal client for a GitDepot Hub team depot. Benchmark results are
 * content-addressed by sha256, so a published result can be verified after
 * download.
 */
export class DepotClient {
  constructor({ url, key, fetchImpl = globalThis.fetch }) {
    if (!url) throw new Error("depot url is required");
    if (!key) throw new Error("depot key is required");
    if (typeof fetchImpl !== "function") throw new Error("fetch is not available");
    this.url = String(url).replace(/\/+$/, "");
    this.key = key;
    this.fetch = fetchImpl;
  }

  headers(extra = {}) {
    return { Authorization: `Bearer ${this.key}`, ...extra };
  }

  async health() {
    const res = await this.fetch(`${this.url}/api/health`, { headers: this.headers() });
    return parse(res);
  }

  async list() {
    const res = await this.fetch(`${this.url}/api/depot/list`, { headers: this.headers() });
    return parse(res);
  }

  async publish({ name, data, provenance = {} }) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
    const sha = crypto.createHash("sha256").update(bytes).digest("hex");
    const res = await this.fetch(`${this.url}/api/depot/publish`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name,
        sha256: sha,
        size: bytes.length,
        provenance,
        blob_b64: bytes.toString("base64"),
      }),
    });
    return parse(res);
  }

  async get(sha, { verify = true } = {}) {
    const clean = String(sha || "");
    if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error("sha256 must be 64 lowercase hex characters");
    const res = await this.fetch(`${this.url}/api/blob/${clean}`, { headers: this.headers() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`depot get failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (verify) {
      const actual = crypto.createHash("sha256").update(buf).digest("hex");
      if (actual !== clean) throw new Error(`blob hash mismatch: expected ${clean}, got ${actual}`);
    }
    return buf;
  }
}

async function parse(res) {
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`depot request failed (${res.status}): ${String(text).slice(0, 300)}`);
  return body;
}
