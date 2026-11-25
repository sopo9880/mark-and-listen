// Applies the saved light/dark choice before first paint (classic script, not a module).
try {
  var saved = localStorage.getItem("ml-theme");
  if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
} catch (e) {
  // Storage can be unavailable; the system theme applies.
}
