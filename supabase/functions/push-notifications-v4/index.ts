import * as webpush from "jsr:@negrel/webpush@0.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://smart-village.viralam.workers.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const isUuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const apiKey = Deno.env.get("APP_PUBLISHABLE_KEY") || "";
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const pair = Deno.env.get("VAPID_KEY_PAIR_JSON") || "";
    const contact = Deno.env.get("VAPID_CONTACT_EMAIL") || "";
    if (!url || !serviceKey || !apiKey || !vapidPublic || !pair || !contact)
      return json({ error: "Blood request push service configuration is incomplete." }, 503);
    if (req.headers.get("apikey") !== apiKey) return json({ error: "Invalid API key" }, 401);

    const body = await req.json();
    if (body?.action !== "blood-request-created") return json({ error: "Unknown V4 action." }, 400);
    const requestId = body.requestId;
    if (!isUuid(requestId)) return json({ error: "Invalid blood request reference." }, 400);

    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: request, error: requestError } = await db.from("blood_requests")
      .select("id,full_name,mobile_number,blood_group,created_at")
      .eq("id", requestId).maybeSingle();
    if (requestError) throw requestError;
    if (!request) return json({ error: "Blood request not found." }, 404);

    const createdAt = new Date(request.created_at).getTime();
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 10 * 60 * 1000 || createdAt > Date.now() + 60 * 1000)
      return json({ error: "Blood request notification window expired." }, 400);

    const { data: devices, error: deviceError } = await db.from("admin_complaint_push_subscriptions").select("endpoint,subscription");
    if (deviceError) throw deviceError;
    if (!devices?.length) return json({ success: true, sent: 0, message: "No private admin alert device is registered yet." });

    const { error: logError } = await db.from("blood_request_push_delivery_log").insert({ blood_request_id: String(requestId) });
    if (logError?.code === "23505") return json({ success: true, sent: 0, duplicate: true });
    if (logError) throw logError;

    const keys = await webpush.importVapidKeys(JSON.parse(pair), { extractable: false });
    if (await webpush.exportApplicationServerKey(keys) !== vapidPublic) {
      await db.from("blood_request_push_delivery_log").delete().eq("blood_request_id", String(requestId));
      return json({ error: "VAPID keys do not match." }, 503);
    }
    const server = await webpush.ApplicationServer.new({ contactInformation: "mailto:" + contact, vapidKeys: keys });
    const payload = JSON.stringify({
      title: "Penubaka: Blood request",
      body: request.full_name + " (" + request.mobile_number + ") needs " + request.blood_group + " blood.",
      url: "/blood-requests.html",
      icon: "https://smart-village.viralam.workers.dev/assets/Penubaka%20Village%20Pride%20Map.png",
      badge: "https://smart-village.viralam.workers.dev/assets/Penubaka%20Village%20Pride%20Map.png",
      timestamp: Date.now(), tag: "penubaka-blood-request-" + requestId
    });

    let sent = 0;
    for (const item of devices) {
      try {
        await server.subscribe(item.subscription).pushTextMessage(payload, { ttl: 3600, urgency: webpush.Urgency.High });
        sent++;
      } catch (pushError) {
        console.error("V4 private blood request alert failed:", pushError);
        if (pushError instanceof webpush.PushMessageError && pushError.isGone()) {
          await db.from("admin_complaint_push_subscriptions").delete().eq("endpoint", item.endpoint);
        }
      }
    }
    if (!sent) await db.from("blood_request_push_delivery_log").delete().eq("blood_request_id", String(requestId));
    return json({ success: true, sent, total: devices.length, version: "v4" });
  } catch (error) {
    console.error("V4 blood request notification error:", error);
    return json({ error: error instanceof Error ? error.message : "Blood request notification failed." }, 500);
  }
});
