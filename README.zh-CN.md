# DNS Migrate

[English](README.md) | 中文

**安全的 DNS 迁移工具** —— 在 DNS 服务商之间规划、对比、迁移并验证 DNS 记录。

> 状态：MVP（纯浏览器、静态页面）。可直接部署到 Cloudflare Pages，无需后端。

## 为什么做这个

DNS 迁移不是"复制粘贴"就能完成的事。真实迁移中最容易出问题的地方：

- **线路/权重语义无法直接映射**（例如 DNSPod 的 ISP 线路 → Cloudflare 免费版没有 GeoDNS）
- **多值记录误报冲突**（同名多条 MX 或 TXT 被简单比对误判为冲突）
- **目标服务商专属语义**（Cloudflare 的 proxied 记录、`100::` 重定向占位、Pages CNAME）
- **验证记录不能随意删除**（`_dnsauth`、trust-provider 等可能仍在服务证书续期）
- **非记录类前置条件**：DNSSEC/DS、CAA、NS 分配、注册商锁

DNS Migrate 关注的是**迁移安全层**：可读的差异报告、迁移前检查清单、可验证的迁移计划——而不只是导入导出。

## 当前功能

- 解析 BIND zone 文件（A、AAAA、CNAME、MX、TXT、NS、SRV、CAA）
- **导入 DNSPod CSV 导出（线路与权重感知）**
- **服务商能力矩阵**（Cloudflare / DNSPod / 阿里云云解析 / Route 53）
- **语义迁移差异**：线路合并、权重丢失、多值记录、低 TTL
- **合并建议 + 「需确认」项**
- 记录表与类型统计（含线路信息）
- 校验警告（按线路检测 CNAME 冲突、通配符、重复记录、不支持类型）
- 导出 Cloudflare 兼容的 BIND zone 文件（默认应用线路合并策略）
- 导出 CSV 记录清单
- 导出可分享的 HTML 迁移报告（差异 + 警告 + 预检清单）
- **中英文界面切换**
- 100% 客户端运行：数据不离开浏览器，不需要任何 API Token

## 路线图

详见 [docs/roadmap.md](docs/roadmap.md)。

- 服务商能力矩阵（DNSPod、阿里云云解析、Cloudflare、Route53）
- 语义差异报告（线路/权重合并建议）
- 迁移前检查清单（DNSSEC/CAA/NS/邮件/Zone 删除时钟）
- 可选的 Pages Functions 代理（用户自带 Token，API 读取/写入）
- 命令行工具（CLI）

## 本地运行

```bash
cd dns-migrate
python3 -m http.server 8080
# 打开 http://localhost:8080
```

## 部署到 Cloudflare Pages

创建 Pages 项目并上传仓库根目录（无需构建），或：

```bash
npx wrangler pages deploy . --project-name dns-migrate
```

## 许可

MIT —— 见 [LICENSE](LICENSE)。
