(() => {
  const button = document.getElementById("notification-interest-yes");
  const later = document.getElementById("notification-interest-later");
  const disableButton = document.getElementById("notification-interest-disable");
  const message = document.getElementById("notification-interest-message");
  if (!button || !later || !message) return;

  const VILLAGE = "penubaka";
  const VISITOR_KEY = "penubaka_unique_visitor_id";
  const INTEREST_KEY = "penubaka_notification_interest_recorded";
  const SUPABASE_URL = window.SUPABASE_URL;
  const PUBLISHABLE_KEY = window.SUPABASE_PUBLISHABLE_KEY;
  // VAPID public key is intentionally public. Generate a matching private key and
  // store ONLY that private key as a Supabase Edge Function secret.
  const VAPID_PUBLIC_KEY = "REPLACE_WITH_VAPID_PUBLIC_KEY";

  function visitorId() {
    try {
      let id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch (_) { return null; }
  }

  function base64UrlToBytes(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }

  async function callFunction(body, accessToken) {
    const response = await fetch(SUPABASE_URL + "/functions/v1/push-notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": PUBLISHABLE_KEY,
        "Authorization": "Bearer " + (accessToken || PUBLISHABLE_KEY)
      },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) throw new Error(result.error || "Notification service returned " + response.status);
    return result;
  }

  function showStatus(text) { message.textContent = text; }

  async function enablePush() {
    if (!window.supabaseClient || !SUPABASE_URL || !PUBLISHABLE_KEY) {
      throw new Error("Website database configuration is unavailable. Please try again later.");
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      throw new Error("This browser does not support web push notifications. Try the latest Chrome browser on Android.");
    }
    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith("REPLACE_")) {
      throw new Error("Push notifications are not fully configured yet. Please try again later.");
    }

    const id = visitorId();
    if (!id) throw new Error("Browser storage is unavailable. Please enable it and try again.");

    // Ask for permission immediately from the user tap, before network calls.
    let permission = null;
    if ("Notification" in window) {
      permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
    }

    const { error: interestError } = await window.supabaseClient.rpc("register_notification_interest", {
      p_village_slug: VILLAGE,
      p_visitor_id: id
    });
    if (interestError) throw interestError;
    try { localStorage.setItem(INTEREST_KEY, "yes"); } catch (_) {}

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      throw new Error("Your interest was recorded, but this browser does not support web push. Try the latest Chrome browser on Android.");
    }
    if (permission !== "granted") {
      throw new Error("Your interest was recorded, but notification permission was not granted. You can enable it in browser settings and try again.");
    }

    showStatus("Registering this device… / ఈ పరికరాన్ని నమోదు చేస్తున్నాము…");
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY)
      });
    }

    await callFunction({
      action: "subscribe",
      villageSlug: VILLAGE,
      visitorId: id,
      subscription: subscription.toJSON()
    });

    button.textContent = "Notifications enabled ✓ / నోటిఫికేషన్లు ప్రారంభమయ్యాయి";
    button.disabled = true;
    later.disabled = true;
    if (disableButton) disableButton.hidden = false;
    showStatus("Success! This device can now receive Penubaka announcements. / విజయవంతం! ఈ పరికరానికి పెనుబాక ప్రకటనలు వస్తాయి.");
  }

  async function syncExistingSubscription() {
    if (!disableButton || !("serviceWorker" in navigator) || !("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = registration && await registration.pushManager.getSubscription();
      if (subscription) {
        button.disabled = true;
        button.textContent = "Notifications enabled ✓ / నోటిఫికేషన్లు ప్రారంభమయ్యాయి";
        disableButton.hidden = false;
        showStatus("This device is subscribed to Penubaka updates. / ఈ పరికరం పెనుబాక అప్‌డేట్లకు నమోదు చేయబడింది.");
      }
    } catch (error) { console.warn("Could not check existing push subscription:", error); }
  }

  disableButton?.addEventListener("click", async () => {
    disableButton.disabled = true;
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = registration && await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await callFunction({ action: "unsubscribe", endpoint });
      }
      disableButton.hidden = true;
      disableButton.disabled = false;
      button.disabled = false;
      button.textContent = "Enable notifications / నోటిఫికేషన్లు ప్రారంభించండి";
      later.disabled = false;
      showStatus("Notifications turned off for this device. / ఈ పరికరంలో నోటిఫికేషన్లు ఆపివేయబడ్డాయి.");
    } catch (error) {
      disableButton.disabled = false;
      showStatus("Could not turn off notifications: " + error.message);
    }
  });

  let alreadyInterested = false;
  try { alreadyInterested = localStorage.getItem(INTEREST_KEY) === "yes"; } catch (_) {}
  if (alreadyInterested) {
    button.textContent = "Enable / Re-enable notifications";
    showStatus("Your interest is recorded. Tap to enable notifications on this device. / మీ ఆసక్తి నమోదైంది. ఈ పరికరంలో నోటిఫికేషన్ల కోసం నొక్కండి.");
  }

  syncExistingSubscription();

  button.addEventListener("click", async () => {
    button.disabled = true;
    later.disabled = true;
    showStatus("Please allow notifications when your browser asks. / బ్రౌజర్ అడిగినప్పుడు నోటిఫికేషన్లకు అనుమతి ఇవ్వండి.");
    try {
      await enablePush();
    } catch (error) {
      console.error("Push subscription:", error);
      showStatus(error.message + " / " + "అవసరమైతే బ్రౌజర్ సెట్టింగ్స్‌లో అనుమతి మార్చి మళ్లీ ప్రయత్నించండి.");
      button.disabled = false;
      later.disabled = false;
    }
  });

  later.addEventListener("click", () => {
    document.querySelector(".notification-interest")?.setAttribute("hidden", "");
  });
})();
