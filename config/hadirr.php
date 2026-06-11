<?php

return [
    // Verify the Hadirr SSL certificate. Keep TRUE in production.
    // Set HADIRR_VERIFY_SSL=false ONLY for local dev when the PHP cURL CA
    // bundle (cacert.pem) is not configured (common on MAMP/Windows).
    'verify_ssl' => env('HADIRR_VERIFY_SSL', true),

    // Optional outbound proxy (e.g. SSH SOCKS tunnel) when the local network
    // can't reach Hadirr. Example: HADIRR_PROXY=socks5h://127.0.0.1:1080
    'proxy' => env('HADIRR_PROXY'),
];
