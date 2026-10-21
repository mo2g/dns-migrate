"use strict";

const SUPPORTED = new Set(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"]);
const KNOWN_TYPES = new Set([
  ...SUPPORTED,
  "SOA", "PTR", "SPF", "ALIAS", "ANAME", "DNSKEY", "DS", "NAPTR", "TLSA", "HTTPS", "SVCB",
]);

const EXAMPLE_ZONE = `$ORIGIN example.com.
$TTL 600
@       IN A       203.0.113.10
www     IN A       203.0.113.10
mail    IN A       203.0.113.20
@       IN MX 10   aspmx.l.google.com.
@       IN MX 20   alt1.aspmx.l.google.com.
@       IN TXT     "v=spf1 include:_spf.example.com -all"
_dmarc  IN TXT     "v=DMARC1; p=quarantine"
api     IN CNAME   api.example.net.
@       IN CAA 0 issue "letsencrypt.org"`;

const state = { records: [], warnings: [], defaultTtl: 600, origin: "" };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function stripComment(line) {
  let inQuote = false;
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if ((ch === '"' || ch === "'") && (i === 0 || line[i - 1] !== "\\")) {
      if (!inQuote) { inQuote = true; quote = ch; }
      else if (ch === quote) { inQuote = false; }
    } else if (ch === ";" && !inQuote) {
      return line.slice(0, i);
    }
  }
  return line;
}

function mergeBracketLines(lines) {
  const out = [];
  let buffer = "";
  let depth = 0;
  for (const raw of lines) {
    const line = stripComment(raw);
    if (!buffer && !line.trim()) continue;
    let inQuote = false;
    let quote = "";
    let opens = 0, closes = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if ((ch === '"' || ch === "'") && (i === 0 || line[i - 1] !== "\\")) {
        if (!inQuote) { inQuote = true; quote = ch; }
        else if (ch === quote) { inQuote = false; }
      } else if (!inQuote) {
        if (ch === "(") opens++;
        if (ch === ")") closes++;
      }
    }
    depth += opens - closes;
    buffer += (buffer ? " " : "") + line.trim();
    if (depth <= 0) { out.push(buffer); buffer = ""; depth = 0; }
  }
  if (buffer.trim()) out.push(buffer);
  return out;
}

function expandName(name, origin) {
  if (!name || name === "@") return origin ? origin.replace(/\.$/, "") + "." : "@";
  if (name.endsWith(".")) return name;
  if (origin) return `${name}.${origin.replace(/\.$/, "")}.`;
  return name + ".";
}

function parseZone(text) {
  const records = [];
  const warnings = [];
  let origin = "";
  let defaultTtl = 600;
  let lastOwner = "";

  const lines = mergeBracketLines(text.split(/\r?\n/));
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^\$ORIGIN\s+/i.test(line)) { origin = line.split(/\s+/)[1]; continue; }
    if (/^\$TTL\s+/i.test(line)) {
      const ttl = parseInt(line.split(/\s+/)[1], 10);
      if (!Number.isNaN(ttl)) defaultTtl = ttl;
      continue;
    }
    if (/^\$INCLUDE\s+/i.test(line)) {
      warnings.push({ level: "warn", text: "$INCLUDE is not supported — include its contents manually." });
      continue;
    }

    const tokens = line.split(/\s+/);
    let typeIndex = -1;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i].toUpperCase();
      if (KNOWN_TYPES.has(t)) { typeIndex = i; break; }
      if (t === "IN" || /^\d+$/.test(t)) continue;
    }
    if (typeIndex === -1) {
      warnings.push({ level: "warn", text: `Could not identify a record type: ${line.slice(0, 80)}` });
      continue;
    }

    const type = tokens[typeIndex].toUpperCase();
    let owner = tokens[0];
    if (/^(\d+|IN)$/i.test(owner) || KNOWN_TYPES.has(owner.toUpperCase())) owner = lastOwner;
    lastOwner = owner || lastOwner;

    let ttl = defaultTtl;
    for (let i = 1; i < typeIndex; i++) {
      if (/^\d+$/.test(tokens[i])) ttl = parseInt(tokens[i], 10);
    }

    let valueTokens = tokens.slice(typeIndex + 1);
    let priority = "";
    if (type === "MX" && valueTokens.length >= 2 && /^\d+$/.test(valueTokens[0])) {
      priority = valueTokens[0];
      valueTokens = valueTokens.slice(1);
    }
    const value = valueTokens.join(" ");
    const name = expandName(owner, origin);

    const record = { name, type, ttl, priority, value, owner: owner || "@" };
    if (!SUPPORTED.has(type)) {
      record.note = "Not supported by this MVP — excluded from export";
      warnings.push({ level: "warn", text: `${name} ${type}: not supported by the MVP exporter; it will be excluded from the generated zone file.` });
    }
    records.push(record);
  }

  // Validation
  const byName = new Map();
  for (const r of records) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  for (const [name, items] of byName) {
    const cname = items.filter(r => r.type === "CNAME");
    if (cname.length && items.length > 1) {
      warnings.push({ level: "error", text: `${name}: CNAME cannot coexist with other record types (found ${items.map(x => x.type).join(", ")}).` });
      items.forEach(r => { if (r.type === "CNAME") r.note = "Conflicts with other records at this name"; });
    }
    const seen = new Set();
    for (const r of items) {
      const key = `${r.type}|${r.value}|${r.priority}`;
      if (seen.has(key)) warnings.push({ level: "warn", text: `${name} ${r.type}: duplicate record (${r.value}).` });
      seen.add(key);
    }
  }
  for (const r of records) {
    if (r.name.startsWith("*.")) {
      warnings.push({ level: "warn", text: `Wildcard record ${r.name} — confirm it does not accidentally cover hosts you did not intend to move.` });
    }
    if (r.type === "TXT" && r.value.replace(/^"|"$/g, "").length > 255) {
      warnings.push({ level: "warn", text: `${r.name} TXT: string may exceed the 255-character limit; split it into multiple quoted strings.` });
    }
  }
  if (!records.length) warnings.push({ level: "error", text: "No valid records were found." });

  return { records, warnings, defaultTtl, origin };
}

