import {
    BadgeCheck,
    BarChart3,
    Briefcase,
    Building2,
    CalendarCheck,
    Circle,
    Contact,
    Database,
    DatabaseZap,
    FileBadge,
    Fingerprint,
    IdCard,
    Layers,
    LayoutGrid,
    ListTree,
    MapPin,
    Network,
    Plug,
    Settings,
    ShoppingCart,
    Shield,
    UserCog,
    Users,
    UsersRound,
    Wallet,
    type LucideIcon,
} from 'lucide-react';

/**
 * Allowlist of icons that menus may reference by name. Keeping this explicit
 * avoids bundling the entire lucide set and keeps menu data in sync with the UI.
 */
export const menuIcons: Record<string, LucideIcon> = {
    LayoutGrid,
    Users,
    UserCog,
    Shield,
    ListTree,
    Building2,
    BadgeCheck,
    Database,
    Settings,
    Network,
    Contact,
    DatabaseZap,
    IdCard,
    Briefcase,
    Layers,
    Wallet,
    MapPin,
    UsersRound,
    FileBadge,
    BarChart3,
    Plug,
    Fingerprint,
    ShoppingCart,
    CalendarCheck,
};

export const menuIconNames = Object.keys(menuIcons);

export function iconFromName(name?: string | null): LucideIcon {
    if (name && menuIcons[name]) {
        return menuIcons[name];
    }

    return Circle;
}
