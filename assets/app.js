"use strict";

const SUPPORTED = new Set(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"]);
const KNOWN_TYPES = new Set([
  ...SUPPORTED,
  "SOA", "PTR", "SPF", "ALIAS", "ANAME", "DNSKEY", "DS", "NAPTR", "TLSA", "HTTPS", "SVCB",
]);

const PROVIDERS = {
  cloudflare: { label: "Cloudflare", lines: false, weights: false, proxy: true, multiValue: true },
  dnspod: { label: "DNSPod", lines: true, weights: true, proxy: false, multiValue: true },
  alidns: { label: "Alibaba Cloud DNS", lines: true, weights: true, proxy: false, multiValue: true },
  route53: { label: "AWS Route 53", lines: true, weights: true, proxy: false, multiValue: true },
};

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

const EXAMPLE_CSV = `主机记录,记录类型,线路类型,记录值,MX优先级,TTL,状态,权重
@,A,默认,203.0.113.10,,600,启用,
www,A,默认,203.0.113.10,,600,启用,
@,MX,默认,aspmx.l.google.com.,10,600,启用,
@,MX,默认,alt1.aspmx.l.google.com.,20,600,启用,
@,TXT,默认,"v=spf1 include:_spf.example.com -all",,600,启用,
api,CNAME,默认,api.example.net.,,600,启用,
apm,CNAME,默认,a-slb.example.com.,,600,启用,
apm,CNAME,境外,apm.example.com.w.cdngslb.com.,,600,启用,`;

const I18N = {
  en: {
    "title": "DNS Migrate — safe DNS migration toolkit",
    "hero.title": "Safe DNS migration toolkit",
    "hero.sub": "Parse a BIND zone file or a DNSPod CSV export, review semantic differences, and export a Cloudflare-ready zone file. Everything runs in your browser — no tokens, no uploads.",
    "hero.badge1": "Client-side only", "hero.badge2": "No API tokens", "hero.badge3": "MIT licensed",
    "mode.bind": "BIND zone file", "mode.csv": "DNSPod CSV", "mode.api": "API",
    "provider.target": "Target provider", "provider.zoneName": "Zone name",
    "api.title": "API mode (optional)",
    "api.sub": "Read records directly from your provider and write to Cloudflare. Credentials are used only for this request — never stored or logged.",
    "api.source": "Source provider", "api.sourceDomain": "Source domain", "api.targetDomain": "Target domain", "api.targetPlaceholder": "same as source (copy)",
    "api.read": "Read records", "api.preview": "Preview write (dry-run)", "api.apply": "Apply to Cloudflare",
    "api.security": "Use least-privilege tokens. Credentials are sent only to this site's /api endpoint, used for this request, and never stored or logged.",
    "api.reading": "Reading records from {provider}…", "api.readOk": "Loaded {count} record(s) from {provider}.",
    "api.readErr": "Read failed: {error}", "api.previewing": "Building dry-run plan…",
    "api.previewOk": "Dry-run: {create} to create, {skip} skipped, {conflict} conflicts.",
    "api.applyConfirm": "Create {count} record(s) in Cloudflare? This changes live DNS.",
    "api.applying": "Applying to Cloudflare…", "api.applyOk": "Created {created} record(s).",
    "api.applyErr": "Apply failed: {error}", "api.error": "Error: {error}",
    "api.disabled": "Skipped {count} disabled record(s) from the source.",
    "api.create": "create", "api.skip": "skip", "api.conflict": "conflict", "api.plan": "Dry-run plan", "api.results": "Apply results",
    "api.verify": "Verify DNS", "api.verifying": "Checking public DNS…",
    "api.verifyOk": "Verified: {matched} matched, {pending} pending, {mismatched} mismatched, {errors} errors.",
    "api.verifyErr": "Verify failed: {error}", "api.verifyResults": "DNS verification results",
    "api.matched": "matched", "api.pending": "pending", "api.mismatched": "mismatched", "api.errorLabel": "error",
    "api.expected": "expected", "api.actual": "actual",
    "api.saveProfile": "Save as profile", "api.loadProfile": "Load profile",
    "api.profileSaved": "Profile saved: {name} ({count} records).",
    "api.profileLoaded": "Profile loaded: {name} ({count} records → {domain}).",
    "api.profileErr": "Profile error: {error}",
    "api.profileDomainRequired": "Enter a target domain before loading a profile.",
    "source.title": "1 · Source zone",
    "source.sub": "Paste/upload a BIND zone file or a DNSPod CSV export. Export it from your current DNS provider first.",
    "source.upload": "Upload file", "source.loadExample": "Load example", "source.clear": "Clear",
    "source.placeholder": "$ORIGIN example.com.\n$TTL 600\n@    IN A      203.0.113.10\nwww  IN A      203.0.113.10",
    "source.parse": "Parse records",
    "state.empty": "Paste or upload a file first.",
    "state.parsed": "{count} record(s) parsed",
    "review.title": "2 · Review", "review.sub": "Check records, warnings and migration differences before exporting.",
    "review.filter": "Filter by name, type or value…", "review.allTypes": "All types",
    "stats.records": "Records", "stats.types": "Types", "stats.warnings": "Warnings", "stats.errors": "Errors",
    "warnings.clean": "No warnings — records look clean.",
    "table.name": "Name", "table.type": "Type", "table.ttl": "TTL", "table.line": "Line", "table.value": "Value", "table.notes": "Notes",
    "export.title": "3 · Export",
    "export.sub": "Download a Cloudflare-compatible BIND zone file, a CSV, or a shareable migration report.",
    "export.bind": "Download Cloudflare zone file", "export.csv": "Download CSV", "export.report": "Download migration report (HTML)", "export.profile": "Save as profile (JSON)",
    "export.hint": "Cloudflare: Dashboard → DNS → Records → Import. Non-default line records follow the merge policy (default line is exported; see migration differences).",
    "preflight.title": "Pre-flight checklist", "preflight.sub": "Items that cause most DNS migration incidents — verify each before switching nameservers.",
    "preflight.item1": "DNSSEC: confirm the old provider is unsigned and no stale DS records exist.",
    "preflight.item2": "CAA: confirm the target provider's certificate authorities are allowed.",
    "preflight.item3": "Nameservers: verify the target provider's assigned pair for each zone.",
    "preflight.item4": "Mail: MX, SPF, DKIM and DMARC records exist and match the current provider.",
    "preflight.item5": "Validation records: do not delete _dnsauth, trust-provider or similar records without checking certificate dependencies.",
    "preflight.item6": "Zone clock: free Cloudflare zones pending for more than 28 days are deleted — switch in time.",
    "preflight.item7": "Rollback: keep the old provider's records until the observation period ends.",
    "footer.left": "DNS Migrate · MVP", "footer.right": "Runs entirely in your browser · No data leaves this page",
    "warn.includeUnsupported": "$INCLUDE is not supported — include its contents manually.",
    "warn.cannotIdentify": "Could not identify a record type: {line}",
    "warn.unsupportedType": "{name} {type}: not supported by the MVP exporter; it will be excluded from the generated zone file.",
    "warn.duplicate": "{name} {type}: duplicate record ({value}).",
    "warn.wildcard": "Wildcard record {name} — confirm it does not accidentally cover hosts you did not intend to move.",
    "warn.txtTooLong": "{name} TXT: string may exceed the 255-character limit; split it into multiple quoted strings.",
    "warn.csvDisabled": "Skipped disabled record: {name} {type} ({value}).",
    "error.cnameConflict": "{name}: CNAME cannot coexist with other record types (found {types}).",
    "error.noRecords": "No valid records were found.",
    "error.csvNoZone": "Zone name is required for DNSPod CSV input.",
    "error.csvNoHeader": "CSV header not recognised. Expected columns such as 主机记录/记录类型/记录值.",
    "error.csvNoRecords": "No records parsed from the CSV.",
    "note.unsupported": "Not supported by this MVP — excluded from export", "note.cnameConflict": "Conflicts with other records at this name",
    "note.merged": "Excluded by line merge policy (default line kept)",
    "diff.title": "Migration differences", "diff.empty": "No semantic differences detected for this target.",
    "diff.approval": "Needs approval", "diff.error": "Error", "diff.info": "Info",
    "diff.lineMerge": "{name} {type}: lines {lines} will be merged into the default line (default kept: {value}). The target does not support per-line answers.",
    "diff.lineKeep": "{name} {type}: multiple lines ({lines}) will be preserved — target supports line routing.",
    "diff.weightDrop": "{name} {type}: weight {weight} cannot be represented by the target.",
    "diff.multiValue": "{name} {type}: {count} values on the same line will be kept as a multi-value record.",
    "diff.ttlLow": "{name} {type}: TTL {ttl}s is below 60s; the target may raise it to 60s.",
    "diff.lineNoDefault": "{name} {type}: no default line record found; first record will be used as the fallback.",
    "cap.lines": "lines", "cap.weights": "weights", "cap.proxy": "proxy", "cap.multiValue": "multi-value",
    "cap.supported": "supported", "cap.unsupported": "not supported",
    "report.title": "DNS Migration Report", "report.generated": "Generated", "report.domain": "Zone",
    "report.target": "Target provider", "report.summary": "Summary", "report.records": "Records",
    "report.types": "Record types", "report.warnings": "Warnings and errors", "report.differences": "Migration differences",
    "report.recordTable": "Parsed records", "report.checklist": "Pre-flight checklist",
    "report.disclaimer": "This report was generated by DNS Migrate from a zone file supplied by the user. Review every record before importing it into a production DNS provider.",
    "report.none": "None",
  },
  zh: {
    "title": "DNS Migrate — 安全的 DNS 迁移工具",
    "hero.title": "安全的 DNS 迁移工具",
    "hero.sub": "解析 BIND zone 文件或 DNSPod CSV 导出，检查语义差异，导出 Cloudflare 可用格式。全部在浏览器本地运行——不需要 Token，不上传任何数据。",
    "hero.badge1": "纯本地运行", "hero.badge2": "无需 API Token", "hero.badge3": "MIT 开源",
    "mode.bind": "BIND zone 文件", "mode.csv": "DNSPod CSV", "mode.api": "API",
    "provider.target": "目标服务商", "provider.zoneName": "Zone 域名",
    "api.title": "API 模式（可选）",
    "api.sub": "直接从源服务商读取记录并写入 Cloudflare。凭证仅用于本次请求——不存储、不记录日志。",
    "api.source": "源服务商", "api.sourceDomain": "源域名", "api.targetDomain": "目标域名", "api.targetPlaceholder": "与源域名相同（复制）",
    "api.read": "读取记录", "api.preview": "预演写入（Dry-run）", "api.apply": "写入 Cloudflare",
    "api.security": "请使用最小权限 Token。凭证只会发送到本站 /api 接口，用于本次请求，不存储、不记录日志。",
    "api.reading": "正在从 {provider} 读取记录…", "api.readOk": "已从 {provider} 读取 {count} 条记录。",
    "api.readErr": "读取失败：{error}", "api.previewing": "正在生成 Dry-run 计划…",
    "api.previewOk": "Dry-run：待创建 {create} 条，跳过 {skip} 条，冲突 {conflict} 条。",
    "api.applyConfirm": "将在 Cloudflare 创建 {count} 条记录，这会修改线上 DNS。确认继续？",
    "api.applying": "正在写入 Cloudflare…", "api.applyOk": "已创建 {created} 条记录。",
    "api.applyErr": "写入失败：{error}", "api.error": "错误：{error}",
    "api.disabled": "已跳过源端 {count} 条停用记录。",
    "api.create": "创建", "api.skip": "跳过", "api.conflict": "冲突", "api.plan": "Dry-run 计划", "api.results": "写入结果",
    "api.verify": "验证 DNS", "api.verifying": "正在检查公共 DNS…",
    "api.verifyOk": "验证结果：{matched} 匹配，{pending} 待生效，{mismatched} 不匹配，{errors} 错误。",
    "api.verifyErr": "验证失败：{error}", "api.verifyResults": "DNS 验证结果",
    "api.matched": "匹配", "api.pending": "待生效", "api.mismatched": "不匹配", "api.errorLabel": "错误",
    "api.expected": "期望", "api.actual": "实际",
    "api.saveProfile": "保存为模板", "api.loadProfile": "加载模板",
    "api.profileSaved": "模板已保存：{name}（{count} 条记录）。",
    "api.profileLoaded": "模板已加载：{name}（{count} 条记录 → {domain}）。",
    "api.profileErr": "模板错误：{error}",
    "api.profileDomainRequired": "加载模板前请先填写目标域名。",
    "source.title": "1 · 源 Zone",
    "source.sub": "粘贴/上传 BIND zone 文件或 DNSPod CSV 导出。请先从当前 DNS 服务商导出记录。",
    "source.upload": "上传文件", "source.loadExample": "加载示例", "source.clear": "清空",
    "source.placeholder": "$ORIGIN example.com.\n$TTL 600\n@    IN A      203.0.113.10\nwww  IN A      203.0.113.10",
    "source.parse": "解析记录",
    "state.empty": "请先粘贴或上传文件。",
    "state.parsed": "已解析 {count} 条记录",
    "review.title": "2 · 检查", "review.sub": "导出前检查记录、警告和迁移差异。",
    "review.filter": "按名称、类型或值筛选…", "review.allTypes": "全部类型",
    "stats.records": "记录数", "stats.types": "类型数", "stats.warnings": "警告", "stats.errors": "错误",
    "warnings.clean": "没有警告——记录看起来正常。",
    "table.name": "名称", "table.type": "类型", "table.ttl": "TTL", "table.line": "线路", "table.value": "值", "table.notes": "备注",
    "export.title": "3 · 导出",
    "export.sub": "下载 Cloudflare 兼容的 BIND 文件、CSV 清单，或可分享的迁移报告。",
    "export.bind": "下载 Cloudflare Zone 文件", "export.csv": "下载 CSV", "export.report": "下载迁移报告（HTML）", "export.profile": "保存为模板（JSON）",
    "export.hint": "Cloudflare：控制台 → DNS → Records → Import。非默认线路记录按合并策略处理（导出默认线路，详见迁移差异）。",
    "preflight.title": "迁移前检查清单", "preflight.sub": "以下事项是 DNS 迁移事故的高发原因——切换 NS 前请逐项确认。",
    "preflight.item1": "DNSSEC：确认旧服务商为 unsigned，且不存在残留 DS 记录。",
    "preflight.item2": "CAA：确认允许目标服务商使用的证书颁发机构。",
    "preflight.item3": "NS：逐 Zone 核对目标服务商分配的 NS 对。",
    "preflight.item4": "邮件：确认 MX、SPF、DKIM、DMARC 记录存在且与当前服务商一致。",
    "preflight.item5": "验证记录：未经证书依赖核查，不要删除 _dnsauth、trust-provider 等验证记录。",
    "preflight.item6": "Zone 时钟：Free 计划 pending 超过 28 天会被删除——请及时切换。",
    "preflight.item7": "回滚：观察期结束前保留旧服务商的记录。",
    "footer.left": "DNS Migrate · MVP", "footer.right": "完全在浏览器本地运行 · 数据不会离开本页",
    "warn.includeUnsupported": "不支持 $INCLUDE——请手动包含其内容。",
    "warn.cannotIdentify": "无法识别记录类型：{line}",
    "warn.unsupportedType": "{name} {type}：MVP 导出器不支持该类型，将从生成的 zone 文件中排除。",
    "warn.duplicate": "{name} {type}：重复记录（{value}）。",
    "warn.wildcard": "通配符记录 {name}——请确认它不会意外覆盖你不打算迁移的主机。",
    "warn.txtTooLong": "{name} TXT：字符串可能超过 255 字符限制，请拆分为多个带引号的字符串。",
    "warn.csvDisabled": "已跳过停用记录：{name} {type}（{value}）。",
    "error.cnameConflict": "{name}：CNAME 不能与其他类型共存（发现 {types}）。",
    "error.noRecords": "没有找到有效记录。",
    "error.csvNoZone": "CSV 模式需要填写 Zone 域名。",
    "error.csvNoHeader": "无法识别 CSV 表头。需要包含「主机记录/记录类型/记录值」等列。",
    "error.csvNoRecords": "CSV 中没有解析到记录。",
    "note.unsupported": "本 MVP 不支持——已排除导出", "note.cnameConflict": "与该名称下的其他记录冲突",
    "note.merged": "按线路合并策略排除（保留默认线路）",
    "diff.title": "迁移差异", "diff.empty": "未检测到针对该目标服务商的语义差异。",
    "diff.approval": "需确认", "diff.error": "错误", "diff.info": "提示",
    "diff.lineMerge": "{name} {type}：线路 {lines} 将合并到默认线路（保留默认值：{value}）。目标服务商不支持按线路解析。",
    "diff.lineKeep": "{name} {type}：多条线路（{lines}）将保留——目标服务商支持线路路由。",
    "diff.weightDrop": "{name} {type}：权重 {weight} 无法在目标服务商中表示。",
    "diff.multiValue": "{name} {type}：同一线路的 {count} 条值将作为多值记录保留。",
    "diff.ttlLow": "{name} {type}：TTL {ttl}s 低于 60s，目标服务商可能调整为 60s。",
    "diff.lineNoDefault": "{name} {type}：未找到默认线路记录，将使用第一条记录作为回退。",
    "cap.lines": "线路", "cap.weights": "权重", "cap.proxy": "代理", "cap.multiValue": "多值",
    "cap.supported": "支持", "cap.unsupported": "不支持",
    "report.title": "DNS 迁移报告", "report.generated": "生成时间", "report.domain": "Zone",
    "report.target": "目标服务商", "report.summary": "概览", "report.records": "记录数",
    "report.types": "记录类型", "report.warnings": "警告与错误", "report.differences": "迁移差异",
    "report.recordTable": "解析后的记录", "report.checklist": "迁移前检查清单",
    "report.disclaimer": "本报告由 DNS Migrate 根据用户提供的 zone 文件生成。导入生产 DNS 服务商前，请逐条检查所有记录。",
    "report.none": "无",
  },
};

let lang = "en";
try {
  const saved = localStorage.getItem("dnsmigrate-lang");
  if (saved && I18N[saved]) lang = saved;
  else if ((navigator.language || "").toLowerCase().startsWith("zh")) lang = "zh";
} catch (_) { /* ignore */ }

const state = {
  records: [], warnings: [], diffs: [],
  defaultTtl: 600, origin: "",
  mode: "bind", target: "cloudflare",
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function t(key, params) {
  const dict = I18N[lang] || I18N.en;
  let text = dict[key] ?? I18N.en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

function setLanguage(next) {
  lang = I18N[next] ? next : "en";
  try { localStorage.setItem("dnsmigrate-lang", lang); } catch (_) { /* ignore */ }
  applyLanguage();
  if (state.records.length) render();
}

function applyLanguage() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll(".lang-switch button").forEach(b => {
    b.classList.toggle("active", b.dataset.lang === lang);
    b.setAttribute("aria-pressed", b.dataset.lang === lang ? "true" : "false");
  });
  if (state.mode === "csv" && !$("zoneInput").value.trim()) {
    $("zoneInput").placeholder = "主机记录,记录类型,线路类型,记录值,MX优先级,TTL,状态,权重\n@,A,默认,203.0.113.10,,600,启用,\nwww,A,默认,203.0.113.10,,600,启用,";
  }
}

/* ---------- BIND parser ---------- */

function stripComment(line) {
  let inQuote = false, quote = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if ((ch === '"' || ch === "'") && (i === 0 || line[i - 1] !== "\\")) {
      if (!inQuote) { inQuote = true; quote = ch; } else if (ch === quote) { inQuote = false; }
    } else if (ch === ";" && !inQuote) return line.slice(0, i);
  }
  return line;
}

function mergeBracketLines(lines) {
  const out = []; let buffer = "", depth = 0;
  for (const raw of lines) {
    const line = stripComment(raw);
    if (!buffer && !line.trim()) continue;
    let inQuote = false, quote = "", opens = 0, closes = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if ((ch === '"' || ch === "'") && (i === 0 || line[i - 1] !== "\\")) {
        if (!inQuote) { inQuote = true; quote = ch; } else if (ch === quote) { inQuote = false; }
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
  const records = [], warnings = [];
  let origin = "", defaultTtl = 600, lastOwner = "";
  const lines = mergeBracketLines(text.split(/\r?\n/));
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^\$ORIGIN\s+/i.test(line)) { origin = line.split(/\s+/)[1]; continue; }
    if (/^\$TTL\s+/i.test(line)) { const ttl = parseInt(line.split(/\s+/)[1], 10); if (!Number.isNaN(ttl)) defaultTtl = ttl; continue; }
    if (/^\$INCLUDE\s+/i.test(line)) { warnings.push({ level: "warn", key: "warn.includeUnsupported" }); continue; }

    const tokens = line.split(/\s+/);
    let typeIndex = -1;
    for (let i = 0; i < tokens.length; i++) {
      const tt = tokens[i].toUpperCase();
      if (KNOWN_TYPES.has(tt)) { typeIndex = i; break; }
      if (tt === "IN" || /^\d+$/.test(tt)) continue;
    }
    if (typeIndex === -1) { warnings.push({ level: "warn", key: "warn.cannotIdentify", params: { line: line.slice(0, 80) } }); continue; }

    const type = tokens[typeIndex].toUpperCase();
    let owner = tokens[0];
    if (/^(\d+|IN)$/i.test(owner) || KNOWN_TYPES.has(owner.toUpperCase())) owner = lastOwner;
    lastOwner = owner || lastOwner;
    let ttl = defaultTtl;
    for (let i = 1; i < typeIndex; i++) if (/^\d+$/.test(tokens[i])) ttl = parseInt(tokens[i], 10);
    let valueTokens = tokens.slice(typeIndex + 1);
    let priority = "";
    if (type === "MX" && valueTokens.length >= 2 && /^\d+$/.test(valueTokens[0])) { priority = valueTokens[0]; valueTokens = valueTokens.slice(1); }
    const value = valueTokens.join(" ");
    const name = expandName(owner, origin);
    const record = { name, type, ttl, priority, value, owner: owner || "@", line: "默认", weight: "" };
    if (!SUPPORTED.has(type)) { record.noteKey = "note.unsupported"; warnings.push({ level: "warn", key: "warn.unsupportedType", params: { name, type } }); }
    records.push(record);
  }
  validate(records, warnings);
  return { records, warnings, defaultTtl, origin };
}

/* ---------- CSV parser ---------- */

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else field += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

function findColumn(headers, aliases) {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().toLowerCase();
    if (aliases.some(a => h === a.toLowerCase())) return i;
  }
  return -1;
}

