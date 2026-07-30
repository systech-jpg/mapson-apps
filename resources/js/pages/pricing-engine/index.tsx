import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { computeEngine, rupiah, type EngineInputs } from '@/lib/pricing-engine';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, Eye, EyeOff, FileDown, FileSpreadsheet, History, Lock, LockOpen, Plus, Save, Search, SendHorizonal, Upload } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Finance', href: '#' },
    { title: 'Pricing Engine', href: '/finance/pricing-engine' },
];

interface Profile {
    id: number;
    code: string;
    name: string;
    rounding_step: number;
    default_bm_pct: string; default_pph22_pct: string; default_ppn_pct: string; default_shipment_pct: string;
    default_ops_pct: string; default_profit_pct: string; default_komisi_pct: string;
    default_event_pct: string; default_lainnya_pct: string; default_buffer_pct: string;
}
interface Principal { id: number | null; erp_societe_id: number | null; name: string; source: 'app' | 'erp'; type?: string | null }
interface Category { id: number; label: string; parent_id: number }
interface Currency { code: string; name: string | null; rate_to_idr: string | number }

interface Row extends EngineInputs {
    id?: number;
    price_id?: number | null;
    status?: string;
    brand: string; sku_code: string; product_name: string;
    cat1: string; cat2: string; cat3: string; cat4: string; product_type: string;
    currency_code: string;
    qty_beli: number | string; uom_beli: string; qty_jual: number | string; uom_jual: string;
    buffer_pct: number | string;
    locked_pricelist?: number | string | null; // L dikunci (rupiah; null = mengikuti %)
    lock_ops_pct?: boolean;     // % dikunci: saat L terkunci, % ini tidak ikut menyesuaikan
    lock_profit_pct?: boolean;
    lock_komisi_pct?: boolean;
    lock_event_pct?: boolean;
    lock_lainnya_pct?: boolean;
    pricelist?: number; // harga tersimpan dari server (utk pembanding before/after)
    prices_by_profile?: Record<string, ProfilePrice>;
    _dirty?: boolean; // edited/new since last load — only these are submitted
    _orig?: Row; // snapshot baseline dari server — dasar highlight "berubah" + tooltip before/after
}

interface ProfilePrice {
    ops_pct: number; profit_pct: number; komisi_pct: number; event_pct: number;
    lainnya_pct: number; buffer_pct: number; rounding_step: number; pricelist: number; status: string;
}

interface HistLog {
    action: string;
    changes: Record<string, [number, number]> | null;
    pricelist_before: number | null;
    pricelist_after: number | null;
    note: string | null;
    user: string | null;
    at: string | null;
}

const FIELD_LABELS: Record<string, string> = {
    ops_pct: 'Ops %', profit_pct: 'Profit %', komisi_pct: 'Komisi %', event_pct: 'Event %',
    lainnya_pct: 'Lainnya %', buffer_pct: 'Maks Disc %', rounding_step: 'Rounding',
};

interface Props {
    profiles: Profile[];
    selectedProfile: string | null;
    principals: Principal[];
    selectedPrincipal: { id: number; name: string } | null;
    hospitals: Principal[];
    selectedHospital: { id: number; name: string } | null;
    rows: Row[];
    copyableProfiles: { id: number; name: string; count: number }[];
    baseCount: number;
    categories: Category[];
    currencies: Currency[];
    canSubmit: boolean;
    draftCount: number;
}

// Percentage/FX fields that follow the header default until a row overrides them.
const HEADER_KEYS = [
    'kurs', 'bm_pct', 'pph22_pct', 'ppn_pct', 'shipment_pct',
    'ops_pct', 'profit_pct', 'komisi_pct', 'event_pct', 'lainnya_pct', 'buffer_pct', 'rounding_step',
] as const;
type HeaderKey = (typeof HEADER_KEYS)[number];

const num = (v: number) => Math.round(v).toLocaleString('id-ID');
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Grid is paginated so a large import (e.g. 2500 rows) doesn't mount ~90k cells at once.
const PAGE_SIZE = 100;
const EMPTY_OV: Partial<Record<HeaderKey, boolean>> = {};

// Grid columns (order matters — the "Default" header row aligns inputs per column).
// Principal is intentionally omitted (it equals the selected principal for the whole grid).
const COLS = ['#', 'Kode', 'Deskripsi', 'Cat1', 'Cat2', 'Cat3', 'Cat4', 'Type',
    'Price Princ.', 'Disc%', 'Cur', 'Kurs', 'Qty Beli', 'UOM', 'Qty Jual', 'UOM',
    'A: Princ. IDR', 'BM%', 'BM Rp', 'PPh22%', 'PPh22 Rp', 'PPN%', 'PPN Rp', 'Ship%', 'Ship Rp',
    'Total Cost', 'Harga Masuk Gudang', 'Alokasi % Operasional', 'Harga Gudang', 'Alokasi % Profit', 'Harga Bawah',
    'Alokasi % Komisi', 'Alokasi % Event', 'Alokasi % Lainnya', '% Maksimum Diskon', 'Pembulatan',
    'Harga Pricelist', ''];
// Column index → header-default numeric field (currency at col 10 is handled separately).
const DEFAULT_INPUTS: Record<number, HeaderKey> = {
    11: 'kurs', 17: 'bm_pct', 19: 'pph22_pct', 21: 'ppn_pct', 23: 'shipment_pct',
    27: 'ops_pct', 29: 'profit_pct', 31: 'komisi_pct', 32: 'event_pct', 33: 'lainnya_pct', 34: 'buffer_pct',
    35: 'rounding_step',
};
// Column index → lockable pct FLAG (header lock button locks/unlocks ALL rows at once).
type LockFlag = 'lock_ops_pct' | 'lock_profit_pct' | 'lock_komisi_pct' | 'lock_event_pct' | 'lock_lainnya_pct';
const LOCK_FLAG_COLS: Record<number, LockFlag> = {
    27: 'lock_ops_pct', 29: 'lock_profit_pct', 31: 'lock_komisi_pct', 32: 'lock_event_pct', 33: 'lock_lainnya_pct',
};
const PRICELIST_COL = 36; // header lock utk nilai rupiah L
const isLockedVal = (v: number | string | null | undefined) => v != null && v !== '' && +v > 0;
const FLAG_TO_PCT: Record<LockFlag, keyof Row> = {
    lock_ops_pct: 'ops_pct', lock_profit_pct: 'profit_pct', lock_komisi_pct: 'komisi_pct',
    lock_event_pct: 'event_pct', lock_lainnya_pct: 'lainnya_pct',
};
const FLAG_TO_EFF: Record<LockFlag, 'd_ops_pct' | 'd_profit_pct' | 'd_komisi_pct' | 'd_event_pct' | 'd_lainnya_pct'> = {
    lock_ops_pct: 'd_ops_pct', lock_profit_pct: 'd_profit_pct', lock_komisi_pct: 'd_komisi_pct',
    lock_event_pct: 'd_event_pct', lock_lainnya_pct: 'd_lainnya_pct',
};
// Kolom kategori (Cat1-4 + Type) — disembunyikan default, bisa dimunculkan dari toolbar.
const CAT_COLS = new Set([3, 4, 5, 6, 7]);
// Lebar input default di header mengikuti lebar input baris di bawahnya.
const headerInputW = (key: HeaderKey) => (key === 'kurs' ? 'w-20' : key === 'rounding_step' ? 'w-16' : 'w-12');

// Frozen columns. Left: #, Kode, Deskripsi. Right: Harga Pricelist + actions.
// Widths match cell content (input width + px-1 padding) so sticky offsets line up.
const LEFT_W = [40, 120, 232];
const LEFT_OFFSET = LEFT_W.map((_, i) => LEFT_W.slice(0, i).reduce((a, b) => a + b, 0));
const RIGHT_W_FROM_END = [76, 148]; // [actions, pricelist (input + tombol kunci)]
const isLeftFrozen = (idx: number) => idx < LEFT_W.length;
const isRightFrozen = (idx: number) => COLS.length - 1 - idx < RIGHT_W_FROM_END.length;
const isFrozen = (idx: number) => isLeftFrozen(idx) || isRightFrozen(idx);
const frozenStyle = (idx: number): React.CSSProperties | undefined => {
    if (isLeftFrozen(idx)) {
        const w = LEFT_W[idx];
        return { position: 'sticky', left: LEFT_OFFSET[idx], width: w, minWidth: w, maxWidth: w };
    }
    if (isRightFrozen(idx)) {
        const pos = COLS.length - 1 - idx; // 0 = actions, 1 = pricelist
        const right = RIGHT_W_FROM_END.slice(0, pos).reduce((a, b) => a + b, 0);
        const w = RIGHT_W_FROM_END[pos];
        return { position: 'sticky', right, width: w, minWidth: w, maxWidth: w };
    }
    return undefined;
};

// Header normalization for import: keep '%' as the token 'pct' so a percentage column
// ("BM %", "%BM") is distinguishable from a nominal one ("bm"). Nominal cost columns from
// raw reports are intentionally NOT matched — percentages come from the template/header.
const normH = (s: string) => s.toLowerCase().replace(/%/g, 'pct').replace(/[^a-z0-9]/g, '');

