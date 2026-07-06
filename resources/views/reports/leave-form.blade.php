<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
@php
    use Carbon\Carbon;
    $code = strtoupper($leave->leaveType->code ?? '');
    $jenis = str_contains($code, 'SICK') ? 'sakit' : (str_contains($code, 'PERMISSION') || str_contains($code, 'IZIN') ? 'izin' : (str_contains($code, 'ANNUAL') || str_contains($code, 'CUTI') ? 'cuti' : 'lainnya'));
    $ck = fn ($k) => $jenis === $k ? 'X' : '';
    $d = fn ($v) => $v ? Carbon::parse($v)->translatedFormat('d M Y') : '';
    $hari = fn ($v) => $v ? Carbon::parse($v)->locale('id')->isoFormat('dddd') : '';
    $n1 = fn ($v) => $v === null || $v === '' ? '' : number_format((float) $v, ((float) $v == (int) (float) $v ? 0 : 1), ',', '.');
    $masukKembali = $leave->end_date ? Carbon::parse($leave->end_date)->addDay() : null;
    $allot = (float) ($balance->allotted ?? 0) + (float) ($balance->carried_over ?? 0) + (float) ($balance->adjustment ?? 0);
    $used = (float) ($balance->used ?? 0);
    $sisa = $allot - $used - (float) ($balance->pending ?? 0);
    $isApproved = $leave->status === 'approved';
    $isRejected = $leave->status === 'rejected';