function parseDnspodCsv(text, zoneName) {
  const records = [], warnings = [];
  if (!zoneName || !zoneName.trim()) {
    warnings.push({ level: "error", key: "error.csvNoZone" });
    return { records, warnings, origin: "", defaultTtl: 600 };
  }
  const rows = parseCsv(text);
  if (rows.length < 2) { warnings.push({ level: "error", key: "error.csvNoHeader" }); return { records, warnings, origin: zoneName, defaultTtl: 600 }; }

  const headers = rows[0];
  const col = {
    host: findColumn(headers, ["主机记录", "主机名", "host", "name"]),
    type: findColumn(headers, ["记录类型", "类型", "type"]),
    line: findColumn(headers, ["线路类型", "线路", "line"]),
    value: findColumn(headers, ["记录值", "值", "value", "content"]),
    priority: findColumn(headers, ["MX优先级", "优先级", "mx", "priority"]),
    ttl: findColumn(headers, ["TTL", "ttl"]),
    status: findColumn(headers, ["状态", "status", "是否启用", "enabled"]),
    weight: findColumn(headers, ["权重", "weight"]),
    comment: findColumn(headers, ["备注", "remark", "comment"]),
  };
  if (col.host < 0 || col.type < 0 || col.value < 0) {
    warnings.push({ level: "error", key: "error.csvNoHeader" });
    return { records, warnings, origin: zoneName, defaultTtl: 600 };
  }

  const zone = zoneName.trim().replace(/\.$/, "") + ".";
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const host = (row[col.host] || "").trim();
    const type = (row[col.type] || "").trim().toUpperCase();
    if (!host || !type) continue;
    const value = (row[col.value] || "").trim();
    const status = (col.status >= 0 ? (row[col.status] || "") : "").trim();
    if (/暂停|禁用|停用|disabled|paused/i.test(status)) {
      warnings.push({ level: "warn", key: "warn.csvDisabled", params: { name: expandName(host, zone), type, value } });
      continue;
    }
    if (!KNOWN_TYPES.has(type)) {
      warnings.push({ level: "warn", key: "warn.unsupportedType", params: { name: expandName(host, zone), type } });
    }
    const name = expandName(host, zone);
    const record = {
      name, type,
      ttl: col.ttl >= 0 && row[col.ttl] ? (parseInt(row[col.ttl], 10) || 600) : 600,
      priority: col.priority >= 0 ? (row[col.priority] || "").trim() : "",
      value,
      line: col.line >= 0 ? ((row[col.line] || "").trim() || "默认") : "默认",
      weight: col.weight >= 0 ? (row[col.weight] || "").trim() : "",
      owner: host,
      comment: col.comment >= 0 ? (row[col.comment] || "").trim() : "",
    };
    if (!SUPPORTED.has(type)) record.noteKey = "note.unsupported";
    records.push(record);
  }
  if (!records.length) warnings.push({ level: "error", key: "error.csvNoRecords" });
  validate(records, warnings);
  return { records, warnings, origin: zone, defaultTtl: 600 };
}

