# Bisnis Proses & Database — Cleanox App

Dokumentasi ini hanya menjelaskan apa yang ada di codebase `cleanox-app`.

---

## 1. Ringkasan Aplikasi

Aplikasi web internal **Cleanox** (PT Waschen Alora Indonesia) untuk manajemen dan pelaporan transaksi laundry Cleanox. Arsitektur monolith: React + Vite (frontend) dan Express.js (backend).

| Layer | Teknologi |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Lucide, Recharts |
| Backend | Express.js (ESM), mysql2, bcryptjs, jsonwebtoken, multer, sharp |
| Auth | JWT (`SESSION_SECRET`), Bearer token |

**API yang di-mount di `server.js`:**

| Prefix | Modul |
|---|---|
| `/api/auth` | Autentikasi |
| `/api/cleanox-by-waschen-production` | Status Produksi |
| `/api/evidance` | Upload / hapus evidence |
| `/api/dashboard-cleanox` | Dashboard KPI |

Port default backend: `6000` (`PORT`).

---

## 2. Connection Pool & Database

Semua pool ada di `api/db/cleanox.js`.

| Export pool | Env host/port/user/pass | Env nama DB | Dipakai modul |
|---|---|---|---|
| `aloraPool` | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS` | `DB_NAME` | Auth (`users`, `mst_employee`); daftar karyawan produksi |
| `cleanoxPool` (default export) | `DB_HOST_CLEANOX`, `DB_PORT_CLEANOX`, `DB_USER_CLEANOX`, `DB_PASS_CLEANOX` | `DB_NAME_CLEANOX` | Auth role; Status Produksi; Evidence; target dashboard |
| `smartlinkPool` | `DB_HOST_SMARTLINK`, `DB_PORT_SMARTLINK`, `DB_USER_SMARTLINK`, `DB_PASS_SMARTLINK` | `DB_NAME_SMARTLINK` | Dashboard (KPI Waschen / Cleanox by Waschen) |
| `cleanoxSmartlinkPool` | `DB_HOST_CLEANOX_SMARTLINK`, `DB_PORT_CLEANOX_SMARTLINK`, `DB_USER_CLEANOX_SMARTLINK`, `DB_PASS_CLEANOX_SMARTLINK` | `DB_NAME_CLEANOX_SMARTLINK` | Dashboard (Cleanox Only) |

Konfigurasi bersama tiap pool: `connectionLimit: 10`, `timezone: '+07:00'`, `ssl: { rejectUnauthorized: false }`.

```
server.js
  ├── /api/auth              → aloraPool + cleanoxPool
  ├── /api/cleanox-by-waschen-production → cleanoxPool (+ aloraPool untuk employees)
  ├── /api/evidance          → cleanoxPool + filesystem
  └── /api/dashboard-cleanox → smartlinkPool + cleanoxSmartlinkPool + cleanoxPool
```

---

## 3. Modul Autentikasi

**File:** `api/routes/auth.routes.js`, `api/controllers/auth.controller.js`  
**Middleware:** `api/middleware/auth.middleware.js` (JWT Bearer)

### Endpoint

| Method | Path | Auth | Handler |
|---|---|---|---|
| `POST` | `/api/auth/register` | Tidak | `register` |
| `POST` | `/api/auth/login` | Tidak | `login` |
| `POST` | `/api/auth/logout` | Ya | `logout` |
| `GET` | `/api/auth/me` | Ya | `getMe` |

### Alur Register

```
name, email, username, phone, password
  → aloraPool: cek email di users
  → aloraPool: INSERT users (password_hash bcrypt salt 12)
  → aloraPool: INSERT mst_employee (employee_id = user.id, employee_code EMP-XXXX)
  → cleanoxPool: INSERT mst_role (employee_id, role = 'frontliner') ON DUPLICATE KEY UPDATE
  → commit transaksi di aloraPool
```

### Alur Login / Me

```
username + password
  → aloraPool: SELECT users
  → bcrypt.compare
  → aloraPool: mst_employee → isManagement = (company_id = 1 AND exit_date IS NULL)
  → cleanoxPool: mst_role → role aplikasi
  → JWT sign (SESSION_SECRET, expiresIn 7d) berisi id, email, role, name, username, isManagement
