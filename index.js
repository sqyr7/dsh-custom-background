/**
 * Host half of the custom-background bundle.
 *
 * Everything this plugin does lives in the Client half: the picture the user
 * imports is decoded and kept in the browser's IndexedDB, and the panels are
 * repainted from a stylesheet the Client entry injects. No host service, no
 * HTTP route, no file on disk — so the host half has nothing to start and
 * nothing to clean up. It exists because a bundle entry must resolve, and
 * because keeping the split honest makes it obvious that no data ever leaves
 * the renderer process.
 */
export function apply() {}