/* ---------- Validation + semantic diff ---------- */

function validate(records, warnings) {
  // CNAME conflicts are checked per name + line: DNSPod permits the same name
  // to have different CNAME targets on different lines, but a single line
  // cannot mix CNAME with other record types.
  const byNameLine = new Map();
  for (const r of records) {
    const key = `${r.name}|${r.line || "默认"}`;
    if (!byNameLine.has(key)) byNameLine.set(key, []);
    byNameLine.get(key).push(r);
  }
  for (const [key, items] of byNameLine) {
    const name = key.split("|")[0];
    const cname = items.filter(r => r.type === "CNAME");
    if (cname.length && items.length > 1) {
      warnings.push({ level: "error", key: "error.cnameConflict", params: { name, types: items.map(x => x.type).join(", ") } });
      items.forEach(r => { if (r.type === "CNAME") r.noteKey = "note.cnameConflict"; });
    }
    const seen = new Set();
    for (const r of items) {
      const dk = `${r.type}|${r.value}|${r.priority}`;
      if (seen.has(dk)) warnings.push({ level: "warn", key: "warn.duplicate", params: { name, type: r.type, value: r.value } });
      seen.add(dk);
    }
  }
  for (const r of records) {
    if (r.name.startsWith("*.")) warnings.push({ level: "warn", key: "warn.wildcard", params: { name: r.name } });
    if (r.type === "TXT" && r.value.replace(/^"|"$/g, "").length > 255) {
      warnings.push({ level: "warn", key: "warn.txtTooLong", params: { name: r.name } });
    }
  }
  if (!records.length) warnings.push({ level: "error", key: "error.noRecords" });
}

