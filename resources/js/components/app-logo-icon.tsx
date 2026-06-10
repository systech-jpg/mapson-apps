import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { type ImgHTMLAttributes } from 'react';

// App logo image. The URL comes from the server (asset('images/logo.png')) so it is
// correct in any environment (subfolder locally, subdomain in production).
// Replace the file at public/images/logo.png to change the logo.
export default function AppLogoIcon({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
    const { logo } = usePage<SharedData>().props;

    return <img {...props} src={logo} alt="Mapson Arya" className={cn('object-contain', className)} />;
}
