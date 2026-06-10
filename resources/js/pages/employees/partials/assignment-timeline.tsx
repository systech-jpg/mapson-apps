import { Badge } from '@/components/ui/badge';
import { type EmployeeAssignment } from '@/types';

export default function AssignmentTimeline({ assignments }: { assignments: EmployeeAssignment[] }) {
    if (!assignments || assignments.length === 0) {
        return <p className="text-sm text-muted-foreground">Belum ada riwayat penempatan.</p>;
    }

    return (
        <ol className="relative space-y-4 border-l pl-6">
            {assignments.map((a) => (
                <li key={a.id} className="relative">
                    <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-background bg-primary" />
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium capitalize">{a.action_type.replace('_', ' ')}</span>
                        {a.is_current && <Badge>Saat ini</Badge>}
                        <Badge variant="secondary" className="capitalize">
                            {a.employment_status}
                        </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {a.valid_from} &rarr; {a.valid_to ?? 'sekarang'}
                    </p>
                    <p className="text-sm">
                        {[a.org_unit?.name, a.position?.name, a.job_grade?.name, a.location?.name].filter(Boolean).join(' · ') || '-'}
                    </p>
                    {a.reason && <p className="text-xs text-muted-foreground">Alasan: {a.reason}</p>}
                </li>
            ))}
        </ol>
    );
}
