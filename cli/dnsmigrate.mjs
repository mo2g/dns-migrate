#!/usr/bin/env node
// DNS Migrate CLI — export, plan, apply and bulk migrate DNS zones.
// Credentials come from environment variables and are never written to disk.

import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import {
  exportCloudflare,
  exportDnspod,
  applyCloudflare,
  analyzeMigration,
} from "../shared/providers.js";

const env = process.env;

const HELP = `DNS Migrate CLI

Usage:
  dnsmigrate export --provider <cloudflare|dnspod> --domain <domain> [--out file] [--format json|bind]
  dnsmigrate plan   --source <cloudflare|dnspod> --domain <domain> [--target cloudflare]
  dnsmigrate apply  --target cloudflare --domain <domain> --records <file> [--yes]
  dnsmigrate migrate --source <dnspod|cloudflare> --target cloudflare --domains a.com,b.com [--yes]
  dnsmigrate migrate --source dnspod --target cloudflare --domains-file domains.txt [--yes]

Credentials (environment variables):
  CF_API_TOKEN / CF_ACCOUNT_ID                 Cloudflare API token and account ID
  DNSPOD_SECRET_ID / DNSPOD_SECRET_KEY         Tencent Cloud CAM key for DNSPod

Safety:
  apply and migrate are dry-run unless --yes is passed.
  Use least-privilege tokens. No credentials are logged or stored.
`;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function requireEnv(name) {
  if (!env[name]) fail(`missing environment variable ${name}`);
  return env[name];
}

function sourceProvider(name) {
  if (name === "cloudflare") {
    return {
      provider: "cloudflare",
      export: () => exportCloudflare({
        token: requireEnv("CF_API_TOKEN"),
        accountId: requireEnv("CF_ACCOUNT_ID"),
        domain: "",
      }),
    };
  }
  if (name === "dnspod") {
    return {
      provider: "dnspod",
      export: () => exportDnspod({
        secretId: requireEnv("DNSPOD_SECRET_ID"),
        secretKey: requireEnv("DNSPOD_SECRET_KEY"),
        domain: "",
      }),
    };
  }
  fail(`unsupported source provider: ${name}`);
}

async function fetchRecords(provider, domain) {
  if (provider === "cloudflare") {
    return exportCloudflare({ token: requireEnv("CF_API_TOKEN"), accountId: requireEnv("CF_ACCOUNT_ID"), domain });
  }
  if (provider === "dnspod") {
    return exportDnspod({ secretId: requireEnv("DNSPOD_SECRET_ID"), secretKey: requireEnv("DNSPOD_SECRET_KEY"), domain });
  }
  fail(`unsupported source provider: ${provider}`);
}

function isDefault(line) {
  return !line || /^(默认|default)$/i.test(String(line).trim());
}

