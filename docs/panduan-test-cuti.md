# Panduan Pengetesan Manual — Modul Cuti (Leave Management)

Panduan langkah demi langkah menguji modul Cuti dari tiga sisi: **Employee**, **Approver (atasan/HR)**, dan **Admin/HR**. Jalankan urut dari Persiapan.

---

## 0. Persiapan (sekali, oleh Super Admin)

Tujuan: menyiapkan minimal **3 karyawan** dengan akun login + rantai atasan, lalu mengisi saldo.

1. **Master sudah ter-seed**: Kelola Cuti → Jenis Cuti (ada 9 jenis), Hari Libur (ada libur nasional). Tambah libur variabel 2026 (Idul Fitri dll) jika perlu.
2. **Buat/role akun** (User Management → Roles): pastikan ada role mis. `hr-admin` (HR) dan `staff`. Centang akses menu:
   - **Cuti → Cuti Saya** & **Persetujuan Cuti**: untuk semua role karyawan (staff, hr-admin).
   - **Kelola Cuti** (Semua Pengajuan, Saldo Karyawan, Jenis Cuti, Hari Libur): untuk **hr-admin** saja.
3. **Buat 3 karyawan** (Human Resources → Employees), masing-masing **tautkan ke akun login** (field Akun Login) + isi **gender** & **hire_date**:
   - **MANAGER** (mis. tetap, hire_date > 1 thn lalu).
   - **SUPERVISOR** — di tab Organisasi → Atasan = MANAGER.
   - **EMPLOYEE** — Atasan = SUPERVISOR.
   - Pastikan EMPLOYEE punya **NIK** & **gender** (untuk uji maternity/paternity).
4. **Isi saldo**: Kelola Cuti → Saldo Karyawan → tombol **Jalankan Akrual {tahun}**. Cek kolom Annual EMPLOYEE terisi (mis. 12 bila tetap ≥1 thn; pro-rata bila < 1 thn).

> Login tiap peran di browser/incognito berbeda agar bisa menguji paralel.

---

## 1. Sisi EMPLOYEE (login sebagai EMPLOYEE)

Menu: **Human Resources → Cuti → Cuti Saya**

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| 1.1 | Buka Cuti Saya | Muncul kartu **saldo** (Annual dst) sesuai akrual. |
| 1.2 | Klik **Ajukan Cuti** → pilih **WFH** (tanpa saldo), tanggal kerja, kirim | Pengajuan dibuat, status **Menunggu Supervisor**, muncul di tabel. |
| 1.3 | Ajukan **Annual Leave** 2 hari (tanggal kerja, ≥ H-3) | Berhasil; **saldo Annual berkurang** (ter-hold). |
| 1.4 | Ajukan Annual saat **saldo kurang** (mis. 99 hari) | Ditolak: *"Saldo cuti tidak cukup…"*. |
| 1.5 | Ajukan **tanggal menumpuk** dengan pengajuan aktif | Ditolak: *"Sudah ada pengajuan… menumpuk"*. |
| 1.6 | Ajukan **Cuti Sakit** tanpa lampiran | Ditolak: *"…wajib melampirkan dokumen"*. Ulang dengan PDF/JPG → berhasil. |
| 1.7 | Ajukan Annual **setengah hari** (durasi: setengah hari) | total_days = 0.5; saldo berkurang 0.5. |
| 1.8 | Ajukan **Maternity** (jika EMPLOYEE pria) | Ditolak (gender). Untuk karyawati → boleh. |
| 1.9 | Buka **detail** pengajuan (ikon mata) | Tampil ringkasan + **timeline approval** (Supervisor ⏳) + lampiran (jika ada). |
| 1.10 | Pada pengajuan pending → **Tarik** | Status jadi **Ditarik**, saldo Annual kembali. |
| 1.11 | Cek **bell 🔔** di header | (Belum ada notif untuk diri sendiri; notif muncul setelah ada keputusan, lihat §2.) |

---

## 2. Sisi APPROVER (atasan / HR)

### 2a. Supervisor (login sebagai SUPERVISOR)
Menu: **Cuti → Persetujuan Cuti**

| # | Langkah | Hasil |
|---|---|---|
| 2.1 | Cek **bell 🔔** | Ada notif *"Pengajuan cuti {EMPLOYEE} menunggu persetujuan Anda."* |
| 2.2 | Buka **Persetujuan Cuti** | Muncul pengajuan EMPLOYEE (yang langkah aktifnya = supervisor). |
| 2.3 | Klik **Setujui** (catatan opsional) | Pengajuan maju ke langkah berikut (HR atau Manager). Hilang dari inbox supervisor. |
| 2.4 | Pada pengajuan lain klik **Tolak** tanpa alasan | Tombol Tolak nonaktif sampai alasan diisi (alasan **wajib**). Isi → status **Ditolak**, saldo EMPLOYEE kembali. |
| 2.5 | Coba setujui pengajuan **milik sendiri** (jika SUPERVISOR juga mengajukan) | Tidak muncul di inbox-nya / ditolak (anti self-approval). |

