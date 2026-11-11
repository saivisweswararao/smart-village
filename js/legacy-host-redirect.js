/* Legacy URL migration.
 * Keep this disabled until the new workers.dev hostname is active and tested.
 * When ready, change ENABLE_LEGACY_REDIRECT to true.
 */
(() => {
  const ENABLE_LEGACY_REDIRECT = false;
  const OLD_HOST = "smart-village.viralam.workers.dev";
  const NEW_HOST = "smart-village.penubaka.workers.dev";

  if (!ENABLE_LEGACY_REDIRECT || window.location.hostname !== OLD_HOST) return;

  const destination = new URL(window.location.href);
  destination.protocol = "https:";
  destination.hostname = NEW_HOST;
  destination.port = "";
  window.location.replace(destination.toString());
})();
