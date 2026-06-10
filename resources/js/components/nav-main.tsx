import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { iconFromName } from '@/lib/menu-icons';
import { type MenuNode } from '@/types';
import { Link } from '@inertiajs/react';
import { ChevronRight } from 'lucide-react';

function isCurrent(routeName: string | null): boolean {
    if (!routeName) {
        return false;
    }
    try {
        return route().current(routeName);
    } catch {
        return false;
    }
}

function hasActiveChild(node: MenuNode): boolean {
    return node.children.some((child) => isCurrent(child.route) || hasActiveChild(child));
}

// Top-level item (level 0).
function TopNode({ node }: { node: MenuNode }) {
    const Icon = iconFromName(node.icon);

    if (node.children.length === 0) {
        return (
            <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isCurrent(node.route)} tooltip={{ children: node.title }}>
                    <Link href={node.route ? route(node.route) : '#'} prefetch>
                        <Icon />
                        <span>{node.title}</span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        );
    }

    return (
        <Collapsible asChild defaultOpen={hasActiveChild(node)} className="group/collapsible">
            <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip={{ children: node.title }}>
                        <Icon />
                        <span>{node.title}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub>
                        {node.children.map((child) => (
                            <SubNode key={child.key} node={child} />
                        ))}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </SidebarMenuItem>
        </Collapsible>
    );
}

// Nested item (level 1+), rendered inside a SidebarMenuSub. Recurses for deeper levels.
function SubNode({ node }: { node: MenuNode }) {
    if (node.children.length === 0) {
        return (
            <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild isActive={isCurrent(node.route)}>
                    <Link href={node.route ? route(node.route) : '#'} prefetch>
                        <span>{node.title}</span>
                    </Link>
                </SidebarMenuSubButton>
            </SidebarMenuSubItem>
        );
    }

    return (
        <Collapsible asChild defaultOpen={hasActiveChild(node)} className="group/collapsible">
            <SidebarMenuSubItem>
                <CollapsibleTrigger asChild>
                    <SidebarMenuSubButton className="cursor-pointer">
                        <span>{node.title}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuSubButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub>
                        {node.children.map((child) => (
                            <SubNode key={child.key} node={child} />
                        ))}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </SidebarMenuSubItem>
        </Collapsible>
    );
}

export function NavMain({ items = [] }: { items: MenuNode[] }) {
    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((node) => (
                    <TopNode key={node.key} node={node} />
                ))}
            </SidebarMenu>
        </SidebarGroup>
    );
}
