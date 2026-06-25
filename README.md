# Cleanox — PT Waschen Alora Indonesia

Aplikasi web internal untuk manajemen dan pelaporan transaksi laundry PT Waschen Alora Indonesia. Dibangun dengan arsitektur **monolith full-stack** menggunakan React + Vite di frontend dan Express.js di backend.

---

## Fitur

- **Autentikasi** — Register & Login dengan JWT, otomatis membuat entri di tabel `users` dan `mst_employee` secara atomik
- **Dashboard** — Halaman utama dengan navigasi ke modul yang tersedia
- **Status Produksi** — Manajemen produksi cleanox & karpet dengan tracking status (Pickup → Cuci Jemur → Packing → Pengantaran), notifikasi WA, on-hold, dan SSE realtime
- **Manajemen User** — CRUD user & role
- **KPI Produksi** — Metrik performa produksi
- **Responsive** — Mendukung tampilan mobile dan desktop
- **Branding Cleanox** — Warna navy & lime sesuai identitas visual PT Waschen Alora Indonesia

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | React 18, Vite 5, Tailwind CSS v3, React Router v6, Lucide React |
| Backend | Express.js (ESM), mysql2/promise, bcryptjs, jsonwebtoken |
| Database | MySQL — `cleanox_smartlink`, `waschen_smartlink` |
| Dev Tools | concurrently, nodemon |

---

## Struktur Proyek

```
cleanox-new/
├── api/
│   ├── controllers/
│   │   └── auth.controller.js
│   ├── db/
│   │   ├── cleanox.js          # Pool koneksi cleanox_smartlink
│   │   └── smartlink.js        # Pool koneksi waschen_smartlink
│   ├── middleware/
│   │   └── auth.middleware.js
│   └── routes/
│       ├── auth.routes.js
│       └── cleanoxByWaschenProduction.routes.js
├── src/
│   ├── assets/
│   │   └── cleanox.png
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── Layout.jsx
│   │   └── Sidebar.jsx
│   ├── pages/
│   │   ├── CleanoxByWaschenProductionPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── LoginPage.jsx
│   │   └── RegisterPage.jsx
│   ├── utils/
│   │   ├── api.js
│   │   └── auth.js
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── server.js
├── vite.config.js
├── tailwind.config.js
├── nodemon.json
├── .env
└── .gitignore
```

---

## Instalasi & Menjalankan

### Prasyarat

- Node.js v18+
- Akses ke database MySQL (`cleanox_smartlink` & `waschen_smartlink`)

### 1. Clone repository

```bash
git clone https://github.com/<username>/cleanox-new.git
cd cleanox-new
```

### 2. Install dependencies

```bash
npm install
```

### 3. Buat file `.env`

Buat file `.env` di root project berdasarkan template berikut:

```env
# Database - cleanox_smartlink (auth)
DB_HOST_CLEANOX=<host>
DB_PORT_CLEANOX=3306
DB_USER_CLEANOX=<user>
DB_PASS_CLEANOX=<password>
DB_NAME_CLEANOX=cleanox_smartlink

# Database - waschen_smartlink (transaksi)
DB_HOST_SMARTLINK=<host>
DB_PORT_SMARTLINK=3306
DB_USER_SMARTLINK=<user>
DB_PASS_SMARTLINK=<password>
DB_NAME_SMARTLINK=waschen_smartlink

# JWT
JWT_SECRET=<secret_key_panjang>
JWT_EXPIRES_IN=7d

# Server
PORT=3001
```

### 4. Jalankan aplikasi (development)

```bash
npm run dev
```

Perintah ini menjalankan **backend** (port `3001`) dan **frontend** (port `5173`) secara bersamaan.

| URL | Keterangan |
|---|---|
| `http://localhost:5173` | Aplikasi React (Vite) |
| `http://localhost:3001/api` | REST API Express |

---

## Script

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Jalankan backend + frontend bersamaan (development) |
| `npm run dev:server` | Jalankan backend saja |
| `npm run dev:client` | Jalankan frontend saja |
| `npm run build` | Build frontend untuk production |
| `npm start` | Jalankan server production (serve `dist/`) |

---

## API Endpoints

### Auth — `/api/auth`

| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/register` | Daftar akun baru |
| `POST` | `/login` | Login, mendapatkan JWT |
| `GET` | `/me` | Data user yang sedang login |

### Cleanox By Waschen Production — `/api/cleanox-by-waschen-production`

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/outlets` | Daftar nama outlet |
| `GET` | `/employees` | Daftar karyawan role cleanox |
| `GET` | `/tracking` | Detail tracking satu item |
| `GET` | `/` | Data transaksi (paginated, filtered) |
| `POST` | `/tracking` | Update stage tracking |
| `DELETE` | `/tracking` | Hapus progres stage (admin) |
| `PATCH` | `/catatan` | Update catatan |
| `PATCH` | `/on-hold` | Ajukan on-hold |
| `PATCH` | `/cuci-jemur/decision` | Keputusan lanjut/batal |
| `POST` | `/notify-customer` | Kirim notifikasi manual |
| `DELETE` | `/item` | Hapus item/nota (admin) |
| `GET` | `/nota-item-count` | Cek jumlah item dalam satu nota |
| `GET` | `/events` | SSE realtime (token via query) |

---

## Catatan Keamanan

- File `.env` **tidak boleh** di-commit ke repositori (sudah ada di `.gitignore`)
- Semua endpoint data dilindungi oleh JWT middleware
- Password di-hash menggunakan bcrypt (salt rounds 12)
- Gunakan `JWT_SECRET` yang panjang dan acak di environment production

---

## Lisensi

Internal use only — PT Waschen Alora Indonesia © 2025
