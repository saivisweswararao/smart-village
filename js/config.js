// Browser-safe Supabase configuration only. Never put a service-role key here.
window.SUPABASE_URL = "https://sxyfaujflhzzheaeaspw.supabase.co";
window.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_uBnBD6qBHDm_RtPmJD3-wg_rvEUZPeM";
window.supabaseClient = (window.supabase && !window.SUPABASE_URL.includes("YOUR-PROJECT") && !window.SUPABASE_PUBLISHABLE_KEY.startsWith("YOUR_"))
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY)
  : null;
