// Pages Function: POST /api/verify
// Checks records against public DNS over HTTPS. No credentials required.
import { verifyRecords } from "../../shared/providers.js";

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
  try {
    return json(await verifyRecords(body));
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
}
