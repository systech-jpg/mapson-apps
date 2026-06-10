import { type PermissionAction, type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';

export function usePermissions() {
    const { permissions, isSuperAdmin } = usePage<SharedData>().props;

    const can = (key: string, action: PermissionAction = 'view'): boolean => {
        if (isSuperAdmin) {
            return true;
        }

        return Boolean(permissions?.[key]?.[action]);
    };

    return { can, isSuperAdmin };
}
