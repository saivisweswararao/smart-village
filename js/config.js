// Browser-safe Supabase configuration only. Never put a service-role key here.
window.SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
window.SUPABASE_PUBLISHABLE_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
window.supabaseClient = (window.supabase && !window.SUPABASE_URL.includes("YOUR-PROJECT") && !window.SUPABASE_PUBLISHABLE_KEY.startsWith("YOUR_"))
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY)
  : null;