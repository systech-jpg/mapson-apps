<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Inertia\Inertia;
use Inertia\Response;

class AnalyticsController extends Controller
{
    public function index(): Response
    {
        // Placeholder metrics — replaced by the Dolibarr ETL feeder later.
        return Inertia::render('analytics/index', [
            'metrics' => [],
        ]);
    }
}
