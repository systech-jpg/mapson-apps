import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { router } from '@inertiajs/react';
import { Trash2 } from 'lucide-react';
import { type ReactNode } from 'react';

interface Props {
    url: string;
    title?: string;
    description?: string;
    trigger?: ReactNode;
    method?: 'delete' | 'post';
    actionLabel?: string;
}

export function ConfirmDelete({ url, title = 'Hapus data ini?', description = 'Tindakan ini tidak dapat dibatalkan.', trigger, method = 'delete', actionLabel = 'Hapus' }: Props) {
    const onConfirm = () => (method === 'post'
        ? router.post(url, {}, { preserveScroll: true })
        : router.delete(url, { preserveScroll: true }));

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                {trigger ?? (
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="size-4" />
                    </Button>
                )}
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {actionLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
