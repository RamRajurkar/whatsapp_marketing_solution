export function formatIndianPhone(phone: string | undefined | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) {
    return `+91 ${digits.substring(2, 7)} ${digits.substring(7)}`;
  }
  return `+${digits}`;
}
