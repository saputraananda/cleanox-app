# Plan: Dokumentasi Flow & Data DB Cleanox (Full)

## Context

- User sudah punya `docs/bisnis-proses-dan-database.md` (ringkasan modul app + multi-DB).
- Prisma `db pull` sudah menghasilkan `prisma/schema.prisma` untuk DB **cleanox**.
- User ingin **MD baru** yang lebih lengkap, fokus ke: **flow data di DB cleanox** dan **bagaimana sistem memakai data itu** (fungsi tiap bagian).
- Scope: factual dari `prisma/schema.prisma` + controller/routes yang memakai `cleanoxPool`. Cross-DB (`waschen` / smartlink) hanya disebut sejauh dibutuhkan untuk memahami flow (login, dashboard target).

## Goal

- Membuat file Markdown baru yang menjelaskan secara penuh:
  1. Inventaris tabel DB cleanox (dari Prisma)
  2. Bentuk data (terutama 1 baris = 1 item)
  3. Flow bisnis end-to-end yang mengubah kolom mana
  4. Mapping aksi sistem → kolom / tabel
  5. Tabel yang ada di DB tapi belum dipakai app
- File lama `docs/bisnis-proses-dan-database.md` **tidak diganti**; MD baru berdiri sendiri.

## Detailed Specifications

### Deliverable

- **File baru:** `docs/flow-data-db-cleanox.md`
- **Sumber utama:** `prisma/schema.prisma`, `api/controllers/cleanoxByWaschenProduction.controller.js`, `evidance.controller.js`, `auth.controller.js` (bagian `mst_role`), `DashboardCleanox.controller.js` (bagian `mst_target_cleanox`)
- Bahasa Indonesia, factual, tanpa rekomendasi implementasi / spekulasi sumber INSERT transaksi.

### Struktur dokumen (exact sections)

```md
# Flow & Data — Database Cleanox

## 1. Tujuan Dokumen
## 2. Posisi DB Cleanox dalam Sistem
## 3. Inventaris Tabel (dari Prisma)
## 4. Model Data Transaksi (1 Nota → Banyak Item)
## 5. Kamus Kolom: tr_rekap_transaksi_reguler_waschen
## 6. Flow Produksi End-to-End (Kolom yang Berubah)
## 7. Flow On-Hold & Keputusan Frontliner
## 8. Flow Evidence (File + Kolom DB)
## 9. Flow Role & Akses (mst_role + cross-DB)
## 10. Flow Target Dashboard (mst_target_cleanox)
## 11. Tabel Master Belum Dipakai App (mst_category, mst_services)
## 12. Matriks Aksi Sistem → Tabel → Kolom
## 13. Enum & Constraint yang Mempengaruhi Flow
## 14. Catatan Factual (kode vs schema)
```

### Isi per section

#### 1. Tujuan Dokumen
- Menjelaskan flow + makna data DB cleanox terhadap fitur app
- Sumber: Prisma pull + kode yang memakai `cleanoxPool`
- Bukan pengganti docs multi-DB sebelumnya; saling melengkapi

#### 2. Posisi DB Cleanox dalam Sistem
- Diagram: waschen (users/employee) ↔ cleanox (role, transaksi, target) ↔ smartlink (KPI realisasi, disebut singkat)
- Pool: `cleanoxPool` / env `DB_*_CLEANOX`
- Modul app yang menyentuh cleanox: auth (role), produksi, evidence, dashboard (target saja)

#### 3. Inventaris Tabel
- Tabel 5 model dari schema: nama, fungsi bisnis singkat, dipakai app? (ya/tidak)
- Enum list: `mst_role_role`, status transaksi, `duration_unit`

#### 4. Model Data Transaksi
- 1 baris = 1 item; banyak baris bisa share `no_nota`
- Unique key: `(no_nota, nama_item, jumlah, total, item_ke)`
- Index penting dan manfaatnya untuk filter list
- Contoh mental: nota A punya 2 item → 2 baris, progress bisa beda per item

#### 5. Kamus Kolom
- Kelompokkan kolom `tr_rekap_transaksi_reguler_waschen`:
  - Identitas & outlet
  - Customer
  - Finansial nota/item
  - Meta nota (pembuat, jenis layanan, keterangan)
  - Pipeline stage (pickup / cuci jemur / packing / pengantaran)
  - Hold & keputusan
  - Catatan Cleanox
