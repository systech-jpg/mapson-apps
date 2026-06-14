import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import GeneralBody, { type GeneralBodyProps } from './general-body';

/**
 * Sales-employee dashboard variant (scaffold). Shown when the employee's Employee
 * Group resolves to "sales". For now it carries the standard self-service body plus
 * a placeholder for upcoming sales metrics (target, pencapaian, pipeline, dll).
 */
export default function SalesBody(props: GeneralBodyProps) {
    return (
        <>
            <Card className="border-dashed">
                <CardContent className="flex items-center gap-3 py-5 text-sm text-muted-foreground">
                    <TrendingUp className="size-5 text-emerald-600" />
                    <span>
                        <b className="text-foreground">Dashboard Sales</b> — area metrik penjualan (target, pencapaian, pipeline) akan ditambahkan di sini.
                        Sementara menampilkan ringkasan kepegawaian Anda di bawah.
                    </span>
                </CardContent>
            </Card>
            <GeneralBody {...props} />
        </>
    );
}