function isDefaultLine(line) {
  return !line || /^(默认|default)$/i.test(line.trim());
}

function analyzeMigration(records, targetKey) {
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
      const defaultRec = items.find(r => isDefaultLine(r.line));
      if (!defaultRec) {
        diffs.push({ level: "approval", key: "diff.lineNoDefault", params: { name, type } });
      }
      if (target.lines) {
        diffs.push({ level: "info", key: "diff.lineKeep", params: { name, type, lines: lines.join(", ") } });
      } else {
        diffs.push({
          level: "approval",
          key: "diff.lineMerge",
          params: { name, type, lines: nonDefault.join(", "), value: defaultRec ? defaultRec.value : items[0].value },
        });
      }
    }

    const weights = [...new Set(items.map(r => (r.weight || "").trim()).filter(w => w && w !== "0"))];
    if (weights.length && !target.weights) {
      diffs.push({ level: "approval", key: "diff.weightDrop", params: { name, type, weight: weights.join(", ") } });
    }

    for (const line of lines) {
      const sameLine = items.filter(r => (r.line || "默认") === line);
      if (sameLine.length > 1) {
        diffs.push({ level: target.multiValue ? "info" : "error", key: "diff.multiValue", params: { name, type, count: sameLine.length } });
      }
    }

    for (const r of items) {
      if (r.ttl && r.ttl > 1 && r.ttl < 60) diffs.push({ level: "info", key: "diff.ttlLow", params: { name, type, ttl: r.ttl } });
    }
  }

  const seen = new Set();
  return diffs.filter(d => {
    const k = `${d.key}|${JSON.stringify(d.params || {})}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ---------- Rendering ---------- */

function render() {
  state.target = $("targetProvider").value;
  state.diffs = analyzeMigration(state.records, state.target);

  const typeFilter = $("typeFilter").value;
  const filter = $("filterInput").value.trim().toLowerCase();
  const visible = state.records.filter(r => {
    if (typeFilter && r.type !== typeFilter) return false;
    if (!filter) return true;
    return `${r.name} ${r.type} ${r.value} ${r.line || ""}`.toLowerCase().includes(filter);
  });

  const types = [...new Set(state.records.map(r => r.type))].sort();
  $("typeFilter").innerHTML = `<option value="">${esc(t("review.allTypes"))}</option>` + types.map(tt => `<option value="${esc(tt)}">${esc(tt)}</option>`).join("");
  $("typeFilter").value = typeFilter;

  $("stats").innerHTML = [
    ["stats.records", state.records.length],
    ["stats.types", types.length],
    ["stats.warnings", state.warnings.filter(w => w.level === "warn").length],
    ["stats.errors", state.warnings.filter(w => w.level === "error").length],
  ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${esc(t(k))}</span></div>`).join("");

  $("warnings").innerHTML = state.warnings.length
    ? state.warnings.map(w => `<div class="warnitem ${w.level === "error" ? "error" : ""}">${esc(t(w.key, w.params))}</div>`).join("")
    : `<div class="warnitem" style="background:#f0fdf4;border-color:#86efac;color:#166534">${esc(t("warnings.clean"))}</div>`;

  renderDiff();

  $("recordsTable").querySelector("tbody").innerHTML = visible.map(r => `
    <tr>
      <td>${esc(r.name)}</td>
      <td class="type">${esc(r.type)}</td>
      <td>${esc(r.ttl)}</td>
      <td>${esc(r.line || "—")}</td>
      <td>${esc(r.priority ? `${r.priority} ${r.value}` : r.value || "—")}</td>
      <td class="note">${esc(r.noteKey ? t(r.noteKey) : "")}</td>
    </tr>`).join("");
  $("parseState").textContent = t("state.parsed", { count: state.records.length });
  $("parseState").className = "state ok";
  $("resultsCard").hidden = false;
  $("exportCard").hidden = false;
}

