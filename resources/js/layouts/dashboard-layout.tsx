import ReportingLayout from '@/layouts/reporting-layout';
import { type BreadcrumbItem } from '@/types';
import { type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    breadcrumbs?: BreadcrumbItem[];
}

// Reporting-area pages (Dashboard, Analisa, future reports) always use the clean
// sidebar-less ReportingLayout. Switching to the backend is done via the explicit
// "Backend" button in that layout.
export default function DashboardLayout({ children }: Props) {
    return <ReportingLayout>{children}</ReportingLayout>;
}
