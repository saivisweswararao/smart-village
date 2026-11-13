(() => {
  const form = document.getElementById("admin-announcement-form");
  if (!form) return;
  const message = document.getElementById("announcement-admin-message");
  const draftButton = document.getElementById("announcement-save-draft");
  const publishButton = document.getElementById("announcement-publish");

  const value = id => document.getElementById(id).value.trim();
  const setMessage = text => { message.textContent = text; };

  async function save(status) {
    if (!window.supabaseClient) throw new Error("Supabase is not configured.");
    const titleTe = value("announcement-title-te");
    const titleEn = value("announcement-title-en");
    const bodyTe = value("announcement-body-te");
    const bodyEn = value("announcement-body-en");
    if (!titleTe || !titleEn) throw new Error("Please enter the title in both Telugu and English.");

    const { data: village, error: villageError } = await window.supabaseClient
      .from("villages").select("id").eq("slug", "penubaka").single();
    if (villageError || !village) throw new Error("Could not find the Penubaka village record.");

    const { data: announcement, error } = await window.supabaseClient
      .from("announcements")
      .insert({
        village_id: village.id,
        title_te: titleTe,
        title_en: titleEn,
        body_te: bodyTe || null,
        body_en: bodyEn || null,
        status,
        published_at: status === "published" ? new Date().toISOString() : null
      })
      .select("id").single();
    if (error) throw new Error(error.message);

    if (status === "draft") {
      setMessage("Draft saved. It is not public and no notification was sent.");
      form.reset();
      return;
    }

    setMessage("Announcement published. Sending push notifications…");
    const { data: sessionData } = await window.supabaseClient.auth.getSession();
    const session = sessionData?.session;
    if (!session?.access_token) {
      setMessage("Announcement published, but the admin session was not available to send notifications.");
      form.reset();
      return;
    }

    try {
      const response = await fetch(window.SUPABASE_URL + "/functions/v1/push-notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": window.SUPABASE_PUBLISHABLE_KEY,
          "Authorization": "Bearer " + session.access_token
        },
        body: JSON.stringify({
          action: "send",
          title: titleTe || titleEn,
          message: bodyTe || bodyEn || titleEn,
          url: "/announcements.html",
          announcementId: announcement.id
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "Push service returned " + response.status);
      setMessage("Published successfully. Push sent to " + result.sent + " device(s)." +
        (result.failed ? " Failed: " + result.failed + "." : "") +
        (result.removed ? " Expired subscriptions removed: " + result.removed + "." : ""));
    } catch (error) {
      console.error("Push send error:", error);
      setMessage("Announcement is public, but push delivery failed: " + error.message + ". Please check Edge Function setup.");
    }
    form.reset();
  }

  async function run(status, button) {
    const other = button === draftButton ? publishButton : draftButton;
    button.disabled = true;
    other.disabled = true;
    setMessage(status === "published" ? "Publishing…" : "Saving draft…");
    try { await save(status); }
    catch (error) { setMessage(error.message || "Could not save the announcement."); }
    finally { button.disabled = false; other.disabled = false; }
  }

  draftButton?.addEventListener("click", () => run("draft", draftButton));
  publishButton?.addEventListener("click", () => run("published", publishButton));
})();