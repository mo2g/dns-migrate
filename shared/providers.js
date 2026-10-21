// Shared DNS provider logic for Cloudflare Pages Functions and the CLI.
// Runs on Workers and Node 18+ (both provide global fetch and Web Crypto).

export const PROVIDERS = {
  cloudflare: { label: "Cloudflare", lines: false, weights: false, proxy: true, multiValue: true },
  dnspod: { label: "DNSPod", lines: true, weights: true, proxy: false, multiValue: true },
  alidns: { label: "Alibaba Cloud DNS", lines: true, weights: true, proxy: false, multiValue: true },
  route53: { label: "AWS Route 53", lines: true, weights: true, proxy: false, multiValue: true },
};

export function quoteTxt(value) {
  const s = String(value ?? "");
  if (s.startsWith('"') && s.endsWith('"')) return s;
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function unquoteTxt(value) {
  const s = String(value ?? "");
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
  return s;
}

function normalizeCloudflare(r) {
  let value = r.content ?? "";
  if (r.type === "TXT") value = quoteTxt(value);
  if (r.type === "CAA" && r.data) value = `${r.data.flags ?? 0} ${r.data.tag} "${r.data.value}"`;
  if (r.type === "SRV" && r.data) value = `${r.data.priority} ${r.data.weight} ${r.data.port} ${r.data.target}`;
  return {
    name: r.name,
    type: String(r.type || "").toUpperCase(),
    ttl: Number(r.ttl) || 600,
    priority: r.type === "MX" ? String(r.priority ?? "") : "",
    value,
    line: "默认",
    weight: "",
    proxied: !!r.proxied,
  };
}

export async function exportCloudflare({ token, accountId, domain }) {
  if (!token || !accountId || !domain) throw new Error("token, accountId and domain are required");
  const headers = { Authorization: `Bearer ${token}` };
  const zoneRes = await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}&account.id=${encodeURIComponent(accountId)}&per_page=50`,
    { headers }
  );
  const zoneData = await zoneRes.json();
  if (!zoneData.success) throw new Error(`Cloudflare zone lookup failed: ${(zoneData.errors || []).map(e => e.message).join("; ")}`);
  const zone = (zoneData.result || [])[0];
  if (!zone) throw new Error(`Zone not found in this Cloudflare account: ${domain}`);

  const records = [];
  let page = 1;
  for (;;) {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records?per_page=100&page=${page}`,
      { headers }
    );
    const data = await res.json();
    if (!data.success) throw new Error(`Cloudflare records failed: ${(data.errors || []).map(e => e.message).join("; ")}`);
    for (const r of data.result || []) records.push(normalizeCloudflare(r));
    const info = data.result_info || {};
    if (page >= Number(info.total_pages || 1)) break;
    page += 1;
    if (page > 50) break;
  }
  return { provider: "cloudflare", zoneId: zone.id, domain: zone.name, records };
}

/* ---------- DNSPod (Tencent Cloud API 3.0, TC3-HMAC-SHA256) ---------- */

const encoder = new TextEncoder();

async function sha256Hex(message) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(message));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(sig);
}

export async function exportDnspod({ secretId, secretKey, domain }) {
  if (!secretId || !secretKey || !domain) throw new Error("secretId, secretKey and domain are required");
  const host = "dnspod.tencentcloudapi.com";
  const service = "dnspod";
  const action = "DescribeRecordList";
  const version = "2021-03-23";
  const payload = JSON.stringify({ Domain: domain, Limit: 3000 });
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const hashedPayload = await sha256Hex(payload);
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, hashedPayload].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = ["TC3-HMAC-SHA256", String(timestamp), credentialScope, await sha256Hex(canonicalRequest)].join("\n");

  const secretDate = await hmac(encoder.encode("TC3" + secretKey), date);
  const secretService = await hmac(secretDate, service);
  const secretSigning = await hmac(secretService, "tc3_request");
  const signature = [...(await hmac(secretSigning, stringToSign))].map(b => b.toString(16).padStart(2, "0")).join("");
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: authorization,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Region": "",
    },
    body: payload,
  });
  const data = await res.json();
  const response = data.Response || {};
  if (response.Error) throw new Error(`DNSPod API error: ${response.Error.Code} ${response.Error.Message}`);

  const records = (response.RecordList || []).map(r => {
    const zone = domain.replace(/\.$/, "");
    const host = r.Name === "@" ? zone : `${String(r.Name).replace(/\.$/, "")}.${zone}`;
    const type = String(r.Type || "").toUpperCase();
    let value = r.Value ?? "";
    if (type === "TXT") value = quoteTxt(value);
    const status = String(r.Status ?? "").toUpperCase();
    return {
      name: host.endsWith(".") ? host : host + ".",
      type,
      ttl: Number(r.TTL) || 600,
      priority: type === "MX" ? String(r.MX ?? "") : "",
      value,
      line: r.Line || "默认",
      weight: r.Weight ? String(r.Weight) : "",
      disabled: status === "DISABLE" || status === "0",
    };
  });
  return { provider: "dnspod", domain, records };
}

