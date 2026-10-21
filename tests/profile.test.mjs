import { retargetRecords, toProfile, expandProfile } from "../shared/providers.js";

const source = [
  { name: "a.asia.", type: "A", value: "203.0.113.10", ttl: 600, proxied: true },
  { name: "www.a.asia.", type: "CNAME", value: "a.asia.", ttl: 600, proxied: true },
  { name: "mail.a.asia.", type: "MX", value: "aspmx.l.google.com.", priority: "10", ttl: 600 },
  { name: "_dmarc.a.asia.", type: "TXT", value: '"v=DMARC1; p=quarantine"', ttl: 600 },
  { name: "external.example.net.", type: "CNAME", value: "a.asia.", ttl: 600 },
];

const retargeted = retargetRecords(source, "a.asia", "b.asia");
const rt = Object.fromEntries(retargeted.map(r => [r.name, r]));
if (rt["b.asia."]?.type !== "A") throw new Error("apex retarget failed");
if (rt["www.b.asia."]?.value !== "b.asia.") throw new Error("subdomain/value retarget failed");
if (rt["mail.b.asia."]?.priority !== "10") throw new Error("MX retarget failed");
if (!retargeted.some(r => r.name === "external.example.net." && r.value === "b.asia.")) throw new Error("outside-zone record should keep its name but have values rewritten");

const profile = toProfile(source, "a.asia", "annual-site");
const byRel = Object.fromEntries(profile.records.map(r => [r.name, r]));
if (byRel["@"]?.type !== "A") throw new Error("profile apex failed");
if (byRel["www"]?.value !== "{{domain}}.") throw new Error("profile value placeholder failed");
if (profile.sourceDomain !== "a.asia" || profile.records.length !== 5) throw new Error("profile metadata failed");

const expanded = expandProfile(profile, "c.asia");
const ex = Object.fromEntries(expanded.map(r => [r.name, r]));
if (ex["c.asia."]?.type !== "A") throw new Error("expand apex failed");
if (ex["www.c.asia."]?.value !== "c.asia.") throw new Error("expand value failed");
if (ex["mail.c.asia."]?.priority !== "10") throw new Error("expand MX failed");

console.log("profile test passed:", { retargeted: retargeted.length, profileRecords: profile.records.length, expanded: expanded.length });