function renderDiff() {
  const target = PROVIDERS[state.target] || PROVIDERS.cloudflare;
  const caps = ["lines", "weights", "proxy", "multiValue"].map(cap => {
    const supported = target[cap];
    return `<span class="cap ${supported ? "" : "no"}">${esc(t(`cap.${cap}`))}: ${esc(t(supported ? "cap.supported" : "cap.unsupported"))}</span>`;
  }).join("");
  const items = state.diffs.length
    ? state.diffs.map(d => `<div class="diffitem ${d.level}"><span class="tag">${esc(t(`diff.${d.level}`))}</span><div class="body">${esc(t(d.key, d.params))}</div></div>`).join("")
    : `<div class="diffempty">${esc(t("diff.empty"))}</div>`;
  $("migrationDiff").innerHTML = `
    <div class="diffbox">
      <div class="diffhead"><b>${esc(t("diff.title"))}</b><span class="cap">${esc(target.label)}</span>${caps}</div>
      ${items}
    </div>`;
}

function parseAndRender() {
  const text = $("zoneInput").value;
  const zoneName = $("zoneName").value;
  if (!text.trim()) {
    $("parseState").textContent = t("state.empty");
    $("parseState").className = "state err";
    return;
  }
  const result = state.mode === "csv" ? parseDnspodCsv(text, zoneName) : parseZone(text);
  state.records = result.records;
  state.warnings = result.warnings;
  state.defaultTtl = result.defaultTtl;
  state.origin = result.origin;
  state.target = $("targetProvider").value;
  render();
}

