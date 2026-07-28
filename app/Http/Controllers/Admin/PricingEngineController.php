<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Currency;
use App\Models\PricingHospital;
use App\Models\PricingPriceLog;
use App\Models\PricingPrincipal;
use App\Models\PricingProduct;
use App\Models\PricingProductPrice;
use App\Models\PricingProfile;
use App\Support\PricingEngineCalculator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Profile-based pricing engine. Flow: pick profile → pick principal (Dolibarr vendor or
 * in-app) → editable grid (existing rows or Excel upload) with %-driven waterfall auto-calc.
 */
class PricingEngineController extends Controller
{
    /** Row inputs persisted per grid line. */
    private const PRODUCT_FIELDS = [
        'brand', 'sku_code', 'product_name', 'cat1', 'cat2', 'cat3', 'cat4', 'product_type',
        'currency_code', 'price_principle', 'disc_principle_pct', 'kurs',
        'qty_beli', 'uom_beli', 'qty_jual', 'uom_jual',
        'bm_pct', 'pph22_pct', 'ppn_pct', 'shipment_pct',
    ];

    private const PRICE_FIELDS = [
        'ops_pct', 'profit_pct', 'komisi_pct', 'event_pct', 'lainnya_pct', 'buffer_pct', 'rounding_step',
    ];

    /** Lockable price points (null = unlocked). When locked, effective %s are derived pro-rata. */
    private const LOCK_FIELDS = ['locked_gudang', 'locked_bottom', 'locked_pricelist'];

    /** Percentage columns are decimal(6,3): clamp so stray nominal values can't overflow. */
    private const PCT_FIELDS = [
        'disc_principle_pct', 'bm_pct', 'pph22_pct', 'ppn_pct', 'shipment_pct',
        'ops_pct', 'profit_pct', 'komisi_pct', 'event_pct', 'lainnya_pct', 'buffer_pct',
    ];

    private function clean(string $field, mixed $value): mixed
    {
        if (in_array($field, self::PCT_FIELDS, true)) {
            return max(-999.999, min(999.999, (float) $value));
        }

        if ($field === 'price_principle') {
            return round((float) $value, 2);
        }

        return $value;
    }

    /** Normalize a lock value from the grid: positive number = locked, anything else = null. */
    private function lockVal(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (float) $value > 0 ? round((float) $value, 2) : null;
    }

    public function index(Request $request): Response
    {
        $profiles = PricingProfile::where('is_active', true)->orderBy('sort_order')->get();
        $profile = $profiles->firstWhere('code', $request->string('profile')->toString()) ?? $profiles->first();

        $principalId = $request->string('principal')->toString();
        $principal = $principalId ? PricingPrincipal::find($principalId) : null;

        // Hospital dimension: null = base price (berlaku semua RS); a hospital id = override.
        $hospitalId = $request->filled('hospital') ? (int) $request->input('hospital') : null;
        $hospital = $hospitalId ? PricingHospital::find($hospitalId) : null;
        $hospitalId = $hospital?->id;   // drop invalid ids back to base

        $rows = [];
        $copyableProfiles = [];
        $baseCount = 0;
        if ($principal && $profile) {
            $products = PricingProduct::where('principal_id', $principal->id)
                ->with('prices')->orderBy('sku_code')->get();

            // copy_from: '' (none) | 'base' (this profile's base → into current hospital) | a profile id.
            $copyFrom = $request->string('copy_from')->toString();
            $isCopy = $copyFrom !== '';
            [$srcProfile, $srcHospital] = $copyFrom === 'base'
                ? [$profile->id, null]
                : ($isCopy ? [(int) $copyFrom, $hospitalId] : [$profile->id, $hospitalId]);

            $rows = $products
                ->filter(fn (PricingProduct $p) => $this->priceOf($p, $srcProfile, $srcHospital))
                ->map(fn (PricingProduct $p) => $isCopy
                    ? $this->serializeRowCopy($p, $profile->id, $hospitalId, $srcProfile, $srcHospital)
                    : $this->serializeRow($p, $profile->id, $hospitalId))
                ->values()->all();

            // Other profiles that already have prices for this principal + current hospital.
            $copyableProfiles = $profiles->filter(fn ($pr) => $pr->id !== $profile->id)
                ->map(fn ($pr) => [
                    'id' => $pr->id,
                    'name' => $pr->name,
                    'count' => $products->filter(fn (PricingProduct $p) => $this->priceOf($p, $pr->id, $hospitalId))->count(),
                ])
                ->filter(fn ($x) => $x['count'] > 0)->values()->all();

            // For a hospital view: how many base (all-RS) prices exist to copy from.
            if ($hospitalId) {
                $baseCount = $products->filter(fn (PricingProduct $p) => $this->priceOf($p, $profile->id, null))->count();
            }
        }

        return Inertia::render('pricing-engine/index', [
            'profiles' => $profiles,
            'selectedProfile' => $profile?->code,
            'principals' => $this->principals(),
            'selectedPrincipal' => $principal ? ['id' => $principal->id, 'name' => $principal->name] : null,
            'hospitals' => $this->hospitals(),
            'selectedHospital' => $hospital ? ['id' => $hospital->id, 'name' => $hospital->name] : null,
            'rows' => $rows,
            'copyableProfiles' => $copyableProfiles,
            'baseCount' => $baseCount,
            'categories' => $this->erpCategories(),
            'currencies' => Currency::orderBy('code')->get(['code', 'name', 'rate_to_idr']),
            'canSubmit' => $request->user()->canSubmitPricing(),
            'draftCount' => ($principal && $profile) ? collect($rows)->where('status', 'draft')->count() : 0,
        ]);
    }

