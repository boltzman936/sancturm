/**
 * Falls back to the PDF's own file name when a CR/admin leaves the
 * Title field blank — "chapter-3-notes.pdf" becomes "chapter-3-notes"
 * rather than forcing a title to be typed for something the file
 * itself already names.
 */
export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^./]+$/, "");
}
