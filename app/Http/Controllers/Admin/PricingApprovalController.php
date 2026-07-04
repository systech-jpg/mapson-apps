<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PricingPriceLog;
use App\Models\PricingPricelist;
use App\Models\PricingProductPrice;
use App\Models\PricingSubmission;
use App\Models\PricingSubmissionAttachment;
use App\Models\PricingSubmissionItem;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Price approval workflow. HFO submits draft prices (per principal+profile) with attachments;
 * the CEO approves/rejects the whole batch or individual items. Approved prices are the pricelist.
 */
class PricingApprovalController extends Controller
{
    /** HFO submits all draft prices of a principal+profile for approval. */
    public function submit(Request $request): RedirectResponse
    {
        abort_unless($request->user()->canSubmitPricing(), 403, 'Hanya Head Finance yang dapat mengajukan.');

        $data = $request->validate([
            'principal_id' => ['required', 'exists:pricing_principals,id'],
            'profile_id' => ['required', 'exists:pricing_profiles,id'],
            'hospital_id' => ['nullable', 'exists:pricing_hospitals,id'],
            'note' => ['nullable', 'string', 'max:1000'],
            'attachments' => ['nullable', 'array'],
            'attachments.*' => ['file', 'mimes:pdf,jpg,jpeg,png,doc,docx,xls,xlsx', 'max:10240'],
        ]);

        $hospitalId = $data['hospital_id'] ?? null;
        $prices = PricingProductPrice::whereHas('product', fn ($q) => $q->where('principal_id', $data['principal_id']))
            ->where('profile_id', $data['profile_id'])
            ->where('hospital_id', $hospitalId)
            ->where('status', PricingProductPrice::STATUS_DRAFT)
            ->get();

        if ($prices->isEmpty()) {
            return back()->with('error', 'Tidak ada harga draft untuk diajukan.');
        }

        DB::transaction(function () use ($request, $data, $hospitalId, $prices) {
            $submission = PricingSubmission::create([
                'principal_id' => $data['principal_id'],
                'profile_id' => $data['profile_id'],
                'hospital_id' => $hospitalId,
                'status' => PricingSubmission::STATUS_PENDING,
                'note' => $data['note'] ?? null,
                'submitted_by' => $request->user()->id,
                'submitted_at' => now(),
            ]);

            foreach ($prices as $price) {
                PricingSubmissionItem::create([
                    'submission_id' => $submission->id,
                    'price_id' => $price->id,
                    'pricelist' => $price->pricelist,
                    'status' => 'pending',
                ]);
                $price->update(['status' => PricingProductPrice::STATUS_PENDING]);
            }

            foreach ($request->file('attachments', []) as $file) {
                $path = $file->store('pricing-submissions');
                PricingSubmissionAttachment::create([
                    'submission_id' => $submission->id,
                    'kind' => 'basis',
                    'path' => $path,
                    'original_name' => $file->getClientOriginalName(),
                    'uploaded_by' => $request->user()->id,
                    'created_at' => now(),
                ]);
            }
        });

        return back()->with('success', "Diajukan untuk persetujuan — {$prices->count()} harga.");
    }

    /** CEO approval queue. */
    public function index(Request $request): Response
    {
        abort_unless($request->user()->canApprovePricing(), 403, 'Hanya Direktur Utama yang dapat menyetujui.');

        $tab = $request->string('tab')->toString() ?: 'pending';
        $statuses = $tab === 'history'
            ? [PricingSubmission::STATUS_APPROVED, PricingSubmission::STATUS_REJECTED, PricingSubmission::STATUS_PARTIAL]
            : [PricingSubmission::STATUS_PENDING, PricingSubmission::STATUS_PARTIAL];

        $submissions = PricingSubmission::whereIn('status', $statuses)
            ->with([
                'principal:id,name', 'profile:id,name', 'hospital:id,name', 'submitter:id,name', 'decider:id,name',
                'items.price.product',
                'attachments',
            ])
            ->orderByDesc('submitted_at')
            ->limit(100)
            ->get()
            ->map(fn (PricingSubmission $s) => $this->serialize($s));

        return Inertia::render('pricing-approval/index', [
            'submissions' => $submissions,
            'tab' => $tab,
        ]);
    }

