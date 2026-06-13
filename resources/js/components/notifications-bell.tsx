import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { Bell } from 'lucide-react';

export function NotificationsBell() {
    const { notifications } = usePage<SharedData>().props;
    if (!notifications) return null;

    const { unread, items } = notifications;

    const open = (id: string, url?: string) => {
        router.post(route('notifications.read', id), {}, { preserveScroll: true, preserveState: false });
        if (url) router.visit(url);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="size-5" />
                    {unread > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-medium text-white">
                            {unread > 9 ? '9+' : unread}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                    Notifikasi
                    {unread > 0 && (
                        <button
                            className="text-xs font-normal text-muted-foreground hover:text-foreground"
                            onClick={() => router.post(route('notifications.read-all'), {}, { preserveScroll: true })}
                        >
                            Tandai semua dibaca
                        </button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {items.length === 0 ? (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">Tidak ada notifikasi.</div>
                ) : (
                    items.map((n) => {
                        const data = n.data as { message?: string; url?: string };
                        return (
                            <DropdownMenuItem
                                key={n.id}
                                className={`flex flex-col items-start gap-0.5 ${n.read ? 'opacity-60' : ''}`}
                                onSelect={() => open(n.id, data.url)}
                            >
                                <span className="text-sm leading-snug whitespace-normal">{data.message ?? 'Notifikasi'}</span>
                                <span className="text-[10px] text-muted-foreground">{n.at}</span>
                            </DropdownMenuItem>
                        );
                    })
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
