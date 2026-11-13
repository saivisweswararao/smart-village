(() => {
  const $ = id => document.getElementById(id);
  const manager = $("announcement-manager");
  if (!manager) return;
  const status = text => { $("announcement-message").textContent = text; };
  const value = id => $(id).value.trim();
  const db = window.supabaseClient;
  let villageId = null;
  let selectedPhoto = null;
  const BUCKET = "announcement-photos";

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

  function renderPhotoPreview(file) {
    const wrap = $("photo-preview-wrap"), img = $("photo-preview");
    if (img.dataset.objectUrl) URL.revokeObjectURL(img.dataset.objectUrl);
    if (!file) { wrap.hidden = true; img.removeAttribute("src"); delete img.dataset.objectUrl; return; }
    const url = URL.createObjectURL(file);
    img.src = url; img.dataset.objectUrl = url; wrap.hidden = false;
  }

  $("photo").addEventListener("change", () => {
    const file = $("photo").files?.[0] || null;
    if (!file) { selectedPhoto = null; renderPhotoPreview(null); return; }
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) {
      $("photo").value = ""; selectedPhoto = null; renderPhotoPreview(null);
      status("Choose a JPG, PNG or WebP image."); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      $("photo").value = ""; selectedPhoto = null; renderPhotoPreview(null);
      status("Photo must be 5 MB or smaller."); return;
    }
    selectedPhoto = file; renderPhotoPreview(file); status("");
  });
  $("remove-photo").addEventListener("click", () => {
    selectedPhoto = null; $("photo").value = ""; renderPhotoPreview(null);
  });

  async function uploadPhoto(file) {
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = villageId + "/" + Date.now() + "-" + crypto.randomUUID() + "." + ext;
    const { error } = await db.storage.from(BUCKET).upload(path, file, {
      contentType: file.type, cacheControl: "31536000", upsert: false
    });
    if (error) throw new Error("Photo upload failed: " + error.message + ". Check the announcement photo storage setup in Supabase.");
    return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function loadAnnouncements() {
    const host = $("announcement-records");
    host.replaceChildren();
    const { data, error } = await db.from("announcements")
      .select("id,title_en,body_en,photo_url,status,published_at,created_at")
      .eq("village_id", villageId).order("created_at", { ascending: false }).limit(100);
    if (error) { host.textContent = "Could not load announcements: " + error.message; return; }
    if (!data?.length) { host.textContent = "No announcements yet. Add your first village update above."; return; }
    for (const item of data) {
      const card = document.createElement("article"); card.className = "announcement-card admin-announcement-card";
      if (item.photo_url) { const img = document.createElement("img"); img.src = item.photo_url; img.alt = ""; img.className = "admin-announcement-thumb"; card.append(img); }
      const heading = document.createElement("h3"); heading.textContent = item.title_en;
      const desc = document.createElement("p"); desc.textContent = item.body_en || "";
      const meta = document.createElement("small"); meta.className = "muted";
      meta.textContent = "Status: " + item.status + " · " + new Date(item.published_at || item.created_at).toLocaleString("en-IN");
      card.append(heading, desc, meta);
      if (item.status === "draft") {
        const publish = document.createElement("button"); publish.type = "button"; publish.className = "button";
        publish.textContent = "Publish & notify"; publish.addEventListener("click", () => publishDraft(item, publish)); card.append(publish);
      } else if (item.status === "published") {
        const archive = document.createElement("button"); archive.type = "button"; archive.className = "button button-secondary";
        archive.textContent = "Archive"; archive.addEventListener("click", () => archiveAnnouncement(item.id, archive)); card.append(archive);
      }
      host.append(card);
    }
  }

  async function sendPush(item) {
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) throw new Error("Admin session expired. Please sign in again.");
    const response = await fetch(window.SUPABASE_URL + "/functions/v1/push-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": window.SUPABASE_PUBLISHABLE_KEY, "Authorization": "Bearer " + session.access_token },
      body: JSON.stringify({
        action: "send", title: item.title_en, message: item.body_en || item.title_en,
        url: "/announcements.html", image: item.photo_url || null, announcementId: item.id
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || "Push service returned " + response.status);
    return result;
  }

  async function saveAnnouncement(state) {
    const title = value("title"), description = value("description");
    if (!title || !description) throw new Error("Enter both a title and description.");
    let photoUrl = null;
    if (selectedPhoto) photoUrl = await uploadPhoto(selectedPhoto);
    const payload = {
      village_id: villageId, title_en: title, title_te: null,
      body_en: description, body_te: null, photo_url: photoUrl,
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
      try { const result = await sendPush(data); alert("Published! Notification sent to " + result.sent + " device(s)."); }
      catch (pushError) { alert("Published on the website, but push delivery failed: " + pushError.message); }
      await loadAnnouncements();
    } catch (error) { alert("Could not publish: " + error.message); button.disabled = false; }
  }

  async function archiveAnnouncement(id, button) {
    if (!confirm("Archive this announcement? It will no longer appear publicly.")) return;
    button.disabled = true;
    const { error } = await db.from("announcements").update({ status: "archived" }).eq("id", id);
    if (error) { alert("Could not archive announcement: " + error.message); button.disabled = false; return; }
    await loadAnnouncements();
  }

  async function save(state, button) {
    $("save-draft").disabled = true; $("publish-announcement").disabled = true;
    status(state === "draft" ? "Saving draft…" : "Saving and publishing announcement…");
    try {
      const item = await saveAnnouncement(state);
      if (state === "draft") status("Draft saved. It is not public and no notification was sent.");
      else {
        status("Published. Sending village notification…");
        try {
          const result = await sendPush(item);
          status("Published successfully · " + result.sent + " notification(s) sent" +
            (result.failed ? " · " + result.failed + " failed" : "") + ".");
        } catch (pushError) { status("Announcement is published, but push delivery failed: " + pushError.message); }
      }
      $("announcement-form").reset(); selectedPhoto = null; renderPhotoPreview(null);
      await loadAnnouncements();
    } catch (error) { status(error.message || "Could not save announcement."); }
    finally { $("save-draft").disabled = false; $("publish-announcement").disabled = false; }
  }

  $("save-draft").addEventListener("click", e => save("draft", e.currentTarget));
  $("publish-announcement").addEventListener("click", e => save("published", e.currentTarget));
  initialize();
})();