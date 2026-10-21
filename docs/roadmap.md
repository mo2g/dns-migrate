# Roadmap

## Phase 1 — Static MVP (current)

- [x] BIND zone parser (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA)
- [x] Record table + statistics
- [x] Basic validation warnings
- [x] Cloudflare-compatible BIND export
- [x] CSV export
- [ ] Deployment to Cloudflare Pages

## Phase 2 — Migration safety layer (completed)

- [x] Provider capability matrix (DNSPod / Alibaba Cloud DNS / Cloudflare / Route53)
- [x] Import DNSPod CSV export (line/weight aware)
- [x] Semantic diff: line/weight/multi-value/TTL/proxy differences
- [x] Merge suggestions + "needs approval" items
- [x] HTML migration report (shareable with clients)
- [x] Pre-flight checklist (DNSSEC/CAA/NS/mail/zone deletion clock)

## Phase 3 — API mode (optional, MVP completed)

- [x] Cloudflare Pages Functions proxy (no CORS issues)
- [x] User-supplied tokens (never stored)
- [x] Read from source (DNSPod TC3 / Cloudflare) / preview / apply
- [x] Verify endpoint (post-apply public DNS check)
- [ ] Rate limiting and audit log

## Phase 4 — Product

- [x] CLI companion (`cli/dnsmigrate.mjs`: export / plan / apply / migrate)
- [x] Multi-zone / bulk migration (CLI)
- [x] DNS Profiles (domain-independent templates + cross-domain apply)
- [ ] Multi-tenant MSP mode (paid)
