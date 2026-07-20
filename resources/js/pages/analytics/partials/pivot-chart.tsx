import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type ChartType = 'bar' | 'line' | 'heatmap';

export interface ChartSeries {
    key: string;
    label: string;
}

export interface ChartDatum {
    name: string;
    [seriesKey: string]: string | number;
}

// Palet selaras token shadcn (fallback ke warna tetap agar konsisten light/dark).
const COLORS = ['#6366f1', '#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#84cc16', '#f97316'];

const short = (n: number) => {
    const x = Number(n || 0);
    if (Math.abs(x) >= 1e9) return (x / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
    if (Math.abs(x) >= 1e6) return (x / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    if (Math.abs(x) >= 1e3) return (x / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' rb';
    return x.toLocaleString('id-ID');
};

function heatColor(v: number, max: number): string {
    if (max <= 0) return 'transparent';
    const t = Math.max(0, Math.min(1, v / max));
    // interpolasi putih → indigo
    const r = Math.round(255 + t * (99 - 255));
    const g = Math.round(255 + t * (102 - 255));
    const b = Math.round(255 + t * (241 - 255));
    return `rgb(${r}, ${g}, ${b})`;
}

export function PivotChart({ type, data, series, fmt }: { type: ChartType; data: ChartDatum[]; series: ChartSeries[]; fmt: (n: number) => string }) {
    if (data.length === 0 || series.length === 0) {
        return <p className="py-10 text-center text-sm text-muted-foreground">Tidak ada data untuk digambar.</p>;
    }

    if (type === 'heatmap') {
        const max = Math.max(...data.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0))), 1);
        return (
            <div className="overflow-x-auto">
                <table className="text-xs">
                    <thead>
                        <tr>
                            <th className="sticky left-0 bg-background p-2 text-left" />
                            {series.map((s) => (
                                <th key={s.key} className="max-w-[120px] truncate p-2 text-left font-medium" title={s.label}>
                                    {s.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((d) => (
                            <tr key={d.name}>
                                <td className="sticky left-0 max-w-[200px] truncate bg-background p-2 font-medium" title={d.name}>
                                    {d.name}
                                </td>
                                {series.map((s) => {
                                    const v = Number(d[s.key] ?? 0);
                                    return (
                                        <td key={s.key} className="p-2 text-right tabular-nums" style={{ backgroundColor: heatColor(v, max), color: v / max > 0.6 ? '#fff' : undefined }} title={fmt(v)}>
                                            {v ? short(v) : '–'}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={380}>
            {type === 'line' ? (
                <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={short} width={56} />
                    <Tooltip formatter={(v) => fmt(Number(v))} />
                    {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                    {series.map((s, i) => (
                        <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                </LineChart>
            ) : (
                <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={short} width={56} />
                    <Tooltip formatter={(v) => fmt(Number(v))} />
                    {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                    {series.map((s, i) => (
                        <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]} radius={[2, 2, 0, 0]}>
                            {series.length === 1 && data.map((_, di) => <Cell key={di} fill={COLORS[di % COLORS.length]} />)}
                        </Bar>
                    ))}
                </BarChart>
            )}
        </ResponsiveContainer>
    );
}
