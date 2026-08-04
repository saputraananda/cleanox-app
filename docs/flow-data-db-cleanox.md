# Flow & Data — Database Cleanox

Dokumen ini menjelaskan **bentuk data** dan **alur pemakaian** database **cleanox** terhadap sistem Cleanox App.  
Sumber: `prisma/schema.prisma` (hasil `db pull`) + kode yang memakai `cleanoxPool`.

Saling melengkapi dengan `docs/bisnis-proses-dan-database.md` (katalog modul & multi-DB). Dokumen ini lebih dalam ke **flow data Cleanox**.

---

## 1. Tujuan Dokumen

- Memahami tabel apa saja yang ada di DB cleanox
- Memahami makna tiap kelompok kolom, terutama tabel transaksi/item
- Memahami **aksi di sistem → kolom mana yang berubah**
- Memisahkan tabel yang **sudah dipakai app** vs yang **baru ada di DB**

Tidak membahas spekulasi bagaimana baris transaksi pertama kali di-INSERT dari sistem luar.

---

## 2. Posisi DB Cleanox dalam Sistem

```
┌──────────────────────────┐
│ DB waschen (aloraPool)   │
│ • users                  │  ← login, nama karyawan
│ • mst_employee           │  ← isManagement (company_id, exit_date)
└────────────┬─────────────┘
             │ employee_id = users.id
             ▼
┌──────────────────────────┐
│ DB cleanox (cleanoxPool) │  ← fokus dokumen ini
│ • mst_role               │
│ • tr_rekap_transaksi_…   │
│ • mst_target_cleanox     │
│ • mst_category           │  (belum dipakai app)
│ • mst_services           │  (belum dipakai app)
└────────────┬─────────────┘
             │
             │ target (cleanox) vs realisasi (smartlink)
             ▼
┌──────────────────────────┐
│ DB waschen_smartlink /   │
│ cleanox_smartlink        │  ← KPI dashboard (bukan fokus utama)
└──────────────────────────┘
```

| Env pool | Dipakai untuk |
|---|---|
| `DB_HOST_CLEANOX` … `DB_NAME_CLEANOX` | `cleanoxPool` |

**Modul app yang menyentuh DB cleanox:**

| Modul | Yang dibaca/ditulis |
|---|---|
| Auth | `mst_role` |
| Status Produksi | `tr_rekap_transaksi_reguler_waschen` (+ `mst_role` untuk daftar petugas) |
| Evidence | kolom evidence di `tr_rekap_transaksi_reguler_waschen` |
| Dashboard | `mst_target_cleanox` (target saja) |

---

## 3. Inventaris Tabel (dari Prisma)

| Tabel | Fungsi bisnis singkat | Dipakai app? |
|---|---|---|
| `tr_rekap_transaksi_reguler_waschen` | Data nota/item + progress produksi + evidence | **Ya** — inti operasional |
| `mst_role` | Role Cleanox per `employee_id` | **Ya** — auth & daftar petugas |
| `mst_target_cleanox` | Target penjualan per outlet/bulan | **Ya** — dashboard |
| `mst_category` | Master kategori layanan | **Tidak** (belum ada API) |
| `mst_services` | Master layanan (harga, durasi, status) | **Tidak** (belum ada API) |

### Enum di schema

| Enum | Nilai |
|---|---|
| `mst_role_role` | `produksi`, `frontliner` (default di DB: `produksi`) |
| `tr_rekap_transaksi_reguler_waschen_status` | `Pickup`, `Cuci Jemur`, `Packing`, `Pengantaran` |
| `mst_services_duration_unit` | `jam`, `hari`, `minggu`, `bulan` |

---

## 4. Model Data Transaksi (1 Nota → Banyak Item)

**Satu baris di `tr_rekap_transaksi_reguler_waschen` = satu item**, bukan satu nota utuh.

```
Nota NO-001
├── baris id=10  item_ke=1  nama_item="Cleanox Karpet A"  status=Pickup
└── baris id=11  item_ke=2  nama_item="Cleanox Karpet B"  status=Packing
```

Progress bisa **berbeda per item** dalam nota yang sama.

### Unique constraint

```
@@unique([no_nota, nama_item, jumlah, total, item_ke])
```

Mencegah duplikat kombinasi item yang sama pada nota yang sama.

### Index yang relevan untuk flow list

