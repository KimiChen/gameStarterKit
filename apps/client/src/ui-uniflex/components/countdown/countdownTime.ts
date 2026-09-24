/** Date-only and timezone-free date/time strings use local time; ISO timezone offsets stay absolute. */
export function parseCountdownTarget(target: Date | number | string): number {
    if (target instanceof Date) return target.getTime();
    if (typeof target === 'number') return target;
    const value = target.trim();
    if (/^\d{10}$/.test(value)) return Number(value) * 1000;
    if (/^\d{13}$/.test(value)) return Number(value);
    const local = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(value);
    if (local) {
        const year = Number(local[1]);
        const month = Number(local[2]);
        const day = Number(local[3]);
        const hour = Number(local[4] ?? 0);
        const minute = Number(local[5] ?? 0);
        const second = Number(local[6] ?? 0);
        const millisecond = Number((local[7] ?? '0').padEnd(3, '0'));
        const date = new Date(year, month - 1, day, hour, minute, second, millisecond);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
            && date.getHours() === hour && date.getMinutes() === minute && date.getSeconds() === second
            ? date.getTime() : NaN;
    }
    return /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;
}

/** Hours/minutes accumulate when their larger unit is omitted from the format. */
export function formatCountdown(remainingSeconds: number, format = 'HH:mm:ss'): string {
    const total = Number.isFinite(remainingSeconds) ? Math.max(0, Math.floor(remainingSeconds)) : 0;
    const hasDays = /D{1,2}/.test(format);
    const hasHours = /H{1,2}/.test(format);
    const hasMinutes = /m{1,2}/.test(format);
    const values: Record<string, number> = {
        D: Math.floor(total / 86400),
        H: hasDays ? Math.floor(total / 3600) % 24 : Math.floor(total / 3600),
        m: hasHours ? Math.floor(total / 60) % 60 : Math.floor(total / 60),
        s: hasMinutes ? total % 60 : total,
    };
    return format.replace(/DD|D|HH|H|mm|m|ss|s/g, (token) => {
        const value = values[token[0]];
        return token.length === 2 ? String(value).padStart(2, '0') : String(value);
    });
}
