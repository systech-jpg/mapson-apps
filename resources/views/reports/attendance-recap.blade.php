<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
@php
    $n = fn ($v) => ($v === null || $v === '') ? '' : rtrim(rtrim(number_format((float) $v, 1, ',', ''), '0'), ',');
    $dates = $r['dates'];
    $typeCols = $r['typeCols'];
    $emps = $r['employees'];
@endphp
<style>
    @page { margin: 12px 14px; }
    * { box-sizing: border-box; }
    body { font-family: DejaVu Sans, sans-serif; color: #111; font-size: 8px; }
    .hdr { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    .hdr td { vertical-align: middle; }
    .title { text-align: center; font-size: 15px; font-weight: bold; letter-spacing: 1px; }
    .meta { border-collapse: collapse; font-size: 7px; width: 185px; }
    .meta td { border: 0.5px solid #333; padding: 1px 4px; }
    .meta td.k { background: #f0f0f0; }
    .subt { text-align: center; font-size: 9px; font-weight: bold; margin: 2px 0 5px; }
    table.grid { border-collapse: collapse; }
    table.grid th, table.grid td { border: 0.5px solid #777; padding: 1px 2px; text-align: center; line-height: 1.05; }
    table.grid th { background: #eef1f4; font-weight: bold; }
    table.matrix { font-size: 7px; width: 100%; }
    table.deduct { font-size: 8px; width: 100%; }
    .wk { background: #fde2e2; }
    .hol { background: #f7caca; }
    .sum { background: #e6f4ea; font-size: 6px; padding: 1px 1px !important; }
    .day { font-size: 6.5px; width: 20px; padding: 1px 0 !important; }
    .lname { text-align: left; white-space: nowrap; padding: 1px 5px !important; }
    .red { color: #b91c1c; }
    .sect { font-size: 9px; font-weight: bold; margin: 4px 0 3px; }
    .sign { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9px; text-align: center; }
    .sign .nm { font-weight: bold; text-decoration: underline; }
    .legend { font-size: 7px; color: #555; margin-top: 4px; }
</style>
</head>
<body>

@php
$header = function ($halaman) use ($logo, $meta) {
    ob_start(); ?>
    <table class="hdr">
        <tr>
            <td style="width: 40%;">
                <?php if ($logo): ?><img src="<?php echo $logo; ?>" style="height: 30px;"><?php endif; ?>
            </td>
            <td style="width: 35%;"><div class="title">FORM ABSENSI BULANAN</div></td>
            <td style="width: 25%;">
                <table class="meta" align="right">
                    <tr><td class="k">No. Formulir</td><td><?php echo $meta['no_formulir']; ?></td></tr>
                    <tr><td class="k">Revisi ke</td><td><?php echo $meta['revisi']; ?></td></tr>
                    <tr><td class="k">Lamp. Dok. No.</td><td><?php echo $meta['lampiran']; ?></td></tr>
                    <tr><td class="k">Halaman</td><td><?php echo $halaman; ?></td></tr>
                </table>
            </td>
        </tr>
    </table>
    <?php return ob_get_clean();
};
@endphp

{{-- ===================== SHEET 1: attendance matrix ===================== --}}
{!! $header('1 dari 2') !!}
<div class="subt">ABSEN ({{ $periodLabel }}) &nbsp;&middot;&nbsp; GAJI {{ $salaryLabel }}</div>

<table class="grid matrix">
    <thead>
        <tr>
            <th rowspan="3">No</th>
            <th rowspan="3" class="lname">NAMA</th>
            <th rowspan="3" class="lname">JABATAN</th>
            @foreach ($monthGroups as $g)<th colspan="{{ $g['count'] }}">{{ $g['label'] }}</th>@endforeach
            <th rowspan="3" class="sum">Hadir</th>
            <th rowspan="3" class="sum">LN</th>
            <th rowspan="3" class="sum">Total</th>
            @foreach ($typeCols as $tc)<th rowspan="3" class="sum">{{ $tc['abbr'] }}</th>@endforeach
            <th rowspan="3" class="sum">A</th>
            <th rowspan="3" class="sum">Pakai Cuti</th>
            <th rowspan="3" class="sum">Sisa Cuti</th>
        </tr>
        <tr>@foreach ($dates as $d)<th class="day {{ $d['holiday'] ? 'hol' : ($d['weekend'] ? 'wk' : '') }}">{{ $d['dow'] }}</th>@endforeach</tr>
        <tr>@foreach ($dates as $d)<th class="day {{ $d['holiday'] ? 'hol' : ($d['weekend'] ? 'wk' : '') }}">{{ $d['day'] }}</th>@endforeach</tr>
    </thead>
    <tbody>
        @foreach ($emps as $i => $e)
        <tr>
            <td>{{ $i + 1 }}</td>
            <td class="lname">{{ $e['name'] }}</td>
            <td class="lname">{{ $e['position'] }}</td>
            @foreach ($dates as $d)
                @php $c = $e['cells'][$d['date']] ?? null; @endphp
                <td class="day {{ $d['holiday'] ? 'hol' : ($d['weekend'] ? 'wk' : '') }}">{{ $c['mark'] ?? '' }}</td>
            @endforeach
            <td class="sum">{{ $n($e['hadir']) }}</td>
            <td class="sum">{{ $n($e['ln']) }}</td>
            <td class="sum"><b>{{ $n($e['total_kehadiran']) }}</b></td>
            @foreach ($typeCols as $tc)<td class="sum">{{ ($e['by_type'][$tc['code']] ?? 0) > 0 ? $n($e['by_type'][$tc['code']]) : '' }}</td>@endforeach
            <td class="sum">{{ $e['alpha'] > 0 ? $n($e['alpha']) : '' }}</td>
            <td class="sum">{{ $e['pemakaian_cuti'] === null ? '' : $n($e['pemakaian_cuti']) }}</td>
            <td class="sum"><b>{{ $e['sisa_cuti'] === null ? '' : $n($e['sisa_cuti']) }}</b></td>
        </tr>
        @endforeach
    </tbody>
</table>

{{-- ===================== SHEET 2: allowance deduction ===================== --}}
<div style="page-break-before: always;"></div>
{!! $header('2 dari 2') !!}
<div class="subt">ABSEN ({{ $periodLabel }}) &nbsp;&middot;&nbsp; GAJI {{ $salaryLabel }}</div>
<div class="sect">POTONGAN TUNJANGAN (PRORATA KEHADIRAN)</div>

<table class="grid deduct">
    <thead>
        <tr>
            <th>No</th><th class="lname">Nama Karyawan</th><th class="lname">Noted</th>
            @foreach ($typeCols as $tc)<th>{{ $tc['abbr'] }}</th>@endforeach
            <th>A</th><th>Total</th><th>Sisa Cuti</th>
            <th class="red">POTONG TM</th><th class="red">POTONG GTM</th><th>POTONG CUTI</th><th class="lname">Keterangan</th>
        </tr>
    </thead>
    <tbody>
        @foreach ($emps as $i => $e)
        <tr>
            <td>{{ $i + 1 }}</td>
            <td class="lname">{{ $e['name'] }}</td>
            <td class="lname">{{ $e['noted'] }}</td>
            @foreach ($typeCols as $tc)<td>{{ ($e['by_type'][$tc['code']] ?? 0) > 0 ? $n($e['by_type'][$tc['code']]) : '-' }}</td>@endforeach
            <td>{{ $e['alpha'] > 0 ? $n($e['alpha']) : '-' }}</td>
            <td><b>{{ $e['potong_days'] > 0 ? $n($e['potong_days']) : '-' }}</b></td>
            <td>{{ $e['sisa_cuti'] === null ? '-' : $n($e['sisa_cuti']) }}</td>
            <td class="red">{{ $e['potong_tm'] > 0 ? $n($e['potong_tm']) : '-' }}</td>
            <td class="red">{{ $e['potong_gtm'] > 0 ? $n($e['potong_gtm']) : '-' }}</td>
            <td>{{ $e['potong_cuti'] > 0 ? $n($e['potong_cuti']) : '-' }}</td>
            <td class="lname"></td>
        </tr>
        @endforeach
    </tbody>
</table>

<div class="legend">
    ✓ = Hadir &middot; LN = Libur Nasional &middot; A = Alpha &middot;
    @foreach ($typeCols as $tc){{ $tc['abbr'] }} = {{ $tc['label'] }}@if (!$loop->last) &middot; @endif @endforeach
    &nbsp;|&nbsp; POTONG TM = Transport + Makan (gaji utuh) &middot; POTONG GTM = Gaji + Transport + Makan &middot; POTONG CUTI = potong saldo cuti tahunan.
</div>

<table class="sign">
    <tr><td style="width:50%;">Disiapkan Oleh,</td><td style="width:50%;">Verifikasi,</td></tr>
    <tr><td style="height:42px;"></td><td></td></tr>
    <tr>
        <td><span class="nm">{{ $signers['prepared']['name'] }}</span><br>{{ $signers['prepared']['role'] }}</td>
        <td><span class="nm">{{ $signers['verified']['name'] }}</span><br>{{ $signers['verified']['role'] }}</td>
    </tr>
</table>

</body>
</html>
