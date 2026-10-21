# DNS Migrate

English | [中文](README.zh-CN.md)

**Safe DNS migration toolkit** — plan, diff, migrate and verify DNS zones between providers.

> Status: MVP (browser-only, static). Deployable to Cloudflare Pages with zero backend.

## Why

Moving DNS between providers is not a copy-paste job. Real migrations fail on:

- line/weight semantics that the target provider cannot represent (e.g. DNSPod ISP lines → Cloudflare has no GeoDNS on the free plan)
- multi-value records (several MX or TXT records with the same name) being falsely reported as conflicts
- provider-specific constructs (Cloudflare proxied records, `100::` redirect placeholders, Pages CNAMEs)
- validation records (`_dnsauth`, trust-provider, etc.) that may still be in use
- non-record prerequisites: DNSSEC/DS, CAA, nameserver assignment, registrar locks

DNS Migrate focuses on the **safety layer**: a readable diff report, a pre-flight checklist, and a verifiable migration plan — not just export/import.

## Current features

- Parse BIND zone files (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA)
- **Import DNSPod CSV exports (line and weight aware)**
- **Provider capability matrix** (Cloudflare / DNSPod / Alibaba Cloud DNS / Route 53)
- **Semantic migration diff**: line merges, dropped weights, multi-value records, low TTLs
- **Merge suggestions with "needs approval" items**
- Record table with type statistics and line information
- Validation warnings (CNAME conflicts per line, wildcard records, duplicates, unsupported types)
- Export a Cloudflare-compatible BIND zone file (default-line merge policy applied)
- Export a CSV of parsed records
- Export a shareable HTML migration report (diff + warnings + checklist)
- EN / 中文 interface switch
- 100% client-side: no data leaves the browser, no API tokens involved

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

- Provider capability matrix (DNSPod, Alibaba Cloud DNS, Cloudflare, Route53)
- Semantic diff report (line/weight merge suggestions)
- Pre-flight checklist (DNSSEC/CAA/NS/mail/zone deletion clock)
- Optional Pages Functions proxy for API-based read/write with user-supplied tokens
- CLI companion

## Run locally

```bash
cd dns-migrate
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy to Cloudflare Pages

Create a Pages project and upload the repository root (no build step), or:

```bash
npx wrangler pages deploy . --project-name dns-migrate
```

## License

MIT — see [LICENSE](LICENSE).
