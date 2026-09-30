/** True when the app runs as an installed home screen app instead of a browser tab. */
export function isStandalone(): boolean {
  if (navigator.standalone === true) {
    return true;
  }
  return window.matchMedia('(display-mode: standalone)').matches;
}
