/**
 * Falls back to the PDF's own file name when a CR/admin leaves the
 * Title field blank — "chapter-3-notes.pdf" becomes "chapter-3-notes"
 * rather than forcing a title to be typed for something the file
 * itself already names.
 */
export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^./]+$/, "");
}

/**
 * True for a name that's the file's own auto-generated identifier
 * (a screenshot tool's random hash, a WhatsApp media id, a UUID), not
 * something a person actually named — e.g. "ca9e7d8c-314c-4d4c-9655-
 * a5351133f6c4" or "HO8nBszXgAA4jrq". titleFromFileName() is doing
 * exactly what it's supposed to with a name like that; the fix is
 * catching it and using a more useful fallback instead (see
 * CRUploadForm's titleForFile), not changing what this function does.
 * Deliberately conservative — a real filename with hyphens, spaces, or
 * underscores ("chapter-3-notes", "DSA_unit_1") never matches, since
 * those separators are exactly what a human-chosen name has and an
 * app-generated id doesn't.
 */
export function looksLikeMeaninglessName(name: string): boolean {
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID_PATTERN.test(name)) return true;
  // One long run of letters+digits with no separators and mixed case —
  // the shape of an auto-generated id, not a typed-out name.
  return /^[A-Za-z0-9]{10,}$/.test(name) && /[0-9]/.test(name) && /[A-Za-z]/.test(name);
}
