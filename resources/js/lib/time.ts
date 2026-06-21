// Duration formatting: minutes → "H:MM" (e.g. 105 → "1:45", 308 → "5:08").

export function hm(minutes: number | string | null | undefined): string {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** "1 jam 45 menit" style. */
export function hmLong(minutes: number | string | null | undefined): string {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return [h > 0 ? `${h} jam` : '', mm > 0 ? `${mm} menit` : ''].filter(Boolean).join(' ') || '0 menit';
}

/** Exact minutes between two "HH:MM" times (handles crossing midnight) — for live preview. */
export function minutesBetween(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if ([sh, sm, eh, em].some((x) => Number.isNaN(x))) return 0;
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60;
    return mins;
}
