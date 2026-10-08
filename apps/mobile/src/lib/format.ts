import { formatMoney } from '@splitease/shared';

export { formatMoney };

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Oct" (or "12 Oct 2025" when not the current year). Locale-independent for consistent output. */
export function formatDate(iso: string | Date, now = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function monthLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const full = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][d.getMonth()];
  return d.getFullYear() === now.getFullYear() ? `${full}` : `${full} ${d.getFullYear()}`;
}

export function relativeTime(iso: string, now = new Date()): string {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 7 * 86_400) return `${Math.round(diff / 86_400)}d ago`;
  return formatDate(iso, now);
}

/** Local calendar day as YYYY-MM-DD. */
export function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse YYYY-MM-DD as local noon (avoids timezone day shifts). */
export function fromDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "you owe ₹120" / "you are owed ₹80" / "settled up" */
export function balanceLabel(
  net: number,
  currency: string,
): { label: string; tone: 'positive' | 'negative' | 'neutral' } {
  if (net > 0) return { label: `you are owed ${formatMoney(net, currency)}`, tone: 'positive' };
  if (net < 0) return { label: `you owe ${formatMoney(-net, currency)}`, tone: 'negative' };
  return { label: 'settled up', tone: 'neutral' };
}
