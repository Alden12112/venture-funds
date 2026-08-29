/**
 * Build the two optional external support links from administrator-managed
 * values. The UI stores a phone number and a Telegram handle, never a
 * user-provided URL, so an editor cannot turn the support buttons into an
 * arbitrary navigation target.
 */
export function buildWhatsappUrl(value: string | null | undefined) {
  const digits = String(value ?? '').trim().replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return `https://wa.me/${digits}`;
}

export function buildTelegramUrl(value: string | null | undefined) {
  const handle = String(value ?? '').trim().replace(/^@+/, '');
  if (!/^[A-Za-z0-9_]{3,64}$/.test(handle)) return '';
  return `https://t.me/${handle}`;
}