/* ---------- Apply (Cloudflare target) ---------- */

const APPLY_TYPES = new Set(["A", "AAAA", "CNAME", "MX", "TXT"]);
const MAX_RECORDS = 500;

function keyFor(record) {
  const content = record.type === "TXT" ? unquoteTxt(record.value) : String(record.value || "");
  return `${record.type}|${record.name}|${content}|${record.type === "MX" ? record.priority || "" : ""}`;
}

export async function applyCloudflare({ token, accountId, domain, records, apply }) {
  if (!token || !accountId || !domain) throw new Error("token, accountId and domain are required");
  if (!Array.isArray(records) || !records.length) throw new Error("records must be a non-empty array");
  if (records.length > MAX_RECORDS) throw new Error(`Too many records (max ${MAX_RECORDS} per request)`);

  const headers = { Authorization: `Bearer ${token}` };
  const zoneRes = await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}&account.id=${encodeURIComponent(accountId)}&per_page=50`,
    { headers }
  );
  const zoneData = await zoneRes.json();
  if (!zoneData.success) throw new Error(`Cloudflare zone lookup failed: ${(zoneData.errors || []).map(e => e.message).join("; ")}`);
  const zone = (zoneData.result || [])[0];
  if (!zone) throw new Error(`Zone not found in this Cloudflare account: ${domain}`);

  const existing = [];
  let page = 1;
  for (;;) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records?per_page=100&page=${page}`, { headers });
    const data = await res.json();
    if (!data.success) throw new Error(`Cloudflare records failed: ${(data.errors || []).map(e => e.message).join("; ")}`);
    existing.push(...(data.result || []));
    const info = data.result_info || {};
    if (page >= Number(info.total_pages || 1)) break;
    page += 1;
    if (page > 50) break;
  }

  const existingExact = new Set();
  const existingByHostType = new Set();
  for (const r of existing) {
    const type = String(r.type).toUpperCase();
    existingByHostType.add(`${type}|${r.name}`);
    const content = type === "TXT" ? unquoteTxt(r.content) : String(r.content ?? "");
    existingExact.add(`${type}|${r.name}|${content}|${type === "MX" ? r.priority || "" : ""}`);
  }

  const actions = [];
  for (const record of records) {
    const type = String(record.type || "").toUpperCase();
    const name = String(record.name || "").replace(/\.$/, "");
    if (!APPLY_TYPES.has(type)) {
      actions.push({ action: "skip", name, type, value: record.value, reason: "Type not supported by the apply API (MVP)" });
      continue;
    }
    if (!name || !record.value) {
      actions.push({ action: "skip", name, type, value: record.value, reason: "Missing name or value" });
      continue;
    }
    const candidate = { ...record, type, name };
    if (existingExact.has(keyFor(candidate))) {
      actions.push({ action: "skip", name, type, value: record.value, reason: "Identical record already exists" });
      continue;
    }
    if (existingByHostType.has(`${type}|${name}`)) {
      actions.push({ action: "conflict", name, type, value: record.value, reason: "A record with this name and type already exists with a different value" });
      continue;
    }
    actions.push({ action: "create", name, type, value: record.value, priority: record.priority || "", ttl: record.ttl || 600, proxied: !!record.proxied });
  }

  const summary = {
    create: actions.filter(a => a.action === "create").length,
    skip: actions.filter(a => a.action === "skip").length,
    conflict: actions.filter(a => a.action === "conflict").length,
  };

  if (!apply) return { applied: false, zoneId: zone.id, domain: zone.name, summary, actions };

  const results = [];
  for (const action of actions) {
    if (action.action !== "create") continue;
    const body = {
      type: action.type,
      name: action.name,
      content: action.type === "TXT" ? unquoteTxt(action.value) : action.value,
      ttl: Math.max(Number(action.ttl) || 600, 60),
    };
    if (action.type === "MX") body.priority = Number(action.priority) || 10;
    if (["A", "AAAA", "CNAME"].includes(action.type)) body.proxied = !!action.proxied;
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    results.push({
      name: action.name,
      type: action.type,
      value: action.value,
      ok: !!data.success,
      id: data.result ? data.result.id : null,
      error: data.success ? null : (data.errors || []).map(e => `${e.code}: ${e.message}`).join("; "),
    });
  }
  return { applied: true, zoneId: zone.id, domain: zone.name, summary, created: results.filter(r => r.ok).length, results };
}

/* ---------- Semantic analysis (shared with CLI) ---------- */

function isDefaultLine(line) {
  return !line || /^(默认|default)$/i.test(String(line).trim());
}