    /** Find a product's price for a given profile + hospital (null hospital = base). */
    private function priceOf(PricingProduct $p, int|string $profileId, ?int $hospitalId): ?PricingProductPrice
    {
        $hkey = (int) $hospitalId;

        return $p->prices->first(fn (PricingProductPrice $pr) => $pr->profile_id == $profileId && (int) $pr->hospital_id === $hkey);
    }

    /** Sell-side params of one price row, keyed for the frontend "copy from profile" feature. */
    private function sellParams(PricingProductPrice $pr): array
    {
        return [
            'ops_pct' => (float) $pr->ops_pct,
            'profit_pct' => (float) $pr->profit_pct,
            'komisi_pct' => (float) $pr->komisi_pct,
            'event_pct' => (float) $pr->event_pct,
            'lainnya_pct' => (float) $pr->lainnya_pct,
            'buffer_pct' => (float) $pr->buffer_pct,
            'rounding_step' => (int) $pr->rounding_step,
            'locked_gudang' => $pr->locked_gudang !== null ? (float) $pr->locked_gudang : null,
            'locked_bottom' => $pr->locked_bottom !== null ? (float) $pr->locked_bottom : null,
            'locked_pricelist' => $pr->locked_pricelist !== null ? (float) $pr->locked_pricelist : null,
            'pricelist' => (float) $pr->pricelist,
            'status' => $pr->status,
        ];
    }

    private function serializeRow(PricingProduct $p, string $profileId, ?int $hospitalId): array
    {
        $current = $this->priceOf($p, $profileId, $hospitalId);
        // prices_by_profile is scoped to the current hospital (for the cross-profile copy picker).
        $byProfile = $p->prices->filter(fn (PricingProductPrice $pr) => (int) $pr->hospital_id === (int) $hospitalId)
            ->mapWithKeys(fn (PricingProductPrice $pr) => [$pr->profile_id => $this->sellParams($pr)])->all();

        return [
            'id' => $p->id,
            'price_id' => $current?->id,
            'status' => $current?->status ?? 'draft',
            'pricelist' => (float) ($current?->pricelist ?? 0),
            // Cast pct columns to float so decimal(6,3) doesn't serialize as "2.500" (grid shows "2.5").
            ...collect(self::PRODUCT_FIELDS)->mapWithKeys(fn ($f) => [$f => in_array($f, self::PCT_FIELDS, true) ? (float) $p->{$f} : $p->{$f}])->all(),
            'ops_pct' => (float) ($current?->ops_pct ?? 0),
            'profit_pct' => (float) ($current?->profit_pct ?? 0),
            'komisi_pct' => (float) ($current?->komisi_pct ?? 0),
            'event_pct' => (float) ($current?->event_pct ?? 0),
            'lainnya_pct' => (float) ($current?->lainnya_pct ?? 0),
            'buffer_pct' => (float) ($current?->buffer_pct ?? 0),
            'rounding_step' => (int) ($current?->rounding_step ?? 1000),
            'locked_gudang' => $current?->locked_gudang !== null ? (float) $current->locked_gudang : null,
            'locked_bottom' => $current?->locked_bottom !== null ? (float) $current->locked_bottom : null,
            'locked_pricelist' => $current?->locked_pricelist !== null ? (float) $current->locked_pricelist : null,
            'prices_by_profile' => $byProfile,
        ];
    }