const IMPORT_RULES: [keyof Row, RegExp][] = [
    ['product_name', /(branddescr|deskripsi|description|namabarang|productname|^descr)/],
    ['sku_code', /(^kode$|^code$|sku|kodebarang|itemcode|partnumber)/],
    ['brand', /^(brand|brandname|namabrand|merek|principal|principalname|namaprincipal|principle)$/],
    ['cat1', /(^cat1$|category1|kategori1)/], ['cat2', /(^cat2$|category2|kategori2)/],
    ['cat3', /(^cat3$|category3|kategori3)/], ['cat4', /(^cat4$|category4|kategori4)/],
    ['product_type', /(typeofproduct|^type$|^tipe$)/],
    ['price_principle', /(priceprinciple|priceprincipal|plprinciple|hargaprincip)/],
    ['disc_principle_pct', /(discprinciplepct|discprincippct|pldisc|discpct|^disc$)/],
    ['currency_code', /(currency|matauang|valas)/],
    ['kurs', /(^kurs$|^rate$)/],
    ['qty_beli', /(qtybeli|qtypurchase|qtybuy)/], ['uom_beli', /(uombeli|uompurchase)/],
    ['qty_jual', /(qtyjual|qtysales|qtysell)/], ['uom_jual', /(uomjual|uomsales)/],
    ['bm_pct', /(bmpct|pctbm)/],
    ['pph22_pct', /(pph22|pctpph|pphpct)/],
    ['ppn_pct', /(ppnpct|pctppn)/],
    ['shipment_pct', /(shipmentpct|pctshipment|ongkirpct)/],
    ['ops_pct', /(opspct|pctops|alokasiops)/],
    ['profit_pct', /(profitpct|pctprofit)/],
    ['komisi_pct', /(komisipct|pctkomisi|commissionpct)/],
    ['event_pct', /(eventpct|pctevent)/],
    ['lainnya_pct', /(lainnyapct|pctlainnya|otherpct)/],
    ['buffer_pct', /(bufferpct|pctbuffer|maksdisc|maxdisc|maksdiscount|maxdiscount)/],
];
const NUMERIC_FIELDS = new Set<keyof Row>([
    'price_principle', 'disc_principle_pct', 'kurs', 'qty_beli', 'qty_jual',
    'bm_pct', 'pph22_pct', 'ppn_pct', 'shipment_pct', 'ops_pct', 'profit_pct', 'komisi_pct', 'event_pct', 'lainnya_pct', 'buffer_pct',
]);
const resolveField = (h: string): keyof Row | null => {
    for (const [field, re] of IMPORT_RULES) if (re.test(h)) return field;
    return null;
};
// Parse Indonesian-formatted numbers: "17.000Rp" → 17000, "2,625" → 2.625, "1.870.000" → 1870000.
const parseIdNum = (v: unknown): number => {
    if (typeof v === 'number') return v;
    let s = String(v ?? '').trim().replace(/rp/gi, '').replace(/%/g, '').replace(/\s/g, '');
    if (!s) return 0;
    const hasComma = s.includes(','), hasDot = s.includes('.');
    if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.');
    else if (hasComma) s = s.replace(',', '.');
    else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};
const TEMPLATE_HEADERS = [
    'Principal', 'Kode', 'Deskripsi', 'Cat1', 'Cat2', 'Cat3', 'Cat4', 'Type',
    'Price Principle', 'Disc Principle %', 'Currency', 'Kurs', 'Qty Beli', 'UOM Beli', 'Qty Jual', 'UOM Jual',
    'BM %', 'PPh22 %', 'PPN %', 'Shipment %', 'Ops % (D)', 'Profit % (F)', 'Komisi % (H)', 'Event % (I)', 'Lainnya % (J)', 'Maks Discount % (M)',
];

