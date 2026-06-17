export function defaultDatetimeLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(19, 0, 0, 0);
  return dateToDatetimeLocal(d);
}

export function dateToDatetimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToDate(value: string): Date {
  return new Date(value);
}

export function formatFriendlyDatetime(value: string): string {
  const d = datetimeLocalToDate(value);
  if (Number.isNaN(d.getTime())) return 'Pick a date and time';
  return d.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDatetimeParts(value: string): { dateLine: string; timeLine: string } {
  const d = datetimeLocalToDate(value);
  if (Number.isNaN(d.getTime())) {
    return { dateLine: 'Pick a date', timeLine: 'Pick a time' };
  }
  return {
    dateLine: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    timeLine: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}