function render() {
  const typeFilter = $("typeFilter").value;
  const filter = $("filterInput").value.trim().toLowerCase();
  const visible = state.records.filter(r => {
    if (typeFilter && r.type !== typeFilter) return false;
    if (!filter) return true;
    return `${r.name} ${r.type} ${r.value}`.toLowerCase().includes(filter);
  });

  const types = [...new Set(state.records.map(r => r.type))].sort();
  $("typeFilter").innerHTML = '<option value="">All types</option>' + types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  $("typeFilter").value = typeFilter;

  $("stats").innerHTML = [
    ["Records", state.records.length],
    ["Types", types.length],
    ["Warnings", state.warnings.filter(w => w.level === "warn").length],
    ["Errors", state.warnings.filter(w => w.level === "error").length],
  ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join("");

  $("warnings").innerHTML = state.warnings.length
    ? state.warnings.map(w => `<div class="warnitem ${w.level === "error" ? "error" : ""}">${esc(w.text)}</div>`).join("")
    : '<div class="warnitem" style="background:#f0fdf4;border-color:#86efac;color:#166534">No warnings — records look clean.</div>';

  $("recordsTable").querySelector("tbody").innerHTML = visible.map(r => `
    <tr>
      <td>${esc(r.name)}</td>
      <td class="type">${esc(r.type)}</td>
      <td>${esc(r.ttl)}</td>
      <td>${esc(r.priority ? `${r.priority} ${r.value}` : r.value || "—")}</td>
      <td class="note">${esc(r.note || "")}</td>
    </tr>`).join("");
  $("parseState").textContent = `${state.records.length} record(s) parsed`;
  $("parseState").className = "state ok";
  $("resultsCard").hidden = false;
  $("exportCard").hidden = false;
}

function parseAndRender() {
  const text = $("zoneInput").value;
  if (!text.trim()) {
    $("parseState").textContent = "Paste or upload a zone file first.";
    $("parseState").className = "state err";
    return;
  }
  const result = parseZone(text);
  state.records = result.records;
  state.warnings = result.warnings;
  state.defaultTtl = result.defaultTtl;
  state.origin = result.origin;
  render();
}

function toBind() {
  const lines = ["; Exported by DNS Migrate", `; ${state.records.length} parsed record(s)`, `$TTL ${state.defaultTtl}`];
  for (const r of state.records) {
    if (!SUPPORTED.has(r.type)) continue;
    const owner = r.name.endsWith(".") ? r.name : r.name + ".";
    if (r.type === "MX" && r.priority) {
      lines.push(`${owner} ${r.ttl} IN MX ${r.priority} ${r.value}`);
    } else {
      lines.push(`${owner} ${r.ttl} IN ${r.type} ${r.value}`);
    }
  }
  return lines.join("\n") + "\n";
}

function toCsv() {
  const escCsv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["name", "type", "ttl", "priority", "value", "notes"]];
  for (const r of state.records) rows.push([r.name, r.type, r.ttl, r.priority, r.value, r.note || ""]);
  return rows.map(row => row.map(escCsv).join(",")).join("\n");
}

function download(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("parseBtn").addEventListener("click", parseAndRender);
$("loadExample").addEventListener("click", () => { $("zoneInput").value = EXAMPLE_ZONE; parseAndRender(); });
$("clearBtn").addEventListener("click", () => {
  $("zoneInput").value = "";
  state.records = []; state.warnings = [];
  $("resultsCard").hidden = true; $("exportCard").hidden = true;
  $("parseState").textContent = "";
});
$("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { $("zoneInput").value = String(reader.result || ""); parseAndRender(); };
  reader.readAsText(file);
});
$("filterInput").addEventListener("input", render);
$("typeFilter").addEventListener("change", render);
$("downloadBind").addEventListener("click", () => {
  const domain = (state.origin || "zone").replace(/\.$/, "").replace(/[^a-z0-9.-]/gi, "") || "zone";
  download(`${domain}.cloudflare.zone`, toBind());
});
$("downloadCsv").addEventListener("click", () => {
  const domain = (state.origin || "zone").replace(/\.$/, "").replace(/[^a-z0-9.-]/gi, "") || "zone";
  download(`${domain}.records.csv`, toCsv(), "text/csv");
});
