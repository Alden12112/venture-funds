export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());
}

export function isValidInternationalPhone(value: string) {
  const normalized = value.replace(/[\s().-]/g, '');
  return /^\+?[1-9]\d{7,14}$/.test(normalized);
}

export function maskEmail(value: string) {
  const [local, domain] = value.split('@');
  if (!local || !domain) return value;
  return `${local.slice(0, 2)}***@${domain}`;
}

export async function hashSecret(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('');
}