    /** Row for the target profile+hospital seeded with a source (profile,hospital) sell params. */
    private function serializeRowCopy(PricingProduct $p, string $targetProfileId, ?int $targetHospitalId, int $sourceProfileId, ?int $sourceHospitalId): array
    {
        $src = $this->priceOf($p, $sourceProfileId, $sourceHospitalId);

        return array_merge($this->serializeRow($p, $targetProfileId, $targetHospitalId), [
            'price_id' => null,
            'status' => 'draft',
            'ops_pct' => (float) $src->ops_pct,
            'profit_pct' => (float) $src->profit_pct,
            'komisi_pct' => (float) $src->komisi_pct,
            'event_pct' => (float) $src->event_pct,
            'lainnya_pct' => (float) $src->lainnya_pct,
            'buffer_pct' => (float) $src->buffer_pct,
            'rounding_step' => (int) $src->rounding_step,
            'locked_gudang' => $src->locked_gudang !== null ? (float) $src->locked_gudang : null,
            'locked_bottom' => $src->locked_bottom !== null ? (float) $src->locked_bottom : null,
            'locked_pricelist' => $src->locked_pricelist !== null ? (float) $src->locked_pricelist : null,
        ]);
    }

    /** App principals + Dolibarr vendors (fournisseur=1) not yet linked. */
    private function principals(): array
    {
        $app = PricingPrincipal::orderBy('name')->get()
            ->map(fn ($p) => ['id' => $p->id, 'erp_societe_id' => $p->erp_societe_id, 'name' => $p->name, 'source' => $p->erp_societe_id ? 'erp' : 'app'])
            ->all();

        $linked = collect($app)->pluck('erp_societe_id')->filter()->all();

        $vendors = [];
        try {
            $p = config('erp.prefix');
            $entities = array_filter(array_map('trim', explode(',', (string) config('erp.entities', '1'))));
            $vendors = DB::connection(config('erp.connection'))->table($p.'societe')
                ->where('fournisseur', 1)
                ->when($entities, fn ($q) => $q->whereIn('entity', $entities))
                ->when($linked, fn ($q) => $q->whereNotIn('rowid', $linked))
                ->orderBy('nom')
                ->limit(2000)
                ->get(['rowid as erp_societe_id', 'nom as name'])
                ->map(fn ($v) => ['id' => null, 'erp_societe_id' => (int) $v->erp_societe_id, 'name' => $v->name, 'source' => 'erp'])
                ->all();
        } catch (\Throwable) {
            // ERP offline — app principals only.
        }

        return [...$app, ...$vendors];
    }

    /** Third-party types (Dolibarr c_typent) that count as a "hospital" buyer. */
    private const HOSPITAL_TYPE_CODES = ['MAP_CUSTPH', 'MAP_CUSTGO', 'MAP_CUSTCO']; // Private Hospital, Government, Corporate

    /** App-linked hospitals + Dolibarr customers (client=1) of the hospital third-party types. */
    private function hospitals(): array
    {
        $app = PricingHospital::orderBy('name')->get()
            ->map(fn ($h) => ['id' => $h->id, 'erp_societe_id' => $h->erp_societe_id, 'name' => $h->name, 'source' => $h->erp_societe_id ? 'erp' : 'app', 'type' => null])
            ->all();

        $linked = collect($app)->pluck('erp_societe_id')->filter()->all();

        $customers = [];
        try {
            $p = config('erp.prefix');
            $entities = array_filter(array_map('trim', explode(',', (string) config('erp.entities', '1'))));
            $customers = DB::connection(config('erp.connection'))->table($p.'societe as s')
                ->join($p.'c_typent as t', 't.id', '=', 's.fk_typent')
                ->where('s.client', 1)
                ->whereIn('t.code', self::HOSPITAL_TYPE_CODES)
                ->when($entities, fn ($q) => $q->whereIn('s.entity', $entities))
                ->when($linked, fn ($q) => $q->whereNotIn('s.rowid', $linked))
                ->orderBy('s.nom')
                ->limit(3000)
                ->get(['s.rowid as erp_societe_id', 's.nom as name', 't.libelle as type'])
                ->map(fn ($v) => ['id' => null, 'erp_societe_id' => (int) $v->erp_societe_id, 'name' => $v->name, 'source' => 'erp', 'type' => $v->type])
                ->all();
        } catch (\Throwable) {
            // ERP offline — app hospitals only.
        }

        return [...$app, ...$customers];
    }