export function analyzeMigration(records, targetKey = "cloudflare") {
  const target = PROVIDERS[targetKey] || PROVIDERS.cloudflare;
  const diffs = [];
  const groups = new Map();
  for (const r of records) {
    const key = `${r.name}|${r.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const [key, items] of groups) {
    const [name, type] = key.split("|");
    const lines = [...new Set(items.map(r => r.line || "默认"))];
    const nonDefault = lines.filter(l => !isDefaultLine(l));
    if (nonDefault.length) {
      const def = items.find(r => isDefaultLine(r.line));
      if (!def) diffs.push({ level: "approval", key: "lineNoDefault", name, type });
      if (target.lines) diffs.push({ level: "info", key: "lineKeep", name, type, lines: lines.join(", ") });
      else diffs.push({ level: "approval", key: "lineMerge", name, type, lines: nonDefault.join(", "), value: def ? def.value : items[0].value });
    }
    const weights = [...new Set(items.map(r => (r.weight || "").trim()).filter(w => w && w !== "0"))];
    if (weights.length && !target.weights) diffs.push({ level: "approval", key: "weightDrop", name, type, weight: weights.join(", ") });
    for (const line of lines) {
      const sameLine = items.filter(r => (r.line || "默认") === line);
      if (sameLine.length > 1) diffs.push({ level: target.multiValue ? "info" : "error", key: "multiValue", name, type, count: sameLine.length });
    }
    for (const r of items) if (r.ttl && r.ttl > 1 && r.ttl < 60) diffs.push({ level: "info", key: "ttlLow", name, type, ttl: r.ttl });
  }
  const seen = new Set();
  return diffs.filter(d => {
    const k = `${d.key}|${d.name}|${d.type}|${JSON.stringify({ ...d, level: undefined })}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ---------- Verify (public DNS over HTTPS) ---------- */

const TYPE_NUM = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28, SRV: 33, CAA: 257 };

function normalizeTxtData(data) {
  const s = String(data ?? "");
  const parts = s.match(/"([^"\\]|\\.)*"/g);
  if (!parts) return s;
  return parts.map(p => p.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")).join("");
}

function normalizeDohAnswer(type, data) {
  if (type === "TXT") return normalizeTxtData(data);
  return String(data ?? "").trim().replace(/\.$/, "").toLowerCase();
}

function expectedDohValue(record) {
  const type = String(record.type || "").toUpperCase();
  if (type === "TXT") return unquoteTxt(record.value);
  if (type === "MX") {
    const host = String(record.value ?? "").trim().replace(/\.$/, "").toLowerCase();
    const pri = String(record.priority ?? "").trim();
    return pri ? `${pri} ${host}` : host;
  }
  return String(record.value ?? "").trim().replace(/\.$/, "").toLowerCase();
}

async function dohQuery(resolver, name, type) {
  const base = resolver === "8.8.8.8" ? "https://dns.google/resolve" : "https://cloudflare-dns.com/dns-query";
  const url = `${base}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) throw new Error(`DoH HTTP ${res.status}`);
  const data = await res.json();
  if (Number(data.Status) === 3) return [];
  const answers = data.Answer || [];
  return answers.filter(a => Number(a.type) === TYPE_NUM[type]).map(a => a.data);
}

export async function verifyRecords({ domain, records, resolver = "1.1.1.1" }) {
  if (!domain) throw new Error("domain is required");
  if (!Array.isArray(records) || !records.length) throw new Error("records must be a non-empty array");
  const supported = records.filter(r => TYPE_NUM[String(r.type || "").toUpperCase()]);
  const limited = supported.slice(0, 100);
  const details = [];

  for (let i = 0; i < limited.length; i += 5) {
    const batch = limited.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(async (record) => {
      const type = String(record.type).toUpperCase();
      // Proxied Cloudflare records do not expose their origin value: a proxied
      // CNAME answers with edge A records, and proxied A/AAAA answer with
      // Cloudflare edge IPs. For those, presence of an answer means matched.
      const proxied = !!record.proxied;
      const queryType = proxied && type === "CNAME" ? "A" : type;
      const expected = proxied ? "proxied → Cloudflare edge" : expectedDohValue(record);
      try {
        const answers = await dohQuery(resolver, record.name, queryType);
        const actual = answers.map(a => normalizeDohAnswer(queryType, a));
        let status;
        if (!actual.length) status = "pending";
        else if (proxied) status = "matched";
        else if (actual.some(a => a === expected || (type === "MX" && !String(record.priority ?? "").trim() && a.endsWith(" " + expected)))) status = "matched";
        else status = "mismatched";
        return { name: record.name, type, expected, actual, status, proxied };
      } catch (err) {
        return { name: record.name, type, expected, actual: [], status: "error", error: err instanceof Error ? err.message : String(err) };
      }
    }));
    details.push(...batchResults);
  }

  return {
    domain,
    resolver,
    checked: details.length,
    matched: details.filter(d => d.status === "matched").length,
    pending: details.filter(d => d.status === "pending").length,
    mismatched: details.filter(d => d.status === "mismatched").length,
    errors: details.filter(d => d.status === "error").length,
    details,
  };
}
