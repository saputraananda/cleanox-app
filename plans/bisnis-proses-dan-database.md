# Plan: Dokumentasi Bisnis Proses & Database (Scope: Kode Existing Only)

## Context

- User meminta penjelasan bisnis proses dan sambungan database dalam bentuk Markdown.
- Scope ketat: **hanya** yang benar-benar ada di repo `cleanox-app` (route, controller, pool, halaman, env keys yang dipakai kode).
- Tidak mengikutsertakan spekulasi sumber data eksternal, ETL, atau fitur yang belum di-wire (kecuali dicatat sebagai “ada di kode tapi tidak dipanggil” jika relevan untuk akurasi deskripsi).
- Mode sebelumnya (RESEARCH) sudah memetakan modul; plan ini mendefinisikan **dokumen deliverable** yang akan dibuat saat EXECUTE.

## Goal

- Menghasilkan satu file Markdown dokumentasi internal yang menjelaskan:
  1. Modul/fitur yang ada di aplikasi ini
  2. Alur bisnis proses per modul (berdasarkan endpoint & UI yang ada)
  3. Mapping koneksi pool database → tabel → operasi yang dilakukan kode
- Dokumen hanya mengacu file/kode yang ada di workspace.

## Detailed Specifications

### Deliverable

- **File baru:** `docs/bisnis-proses-dan-database.md`
- **Tidak mengubah** kode aplikasi, env, atau README kecuali user meminta terpisah.

### Batasan scope (wajib)

**Masuk dokumen:**
- Empat pool di `api/db/cleanox.js` + env key yang dibaca
- Modul Auth (`api/controllers/auth.controller.js`, `api/routes/auth.routes.js`)
- Modul Status Produksi (`cleanoxByWaschenProduction.*`)
- Modul Evidence (`evidance.*`)
- Modul Dashboard Cleanox (`DashboardCleanox.*`)
- Routing frontend di `src/App.jsx` + menu `Sidebar.jsx` / kartu `DashboardPage.jsx`
- Integrasi WA yang **dipanggil dari kode** (on-hold, notif customer, manual notify)
- Role/akses yang dicek di middleware & controller

**Tidak masuk dokumen:**
- Asumsi bagaimana baris transaksi pertama kali ter-INSERT ke DB
- Perbandingan/koreksi README vs kode sebagai “issue” (boleh satu baris factual mapping DB name dari `env` saja)
- Fitur Coming soon (`/cleanox`) selain menyebut halaman placeholder ada
- Rekomendasi perbaikan, refactor, atau saran teknis

### Struktur isi dokumen (exact sections)

```md
# Bisnis Proses & Database — Cleanox App

## 1. Ringkasan Aplikasi
## 2. Connection Pool & Database
## 3. Modul Autentikasi
## 4. Modul Status Produksi (Cleanox By Waschen)
## 5. Modul Evidence
## 6. Modul Dashboard Cleanox
## 7. Halaman Frontend & Role Akses
## 8. Integrasi WhatsApp (yang dipakai kode)
## 9. Matriks Endpoint → Pool → Tabel
```

### Isi per section (spesifikasi konten)

#### 1. Ringkasan Aplikasi
- Nama/tujuan singkat dari README + stack dari `package.json` / `server.js`
- Daftar route API yang di-mount di `server.js` saja

#### 2. Connection Pool & Database
- Tabel 4 pool: nama export, env vars, database name dari pola env (`DB_NAME`, `DB_NAME_CLEANOX`, `DB_NAME_SMARTLINK`, `DB_NAME_CLEANOX_SMARTLINK`)
- Tidak menulis password di dokumen

#### 3. Modul Autentikasi
- Flow register / login / me / logout sesuai controller
- Tabel: `users`, `mst_employee` (`aloraPool`), `mst_role` (`cleanoxPool`)
- Field role & flag `isManagement` sesuai query yang ada

#### 4. Modul Status Produksi
- Tabel: `tr_rekap_transaksi_reguler_waschen` (`cleanoxPool`)
- Filter item: nama mengandung cleanox/karpet; exclude dummy/test/haji/tni
- Pipeline status: Pickup → Cuci Jemur → Packing → Pengantaran; Tertunda via `on_hold`
- Aksi: list, tracking get/update, clear (management), catatan, on-hold, decide lanjut/batal, delete item/nota, SSE events, notify manual, available-periods, outlets, employees
- Cross-pool employees: `mst_role` (`cleanoxPool`) + `users` (`aloraPool`)
- Catatan factual: fungsi `runPengantaranNotificationScheduler` ada di controller; tidak di-import/dipanggil dari `server.js`

#### 5. Modul Evidence
- Stage → kolom DB mapping dari `evidance.controller.js`
- Storage path dari `UPLOAD_BASE_DIR`

#### 6. Modul Dashboard Cleanox
- Guard role: admin, produksi, isManagement
- Query periods/outlets dari `smartlinkPool`
- KPI performance/detail/daily dari `smartlinkPool`
- Cleanox Only breakdown/detail dari `cleanoxSmartlinkPool`
- Target dari `mst_target_cleanox` di `cleanoxPool`
- Periode bisnis 26→25 seperti di controller

#### 7. Halaman Frontend & Role Akses
- Routes di `App.jsx`
- Menu Sidebar + PrivateRoute roles
- Placeholder `/cleanox`

#### 8. Integrasi WhatsApp
- Env: `ALORA_WA_URL`, `ALORA_WA_CLEANOX_SESSION`
- Pemanggilan: on-hold group, pengantaran customer (function + manual endpoint)
- Mapping outlet hardcode yang ada di controller (nama outlet saja, tanpa perlu menuliskan semua nomor jika ingin ringkas — tulis bahwa mapping ada di controller)

#### 9. Matriks Endpoint → Pool → Tabel
- Satu tabel ringkas semua endpoint dari keempat router files

### Style penulisan
- Bahasa Indonesia
- Bullet + tabel + flow sederhana (mermaid atau bullet flow)
- Factual, tanpa rekomendasi

## Implementation Checklist

1. Buat folder `docs/` di root project jika belum ada.
2. Buat file `docs/bisnis-proses-dan-database.md` dengan section 1 (Ringkasan Aplikasi) berdasarkan `server.js`, `package.json`, README singkat.
3. Isi section 2 (Connection Pool & Database) berdasarkan `api/db/cleanox.js` + nama env keys (tanpa secret).
4. Isi section 3 (Autentikasi) berdasarkan `auth.controller.js` + `auth.routes.js`.
5. Isi section 4 (Status Produksi) berdasarkan `cleanoxByWaschenProduction.controller.js` + routes-nya, termasuk catatan scheduler tidak di-wire di `server.js`.
6. Isi section 5 (Evidence) berdasarkan `evidance.controller.js` + routes.
7. Isi section 6 (Dashboard) berdasarkan `DashboardCleanox.controller.js` + routes.
8. Isi section 7 (Frontend & Role) berdasarkan `App.jsx`, `Sidebar.jsx`, guard di Dashboard.
9. Isi section 8 (WhatsApp) hanya pemanggilan yang ada di production controller.
10. Isi section 9 (Matriks Endpoint → Pool → Tabel) lengkap dari keempat file routes.
11. Review dokumen: pastikan tidak ada spekulasi di luar kode; hapus jika ada.

## Risks / Catatan

- Dokumen sengaja **sempit**: hanya mirror perilaku kode existing.
- Kredensial di file `env` **tidak** boleh ikut ke dokumen.
- Placeholder `/cleanox` hanya disebut sebagai halaman kosong, tanpa inventaris fitur masa depan.
`)