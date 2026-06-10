<?php

return [
    // Verify the Accurate SSL certificate. Keep TRUE in production.
    // Set ACCURATE_VERIFY_SSL=false ONLY for local dev when the PHP cURL CA
    // bundle (cacert.pem) is not configured (common on MAMP/Windows).
    'verify_ssl' => env('ACCURATE_VERIFY_SSL', true),

    // Optional outbound proxy for reaching Accurate (e.g. when the local network
    // blocks public.accurate.id). Example via SSH SOCKS tunnel to the VPS:
    //   ssh -D 1080 -N user@your-vps   then   ACCURATE_PROXY=socks5h://127.0.0.1:1080
    'proxy' => env('ACCURATE_PROXY'),
];