| Index | Manfaat di sistem |
|---|---|
| `idx_no_nota` | Cari semua item satu nota (lengkap? hapus nota? notif grup) |
| `idx_no_nota_itemke` | Identitas urutan item dalam nota |
| `idx_on_hold` | Filter status Tertunda |
| `idx_status` | Filter pipeline |
| `idx_outlet` + tanggal | Filter cabang & periode |
| `idx_tgl_terima` | Filter / sort periode |

---

## 5. Kamus Kolom: `tr_rekap_transaksi_reguler_waschen`

Legenda pemakaian oleh app ini:

- **Update** — diubah oleh API produksi / evidence / catatan / hold
- **Baca** — dibaca untuk list, tracking, filter, WA, dll.
- **Tidak disentuh** — ada di schema, tidak ada UPDATE/SELECT khusus di alur produksi utama (tetap bisa ikut SELECT `*` tidak eksplisit; di sini = tidak jadi fokus operasi app)

### 5.1 Identitas & outlet

| Kolom | Arti | Pemakaian app |
|---|---|---|
| `id` | PK baris item | Baca / kunci semua update |
| `no_nota` | Nomor nota | Baca; group hapus/notif; cek semua item selesai |
| `item_ke` | Urutan item dalam nota | Baca (unique key) |
| `jumlah_item` | Jumlah item (default 1) | Baca |
| `jumlah_item_asal` | Jumlah item asal | Tidak disentuh khusus |
| `outlet` | Cabang Waschen | Baca / filter / WA mapping |
| `updated_by` | Siapa terakhir update | Update saat tracking/hold/clear |
| `updated_at` | Waktu update terakhir | Update otomatis |

### 5.2 Customer

| Kolom | Arti | Pemakaian app |
|---|---|---|
| `customer_nama` | Nama pelanggan | Baca; filter exclude dummy/test/…; WA |
| `customer_telepon` | No. WA/HP | Baca; notifikasi pengantaran |
| `alamat_customer` | Alamat | Baca (tracking detail) |

### 5.3 Waktu & status pipeline

| Kolom | Arti | Pemakaian app |
|---|---|---|
| `tgl_terima` | Tanggal terima | Baca; filter periode; available-periods |
| `tgl_selesai` | Tanggal selesai | Baca; filter alternatif |
| `status` | Enum tahap produksi | Update tiap stage; filter list |
| `progress_pengerjaan` | Teks progress (schema) | Tidak disentuh khusus di controller |

**Penting:** “Tertunda” di UI **bukan** nilai `status` enum. Tertunda = `on_hold = true` (atau status teks Tertunda di filter).

### 5.4 Finansial & meta nota/item

| Kolom | Arti | Pemakaian app |
|---|---|---|
| `subtotal` | Subtotal | Baca |
| `tambahan_express` | Biaya express | Baca |
| `diskon` | Diskon | Baca |
| `pajak` | Pajak | Baca |
| `biaya_service` | Biaya service | Baca |
| `total_tagihan` | Total tagihan | Baca; template WA (lunas/belum) |
| `jenis` | Jenis | Baca |
| `pembayaran` | Status bayar (mis. Lunas) | Baca; cabang teks WA |
| `pengambilan` | Info pengambilan | Baca |
| `tgl_pengambilan` | Tanggal ambil | Baca |
| `pembuat_nota` | Pembuat nota | Baca |
| `keterangan_nota` | Keterangan nota | Baca |
| `jenis_layanan` | Jenis layanan | Baca |
| `nama_item` | Nama item/layanan | Baca; filter `%cleanox%` / `%karpet%` |
| `jumlah` | Qty | Baca |
| `satuan_item` | Satuan | Baca |
| `total` | Total baris item | Baca |
| `keterangan` | Keterangan item | Baca |

App produksi **tidak menghitung ulang** kolom finansial; hanya membaca untuk tampilan/WA.

### 5.5 Stage Pickup

| Kolom | Arti | Pemakaian app |
|---|---|---|
| `pickup_by` | JSON array nama petugas | Update saat stage Pickup |
| `pickup_at` | Waktu pickup | Update |
| `pickup_evidance_file` | Nama file bukti | Update via evidence |
| `pickup_evidance_path` | Path/URL relatif bukti | Update via evidence |

### 5.6 Stage Cuci Jemur + hold

