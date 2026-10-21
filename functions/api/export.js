// Pages Function: POST /api/export
// Reads DNS records from Cloudflare or DNSPod using user-supplied credentials.
// Credentials are used only for this request and are never stored or logged.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const provider = String(body.provider || "").toLowerCase();
  try {
    if (provider === "cloudflare") return json(await exportCloudflare(body));
    if (provider === "dnspod") return json(await exportDnspod(body));
    return json({ error: `Unsupported provider: ${provider}` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
}

function quoteTxt(value) {
  const s = String(value ?? "");
  if (s.startsWith('"') && s.endsWith('"')) return s;
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
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

async function exportCloudflare({ token, accountId, domain }) {
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

async function exportDnspod({ secretId, secretKey, domain }) {
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