```

### Tabel

| Pool | Tabel | Operasi |
|---|---|---|
| `aloraPool` | `users` | SELECT, INSERT |
| `aloraPool` | `mst_employee` | SELECT, INSERT |
| `cleanoxPool` | `mst_role` | SELECT, INSERT … ON DUPLICATE KEY UPDATE |

Logout hanya mengembalikan pesan sukses (tidak menghapus token di server).

---

## 4. Modul Status Produksi (Cleanox By Waschen)

**File:** `api/routes/cleanoxByWaschenProduction.routes.js`, `api/controllers/cleanoxByWaschenProduction.controller.js`  
**Tabel utama:** `tr_rekap_transaksi_reguler_waschen` via `cleanoxPool`  
**Unit data:** per baris item (bukan per nota).

### Filter data list (`getData`)

- Item: `nama_item` mengandung `cleanox` atau `karpet`
- Exclude: customer/item mengandung `dummy`, `test`, `haji`, `tni`
- Filter query: `date_start`/`date_end`, `outlet`, `search`, `status`, pagination, sort

### Pipeline status

```
Pickup → Cuci Jemur → Packing → Pengantaran
              │
              └─ on_hold = 1 → tampilan Tertunda
                    └─ Frontliner: lanjut (isContinue=1) / batal (isContinue=0)
```

Kolom per stage:

| Stage | `*_by` | `*_at` | Catatan |
|---|---|---|---|
| Pickup | `pickup_by` (JSON array nama) | `pickup_at` | — |
| Cuci Jemur | `cuci_jemur_by` | `cuci_jemur_at` | + `cuci_jemur_deadline_at` = timestamp + 10 hari |
| Packing | `packing_by` | `packing_at` | — |
| Pengantaran | `pengantaran_by` | `pengantaran_at` | — |

### Aksi bisnis (yang diimplementasikan)

| Aksi | Siapa (dicek di kode) | Perilaku singkat |
|---|---|---|
| List / period / outlets | User terautentikasi | Baca dari `tr_rekap_transaksi_reguler_waschen` |
| Employees | User terautentikasi | `mst_role` role `produksi`/`cleanox` → nama dari `users` (`aloraPool`) |
| Get / update tracking | Update: semua auth; produksi diblok jika `isContinue = 0` | Set stage, clear `on_hold`, broadcast SSE |
| Clear tracking | `isManagement` | Cascade clear stage + stage setelahnya |
| Update catatan | Auth | `catatan_by_cleanox` |
| On-hold | `produksi` atau `isManagement` | `on_hold = 1` + WA group |
| Keputusan cuci jemur | `frontliner` atau `isManagement` | `lanjut` / `batal` |
| Delete item / nota | `isManagement` | Hapus 1 item atau semua item cleanox/karpet satu `no_nota` |
| Notify customer manual | `isManagement` | WA ke `customer_telepon` |
| SSE `/events` | Token via query `token` | Realtime broadcast update |

### Periode bisnis (`getAvailablePeriods`)

- Periode dihitung dari `tgl_terima`: hari ≥ 26 masuk periode bulan berikutnya
- Sumber: `tr_rekap_transaksi_reguler_waschen` (`cleanoxPool`)

### Scheduler notifikasi pengantaran

- Fungsi `runPengantaranNotificationScheduler` ada di controller
- **Tidak** di-import / dipanggil dari `server.js`
- Logic di fungsi: cari item dengan `pengantaran_at` + delay sudah lewat, belum `notifikasi_pengantaran_sent_at`, lalu kirim WA per `no_nota`

---

## 5. Modul Evidence

**File:** `api/routes/evidance.routes.js`, `api/controllers/evidance.controller.js`  
**Pool:** `cleanoxPool`  
**Tabel:** `tr_rekap_transaksi_reguler_waschen`

### Storage

- Basis: `UPLOAD_BASE_DIR` (env), fallback `src/assets`
- Folder file: `{UPLOAD_BASE_DIR}/evidance`
- Serve: `GET /api/evidance/file/:filename`

### Mapping stage → kolom DB

| Stage (body) | Kolom file | Kolom path |
|---|---|---|
| `pickup` | `pickup_evidance_file` | `pickup_evidance_path` |
| `cuci_jemur` | `cuci_jemur_file` | `cuci_jemur_path` |
| `packing` | `packing_evidance_file` | `packing_evidance_path` |
| `pengantaran` | `pengantaran_file` | `pengantaran_path` |

### Alur upload

```
POST /api/evidance/upload (multipart: file, id, stage)
  → validasi stage & file
  → SELECT baris transaksi
  → compress image (sharp, ≤ ~2 MB)
  → tulis file ke disk
  → UPDATE kolom file + path di tr_rekap_transaksi_reguler_waschen
