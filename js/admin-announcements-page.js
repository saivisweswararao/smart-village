(() => {
  const $ = id => document.getElementById(id);
  const manager = $("announcement-manager");
  if (!manager) return;
  const status = text => { $("announcement-message").textContent = text; };
  const value = id => $(id).value.trim();
  const db = window.supabaseClient;
  let villageId = null;

  function showAccessError(message) {
    $("announcement-access-error").hidden = false;
    $("announcement-access-message").textContent = message;
  }

  async function initialize() {
    if (!db) return showAccessError("Supabase configuration is unavailable.");
    const { data: { session }, error: sessionError } = await db.auth.getSession();
    if (sessionError || !session) return showAccessError("Please sign in through the administrator portal first.");
    const { data: allowed, error: accessError } = await db.rpc("admin_check_access");
    if (accessError || allowed !== true) return showAccessError("This account is not authorized to manage announcements.");
    const { data: village, error } = await db.from("villages").select("id").eq("slug", "penubaka").single();
    if (error || !village) return showAccessError("The Penubaka village record could not be loaded: " + (error?.message || "not found"));
    villageId = village.id;
    manager.hidden = false;
    await loadAnnouncements();
  }

  async function loadAnnouncements() {
    const host = $("announcement-records");
    host.replaceChildren();
    const { data, error } = await db.from("announcements").select("id,title_te,title_en,body_te,body_en,status,published_at,created_at")
      .eq("village_id", villageId).order("created_at", { ascending: false }).limit(100);
    if (error) {
      host.textContent = "Could not load announcements: " + error.message;
      return;
    }
    if (!data?.length) {
      host.textContent = "No announcements saved yet.";
      return;
    }
    for (const item of data) {
      const card = document.createElement("article");
      card.className = "announcement-card";
      const heading = document.createElement("h3");
      heading.textContent = item.title_te + " | " + item.title_en;
      const desc = document.createElement("p");
      desc.textContent = [item.body_te, item.body_en].filter(Boolean).join("\n");
      const meta = document.createElement("small");
      meta.className = "muted";
      meta.textContent = "Status: " + item.status + " · " + new Date(item.published_at || item.created_at).toLocaleString("en-IN");
      card.append(heading, desc, meta);
      if (item.status === "draft") {
        const publish = document.createElement("button");
        publish.type = "button";
        publish.className = "button";
        publish.textContent = "Publish & notify";
        publish.addEventListener("click", () => publishDraft(item, publish));
        card.append(publish);
      } else if (item.status === "published") {
        const archive = document.createElement("button");
        archive.type = "button";
        archive.className = "button button-secondary";
        archive.textContent = "Archive";
        archive.addEventListener("click", () => archiveAnnouncement(item.id, archive));
        card.append(archive);
      }
      host.append(card);
    }
  }

  async function sendPush(item) {
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) throw new Error("Admin session expired. Please sign in again.");
    const title = (item.title_en || item.title_te).slice(0, 100);
    const message = [item.body_te, item.body_en].filter(Boolean).join(" | ").slice(0, 240) || (item.title_te + " | " + item.title_en).slice(0, 240);
    const response = await fetch(window.SUPABASE_URL + "/functions/v1/push-notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": window.SUPABASE_PUBLISHABLE_KEY,
        "Authorization": "Bearer " + session.access_token
      },
      body: JSON.stringify({
        action: "send", title, message,
        url: $("notification-page").value || "/announcements.html",
        announcementId: item.id
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || "Push service returned " + response.status);
    return result;
  }

  async function saveAnnouncement(state) {
    const titleTe = value("title-te"), titleEn = value("title-en");
    if (!titleTe || !titleEn) throw new Error("Enter the title in both Telugu and English.");
    const payload = {
      village_id: villageId, title_te: titleTe, title_en: titleEn,
      body_te: value("body-te") || null, body_en: value("body-en") || null,
      status: state, published_at: state === "published" ? new Date().toISOString() : null
    };
    const { data, error } = await db.from("announcements").insert(payload).select("*").single();
    if (error) throw new Error("Could not save announcement: " + error.message);
    return data;
  }

  async function publishDraft(item, button) {
    button.disabled = true;
    try {
      const { data, error } = await db.from("announcements").update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", item.id).select("*").single();
      if (error) throw error;
      try {
        const result = await sendPush(data);
        alert("Announcement published. Push notifications sent to " + result.sent + " device(s).");
      } catch (pushError) {
        alert("Announcement is published on the website, but push delivery failed: " + pushError.message);
      }
      await loadAnnouncements();
    } catch (error) {
      alert("Could not publish: " + error.message);
      button.disabled = false;
    }
  }

  async function archiveAnnouncement(id, button) {
    if (!confirm("Archive this announcement? It will no longer appear publicly.")) return;
    button.disabled = true;
    const { error } = await db.from("announcements").update({ status: "archived" }).eq("id", id);
    if (error) {
      alert("Could not archive announcement: " + error.message);
      button.disabled = false;
      return;
    }
    await loadAnnouncements();
  }

  async function save(state, button) {
    button.disabled = true;
    $("save-draft").disabled = true;
    $("publish-announcement").disabled = true;
    status(state === "draft" ? "Saving draft…" : "Saving announcement…");
    try {
      const item = await saveAnnouncement(state);
      if (state === "draft") {
        status("Draft saved. It is not public and no notification was sent.");
      } else {
        status("Announcement saved and published. Sending push notifications…");
        try {
          const result = await sendPush(item);
          status("Published successfully. Push sent to " + result.sent + " device(s)." +
            (result.failed ? " Failed: " + result.failed + "." : "") +
            (result.removed ? " Expired subscriptions removed: " + result.removed + "." : ""));
        } catch (pushError) {
          status("Announcement is published and visible on the public page, but push delivery failed: " + pushError.message);
        }
      }
      $("announcement-form").reset();
      await loadAnnouncements();
    } catch (error) {
      status(error.message || "Could not save announcement.");
    } finally {
      button.disabled = false;
      $("save-draft").disabled = false;
      $("publish-announcement").disabled = false;
    }
  }

  $("save-draft").addEventListener("click", e => save("draft", e.currentTarget));
  $("publish-announcement").addEventListener("click", e => save("published", e.currentTarget));
  initialize();
})();