### 2b. Annual ≥ 3 hari → langkah Manager
| 2.6 | EMPLOYEE ajukan Annual **4 hari** → SUPERVISOR setujui | Naik ke **MANAGER** (login MANAGER → muncul di Persetujuan Cuti-nya). |
| 2.7 | MANAGER setujui | Naik ke **HR**. |

### 2c. HR (login sebagai user role hr-admin)
| 2.8 | Buka **Persetujuan Cuti** | Muncul pengajuan yang sudah sampai langkah **HR**. |
| 2.9 | **Setujui** (final) | Status **Disetujui**; **saldo EMPLOYEE ter-commit** (used bertambah); EMPLOYEE dapat notif *"…telah disetujui"*. |

> Verifikasi saldo: Kelola Cuti → Saldo Karyawan → kolom Annual EMPLOYEE (tooltip: Hak/Terpakai/Pending).

---

## 3. Sisi ADMIN / HR (login sebagai hr-admin)

Menu: **Human Resources → Kelola Cuti**

### 3a. Semua Pengajuan
| 3.1 | Buka **Semua Pengajuan** | Tampil seluruh pengajuan semua karyawan. |
| 3.2 | **Filter** status / jenis / cari karyawan | Daftar ter-saring sesuai filter. |
| 3.3 | Pada pengajuan **Disetujui yang belum mulai** → **Batalkan** | Status **Dibatalkan**, saldo dikembalikan (reverse). |
| 3.4 | Coba batalkan cuti yang **sudah lewat** | Ditolak: *"…sudah berjalan/lewat…"*. |

### 3b. Saldo Karyawan
| 3.5 | Buka **Saldo Karyawan**, pilih tahun | Tabel saldo per karyawan × jenis. |
| 3.6 | **Jalankan Akrual {tahun}** | Flash: "Akrual selesai: N saldo diperbarui." Saldo Annual terisi. |
| 3.7 | **Koreksi saldo** (ikon slider) → pilih jenis, +2 atau -1 | Saldo `available` berubah sesuai penyesuaian. |

### 3c. Jenis Cuti
| 3.8 | Buka **Jenis Cuti** → **Tambah** | Buat jenis baru (kode unik); muncul di daftar & di form pengajuan employee. |
| 3.9 | **Ubah** kuota/aturan jenis | Tersimpan; pengaruh ke pengajuan berikutnya. |
| 3.10 | **Hapus** jenis yang sudah dipakai | Tidak terhapus → otomatis **dinonaktifkan**. |

### 3d. Hari Libur
| 3.11 | Buka **Hari Libur** → **Tambah** tanggal di tengah rentang cuti | Tersimpan. |
| 3.12 | Employee ajukan cuti melewati tanggal libur itu | **total_days tidak menghitung** hari libur tsb (mis. 5 hari kalender → 4 hari kerja). |

---

## 4. Edge cases (opsional, untuk yakin)
- Employee **tanpa atasan** (Atasan kosong) ajukan cuti → langkah supervisor **di-skip**, langsung ke **HR**.
- Annual **> 5 hari** → muncul langkah **Director** (jika ada role director).
- Cuti melewati **akhir pekan** → hanya hari kerja yang dihitung.
- **Withdraw** lalu ajukan ulang tanggal sama → boleh (yang withdrawn tak dianggap menumpuk).

---

## 5. Checklist ringkas
- [ ] Akrual mengisi saldo (lump-sum tetap ≥1th / pro-rata <1th)
- [ ] Submit menahan saldo; approve final meng-commit; reject/withdraw/cancel mengembalikan
- [ ] Routing: supervisor → (manager ≥3h) → HR → (director >5h); skip bila atasan kosong; anti self-approval
- [ ] Validasi: saldo kurang, overlap, lampiran wajib, gender, min H-, half-day
- [ ] Notifikasi bell ke approver (saat masuk) & pemohon (saat diputus)
- [ ] Hari libur & akhir pekan tidak dihitung
- [ ] Admin: monitoring + cancel, koreksi saldo, CRUD jenis & hari libur
- [ ] RBAC: menu Kelola Cuti hanya untuk HR; Persetujuan hanya menampilkan antrian masing-masing
