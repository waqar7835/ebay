/**
 * Opens a file fetched with the login (e.g. a shipping label or receipt, which aren't public links) in a new tab.
 * The tab is opened right away, inside the click, so pop-up blockers allow it, then filled once the file arrives.
 * `print` opens the browser's print dialog for it.
 */
export async function openBlobInNewTab(load: () => Promise<Blob>, options: { print?: boolean } = {}) {
  const win = window.open("", "_blank");
  if (!win) throw new Error("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
  try {
    const url = URL.createObjectURL(await load());
    win.location.href = url;
    if (options.print) setTimeout(() => win.print(), 1000);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    win.close();
    throw err;
  }
}
