/** Hands a file to the iPadOS share sheet ("In Dateien sichern") or downloads it. */

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export function canShareFile(file: File): boolean {
  const nav = globalThis.navigator;
  if (typeof nav?.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function downloadFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Safari starts the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Must run directly in a tap handler (the share sheet needs a user gesture), so the file has
 * to be ready before. Falls back to a download where files cannot be shared.
 */
export async function shareFile(file: File): Promise<ShareOutcome> {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // NotAllowedError (gesture expired) or a share target failure: download instead.
    }
  }
  downloadFile(file, file.name);
  return 'downloaded';
}
