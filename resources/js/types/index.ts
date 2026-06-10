import { LucideIcon } from 'lucide-react';

export interface Auth {
    user: User;
}

export interface BreadcrumbItem {
    title: string;
    href: string;
}

export interface NavGroup {
    title: string;
    items: NavItem[];
}

export interface NavItem {
    title: string;
    url: string;
    icon?: LucideIcon | null;
    isActive?: boolean;
}

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export type MenuPermission = Record<PermissionAction, boolean>;

export type PermissionMap = Record<string, MenuPermission>;

export interface MenuNode {
    key: string;
    title: string;
    route: string | null;
    icon: string | null;
    children: MenuNode[];
}

export interface RoleBrief {
    id: number;
    name: string;
    slug?: string;
    is_super?: boolean;
    is_locked?: boolean;
    is_active?: boolean;
}

export interface DepartmentBrief {
    id: number;
    name: string;
}

export interface PositionBrief {
    id: number;
    name: string;
    department_id?: number | null;
}

export interface Lookup {
    id: number;
    name: string;
    [key: string]: unknown;
}

export type OrgUnitBrief = Lookup;

export interface EmployeeAssignment {
    id: number;
    employee_id: number;
    action_type: string;
    employment_status: string;
    valid_from: string;
    valid_to: string | null;
    is_current: boolean;
    reason: string | null;
    notes: string | null;
    company?: Lookup | null;
    org_unit?: Lookup | null;
    position?: Lookup | null;
    job_grade?: Lookup | null;
    location?: Lookup | null;
}

export interface AuditLog {
    id: number;
    auditable_type: string;
    auditable_id: number;
    event: string;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    user?: { id: number; name: string } | null;
    created_at: string | null;
}

export interface Employee {
    id: number;
    user_id: number | null;
    employee_code: string | null;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    nik_ktp: string | null;
    npwp: string | null;
    gender: 'male' | 'female' | null;
    birth_place: string | null;
    birth_date: string | null;
    religion: string | null;
    marital_status: string | null;
    nationality: string | null;
    blood_type: string | null;
    bpjs_kesehatan_no: string | null;
    bpjs_ketenagakerjaan_no: string | null;
    photo_path: string | null;
    hire_date: string | null;
    is_active: boolean;
    current_employment_status: string | null;
    current_effective_date: string | null;
    termination_date: string | null;
    reports_to_employee_id: number | null;
    deleted_at?: string | null;
    // Snapshot relations
    current_company?: Lookup | null;
    current_org_unit?: Lookup | null;
    current_position?: Lookup | null;
    current_job_grade?: Lookup | null;
    current_location?: Lookup | null;
    current_employee_group?: Lookup | null;
    current_employee_subgroup?: Lookup | null;
    current_employment_type?: Lookup | null;
    reports_to?: Employee | null;
    user?: User | null;
    // Sub-modules / history
    assignments?: EmployeeAssignment[];
    audit_logs?: AuditLog[];
    // Legacy fields (retired in Phase 5 cleanup) — kept optional for the User Management module.
    department_id?: number | null;
    position_id?: number | null;
    phone?: string | null;
    address?: string | null;
    department?: DepartmentBrief | null;
    position?: PositionBrief | null;
    [key: string]: unknown;
}

export interface SharedData {
    name: string;
    logo: string;
    quote: { message: string; author: string };
    auth: Auth;
    isSuperAdmin: boolean;
    permissions: PermissionMap;
    reportingMenu: MenuNode[];
    backendMenu: MenuNode[];
    canReporting: boolean;
    canBackend: boolean;
    backendLanding: string | null;
    flash: { success?: string | null; error?: string | null };
    [key: string]: unknown;
}

export interface User {
    id: number;
    name: string;
    email: string;
    avatar?: string;
    email_verified_at: string | null;
    role_id?: number | null;
    is_active?: boolean;
    role?: RoleBrief | null;
    employee?: Employee | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown; // This allows for additional properties...
}

export interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
}