    private function serialize(PricingSubmission $s): array
    {
        return [
            'id' => $s->id,
            'status' => $s->status,
            'principal' => $s->principal?->name,
            'profile' => $s->profile?->name,
            'hospital' => $s->hospital?->name,   // null = base (semua RS)
            'note' => $s->note,
            'decision_note' => $s->decision_note,
            'submitter' => $s->submitter?->name,
            'decider' => $s->decider?->name,
            'submitted_at' => $s->submitted_at?->format('Y-m-d H:i'),
            'decided_at' => $s->decided_at?->format('Y-m-d H:i'),
            'items' => $s->items->map(fn (PricingSubmissionItem $it) => [
                'id' => $it->id,
                'status' => $it->status,
                'sku_code' => $it->price?->product?->sku_code,
                'product_name' => $it->price?->product?->product_name,
                'pricelist' => (float) $it->pricelist,
                'detail' => $this->itemDetail($it),
            ])->values(),
            'attachments' => $s->attachments->map(fn (PricingSubmissionAttachment $a) => [
                'id' => $a->id, 'kind' => $a->kind, 'name' => $a->original_name,
            ])->values(),
        ];
    }

    /** Full breakdown of a submission item + what changed (from the audit log). */
    private function itemDetail(PricingSubmissionItem $it): ?array
    {
        $price = $it->price;
        $product = $price?->product;
        if (! $price || ! $product) {
            return null;
        }

        $log = PricingPriceLog::where('product_id', $product->id)
            ->where('profile_id', $price->profile_id)
            ->latest('created_at')->first();

        return [
            'brand' => $product->brand,
            'category' => array_values(array_filter([$product->cat1, $product->cat2, $product->cat3, $product->cat4])),
            'product_type' => $product->product_type,
            'currency_code' => $product->currency_code,
            'price_principle' => (float) $product->price_principle,
            'disc_principle_pct' => (float) $product->disc_principle_pct,
            'kurs' => (float) $product->kurs,
            'qty_beli' => (float) $product->qty_beli, 'uom_beli' => $product->uom_beli,
            'qty_jual' => (float) $product->qty_jual, 'uom_jual' => $product->uom_jual,
            'bm_pct' => (float) $product->bm_pct, 'pph22_pct' => (float) $product->pph22_pct,
            'ppn_pct' => (float) $product->ppn_pct, 'shipment_pct' => (float) $product->shipment_pct,
            'ops_pct' => (float) $price->ops_pct, 'profit_pct' => (float) $price->profit_pct,
            'komisi_pct' => (float) $price->komisi_pct, 'event_pct' => (float) $price->event_pct,
            'lainnya_pct' => (float) $price->lainnya_pct, 'buffer_pct' => (float) $price->buffer_pct,
            'breakdown' => $price->breakdown,                              // A/B/C/E/G/K snapshot
            'changes' => $log?->changes,                                   // { field: [old, new] }
            'pricelist_before' => $log?->pricelist_before !== null ? (float) $log->pricelist_before : null,
        ];
    }

    /** Approve the whole submission (all still-pending items). */
    public function approve(Request $request, PricingSubmission $submission): RedirectResponse
    {
        abort_unless($request->user()->canApprovePricing(), 403);
        $data = $request->validate(['decision_note' => ['nullable', 'string', 'max:1000']]);

        DB::transaction(function () use ($submission, $request, $data) {
            foreach ($submission->items()->where('status', 'pending')->with('price')->get() as $item) {
                $item->update(['status' => 'approved']);
                $item->price?->update([
                    'status' => PricingProductPrice::STATUS_APPROVED,
                    'decided_by' => $request->user()->id,
                    'decided_at' => now(),
                ]);
                $this->promoteToPricelist($item->price, $submission, $request->user()->id);
            }
            $submission->update(['decision_note' => $data['decision_note'] ?? $submission->decision_note]);
            $this->finalize($submission, $request->user()->id);
        });

        return back()->with('success', 'Pengajuan disetujui.');
    }

