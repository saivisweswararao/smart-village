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
const validSubscription = (s: any) => typeof s?.endpoint === "string" && s.endpoint.startsWith("https://") && typeof s?.keys?.p256dh === "string" && typeof s?.keys?.auth === "string";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const apiKey = Deno.env.get("APP_PUBLISHABLE_KEY") || "";
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    if (!url || !serviceKey || !apiKey) return json({ error: "Push service configuration is incomplete." }, 503);
    if (req.headers.get("apikey") !== apiKey) return json({ error: "Invalid API key" }, 401);
    const body = await req.json();
    const action = body?.action;
    if (action === "config") {
      if (!vapidPublic) return json({ error: "Push notifications are not configured yet." }, 503);
      return json({ success: true, vapidPublicKey: vapidPublic });
    }
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const requireAdmin = async () => {
      if (!token || token === apiKey) return null;
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) return null;
      const { data: admin } = await db.from("admin_profiles").select("user_id").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
      return admin ? data.user : null;
    };

    if (action === "register-complaint-device") {
      const user = await requireAdmin();
      if (!user) return json({ error: "Administrator sign-in required." }, 401);
      if (!validSubscription(body.subscription)) return json({ error: "Invalid device subscription." }, 400);
      // Exactly one private complaint-alert device is active at a time.
      const { error: clearError } = await db.from("admin_complaint_push_subscriptions").delete().neq("endpoint", "");
      if (clearError) throw clearError;
      const { error } = await db.from("admin_complaint_push_subscriptions").insert({
        user_id: user.id, endpoint: body.subscription.endpoint, subscription: body.subscription, updated_at: new Date().toISOString()
      });
      if (error) throw error;
      return json({ success: true, registered: true, message: "This device is now the private complaint-alert device." });
    }

    if (action === "complaint-created") {
      const grievanceId = body.grievanceId;
      if (!isUuid(grievanceId)) return json({ error: "Invalid complaint reference." }, 400);
      const { data: grievance, error: grievanceError } = await db.from("public_grievances")
        .select("id,village_slug,created_at").eq("id", grievanceId).eq("village_slug", "penubaka").maybeSingle();
      if (grievanceError) throw grievanceError;
      if (!grievance) return json({ error: "Complaint not found." }, 404);
      const createdAt = new Date(grievance.created_at).getTime();
      if (!Number.isFinite(createdAt) || Date.now() - createdAt > 10 * 60 * 1000 || createdAt > Date.now() + 60 * 1000)
        return json({ error: "Complaint notification window expired." }, 400);

      const { data: devices, error: deviceError } = await db.from("admin_complaint_push_subscriptions").select("endpoint,subscription");
      if (deviceError) throw deviceError;
      if (!devices?.length) return json({ success: true, sent: 0, message: "No private admin device is registered yet." });
      const { error: logError } = await db.from("complaint_push_delivery_log").insert({ grievance_id: String(grievanceId) });
      if (logError?.code === "23505") return json({ success: true, sent: 0, duplicate: true });
      if (logError) throw logError;

      const VAPID_KEY_PAIR_JSON = Deno.env.get("VAPID_KEY_PAIR_JSON") || "";
      const contact = Deno.env.get("VAPID_CONTACT_EMAIL") || "";
      if (!vapidPublic || !VAPID_KEY_PAIR_JSON || !contact) {
        await db.from("complaint_push_delivery_log").delete().eq("grievance_id", String(grievanceId));
        return json({ error: "Push sending is not fully configured." }, 503);
      }
      const keys = await webpush.importVapidKeys(JSON.parse(VAPID_KEY_PAIR_JSON), { extractable: false });
      if (await webpush.exportApplicationServerKey(keys) !== vapidPublic) {
        await db.from("complaint_push_delivery_log").delete().eq("grievance_id", String(grievanceId));
        return json({ error: "VAPID keys do not match." }, 503);
      }
      const server = await webpush.ApplicationServer.new({ contactInformation: "mailto:" + contact, vapidKeys: keys });
      const payload = JSON.stringify({
        title: "Penubaka: New complaint",
        body: "A new complaint has been submitted.",
        url: "/admin-grievances.html",
        icon: "https://smart-village.viralam.workers.dev/assets/Penubaka%20Village%20Pride%20Map.png",
        badge: "https://smart-village.viralam.workers.dev/assets/Penubaka%20Village%20Pride%20Map.png",
        timestamp: Date.now(), tag: "penubaka-private-complaint-" + grievanceId
      });
      let sent = 0;
      for (const item of devices) {
        try {
          await server.subscribe(item.subscription).pushTextMessage(payload, { ttl: 3600, urgency: webpush.Urgency.High });
          sent++;
        } catch (e) {
          console.error("Private complaint alert failed:", e);
          if (e instanceof webpush.PushMessageError && e.isGone()) {
            await db.from("admin_complaint_push_subscriptions").delete().eq("endpoint", item.endpoint);
          }
        }
      }
      if (!sent) await db.from("complaint_push_delivery_log").delete().eq("grievance_id", String(grievanceId));
      return json({ success: true, sent, total: devices.length });
    }

    // Preserve the existing public announcement subscription and admin-send workflow.
    if (action === "subscribe") {
      const { villageSlug, visitorId, subscription } = body;
      if (villageSlug !== "penubaka" || !isUuid(visitorId) || !validSubscription(subscription))
        return json({ error: "Invalid push subscription details" }, 400);
      const { data: village, error: villageError } = await db.from("villages").select("id").eq("slug", villageSlug).eq("is_active", true).single();
      if (villageError || !village) return json({ error: "Village not found or inactive" }, 404);
      const { error: interestError } = await db.from("notification_interests").upsert({ village_id: village.id, visitor_id: visitorId }, { onConflict: "village_id,visitor_id", ignoreDuplicates: true });
      if (interestError) throw interestError;
      const { error } = await db.from("push_subscriptions").upsert({ village_id: village.id, visitor_id: visitorId, endpoint: subscription.endpoint, subscription, updated_at: new Date().toISOString() }, { onConflict: "endpoint" });
      if (error) throw error;
      return json({ success: true, registered: true });
    }
    if (action === "unsubscribe") {
      if (typeof body.endpoint !== "string" || !body.endpoint.startsWith("https://")) return json({ error: "Invalid subscription endpoint" }, 400);
      const { error } = await db.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
      if (error) throw error;
      return json({ success: true, registered: false });
    }
    if (action === "send") {
      const user = await requireAdmin();
      if (!user) return json({ error: "Administrator sign-in required" }, 401);
      const title = String(body.title || "").trim().slice(0, 100);
      const message = String(body.message || "").trim().slice(0, 240);
      const allowed = new Set(["/announcements.html","/village-leaders.html","/complaints.html","/development.html","/schemes.html","/services.html","/index.html"]);
      const target = typeof body.url === "string" && allowed.has(body.url) ? body.url : "/announcements.html";
      if (!title || !message) return json({ error: "Notification title and message are required" }, 400);
      const pair = Deno.env.get("VAPID_KEY_PAIR_JSON") || "", contact = Deno.env.get("VAPID_CONTACT_EMAIL") || "";
      if (!vapidPublic || !pair || !contact) return json({ error: "Push sending is not fully configured." }, 503);
      const keys = await webpush.importVapidKeys(JSON.parse(pair), { extractable: false });
      if (await webpush.exportApplicationServerKey(keys) !== vapidPublic) return json({ error: "VAPID keys do not match." }, 503);
      const server = await webpush.ApplicationServer.new({ contactInformation: "mailto:" + contact, vapidKeys: keys });
      const { data: village, error: villageError } = await db.from("villages").select("id").eq("slug", "penubaka").single();
      if (villageError || !village) return json({ error: "Village not found" }, 404);
      const { data: rows, error } = await db.from("push_subscriptions").select("endpoint,subscription").eq("village_id", village.id);
      if (error) throw error;
      let sent = 0, failed = 0, removed = 0;
      const payload = JSON.stringify({ title, body: message, url: target, icon: "https://smart-village.viralam.workers.dev/assets/Penubaka%20Village%20Pride%20Map.png", badge: "https://smart-village.viralam.workers.dev/assets/Penubaka%20Village%20Pride%20Map.png", timestamp: Date.now(), tag: "penubaka-announcement-" + Date.now() });
      for (const item of rows || []) {
        try {
          await server.subscribe(item.subscription).pushTextMessage(payload, { ttl: 3600, urgency: webpush.Urgency.High });
          sent++;
          await db.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("endpoint", item.endpoint);
        } catch (e) {
          failed++;
          if (e instanceof webpush.PushMessageError && e.isGone()) {
            const { error: delError } = await db.from("push_subscriptions").delete().eq("endpoint", item.endpoint);
            if (!delError) removed++;
          }
        }
      }
      return json({ success: true, sent, failed, removed, total: (rows || []).length });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Push notification function error:", error);
    return json({ error: error instanceof Error ? error.message : "Push notification request failed" }, 500);
  }
});
