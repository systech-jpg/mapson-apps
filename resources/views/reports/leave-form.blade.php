<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
@php
    use Carbon\Carbon;
    $code = strtoupper($leave->leaveType->code ?? '');
    $jenis = str_contains($code, 'SICK') ? 'sakit' : (str_contains($code, 'PERMISSION') || str_contains($code, 'IZIN') ? 'izin' : (str_contains($code, 'ANNUAL') || str_contains($code, 'CUTI') ? 'cuti' : 'lainnya'));
    $chk = fn ($k) => $jenis === $k ? 'X' : '';
    $d = fn ($v) => $v ? Carbon::parse($v)->translatedFormat('d M Y') : '';
    $hari = fn ($v) => $v ? Carbon::parse($v)->locale('id')->isoFormat('dddd') : '';
    $n1 = fn ($v) => number_format((float) $v, ($v == (int) $v ? 0 : 1), ',', '.');
    $masukKembali = $leave->end_date ? Carbon::parse($leave->end_date)->addDay() : null;
    $allot = (float) ($balance->allotted ?? 0) + (float) ($balance->carried_over ?? 0) + (float) ($balance->adjustment ?? 0);
    $used = (float) ($balance->used ?? 0);
    $sisa = $allot - $used - (float) ($balance->pending ?? 0);
    $decision = match ($leave->status) {
        'approved' => 'setuju', 'rejected' => 'tolak', default => 'proses',
    };
