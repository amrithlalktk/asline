// Day / night theme. The choice is kept in localStorage ("light"/"dark");
// with no choice saved it follows the device setting. Print pages always
// stay light (they're a preview of paper).
export const THEME_KEY = "asline-theme";

// Runs in <head> before the page paints, so there's no light flash.
export const THEME_INIT_SCRIPT = `(function(){try{
if(location.pathname.indexOf('/print')===0)return;
var t=localStorage.getItem('${THEME_KEY}');
if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
if(t==='dark')document.documentElement.classList.add('dark');
}catch(e){}})();`;

export function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private mode etc. — still applies for this visit
  }
}
