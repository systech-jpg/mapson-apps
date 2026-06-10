import AppLogoIcon from '@/components/app-logo-icon';
import AppearanceToggleDropdown from '@/components/appearance-dropdown';
import { Toaster } from '@/components/ui/sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UserMenuContent } from '@/components/user-menu-content';
import { useInitials } from '@/hooks/use-initials';
import { iconFromName } from '@/lib/menu-icons';
import { cn } from '@/lib/utils';
import { type MenuNode, type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { PanelsTopLeft } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { toast } from 'sonner';

function flattenLeaves(nodes: MenuNode[]): MenuNode[] {
    return nodes.flatMap((n) => (n.children.length > 0 ? flattenLeaves(n.children) : [n]));
}

function isCurrent(routeName: string | null): boolean {
    if (!routeName) return false;
    try {
        return route().current(routeName);
    } catch {
        return false;
    }
}

export default function ReportingLayout({ children }: { children: ReactNode }) {
    const { auth, reportingMenu, canBackend, backendLanding, flash } = usePage<SharedData>().props;
    const getInitials = useInitials();
    const tabs = flattenLeaves(reportingMenu);

    useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
    }, [flash?.success, flash?.error]);

    const backendHref = backendLanding ? route(backendLanding) : null;

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
                <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4">
                    <Link href={route('dashboard')} className="flex items-center">
                        <AppLogoIcon className="h-8 w-auto max-w-[160px]" />
                    </Link>

                    <nav className="flex items-center gap-1">
                        {tabs.map((tab) => {
                            const Icon = iconFromName(tab.icon);
                            return (
                                <Link
                                    key={tab.key}
                                    href={tab.route ? route(tab.route) : '#'}
                                    className={cn(
                                        'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                        isCurrent(tab.route) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
                                    )}
                                >
                                    <Icon className="size-4" />
                                    {tab.title}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="ml-auto flex items-center gap-2">
                        {canBackend && backendHref && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={backendHref}>
                                    <PanelsTopLeft className="size-4" /> Backend
                                </Link>
                            </Button>
                        )}
                        <AppearanceToggleDropdown />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="size-10 rounded-full p-1">
                                    <Avatar className="size-8 overflow-hidden rounded-full">
                                        <AvatarImage src={auth.user.avatar} alt={auth.user.name} />
                                        <AvatarFallback className="rounded-lg">{getInitials(auth.user.name)}</AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56" align="end">
                                <UserMenuContent user={auth.user} />
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl flex-1 p-4">{children}</main>
            <Toaster richColors position="top-right" />
        </div>
    );
}
