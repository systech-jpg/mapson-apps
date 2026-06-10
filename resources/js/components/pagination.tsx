import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';

interface PaginationLink {
    url: string | null;
    label: string;
    active: boolean;
}

export function Pagination({ links }: { links: PaginationLink[] }) {
    // Hide pagination when there is only the prev/next placeholders (single page).
    if (links.length <= 3) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center gap-1">
            {links.map((link, index) => (
                <Link
                    key={index}
                    href={link.url ?? '#'}
                    preserveScroll
                    className={cn(
                        'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm',
                        link.active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
                        !link.url && 'pointer-events-none opacity-50',
                    )}
                    dangerouslySetInnerHTML={{ __html: link.label }}
                />
            ))}
        </div>
    );
}
