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
                        'trans_date' => $this->date($d['transDate'] ?? null),
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
                    DB::table('acc_sales_invoice_items')->upsert($rowsItems, ['erp_id'], ['erp_invoice_id', 'invoice_number', 'trans_date', 'seq', 'item_no', 'item_name', 'qty', 'unit', 'unit_price', 'gross', 'disc_percent', 'disc_amount', 'dpp', 'ppn', 'tax_name', 'total', 'so_id', 'so_number', 'do_id', 'do_number', 'synced_at']);
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

    /**
     * Pull Sales Orders (+ line items = ordered goods) for a period, independent of invoices.
     *
     * @param  callable(string):void|null  $progress
     * @return array<string, int>
     */
    public function syncSalesOrders(string $from, string $to, ?callable $progress = null): array
    {
        @set_time_limit(0);
        $s = AccurateSetting::current();
        $now = now()->toDateTimeString();
        $log = fn (string $m) => $progress && $progress($m);
        $orders = 0;
        $items = 0;
        $page = 1;

        do {
            $list = $this->listPage($s, 'sales-order/list.do', $from, $to, $page);
            $pageCount = $list['sp']['pageCount'] ?? 1;
            $log('Sales Order halaman '.$page.'/'.$pageCount."…");

            foreach ($list['d'] ?? [] as $row) {
                $d = $this->acc->apiGet($s, 'sales-order/detail.do', ['id' => $row['id']])['d'] ?? null;
                if (! is_array($d)) {
                    continue;
                }
                $td = $this->date($d['transDate'] ?? null);

                DB::table('acc_sales_orders')->upsert([[
                    'erp_id' => $d['id'],
                    'number' => $d['number'] ?? null,
                    'trans_date' => $td,
                    'po_number' => $d['poNumber'] ?? null,
                    'customer_id' => $d['customerId'] ?? null,
                    'customer_name' => is_array($d['customer'] ?? null) ? ($d['customer']['name'] ?? null) : null,
                    'total' => $d['totalAmount'] ?? 0,
                    'status_name' => $d['statusName'] ?? null,
                    'synced_at' => $now,
                ]], ['erp_id'], ['number', 'trans_date', 'po_number', 'customer_id', 'customer_name', 'total', 'status_name', 'synced_at']);
                $orders++;

                $li = [];
                foreach ($d['detailItem'] ?? [] as $it) {
                    $li[] = [
                        'erp_id' => $it['id'],
                        'erp_so_id' => $d['id'],
                        'so_number' => $d['number'] ?? null,
                        'trans_date' => $td,
                        'seq' => $it['seq'] ?? null,
                        'item_no' => is_array($it['item'] ?? null) ? ($it['item']['no'] ?? null) : null,
                        'item_name' => $it['detailName'] ?? (is_array($it['item'] ?? null) ? ($it['item']['name'] ?? null) : null),
                        'qty' => $it['quantity'] ?? 0,
                        'unit' => is_array($it['itemUnit'] ?? null) ? ($it['itemUnit']['name'] ?? null) : ($it['availableItemUnitName'] ?? null),
                        'unit_price' => $it['unitPrice'] ?? 0,
                        'total' => $it['totalPrice'] ?? 0,
                        'synced_at' => $now,
                    ];
                }
                if ($li) {
                    DB::table('acc_sales_order_items')->upsert($li, ['erp_id'], ['erp_so_id', 'so_number', 'trans_date', 'seq', 'item_no', 'item_name', 'qty', 'unit', 'unit_price', 'total', 'synced_at']);
                    $items += count($li);
                }
            }

            $page++;
        } while ($page <= $pageCount);

        return ['sales_orders' => $orders, 'so_items' => $items];
    }

    /**
     * Pull Delivery Orders (+ line items = shipped goods) for a period, independent of invoices.
     *
     * @param  callable(string):void|null  $progress
     * @return array<string, int>
     */
    public function syncDeliveryOrders(string $from, string $to, ?callable $progress = null): array
    {
        @set_time_limit(0);
        $s = AccurateSetting::current();
        $now = now()->toDateTimeString();
        $log = fn (string $m) => $progress && $progress($m);
        $orders = 0;
        $items = 0;
        $page = 1;

        do {
            $list = $this->listPage($s, 'delivery-order/list.do', $from, $to, $page);
            $pageCount = $list['sp']['pageCount'] ?? 1;
            $log('Delivery Order halaman '.$page.'/'.$pageCount."…");

            foreach ($list['d'] ?? [] as $row) {
                $d = $this->acc->apiGet($s, 'delivery-order/detail.do', ['id' => $row['id']])['d'] ?? null;
                if (! is_array($d)) {
                    continue;
                }
                $td = $this->date($d['transDate'] ?? null);

                DB::table('acc_delivery_orders')->upsert([[
                    'erp_id' => $d['id'],
                    'number' => $d['number'] ?? null,
                    'trans_date' => $td,
                    'po_number' => $d['poNumber'] ?? null,
                    'customer_id' => $d['customerId'] ?? null,
                    'customer_name' => is_array($d['customer'] ?? null) ? ($d['customer']['name'] ?? null) : null,
                    'synced_at' => $now,
                ]], ['erp_id'], ['number', 'trans_date', 'po_number', 'customer_id', 'customer_name', 'synced_at']);
                $orders++;

                $li = [];
                foreach ($d['detailItem'] ?? [] as $it) {
                    $li[] = [
                        'erp_id' => $it['id'],
                        'erp_do_id' => $d['id'],
                        'do_number' => $d['number'] ?? null,
                        'trans_date' => $td,
                        'seq' => $it['seq'] ?? null,
                        'item_no' => is_array($it['item'] ?? null) ? ($it['item']['no'] ?? null) : null,
                        'item_name' => $it['detailName'] ?? (is_array($it['item'] ?? null) ? ($it['item']['name'] ?? null) : null),
                        'qty' => $it['quantity'] ?? 0,
                        'unit' => is_array($it['itemUnit'] ?? null) ? ($it['itemUnit']['name'] ?? null) : ($it['availableItemUnitName'] ?? null),
                        'so_number' => is_array($it['salesOrder'] ?? null) ? ($it['salesOrder']['number'] ?? null) : null,
                        'synced_at' => $now,
                    ];
                }
                if ($li) {
                    DB::table('acc_delivery_order_items')->upsert($li, ['erp_id'], ['erp_do_id', 'do_number', 'trans_date', 'seq', 'item_no', 'item_name', 'qty', 'unit', 'so_number', 'synced_at']);
                    $items += count($li);
                }
            }

            $page++;
        } while ($page <= $pageCount);

        return ['delivery_orders' => $orders, 'do_items' => $items];
    }

    /**
     * Pull the current stock snapshot for every item (item/list.do). Upsert by erp_id.
     * The quantity is the LIVE balance at pull time; $snapshotDate is just a label.
     *
     * @param  callable(string):void|null  $progress
     * @return array<string, int>
     */
    public function syncItemStock(?string $snapshotDate = null, bool $truncate = false, ?callable $progress = null): array
    {
        @set_time_limit(0);
        $s = AccurateSetting::current();
        $now = now()->toDateTimeString();
        $snapshotDate = $snapshotDate ?: now()->toDateString();
        $log = fn (string $m) => $progress && $progress($m);
        $count = 0;
        $page = 1;

        if ($truncate) {
            DB::table('acc_item_stock')->truncate();
            $log('Data stok lama dihapus (truncate).');
        }

        do {
            $list = $this->acc->apiGet($s, 'item/list.do', [
                'sp.page' => $page,
                'sp.pageSize' => 100,
                'fields' => 'id,no,name,itemType,unitPrice,quantity,availableToSell',
            ]);

            if (($list['s'] ?? false) !== true) {
                $reason = is_array($list['d'] ?? null) ? implode(', ', $list['d']) : ($list['d'] ?? 'gagal list item');
                throw new \RuntimeException('List item gagal: '.$reason);
            }

            $pageCount = $list['sp']['pageCount'] ?? 1;
            $log('Item halaman '.$page.'/'.$pageCount."…");

            $batch = [];
            foreach ($list['d'] ?? [] as $r) {
                $batch[] = [
                    'erp_id' => $r['id'],
                    'item_no' => $r['no'] ?? null,
                    'name' => $r['name'] ?? null,
                    'item_type' => $r['itemType'] ?? null,
                    'unit_price' => $r['unitPrice'] ?? 0,
                    'quantity' => $r['quantity'] ?? 0,
                    'available_to_sell' => $r['availableToSell'] ?? 0,
                    'snapshot_date' => $snapshotDate,
                    'synced_at' => $now,
                ];
            }
            if ($batch) {
                DB::table('acc_item_stock')->upsert($batch, ['erp_id'], ['item_no', 'name', 'item_type', 'unit_price', 'quantity', 'available_to_sell', 'snapshot_date', 'synced_at']);
                $count += count($batch);
            }

            $page++;
        } while ($page <= $pageCount);

        return ['items' => $count];
    }

    /**
     * Reconstruct a per-item, per-document stock movement ledger from Accurate transaction
     * documents into acc_stock_movements (idempotent upsert by doc_type + line_id).
     *
     * Sign convention (+ masuk / − keluar) and double-count avoidance:
     *   DO delivery-order  → −  | RI receive-item → +  | SR sales-return → +
     *   PR purchase-return → −  | IA item-adjustment → ±(itemAdjustmentType)
     *   SI sales-invoice   → − but ONLY lines without deliveryOrderId (direct invoices; the
     *                          rest already moved stock via their DO)
     *   PI purchase-invoice→ + but ONLY lines without receiveItemId (direct receipts)
     * Item Transfer is intentionally excluded (net-zero for total/all-warehouse stock).
     *
     * @param  string  $from  dd/MM/yyyy
     * @param  string  $to    dd/MM/yyyy
     * @param  list<string>|null  $docTypes  subset of DO,RI,SR,PR,IA,SI,PI (null = all)
     * @param  callable(string):void|null  $progress
     * @return array<string, array{docs:int, lines:int}>
     */
    public function syncStockMovements(string $from, string $to, ?array $docTypes = null, bool $truncate = false, ?callable $progress = null): array
    {
        @set_time_limit(0);
        $s = AccurateSetting::current();
        $now = now()->toDateTimeString();
        $log = fn (string $m) => $progress && $progress($m);

        $defs = [
            'DO' => ['list' => 'delivery-order/list.do', 'detail' => 'delivery-order/detail.do', 'dir' => -1, 'skip' => null],
            'RI' => ['list' => 'receive-item/list.do', 'detail' => 'receive-item/detail.do', 'dir' => 1, 'skip' => null],
            'SR' => ['list' => 'sales-return/list.do', 'detail' => 'sales-return/detail.do', 'dir' => 1, 'skip' => null],
            'PR' => ['list' => 'purchase-return/list.do', 'detail' => 'purchase-return/detail.do', 'dir' => -1, 'skip' => null],
            'IA' => ['list' => 'item-adjustment/list.do', 'detail' => 'item-adjustment/detail.do', 'dir' => 'adj', 'skip' => null],
            'SI' => ['list' => 'sales-invoice/list.do', 'detail' => 'sales-invoice/detail.do', 'dir' => -1, 'skip' => 'deliveryOrderId'],
            'PI' => ['list' => 'purchase-invoice/list.do', 'detail' => 'purchase-invoice/detail.do', 'dir' => 1, 'skip' => 'receiveItemId'],
        ];
        $types = $docTypes ?: array_keys($defs);
        $result = [];

        if ($truncate) {
            DB::table('acc_stock_movements')->whereIn('doc_type', $types)->delete();
            $log('Mutasi lama (tipe terpilih) dihapus.');
        }

        foreach ($types as $type) {
            if (! isset($defs[$type])) {
                continue;
            }
            $def = $defs[$type];
            $docs = 0;
            $lines = 0;
            $page = 1;

            do {
                $list = $this->retry(fn () => $this->listPage($s, $def['list'], $from, $to, $page));
                $pageCount = $list['sp']['pageCount'] ?? 1;
                $log("{$type} halaman {$page}/{$pageCount} ({$docs} dok)…");

                foreach ($list['d'] ?? [] as $row) {
                    $d = $this->retry(fn () => $this->acc->apiGet($s, $def['detail'], ['id' => $row['id']])['d'] ?? null);
                    if (! is_array($d)) {
                        continue;
                    }
                    $td = $this->date($d['transDate'] ?? null);
                    $batch = [];

                    foreach ($d['detailItem'] ?? [] as $it) {
                        $lineId = $it['id'] ?? null;
                        if (! $lineId) {
                            continue;
                        }
                        if ($def['skip'] && ! empty($it[$def['skip']])) {
                            continue; // line already moved stock via its source doc
                        }
                        // GROUP/bundle line is logical only — its components are listed
                        // separately and hold the real stock; skip to avoid double counting.
                        $itemType = is_array($it['item'] ?? null) ? ($it['item']['itemType'] ?? null) : null;
                        if (in_array($itemType, ['GROUP', 'GROUP_MANUFACTURE', 'SERVICE', 'NON_INVENTORY'], true)) {
                            continue;
                        }
                        $qtyAbs = (float) ($it['quantity'] ?? 0);
                        if ($qtyAbs == 0.0) {
                            continue;
                        }
                        $sign = $def['dir'] === 'adj'
                            ? ((($it['itemAdjustmentType'] ?? '') === 'ADJUSTMENT_OUT') ? -1 : 1)
                            : $def['dir'];

                        $batch[] = [
                            'doc_type' => $type,
                            'doc_number' => $d['number'] ?? null,
                            'trans_date' => $td,
                            'item_no' => is_array($it['item'] ?? null) ? ($it['item']['no'] ?? null) : null,
                            'item_id' => is_array($it['item'] ?? null) ? ($it['item']['id'] ?? null) : ($it['itemId'] ?? null),
                            'item_name' => $it['detailName'] ?? (is_array($it['item'] ?? null) ? ($it['item']['name'] ?? null) : null),
                            'warehouse' => is_array($it['warehouse'] ?? null) ? ($it['warehouse']['name'] ?? null) : ($it['warehouseName'] ?? null),
                            'qty' => $sign * $qtyAbs,
                            'erp_doc_id' => $d['id'] ?? null,
                            'line_id' => $lineId,
                            'synced_at' => $now,
                        ];
                    }

                    if ($batch) {
                        DB::table('acc_stock_movements')->upsert($batch, ['doc_type', 'line_id'], ['doc_number', 'trans_date', 'item_no', 'item_id', 'item_name', 'warehouse', 'qty', 'erp_doc_id', 'synced_at']);
                        $lines += count($batch);
                    }
                    $docs++;
                }

                $page++;
            } while ($page <= $pageCount);

            $result[$type] = ['docs' => $docs, 'lines' => $lines];
            $log("{$type} selesai: {$docs} dokumen, {$lines} baris.");
        }

        return $result;
    }

    /**
     * One page of a *.do list endpoint filtered by transDate BETWEEN. Throws on API error.
     *
     * @return array<string, mixed>
     */
    protected function listPage(AccurateSetting $s, string $path, string $from, string $to, int $page): array
    {
        $list = $this->acc->apiGet($s, $path, [
            'sp.page' => $page,
            'sp.pageSize' => 100,
            'filter.transDate.op' => 'BETWEEN',
            'filter.transDate.val[0]' => $from,
            'filter.transDate.val[1]' => $to,
            'fields' => 'id,number',
        ]);

        if (($list['s'] ?? false) !== true) {
            $reason = is_array($list['d'] ?? null) ? implode(', ', $list['d']) : ($list['d'] ?? 'gagal list');
            throw new \RuntimeException('List '.$path.' gagal: '.$reason);
        }

        return $list;
    }

    /**
     * Retry a closure on transient failures (cURL resets / network hiccups), with backoff.
     * RuntimeExceptions from list endpoints (API errors) are also retried a few times since
     * they may be momentary rate limits; the final attempt rethrows.
     *
     * @template T
     *
     * @param  callable():T  $fn
     * @return T
     */
    protected function retry(callable $fn, int $tries = 5)
    {
        for ($i = 1; ; $i++) {
            try {
                return $fn();
            } catch (\Throwable $e) {
                if ($i >= $tries) {
                    throw $e;
                }
                sleep(min($i * 2, 10));
            }
        }
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
