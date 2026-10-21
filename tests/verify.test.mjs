import { verifyRecords } from "../shared/providers.js";

const responses = {
  "www.example.com|A": [{ type: 1, data: "203.0.113.10" }],
  "mail.example.com|MX": [{ type: 15, data: "10 aspmx.l.google.com." }],
  "txt.example.com|TXT": [{ type: 16, data: '"v=spf1 -all"' }],
  "missing.example.com|A": [],
  "wrong.example.com|A": [{ type: 1, data: "198.51.100.1" }],
  "proxied.example.com|A": [{ type: 1, data: "104.21.1.1" }],
};

globalThis.fetch = async (url) => {
  const u = new URL(url);
  const name = u.searchParams.get("name");
  const type = u.searchParams.get("type");
  const key = `${name}|${type}`;
  if (key === "error.example.com|A") return new Response("boom", { status: 500 });
  return new Response(JSON.stringify({ Status: 0, Answer: responses[key] || [] }), {
    status: 200,
    headers: { "Content-Type": "application/dns-json" },
  });
};

const records = [
  { name: "www.example.com", type: "A", value: "203.0.113.10", ttl: 600 },
  { name: "mail.example.com", type: "MX", value: "aspmx.l.google.com.", priority: "10", ttl: 600 },
  { name: "txt.example.com", type: "TXT", value: '"v=spf1 -all"', ttl: 600 },
  { name: "missing.example.com", type: "A", value: "203.0.113.20", ttl: 600 },
  { name: "wrong.example.com", type: "A", value: "203.0.113.30", ttl: 600 },
  { name: "error.example.com", type: "A", value: "203.0.113.40", ttl: 600 },
  { name: "proxied.example.com", type: "CNAME", value: "site.pages.dev", proxied: true, ttl: 600 },
];

const result = await verifyRecords({ domain: "example.com", records, resolver: "1.1.1.1" });
console.log(JSON.stringify({
  checked: result.checked,
  matched: result.matched,
  pending: result.pending,
  mismatched: result.mismatched,
  errors: result.errors,
  details: result.details.map(d => `${d.name} ${d.type}: ${d.status}`),
}, null, 2));

if (result.matched !== 4 || result.pending !== 1 || result.mismatched !== 1 || result.errors !== 1) {
  console.error("FAIL: unexpected verify summary");
  process.exit(1);
}
console.log("verify test passed");
