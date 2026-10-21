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

## Phase 3 — API mode (optional)

- [ ] Cloudflare Pages Functions proxy (no CORS issues)
- [ ] User-supplied tokens (never stored)
- [ ] Read from source / preview / apply / verify
- [ ] Rate limiting and audit log

## Phase 4 — Product

- [ ] CLI companion
- [ ] Multi-zone / bulk migration
- [ ] Multi-tenant MSP mode (paid)
