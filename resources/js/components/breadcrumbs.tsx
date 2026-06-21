import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { type BreadcrumbItem as BreadcrumbItemType } from '@/types';
import { Link } from '@inertiajs/react';
import { Fragment } from 'react';

/** App base path (e.g. "/mapson-apps" on MAMP, "" on a root-domain deploy), read from Ziggy. */
function basePath(): string {
    try {
        const url = (window as unknown as { Ziggy?: { url?: string } })?.Ziggy?.url;
        if (!url) return '';
        return new URL(url).pathname.replace(/\/+$/, '');
    } catch {
        return '';
    }
}

/** Prefix an app-absolute href with the base path so links work under a subpath install. */
function resolveHref(href: string, base: string): string {
    if (!href || href === '#') return href;
    if (/^https?:\/\//i.test(href)) return href; // already a full URL
    if (!href.startsWith('/')) return href; // relative — leave as is
    if (base && (href === base || href.startsWith(base + '/'))) return href; // already prefixed
    return base + href;
}

export function Breadcrumbs({ breadcrumbs }: { breadcrumbs: BreadcrumbItemType[] }) {
    const base = basePath();

    return (
        <>
            {breadcrumbs.length > 0 && (
                <Breadcrumb>
                    <BreadcrumbList>
                        {breadcrumbs.map((item, index) => {
                            const isLast = index === breadcrumbs.length - 1;
                            // Parent/group crumbs use "#" — they have no page, so render as a link
                            // visually but don't navigate (avoids the scroll-to-top jump).
                            const isNavigable = !isLast && item.href && item.href !== '#';
                            return (
                                <Fragment key={index}>
                                    <BreadcrumbItem>
                                        {isLast ? (
                                            <BreadcrumbPage>{item.title}</BreadcrumbPage>
                                        ) : isNavigable ? (
                                            <BreadcrumbLink asChild>
                                                <Link href={resolveHref(item.href, base)}>{item.title}</Link>
                                            </BreadcrumbLink>
                                        ) : (
                                            <BreadcrumbLink href="#" className="cursor-default" onClick={(e) => e.preventDefault()}>
                                                {item.title}
                                            </BreadcrumbLink>
                                        )}
                                    </BreadcrumbItem>
                                    {!isLast && <BreadcrumbSeparator />}
                                </Fragment>
                            );
                        })}
                    </BreadcrumbList>
                </Breadcrumb>
            )}
        </>
    );
}
