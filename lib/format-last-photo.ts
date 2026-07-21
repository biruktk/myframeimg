/** Replaces `{hours}` in localized templates from `i18n-app` home.lastPhotoTemplate. */
export function formatLastPhotoLine(template: string, hours: number): string {
  return template.replace(/\{hours\}/g, String(hours));
}
