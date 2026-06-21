<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
@php
    $rp = fn ($v) => 'Rp ' . number_format((float) $v, 0, ',', '.');
    $hm = fn ($min) => intdiv((int) $min, 60) . ':' . str_pad((string) ((int) $min % 60), 2, '0', STR_PAD_LEFT);
@endphp
<style>
    @page { margin: 22px 26px; }
    * { box-sizing: border-box; }
    body { font-family: DejaVu Sans, sans-serif; color: #111; font-size: 10px; }
    .head { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    .head td { border: 0.7px solid #333; vertical-align: middle; padding: 4px 6px; }
    .head .logo { width: 26%; text-align: center; }
    .head .ttl { width: 44%; text-align: center; font-size: 15px; font-weight: bold; letter-spacing: 1px; }
    .head .co { font-size: 9px; font-weight: bold; margin-top: 3px; }
    .meta { width: 30%; border-collapse: collapse; font-size: 8.5px; }
    .meta td { border: 0.5px solid #333; padding: 1px 4px; }
    .meta td.k { background: #f0f0f0; width: 52%; }
    .title { text-align: center; font-size: 14px; font-weight: bold; margin: 6px 0 8px; }
    table.grid { width: 100%; border-collapse: collapse; font-size: 9px; }
    table.grid th, table.grid td { border: 0.5px solid #999; padding: 2px 4px; }
    table.grid thead th { background: #1f2937; color: #fff; text-align: center; }
    .r { text-align: right; }
    .c { text-align: center; }
    tr.libur td { background: #fde68a; font-weight: bold; }
    tr.total td { background: #e5e7eb; font-weight: bold; }
    .foot { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .foot > tbody > tr > td { vertical-align: top; }
    .sign { font-size: 9.5px; }
    .sign .box { border: 0.5px solid #333; height: 56px; }
    .sumtbl { border-collapse: collapse; font-size: 9px; float: right; }
    .sumtbl th, .sumtbl td { border: 0.5px solid #999; padding: 2px 6px; }
    .sumtbl th { background: #1f2937; color: #fff; }
    .nm { font-weight: bold; text-decoration: underline; }
</style>
</head>
<body>

<table class="head">
    <tr>
        <td class="logo">
            @if ($logo)<img src="{{ $logo }}" style="height: 30px;">@endif
            <div class="co">PT. MAPSON ARYA PARAHITA<br>TANGERANG SELATAN - INDONESIA</div>
        </td>
        <td class="ttl">FORM REKAP LEMBUR</td>
        <td style="padding: 0; border: none;">
            <table class="meta">
                <tr><td class="k">No. Formulir</td><td>002/03/HRGA-MAP/F-03</td></tr>
                <tr><td class="k">Revisi ke</td><td>00</td></tr>
                <tr><td class="k">Lamp. Dok. No.</td><td>002/03/HRGA-MAP/04/2025</td></tr>
                <tr><td class="k">Halaman</td><td>1 dari 1</td></tr>
            </table>
        </td>
    </tr>
</table>

<div class="title">REKAP LEMBUR {{ $titleMonth }}</div>

<table class="grid">
    <thead>
        <tr>
            <th style="width: 26px;">No</th>
            <th>Nama</th>
            <th style="width: 64px;">Hari</th>
            <th style="width: 64px;">Tanggal</th>
            <th style="width: 34px;">Bulan</th>
            <th style="width: 58px;">Jam Mulai</th>
            <th style="width: 58px;">Jam Selesai</th>
            <th style="width: 48px;">Jmlh Jam</th>
            <th style="width: 92px;">Lembur/Jam</th>
        </tr>
    </thead>
    <tbody>
        @forelse ($rows as $i => $r)
            <tr class="{{ $r['is_holiday'] ? 'libur' : '' }}">
                <td class="c">{{ $i + 1 }}</td>
                <td>{{ $r['name'] }}</td>
                <td>{{ $r['date']->format('l') }}</td>
                <td class="c">{{ $r['date']->format('j-M-y') }}</td>
                <td class="c">{{ $r['pay_month']->format('M') }}</td>
                <td class="c">{{ $r['start'] }}</td>
                <td class="c">{{ $r['end'] }}</td>
                <td class="c">{{ $hm($r['minutes']) }}</td>
                <td class="r">{{ $rp($r['amount']) }}</td>
            </tr>
        @empty
            <tr><td colspan="9" class="c" style="padding: 16px; color: #666;">Tidak ada data lembur.</td></tr>
        @endforelse
        <tr class="total">
            <td colspan="8" class="r">TOTAL</td>
            <td class="r">{{ $rp($grand) }}</td>
        </tr>
    </tbody>
</table>

<table class="foot">
    <tr>
        <td style="width: 55%;">
            <table class="sign">
                <tr><td colspan="2">Tangerang Selatan, {{ $today }}</td></tr>
                <tr>
                    @foreach ($signers as $s)<td style="width: 50%;">{{ $s['role'] }}</td>@endforeach
                </tr>
                <tr>
                    @foreach ($signers as $s)<td class="box"></td>@endforeach
                </tr>
                <tr>
                    @foreach ($signers as $s)<td class="c"><span class="nm">{{ $s['name'] }}</span></td>@endforeach
                </tr>
            </table>
        </td>
        <td style="width: 45%;">
            <table class="sumtbl">
                <tr><th>Nama</th><th>Sum of Lembur/Jam</th></tr>
                @foreach ($summary as $name => $amt)
                    <tr><td>{{ $name }}</td><td class="r">{{ $rp($amt) }}</td></tr>
                @endforeach
                <tr class="total"><td><b>Grand Total</b></td><td class="r"><b>{{ $rp($grand) }}</b></td></tr>
            </table>
        </td>
    </tr>
</table>

</body>
</html>