/* ---------- Export ---------- */

function exportableRecords() {
  // Merge policy: when the target has no line support, keep the default-line
  // record per name+type group; non-default lines are reported in the diff.
  const target = PROVIDERS[state.target] || PROVIDERS.cloudflare;
  if (target.lines) return state.records.filter(r => SUPPORTED.has(r.type));
  const groups = new Map();
  for (const r of state.records) {
    const key = `${r.name}|${r.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  for (const items of groups.values()) {
    const supported = items.filter(r => SUPPORTED.has(r.type));
    if (!supported.length) continue;
    const def = supported.find(r => isDefaultLine(r.line));
    if (def) {
      out.push(def);
      supported.forEach(r => { if (r !== def && !isDefaultLine(r.line)) r.noteKey = "note.merged"; });
    } else {
      out.push(...supported);
    }
  }
  return out;
}

function toBind() {
  const recs = exportableRecords();
  const lines = ["; Exported by DNS Migrate", `; target: ${(PROVIDERS[state.target] || {}).label || state.target}`, `; ${recs.length} record(s)`, `$TTL ${state.defaultTtl}`];
  for (const r of recs) {
    const owner = r.name.endsWith(".") ? r.name : r.name + ".";
    lines.push(r.type === "MX" && r.priority ? `${owner} ${r.ttl} IN MX ${r.priority} ${r.value}` : `${owner} ${r.ttl} IN ${r.type} ${r.value}`);
  }
  return lines.join("\n") + "\n";
}

function toCsv() {
  const escCsv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["name", "type", "ttl", "line", "priority", "value", "notes"]];
  for (const r of state.records) rows.push([r.name, r.type, r.ttl, r.line || "", r.priority, r.value, r.noteKey ? t(r.noteKey) : ""]);
  return rows.map(row => row.map(escCsv).join(",")).join("\n");
}

function toReport() {
  const domain = (state.origin || "zone").replace(/\.$/, "");
  const types = [...new Set(state.records.map(r => r.type))].sort().join(", ");
  const target = PROVIDERS[state.target] || PROVIDERS.cloudflare;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const warnRows = state.warnings.length
    ? state.warnings.map(w => `<li class="${w.level === "error" ? "err" : "warn"}">${esc(t(w.key, w.params))}</li>`).join("")
    : `<li>${esc(t("report.none"))}</li>`;
  const diffRows = state.diffs.length
    ? state.diffs.map(d => `<li class="${d.level === "approval" ? "warn" : d.level === "error" ? "err" : ""}">[${esc(t(`diff.${d.level}`))}] ${esc(t(d.key, d.params))}</li>`).join("")
    : `<li>${esc(t("report.none"))}</li>`;
  const recordRows = state.records.map(r => `
    <tr><td>${esc(r.name)}</td><td>${esc(r.type)}</td><td>${esc(r.ttl)}</td><td>${esc(r.line || "—")}</td><td>${esc(r.priority ? r.priority + " " + r.value : r.value)}</td><td>${esc(r.noteKey ? t(r.noteKey) : "")}</td></tr>`).join("");
  const checklist = ["preflight.item1", "preflight.item2", "preflight.item3", "preflight.item4", "preflight.item5", "preflight.item6", "preflight.item7"]
    .map(k => `<li>${esc(t(k))}</li>`).join("");

  return `<!doctype html>
<html lang="${lang === "zh" ? "zh-CN" : "en"}"><head><meta charset="utf-8"><title>${esc(t("report.title"))} — ${esc(domain)}</title>
<style>
body{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#1f2937;max-width:960px;margin:40px auto;padding:0 20px}
h1{font-size:22px;margin-bottom:4px}h2{font-size:15px;margin:26px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:6px}
.meta{color:#6b7280;font-size:12px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
.stat{border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px}.stat b{display:block;font-size:18px}.stat span{font-size:11px;color:#6b7280}
table{width:100%;border-collapse:collapse;font-size:12.5px}th{text-align:left;background:#f9fafb;padding:8px;border-bottom:1px solid #e5e7eb;font-size:11.5px;color:#6b7280}
td{padding:8px;border-bottom:1px solid #e5e7eb;word-break:break-all}ul{padding-left:20px}li{margin:4px 0}
li.err{color:#991b1b}li.warn{color:#92400e}.disclaimer{margin-top:28px;padding:10px 14px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;font-size:12px;color:#92400e}
@media print{body{margin:10mm auto}.disclaimer{break-inside:avoid}}
</style></head><body>
<h1>${esc(t("report.title"))}</h1>
<div class="meta">${esc(t("report.domain"))}: ${esc(domain)} · ${esc(t("report.target"))}: ${esc(target.label)} · ${esc(t("report.generated"))}: ${esc(now)}</div>
<h2>${esc(t("report.summary"))}</h2>
<div class="grid">
<div class="stat"><b>${state.records.length}</b><span>${esc(t("report.records"))}</span></div>
<div class="stat"><b>${state.records.length ? esc(types) : "—"}</b><span>${esc(t("report.types"))}</span></div>
<div class="stat"><b>${state.warnings.filter(w => w.level === "warn").length}</b><span>${esc(t("stats.warnings"))}</span></div>
<div class="stat"><b>${state.warnings.filter(w => w.level === "error").length}</b><span>${esc(t("stats.errors"))}</span></div>
</div>
<h2>${esc(t("report.differences"))}</h2><ul>${diffRows}</ul>
<h2>${esc(t("report.warnings"))}</h2><ul>${warnRows}</ul>
<h2>${esc(t("report.recordTable"))}</h2>
<table><thead><tr><th>${esc(t("table.name"))}</th><th>${esc(t("table.type"))}</th><th>${esc(t("table.ttl"))}</th><th>${esc(t("table.line"))}</th><th>${esc(t("table.value"))}</th><th>${esc(t("table.notes"))}</th></tr></thead><tbody>${recordRows}</tbody></table>
<h2>${esc(t("report.checklist"))}</h2><ul>${checklist}</ul>
<div class="disclaimer">${esc(t("report.disclaimer"))}</div>
</body></html>`;
}

function download(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Mode handling ---------- */

function setMode(mode) {
  state.mode = ["bind", "csv", "api"].includes(mode) ? mode : "bind";
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === state.mode));
  const isApi = state.mode === "api";
  $("apiCard").hidden = !isApi;
  $("sourceToolbar").hidden = isApi;
  $("zoneInput").hidden = isApi;
  $("sourceProviderRow").hidden = isApi;
  $("sourceActions").hidden = isApi;
  $("zoneNameRow").hidden = isApi || state.mode !== "csv";
  if (isApi) {
    $("zoneInput").placeholder = "";
  } else if (state.mode === "csv") {
    $("zoneInput").placeholder = "主机记录,记录类型,线路类型,记录值,MX优先级,TTL,状态,权重\n@,A,默认,203.0.113.10,,600,启用,\nwww,A,默认,203.0.113.10,,600,启用,";
  } else {
    $("zoneInput").placeholder = t("source.placeholder");
  }
}

/* ---------- API mode ---------- */

function setApiStatus(text, kind) {
  const el = $("apiStatus");
  el.textContent = text || "";
  el.className = "state" + (kind ? " " + kind : "");
}

async function apiFetch(path, payload) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function renderApiActions(items, isResult) {
  if (!items.length) { $("apiActions").innerHTML = ""; return; }
  const rows = items.map(it => {
    const action = isResult ? (it.ok ? "create" : "skip") : it.action;
    const kind = isResult ? (it.ok ? "info" : "error") : (it.action === "create" ? "info" : it.action === "conflict" ? "error" : "approval");
    const detail = isResult
      ? `${it.name} ${it.type} ${it.value}${it.error ? " — " + it.error : ""}`
      : `${it.name} ${it.type} ${it.value}${it.reason ? " — " + it.reason : ""}`;
    return `<div class="diffitem ${kind}"><span class="tag">${esc(t(`api.${action}`))}</span><div class="body">${esc(detail)}</div></div>`;
  }).join("");
  $("apiActions").innerHTML = `<div class="diffbox"><div class="diffhead"><b>${esc(t(isResult ? "api.results" : "api.plan"))}</b></div>${rows}</div>`;
}

async function apiRead() {
  const provider = $("apiSource").value;
  const domain = $("apiDomain").value.trim();
  if (!domain) { setApiStatus(t("api.error", { error: t("provider.zoneName") }), "err"); return; }
  const payload = { provider, domain };
  if (provider === "dnspod") {
    payload.secretId = $("dnspodSecretId").value.trim();
    payload.secretKey = $("dnspodSecretKey").value.trim();
  } else {
    payload.token = $("cfSourceToken").value.trim();
    payload.accountId = $("cfSourceAccount").value.trim();
  }
  setApiStatus(t("api.reading", { provider: PROVIDERS[provider] ? PROVIDERS[provider].label : provider }), "");
  try {
    const data = await apiFetch("/api/export", payload);
    const disabled = data.records.filter(r => r.disabled);
    state.records = data.records.filter(r => !r.disabled).map(r => ({ ...r, disabled: undefined }));
    state.origin = (data.domain || domain).replace(/\.$/, "") + ".";
    state.warnings = disabled.length ? [{ level: "warn", key: "api.disabled", params: { count: disabled.length } }] : [];
    state.target = "cloudflare";
    render();
    setApiStatus(t("api.readOk", { count: state.records.length, provider: PROVIDERS[provider] ? PROVIDERS[provider].label : provider }), "ok");
  } catch (err) {
    setApiStatus(t("api.readErr", { error: err.message }), "err");
  }
}

function targetDomain() {
  return ($("apiTargetDomain").value.trim() || $("apiDomain").value.trim()).replace(/\.$/, "");
}

function appToProfile(records, sourceDomain, name) {
  const src = String(sourceDomain || "").replace(/\.$/, "").toLowerCase();
  if (!src) throw new Error("sourceDomain is required");
  const re = new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const entries = records.map(r => {
    const fqdn = String(r.name || "").replace(/\.$/, "");
    let rel;
    if (fqdn.toLowerCase() === src) rel = "@";
    else if (fqdn.toLowerCase().endsWith("." + src)) rel = fqdn.slice(0, -(src.length + 1));
    else rel = fqdn;
    return {
      name: rel,
      type: String(r.type || "").toUpperCase(),
      value: String(r.value ?? "").replace(re, "{{domain}}"),
      ttl: r.ttl || 600,
      priority: r.priority || "",
      line: r.line || "默认",
      weight: r.weight || "",
      proxied: !!r.proxied,
    };
  });
  return { name: name || src, version: 1, createdAt: new Date().toISOString(), sourceDomain: src, records: entries };
}

function appExpandProfile(profile, target) {
  const dst = String(target || "").replace(/\.$/, "");
  if (!dst) throw new Error("targetDomain is required");
  if (!profile || !Array.isArray(profile.records)) throw new Error("invalid profile");
  return profile.records.map(r => {
    const rel = String(r.name || "");
    const name = rel === "@" || rel === "" ? dst + "." : `${rel}.${dst}.`;
    return {
      ...r,
      name,
      type: String(r.type || "").toUpperCase(),
      value: String(r.value ?? "").split("{{domain}}").join(dst),
    };
  });
}

function saveProfileFromRecords() {
  try {
    const source = ($("apiDomain").value.trim() || (state.origin || "").replace(/\.$/, ""));
    if (!source) { setApiStatus(t("api.error", { error: t("provider.zoneName") }), "err"); return; }
    if (!state.records.length) { setApiStatus(t("api.error", { error: t("state.empty") }), "err"); return; }
    const profile = appToProfile(state.records, source, source);
    download(`${source}.dnsprofile.json`, JSON.stringify(profile, null, 2), "application/json");
    setApiStatus(t("api.profileSaved", { name: profile.name, count: profile.records.length }), "ok");
  } catch (err) {
    setApiStatus(t("api.profileErr", { error: err.message }), "err");
  }
}

function saveProfileFromFileMode() {
  try {
    const source = (state.origin || "").replace(/\.$/, "");
    if (!source) { setApiStatus(t("api.error", { error: t("provider.zoneName") }), "err"); return; }
    if (!state.records.length) { setApiStatus(t("api.error", { error: t("state.empty") }), "err"); return; }
    const profile = appToProfile(state.records, source, source);
    download(`${source}.dnsprofile.json`, JSON.stringify(profile, null, 2), "application/json");
  } catch (err) {
    setApiStatus(t("api.profileErr", { error: err.message }), "err");
  }
}

function loadProfileFile(file) {
  if (!file) return;
  const dst = targetDomain();
  if (!dst) { setApiStatus(t("api.profileDomainRequired"), "err"); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const profile = JSON.parse(String(reader.result || "{}"));
      const records = appExpandProfile(profile, dst);
      state.records = records;
      state.origin = dst + ".";
      state.target = "cloudflare";
      state.warnings = [];
      render();
      setApiStatus(t("api.profileLoaded", { name: profile.name || "profile", count: records.length, domain: dst }), "ok");
    } catch (err) {
      setApiStatus(t("api.profileErr", { error: err.message }), "err");
    }
  };
  reader.readAsText(file);
}

async function apiVerify() {
  const domain = targetDomain();
  if (!domain) { setApiStatus(t("api.error", { error: t("provider.zoneName") }), "err"); return; }
  if (!state.records.length) { setApiStatus(t("api.error", { error: t("state.empty") }), "err"); return; }
  setApiStatus(t("api.verifying"), "");
  try {
    const data = await apiFetch("/api/verify", { domain, records: state.records, resolver: "1.1.1.1" });
    renderApiVerify(data);
    setApiStatus(t("api.verifyOk", data), "ok");
  } catch (err) {
    setApiStatus(t("api.verifyErr", { error: err.message }), "err");
  }
}

function renderApiVerify(data) {
  const rows = (data.details || []).filter(d => d.status !== "matched").map(d => {
    const kind = d.status === "mismatched" || d.status === "error" ? "error" : "approval";
    const label = t(d.status === "error" ? "api.errorLabel" : `api.${d.status}`);
    const detail = `${d.name} ${d.type} — ${t("api.expected")} ${JSON.stringify(d.expected)}; ${t("api.actual")} ${JSON.stringify(d.actual || [])}${d.error ? " — " + d.error : ""}`;
    return `<div class="diffitem ${kind}"><span class="tag">${esc(label)}</span><div class="body">${esc(detail)}</div></div>`;
  }).join("");
  const matchedNote = `<div class="diffempty">${esc(t("api.matched"))}: ${data.matched} / ${data.checked}</div>`;
  $("apiActions").innerHTML = `<div class="diffbox"><div class="diffhead"><b>${esc(t("api.verifyResults"))}</b><span class="cap">${esc(data.resolver)}</span></div>${rows || matchedNote}</div>`;
}

async function apiApplyRequest(apply) {
  const token = $("cfTargetToken").value.trim();
  const accountId = $("cfTargetAccount").value.trim();
  const domain = targetDomain();
  if (!token || !accountId || !domain) { setApiStatus(t("api.error", { error: "Cloudflare token / account ID / domain required" }), "err"); return; }
  if (!state.records.length) { setApiStatus(t("api.error", { error: t("state.empty") }), "err"); return; }
  const records = exportableRecords();
  if (apply) setApiStatus(t("api.applying"), "");
  else setApiStatus(t("api.previewing"), "");
  try {
    const data = await apiFetch("/api/apply", { token, accountId, domain, records, apply });
    if (apply) {
      renderApiActions(data.results || [], true);
      setApiStatus(t("api.applyOk", { created: data.created }), "ok");
    } else {
      renderApiActions(data.actions || [], false);
      setApiStatus(t("api.previewOk", data.summary || { create: 0, skip: 0, conflict: 0 }), "ok");
    }
  } catch (err) {
    setApiStatus(t(apply ? "api.applyErr" : "api.error", { error: err.message }), "err");
  }
}

/* ---------- Events ---------- */

document.querySelectorAll(".lang-switch button").forEach(b => b.addEventListener("click", () => setLanguage(b.dataset.lang)));
document.querySelectorAll(".mode-btn").forEach(b => b.addEventListener("click", () => {
  setMode(b.dataset.mode);
  if (state.records.length) parseAndRender();
}));
$("parseBtn").addEventListener("click", parseAndRender);
$("loadExample").addEventListener("click", () => {
  $("zoneInput").value = state.mode === "csv" ? EXAMPLE_CSV : EXAMPLE_ZONE;
  if (state.mode === "csv" && !$("zoneName").value) $("zoneName").value = "example.com";
  parseAndRender();
});
$("clearBtn").addEventListener("click", () => {
  $("zoneInput").value = ""; $("zoneName").value = "";
  state.records = []; state.warnings = []; state.diffs = [];
  $("resultsCard").hidden = true; $("exportCard").hidden = true;
  $("parseState").textContent = "";
});
$("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (/\.csv$/i.test(file.name)) setMode("csv");
  const reader = new FileReader();
  reader.onload = () => { $("zoneInput").value = String(reader.result || ""); parseAndRender(); };
  reader.readAsText(file);
});
$("filterInput").addEventListener("input", render);
$("typeFilter").addEventListener("change", render);
$("targetProvider").addEventListener("change", () => { if (state.records.length) render(); });
$("zoneName").addEventListener("input", () => { if (state.mode === "csv" && state.records.length) parseAndRender(); });
$("downloadBind").addEventListener("click", () => {
  const domain = (state.origin || "zone").replace(/\.$/, "").replace(/[^a-z0-9.-]/gi, "") || "zone";
  download(`${domain}.cloudflare.zone`, toBind());
});
$("downloadCsv").addEventListener("click", () => {
  const domain = (state.origin || "zone").replace(/\.$/, "").replace(/[^a-z0-9.-]/gi, "") || "zone";
  download(`${domain}.records.csv`, toCsv(), "text/csv");
});
$("apiSource").addEventListener("change", () => {
  const isDnspod = $("apiSource").value === "dnspod";
  $("dnspodCreds").hidden = !isDnspod;
  $("cfSourceCreds").hidden = isDnspod;
});
$("apiRead").addEventListener("click", apiRead);
$("apiSaveProfile").addEventListener("click", saveProfileFromRecords);
$("profileFile").addEventListener("change", (e) => loadProfileFile(e.target.files[0]));
$("downloadProfile").addEventListener("click", saveProfileFromFileMode);
$("apiVerify").addEventListener("click", apiVerify);
$("apiPreview").addEventListener("click", () => apiApplyRequest(false));
$("apiApply").addEventListener("click", () => {
  if (confirm(t("api.applyConfirm", { count: exportableRecords().length }))) apiApplyRequest(true);
});
$("downloadReport").addEventListener("click", () => {
  const domain = (state.origin || "zone").replace(/\.$/, "").replace(/[^a-z0-9.-]/gi, "") || "zone";
  download(`${domain}.migration-report.html`, toReport(), "text/html");
});

applyLanguage();
setMode("bind");
