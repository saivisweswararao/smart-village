(function () {
  const footer = document.querySelector("footer.site-footer");
  if (!footer) return;

  const credit = document.createElement("div");
  credit.className = "site-credit";
  credit.innerHTML = '<span class="visitor-count">👥 Visitors: <strong id="site-visitor-count">—</strong></span><span class="developer-credit">Developed by <strong>Natural Youth</strong></span>';
  footer.appendChild(credit);

  const output = credit.querySelector("#site-visitor-count");
  const client = window.supabaseClient;
  if (!client) {
    output.textContent = "—";
    return;
  }

  // Keep the existing total page-load counter unchanged.
  client.rpc("increment_site_visitors").then(({ data, error }) => {
    if (error) throw error;
    output.textContent = Number(data || 0).toLocaleString("en-IN");
  }).catch((error) => {
    console.error("Visitor counter:", error.message);
    output.textContent = "Unavailable";
  });

  // Count this browser profile only once, even after repeated page refreshes.
  // This uses a random first-party browser ID, not an IP address or fingerprint.
  const UNIQUE_VISITOR_KEY = "penubaka_unique_visitor_id";
  function getUniqueVisitorId() {
    try {
      let id = localStorage.getItem(UNIQUE_VISITOR_KEY);
      if (!id) {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
          id = window.crypto.randomUUID();
        } else if (window.crypto && typeof window.crypto.getRandomValues === "function") {
          const bytes = new Uint8Array(16);
          window.crypto.getRandomValues(bytes);
          bytes[6] = (bytes[6] & 0x0f) | 0x40;
          bytes[8] = (bytes[8] & 0x3f) | 0x80;
          id = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
        } else {
          return null;
        }
        localStorage.setItem(UNIQUE_VISITOR_KEY, id);
      }
      return id;
    } catch (error) {
      console.warn("Unique visitor ID could not be stored in this browser.");
      return null;
    }
  }

  const uniqueVisitorId = getUniqueVisitorId();
  if (uniqueVisitorId) {
    client.rpc("register_site_unique_visitor", { p_visitor_id: uniqueVisitorId })
      .then(({ error }) => {
        if (error) console.error("Unique visitor registration:", error.message);
      });
  }
})();