```

Delete: hapus file di disk (jika ada) + set kolom file/path = NULL.

---

## 6. Modul Dashboard Cleanox

**File:** `api/routes/DashboardCleanox.routes.js`, `api/controllers/DashboardCleanox.controller.js`

### Akses

Setelah `authenticate`, middleware `authorizeDashboardAccess` mengizinkan:

- `role` ∈ `admin`, `management`, `produksi`, **atau**
- `isManagement === true`

### Endpoint

| Method | Path | Handler |
|---|---|---|
| `GET` | `/api/dashboard-cleanox/available-periods` | `getAvailablePeriods` |
| `GET` | `/api/dashboard-cleanox/data` | `getDashboardData` |

### Sumber data per pool

| Pool | Tabel / objek yang di-query | Output terkait |
|---|---|---|
| `smartlinkPool` | `rekap_transaksi_reguler` | Daftar periode (yr/mo) |
| `smartlinkPool` | `target_sales` | Daftar outlet |
| `smartlinkPool` | `rekap_transaksi_reguler_pembayaran`, `rekap_transaksi_reguler`, `rekap_pembelian_emoney`, `target_sales`, `customer` | Performance, detail nota, tren harian, summary |
| `cleanoxSmartlinkPool` | `rekap_transaksi_reguler_pembayaran`, `rekap_transaksi_reguler` | Cleanox Only: breakdown tunai/non-tunai + detail transaksi |
| `cleanoxPool` | `mst_target_cleanox` | Target nominal Cleanox |

### Filter periode (`getDashboardData`)

| `filterType` | Parameter | Rentang tanggal |
|---|---|---|
| `bulan` | `year`, `month` | 26 bulan sebelumnya → 25 bulan dipilih |
| `rentang` | `startDate`, `endDate` | Sesuai input |
| `tahun` | `year` | `YYYY-01-01` → `YYYY-12-31` |

`as_of_date`: jika hari ini (Jakarta) berada dalam rentang, pakai hari ini; jika tidak, pakai `date_end`.

Opsional: query `outlets` (comma-separated) untuk filter hasil di aplikasi.

---

## 7. Halaman Frontend & Role Akses

**Routing:** `src/App.jsx`  
**Menu:** `src/components/Sidebar.jsx`  
**Kartu beranda:** `src/pages/DashboardPage.jsx`

### Routes

| Path | Guard | Halaman |
|---|---|---|
| `/` | — | Redirect ke `/dashboard` |
| `/login` | Public (belum login) | `LoginPage` |
| `/register` | Public | `RegisterPage` |
| `/dashboard` | Private (login) | `DashboardPage` |
| `/cleanox` | Private + roles `admin` / `management` | Placeholder “Coming soon…” |
| `/cleanox-by-waschen-production` | Private (login) | `CleanoxByWaschenProductionPage` |

`PrivateRoute`: jika `roles` diberikan, cocokkan `user.role` atau `user.isManagement` ketika role list berisi `management`.

### Menu Sidebar

| Label | Path | Roles menu |
|---|---|---|
| Beranda | `/dashboard` | admin, management, produksi, frontliner |
| Cleanox | `/cleanox` | admin, management |
| Cleanox By Waschen | `/cleanox-by-waschen-production` | admin, management, produksi, frontliner |

### Dashboard UI

- Blok KPI dashboard ditampilkan jika `role === 'admin'` atau `role === 'produksi'` atau `isManagement`
- Kartu navigasi “Status Produksi” → `/cleanox-by-waschen-production`
- Kartu “Cleanox” ditandai soon → `/cleanox`

---

## 8. Integrasi WhatsApp (yang dipakai kode)

**Env yang dibaca kode:**

- `ALORA_WA_URL`
- `ALORA_WA_CLEANOX_SESSION`
- `APP_URL` / `CORS_ORIGIN` (deep link on-hold)
- `NODE_ENV` (group WA & delay notifikasi)

**Pemanggilan HTTP:** `POST {ALORA_WA_URL}/api/send-message` dengan body `{ session, to, message }`.

| Pemicu | Fungsi | Tujuan |
|---|---|---|
| On-hold | `sendOnHoldWaNotification` (dipanggil dari `requestOnHold`) | Group WA + mention PIC outlet |
| Siap diambil (otomatis) | `sendPengantaranNotificationToCustomer` via `runPengantaranNotificationScheduler` | Nomor `customer_telepon` — fungsi scheduler tidak di-wire di `server.js` |
| Siap diambil (manual) | `sendManualCustomerNotification` → `sendPengantaranNotificationToCustomer` | Nomor customer; endpoint management |

Mapping outlet (nama cabang → nomor / mention / short name / link `wa.me`) di-hardcode di `cleanoxByWaschenProduction.controller.js` (`OUTLET_NUMBER`, `OUTLET_MENTION`, `OUTLET_SHORT`, `OUTLET_WHATSAPP_LINK`).

Delay notifikasi pengantaran: 1 menit jika `NODE_ENV === 'development'`, selain itu 60 menit.

---

## 9. Matriks Endpoint → Pool → Tabel

### Auth — `/api/auth`

| Method | Endpoint | Pool | Tabel |
|---|---|---|---|
| `POST` | `/register` | `aloraPool`, `cleanoxPool` | `users`, `mst_employee`, `mst_role` |
| `POST` | `/login` | `aloraPool`, `cleanoxPool` | `users`, `mst_employee`, `mst_role` |
| `POST` | `/logout` | — | — |
| `GET` | `/me` | `aloraPool`, `cleanoxPool` | `users`, `mst_employee`, `mst_role` |

### Status Produksi — `/api/cleanox-by-waschen-production`

| Method | Endpoint | Pool | Tabel |
|---|---|---|---|
| `GET` | `/events` | — | — (SSE in-memory) |
| `GET` | `/available-periods` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` |
| `GET` | `/outlets` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` |
| `GET` | `/employees` | `cleanoxPool`, `aloraPool` | `mst_role`, `users` |
| `GET` | `/tracking` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` |
| `GET` | `/` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` |
| `POST` | `/tracking` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` |
| `DELETE` | `/tracking` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` |
| `PATCH` | `/catatan` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` |
| `PATCH` | `/on-hold` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` (+ WA gateway) |
| `PATCH` | `/cuci-jemur/decision` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` |
| `POST` | `/notify-customer` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` (+ WA gateway) |
| `DELETE` | `/item` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` |
| `GET` | `/nota-item-count` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` |

### Evidence — `/api/evidance`

| Method | Endpoint | Pool | Tabel / storage |
|---|---|---|---|
| `GET` | `/file/:filename` | — | filesystem `evidance/` |
| `POST` | `/upload` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` + filesystem |
| `DELETE` | `/delete` | `cleanoxPool` | `tr_rekap_transaksi_reguler_waschen` + filesystem |

### Dashboard — `/api/dashboard-cleanox`

| Method | Endpoint | Pool | Tabel |
|---|---|---|---|
| `GET` | `/available-periods` | `smartlinkPool` | `rekap_transaksi_reguler`, `target_sales` |
| `GET` | `/data` | `smartlinkPool`, `cleanoxSmartlinkPool`, `cleanoxPool` | `rekap_transaksi_reguler_pembayaran`, `rekap_transaksi_reguler`, `rekap_pembelian_emoney`, `target_sales`, `customer`, `mst_target_cleanox` |
