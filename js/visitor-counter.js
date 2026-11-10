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

  const storageKey = "penubaka_visitor_counted_v1";
  const isFirstVisit = !localStorage.getItem(storageKey);
  const rpcName = isFirstVisit ? "increment_site_visitors" : "get_site_visitor_count";

  client.rpc(rpcName).then(({ data, error }) => {
    if (error) throw error;
    if (isFirstVisit) localStorage.setItem(storageKey, "1");
    output.textContent = Number(data || 0).toLocaleString("en-IN");
  }).catch((error) => {
    console.error("Visitor counter:", error.message);
    output.textContent = "Unavailable";
  });
})();