| Kolom | Arti | Pemakaian app |
|---|---|---|
| `cuci_jemur_by` | JSON nama petugas | Update saat stage Cuci Jemur |
| `cuci_jemur_at` | Waktu cuci jemur | Update |
| `cuci_jemur_deadline_at` | Deadline = timestamp stage + **10 hari** | Update otomatis saat stage Cuci Jemur; clear jika clear stage |
| `cuci_jemur_file` / `cuci_jemur_path` | Evidence | Update via evidence |
| `on_hold` | Flag tertunda | Update on-hold / clear / decide / update stage |
| `isContinue` | `true` lanjut / `false` batal / null | Update decide / reset on-hold / clear |
| `continue_by` | Siapa yang memutuskan | Update decide |
| `catatan_cuci_jemur` | Catatan keputusan | Update decide |

### 5.7 Stage Packing

| Kolom | Arti | Pemakaian app |
|---|---|---|
| `packing_by` | JSON nama petugas | Update stage Packing |
| `packing_at` | Waktu packing | Update |
| `packing_evidance_file` / `packing_evidance_path` | Evidence | Update via evidence |

### 5.8 Stage Pengantaran

| Kolom | Arti | Pemakaian app |
|---|---|---|
| `pengantaran_by` | JSON nama petugas | Update stage Pengantaran |
| `pengantaran_at` | Waktu pengantaran | Update; trigger logika notifikasi WA |
| `pengantaran_file` / `pengantaran_path` | Evidence | Update via evidence |

### 5.9 Catatan Cleanox

| Kolom | Arti | Pemakaian app |
|---|---|---|
| `catatan_by_cleanox` | Catatan internal Cleanox | Update / clear via `PATCH /catatan` |

---

## 6. Flow Produksi End-to-End (Kolom yang Berubah)

```
[Baris item sudah ada di tabel]
        │
        ▼
┌───────────────┐
│    Pickup     │  status, pickup_by, pickup_at, on_hold=0
│ + evidence    │  pickup_evidance_*
└───────┬───────┘
        ▼
┌───────────────┐
│  Cuci Jemur   │  status, cuci_jemur_by/at, cuci_jemur_deadline_at (+10 hari)
│ + evidence    │  cuci_jemur_*
└───────┬───────┘
        │
        ├──── on_hold ──► (lihat section 7)
        │
        ▼
┌───────────────┐
│    Packing    │  status, packing_by, packing_at
│ + evidence    │  packing_evidance_*
└───────┬───────┘
        ▼
┌───────────────┐
│  Pengantaran  │  status, pengantaran_by, pengantaran_at
│ + evidence    │  pengantaran_*
└───────────────┘
```

### API yang menggerakkan flow

| Stage | Endpoint | Kolom utama yang di-set |
|---|---|---|
| Semua stage | `POST /api/cleanox-by-waschen-production/tracking` | `*_by`, `*_at`, `status`, `on_hold=0`, `updated_by`/`updated_at`; jika Cuci Jemur → `cuci_jemur_deadline_at` |
| Clear stage (cascade) | `DELETE .../tracking` | Null-kan stage tersebut **dan stage setelahnya**; `status` mundur ke stage sebelumnya |
| List | `GET .../` | SELECT kolom tracking + filter |
| Detail | `GET .../tracking?id=` | SELECT lengkap termasuk evidence & hold |

### Filter list (factual dari kode)

Hanya baris yang:

- `nama_item` mengandung `cleanox` **atau** `karpet`
- `customer_nama` / `nama_item` **tidak** mengandung: `dummy`, `test`, `haji`, `tni`

Plus filter tanggal (`tgl_terima` atau `tgl_selesai`), outlet, search, status/`on_hold`, pagination.

### Setelah update tracking

Sistem broadcast SSE ke client yang subscribe `GET .../events` agar list realtime ikut berubah.

### Blokir produksi

Jika role user `produksi`/`cleanox` **dan** `isContinue = false` (dibatalkan frontliner), update tracking ditolak.

---

## 7. Flow On-Hold & Keputusan Frontliner

```
Produksi / Management
        │
        │  PATCH /on-hold
        ▼
  on_hold = true
  isContinue = NULL
  continue_by = NULL
  catatan_cuci_jemur = NULL
        │
        │  UI filter "Tertunda"
        │  + WA group (side effect)
        ▼
Frontliner / Management
        │
        │  PATCH /cuci-jemur/decision
        │     decision = lanjut | batal
        ▼
  on_hold = false
  status = 'Cuci Jemur'
  isContinue = true (lanjut) / false (batal)
  continue_by = nama user
  catatan_cuci_jemur = opsional
```

| Kondisi data | Arti di sistem |
|---|---|
| `on_hold = true` | Item tertunda; muncul di filter Tertunda |
| `isContinue = true` | Boleh dilanjutkan produksi |
| `isContinue = false` | Dibatalkan; produksi tidak boleh update stage |
| `isContinue = null` + tidak hold | Belum ada keputusan hold |

