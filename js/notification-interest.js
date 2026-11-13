(() => {
  const yes = document.getElementById("notification-interest-yes");
  const later = document.getElementById("notification-interest-later");
  const message = document.getElementById("notification-interest-message");
  if (!yes || !later || !message) return;

  const KEY = "penubaka_unique_visitor_id";
  function getVisitorId() {
    try {
      let id = localStorage.getItem(KEY);
      if (!id) {
        if (!window.crypto || typeof window.crypto.randomUUID !== "function") return null;
        id = window.crypto.randomUUID();
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch (_) {
      return null;
    }
  }

  let saved = null;
  try { saved = localStorage.getItem("penubaka_notification_interest_recorded"); } catch (_) {}
  if (saved === "yes") {
    message.textContent = "Thank you! Your interest has already been recorded. / ధన్యవాదాలు! మీ ఆసక్తి ఇప్పటికే నమోదైంది.";
    yes.disabled = true;
    yes.textContent = "Interest recorded / ఆసక్తి నమోదైంది";
  }

  yes.addEventListener("click", async () => {
    if (!window.supabaseClient) {
      message.textContent = "Please try again later. / దయచేసి కొంతసేపటి తర్వాత ప్రయత్నించండి.";
      return;
    }
    const visitorId = getVisitorId();
    if (!visitorId) {
      message.textContent = "Browser storage is unavailable. Please enable it and try again. / బ్రౌజర్ స్టోరేజ్ అందుబాటులో లేదు.";
      return;
    }
    yes.disabled = true;
    later.disabled = true;
    message.textContent = "Saving your response… / నమోదు చేస్తున్నాము…";
    try {
      const { data, error } = await window.supabaseClient.rpc("register_notification_interest", {
        p_village_slug: "penubaka",
        p_visitor_id: visitorId
      });
      if (error) throw error;
      try { localStorage.setItem("penubaka_notification_interest_recorded", "yes"); } catch (_) {}
      yes.textContent = "Interest recorded / ఆసక్తి నమోదైంది";
      message.textContent = "Thank you! Your interest has been recorded. This does not enable browser notifications yet. / ధన్యవాదాలు! మీ ఆసక్తి నమోదైంది. దీనివల్ల బ్రౌజర్ నోటిఫికేషన్లు ఇంకా ప్రారంభం కావు.";
      if (typeof data === "number") message.textContent += " Total interested: " + data.toLocaleString("en-IN");
    } catch (error) {
      console.error("Notification interest:", error.message);
      message.textContent = "Could not save right now. Please try again. / నమోదు కాలేదు. మళ్లీ ప్రయత్నించండి.";
      yes.disabled = false;
      later.disabled = false;
    }
  });

  later.addEventListener("click", () => {
    document.querySelector(".notification-interest")?.setAttribute("hidden", "");
  });
})();