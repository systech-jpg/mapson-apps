import { usePermissions } from '@/hooks/use-permissions';
import { type PermissionAction } from '@/types';
import { type ReactNode } from 'react';

interface CanProps {
    /** The menu key, e.g. "users". */
    on: string;
    /** The action to check; defaults to "view". */
    do?: PermissionAction;
    children: ReactNode;
    fallback?: ReactNode;
}

/**
 * Conditionally render children based on the current user's menu permissions.
 * This is a UI convenience only — the backend still enforces access (403).
 */
export function Can({ on, do: action = 'view', children, fallback = null }: CanProps) {
    const { can } = usePermissions();

    return <>{can(on, action) ? children : fallback}</>;
}
