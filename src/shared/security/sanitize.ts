import sanitizeHtml from 'sanitize-html';

/** Strip every HTML tag/attribute from free text before it is stored (XSS defence in depth). */
export function cleanText(input: string, max = 300): string {
  const stripped = sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
  return stripped.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanOptional(input: string | undefined | null, max = 300): string | undefined {
  if (!input) return undefined;
  const v = cleanText(input, max);
  return v.length ? v : undefined;
}

/** Escape text for safe inclusion in an HTML email body. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