Clear tracking stage Pickup/Cuci Jemur (management) juga mereset `on_hold`, `isContinue`, `continue_by`, `catatan_cuci_jemur`.

---

## 8. Flow Evidence (File + Kolom DB)

Evidence **bukan tabel terpisah**. Metadata file disimpan di kolom baris transaksi; file fisik di disk.

```
POST /api/evidance/upload  (id, stage, file)
  → compress image (jika image)
  → simpan ke {UPLOAD_BASE_DIR}/evidance/
  → UPDATE kolom file + path di tr_rekap_...
```

| Stage body | Kolom file | Kolom path |
|---|---|---|
| `pickup` | `pickup_evidance_file` | `pickup_evidance_path` |
| `cuci_jemur` | `cuci_jemur_file` | `cuci_jemur_path` |
| `packing` | `packing_evidance_file` | `packing_evidance_path` |
| `pengantaran` | `pengantaran_file` | `pengantaran_path` |

| Endpoint | Efek data |
|---|---|
| `POST /api/evidance/upload` | UPDATE file/path |
| `DELETE /api/evidance/delete` | Hapus file disk + NULL-kan kolom |
| `GET /api/evidance/file/:filename` | Serve file (tidak ubah DB) |

Env storage: `UPLOAD_BASE_DIR` (fallback `src/assets`).

---

## 9. Flow Role & Akses (`mst_role` + cross-DB)

### Data di cleanox: `mst_role`

| Kolom | Arti |
|---|---|
| `employee_id` | Unique; menyamai `users.id` di DB waschen |
| `role` | Enum: `produksi` \| `frontliner` |
| `created_at` / `updated_at` | Audit |

### Flow login (lintas DB)

```
username/password
  → waschen.users (validasi)
  → waschen.mst_employee → isManagement?
  → cleanox.mst_role → role app
  → JWT
```

Register (app): insert `mst_role` dengan role default **`frontliner`**.

### Daftar petugas di modal tracking

```
cleanox.mst_role WHERE role IN ('produksi', 'cleanox')
  → ambil nama dari waschen.users
  → exclude nama 'Tim Produksi Cleanox'
```

### Matriks izin vs data (factual kode)

| Aksi | Syarat di kode |
|---|---|
| Lihat list / update stage | Login; update diblok jika produksi + `isContinue=false` |
| On-hold | `role === 'produksi'` atau `isManagement` |
| Keputusan lanjut/batal | `role === 'frontliner'` atau `isManagement` |
| Clear progres / hapus item / notif manual | `isManagement` |

`isManagement` **bukan** kolom di cleanox; berasal dari `mst_employee` (waschen): `company_id = 1` dan `exit_date IS NULL`.

---

## 10. Flow Target Dashboard (`mst_target_cleanox`)

### Bentuk data

Satu baris = target satu outlet untuk satu bulan di satu tahun.

| Kolom | Arti |
|---|---|
| `outlet` | Nama cabang; boleh null/kosong (target global) |
| `tahun`, `bulan` | Periode |
| `nominal` | Angka target |
| Unique | `(outlet, tahun, bulan)` |

### Flow di sistem

```
Dashboard pilih periode (+ optional outlets)
  → SUM(nominal) dari mst_target_cleanox
       WHERE (tahun*100+bulan) dalam rentang
       [+ filter outlet jika dipilih]
  → bandingkan dengan realisasi
       (realisasi dihitung dari DB smartlink / cleanox_smartlink,
        bukan dari tabel transaksi cleanox di atas)
```

Fungsi tabel ini di app: **penyedia angka target**, bukan penyedia progress produksi.

---

## 11. Tabel Master Belum Dipakai App

### Relasi di schema

```
mst_category (id, name)
      │
      │ 1:N category_id
      ▼
mst_services (name, price, satuan_*, duration_*, status, ...)
```

### Fakta pemakaian

- Tidak ada controller di app yang `SELECT`/`INSERT` ke kedua tabel ini.
- Tidak ada FK dari `tr_rekap_transaksi_reguler_waschen` ke `mst_services`.
- Item di transaksi memakai teks **`nama_item`**, bukan ID service.
- File `api/controllers/CleanoxOnly.controller.js` ada tetapi kosong.

Artinya: master layanan **tersimpan di DB cleanox**, tetapi **belum menjadi bagian flow** Status Produksi / Dashboard yang berjalan saat ini.

