<?php

namespace App\Services\Accurate;

use App\Models\AccurateSetting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AccurateSyncService
{
    public function __construct(protected AccurateService $acc)
    {
    }

    /**
     * Pull sales invoices (+ items) and their referenced Sales Orders & Delivery
     * Orders for a period into local staging tables. Idempotent: upsert by erp_id.
     *
     * @param  string  $from  dd/MM/yyyy
     * @param  string  $to    dd/MM/yyyy
     * @return array<string, int>
     *
     * @param  callable(string):void|null  $progress
     */
    public function syncSales(string $from, string $to, ?callable $progress = null): array
    {
        @set_time_limit(0);
        $s = AccurateSetting::current();
        $now = now()->toDateTimeString();
        $log = fn (string $m) => $progress && $progress($m);

        $invoices = 0;
        $items = 0;
        $soIds = [];
        $doIds = [];

        $page = 1;
        do {
            $list = $this->acc->apiGet($s, 'sales-invoice/list.do', [
                'sp.page' => $page,
                'sp.pageSize' => 100,
                'filter.transDate.op' => 'BETWEEN',
                'filter.transDate.val[0]' => $from,
                'filter.transDate.val[1]' => $to,
                'fields' => 'id,number',
            ]);

            if (($list['s'] ?? false) !== true) {
                $reason = is_array($list['d'] ?? null) ? implode(', ', $list['d']) : ($list['d'] ?? 'gagal list faktur');
                throw new \RuntimeException('List faktur gagal: '.$reason);
            }

            $pageCount = $list['sp']['pageCount'] ?? 1;
            $rows = $list['d'] ?? [];
            $log("Faktur halaman {$page}/{$pageCount} ({$invoices} terproses)…");

            foreach ($rows as $row) {
                $det = $this->acc->apiGet($s, 'sales-invoice/detail.do', ['id' => $row['id']]);
                $d = $det['d'] ?? null;
                if (! is_array($d)) {
                    continue;
                }

                DB::table('acc_sales_invoices')->upsert([[
                    'erp_id' => $d['id'],
                    'number' => $d['number'] ?? null,
                    'trans_date' => $this->date($d['transDate'] ?? null),
                    'ship_date' => $this->date($d['shipDate'] ?? null),
                    'due_date' => $this->date($d['dueDate'] ?? null),
                    'po_number' => $d['poNumber'] ?? null,
                    'description' => $d['description'] ?? null,
                    'customer_id' => $d['customerId'] ?? null,
                    'customer_name' => is_array($d['customer'] ?? null) ? ($d['customer']['name'] ?? null) : ($d['retailWpName'] ?? null),
                    'status_name' => $d['statusName'] ?? null,
                    'dpp' => $d['taxableAmount1'] ?? 0,
                    'ppn' => $d['tax1Amount'] ?? 0,
                    'total' => $d['totalAmount'] ?? 0,
                    'synced_at' => $now,
                ]], ['erp_id'], ['number', 'trans_date', 'ship_date', 'due_date', 'po_number', 'description', 'customer_id', 'customer_name', 'status_name', 'dpp', 'ppn', 'total', 'synced_at']);
                $invoices++;

                $rowsItems = [];
                foreach ($d['detailItem'] ?? [] as $it) {
                    $soId = $it['salesOrderId'] ?? null;
                    $doId = $it['deliveryOrderId'] ?? null;
                    if ($soId) {
                        $soIds[$soId] = true;
                    }
                    if ($doId) {
                        $doIds[$doId] = true;
                    }

                    $rowsItems[] = [
                        'erp_id' => $it['id'],
                        'erp_invoice_id' => $d['id'],
                        'invoice_number' => $d['number'] ?? null,
                        'seq' => $it['seq'] ?? null,
                        'item_no' => is_array($it['item'] ?? null) ? ($it['item']['no'] ?? null) : null,
                        'item_name' => $it['detailName'] ?? (is_array($it['item'] ?? null) ? ($it['item']['name'] ?? null) : null),
                        'qty' => $it['quantity'] ?? 0,
                        'unit' => is_array($it['itemUnit'] ?? null) ? ($it['itemUnit']['name'] ?? null) : ($it['availableItemUnitName'] ?? null),
                        'unit_price' => $it['unitPrice'] ?? 0,
                        'gross' => $it['grossAmount'] ?? 0,
                        'disc_percent' => $it['itemDiscPercent'] ?: 0,
                        'disc_amount' => $it['itemCashDiscount'] ?? 0,
                        'dpp' => $it['dppAmount'] ?? 0,
                        'ppn' => $it['tax1Amount'] ?? 0,
                        'tax_name' => $it['detailTaxName'] ?? null,
                        'total' => $it['totalPrice'] ?? 0,
                        'so_id' => $soId,
                        'so_number' => is_array($it['salesOrder'] ?? null) ? ($it['salesOrder']['number'] ?? null) : null,
                        'do_id' => $doId,
                        'do_number' => is_array($it['deliveryOrder'] ?? null) ? ($it['deliveryOrder']['number'] ?? null) : null,
                        'synced_at' => $now,
                    ];
                }

                if ($rowsItems) {
                    DB::table('acc_sales_invoice_items')->upsert($rowsItems, ['erp_id'], ['erp_invoice_id', 'invoice_number', 'seq', 'item_no', 'item_name', 'qty', 'unit', 'unit_price', 'gross', 'disc_percent', 'disc_amount', 'dpp', 'ppn', 'tax_name', 'total', 'so_id', 'so_number', 'do_id', 'do_number', 'synced_at']);
                    $items += count($rowsItems);
                }
            }

            $page++;
        } while ($page <= $pageCount);

        // Referenced Sales Orders.
        $soIds = array_keys($soIds);
        $log(count($soIds).' Sales Order…');
        foreach ($soIds as $id) {
            $d = $this->acc->apiGet($s, 'sales-order/detail.do', ['id' => $id])['d'] ?? null;
            if (! is_array($d)) {
                continue;
            }
            DB::table('acc_sales_orders')->upsert([[
                'erp_id' => $d['id'],
                'number' => $d['number'] ?? null,
                'trans_date' => $this->date($d['transDate'] ?? null),
                'po_number' => $d['poNumber'] ?? null,
                'customer_id' => $d['customerId'] ?? null,
                'customer_name' => is_array($d['customer'] ?? null) ? ($d['customer']['name'] ?? null) : null,
                'total' => $d['totalAmount'] ?? 0,
                'status_name' => $d['statusName'] ?? null,
                'synced_at' => $now,
            ]], ['erp_id'], ['number', 'trans_date', 'po_number', 'customer_id', 'customer_name', 'total', 'status_name', 'synced_at']);
        }

        // Referenced Delivery Orders (Surat Jalan).
        $doIds = array_keys($doIds);
        $log(count($doIds).' Delivery Order…');
        foreach ($doIds as $id) {
            $d = $this->acc->apiGet($s, 'delivery-order/detail.do', ['id' => $id])['d'] ?? null;
            if (! is_array($d)) {
                continue;
            }
            DB::table('acc_delivery_orders')->upsert([[
                'erp_id' => $d['id'],
                'number' => $d['number'] ?? null,
                'trans_date' => $this->date($d['transDate'] ?? null),
                'po_number' => $d['poNumber'] ?? null,
                'customer_id' => $d['customerId'] ?? null,
                'customer_name' => is_array($d['customer'] ?? null) ? ($d['customer']['name'] ?? null) : null,
                'synced_at' => $now,
            ]], ['erp_id'], ['number', 'trans_date', 'po_number', 'customer_id', 'customer_name', 'synced_at']);
        }

        return [
            'invoices' => $invoices,
            'items' => $items,
            'sales_orders' => count($soIds),
            'delivery_orders' => count($doIds),
        ];
    }

    /** Convert Accurate's dd/MM/yyyy to Y-m-d (null-safe). */
    protected function date(?string $v): ?string
    {
        if (blank($v)) {
            return null;
        }

        try {
            return Carbon::createFromFormat('d/m/Y', $v)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }
}