export default function PricingEngineIndex({ profiles, selectedProfile, principals, selectedPrincipal, hospitals, selectedHospital, rows: initialRows, copyableProfiles, baseCount, categories, currencies, canSubmit, draftCount }: Props) {
    const profile = profiles.find((p) => p.code === selectedProfile) ?? profiles[0];

    const defaultsFromProfile = (p: Profile): Record<HeaderKey, number> => ({
        kurs: 0,
        bm_pct: +p.default_bm_pct, pph22_pct: +p.default_pph22_pct, ppn_pct: +p.default_ppn_pct, shipment_pct: +p.default_shipment_pct,
        ops_pct: +p.default_ops_pct, profit_pct: +p.default_profit_pct, komisi_pct: +p.default_komisi_pct,
        event_pct: +p.default_event_pct, lainnya_pct: +p.default_lainnya_pct, buffer_pct: +p.default_buffer_pct,
        rounding_step: p.rounding_step,
    });

    const [header, setHeader] = useState<Record<HeaderKey, number | string>>(defaultsFromProfile(profile));
    const [headerCurrency, setHeaderCurrency] = useState('');
    const [rows, setRows] = useState<Row[]>(initialRows);
    // overrides[i][key] = true → that row's cell no longer follows the header.
    const [overrides, setOverrides] = useState<Record<number, Partial<Record<HeaderKey, boolean>>>>({});
    // Keep a live ref so stable (useCallback) handlers can read current overrides without re-creating.
    const overridesRef = useRef(overrides);
    overridesRef.current = overrides;
    const [page, setPage] = useState(0);
    const fileRef = useRef<HTMLInputElement>(null);

    // Inertia reuses this component across visits, so useState won't re-init on its own.
    // `initialRows` keeps a stable reference across local re-renders and only changes on a new
    // server response (profile/principal change, copy, save) — re-sync the grid on those.
    useEffect(() => {
        // Rows freshly loaded from the server are clean; copied rows (no price_id yet) start dirty.
        // Baris tersimpan membawa snapshot _orig sebagai pembanding highlight before/after.
        setRows(initialRows.map((r) => ({ ...r, _dirty: r.price_id == null, _orig: r.price_id != null ? r : undefined })));
        setOverrides({});
        setHeaderCurrency('');
        setPage(0);
        if (profile) setHeader(defaultsFromProfile(profile));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialRows]);

    const roots = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
    const childrenOf = useCallback((label: string): Category[] => {
        const parent = categories.find((c) => c.label === label);
        return parent ? categories.filter((c) => c.parent_id === parent.id) : [];
    }, [categories]);

    const blankRow = (): Row => ({
        brand: selectedPrincipal?.name ?? '', sku_code: '', product_name: '',
        cat1: '', cat2: '', cat3: '', cat4: '', product_type: '',
        currency_code: headerCurrency, price_principle: 0, disc_principle_pct: 0,
        qty_beli: 1, uom_beli: 'pcs', qty_jual: 1, uom_jual: 'pcs',
        locked_pricelist: null,
        lock_ops_pct: false, lock_profit_pct: false, lock_komisi_pct: false, lock_event_pct: false, lock_lainnya_pct: false,
        ...header,
        _dirty: true,
    });

    // ---- profile / principal / hospital navigation (hospital carried through everywhere) ----
    const nav = (extra: Record<string, unknown>) => router.get(route('pricing-engine.index'), { profile: selectedProfile, principal: selectedPrincipal?.id, hospital: selectedHospital?.id, ...extra }, { preserveScroll: true });
    const changeProfile = (code: string) => nav({ profile: code });
    const changePrincipal = (p: Principal) => {
        if (p.source === 'app' && p.id) nav({ principal: p.id });
        else router.post(route('pricing-engine.principal'), { name: p.name, erp_societe_id: p.erp_societe_id, profile: selectedProfile });
    };
    const addPrincipal = () => {
        const name = window.prompt('Nama principal baru:');
        if (name?.trim()) router.post(route('pricing-engine.principal'), { name: name.trim(), profile: selectedProfile });
    };
    // Hospitals come from Dolibarr (client=1, hospital types) — no in-app creation. Picking an
    // ERP hospital links it (creates a pricing_hospitals mirror row) so prices can reference it.
    const changeHospital = (p: Principal | null) => {
        if (!p) nav({ hospital: undefined });                       // Semua RS (base)
        else if (p.source === 'app' && p.id) nav({ hospital: p.id });
        else router.post(route('pricing-engine.hospital'), { name: p.name, erp_societe_id: p.erp_societe_id, profile: selectedProfile, principal: selectedPrincipal?.id });
    };

    // ---- header + override mechanics ----
    const applyHeader = (key: HeaderKey, value: number | string) => {
        setHeader((h) => ({ ...h, [key]: value }));
        setRows((rs) => rs.map((r, i) => (overrides[i]?.[key] ? r : { ...r, [key]: value, _dirty: true })));
    };
    // Stable identity (useCallback) so memoized rows only re-render when their own row/override changes.
    const updateCell = useCallback((i: number, key: keyof Row, value: string | number | boolean | null) => {
        setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value, _dirty: true } : r)));
        if ((HEADER_KEYS as readonly string[]).includes(key as string)) {
            setOverrides((o) => ({ ...o, [i]: { ...o[i], [key]: true } }));
        }
    }, []);

    // Picking a currency auto-fills kurs from the master rate (unless kurs was overridden).
    const updateCurrency = useCallback((i: number, code: string) => {
        const cur = currencies.find((c) => c.code === code);
        setRows((rs) => rs.map((r, idx) => (idx === i
            ? { ...r, currency_code: code, _dirty: true, ...(overridesRef.current[i]?.kurs || !cur ? {} : { kurs: +cur.rate_to_idr }) }
            : r)));
    }, [currencies]);

    // Header lock kolom Harga Pricelist: kunci semua baris di nilai hitungan saat ini
    // (baris yang sudah terkunci tidak diubah); saat semua terkunci, klik = buka semua.
    const toggleLockPricelistColumn = () => {
        setRows((rs) => {
            const allLocked = rs.length > 0 && rs.every((r) => isLockedVal(r.locked_pricelist));
            return rs.map((r) => allLocked
                ? (isLockedVal(r.locked_pricelist) ? { ...r, locked_pricelist: null, _dirty: true } : r)
                : (isLockedVal(r.locked_pricelist) ? r : { ...r, locked_pricelist: Math.round(computeEngine(r).l_pricelist), _dirty: true }));
        });
    };
    // Header lock kolom %: set flag kunci di semua baris. Saat mengunci baris yang pricelist-nya
    // terkunci, nilai % efektif saat itu di-snapshot dulu agar tidak melompat.
    const toggleLockFlagColumn = (f: LockFlag) => {
        const pctField = FLAG_TO_PCT[f];
        const effField = FLAG_TO_EFF[f];
        setRows((rs) => {
            const allLocked = rs.length > 0 && rs.every((r) => !!r[f]);
            const target = !allLocked;
            return rs.map((r) => {
                if (!!r[f] === target) return r;
                const next = { ...r, [f]: target, _dirty: true };
                if (target && isLockedVal(r.locked_pricelist)) {
                    (next as unknown as Record<string, unknown>)[pctField] = Math.round(computeEngine(r)[effField] * 1000) / 1000;
                }
                return next;
            });
        });
    };
    // Per-column lock counts drive the header icon (full = amber lock, none/partial = open lock).
    const lockStats = useMemo(() => {
        const s: Record<string, number> = {
            locked_pricelist: rows.reduce((n, r) => n + (isLockedVal(r.locked_pricelist) ? 1 : 0), 0),
        };
        (Object.values(LOCK_FLAG_COLS) as LockFlag[]).forEach((f) => {
            s[f] = rows.reduce((n, r) => n + (r[f] ? 1 : 0), 0);
        });
        return s;
    }, [rows]);

    // Tombol gembok di baris header (kunci/buka satu kolom untuk SEMUA baris sekaligus).
    const headerLockBtn = (idx: number) => {
        const isPrice = idx === PRICELIST_COL;
        const f = isPrice ? 'locked_pricelist' : LOCK_FLAG_COLS[idx];
        const count = lockStats[f] ?? 0;
        const all = rows.length > 0 && count === rows.length;
        return (
            <button
                type="button"
                onClick={() => rows.length && (isPrice ? toggleLockPricelistColumn() : toggleLockFlagColumn(f as LockFlag))}
                title={all
                    ? `Buka kunci semua baris (${count} terkunci)`
                    : isPrice
                        ? `Kunci harga pricelist SEMUA baris di nilai hitungan saat ini${count ? ` (${count}/${rows.length} sudah terkunci)` : ''}`
                        : `Kunci % ini di SEMUA baris — tidak ikut menyesuaikan saat harga pricelist dikunci${count ? ` (${count}/${rows.length} sudah terkunci)` : ''}`}
                className={`flex shrink-0 items-center gap-0.5 text-[10px] font-normal ${all ? 'text-amber-600' : count ? 'text-amber-500/80' : 'text-muted-foreground/60 hover:text-foreground'}`}
            >
                {count ? `${count}` : ''}
                {all ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
            </button>
        );
    };

    // Kolom kategori (Cat1-4 + Type) disembunyikan default.
    const [showCats, setShowCats] = useState(false);

    // Navigasi keyboard ala Excel: panah pindah sel (fokus + select-all), Enter turun,
    // Shift+Enter naik. Untuk <select>, panah atas/bawah tetap memilih opsi (native).
    const onGridKeyDown = (e: React.KeyboardEvent) => {
        const t = e.target as HTMLElement;
        const isInput = t instanceof HTMLInputElement;
        const isSelect = t instanceof HTMLSelectElement;
        if (!isInput && !isSelect) return;

        let dir: 'up' | 'down' | 'left' | 'right' | null = null;
        if (e.key === 'Enter') dir = e.shiftKey ? 'up' : 'down';
        else if (e.key === 'ArrowLeft') dir = 'left';
        else if (e.key === 'ArrowRight') dir = 'right';
        else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isInput) dir = e.key === 'ArrowUp' ? 'up' : 'down';
        if (!dir) return;

        const td = t.closest('td');
        const tr = td?.closest('tr');
        if (!td || !tr) return;

        let target: HTMLElement | null = null;
        if (dir === 'left' || dir === 'right') {
            let cell = dir === 'left' ? td.previousElementSibling : td.nextElementSibling;
            while (cell && !cell.querySelector('input, select')) {
                cell = dir === 'left' ? cell.previousElementSibling : cell.nextElementSibling;
            }
            target = cell?.querySelector<HTMLElement>('input, select') ?? null;
        } else {
            const row = dir === 'up' ? tr.previousElementSibling : tr.nextElementSibling;
            if (row) {
                const idx = Array.from(tr.children).indexOf(td);
                target = row.children[idx]?.querySelector<HTMLElement>('input, select') ?? null;
                for (let j = idx - 1; j >= 0 && !target; j--) {
                    target = row.children[j]?.querySelector<HTMLElement>('input, select') ?? null;
                }
            }
        }
        if (target) {
            e.preventDefault();
            target.focus();
            target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    };

    // Copy = server reload: load a source (profile / base) into the current context as drafts.
    const copyFromProfile = (sourceProfileId: string) => nav({ copy_from: sourceProfileId });
    const copyFromBase = () => nav({ copy_from: 'base' });

    // Changing a category resets the deeper ones (cascading dropdowns).
    const updateCat = useCallback((i: number, level: number, value: string) => {
        setRows((rs) => rs.map((r, idx) => {
            if (idx !== i) return r;
            const next = { ...r, [`cat${level}`]: value, _dirty: true } as Row;
            for (let l = level + 1; l <= 4; l++) (next as unknown as Record<string, unknown>)[`cat${l}`] = '';
            return next;
        }));
    }, []);

    const addRow = () => setRows((rs) => [...rs, blankRow()]);
    const removeRow = useCallback((i: number) => {
        setRows((rs) => rs.filter((_, idx) => idx !== i));
        setOverrides((o) => { const n = { ...o }; delete n[i]; return n; });
    }, []);

    // ---- Excel upload (parsed client-side) ----
    const onFile = async (file: File) => {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!raw.length) { alert('Sheet kosong.'); return; }

        const imported: Row[] = raw.map((rec) => {
            const r = blankRow();
            for (const [rawKey, val] of Object.entries(rec)) {
                const field = resolveField(normH(rawKey));
                if (!field) continue;
                if (NUMERIC_FIELDS.has(field)) {
                    const parsed = parseIdNum(val);
                    // Price principle dibatasi 2 angka di belakang koma.
                    (r as unknown as Record<string, unknown>)[field] = field === 'price_principle' ? Math.round(parsed * 100) / 100 : parsed;
                } else if (field === 'currency_code') {
                    r.currency_code = String(val ?? '').trim().toUpperCase();
                } else {
                    (r as unknown as Record<string, unknown>)[field] = typeof val === 'string' ? val.trim() : String(val ?? '');
                }
            }
            // Fill FX default when kurs missing: currency's rate → header currency's rate → header kurs.
            if (!(+r.kurs > 0)) {
                const cur = currencies.find((c) => c.code === (r.currency_code || headerCurrency));
                r.kurs = cur ? +cur.rate_to_idr : header.kurs;
            }
            return r;
        });
        // Validate the imported principal against the selected one — warn immediately, before saving.
        const expected = selectedPrincipal?.name ?? '';
        const headers = Object.keys(raw[0] ?? {});
        const hasPrincipalCol = headers.some((h) => resolveField(normH(h)) === 'brand');
        const bad = imported.filter((r) => expected && !!String(r.brand ?? '').trim() && norm(String(r.brand)) !== norm(expected));

        if (!hasPrincipalCol) {
            window.alert(`Kolom "Principal" tidak terdeteksi di Excel.\n\nSemua ${imported.length} baris akan dianggap principal terpilih ("${expected}"), jadi validasi principal tidak bisa dijalankan.\n\nTambahkan kolom "Principal" (lihat template) bila ingin divalidasi.`);
        } else if (bad.length) {
            // Principal mismatch → let the user replace it with the selected principal, or reject.
            const names = [...new Set(bad.map((r) => String(r.brand).trim()))].slice(0, 5).join(', ');
            const replace = window.confirm(
                `Principal tidak cocok!\n\n${bad.length} dari ${imported.length} baris punya principal berbeda dari "${expected}" (mis. ${names}).\n\n• OK  → ganti principal semua baris menjadi "${expected}" (sesuai dropdown), lalu muat.\n• Cancel → tolak impor (file tidak dimuat).`
            );
            if (!replace) { if (fileRef.current) fileRef.current.value = ''; return; }
            imported.forEach((r) => { r.brand = expected; });
        }

        setRows(imported);
        setOverrides({}); // rows carry their own values from the sheet
        if (fileRef.current) fileRef.current.value = '';
    };

    const downloadTemplate = () => {
        // Example rows (values match the header order in TEMPLATE_HEADERS).
        const examples = [
            ['Medyssey', 'SXCP4525', 'Long Reduction Poly axial Cap type Screw, 4.5x25mm', 'Spine', 'Screw', '', '', 'implant', 110, 0, 'USD', 17000, 1, 'pcs', 1, 'pcs', 5, 2.5, 11, 10, 34, 30, 0, 0, 0, 0],
            ['Medyssey', 'TR55040', 'Taper Rod, 5.5x40mm', 'Spine', 'Rod', '', '', 'implant', 25, 0, 'USD', 17000, 1, 'pcs', 1, 'pcs', 5, 2.5, 11, 10, 34, 30, 0, 0, 0, 0],
        ];
        const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...examples]);
        ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: h === 'Deskripsi' ? 46 : Math.max(10, h.length + 2) }));

        // Guidance sheet.
        const notes = [
            ['Kolom', 'Wajib?', 'Keterangan'],
            ['Principal', 'Ya', 'Harus sama dengan principal yang dipilih di aplikasi'],
            ['Kode', 'Ya', 'Kode/SKU barang (unik per principal)'],
            ['Deskripsi', 'Ya', 'Nama/deskripsi barang'],
            ['Cat1–Cat4', 'Opsional', 'Kategori (boleh dikosongkan)'],
            ['Type', 'Opsional', 'instrument / implant / bhp'],
            ['Price Principle', 'Ya', 'Harga principal dalam valas (mis. 110)'],
            ['Disc Principle %', 'Opsional', 'Diskon principal, dalam persen (mis. 0)'],
            ['Currency', 'Ya', 'Kode mata uang: IDR / USD / EUR / SGD / JPY'],
            ['Kurs', 'Opsional', 'Kurs ke IDR. Kosong → otomatis dari master currency'],
            ['Qty/UOM Beli & Jual', 'Opsional', 'Satuan beli & jual (default 1 pcs)'],
            ['BM %', 'Opsional', 'RATE ASLI, mis. 5 (bukan nominal). Basis: dari A'],
            ['PPh22 %', 'Opsional', 'RATE ASLI, mis. 2.5. Basis: dari A + BM'],
            ['PPN %', 'Opsional', 'RATE ASLI, mis. 11. Basis: dari A + BM'],
            ['Shipment %', 'Opsional', 'RATE ASLI, mis. 10. Basis: dari A'],
            ['Ops % (D)', 'Opsional', 'Alokasi biaya ops & lain (mis. 34)'],
            ['Profit % (F)', 'Opsional', 'Margin profit (mis. 30)'],
            ['Komisi/Event/Lainnya % (H/I/J)', 'Opsional', 'Alokasi diskon jual'],
            ['Maks Discount % (M)', 'Opsional', 'Diskon maksimum yang boleh diberikan'],
            ['', '', ''],
            ['Catatan', '', 'Kolom % yang dikosongkan akan mengikuti nilai Default di header tabel.'],
            ['', '', 'Semua % memakai rate asli — nominalnya dihitung otomatis oleh sistem.'],
        ];
        const wsNotes = XLSX.utils.aoa_to_sheet(notes);
        wsNotes['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 60 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.utils.book_append_sheet(wb, wsNotes, 'Petunjuk');
        XLSX.writeFile(wb, 'template-pricing-engine.xlsx');
    };

    // ---- save (only changed/new rows are submitted) ----
    const [saving, setSaving] = useState(false);
    const dirtyRows = rows.filter((r) => r._dirty);
    const save = () => {
        if (!selectedPrincipal || !profile) { alert('Pilih profil & principal dulu.'); return; }
        if (!dirtyRows.length) { alert('Tidak ada perubahan untuk disimpan.'); return; }
        if (mismatchCount > 0) { alert(`${mismatchCount} baris punya principal berbeda dari "${expectedBrand}". Perbaiki dulu.`); return; }
        router.post(route('pricing-engine.save'), {
            profile_id: profile.id,
            principal_id: selectedPrincipal.id,
            hospital_id: selectedHospital?.id ?? null,
            rows: dirtyRows.map(({ _orig, ...rest }) => rest) as unknown as Record<string, unknown>[],
        } as never, { preserveScroll: true, onStart: () => setSaving(true), onFinish: () => setSaving(false) });
    };

    const ready = !!selectedPrincipal;

    // ---- submit for approval (HFO) ----
    const [submitOpen, setSubmitOpen] = useState(false);
    const [submitNote, setSubmitNote] = useState('');
    const [submitFiles, setSubmitFiles] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const doSubmit = () => {
        if (!selectedPrincipal || !profile) return;
        router.post(route('pricing-engine.submit'), {
            principal_id: selectedPrincipal.id,
            profile_id: profile.id,
            hospital_id: selectedHospital?.id ?? null,
            note: submitNote,
            attachments: submitFiles,
        } as never, {
            forceFormData: true,
            preserveScroll: true,
            onStart: () => setSubmitting(true),
            onFinish: () => setSubmitting(false),
            onSuccess: () => { setSubmitOpen(false); setSubmitNote(''); setSubmitFiles([]); },
        });
    };

    // ---- filter (client-side, keeps original row indices for editing) ----
    const [search, setSearch] = useState('');
    const visible = (r: Row) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return [r.sku_code, r.product_name, r.cat1, r.cat2, r.cat3, r.cat4, r.product_type]
            .some((v) => String(v ?? '').toLowerCase().includes(q));
    };
    // Filter once, keeping original indices, then slice to the current page — the grid only ever
    // mounts PAGE_SIZE rows regardless of how many were imported.
    const visibleRows = useMemo(
        () => rows.map((r, i) => ({ r, i })).filter(({ r }) => visible(r)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rows, search],
    );
    const visibleCount = visibleRows.length;
    const pageCount = Math.max(1, Math.ceil(visibleCount / PAGE_SIZE));
    const curPage = Math.min(page, pageCount - 1);
    const pageRows = visibleRows.slice(curPage * PAGE_SIZE, curPage * PAGE_SIZE + PAGE_SIZE);
    useEffect(() => { setPage(0); }, [search]);

    // ---- export to .xlsx (current, filtered grid with computed values) ----
    const exportExcel = () => {
        const header = ['Principal', 'Kode', 'Deskripsi', 'Cat1', 'Cat2', 'Cat3', 'Cat4', 'Type',
            'Price Principle', 'Disc %', 'Currency', 'Kurs', 'Qty Beli', 'UOM Beli', 'Qty Jual', 'UOM Jual',
            'A: Pricelist Principal IDR', 'BM %', 'BM Rp', 'PPh22 %', 'PPh22 Rp', 'PPN %', 'PPN Rp', 'Shipment %', 'Shipment Rp',
            'Total Cost', 'Harga Masuk Gudang', 'Ops % (D)', 'Harga Gudang', 'Profit % (F)', 'Harga Bawah',
            'Komisi % (H)', 'Event % (I)', 'Lainnya % (J)', 'Maks Discount % (M)', 'Pembulatan', 'Harga Pricelist'];
        const body = rows.filter(visible).map((r) => {
            const c = computeEngine(r);
            return [r.brand, r.sku_code, r.product_name, r.cat1, r.cat2, r.cat3, r.cat4, r.product_type,
                +r.price_principle || 0, +r.disc_principle_pct || 0, r.currency_code, +r.kurs || 0,
                +r.qty_beli || 0, r.uom_beli, +r.qty_jual || 0, r.uom_jual,
                c.a_principal_idr, +r.bm_pct || 0, c.bm, +r.pph22_pct || 0, c.pph22, +r.ppn_pct || 0, c.ppn, +r.shipment_pct || 0, c.shipment,
                c.b_total_cost, c.c_warehouse, c.d_ops_pct, c.e_harga_gudang, c.d_profit_pct, c.g_bottom,
                c.d_komisi_pct, c.d_event_pct, c.d_lainnya_pct, +r.buffer_pct || 0, +(r.rounding_step ?? 0) || 0, c.l_pricelist];
        });
        const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Pricelist');
        const pname = (selectedPrincipal?.name ?? 'principal').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        XLSX.writeFile(wb, `pricelist-${pname}-${selectedProfile}.xlsx`);
    };

    // ---- detail view + change history ----
    const [detail, setDetail] = useState<Row | null>(null);
    const [history, setHistory] = useState<{ title: string; logs: HistLog[] | null } | null>(null);
    const openHistory = useCallback(async (r: Row) => {
        if (!r.id) { alert('Baris ini belum tersimpan, jadi belum ada riwayat.'); return; }
        const title = `${r.sku_code} — ${r.product_name}`;
        setHistory({ title, logs: null });
        try {
            const res = await fetch(route('pricing-engine.history', { product_id: r.id, profile_id: profile?.id }), { headers: { Accept: 'application/json' } });
            setHistory({ title, logs: await res.json() });
        } catch {
            setHistory({ title, logs: [] });
        }
    }, [profile]);

    // Brand guard: every row must belong to the selected principal's brand.
    const expectedBrand = selectedPrincipal?.name ?? '';
    const brandMismatch = (r: Row) => !!expectedBrand && !!String(r.brand ?? '').trim() && norm(String(r.brand)) !== norm(expectedBrand);
    const mismatchCount = rows.filter(brandMismatch).length;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Pricing Engine" />
            <div className="flex flex-col gap-4 p-4">
                {/* Step 1 & 2: profile + principal */}
                <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">Profil Harga</label>
                        <Select value={selectedProfile ?? ''} onValueChange={changeProfile}>
                            <SelectTrigger className="w-56"><SelectValue placeholder="Pilih profil" /></SelectTrigger>
                            <SelectContent>
                                {profiles.map((p) => <SelectItem key={p.id} value={p.code}>{p.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">Principal (vendor)</label>
                        <PrincipalCombobox principals={principals} selected={selectedPrincipal} onPick={changePrincipal} />
                    </div>
                    <Button variant="outline" size="sm" onClick={addPrincipal}><Building2 className="mr-1 h-4 w-4" /> Principal baru</Button>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">Rumah Sakit (opsional)</label>
                        <HospitalCombobox hospitals={hospitals} selected={selectedHospital} onPick={changeHospital} />
                    </div>
                    <div className="text-xs">
                        {selectedHospital
                            ? <span className="rounded bg-sky-100 px-2 py-1 font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">Harga khusus RS: {selectedHospital.name}</span>
                            : <span className="rounded bg-muted px-2 py-1 text-muted-foreground">Harga base (semua RS)</span>}
                    </div>
                </div>

                {!ready && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Pilih profil dan principal untuk mulai. Data yang sudah ada akan dimuat; jika belum, tambah baris atau upload Excel.</div>}

                {ready && (
                    <>
                        {/* Toolbar */}
                        <div className="flex flex-wrap items-center gap-2">
                            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="mr-1 h-4 w-4" /> Upload Excel</Button>
                            <Button variant="ghost" size="sm" onClick={downloadTemplate}><FileDown className="mr-1 h-4 w-4" /> Download Template</Button>
                            <Button variant="outline" size="sm" onClick={addRow}><Plus className="mr-1 h-4 w-4" /> Tambah baris</Button>
                            {selectedHospital && baseCount > 0 && (
                                <Button variant="outline" size="sm" onClick={() => { if (window.confirm(`Salin ${baseCount} harga base (semua RS) ke RS "${selectedHospital.name}" sebagai draft? Data grid saat ini diganti.`)) copyFromBase(); }}>
                                    <FileDown className="mr-1 h-4 w-4" /> Salin dari Base ({baseCount})
                                </Button>
                            )}
                            {copyableProfiles.length > 0 && (
                                <div className="flex items-center gap-1 rounded-md border px-2 py-1">
                                    <span className="text-xs text-muted-foreground">Copy harga dari:</span>
                                    <select
                                        className="h-6 rounded border bg-background px-1 text-xs"
                                        value=""
                                        onChange={(e) => {
                                            const src = e.target.value;
                                            if (src && window.confirm(`Muat produk + parameter harga dari profil terpilih ke "${profile?.name}" (sebagai draft)? Data grid saat ini akan diganti.`)) copyFromProfile(src);
                                            e.target.value = '';
                                        }}
                                    >
                                        <option value="">— pilih profil —</option>
                                        {copyableProfiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.count})</option>)}
                                    </select>
                                </div>
                            )}
                            <Button variant="ghost" size="sm" onClick={exportExcel} disabled={!rows.length}><FileSpreadsheet className="mr-1 h-4 w-4" /> Export Excel</Button>
                            <Button variant="ghost" size="sm" onClick={() => setShowCats((s) => !s)} title="Tampilkan/sembunyikan kolom Cat1-4 & Type">
                                {showCats ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />} Kategori
                            </Button>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Cari kode / deskripsi / kategori…"
                                    className="h-8 w-56 rounded-md border border-input bg-background pl-7 pr-2 text-sm"
                                />
                            </div>
                            <span className="text-xs text-muted-foreground">{search ? `${visibleCount}/${rows.length}` : rows.length} baris</span>
                            <div className="ml-auto" />
                            <Button size="sm" onClick={save} disabled={!dirtyRows.length || saving || mismatchCount > 0}><Save className="mr-1 h-4 w-4" /> Simpan{dirtyRows.length ? ` (${dirtyRows.length} perubahan)` : ''}</Button>
                            {canSubmit && (
                                <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setSubmitOpen(true)} disabled={draftCount === 0 || dirtyRows.length > 0} title={dirtyRows.length ? 'Simpan dulu perubahan sebelum mengajukan' : ''}>
                                    <SendHorizonal className="mr-1 h-4 w-4" /> Ajukan Approval{draftCount ? ` (${draftCount})` : ''}
                                </Button>
                            )}
                        </div>

                        {mismatchCount > 0 && (
                            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
                                <b>{mismatchCount} baris</b> punya principal berbeda dari <b>{expectedBrand}</b> (ditandai merah). Semua baris harus principal yang sama — perbaiki sebelum menyimpan.
                            </div>
                        )}

                        {/* Grid — scroll di dalam kotak setinggi layar: scrollbar horizontal selalu
                            terlihat tanpa harus scroll ke dasar halaman; header tetap sticky.
                            Sel yang fokus diberi ring tegas (penanda posisi ala Excel). */}
                        <div
                            className="max-h-[calc(100vh-230px)] overflow-auto rounded-lg border [&_td_input:focus]:ring-2 [&_td_input:focus]:ring-sky-500 [&_td_select:focus]:ring-2 [&_td_select:focus]:ring-sky-500"
                            onKeyDown={onGridKeyDown}
                        >
                            <table className="min-w-max text-xs">
                                {/* Sticky per-sel <th> (bukan di <thead>) — sticky pada thead glitch
                                    di Chrome saat scroll di dalam container. Baris 1 nempel top-0
                                    (tinggi pasti h-8), baris default nempel tepat di bawahnya (top-8). */}
                                <thead>
                                    <tr className="text-foreground">
                                        {COLS.map((h, idx) => (!showCats && CAT_COLS.has(idx)) ? null : (
                                            <th key={idx} style={frozenStyle(idx)} className={`sticky top-0 h-8 whitespace-nowrap border-r border-border bg-muted px-2 py-1.5 text-left font-semibold last:border-0 ${isFrozen(idx) ? 'z-40' : 'z-20'}`}>{h}</th>
                                        ))}
                                    </tr>
                                    <tr className="text-foreground">
                                        {COLS.map((_, idx) => (!showCats && CAT_COLS.has(idx)) ? null : (
                                            <th key={idx} style={frozenStyle(idx)} className={`sticky top-8 border-r border-b border-border bg-muted px-1 py-1 align-middle last:border-0 ${isFrozen(idx) ? 'z-40' : 'z-20'}`}>
                                                {idx === 0 ? (
                                                    <span className="text-[10px] font-normal text-muted-foreground">Default →</span>
                                                ) : idx === 10 ? (
                                                    <select className="h-6 w-full rounded border border-input bg-background px-1 text-[11px]" value={headerCurrency} onChange={(e) => { setHeaderCurrency(e.target.value); const cur = currencies.find((c) => c.code === e.target.value); if (cur) applyHeader('kurs', +cur.rate_to_idr); }}>
                                                        <option value=""></option>
                                                        {currencies.map((cu) => <option key={cu.code} value={cu.code}>{cu.code}</option>)}
                                                    </select>
                                                ) : DEFAULT_INPUTS[idx] || LOCK_FLAG_COLS[idx] || idx === PRICELIST_COL ? (
                                                    <div className="flex items-center justify-end gap-1">
                                                        {DEFAULT_INPUTS[idx] && (
                                                            <input type="number" step="any" className={`h-6 ${headerInputW(DEFAULT_INPUTS[idx])} rounded border border-input bg-background px-1 text-right text-[11px] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`} value={header[DEFAULT_INPUTS[idx]] ?? ''} onFocus={(e) => e.target.select()} onChange={(e) => applyHeader(DEFAULT_INPUTS[idx], e.target.value)} />
                                                        )}
                                                        {(LOCK_FLAG_COLS[idx] || idx === PRICELIST_COL) && headerLockBtn(idx)}
                                                    </div>
                                                ) : null}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageRows.map(({ r, i }) => (
                                        <PricingRow
                                            key={i} r={r} i={i} ov={overrides[i]} showCats={showCats}
                                            roots={roots} childrenOf={childrenOf} currencies={currencies}
                                            updateCell={updateCell} updateCat={updateCat} updateCurrency={updateCurrency}
                                            removeRow={removeRow} onDetail={setDetail} onHistory={openHistory}
                                        />
                                    ))}
                                    {!rows.length ? (
                                        <tr><td colSpan={COLS.length} className="p-6 text-center text-muted-foreground">Belum ada baris. Upload Excel atau tambah baris.</td></tr>
                                    ) : visibleCount === 0 ? (
                                        <tr><td colSpan={COLS.length} className="p-6 text-center text-muted-foreground">Tidak ada baris yang cocok dengan "{search}".</td></tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination — grid renders at most PAGE_SIZE rows at a time. */}
                        {pageCount > 1 && (
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="text-muted-foreground">
                                    Menampilkan {curPage * PAGE_SIZE + 1}–{Math.min((curPage + 1) * PAGE_SIZE, visibleCount)} dari {visibleCount} baris
                                </span>
                                <div className="flex items-center gap-1">
                                    <Button variant="outline" size="sm" disabled={curPage === 0} onClick={() => setPage(0)}>«</Button>
                                    <Button variant="outline" size="sm" disabled={curPage === 0} onClick={() => setPage(curPage - 1)}>‹ Sebelumnya</Button>
                                    <span className="px-2">Hal {curPage + 1} / {pageCount}</span>
                                    <Button variant="outline" size="sm" disabled={curPage >= pageCount - 1} onClick={() => setPage(curPage + 1)}>Berikutnya ›</Button>
                                    <Button variant="outline" size="sm" disabled={curPage >= pageCount - 1} onClick={() => setPage(pageCount - 1)}>»</Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <Dialog open={submitOpen} onOpenChange={(o) => !o && setSubmitOpen(false)}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Ajukan Approval Harga</DialogTitle></DialogHeader>
                    <div className="space-y-3 text-sm">
                        <p className="text-muted-foreground">Mengajukan <b>{draftCount}</b> harga draft profil <b>{profile?.name}</b> · principal <b>{selectedPrincipal?.name}</b> · <b>{selectedHospital?.name ?? 'Semua RS (base)'}</b> ke Direktur Utama.</p>
                        <div>
                            <label className="mb-1 block text-xs font-medium">Dasar pengajuan (opsional)</label>
                            <textarea value={submitNote} onChange={(e) => setSubmitNote(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" placeholder="Catatan / alasan pengajuan…" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium">Lampiran (opsional)</label>
                            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={(e) => setSubmitFiles(Array.from(e.target.files ?? []))} className="block w-full text-xs" />
                            {submitFiles.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{submitFiles.length} berkas dipilih</p>}
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" size="sm" onClick={() => setSubmitOpen(false)}>Batal</Button>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={doSubmit} disabled={submitting}>Ajukan</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>Detail Harga — {detail?.sku_code}</DialogTitle></DialogHeader>
                    {detail && (() => {
                        const c = computeEngine(detail);
                        const pct = (v: number | string) => `${(+v || 0).toLocaleString('id-ID')}%`;
                        const cat = [detail.cat1, detail.cat2, detail.cat3, detail.cat4].filter(Boolean).join(' › ') || '—';
                        return (
                            <div className="max-h-[70vh] space-y-3 overflow-auto pr-1 text-sm">
                                <div className="text-muted-foreground">{detail.product_name}</div>
                                <DSection title="Identitas">
                                    <DRow label="Principal" value={detail.brand || '—'} />
                                    <DRow label="Profil" value={profile?.name ?? '—'} />
                                    <DRow label="Kategori" value={cat} />
                                    <DRow label="Type" value={detail.product_type || '—'} />
                                    <DRow label="Qty Beli / Jual" value={`${detail.qty_beli} ${detail.uom_beli} / ${detail.qty_jual} ${detail.uom_jual}`} />
                                </DSection>
                                <DSection title="Harga Principal">
                                    <DRow label="Price Principle" value={`${(+detail.price_principle || 0).toLocaleString('id-ID')} ${detail.currency_code}`} />
                                    <DRow label="Disc Principle" value={pct(detail.disc_principle_pct)} />
                                    <DRow label="Price After Disc" value={`${c.price_after_disc.toLocaleString('id-ID')} ${detail.currency_code}`} />
                                    <DRow label="Kurs" value={(+detail.kurs || 0).toLocaleString('id-ID')} />
                                    <DRow label="A · Pricelist Principal IDR" value={rupiah(c.a_principal_idr)} strong />
                                </DSection>
                                <DSection title="Biaya">
                                    <DRow label={`Biaya Masuk (${pct(detail.bm_pct)})`} value={rupiah(c.bm)} />
                                    <DRow label={`PPh 22 (${pct(detail.pph22_pct)})`} value={rupiah(c.pph22)} />
                                    <DRow label={`PPN (${pct(detail.ppn_pct)})`} value={rupiah(c.ppn)} />
                                    <DRow label={`Shipment (${pct(detail.shipment_pct)})`} value={rupiah(c.shipment)} />
                                    <DRow label="B · Total Cost" value={rupiah(c.b_total_cost)} strong />
                                </DSection>
                                <DSection title="Gudang & Profit">
                                    <DRow label="C · Harga Masuk Gudang" value={rupiah(c.c_warehouse)} />
                                    <DRow label={`D · Alokasi Ops (${pct(c.d_ops_pct)})${detail.lock_ops_pct ? ' 🔒' : ''}`} value={rupiah(c.e_harga_gudang - c.c_warehouse)} />
                                    <DRow label="E · Harga Gudang" value={rupiah(c.e_harga_gudang)} strong />
                                    <DRow label={`F · Profit (${pct(c.d_profit_pct)})${detail.lock_profit_pct ? ' 🔒' : ''}`} value={rupiah(c.g_bottom - c.e_harga_gudang)} />
                                    <DRow label="G · Harga Bawah" value={rupiah(c.g_bottom)} strong />
                                </DSection>
                                <DSection title="Alokasi Diskon & Pricelist">
                                    <DRow label={`H · Komisi${detail.lock_komisi_pct ? ' 🔒' : ''}`} value={pct(c.d_komisi_pct)} />
                                    <DRow label={`I · Event${detail.lock_event_pct ? ' 🔒' : ''}`} value={pct(c.d_event_pct)} />
                                    <DRow label={`J · Lainnya${detail.lock_lainnya_pct ? ' 🔒' : ''}`} value={pct(c.d_lainnya_pct)} />
                                    <DRow label="K · Total Diskon/Komisi" value={`${c.k_disc_total.toLocaleString('id-ID')}%`} />
                                    <DRow label="M · Maks Discount" value={pct(detail.buffer_pct)} />
                                    <DRow label={`L · Harga Pricelist${detail.locked_pricelist ? ' 🔒' : ''}`} value={rupiah(c.l_pricelist)} big />
                                </DSection>
                                {c.any_lock && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400">🔒 Harga pricelist dikunci — persentase tanpa 🔒 adalah nilai efektif yang menyesuaikan otomatis.</p>
                                )}
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            <Dialog open={!!history} onOpenChange={(o) => !o && setHistory(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>Riwayat Perubahan Harga</DialogTitle></DialogHeader>
                    <div className="mb-1 text-xs text-muted-foreground">{history?.title}</div>
                    {history?.logs === null ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">Memuat…</div>
                    ) : history && history.logs.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">Belum ada riwayat perubahan.</div>
                    ) : (
                        <div className="max-h-96 space-y-2 overflow-auto">
                            {history?.logs?.map((l, idx) => (
                                <div key={idx} className="rounded-md border p-2 text-xs">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium capitalize">{l.action}</span>
                                        <span className="text-muted-foreground">{l.at} · {l.user ?? '—'}</span>
                                    </div>
                                    {l.pricelist_after != null && (
                                        <div className="mt-1">Pricelist: {l.pricelist_before != null && <span className="text-muted-foreground">{rupiah(l.pricelist_before)} → </span>}<b>{rupiah(l.pricelist_after)}</b></div>
                                    )}
                                    {l.changes && Object.keys(l.changes).length > 0 && (
                                        <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                                            {Object.entries(l.changes).map(([f, [o, n]]) => (
                                                <li key={f}><span className="text-foreground">{FIELD_LABELS[f] ?? f}</span>: {o} → {n}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}

// Typeable, searchable principal picker (no extra deps — lightweight combobox).
function PrincipalCombobox({ principals, selected, onPick }: { principals: Principal[]; selected: { id: number; name: string } | null; onPick: (p: Principal) => void }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return (s ? principals.filter((p) => p.name.toLowerCase().includes(s)) : principals).slice(0, 50);
    }, [q, principals]);

    return (
        <div className="relative w-72">
            <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                placeholder={selected?.name ?? 'Ketik untuk cari principal…'}
                value={open ? q : (selected?.name ?? '')}
                onFocus={() => { setOpen(true); setQ(''); }}
                onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {open && (
                <div className="absolute z-50 mt-1 max-h-62 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                    {filtered.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">Tidak ada principal cocok.</div>}
                    {filtered.map((p) => (
                        <button
                            key={p.id ?? `erp:${p.erp_societe_id}`}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); onPick(p); setOpen(false); setQ(''); }}
                            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${selected?.id === p.id ? 'bg-accent' : ''}`}
                        >
                            <span className="truncate">{p.name}</span>
                            {p.source === 'erp' && <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">ERP</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// Hospital picker — like the principal combobox but with a "Semua RS (Base)" clear option.
function HospitalCombobox({ hospitals, selected, onPick }: { hospitals: Principal[]; selected: { id: number; name: string } | null; onPick: (p: Principal | null) => void }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return (s ? hospitals.filter((p) => p.name.toLowerCase().includes(s)) : hospitals).slice(0, 50);
    }, [q, hospitals]);

    return (
        <div className="relative w-72">
            <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                placeholder={selected?.name ?? 'Semua RS (Base)'}
                value={open ? q : (selected?.name ?? '')}
                onFocus={() => { setOpen(true); setQ(''); }}
                onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {open && (
                <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); onPick(null); setOpen(false); setQ(''); }}
                        className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm italic text-muted-foreground hover:bg-accent">
                        Semua RS (Base)
                    </button>
                    {filtered.map((p) => (
                        <button key={p.id ?? `erp:${p.erp_societe_id}`} type="button"
                            onMouseDown={(e) => { e.preventDefault(); onPick(p); setOpen(false); setQ(''); }}
                            className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${selected?.id === p.id ? 'bg-accent' : ''}`}>
                            <span className="truncate">{p.name}</span>
                            {p.type && <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">{p.type}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// One grid row, memoized: with stable handlers + per-row `r`/`ov` props, only the edited row
// re-renders on a keystroke (not the whole page), and computeEngine runs once per changed row.
interface PricingRowProps {
    r: Row;
    i: number;
    ov?: Partial<Record<HeaderKey, boolean>>;
    showCats: boolean;
    roots: Category[];
    childrenOf: (label: string) => Category[];
    currencies: Currency[];
    updateCell: (i: number, key: keyof Row, value: string | number | boolean | null) => void;
    updateCat: (i: number, level: number, value: string) => void;
    updateCurrency: (i: number, code: string) => void;
    removeRow: (i: number) => void;
    onDetail: (r: Row) => void;
    onHistory: (r: Row) => void;
}
const PricingRow = memo(function PricingRow({ r, i, ov: ovProp, showCats, roots, childrenOf, currencies, updateCell, updateCat, updateCurrency, removeRow, onDetail, onHistory }: PricingRowProps) {
    const c = computeEngine(r);
    const ov = ovProp ?? EMPTY_OV;

    // Pembanding before/after vs snapshot server (_orig): sel yang berubah — diedit manual
    // ataupun menyesuaikan otomatis karena kunci — diberi blok warna + tooltip.
    const orig = r._orig;
    const fmt = (x: number) => x.toLocaleString('id-ID', { maximumFractionDigits: 2 });
    const chgN = (before: unknown, after: number): string | undefined => {
        if (!orig || before == null || before === '') return undefined;
        const b = +String(before);
        if (!Number.isFinite(b) || Math.abs(b - after) <= 0.005) return undefined;
        return `Sebelum: ${fmt(b)} → Sesudah: ${fmt(after)}`;
    };
    const chgS = (f: keyof Row): string | undefined => {
        if (!orig) return undefined;
        const b = String(orig[f] ?? '').trim();
        const a = String(r[f] ?? '').trim();
        return b !== a ? `Sebelum: ${b || '—'} → Sesudah: ${a || '—'}` : undefined;
    };
    const chgRing = (t?: string) => (t ? 'ring-1 ring-violet-400' : '');

    return (
        <tr className="border-t hover:bg-muted/40">
            <Td className="text-center text-muted-foreground" frozenIdx={0}><span title={r._dirty ? 'Ada perubahan belum disimpan' : ''} className={r._dirty ? 'font-bold text-amber-600' : ''}>{i + 1}</span></Td>
            <TdIn v={r.sku_code} onC={(v) => updateCell(i, 'sku_code', v)} w="w-28" frozenIdx={1} chg={chgS('sku_code')} />
            <TdIn v={r.product_name} onC={(v) => updateCell(i, 'product_name', v)} w="w-56" frozenIdx={2} chg={chgS('product_name')} />
            {showCats && (
                <>
                    <TdCat v={r.cat1} opts={roots} onC={(v) => updateCat(i, 1, v)} chg={chgS('cat1')} />
                    <TdCat v={r.cat2} opts={childrenOf(r.cat1)} onC={(v) => updateCat(i, 2, v)} chg={chgS('cat2')} />
                    <TdCat v={r.cat3} opts={childrenOf(r.cat2)} onC={(v) => updateCat(i, 3, v)} chg={chgS('cat3')} />
                    <TdCat v={r.cat4} opts={childrenOf(r.cat3)} onC={(v) => updateCat(i, 4, v)} chg={chgS('cat4')} />
                    <Td>
                        <select title={chgS('product_type')} className={`h-6 w-24 rounded border bg-background px-1 ${chgRing(chgS('product_type'))}`} value={r.product_type} onChange={(e) => updateCell(i, 'product_type', e.target.value)}>
                            <option value=""></option>
                            <option value="instrument">instrument</option>
                            <option value="implant">implant</option>
                            <option value="bhp">BHP</option>
                        </select>
                    </Td>
                </>
            )}
            <TdNum v={r.price_principle} onC={(v) => updateCell(i, 'price_principle', v)} norm={(s) => Math.round((parseFloat(s) || 0) * 100) / 100} chg={chgN(orig?.price_principle, +r.price_principle || 0)} />
            <TdNum v={r.disc_principle_pct} onC={(v) => updateCell(i, 'disc_principle_pct', v)} w="w-14" chg={chgN(orig?.disc_principle_pct, +r.disc_principle_pct || 0)} />
            <Td>
                <select title={chgS('currency_code')} className={`h-6 w-16 rounded border bg-background px-1 ${chgRing(chgS('currency_code'))}`} value={r.currency_code} onChange={(e) => updateCurrency(i, e.target.value)}>
                    <option value=""></option>
                    {currencies.map((cu) => <option key={cu.code} value={cu.code}>{cu.code}</option>)}
                </select>
            </Td>
            <TdNum v={r.kurs} onC={(v) => updateCell(i, 'kurs', v)} over={ov.kurs} chg={chgN(orig?.kurs, +r.kurs || 0)} />
            <TdNum v={r.qty_beli} onC={(v) => updateCell(i, 'qty_beli', v)} w="w-14" chg={chgN(orig?.qty_beli, +r.qty_beli || 0)} />
            <TdIn v={r.uom_beli} onC={(v) => updateCell(i, 'uom_beli', v)} w="w-12" chg={chgS('uom_beli')} />
            <TdNum v={r.qty_jual} onC={(v) => updateCell(i, 'qty_jual', v)} w="w-14" chg={chgN(orig?.qty_jual, +r.qty_jual || 0)} />
            <TdIn v={r.uom_jual} onC={(v) => updateCell(i, 'uom_jual', v)} w="w-12" chg={chgS('uom_jual')} />
            <TdCalc>{num(c.a_principal_idr)}</TdCalc>
            <TdNum v={r.bm_pct} onC={(v) => updateCell(i, 'bm_pct', v)} w="w-12" over={ov.bm_pct} chg={chgN(orig?.bm_pct, +r.bm_pct || 0)} />
            <TdCalc>{num(c.bm)}</TdCalc>
            <TdNum v={r.pph22_pct} onC={(v) => updateCell(i, 'pph22_pct', v)} w="w-12" over={ov.pph22_pct} chg={chgN(orig?.pph22_pct, +r.pph22_pct || 0)} />
            <TdCalc>{num(c.pph22)}</TdCalc>
            <TdNum v={r.ppn_pct} onC={(v) => updateCell(i, 'ppn_pct', v)} w="w-12" over={ov.ppn_pct} chg={chgN(orig?.ppn_pct, +r.ppn_pct || 0)} />
            <TdCalc>{num(c.ppn)}</TdCalc>
            <TdNum v={r.shipment_pct} onC={(v) => updateCell(i, 'shipment_pct', v)} w="w-12" over={ov.shipment_pct} chg={chgN(orig?.shipment_pct, +r.shipment_pct || 0)} />
            <TdCalc>{num(c.shipment)}</TdCalc>
            <TdCalc>{num(c.b_total_cost)}</TdCalc>
            <TdCalc>{num(c.c_warehouse)}</TdCalc>
            <TdPct v={r.ops_pct} onC={(v) => updateCell(i, 'ops_pct', v)} over={ov.ops_pct} eff={c.any_lock ? c.d_ops_pct : undefined} locked={!!r.lock_ops_pct}
                chg={chgN(orig?.ops_pct, c.d_ops_pct)}
                onAutoEdit={(v) => { updateCell(i, 'ops_pct', v); updateCell(i, 'lock_ops_pct', true); }}
                onLock={(b) => { if (b && c.any_lock) updateCell(i, 'ops_pct', Math.round(c.d_ops_pct * 1000) / 1000); updateCell(i, 'lock_ops_pct', b); }} />
            <TdCalc>{num(c.e_harga_gudang)}</TdCalc>
            <TdPct v={r.profit_pct} onC={(v) => updateCell(i, 'profit_pct', v)} over={ov.profit_pct} eff={c.any_lock ? c.d_profit_pct : undefined} locked={!!r.lock_profit_pct}
                chg={chgN(orig?.profit_pct, c.d_profit_pct)}
                onAutoEdit={(v) => { updateCell(i, 'profit_pct', v); updateCell(i, 'lock_profit_pct', true); }}
                onLock={(b) => { if (b && c.any_lock) updateCell(i, 'profit_pct', Math.round(c.d_profit_pct * 1000) / 1000); updateCell(i, 'lock_profit_pct', b); }} />
            <TdCalc>{num(c.g_bottom)}</TdCalc>
            <TdPct v={r.komisi_pct} onC={(v) => updateCell(i, 'komisi_pct', v)} over={ov.komisi_pct} eff={c.any_lock ? c.d_komisi_pct : undefined} locked={!!r.lock_komisi_pct}
                chg={chgN(orig?.komisi_pct, c.d_komisi_pct)}
                onAutoEdit={(v) => { updateCell(i, 'komisi_pct', v); updateCell(i, 'lock_komisi_pct', true); }}
                onLock={(b) => { if (b && c.any_lock) updateCell(i, 'komisi_pct', Math.round(c.d_komisi_pct * 1000) / 1000); updateCell(i, 'lock_komisi_pct', b); }} />
            <TdPct v={r.event_pct} onC={(v) => updateCell(i, 'event_pct', v)} over={ov.event_pct} eff={c.any_lock ? c.d_event_pct : undefined} locked={!!r.lock_event_pct}
                chg={chgN(orig?.event_pct, c.d_event_pct)}
                onAutoEdit={(v) => { updateCell(i, 'event_pct', v); updateCell(i, 'lock_event_pct', true); }}
                onLock={(b) => { if (b && c.any_lock) updateCell(i, 'event_pct', Math.round(c.d_event_pct * 1000) / 1000); updateCell(i, 'lock_event_pct', b); }} />
            <TdPct v={r.lainnya_pct} onC={(v) => updateCell(i, 'lainnya_pct', v)} over={ov.lainnya_pct} eff={c.any_lock ? c.d_lainnya_pct : undefined} locked={!!r.lock_lainnya_pct}
                chg={chgN(orig?.lainnya_pct, c.d_lainnya_pct)}
                onAutoEdit={(v) => { updateCell(i, 'lainnya_pct', v); updateCell(i, 'lock_lainnya_pct', true); }}
                onLock={(b) => { if (b && c.any_lock) updateCell(i, 'lainnya_pct', Math.round(c.d_lainnya_pct * 1000) / 1000); updateCell(i, 'lock_lainnya_pct', b); }} />
            <TdNum v={r.buffer_pct} onC={(v) => updateCell(i, 'buffer_pct', v)} w="w-12" over={ov.buffer_pct} chg={chgN(orig?.buffer_pct, +r.buffer_pct || 0)} />
            <TdNum v={r.rounding_step ?? ''} onC={(v) => updateCell(i, 'rounding_step', v)} w="w-16" over={ov.rounding_step} chg={chgN(orig?.rounding_step, +(r.rounding_step ?? 0) || 0)} />
            <TdLock calc={c.l_pricelist} locked={r.locked_pricelist} onChange={(v) => updateCell(i, 'locked_pricelist', v)} frozenIdx={COLS.length - 2} emerald
                chg={chgN(orig?.pricelist, c.l_pricelist)} />
            <Td frozenIdx={COLS.length - 1}>
                <div className="flex items-center justify-center gap-1.5">
                    <button onClick={() => onDetail(r)} title="Lihat detail" className="text-slate-600 hover:text-slate-900 dark:text-slate-300"><Eye className="h-3.5 w-3.5" /></button>
                    <button onClick={() => onHistory(r)} title="Riwayat perubahan" className="text-sky-600 hover:text-sky-800 disabled:opacity-30" disabled={!r.id}><History className="h-3.5 w-3.5" /></button>
                    <button onClick={() => removeRow(i)} title="Hapus baris" className="text-red-500 hover:underline">×</button>
                </div>
            </Td>
        </tr>
    );
});

// ---- small presentational helpers ----
function Td({ children, className = '', frozenIdx }: { children?: React.ReactNode; className?: string; frozenIdx?: number }) {
    const fz = frozenIdx != null && isFrozen(frozenIdx);
    return <td style={frozenStyle(frozenIdx ?? -1)} className={`whitespace-nowrap border-r px-1 py-0.5 last:border-0 ${fz ? 'sticky z-10 bg-background' : ''} ${className}`}>{children}</td>;
}
function TdCalc({ children, className = '', frozenIdx }: { children: React.ReactNode; className?: string; frozenIdx?: number }) {
    // Calculated Rupiah cells get a distinct tint so they stand out from editable (white) inputs.
    return <Td frozenIdx={frozenIdx} className={`bg-sky-100 font-medium text-sky-900 dark:bg-sky-900/40 dark:text-sky-200 text-right tabular-nums ${className}`}>{children}</Td>;
}
function TdIn({ v, onC, w = 'w-24', frozenIdx, invalid, chg }: { v: string; onC: (v: string) => void; w?: string; frozenIdx?: number; invalid?: boolean; chg?: string }) {
    return <Td frozenIdx={frozenIdx}><input title={chg} className={`h-6 ${w} rounded border px-1 ${invalid ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' : 'bg-background'} ${chg ? 'ring-1 ring-violet-400' : ''}`} value={v ?? ''} onChange={(e) => onC(e.target.value)} /></Td>;
}
// Input angka grid: fokus = select-all (ketik langsung menimpa 0), ketikan diteruskan apa
// adanya (tidak dipaksa jadi 0 di tengah mengetik); `norm` merapikan nilai saat blur.
function TdNum({ v, onC, w = 'w-20', over, norm, chg }: { v: number | string; onC: (v: string | number) => void; w?: string; over?: boolean; norm?: (s: string) => number; chg?: string }) {
    return (
        <Td>
            <input
                type="number" step="any"
                title={chg}
                className={`h-6 ${w} rounded border px-1 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ${over ? 'border-amber-400 bg-amber-50 font-medium' : 'bg-background'} ${chg ? 'ring-1 ring-violet-400' : ''}`}
                value={v ?? ''}
                onFocus={(e) => e.target.select()}
                onChange={(e) => onC(e.target.value)}
                onBlur={norm ? (e) => onC(norm(e.target.value)) : undefined}
            />
        </Td>
    );
}
// Sel % jual dengan gembok. % terkunci = editable & TIDAK ikut menyesuaikan. Saat harga
// pricelist dikunci, % yang bebas berubah jadi tampilan otomatis: kotaknya langsung
// menampilkan nilai efektif (read-only, warna kalkulasi) — klik gembok untuk menetapkannya.
function TdPct({ v, onC, over, eff, locked, onLock, onAutoEdit, chg: chgProp }: { v: number | string; onC: (v: string) => void; over?: boolean; eff?: number; locked: boolean; onLock: (b: boolean) => void; onAutoEdit?: (v: string) => void; chg?: string }) {
    const auto = eff != null && !locked; // pricelist terkunci & % ini bebas → nilai dihitung otomatis
    const chg = locked ? undefined : chgProp; // sel terkunci = patokan yang disengaja, bukan "perubahan"
    return (
        <Td className={locked ? 'bg-amber-100 dark:bg-amber-900/40' : ''}>
            <div className="flex items-center gap-0.5">
                <input
                    type="number" step="any"
                    title={chg ?? (auto ? 'Menyesuaikan otomatis mengikuti harga pricelist terkunci. Ketik untuk menetapkan nilai (otomatis terkunci) — % lain yang belum dikunci menyesuaikan ulang.' : undefined)}
                    className={`h-6 w-12 rounded border px-1 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ${
                        locked ? 'border-amber-400 bg-background font-semibold'
                        : auto ? 'border-sky-200 bg-sky-100 font-medium text-sky-900 dark:border-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                        : over ? 'border-amber-400 bg-amber-50 font-medium' : 'bg-background'} ${chg ? 'ring-1 ring-violet-400' : ''}`}
                    value={auto ? Math.round((eff ?? 0) * 100) / 100 : (v ?? '')}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => (auto ? (onAutoEdit ?? onC)(e.target.value) : onC(e.target.value))}
                />
                <button
                    type="button"
                    title={locked ? 'Buka kunci — % ini ikut menyesuaikan lagi' : 'Kunci % ini — nilainya tetap & bisa ditentukan sendiri'}
                    onClick={() => onLock(!locked)}
                    className={locked ? 'text-amber-600 hover:text-amber-800' : 'text-muted-foreground/40 hover:text-foreground'}
                >
                    {locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                </button>
            </div>
        </Td>
    );
}
// Harga Pricelist (L) yang bisa dikunci sebagai rupiah. Terbuka: nilai hasil hitungan + gembok
// abu; terkunci: input editable + gembok kuning — % jual yang tidak dikunci menyesuaikan otomatis.
function TdLock({ calc, locked, onChange, frozenIdx, emerald, chg }: { calc: number; locked?: number | string | null; onChange: (v: string | number | null) => void; frozenIdx?: number; emerald?: boolean; chg?: string }) {
    // Tetap dianggap terkunci walau kotak sedang dikosongkan saat mengetik (nilai '' / 0) —
    // buka kunci hanya lewat tombol gembok, supaya kotak tidak hilang di tengah edit.
    const isLocked = locked != null;
    const tone = emerald
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
        : 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200';
    return (
        <Td frozenIdx={frozenIdx} className={`text-right tabular-nums ${isLocked ? 'bg-amber-100 dark:bg-amber-900/40' : tone}`}>
            <div className="flex items-center justify-end gap-1">
                {isLocked ? (
                    <input
                        type="number" step="any"
                        className="h-6 w-24 rounded border border-amber-400 bg-background px-1 text-right font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        value={locked ?? ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => onChange(e.target.value)}
                    />
                ) : (
                    <span title={chg} className={`${emerald ? 'font-bold' : 'font-medium'} ${chg ? 'rounded px-0.5 ring-1 ring-violet-400' : ''}`}>{num(calc)}</span>
                )}
                <button
                    type="button"
                    title={isLocked ? 'Buka kunci — harga kembali dihitung dari %' : 'Kunci harga ini — % di belakangnya menyesuaikan prorata'}
                    onClick={() => onChange(isLocked ? null : Math.round(calc))}
                    className={isLocked ? 'text-amber-600 hover:text-amber-800' : 'text-muted-foreground/50 hover:text-foreground'}
                >
                    {isLocked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                </button>
            </div>
        </Td>
    );
}
function TdCat({ v, opts, onC, chg }: { v: string; opts: Category[]; onC: (v: string) => void; chg?: string }) {
    const hasCurrent = !v || opts.some((o) => o.label === v);
    return (
        <Td>
            <select title={chg} className={`h-6 w-28 rounded border bg-background px-1 ${chg ? 'ring-1 ring-violet-400' : ''}`} value={v ?? ''} onChange={(e) => onC(e.target.value)}>
                <option value=""></option>
                {!hasCurrent && <option value={v}>{v}</option>}
                {opts.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
            </select>
        </Td>
    );
}

// ---- detail dialog helpers ----
function DSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
            <div className="rounded-md border px-3 py-1">{children}</div>
        </div>
    );
}
function DRow({ label, value, strong, big }: { label: string; value: React.ReactNode; strong?: boolean; big?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 border-b py-1.5 last:border-0">
            <span className="text-muted-foreground">{label}</span>
            <span className={`text-right tabular-nums ${big ? 'text-base font-bold text-emerald-700 dark:text-emerald-400' : strong ? 'font-semibold' : ''}`}>{value}</span>
        </div>
    );
}