    /** Reject the whole submission (still-pending items go back to draft). */
    public function reject(Request $request, PricingSubmission $submission): RedirectResponse
    {
        abort_unless($request->user()->canApprovePricing(), 403);
        $data = $request->validate(['decision_note' => ['nullable', 'string', 'max:1000']]);

        DB::transaction(function () use ($submission, $request, $data) {
            foreach ($submission->items()->where('status', 'pending')->with('price')->get() as $item) {
                $item->update(['status' => 'rejected']);
                $item->price?->update(['status' => PricingProductPrice::STATUS_DRAFT]);
            }
            $submission->update(['decision_note' => $data['decision_note'] ?? $submission->decision_note]);
            $this->finalize($submission, $request->user()->id);
        });

        return back()->with('success', 'Pengajuan ditolak.');
    }

    /** Approve or reject a single item. */
    public function decideItem(Request $request, PricingSubmissionItem $item): RedirectResponse
    {
        abort_unless($request->user()->canApprovePricing(), 403);
        $data = $request->validate(['decision' => ['required', 'in:approved,rejected']]);
        abort_unless($item->status === 'pending', 409, 'Item ini sudah diputuskan.');

        DB::transaction(function () use ($item, $data, $request) {
            $item->update(['status' => $data['decision']]);
            $item->loadMissing('price', 'submission');
            if ($data['decision'] === 'approved') {
                $item->price?->update(['status' => PricingProductPrice::STATUS_APPROVED, 'decided_by' => $request->user()->id, 'decided_at' => now()]);
                $this->promoteToPricelist($item->price, $item->submission, $request->user()->id);
            } else {
                $item->price?->update(['status' => PricingProductPrice::STATUS_DRAFT]);
            }
            $this->finalize($item->submission, $request->user()->id);
        });

        return back()->with('success', 'Item diputuskan.');
    }

    /**
     * Publish an approved price as a new pricelist version. Closes the previous active version
     * (effective_to = today) and creates a fresh active one (effective_from = today, open-ended).
     */
    private function promoteToPricelist(?PricingProductPrice $price, PricingSubmission $submission, int $userId): void
    {
        if (! $price) {
            return;
        }

        $today = now()->toDateString();

        PricingPricelist::where('product_id', $price->product_id)
            ->where('profile_id', $price->profile_id)
            ->where('hospital_id', $price->hospital_id)
            ->where('is_active', true)
            ->update(['is_active' => false, 'effective_to' => $today]);

        PricingPricelist::create([
            'product_id' => $price->product_id,
            'profile_id' => $price->profile_id,
            'hospital_id' => $price->hospital_id,
            'price_id' => $price->id,
            'submission_id' => $submission->id,
            'pricelist' => $price->pricelist,
            'breakdown' => $price->breakdown,
            'effective_from' => $today,
            'effective_to' => null,
            'is_active' => true,
            'approved_by' => $userId,
            'approved_at' => now(),
        ]);
    }

    /** Recompute submission status once no items remain pending. */
    private function finalize(PricingSubmission $submission, int $userId): void
    {
        $submission->refresh()->loadMissing('items');
        if ($submission->items->where('status', 'pending')->isNotEmpty()) {
            $submission->update(['status' => PricingSubmission::STATUS_PARTIAL]);

            return;
        }

        $approved = $submission->items->where('status', 'approved')->count();
        $rejected = $submission->items->where('status', 'rejected')->count();
        $status = $approved && $rejected ? PricingSubmission::STATUS_PARTIAL
            : ($rejected ? PricingSubmission::STATUS_REJECTED : PricingSubmission::STATUS_APPROVED);

        $submission->update(['status' => $status, 'decided_by' => $userId, 'decided_at' => now()]);
    }

    /** Upload proof-of-approval attachment (either party). */
    public function attach(Request $request, PricingSubmission $submission): RedirectResponse
    {
        $data = $request->validate([
            'kind' => ['required', 'in:basis,proof'],
            'file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,doc,docx,xls,xlsx', 'max:10240'],
        ]);

        $path = $request->file('file')->store('pricing-submissions');
        PricingSubmissionAttachment::create([
            'submission_id' => $submission->id,
            'kind' => $data['kind'],
            'path' => $path,
            'original_name' => $request->file('file')->getClientOriginalName(),
            'uploaded_by' => $request->user()->id,
            'created_at' => now(),
        ]);

        return back()->with('success', 'Lampiran ditambahkan.');
    }

    public function download(PricingSubmissionAttachment $attachment): StreamedResponse
    {
        abort_unless(Storage::exists($attachment->path), 404);

        return Storage::download($attachment->path, $attachment->original_name);
    }
}