- Tiap kolom: arti singkat + apakah di-update oleh app ini (Ya / Baca saja / Tidak disentuh kode)

#### 6. Flow Produksi End-to-End
- Diagram flow status enum
- Per stage: trigger API, kolom yang di-set, evidence terkait
- Deadline Cuci Jemur = +10 hari dari timestamp stage
- Filter list (cleanox/karpet, exclude dummy/test/haji/tni) — factual dari kode
- SSE broadcast setelah update (tanpa detail implementasi berlebih)

#### 7. Flow On-Hold
- Siapa boleh on-hold / decide
- Kolom: `on_hold`, `isContinue`, `continue_by`, `catatan_cuci_jemur`
- UI “Tertunda” = `on_hold`, bukan enum status
- Dampak: produksi diblok jika `isContinue = false`
- WA on-hold (disebut sebagai side effect, tanpa spekulasi)

#### 8. Flow Evidence
- Mapping stage → kolom file/path
- Storage filesystem `UPLOAD_BASE_DIR/evidance`
- Upload / delete / serve endpoint

#### 9. Flow Role
- `mst_role`: employee_id, enum produksi|frontliner
- Cross-read `users` / `mst_employee` di waschen untuk nama & isManagement
- Tabel izin singkat per aksi produksi
- Catatan factual: kode employees juga filter string `'cleanox'`; enum Prisma hanya `produksi`|`frontliner`

#### 10. Flow Target Dashboard
- Baca `mst_target_cleanox` (sum/filter outlet+periode)
- Realisasi KPI dari pool lain — satu paragraf saja agar jelas target vs actual

#### 11. Master belum dipakai
- Struktur `mst_category` → `mst_services`
- Tidak ada FK ke transaksi; item pakai `nama_item` teks
- `CleanoxOnly.controller.js` kosong — factual

#### 12. Matriks Aksi → Tabel → Kolom
- Tabel lengkap: aksi UI/API | endpoint | tabel | kolom utama | operasi (SELECT/UPDATE/DELETE)

#### 13. Enum & Constraint
- Status 4 nilai
- Role 2 nilai
- Unique & index yang membatasi/membantu flow

#### 14. Catatan Factual
- `notifikasi_pengantaran_sent_at` dipakai di kode scheduler, tidak ada di schema Prisma hasil pull
- Scheduler tidak di-wire di `server.js`
- Tidak spekulasi sumber INSERT baris transaksi

### Style
- Bullet, tabel, diagram ASCII/mermaid
- Bahasa Indonesia
- Tidak menulis password / credential

## Implementation Checklist

1. Buat file baru `docs/flow-data-db-cleanox.md` dengan section 1–2 (tujuan + posisi DB).
2. Isi section 3 (inventaris 5 tabel + enum dari `prisma/schema.prisma`).
3. Isi section 4 (model 1 nota → banyak item + unique/index).
4. Isi section 5 (kamus kolom lengkap `tr_rekap_transaksi_reguler_waschen`, tandai baca vs update).
5. Isi section 6 (flow produksi end-to-end per stage + filter list).
6. Isi section 7 (on-hold & keputusan frontliner).
7. Isi section 8 (evidence mapping + storage).
8. Isi section 9 (mst_role + cross-DB auth + matriks izin).
9. Isi section 10 (mst_target_cleanox + hubungan singkat ke dashboard).
10. Isi section 11 (mst_category / mst_services belum dipakai).
11. Isi section 12 (matriks aksi sistem → tabel → kolom).
12. Isi section 13–14 (enum/constraint + catatan factual kode vs schema).
13. Review: pastikan tidak mengubah `docs/bisnis-proses-dan-database.md`; tidak ada spekulasi ETL; tidak ada secret.

## Risks / Catatan

- Dokumen ini lebih panjang dan berorientasi **data/flow Cleanox**, bukan katalog semua API multi-DB.
- Perbedaan enum role di Prisma vs string di kode harus dicatat sebagai observasi, bukan “bug fix”.
- Jangan mengisi penjelasan seolah `mst_services` sudah terhubung ke transaksi — di schema tidak ada FK.
