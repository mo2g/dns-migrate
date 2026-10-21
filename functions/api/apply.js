// Pages Function: POST /api/apply
// Creates DNS records in Cloudflare. Dry-run by default (apply=false).
// Credentials are used only for this request and are never stored or logged.

const APPLY_TYPES = new Set(["A", "AAAA", "CNAME", "MX", "TXT"]);
const MAX_RECORDS = 500;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function unquoteTxt(value) {
  const s = String(value ?? "");
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
  return s;
}

function keyFor(record) {
  const content = record.type === "TXT" ? unquoteTxt(record.value) : String(record.value || "");
  return `${record.type}|${record.name}|${content}|${record.type === "MX" ? record.priority || "" : ""}`;
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { token, accountId, domain, records, apply } = body;
  if (!token || !accountId || !domain) return json({ error: "token, accountId and domain are required" }, 400);
  if (!Array.isArray(records) || !records.length) return json({ error: "records must be a non-empty array" }, 400);
  if (records.length > MAX_RECORDS) return json({ error: `Too many records (max ${MAX_RECORDS} per request)` }, 400);

  try {
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
      existingByHostType.add(`${String(r.type).toUpperCase()}|${r.name}`);
      const type = String(r.type).toUpperCase();
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

    if (!apply) {
      return json({ applied: false, zoneId: zone.id, domain: zone.name, summary, actions });
    }

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

    const created = results.filter(r => r.ok).length;
    return json({ applied: true, zoneId: zone.id, domain: zone.name, summary, created, results });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
}
