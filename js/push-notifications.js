/* Penubaka Web Push registration.
   iOS/iPadOS Web Push works on supported versions when this site is installed
   as a Home Screen web app. Unsupported browsers receive a clear fallback. */
(function () {
  "use strict";

  var button = document.getElementById("notification-interest-yes");
  var later = document.getElementById("notification-interest-later");
  var disableButton = document.getElementById("notification-interest-disable");
  var message = document.getElementById("notification-interest-message");
  if (!button || !later || !message) return;

  var VILLAGE = "penubaka";
  var VISITOR_KEY = "penubaka_unique_visitor_id";
  var INTEREST_KEY = "penubaka_notification_interest_recorded";
  var SUPABASE_URL = window.SUPABASE_URL;
  var PUBLISHABLE_KEY = window.SUPABASE_PUBLISHABLE_KEY;
  var siteUrl = "https://smart-village.viralam.workers.dev";

  function showStatus(text) { message.textContent = text; }

  function visitorId() {
    try {
      var id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
          id = window.crypto.randomUUID();
        } else if (window.crypto && window.crypto.getRandomValues) {
          var bytes = new Uint8Array(16);
          window.crypto.getRandomValues(bytes);
          bytes[6] = (bytes[6] & 15) | 64;
          bytes[8] = (bytes[8] & 63) | 128;
          var hex = [];
          for (var i = 0; i < bytes.length; i++) hex.push(("0" + bytes[i].toString(16)).slice(-2));
          id = hex.slice(0,4).join("") + "-" + hex.slice(4,6).join("") + "-" +
            hex.slice(6,8).join("") + "-" + hex.slice(8,10).join("") + "-" + hex.slice(10).join("");
        } else {
          throw new Error("Secure browser storage is not supported.");
        }
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch (error) {
      throw new Error("This browser is blocking secure storage. Please enable cookies/site storage and try again.");
    }
  }

  function base64UrlToBytes(value) {
    var padding = "=".repeat((4 - value.length % 4) % 4);
    var base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = window.atob(base64);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function callFunction(body, accessToken) {
    return fetch(SUPABASE_URL + "/functions/v1/push-notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": PUBLISHABLE_KEY,
        "Authorization": "Bearer " + (accessToken || PUBLISHABLE_KEY)
      },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (result) {
        if (!response.ok || result.error) {
          var detail = result.error || ("Notification service returned " + response.status);
          if (result.missing && result.missing.length) detail += " Missing setup: " + result.missing.join(", ");
          throw new Error(detail);
        }
        return result;
      });
    });
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isInstalledWebApp() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
  }

  function unsupportedMessage() {
    if (isIOS() && !isInstalledWebApp()) {
      return "On iPhone/iPad, first open this site in Safari, tap Share, choose Add to Home Screen, open the new Home Screen icon, then enable notifications. / iPhoneలో Safari ద్వారా Share → Add to Home Screen ఎంచుకుని, Home Screen ఐకాన్ ద్వారా తెరిచి నోటిఫికేషన్లు ప్రారంభించండి.";
    }
    return "This browser does not support Web Push. Please use the latest Safari (with this site added to Home Screen), Chrome, or Edge. / ఈ బ్రౌజర్‌లో నోటిఫికేషన్లు అందుబాటులో లేవు. తాజా Safari, Chrome లేదా Edge ఉపయోగించండి.";
  }

  function hasPushSupport() {
    return window.isSecureContext !== false &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      !!window.crypto;
  }

  function registerOnServer(id, subscription) {
    return callFunction({
      action: "subscribe",
      villageSlug: VILLAGE,
      visitorId: id,
      subscription: subscription.toJSON ? subscription.toJSON() : subscription
    });
  }

  function enablePush() {
    if (!SUPABASE_URL || !PUBLISHABLE_KEY) {
      return Promise.reject(new Error("Website notification configuration is unavailable. Please try again later."));
    }
    if (!hasPushSupport()) return Promise.reject(new Error(unsupportedMessage()));
    if (isIOS() && !isInstalledWebApp()) return Promise.reject(new Error(unsupportedMessage()));

    var id;
    try { id = visitorId(); } catch (error) { return Promise.reject(error); }

    // Permission is requested directly from the user's button tap.
    var permissionPromise = Notification.permission === "granted"
      ? Promise.resolve("granted")
      : Notification.permission === "denied"
        ? Promise.resolve("denied")
        : Promise.resolve(Notification.requestPermission());

    return permissionPromise.then(function (permission) {
      if (permission !== "granted") {
        throw new Error("Notification permission was not granted. Enable it in this site's browser settings, then try again. / నోటిఫికేషన్ అనుమతి ఇవ్వలేదు. బ్రౌజర్ సెట్టింగ్స్‌లో అనుమతించి మళ్లీ ప్రయత్నించండి.");
      }
      showStatus("Registering this device… / ఈ పరికరాన్ని నమోదు చేస్తున్నాము…");
      return callFunction({ action: "config" }).then(function (config) {
        if (!config.vapidPublicKey) throw new Error("The push public key is not configured on the server.");
        return navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(function (registration) {
          return navigator.serviceWorker.ready.then(function (readyRegistration) {
            var activeRegistration = readyRegistration || registration;
            return activeRegistration.pushManager.getSubscription().then(function (subscription) {
              if (subscription) return subscription;
              return activeRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: base64UrlToBytes(config.vapidPublicKey)
              });
            }).then(function (subscription) {
              return registerOnServer(id, subscription).then(function (result) {
                if (!result.registered) throw new Error("The server did not confirm this device registration.");
                try { localStorage.setItem(INTEREST_KEY, "yes"); } catch (_) {}
                button.textContent = "Notifications enabled ✓ / నోటిఫికేషన్లు ప్రారంభమయ్యాయి";
                button.disabled = true;
                later.disabled = true;
                if (disableButton) disableButton.hidden = false;
                showStatus("Success! This device is registered and can receive Penubaka announcements. / విజయవంతం! ఈ పరికరం పెనుబాక ప్రకటనలకు నమోదు చేయబడింది.");
              });
            });
          });
        });
      });
    });
  }

  function startEnablePush() {
    button.disabled = true;
    later.disabled = true;
    showStatus("Please allow notifications when your browser asks. / బ్రౌజర్ అడిగినప్పుడు అనుమతించండి.");
    enablePush().catch(function (error) {
      console.error("Push subscription:", error);
      showStatus((error.message || "Could not register this device.") + " / అవసరమైతే బ్రౌజర్ సెట్టింగ్స్‌లో అనుమతి మార్చి మళ్లీ ప్రయత్నించండి.");
      button.disabled = false;
      later.disabled = false;
    });
  }

  function syncExistingSubscription() {
    if (!hasPushSupport() || Notification.permission !== "granted") return;
    navigator.serviceWorker.getRegistration("/").then(function (registration) {
      if (!registration) return null;
      return registration.pushManager.getSubscription().then(function (subscription) {
        if (!subscription) return null;
        // Repair old devices that have a browser subscription but were never
        // successfully saved in the server's push_subscriptions table.
        var id = visitorId();
        return registerOnServer(id, subscription).then(function () {
          button.disabled = true;
          button.textContent = "Notifications enabled ✓ / నోటిఫికేషన్లు ప్రారంభమయ్యాయి";
          later.disabled = true;
          if (disableButton) disableButton.hidden = false;
          showStatus("This device is registered for Penubaka updates. / ఈ పరికరం పెనుబాక అప్‌డేట్లకు నమోదు చేయబడింది.");
        });
      });
    }).catch(function (error) {
      console.warn("Could not sync existing push subscription:", error);
    });
  }

  if (disableButton) {
    disableButton.addEventListener("click", function () {
      disableButton.disabled = true;
      navigator.serviceWorker.getRegistration("/").then(function (registration) {
        return registration ? registration.pushManager.getSubscription() : null;
      }).then(function (subscription) {
        if (!subscription) return null;
        var endpoint = subscription.endpoint;
        return subscription.unsubscribe().then(function () {
          return callFunction({ action: "unsubscribe", endpoint: endpoint });
        });
      }).then(function () {
        disableButton.hidden = true;
        disableButton.disabled = false;
        button.disabled = false;
        button.textContent = "Enable notifications / నోటిఫికేషన్లు ప్రారంభించండి";
        later.disabled = false;
        showStatus("Notifications turned off for this device. / ఈ పరికరంలో నోటిఫికేషన్లు ఆపివేయబడ్డాయి.");
      }).catch(function (error) {
        disableButton.disabled = false;
        showStatus("Could not turn off notifications: " + error.message);
      });
    });
  }

  var alreadyInterested = false;
  try { alreadyInterested = localStorage.getItem(INTEREST_KEY) === "yes"; } catch (_) {}
  if (alreadyInterested) {
    button.textContent = "Enable / Re-enable notifications";
    showStatus("Tap to check or re-enable notifications on this device. / ఈ పరికరంలో నోటిఫికేషన్లను ప్రారంభించడానికి నొక్కండి.");
  }

  button.addEventListener("click", startEnablePush);
  later.addEventListener("click", function () {
    var section = document.querySelector(".notification-interest");
    if (section) section.setAttribute("hidden", "");
  });

  syncExistingSubscription();
})();