    /** Dolibarr product category chain (flat: id, label, parent) for cascading dropdowns. */
    private function erpCategories(): array
    {
        try {
            $p = config('erp.prefix');
            $q = DB::connection(config('erp.connection'))->table($p.'categorie')
                ->orderBy('label');

            // Restrict to product categories when the column exists.
            try {
                $q->where('type', 0);
            } catch (\Throwable) {
            }

            return $q->limit(5000)
                ->get(['rowid as id', 'label', 'fk_parent as parent_id'])
                ->map(fn ($c) => ['id' => (int) $c->id, 'label' => $c->label, 'parent_id' => (int) $c->parent_id])
                ->all();
        } catch (\Throwable) {
            return [];
        }
    }

    /** Create or link a principal (from a Dolibarr vendor or manual entry), then open the grid. */
    public function storePrincipal(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'erp_societe_id' => ['nullable', 'integer'],
            'profile' => ['nullable', 'string'],
        ]);

        $principal = ($data['erp_societe_id'] ?? null)
            ? PricingPrincipal::updateOrCreate(['erp_societe_id' => $data['erp_societe_id']], ['name' => $data['name']])
            : PricingPrincipal::create(['name' => $data['name']]);

        return redirect()->route('pricing-engine.index', array_filter([
            'profile' => $data['profile'] ?? null,
            'principal' => $principal->id,
        ]));
    }

    /** Create or link a hospital (from a Dolibarr customer or manual entry), then open the grid. */
    public function storeHospital(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'erp_societe_id' => ['nullable', 'integer'],
            'profile' => ['nullable', 'string'],
            'principal' => ['nullable', 'integer'],
        ]);

        $hospital = ($data['erp_societe_id'] ?? null)
            ? PricingHospital::updateOrCreate(['erp_societe_id' => $data['erp_societe_id']], ['name' => $data['name']])
            : PricingHospital::create(['name' => $data['name']]);

        return redirect()->route('pricing-engine.index', array_filter([
            'profile' => $data['profile'] ?? null,
            'principal' => $data['principal'] ?? null,
            'hospital' => $hospital->id,
        ]));
    }

    /** Upsert the grid: product identity/cost + computed price for the chosen profile + hospital. */
    public function save(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'profile_id' => ['required', 'exists:pricing_profiles,id'],
            'principal_id' => ['required', 'exists:pricing_principals,id'],
            'hospital_id' => ['nullable', 'exists:pricing_hospitals,id'],
            'rows' => ['required', 'array', 'min:1'],
            'rows.*.sku_code' => ['required', 'string', 'max:255'],
            'rows.*.product_name' => ['required', 'string', 'max:255'],
        ]);

        $profile = PricingProfile::findOrFail($data['profile_id']);
        $hospitalId = $data['hospital_id'] ?? null;
        $saved = 0;

        DB::transaction(function () use ($request, $data, $profile, $hospitalId, &$saved) {
            foreach ($request->input('rows', []) as $row) {
                if (blank($row['sku_code'] ?? null)) {
                    continue;
                }

                $product = PricingProduct::updateOrCreate(
                    ['principal_id' => $data['principal_id'], 'sku_code' => $row['sku_code']],
                    collect(self::PRODUCT_FIELDS)->mapWithKeys(fn ($f) => [$f => $this->clean($f, $row[$f] ?? null)])->all()
                );

                $locks = collect(self::LOCK_FIELDS)->mapWithKeys(fn ($f) => [$f => $this->lockVal($row[$f] ?? null)])->all();

                $calc = PricingEngineCalculator::compute([
                    'price_principle' => round((float) ($row['price_principle'] ?? 0), 2),
                    'disc_principle_pct' => $row['disc_principle_pct'] ?? 0,
                    'kurs' => $row['kurs'] ?? 0,
                    'bm_pct' => $row['bm_pct'] ?? 0,
                    'pph22_pct' => $row['pph22_pct'] ?? 0,
                    'ppn_pct' => $row['ppn_pct'] ?? 0,
                    'shipment_pct' => $row['shipment_pct'] ?? 0,
                    'ops_pct' => $row['ops_pct'] ?? 0,
                    'profit_pct' => $row['profit_pct'] ?? 0,
                    'komisi_pct' => $row['komisi_pct'] ?? 0,
                    'event_pct' => $row['event_pct'] ?? 0,
                    'lainnya_pct' => $row['lainnya_pct'] ?? 0,
                    'rounding_step' => $row['rounding_step'] ?? $profile->rounding_step,
                    ...$locks,
                ]);

                $existing = PricingProductPrice::where('product_id', $product->id)
                    ->where('profile_id', $profile->id)
                    ->where('hospital_id', $hospitalId)->first();

                // Pending (awaiting approval) prices are locked. Approved prices may be revised —
                // editing sends them back to draft; the published pricelist stays active until
                // a new approval supersedes it.
                if ($existing && $existing->status === PricingProductPrice::STATUS_PENDING) {
                    continue;
                }

                $newValues = collect(self::PRICE_FIELDS)->mapWithKeys(fn ($f) => [$f => $this->clean($f, $row[$f] ?? 0)])->all();

                // With locks active the stored %s are the derived effective values, so the saved
                // row reproduces the locked prices even without re-reading the lock columns.
                if ($calc['any_lock']) {
                    foreach (['ops_pct' => 'd_ops_pct', 'profit_pct' => 'd_profit_pct', 'komisi_pct' => 'd_komisi_pct', 'event_pct' => 'd_event_pct', 'lainnya_pct' => 'd_lainnya_pct'] as $field => $derived) {
                        $newValues[$field] = $this->clean($field, $calc[$derived]);
                    }
                }

                PricingProductPrice::updateOrCreate(
                    ['product_id' => $product->id, 'profile_id' => $profile->id, 'hospital_id' => $hospitalId],
                    $newValues + $locks + [
                        'pricelist' => $calc['l_pricelist'],
                        'breakdown' => collect($calc)->except('any_lock')->all(),
                        'status' => PricingProductPrice::STATUS_DRAFT,
                        'requested_by' => $request->user()->id,
                    ]
                );

                $this->logChange($existing, $product->id, $profile->id, $newValues, (float) $calc['l_pricelist'], $request->user()->id);
                $saved++;
            }
        });

        // Redirect to a clean URL (drop any ?copy_from=) so a reload shows the saved profile data.
        return redirect()
            ->route('pricing-engine.index', array_filter(['profile' => $profile->code, 'principal' => $data['principal_id'], 'hospital' => $hospitalId]))
            ->with('success', "Tersimpan — {$saved} baris harga (draft).");
    }

    /** Write an audit log row when a price is created or its sell params / pricelist change. */
    private function logChange(?PricingProductPrice $existing, string $productId, string $profileId, array $newValues, float $pricelistAfter, int $userId): void
    {
        $changes = [];
        if ($existing) {
            foreach (self::PRICE_FIELDS as $f) {
                $old = (float) $existing->{$f};
                $new = (float) $newValues[$f];
                if (abs($old - $new) > 0.0001) {
                    $changes[$f] = [$old, $new];
                }
            }
        }

        $pricelistBefore = $existing ? (float) $existing->pricelist : null;
        $pricelistChanged = ! $existing || abs(($pricelistBefore ?? 0) - $pricelistAfter) > 0.001;

        if ($existing && ! $changes && ! $pricelistChanged) {
            return; // nothing actually changed
        }

        PricingPriceLog::create([
            'product_id' => $productId,
            'profile_id' => $profileId,
            'action' => $existing ? 'updated' : 'created',
            'changes' => $changes ?: null,
            'pricelist_before' => $pricelistBefore,
            'pricelist_after' => $pricelistAfter,
            'user_id' => $userId,
            'created_at' => now(),
        ]);
    }

    /** Change history for one product+profile record (JSON, fetched lazily by the History dialog). */
    public function history(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'exists:pricing_products,id'],
            'profile_id' => ['required', 'exists:pricing_profiles,id'],
        ]);

        $logs = PricingPriceLog::where('product_id', $data['product_id'])
            ->where('profile_id', $data['profile_id'])
            ->with('user:id,name')
            ->orderByDesc('created_at')
            ->limit(100)
            ->get()
            ->map(fn (PricingPriceLog $l) => [
                'action' => $l->action,
                'changes' => $l->changes,
                'pricelist_before' => $l->pricelist_before !== null ? (float) $l->pricelist_before : null,
                'pricelist_after' => $l->pricelist_after !== null ? (float) $l->pricelist_after : null,
                'note' => $l->note,
                'user' => $l->user?->name,
                'at' => $l->created_at?->format('Y-m-d H:i'),
            ]);

        return response()->json($logs);
    }
}