@endphp
<style>
    @page { margin: 12mm 15mm 12mm 15mm; }   /* top right bottom left — aman dari area non-cetak printer */
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: DejaVu Sans, sans-serif; color: #111; font-size: 9.5px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { vertical-align: middle; }
    .frame td { border: 0.8px solid #222; padding: 3px 6px; }
    .frame + .frame { margin-top: -0.8px; }
    .bar td { border: 0.8px solid #222; background: #b9c9e8; text-align: center; font-weight: bold; padding: 3px; }
    .title td { font-size: 15px; letter-spacing: 1px; }
    .k { font-weight: bold; }
    .box { display: inline-block; width: 13px; height: 11px; border: 0.8px solid #222; text-align: center; line-height: 11px; font-weight: bold; vertical-align: middle; margin: 0 3px 0 1px; }
    .sign td { border: 0.8px solid #222; text-align: center; padding: 3px 4px; }
    .sign .hd { font-weight: normal; height: 16px; }
    .sign .sp { height: 52px; }
    .sign .role { font-weight: bold; }
    .sign .nm { height: 16px; }
    .notes { font-size: 7.5px; margin-top: 7px; line-height: 1.55; }
    .addr { font-size: 7px; color: #333; margin-top: 6px; line-height: 1.4; }
</style>
</head>
<body>
    {{-- Header: logo + website (single open row, no internal divider) --}}
    <table class="frame">
        <tr>
            <td style="padding:6px 8px;">
                <table style="width:100%; border-collapse:collapse;">
                    <tr>
                        <td style="border:0; text-align:left; vertical-align:middle;">
                            @if ($logo)<img src="{{ $logo }}" style="height:30px;">@else<b style="font-size:13px;">MAPSON ARYA PARAHITA</b>@endif
                        </td>
                        <td style="border:0; text-align:right; vertical-align:top; font-size:8px; color:#555; width:30%;">www.mapsonarya.com</td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    {{-- Title bar --}}
    <table class="frame bar title"><tr><td>FORMULIR PERMOHONAN CUTI/IZIN</td></tr></table>

    {{-- Identity --}}
    <table class="frame">
        <tr>
            <td class="k" style="width:17%;">Nama</td><td style="width:33%;">: {{ $emp->display_name }}</td>
            <td class="k" style="width:22%;">No Dokumen</td><td style="width:28%;">: {{ $leave->request_number }}</td>
        </tr>
        <tr>
            <td class="k">Bagian</td><td>: {{ $emp->department->name ?? ($emp->currentPosition->name ?? '-') }}</td>
            <td class="k">Tanggal Pengajuan</td><td>: {{ $d($leave->submitted_at ?? $leave->created_at) }}</td>
        </tr>
    </table>

    {{-- Jenis + tanggal --}}
    <table class="frame">
        <tr>
            <td class="k" style="width:17%;">Jenis Cuti/Izin</td>
            <td style="width:33%;">: <span class="box">{{ $ck('cuti') }}</span> Cuti</td>
            <td colspan="2"><span class="box">{{ $ck('sakit') }}</span> Sakit</td>
        </tr>
        <tr>
            <td class="k"></td>
            <td>&nbsp; <span class="box">{{ $ck('izin') }}</span> Izin</td>
            <td colspan="2"><span class="box">{{ $ck('lainnya') }}</span> Lainnya : {{ $jenis === 'lainnya' ? $leave->leaveType->name : '' }}</td>
        </tr>
        <tr><td class="k">Alasan</td><td colspan="3">: {{ $leave->reason }}</td></tr>
        <tr>
            <td class="k">Tanggal</td><td>: {{ $d($leave->start_date) }}</td>
            <td class="k" style="width:8%;">s.d</td><td>{{ $leave->start_date != $leave->end_date ? $d($leave->end_date) : '' }}</td>
        </tr>
        <tr>
            <td class="k">Hari</td><td>: {{ $hari($leave->start_date) }}</td>
            <td class="k">s.d</td><td>{{ $leave->start_date != $leave->end_date ? $hari($leave->end_date) : '' }}</td>
        </tr>
        <tr>
            <td class="k">Jam</td><td>: {{ $leave->start_time ? substr($leave->start_time, 0, 5) : '' }}</td>
            <td class="k">s.d</td><td>{{ $leave->end_time ? substr($leave->end_time, 0, 5) : '' }}</td>
        </tr>
        <tr>
            <td class="k">Masuk Kembali tgl</td><td>: {{ $d($masukKembali) }}</td>
            <td class="k">Hari</td><td></td>
        </tr>
        <tr>
            <td class="k">Jumlah Cuti</td><td>: {{ $n1($leave->total_days) }} Hari</td>
            <td class="k"></td><td></td>
        </tr>
    </table>

    {{-- Divisi HR --}}
    <table class="frame bar"><tr><td colspan="4">Divisi HR</td></tr></table>
    <table class="frame">
        <tr>
            <td class="k" style="width:24%;">Total Cuti Diambil {{ $leave->year }}</td><td style="width:26%;">: {{ $n1($used) }} Hari</td>
            <td class="k" style="width:22%;">Total Cuti thn {{ $leave->year }}</td><td style="width:28%;">: {{ $n1($allot) }} Hari</td>
        </tr>
        <tr>
            <td class="k">Total Cuti massal {{ $leave->year }}</td><td>: &nbsp; Hari</td>
            <td class="k">Sisa Cuti {{ $leave->year }}</td><td>: {{ $n1($sisa) }} Hari</td>
        </tr>
        <tr><td class="k" style="height:34px;">Keterangan</td><td colspan="3">: {{ $leave->decision_note ?? '' }}</td></tr>
    </table>

    {{-- Persetujuan Atasan --}}
    <table class="frame bar"><tr><td colspan="2">Persetujuan Atasan</td></tr></table>
    <table class="frame">
        <tr><td class="k" style="width:22%;">Disetujui / ditolak</td><td>: <span class="box">{{ $isApproved ? 'X' : '' }}</span> Disetujui</td></tr>
        <tr><td></td><td>: <span class="box"></span> Ditangguhkan menjadi tanggal ______ s.d ______</td></tr>
        <tr><td></td><td>: <span class="box">{{ $isRejected ? 'X' : '' }}</span> Ditolak</td></tr>
        <tr><td class="k" style="height:34px;">Alasan</td><td>: {{ $leave->decision_note ?? '' }}</td></tr>
    </table>

    {{-- Signatures --}}
    <table class="frame sign">
        <tr>
            <td class="hd" style="width:25%;">Di Ajukan oleh,</td>
            <td class="hd" colspan="2" style="width:50%;">Di Setujui Oleh,</td>
            <td class="hd" style="width:25%;">Di Ketahui Oleh,</td>
        </tr>
        <tr><td class="sp"></td><td class="sp"></td><td class="sp"></td><td class="sp"></td></tr>
        <tr>
            <td class="role"></td>
            <td class="role">Atasan Langsung</td>
            <td class="role">Direktur Utama</td>
            <td class="role">HRD</td>
        </tr>
        <tr>
            <td class="nm">{{ $emp->display_name }}</td>
            <td class="nm">{{ $atasan ?? '' }}</td>
            <td class="nm">{{ $direktur ?? '' }}</td>
            <td class="nm">{{ $hrd ?? '' }}</td>
        </tr>
    </table>

    {{-- Notes --}}
    <div class="notes">
        <b>Catatan :</b><br>
        - Sebelum dan sesudah menjalankan cuti wajib melapor pada atasan langsung.<br>
        - Menyerahkan seluruh tugas pekerjaan kepada petugas pengganti sementara.<br>
        - Cuti di luar tanggungan / cuti yang melebihi hak cuti akan diperhitungkan dengan pemotongan gaji karyawan secara proporsional.<br>
        - Pengajuan cuti harus diajukan paling lambat 5 hari sebelumnya ke HRD.<br>
        - Apabila ada perubahan dalam pengajuan cuti tersebut maka akan disesuaikan kembali.<br>
        - Apabila sakit, formulir diisi setelah karyawan masuk kembali dengan melampirkan surat keterangan sakit dari dokter.
    </div>
    <div class="addr">
        Roseville Business District No 3, Sunburst CBD central business district Lot 1.8,<br>
        Jalan Kapten Soebianto Djojohadikusumo, BSD City. Desa/Kelurahan Lengkong Gudang, Kec. Serpong, Kota Tangerang Selatan, Provinsi Banten, 15321<br>
        Phone : +62 811 9972 800
    </div>
</body>
</html>
