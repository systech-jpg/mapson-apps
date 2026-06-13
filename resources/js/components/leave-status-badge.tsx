import { Badge } from '@/components/ui/badge';

const MAP: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Draf', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
    pending_supervisor: { label: 'Menunggu Supervisor', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
    pending_manager: { label: 'Menunggu Manager', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
    pending_hr: { label: 'Menunggu HR', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
    pending_director: { label: 'Menunggu Direktur', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
    approved: { label: 'Disetujui', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
    rejected: { label: 'Ditolak', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
    withdrawn: { label: 'Ditarik', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
    cancelled: { label: 'Dibatalkan', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
    expired: { label: 'Kedaluwarsa', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
};

export function LeaveStatusBadge({ status }: { status: string }) {
    const s = MAP[status] ?? { label: status, cls: '' };

    return <Badge className={`border-transparent ${s.cls}`}>{s.label}</Badge>;
}

export const ROLE_LABEL: Record<string, string> = {
    supervisor: 'Supervisor',
    manager: 'Manager',
    hr: 'HR',
    director: 'Direktur',
};
