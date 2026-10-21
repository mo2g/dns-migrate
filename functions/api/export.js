// Pages Function: POST /api/export
// Thin HTTP wrapper around shared/providers.js.
import { exportCloudflare, exportDnspod } from "../../shared/providers.js";

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
