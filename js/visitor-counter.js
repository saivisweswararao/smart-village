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

  // Count every page load, including repeat visits from the same browser.
  client.rpc("increment_site_visitors").then(({ data, error }) => {
    if (error) throw error;
    output.textContent = Number(data || 0).toLocaleString("en-IN");
  }).catch((error) => {
    console.error("Visitor counter:", error.message);
    output.textContent = "Unavailable";
  });
})();