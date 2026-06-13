import { Breadcrumbs } from '@/components/breadcrumbs';
import { NotificationsBell } from '@/components/notifications-bell';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { type BreadcrumbItem as BreadcrumbItemType, type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { LayoutDashboard } from 'lucide-react';

export function AppSidebarHeader({ breadcrumbs = [] }: { breadcrumbs?: BreadcrumbItemType[] }) {
    const { canReporting } = usePage<SharedData>().props;

    return (
        <header className="border-sidebar-border/50 flex h-16 shrink-0 items-center gap-2 border-b px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-4">
            <div className="flex items-center gap-2">
                <SidebarTrigger className="-ml-1" />
                <Breadcrumbs breadcrumbs={breadcrumbs} />
            </div>

            <div className="ml-auto flex items-center gap-2">
                {canReporting && (
                    <Button variant="outline" size="sm" asChild>
                        <Link href={route('dashboard')}>
                            <LayoutDashboard className="size-4" /> Dashboard
                        </Link>
                    </Button>
                )}
                <NotificationsBell />
            </div>
        </header>
    );
}
