<?php

namespace App\Services\Accurate;

use App\Models\AccurateSetting;
use App\Support\InventorySnapshot;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AccurateSyncService
{
    /** Baris faktur < nilai ini dianggap USD pada heuristik mata uang vendor tanpa data PO. */
    public const USD_LINE_THRESHOLD = 600000;

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
     * Pull the current stock snapshot for every item (item/list.do) into
     * dwh_fact_inventory_snapshot (source = accurate), satu baris per item per tanggal.
     *
     * Kuantitas dari API adalah saldo LIVE saat ditarik, jadi $snapshotDate = tanggal
     * penarikan dan sisi Accurate ini HANYA bisa maju (tidak bisa di-backfill mundur,
     * beda dari ERP yang dihitung genuinely as-of).
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
            // Hanya bersihkan tanggal ini — riwayat tanggal lain tidak boleh ikut hilang.
            DB::table(InventorySnapshot::TABLE)
                ->where('source', InventorySnapshot::ACCURATE)
                ->where('snapshot_date', $snapshotDate)
                ->delete();
            $log('Snapshot Accurate tanggal '.$snapshotDate.' dibersihkan untuk diisi ulang.');
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
                if (($r['no'] ?? null) === null) {
                    continue; // tanpa item_no tak bisa dicocokkan ke ERP ref
                }
                $batch[] = [
                    'source' => InventorySnapshot::ACCURATE,
                    'snapshot_date' => $snapshotDate,
                    'ref' => $r['no'],
                    'label' => $r['name'] ?? null,
                    'qty' => $r['quantity'] ?? 0,
                    'acc_item_id' => $r['id'],
                    'item_type' => $r['itemType'] ?? null,
                    'unit_price' => $r['unitPrice'] ?? 0,
                    'available_to_sell' => $r['availableToSell'] ?? 0,
                    'synced_at' => $now,
                ];
            }
            if ($batch) {
                DB::table(InventorySnapshot::TABLE)->upsert(
                    $batch,
                    ['source', 'ref', 'snapshot_date'],
                    ['label', 'qty', 'acc_item_id', 'item_type', 'unit_price', 'available_to_sell', 'synced_at'],
                );
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
     * Pull the chart of accounts (glaccount/list.do) into dwh_stg_acc_glaccount.
     *
     * Endpoint ini TIDAK diblokir hak akses (beda dari journal-voucher/expense), jadi
     * struktur COA — accountType + parentName — tetap bisa ditarik otomatis dan dipakai
     * menyusun P&L tanpa pemetaan manual.
     *
     * CATATAN: `balance` adalah saldo BERJALAN saat ditarik; parameter tanggal diabaikan
     * Accurate, jadi kolom ini TIDAK bisa dipakai untuk tren per periode. Tren datang dari
     * dwh_stg_gl (hasil unggahan Buku Besar).
     *
     * @param  callable(string):void|null  $progress
     * @return array<string, int>
     */
    public function syncGlAccounts(?callable $progress = null): array
    {
        @set_time_limit(0);
        $s = AccurateSetting::current();
        $now = now()->toDateTimeString();
        $log = fn (string $m) => $progress && $progress($m);
        $count = 0;
        $page = 1;

        do {
            $list = $this->acc->apiGet($s, 'glaccount/list.do', [
                'sp.page' => $page,
                'sp.pageSize' => 100,
                'fields' => 'id,no,name,accountType,parentName,balance',
            ]);

            if (($list['s'] ?? false) !== true) {
                $reason = is_array($list['d'] ?? null) ? implode(', ', $list['d']) : ($list['d'] ?? 'gagal list glaccount');
                throw new \RuntimeException('List COA gagal: '.$reason);
            }

            $pageCount = $list['sp']['pageCount'] ?? 1;
            $log('COA halaman '.$page.'/'.$pageCount.'…');

            $batch = [];
            foreach ($list['d'] ?? [] as $r) {
                if (($r['no'] ?? null) === null) {
                    continue; // tanpa nomor akun tak bisa dicocokkan ke buku besar
                }
                $batch[] = [
                    'acc_id' => $r['id'],
                    'no' => (string) $r['no'],
                    'name' => $r['name'] ?? null,
                    'account_type' => $r['accountType'] ?? null,
                    'parent_name' => $r['parentName'] ?? null,
                    'balance' => $r['balance'] ?? 0,
                    'synced_at' => $now,
                ];
            }
            if ($batch) {
                DB::table('dwh_stg_acc_glaccount')->upsert($batch, ['acc_id'],
                    ['no', 'name', 'account_type', 'parent_name', 'balance', 'synced_at']);
                $count += count($batch);
            }

            $page++;
        } while ($page <= $pageCount);

        return ['accounts' => $count];
    }

    /**
     * TRIAL (Analisa Produk): pull purchase-invoice lines for a set of item numbers into
     * tmp_product_purchases — the buy-price basis for COGS estimation and price trends.
     * Idempotent upsert by erp_id (PI detail line id).
     *
     * @param  string  $from  dd/MM/yyyy
     * @param  string  $to    dd/MM/yyyy
     * @param  list<string>  $itemNos
     * @param  callable(string):void|null  $progress
     * @return array<string, int>
     */
    public function syncProductPurchases(string $from, string $to, array $itemNos, ?callable $progress = null): array
    {
        @set_time_limit(0);
        $s = AccurateSetting::current();
        $now = now()->toDateTimeString();
        $log = fn (string $m) => $progress && $progress($m);
        $wanted = array_flip(array_filter($itemNos));
        $docs = 0;
        $lines = 0;
        $page = 1;

        do {
            $list = $this->retry(fn () => $this->listPage($s, 'purchase-invoice/list.do', $from, $to, $page));
            $pageCount = $list['sp']['pageCount'] ?? 1;
            $log("Faktur pembelian halaman {$page}/{$pageCount} ({$lines} baris cocok)…");

            foreach ($list['d'] ?? [] as $row) {
                $d = $this->retry(fn () => $this->acc->apiGet($s, 'purchase-invoice/detail.do', ['id' => $row['id']])['d'] ?? null);
                if (! is_array($d)) {
                    continue;
                }
                $td = $this->date($d['transDate'] ?? null);
                $vendor = is_array($d['vendor'] ?? null) ? ($d['vendor']['name'] ?? null) : ($d['vendorName'] ?? null);
                $batch = [];

                foreach ($d['detailItem'] ?? [] as $it) {
                    $itemNo = is_array($it['item'] ?? null) ? ($it['item']['no'] ?? null) : null;
                    if (! $itemNo || ! isset($wanted[$itemNo]) || empty($it['id'])) {
                        continue;
                    }
                    $batch[] = [
                        'erp_id' => $it['id'],
                        'erp_doc_id' => $d['id'] ?? null,
                        'doc_number' => $d['number'] ?? null,
                        'trans_date' => $td,
                        'vendor_name' => $vendor,
                        'item_no' => $itemNo,
                        'item_name' => $it['detailName'] ?? (is_array($it['item'] ?? null) ? ($it['item']['name'] ?? null) : null),
                        'qty' => $it['quantity'] ?? 0,
                        'unit' => is_array($it['itemUnit'] ?? null) ? ($it['itemUnit']['name'] ?? null) : ($it['availableItemUnitName'] ?? null),
                        'unit_price' => $it['unitPrice'] ?? 0,
                        'total' => $it['totalPrice'] ?? ((float) ($it['quantity'] ?? 0) * (float) ($it['unitPrice'] ?? 0)),
                        'synced_at' => $now,
                    ];
                }

                if ($batch) {
                    DB::table('tmp_product_purchases')->upsert($batch, ['erp_id'], ['erp_doc_id', 'doc_number', 'trans_date', 'vendor_name', 'item_no', 'item_name', 'qty', 'unit', 'unit_price', 'total', 'synced_at']);
                    $lines += count($batch);
                    $docs++;
                }
            }

            $page++;
        } while ($page <= $pageCount);

        return ['purchase_docs' => $docs, 'purchase_lines' => $lines];
    }

    /**
     * Pull purchase-invoice lines for ALL items into dwh_stg_acc_purchase_invoice_item —
     * the buy-price basis for HPP (harga pokok) per produk. Idempotent upsert by erp_id.
     *
     * Beda dari syncProductPurchases (trial, item terpilih): tanpa filter itemNos, dan
     * menulis ke tabel permanen dwh_*. Panggil recomputeProductCost() setelahnya.
     *
     * @param  string  $from  dd/MM/yyyy
     * @param  string  $to    dd/MM/yyyy
     * @param  callable(string):void|null  $progress
     * @return array<string, int>
     */
    public function syncPurchaseInvoices(string $from, string $to, ?callable $progress = null): array
    {
        @set_time_limit(0);
        $s = AccurateSetting::current();
        $now = now()->toDateTimeString();
        $log = fn (string $m) => $progress && $progress($m);
        $docs = 0;
        $lines = 0;
        $page = 1;

        do {
            $list = $this->retry(fn () => $this->listPage($s, 'purchase-invoice/list.do', $from, $to, $page));
            $pageCount = $list['sp']['pageCount'] ?? 1;
            $log("Faktur pembelian halaman {$page}/{$pageCount} ({$lines} baris)…");

            foreach ($list['d'] ?? [] as $row) {
                $d = $this->retry(fn () => $this->acc->apiGet($s, 'purchase-invoice/detail.do', ['id' => $row['id']])['d'] ?? null);
                if (! is_array($d)) {
                    continue;
                }
                $td = $this->date($d['transDate'] ?? null);
                $vendor = is_array($d['vendor'] ?? null) ? ($d['vendor']['name'] ?? null) : ($d['vendorName'] ?? null);
                $batch = [];

                foreach ($d['detailItem'] ?? [] as $it) {
                    $itemNo = is_array($it['item'] ?? null) ? ($it['item']['no'] ?? null) : null;
                    if (! $itemNo || empty($it['id'])) {
                        continue;
                    }
                    $batch[] = [
                        'erp_id' => $it['id'],
                        'erp_doc_id' => $d['id'] ?? null,
                        'doc_number' => $d['number'] ?? null,
                        // Nomor PO per baris = ref PO Dolibarr (alur: PO lahir di Dolibarr → input Accurate).
                        'po_number' => is_array($it['purchaseOrder'] ?? null) ? ($it['purchaseOrder']['number'] ?? null) : null,
                        'trans_date' => $td,
                        'vendor_name' => $vendor,
                        'item_no' => $itemNo,
                        'item_name' => $it['detailName'] ?? (is_array($it['item'] ?? null) ? ($it['item']['name'] ?? null) : null),
                        'qty' => $it['quantity'] ?? 0,
                        'unit' => is_array($it['itemUnit'] ?? null) ? ($it['itemUnit']['name'] ?? null) : ($it['availableItemUnitName'] ?? null),
                        'unit_price' => $it['unitPrice'] ?? 0,
                        'total' => $it['totalPrice'] ?? ((float) ($it['quantity'] ?? 0) * (float) ($it['unitPrice'] ?? 0)),
                        'synced_at' => $now,
                    ];
                }

                if ($batch) {
                    DB::table('dwh_stg_acc_purchase_invoice_item')->upsert($batch, ['erp_id'],
                        ['erp_doc_id', 'doc_number', 'po_number', 'trans_date', 'vendor_name', 'item_no', 'item_name', 'qty', 'unit', 'unit_price', 'total', 'synced_at']);
                    $lines += count($batch);
                    $docs++;
                }

                // Baris BIAYA (detailExpense): freight impor, PIB/custom clearance, storage —
                // bahan analisa biaya impor di dashboard Purchasing. Nilai = mata uang dokumen.
                $expBatch = [];
                foreach ($d['detailExpense'] ?? [] as $ex) {
                    if (empty($ex['id'])) {
                        continue;
                    }
                    $expBatch[] = [
                        'erp_id' => $ex['id'],
                        'erp_doc_id' => $d['id'] ?? null,
                        'doc_number' => $d['number'] ?? null,
                        'trans_date' => $td,
                        'vendor_name' => $vendor,
                        'account_no' => is_array($ex['account'] ?? null) ? ($ex['account']['no'] ?? null) : null,
                        'account_name' => is_array($ex['account'] ?? null) ? ($ex['account']['name'] ?? null) : ($ex['expenseName'] ?? null),
                        'notes' => $ex['expenseNotes'] ?? null,
                        'amount' => $ex['expenseAmount'] ?? 0,
                        'synced_at' => $now,
                    ];
                }
                if ($expBatch) {
                    DB::table('dwh_stg_acc_purchase_expense')->upsert($expBatch, ['erp_id'],
                        ['erp_doc_id', 'doc_number', 'trans_date', 'vendor_name', 'account_no', 'account_name', 'notes', 'amount', 'synced_at']);
                }
            }

            $page++;
        } while ($page <= $pageCount);

        return ['purchase_docs' => $docs, 'purchase_lines' => $lines];
    }

    /**
     * Tarik pesanan pembelian (purchase-order) → dwh_stg_acc_purchase_order.
     * Nomor PO Accurate = ref PO Dolibarr; dokumen menyimpan mata uang asli + kurs riil.
     * Setelah sync, kurs riil diringkas ke dwh_fx_rate (source 'document') per bulan —
     * menimpa kurs asumsi/lookup tapi TIDAK menimpa kurs manual.
     *
     * @param  string  $from  dd/MM/yyyy
     * @param  string  $to    dd/MM/yyyy
     * @param  callable(string):void|null  $progress
     * @return array<string, int>
     */
    public function syncPurchaseOrders(string $from, string $to, ?callable $progress = null): array
    {
        @set_time_limit(0);
        $s = AccurateSetting::current();
        $now = now()->toDateTimeString();
        $log = fn (string $m) => $progress && $progress($m);
        $docs = 0;
        $page = 1;

        do {
            $list = $this->retry(fn () => $this->listPage($s, 'purchase-order/list.do', $from, $to, $page));
            $pageCount = $list['sp']['pageCount'] ?? 1;
            $log("Pesanan pembelian halaman {$page}/{$pageCount} ({$docs} PO)…");

            foreach ($list['d'] ?? [] as $row) {
                $d = $this->retry(fn () => $this->acc->apiGet($s, 'purchase-order/detail.do', ['id' => $row['id']])['d'] ?? null);
                if (! is_array($d)) {
                    continue;
                }
                DB::table('dwh_stg_acc_purchase_order')->upsert([[
                    'erp_id' => $d['id'],
                    'number' => $d['number'] ?? null,
                    'trans_date' => $this->date($d['transDate'] ?? null),
                    'vendor_name' => is_array($d['vendor'] ?? null) ? ($d['vendor']['name'] ?? null) : null,
                    'status_name' => $d['statusName'] ?? null,
                    'status_code' => $d['status'] ?? null,
                    'percent_shipped' => $d['percentShipped'] ?? null,
                    'currency_code' => is_array($d['currency'] ?? null) ? ($d['currency']['code'] ?? null) : null,
                    'rate' => $d['rate'] ?? null,
                    'total_amount' => $d['totalAmount'] ?? 0,
                    'synced_at' => $now,
                ]], ['erp_id'], ['number', 'trans_date', 'vendor_name', 'status_name', 'status_code', 'percent_shipped', 'currency_code', 'rate', 'total_amount', 'synced_at']);
                $docs++;
            }

            $page++;
        } while ($page <= $pageCount);

        // Kurs riil per (mata uang, bulan) dari PO — sumber terbaik yang ada. Jangan ganggu manual.
        DB::statement("
            INSERT INTO dwh_fx_rate (currency, period, rate_to_idr, source, note, created_at, updated_at)
            SELECT currency_code, LEFT(trans_date, 7), ROUND(AVG(rate), 2), 'document', 'rata-rata kurs PO Accurate', NOW(), NOW()
            FROM dwh_stg_acc_purchase_order
            WHERE currency_code IS NOT NULL AND currency_code <> 'IDR' AND rate > 1 AND trans_date IS NOT NULL
            GROUP BY currency_code, LEFT(trans_date, 7)
            ON DUPLICATE KEY UPDATE
                rate_to_idr = IF(dwh_fx_rate.source = 'manual', dwh_fx_rate.rate_to_idr, VALUES(rate_to_idr)),
                source = IF(dwh_fx_rate.source = 'manual', 'manual', 'document'),
                note = IF(dwh_fx_rate.source = 'manual', dwh_fx_rate.note, VALUES(note)),
                updated_at = IF(dwh_fx_rate.source = 'manual', dwh_fx_rate.updated_at, NOW())
        ");

        return ['po_docs' => $docs];
    }

    /**
     * Tarik pembayaran pembelian (purchase-payment) → dwh_stg_acc_purchase_payment,
     * satu baris per (payment, faktur yang dibayar). Sumber tanggal bayar & bank riil
     * untuk fitur "buat payment di Dolibarr" di Monitoring Pembelian.
     *
     * @param  string  $from  dd/MM/yyyy
     * @param  string  $to    dd/MM/yyyy
     * @param  callable(string):void|null  $progress
     * @return array<string, int>
     */
    public function syncPurchasePayments(string $from, string $to, ?callable $progress = null): array
    {
        @set_time_limit(0);
        $s = AccurateSetting::current();
        $now = now()->toDateTimeString();
        $log = fn (string $m) => $progress && $progress($m);
        $docs = 0;
        $rows = 0;
        $page = 1;

        do {
            $list = $this->retry(fn () => $this->listPage($s, 'purchase-payment/list.do', $from, $to, $page));
            $pageCount = $list['sp']['pageCount'] ?? 1;
            $log("Pembayaran pembelian halaman {$page}/{$pageCount} ({$docs} payment)…");

            foreach ($list['d'] ?? [] as $row) {
                $d = $this->retry(fn () => $this->acc->apiGet($s, 'purchase-payment/detail.do', ['id' => $row['id']])['d'] ?? null);
                if (! is_array($d)) {
                    continue;
                }

                $base = [
                    'erp_payment_id' => $d['id'],
                    'number' => $d['number'] ?? null,
                    'trans_date' => $this->date($d['transDate'] ?? null),
                    'vendor_name' => is_array($d['vendor'] ?? null) ? ($d['vendor']['name'] ?? null) : null,
                    'bank_no' => is_array($d['bank'] ?? null) ? ($d['bank']['no'] ?? null) : null,
                    'bank_name' => is_array($d['bank'] ?? null) ? ($d['bank']['name'] ?? null) : null,
                    'payment_method' => $d['paymentMethod'] ?? null,
                    'synced_at' => $now,
                ];

                // Satu payment bisa melunasi beberapa faktur; tanpa detail pun tetap dicatat.
                $batch = [];
                foreach ($d['detailInvoice'] ?? [] as $di) {
                    $inv = is_array($di['invoice'] ?? null) ? $di['invoice'] : [];
                    $batch[] = $base + [
                        'erp_invoice_id' => $inv['id'] ?? null,
                        'invoice_number' => $inv['number'] ?? null,
                        'bill_number' => $inv['billNumber'] ?? null,
                        'payment_amount' => $di['paymentAmount'] ?? 0,
                    ];
                }
                if (! $batch) {
                    $batch[] = $base + ['erp_invoice_id' => null, 'invoice_number' => null, 'bill_number' => null,
                        'payment_amount' => $d['totalPayment'] ?? 0];
                }

                DB::table('dwh_stg_acc_purchase_payment')->upsert($batch, ['erp_payment_id', 'erp_invoice_id'],
                    ['number', 'trans_date', 'vendor_name', 'bank_no', 'bank_name', 'payment_method', 'invoice_number', 'bill_number', 'payment_amount', 'synced_at']);
                $rows += count($batch);
                $docs++;
            }

            $page++;
        } while ($page <= $pageCount);

        return ['payment_docs' => $docs, 'payment_rows' => $rows];
    }

    /**
     * Daftarkan vendor baru dari staging faktur ke dwh_map_vendor_principal, tetapkan mata
     * uang default (dokumen PO Accurate > heuristik baris dominan < Rp600rb), lalu turunkan
     * currency_code ke seluruh baris faktur — baris hasil sync tidak menyimpan currency
     * sendiri, jadi tanpa langkah ini baris baru ber-currency NULL.
     * Murni SQL lokal (tanpa API). Dipakai tombol sync Monitoring Pembelian dan sync:daily.
     *
     * @return int jumlah vendor baru terdaftar
     */
    public function syncVendorPrincipalMap(): int
    {
        $t = self::USD_LINE_THRESHOLD;

        $added = DB::affectingStatement('
            INSERT IGNORE INTO dwh_map_vendor_principal (vendor_name, default_currency, currency_source, created_at, updated_at)
            SELECT DISTINCT vendor_name, \'IDR\', \'auto\', NOW(), NOW()
            FROM dwh_stg_acc_purchase_invoice_item WHERE vendor_name IS NOT NULL
        ');

        // Mata uang vendor dari DOKUMEN PO Accurate bila ada (mayoritas dokumen) — sumber
        // paling akurat; heuristik <600rb di bawah hanya utk vendor tanpa data PO.
        DB::statement("
            UPDATE dwh_map_vendor_principal m
            JOIN (
                SELECT vendor_name, SUBSTRING_INDEX(GROUP_CONCAT(currency_code ORDER BY cnt DESC), ',', 1) cur
                FROM (
                    SELECT vendor_name, currency_code, COUNT(*) cnt
                    FROM dwh_stg_acc_purchase_order
                    WHERE currency_code IS NOT NULL AND vendor_name IS NOT NULL
                    GROUP BY vendor_name, currency_code
                ) x GROUP BY vendor_name
            ) g ON g.vendor_name = m.vendor_name
            SET m.default_currency = g.cur, m.updated_at = NOW()
            WHERE m.currency_source = 'auto'
        ");

        // Tebak mata uang via aturan DOMINAN <600rb — hanya vendor 'auto' TANPA data PO Accurate.
        DB::statement("
            UPDATE dwh_map_vendor_principal m
            JOIN (
                SELECT vendor_name, CASE WHEN SUM(total < {$t}) > SUM(total >= {$t}) THEN 'USD' ELSE 'IDR' END cur
                FROM dwh_stg_acc_purchase_invoice_item GROUP BY vendor_name
            ) g ON g.vendor_name = m.vendor_name
            SET m.default_currency = g.cur, m.updated_at = NOW()
            WHERE m.currency_source = 'auto'
              AND NOT EXISTS (SELECT 1 FROM dwh_stg_acc_purchase_order o
                              WHERE o.vendor_name = m.vendor_name AND o.currency_code IS NOT NULL)
        ");

        // Turunkan mata uang ke seluruh baris (data hasil sync tak menyimpan currency sendiri).
        DB::statement('
            UPDATE dwh_stg_acc_purchase_invoice_item s
            JOIN dwh_map_vendor_principal m ON m.vendor_name = s.vendor_name
            SET s.currency_code = m.default_currency
        ');

        return $added;
    }

    /**
     * Turunkan HPP per item dari dwh_stg_acc_purchase_invoice_item → dwh_map_product_cost.
     * avg_cost = SUM(total)/SUM(qty) (rata-rata tertimbang), plus harga & tanggal beli terakhir.
     * Baris qty<=0 diabaikan agar tak membagi nol / mengotori rata-rata (retur/koreksi).
     *
     * @return array<string, int>
     */
    public function recomputeProductCost(): array
    {
        $now = now()->toDateTimeString();

        $agg = DB::table('dwh_stg_acc_purchase_invoice_item')
            ->where('qty', '>', 0)
            ->groupBy('item_no')
            ->selectRaw('item_no,
                SUM(total) sum_total, SUM(qty) sum_qty, COUNT(*) doc_count,
                MAX(trans_date) last_date, MIN(trans_date) first_date')
            ->get();

        // Harga & nama pada pembelian TERAKHIR per item (untuk last_cost & label terkini).
        $last = DB::table('dwh_stg_acc_purchase_invoice_item as p')
            ->joinSub(
                DB::table('dwh_stg_acc_purchase_invoice_item')
                    ->where('qty', '>', 0)
                    ->groupBy('item_no')
                    ->selectRaw('item_no, MAX(CONCAT(COALESCE(trans_date,"0000-00-00"), "#", LPAD(erp_id,12,"0"))) mk'),
                'm',
                fn ($j) => $j->on('p.item_no', '=', 'm.item_no')
                    ->whereRaw('CONCAT(COALESCE(p.trans_date,"0000-00-00"), "#", LPAD(p.erp_id,12,"0")) = m.mk')
            )
            ->pluck('p.unit_price', 'p.item_no'); // item_no => unit_price terakhir
        $lastName = DB::table('dwh_stg_acc_purchase_invoice_item as p')
            ->whereIn('p.item_no', $agg->pluck('item_no'))
            ->orderBy('trans_date')->orderBy('erp_id')
            ->pluck('item_name', 'item_no'); // ambil terakhir yg tertulis (order asc → nilai akhir menang)

        $rows = [];
        foreach ($agg as $r) {
            $sumQty = (float) $r->sum_qty;
            if ($sumQty <= 0) {
                continue;
            }
            $rows[] = [
                'item_no' => $r->item_no,
                'item_name' => $lastName[$r->item_no] ?? null,
                'avg_cost' => round((float) $r->sum_total / $sumQty, 2),
                'last_cost' => round((float) ($last[$r->item_no] ?? 0), 2),
                'last_date' => $r->last_date,
                'qty_total' => $sumQty,
                'doc_count' => (int) $r->doc_count,
                'window_from' => $r->first_date,
                'window_to' => $r->last_date,
                'computed_at' => $now,
            ];
        }

        DB::table('dwh_map_product_cost')->upsert($rows, ['item_no'],
            ['item_name', 'avg_cost', 'last_cost', 'last_date', 'qty_total', 'doc_count', 'window_from', 'window_to', 'computed_at']);

        return ['items_costed' => count($rows)];
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
