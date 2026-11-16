import * as webpush from "jsr:@negrel/webpush@0.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://smart-village.viralam.workers.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const isUuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const PUBLISHABLE_KEY = Deno.env.get("APP_PUBLISHABLE_KEY") || "";
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";

    const missingBase = [
      ["SUPABASE_URL", SUPABASE_URL],
      ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY],
      ["APP_PUBLISHABLE_KEY", PUBLISHABLE_KEY]
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missingBase.length) {
      console.error("Push base configuration missing:", missingBase.join(", "));
      return json({ error: "Push service configuration is incomplete.", missing: missingBase }, 503);
    }

    if (req.headers.get("apikey") !== PUBLISHABLE_KEY) {
      return json({ error: "Invalid API key" }, 401);
    }

    const body = await req.json();
    const action = body && body.action;

    // The browser obtains the current public key from the same deployment that
    // owns the private key. This prevents a stale hard-coded key breaking iOS/Android.
    if (action === "config") {
      if (!VAPID_PUBLIC_KEY) return json({ error: "Push notifications are not configured yet." }, 503);
      return json({ success: true, vapidPublicKey: VAPID_PUBLIC_KEY });
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    if (action === "subscribe") {
      const villageSlug = body.villageSlug;
      const visitorId = body.visitorId;
      const subscription = body.subscription;
      if (villageSlug !== "penubaka" || !isUuid(visitorId) ||
          typeof subscription?.endpoint !== "string" ||
          !subscription.endpoint.startsWith("https://") ||
          typeof subscription?.keys?.p256dh !== "string" ||
          typeof subscription?.keys?.auth !== "string") {
        return json({ error: "Invalid push subscription details" }, 400);
      }

      const { data: village, error: villageError } = await db
        .from("villages").select("id").eq("slug", villageSlug).eq("is_active", true).single();
      if (villageError || !village) return json({ error: "Village not found or inactive" }, 404);

      const { error: interestError } = await db.from("notification_interests").upsert({
        village_id: village.id, visitor_id: visitorId
      }, { onConflict: "village_id,visitor_id", ignoreDuplicates: true });
      if (interestError) throw interestError;

      const { error: saveError } = await db.from("push_subscriptions").upsert({
        village_id: village.id,
        visitor_id: visitorId,
        endpoint: subscription.endpoint,
        subscription,
        updated_at: new Date().toISOString()
      }, { onConflict: "endpoint" });
      if (saveError) throw saveError;

      return json({ success: true, registered: true, message: "This device is registered for village notifications." });
    }

    if (action === "unsubscribe") {
      const endpoint = body.endpoint;
      if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
        return json({ error: "Invalid subscription endpoint" }, 400);
      }
      const { error } = await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
      if (error) throw error;
      return json({ success: true, registered: false });
    }

    if (action === "send") {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!token || token === PUBLISHABLE_KEY) return json({ error: "Administrator sign-in required" }, 401);

      const { data: userData, error: userError } = await db.auth.getUser(token);
      if (userError || !userData.user) return json({ error: "Invalid administrator session" }, 401);

      const { data: admin, error: adminError } = await db
        .from("admin_profiles").select("user_id")
        .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
      if (adminError || !admin) return json({ error: "Not authorized" }, 403);

      const title = String(body.title || "").trim().slice(0, 100);
      const message = String(body.message || "").trim().slice(0, 240);
      const allowedTargets = new Set(["/announcements.html","/village-leaders.html","/complaints.html","/development.html","/schemes.html","/services.html","/index.html"]);
      const targetUrl = typeof body.url === "string" && allowedTargets.has(body.url)
        ? body.url : "/announcements.html";
      if (!title || !message) return json({ error: "Notification title and message are required" }, 400);

      const VAPID_KEY_PAIR_JSON = Deno.env.get("VAPID_KEY_PAIR_JSON") || "";
      const VAPID_CONTACT_EMAIL = Deno.env.get("VAPID_CONTACT_EMAIL") || "";
      const missingSend = [
        ["VAPID_PUBLIC_KEY", VAPID_PUBLIC_KEY],
        ["VAPID_KEY_PAIR_JSON", VAPID_KEY_PAIR_JSON],
        ["VAPID_CONTACT_EMAIL", VAPID_CONTACT_EMAIL]
      ].filter(([, value]) => !value).map(([name]) => name);
      if (missingSend.length) {
        console.error("Push sending configuration missing:", missingSend.join(", "));
        return json({ error: "Push sending is not fully configured.", missing: missingSend }, 503);
      }

      const vapidKeys = await webpush.importVapidKeys(JSON.parse(VAPID_KEY_PAIR_JSON), { extractable: false });
      const configuredPublicKey = await webpush.exportApplicationServerKey(vapidKeys);
      if (configuredPublicKey !== VAPID_PUBLIC_KEY) {
        console.error("VAPID public key does not match the configured key pair.");
        return json({ error: "VAPID public/private keys do not match. Please correct the Supabase secrets." }, 503);
      }
      const appServer = await webpush.ApplicationServer.new({
        contactInformation: "mailto:" + VAPID_CONTACT_EMAIL,
        vapidKeys
      });

      const { data: village, error: villageError } = await db
        .from("villages").select("id").eq("slug", "penubaka").single();
      if (villageError || !village) return json({ error: "Village not found" }, 404);

      const { data: subscriptions, error: listError } = await db
        .from("push_subscriptions").select("endpoint,subscription").eq("village_id", village.id);
      if (listError) throw listError;

      const rows = subscriptions || [];
      if (!rows.length) {
        return json({ success: true, sent: 0, failed: 0, removed: 0, total: 0, message: "No devices are registered for push notifications yet." });
      }

      let sent = 0, failed = 0, removed = 0;
      const image = typeof body.image === "string" && body.image.startsWith("https://") ? body.image : undefined;
      const payload = JSON.stringify({
        title, body: message, url: targetUrl,
        icon: "https://smart-village.viralam.workers.dev/assets/Penubaka%20Village%20Pride%20Map.png",
        badge: "https://smart-village.viralam.workers.dev/assets/Penubaka%20Village%20Pride%20Map.png",
        image, timestamp: Date.now(),
        tag: "penubaka-announcement-" + Date.now()
      });

      // One broken/expired endpoint must never stop delivery to the remaining devices.
      for (const item of rows) {
        try {
          const subscriber = appServer.subscribe(item.subscription);
          await subscriber.pushTextMessage(payload, { ttl: 3600, urgency: webpush.Urgency.High });
          sent++;
          const { error: updateError } = await db.from("push_subscriptions")
            .update({ last_success_at: new Date().toISOString() }).eq("endpoint", item.endpoint);
          if (updateError) console.warn("Could not update push delivery timestamp:", updateError.message);
        } catch (error) {
          failed++;
          console.error("Push delivery failed for one subscription:", error);
          if (error instanceof webpush.PushMessageError && error.isGone()) {
            const { error: deleteError } = await db.from("push_subscriptions").delete().eq("endpoint", item.endpoint);
            if (!deleteError) removed++;
            else console.warn("Could not remove expired push subscription:", deleteError.message);
          }
        }
      }

      return json({
        success: true, sent, failed, removed, total: rows.length,
        message: sent ? "Notification delivery attempted for registered devices." : "No registered device accepted this notification."
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Push notification function error:", error);
    return json({ error: error instanceof Error ? error.message : "Push notification request failed" }, 500);
  }
});