@endphp
<style>
    @page { margin: 26px 30px; }
    * { box-sizing: border-box; }
    body { font-family: DejaVu Sans, sans-serif; color: #111; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { vertical-align: top; }
    .b td, .b th { border: 0.7px solid #333; padding: 3px 6px; }
    .head td { border: 0.7px solid #333; padding: 4px 6px; vertical-align: middle; }
    .title { text-align: center; font-size: 15px; font-weight: bold; letter-spacing: 1px; background: #cdd7ee; }
    .sec { background: #cdd7ee; font-weight: bold; text-align: center; }
    .k { font-weight: bold; width: 22%; }
    .chkbox { display: inline-block; width: 14px; height: 12px; border: 0.7px solid #333; text-align: center; font-weight: bold; margin-right: 3px; }
    .sign td { border: 0.7px solid #333; height: 58px; text-align: center; vertical-align: bottom; padding: 3px; }
    .sign .role { font-weight: bold; }
    .notes { font-size: 8px; margin-top: 8px; line-height: 1.5; }
    .co { font-size: 12px; font-weight: bold; }
    .co small { font-size: 7px; font-weight: normal; letter-spacing: 1px; }
</style>
</head>
<body>
    <table class="head">
        <tr>
            <td style="width:32%; text-align:center;"><span class="co">MAPSON ARYA PARAHITA</span><br><small>BRIDGING TO THE FUTURE</small></td>
            <td class="title">FORMULIR PERMOHONAN CUTI/IZIN</td>
        </tr>
    </table>

    <table class="b" style="margin-top:6px;">
        <tr>
            <td class="k">Nama</td><td style="width:34%;">{{ $emp->name }}</td>
            <td class="k">No Dokumen</td><td>{{ $leave->request_number }}</td>
        </tr>
        <tr>
            <td class="k">Bagian</td><td>{{ $emp->department->name ?? ($emp->currentPosition->name ?? '-') }}</td>
            <td class="k">Tanggal Pengajuan</td><td>{{ $d($leave->submitted_at ?? $leave->created_at) }}</td>
        </tr>
    </table>

    <table class="b" style="margin-top:6px;">
        <tr>
            <td class="k">Jenis Cuti/Izin</td>
            <td colspan="3">
                <span class="chkbox">{{ $chk('cuti') }}</span> Cuti &nbsp;&nbsp;
                <span class="chkbox">{{ $chk('sakit') }}</span> Sakit &nbsp;&nbsp;
                <span class="chkbox">{{ $chk('izin') }}</span> Izin &nbsp;&nbsp;
                <span class="chkbox">{{ $chk('lainnya') }}</span> Lainnya : {{ $jenis === 'lainnya' ? $leave->leaveType->name : '' }}
            </td>
        </tr>
        <tr><td class="k">Alasan</td><td colspan="3">{{ $leave->reason }}</td></tr>
        <tr>
            <td class="k">Tanggal</td><td>{{ $d($leave->start_date) }} s.d {{ $d($leave->end_date) }}</td>
            <td class="k">Hari</td><td>{{ $hari($leave->start_date) }}{{ $leave->start_date != $leave->end_date ? ' s.d '.$hari($leave->end_date) : '' }}</td>
        </tr>
        <tr>
            <td class="k">Jam</td><td>{{ $leave->start_time ? substr($leave->start_time, 0, 5).' s.d '.substr($leave->end_time ?? '', 0, 5) : '-' }}</td>
            <td class="k">Masuk Kembali tgl</td><td>{{ $d($masukKembali) }}</td>
        </tr>
        <tr>
            <td class="k">Jumlah Cuti</td><td>{{ $n1($leave->total_days) }} Hari</td>
            <td class="k">Setengah Hari</td><td>{{ $leave->day_part && $leave->day_part !== 'full' ? 'Ya ('.$leave->day_part.')' : 'Tidak' }}</td>
        </tr>
    </table>

    <table class="b" style="margin-top:6px;">
        <tr><td colspan="4" class="sec">Divisi HR</td></tr>
        <tr>
            <td class="k">Total Cuti Diambil {{ $leave->year }}</td><td>{{ $n1($used) }} Hari</td>
            <td class="k">Total Cuti thn {{ $leave->year }}</td><td>{{ $n1($allot) }} Hari</td>
        </tr>
        <tr>
            <td class="k">Sisa Cuti {{ $leave->year }}</td><td>{{ $n1($sisa) }} Hari</td>
            <td class="k">Status</td><td>{{ ['approved'=>'Disetujui','rejected'=>'Ditolak'][$leave->status] ?? 'Menunggu Persetujuan' }}</td>
        </tr>
    </table>

    <table class="b" style="margin-top:6px;">
        <tr><td colspan="2" class="sec">Persetujuan</td></tr>
        <tr>
            <td class="k">Keputusan</td>
            <td>
                <span class="chkbox">{{ $decision === 'setuju' ? 'X' : '' }}</span> Disetujui &nbsp;&nbsp;
                <span class="chkbox">{{ $decision === 'tolak' ? 'X' : '' }}</span> Ditolak &nbsp;&nbsp;
                <span class="chkbox">{{ $decision === 'proses' ? 'X' : '' }}</span> Dalam Proses
            </td>
        </tr>
        <tr><td class="k">Catatan Keputusan</td><td>{{ $leave->decision_note ?? '' }}</td></tr>
    </table>

    <table class="sign" style="margin-top:10px;">
        <tr>
            <td>Di Ajukan oleh,</td>
            <td>Atasan Langsung,</td>
            <td>Direktur Utama,</td>
            <td>Diketahui HRD,</td>
        </tr>
        <tr style="height:52px;"><td></td><td></td><td></td><td></td></tr>
        <tr>
            <td class="role">{{ $emp->name }}</td>
            <td class="role">{{ $atasan ?? '(...................)' }}</td>
            <td class="role">{{ $direktur ?? '(...................)' }}</td>
            <td class="role">{{ $hrd ?? '(...................)' }}</td>
        </tr>
    </table>

    <div class="notes">
        <b>Catatan :</b><br>
        - Sebelum dan sesudah menjalankan cuti wajib melapor pada atasan langsung.<br>
        - Menyerahkan seluruh tugas pekerjaan kepada petugas pengganti sementara.<br>
        - Cuti di luar tanggungan / cuti yang melebihi hak cuti akan diperhitungkan dengan pemotongan gaji karyawan secara proporsional.<br>
        - Apabila ada perubahan dalam pengajuan cuti tersebut maka akan disesuaikan kembali.<br>
        - Apabila sakit, formulir diisi setelah karyawan masuk kembali dengan melampirkan surat keterangan sakit dari dokter.
    </div>
</body>
</html>