function exportableRecords(records, target = "cloudflare") {
  if (target !== "cloudflare") return records;
  const groups = new Map();
  for (const r of records) {
    const key = `${r.name}|${r.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  for (const items of groups.values()) {
    const defs = items.filter(r => isDefault(r.line));
    if (defs.length) out.push(...defs);
    else out.push(...items);
  }
  return out;
}

function toBind(records, domain) {
  const lines = ["; Exported by DNS Migrate CLI", `; zone: ${domain}`, "$TTL 600"];
  for (const r of records) {
    const owner = r.name.endsWith(".") ? r.name : r.name + ".";
    if (r.type === "MX") lines.push(`${owner} ${r.ttl} IN MX ${r.priority || 10} ${r.value}`);
    else lines.push(`${owner} ${r.ttl} IN ${r.type} ${r.value}`);
  }
  return lines.join("\n") + "\n";
}

function describeDiff(d) {
  switch (d.key) {
    case "lineMerge":
      return `[needs approval] ${d.name} ${d.type}: lines ${d.lines} merged into the default line (keep ${d.value})`;
    case "lineKeep":
      return `[info] ${d.name} ${d.type}: multiple lines preserved (${d.lines})`;
    case "weightDrop":
      return `[needs approval] ${d.name} ${d.type}: weight ${d.weight} cannot be represented by the target`;
    case "multiValue":
      return `[info] ${d.name} ${d.type}: ${d.count} values on the same line kept as multi-value`;
    case "ttlLow":
      return `[info] ${d.name} ${d.type}: TTL ${d.ttl}s will be raised to 60s`;
    case "lineNoDefault":
      return `[needs approval] ${d.name} ${d.type}: no default line; first record used as fallback`;
    default:
      return `[${d.level}] ${JSON.stringify(d)}`;
  }
}

function printDiff(domain, records, target) {
  const diffs = analyzeMigration(records, target);
  console.log(`\n[${domain}] ${records.length} record(s); ${diffs.length} difference(s)`);
  for (const d of diffs) console.log(`  ${describeDiff(d)}`);
  return diffs;
}

async function cmdExport(values) {
  const provider = values.provider;
  const domain = values.domain;
  if (!provider || !domain) fail("export requires --provider and --domain");
  const data = await fetchRecords(provider, domain);
  const format = values.format || "json";
  if (format === "bind") {
    const text = toBind(data.records, data.domain || domain);
    if (values.out) await writeFile(values.out, text);
    else process.stdout.write(text);
  } else {
    const text = JSON.stringify(data, null, 2);
    if (values.out) await writeFile(values.out, text);
    else console.log(text);
  }
  if (values.out) console.log(`Exported ${data.records.length} record(s) to ${values.out}`);
}

async function cmdPlan(values) {
  const source = values.source;
  const domain = values.domain;
  if (!source || !domain) fail("plan requires --source and --domain");
  const data = await fetchRecords(source, domain);
  printDiff(data.domain || domain, data.records, values.target || "cloudflare");
}

async function cmdApply(values) {
  const domain = values.domain;
  const file = values.records;
  if (!domain || !file) fail("apply requires --domain and --records");
  const target = values.target || "cloudflare";
  if (target !== "cloudflare") fail("apply currently supports Cloudflare targets only");
  const payload = JSON.parse(await readFile(file, "utf8"));
  const records = Array.isArray(payload) ? payload : payload.records;
  if (!Array.isArray(records) || !records.length) fail("no records found in file");
  const result = await applyCloudflare({
    token: requireEnv("CF_API_TOKEN"),
    accountId: requireEnv("CF_ACCOUNT_ID"),
    domain,
    records: exportableRecords(records, target),
    apply: !!values.yes,
  });
  console.log(JSON.stringify({ applied: result.applied, summary: result.summary, created: result.created ?? 0 }, null, 2));
  if (result.actions) {
    for (const a of result.actions) console.log(`  [${a.action}] ${a.name} ${a.type} ${a.value} — ${a.reason}`);
  }
  if (result.results) {
    for (const r of result.results) console.log(`  [${r.ok ? "created" : "failed"}] ${r.name} ${r.type}${r.error ? " — " + r.error : ""}`);
  }
  if (!values.yes) console.log("\nDry-run only. Re-run with --yes to write these records.");
}

async function cmdMigrate(values) {
  const source = values.source;
  const target = values.target || "cloudflare";
  if (!source) fail("migrate requires --source");
  if (target !== "cloudflare") fail("migrate currently supports Cloudflare targets only");
  let domains = [];
  if (values.domains) domains = values.domains.split(",").map(d => d.trim()).filter(Boolean);
  if (values["domains-file"]) {
    const text = await readFile(values["domains-file"], "utf8");
    domains = domains.concat(text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#")));
  }
  domains = [...new Set(domains)];
  if (!domains.length) fail("migrate requires --domains or --domains-file");

  let failures = 0;
  for (const domain of domains) {
    try {
      const data = await fetchRecords(source, domain);
      printDiff(data.domain || domain, data.records, target);
      const records = exportableRecords(data.records, target);
      const result = await applyCloudflare({
        token: requireEnv("CF_API_TOKEN"),
        accountId: requireEnv("CF_ACCOUNT_ID"),
        domain: data.domain || domain,
        records,
        apply: !!values.yes,
      });
      console.log(`  → planned: create ${result.summary.create}, skip ${result.summary.skip}, conflict ${result.summary.conflict}${values.yes ? `; created ${result.created}` : " (dry-run)"}`);
    } catch (err) {
      failures += 1;
      console.error(`  [${domain}] FAILED: ${err.message}`);
    }
  }
  if (!values.yes) console.log("\nDry-run only. Re-run with --yes to write records.");
  if (failures) process.exit(1);
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        provider: { type: "string" },
        source: { type: "string" },
        target: { type: "string" },
        domain: { type: "string" },
        domains: { type: "string" },
        "domains-file": { type: "string" },
        out: { type: "string" },
        format: { type: "string" },
        records: { type: "string" },
        yes: { type: "boolean", default: false },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (err) {
    fail(err.message);
  }
  const { values, positionals } = parsed;
  const cmd = positionals[0];
  if (!cmd || values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (cmd === "export") return cmdExport(values);
  if (cmd === "plan") return cmdPlan(values);
  if (cmd === "apply") return cmdApply(values);
  if (cmd === "migrate") return cmdMigrate(values);
  fail(`unknown command: ${cmd}\n\n${HELP}`);
}

main().catch(err => fail(err.message));
