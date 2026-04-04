/**
 * mask.util.ts — Data masking utilities for PII fields
 * Hides sensitive information for roles that should not see full data.
 */

/**
 * Mask a phone number: '0987654321' → '098****321'
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const clean = phone.trim();
  if (clean.length <= 6) return '***';
  const start = clean.slice(0, 3);
  const end = clean.slice(-3);
  const middle = '*'.repeat(Math.max(clean.length - 6, 3));
  return `${start}${middle}${end}`;
}

/**
 * Mask an email address: 'user@gmail.com' → 'us**@gmail.com'
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  const visible = local.slice(0, 2);
  const masked = '*'.repeat(Math.min(local.length - 2, 4));
  return `${visible}${masked}@${domain}`;
}

/**
 * Mask an address: '123 Nguyễn Trãi, Phường 5, Quận 5' → '123 Ng****...'
 */
export function maskAddress(address: string | null | undefined): string {
  if (!address) return '';
  const clean = address.trim();
  if (clean.length <= 8) return clean.slice(0, 3) + '***';
  return clean.slice(0, 8) + '***';
}

/**
 * Apply masking based on field type
 */
export function maskData(value: string | null | undefined, type: 'phone' | 'email' | 'address'): string {
  switch (type) {
    case 'phone': return maskPhone(value);
    case 'email': return maskEmail(value);
    case 'address': return maskAddress(value);
    default: return '***';
  }
}

/**
 * Roles that receive FULL (decrypted) PII data
 */
export const FULL_PII_ROLES = ['SUPER_ADMIN', 'MANAGER', 'STAFF_POS'];

/**
 * Roles that only see MASKED PII data
 */
export const MASKED_PII_ROLES = ['STAFF_INVENTORY'];

/**
 * Determine if a role can see full PII
 */
export function canSeeFulPii(roleCode: string): boolean {
  return FULL_PII_ROLES.includes(roleCode);
}