---

## 12. Matriks Aksi Sistem → Tabel → Kolom

| Aksi | Endpoint | Tabel | Kolom / efek utama | Operasi |
|---|---|---|---|---|
| Register role | `POST /api/auth/register` | `mst_role` | `employee_id`, `role=frontliner` | INSERT |
| Login / me role | `POST/GET /api/auth/*` | `mst_role` | `role` | SELECT |
| List periode | `GET .../available-periods` | `tr_rekap_...` | `tgl_terima` | SELECT |
| List outlet | `GET .../outlets` | `tr_rekap_...` | `outlet` | SELECT |
| List petugas | `GET .../employees` | `mst_role` (+ users waschen) | `employee_id`, `role` | SELECT |
| List produksi | `GET .../` | `tr_rekap_...` | banyak kolom tracking | SELECT |
| Detail tracking | `GET .../tracking` | `tr_rekap_...` | full row + evidence | SELECT |
| Update stage | `POST .../tracking` | `tr_rekap_...` | stage `*_by`/`*_at`, `status`, hold clear, deadline | UPDATE |
| Clear stage | `DELETE .../tracking` | `tr_rekap_...` | cascade null stage, `status` mundur | UPDATE |
| Catatan | `PATCH .../catatan` | `tr_rekap_...` | `catatan_by_cleanox` | UPDATE |
| On-hold | `PATCH .../on-hold` | `tr_rekap_...` | `on_hold`, reset keputusan | UPDATE |
| Keputusan CJ | `PATCH .../cuci-jemur/decision` | `tr_rekap_...` | `isContinue`, `continue_by`, catatan, `status` | UPDATE |
| Hapus item/nota | `DELETE .../item` | `tr_rekap_...` | baris item | DELETE |
| Hitung item nota | `GET .../nota-item-count` | `tr_rekap_...` | `no_nota` | SELECT |
| Notif customer | `POST .../notify-customer` | `tr_rekap_...` | baca customer/item | SELECT (+ WA) |
| Upload evidence | `POST /api/evidance/upload` | `tr_rekap_...` | `*_file`, `*_path` | UPDATE |
| Hapus evidence | `DELETE /api/evidance/delete` | `tr_rekap_...` | null-kan file/path | UPDATE |
| Target dashboard | `GET /api/dashboard-cleanox/data` | `mst_target_cleanox` | `nominal`, outlet, tahun, bulan | SELECT |

---

## 13. Enum & Constraint yang Mempengaruhi Flow

### Status produksi (enum DB)

Hanya empat nilai: `Pickup` → `Cuci Jemur` → `Packing` → `Pengantaran`.

Clear stage memundurkan `status` ke tahap sebelum yang di-clear (atau `null` jika clear Pickup).

### Role (enum DB)

Hanya `produksi` dan `frontliner`.

Observasi kode: filter employees juga menyebut string `'cleanox'`; register menulis `'frontliner'`. Enum Prisma hasil pull **tidak** berisi `cleanox` / `admin`.

### Unique & hold

- Unique item mencegah duplikasi kombinasi nota+item.
- Index `on_hold` mendukung filter Tertunda tanpa mengubah enum status.

---

## 14. Catatan Factual (kode vs schema)

| Topik | Fakta |
|---|---|
| Scheduler WA pengantaran | Fungsi `runPengantaranNotificationScheduler` di controller memakai kolom `notifikasi_pengantaran_sent_at` |
| Kolom itu di Prisma | **Tidak ada** di `schema.prisma` hasil pull saat ini |
| Wiring scheduler | Fungsi **tidak** di-import/dipanggil dari `server.js` |
| INSERT transaksi baru | Tidak ada di modul produksi app ini; app membaca & meng-update baris existing |
| Docs terkait | Ringkas multi-DB: `docs/bisnis-proses-dan-database.md` |

---

## Ringkasan satu halaman

| Data Cleanox | Fungsi terhadap sistem |
|---|---|
| `tr_rekap_transaksi_reguler_waschen` | **Papan kerja produksi**: setiap item punya status, petugas, waktu, evidence, hold |
| `mst_role` | **Pintu akses** role Cleanox (produksi / frontliner) |
| `mst_target_cleanox` | **Angka target** untuk banding dashboard |
| `mst_category` / `mst_services` | Master layanan di DB; **belum** masuk flow app |

Flow utama yang mengubah data operasional:

**Pickup → Cuci Jemur (opsional Hold → keputusan) → Packing → Pengantaran**, semua pada **baris item** yang sama.
