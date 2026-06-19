<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
@php
    $rp = fn ($v) => 'Rp ' . number_format((float) $v, 0, ',', '.');
    $statusLabel = [
        'draft' => 'Draf', 'pending_supervisor' => 'Menunggu Atasan', 'pending_hr' => 'Menunggu HR',
        'approved' => 'Disetujui', 'rejected' => 'Ditolak',
    ];
    $entryStatus = ['pending' => 'Menunggu', 'approved' => 'Disetujui', 'rejected' => 'Ditolak'];
@endphp
<style>
    @page { margin: 24px 28px; }
    * { box-sizing: border-box; }
    body { font-family: DejaVu Sans, sans-serif; color: #111; font-size: 11px; }
    .hdr { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    .hdr td { vertical-align: middle; }
    .title { text-align: center; font-size: 16px; font-weight: bold; letter-spacing: 1px; }
    .meta { border-collapse: collapse; font-size: 10px; width: 190px; }
    .meta td { border: 0.5px solid #333; padding: 2px 5px; }
    .meta td.k { background: #f0f0f0; }
    hr { border: none; border-top: 1.5px solid #333; margin: 4px 0 10px; }
    .info { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; }
    .info td { padding: 1px 0; vertical-align: top; }
    .info .lbl { width: 110px; color: #555; }
    table.grid { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    table.grid th, table.grid td { border: 0.5px solid #888; padding: 3px 5px; }
    table.grid th { background: #eef1f4; text-align: center; }
    .r { text-align: right; }
    .c { text-align: center; }
    .merah { color: #b91c1c; font-weight: bold; }
    tfoot td { font-weight: bold; background: #f7f9fb; }
    .sign { width: 100%; border-collapse: collapse; margin-top: 26px; text-align: center; font-size: 10.5px; }
    .sign td { width: 25%; vertical-align: top; padding: 0 4px; }
    .sign .role { font-weight: bold; }
    .sign .nm { font-weight: bold; text-decoration: underline; }
    .muted { color: #666; }
</style>
</head>
<body>

<table class="hdr">
    <tr>
        <td style="width: 45%;">
            @if ($logo)<img src="{{ $logo }}" style="height: 30px;">@endif
        </td>
        <td style="width: 30%;"><div class="title">FORM LEMBUR</div></td>
        <td style="width: 25%;">
            <table class="meta" align="right">
                <tr><td class="k">No.</td><td>{{ $ot->request_number }}</td></tr>
                <tr><td class="k">Periode</td><td>{{ $ot->period }}</td></tr>
                <tr><td class="k">Status</td><td>{{ $statusLabel[$ot->status] ?? $ot->status }}</td></tr>
            </table>
        </td>
    </tr>
</table>
<hr>

<table class="info">
    <tr>
        <td class="lbl">Nama</td><td><b>{{ $ot->employee?->full_name }}</b> ({{ $ot->employee?->employee_code }})</td>
        <td class="lbl">Periode</td><td>{{ $periodLabel }}</td>
    </tr>
    <tr>
        <td class="lbl">Jabatan</td><td>{{ $ot->employee?->currentPosition?->name ?? '-' }}</td>
        <td class="lbl">Total Jam</td><td>{{ rtrim(rtrim(number_format((float) $ot->total_hours, 1, ',', ''), '0'), ',') }} jam</td>
    </tr>
</table>

<table class="grid">
    <thead>
        <tr>
            <th style="width: 24px;">No</th>
            <th style="width: 80px;">Tanggal</th>
            <th style="width: 52px;">Hari</th>
            <th>Aktivitas</th>
            <th style="width: 48px;">Mulai</th>
            <th style="width: 48px;">Selesai</th>
            <th style="width: 46px;">Jam</th>
            <th style="width: 70px;">Status</th>
        </tr>
    </thead>
    <tbody>
        @forelse ($ot->entries as $i => $e)
            <tr>
                <td class="c">{{ $i + 1 }}</td>
                <td>{{ $e->date?->translatedFormat('d M Y') }}</td>
                <td class="c {{ $e->is_holiday ? 'merah' : '' }}">{{ $e->is_holiday ? 'Libur' : 'Kerja' }}</td>
                <td>{{ $e->activity }}@if ($e->note)<br><span class="muted">{{ $e->note }}</span>@endif</td>
                <td class="c">{{ \Illuminate\Support\Str::substr($e->start_time, 0, 5) }}</td>
                <td class="c">{{ \Illuminate\Support\Str::substr($e->end_time, 0, 5) }}</td>
                <td class="r">{{ rtrim(rtrim(number_format((float) $e->hours, 1, ',', ''), '0'), ',') }}</td>
                <td class="c">{{ $entryStatus[$e->status] ?? $e->status }}</td>
            </tr>
        @empty
            <tr><td colspan="8" class="c muted" style="padding: 16px;">Tidak ada entri lembur.</td></tr>
        @endforelse
    </tbody>
    <tfoot>
        <tr>
            <td colspan="6" class="r">Total Jam</td>
            <td class="r">{{ rtrim(rtrim(number_format((float) $ot->total_hours, 1, ',', ''), '0'), ',') }}</td>
            <td></td>
        </tr>
        <tr>
            <td colspan="6" class="r">Total Nominal</td>
            <td colspan="2" class="r">{{ $rp($ot->total_amount) }}</td>
        </tr>
    </tfoot>
</table>

<table class="sign">
    <tr>
        <td><div class="role">Dibuat Oleh,</div></td>
        @foreach ($signers as $s)<td><div class="role">{{ $s['role'] }},</div></td>@endforeach
    </tr>
    <tr>
        <td style="height: 56px;"></td>
        @foreach ($signers as $s)<td></td>@endforeach
    </tr>
    <tr>
        <td><span class="nm">{{ $ot->employee?->full_name }}</span><br><span class="muted">Karyawan</span></td>
        @foreach ($signers as $s)<td><span class="nm">{{ $s['name'] }}</span><br><span class="muted">{{ $s['role'] }}</span></td>@endforeach
    </tr>
</table>

</body>
</html>
