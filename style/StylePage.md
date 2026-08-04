# IKM Mobile App Design Standard & Style Guide

Dokumen ini mendefinisikan standar desain dan arsitektur frontend (tech stack & styling) untuk proyek **IKM-Mobile**. Tujuannya adalah menjadi panduan konsistensi (design barrier) saat mendesain dan mengimplementasikan aplikasi seluler atau web modern untuk unit bisnis lainnya di bawah PT Waschen Alora Indonesia.

---

## 1. Tech Stack & Frontend Architecture

Untuk menjaga keseragaman performa, skalabilitas, dan kemudahan pemeliharaan, berikut adalah standar tech stack yang digunakan:

*   **Runtime & Bundle**: [Vite](https://vitejs.dev/) + React (JavaScript/JSX).
*   **Routing**: `react-router-dom` (menggunakan navigasi SPA dinamis dengan `Link` dan `useNavigate`).
*   **State Management**: [Zustand](https://github.com/pmndrs/zustand) (ringan, performa tinggi, dan mudah dikelola tanpa boilerplate besar seperti Redux).
*   **HTTP Client**: Axios (dibungkus dalam helper library lokal `api.js` untuk manajemen token, base URL, dan interseptor).
*   **Utility & Helpers**:
    *   Pengambilan URL Aset Dinamis: `import.meta.env.VITE_API_URL` dikombinasikan dengan manipulasi regex untuk penyesuaian aset statis dari backend.
    *   Penyimpanan Lokal: Penyimpanan token autentikasi aman via `localStorage` yang terintegrasi dengan Zustand Store.

---

## 2. Layout & Viewport (Sistem Container Mobile-First)

Desain aplikasi ini diformat khusus untuk perangkat mobile (Mobile-First) dengan wrapper yang responsif pada resolusi desktop:

*   **Main Wrapper**: 
    *   Menggunakan layout flexbox tengah dengan background netral: `min-h-[100dvh] bg-slate-100 flex justify-center`.
    *   Hal ini memastikan jika aplikasi dibuka di desktop, ia akan tampak seperti handphone di tengah layar dengan latar belakang abu-abu lembut (`bg-slate-100`).
*   **Frame Handphone (Inner Container)**:
    *   Lebar maksimal: `w-full max-w-[430px]` (standard ukuran viewport iPhone Pro Max/Android modern).
    *   Tinggi minimal: `min-h-[100dvh]`.
    *   Background utama: `bg-slate-50` (untuk halaman dashboard/list) atau `bg-white` (untuk halaman form detail).
    *   Efek melayang (Shadow): Menggunakan shadow halus bertingkat agar frame terlihat elegan di desktop:
        *   `shadow-[0_0_0_1px_rgba(0,0,0,.04),0_8px_48px_rgba(0,0,0,.08)]` atau
        *   `shadow-[0_0_0_1px_rgba(0,0,0,.05),0_8px_48px_rgba(0,0,0,.07)]`.
*   **Scroll & Overflow**:
    *   Bagian konten utama diatur meluap secara vertikal (`overflow-y-auto pb-[100px]`), sementara Header dan Navigasi Bawah (`Bottom Nav`) bersifat tetap (`fixed`/`flex-shrink-0`) untuk menciptakan pengalaman native app yang mulus.

---

## 3. Sistem Warna & Gradasi (Color Palette & Gradients)

Pemilihan warna difokuskan pada harmoni gelap-terang (contrast) yang memberikan kesan modern, bersih, dan premium.

### A. Tema Warna Utama (Brand Identity)
*   **Midnight Dark (Header & Hero Base)**: `#0F172A` (Slate 900) hingga `#0B1739` (Deep Navy). Digunakan untuk memberikan struktur navigasi yang kokoh.
*   **Royal Blue (Primary Accent)**: `#1D4ED8` (Blue 700) / `#3B82F6` (Blue 500). Digunakan sebagai penunjuk aksi utama dan tombol penting.

### B. Pola Gradasi Warna (Gradients)
Gradasi digunakan secara selektif pada elemen penting seperti Hero Section, Banner, dan Tombol Utama untuk menciptakan kedalaman visual:
*   **Hero Dashboard (Malam/Premium)**:
    `linear-gradient(160deg, #0F172A 0%, #1E3A5F 35%, #1D4ED8 70%, #3B82F6 100%)`
*   **Banner Aksi & Tombol Utama**:
    `linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)` (Deep Navy ke Royal Blue).
*   **Absen Normal Banner**:
    `linear-gradient(145deg, #0F172A 0%, #1E293B 55%, #1D4ED8 100%)`
*   **Absen Valet Banner**:
    `linear-gradient(145deg, #022C22 0%, #065F46 55%, #059669 100%)`
*   **Absen Khusus Management Banner**:
    `linear-gradient(135deg, #2E1065 0%, #4C1D95 45%, #7C3AED 100%)`

### C. Gradasi & Latar Belakang Kartu Menu Utama
Ikon menu dibungkus dengan kartu kecil bergradasi pastel yang sangat lembut:
*   **Absensi**: `linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)` (Biru)
*   **Valet / Izin / Cuti**: `linear-gradient(135deg, #FEF3C7 0%, #FFFBEB 100%)` (Kuning)
*   **Deputi**: `linear-gradient(135deg, #FEE2E2 0%, #FEF2F2 100%)` (Merah)
*   **Leader / Rewash**: `linear-gradient(135deg, #EDE9FE 0%, #F5F3FF 100%)` (Ungu)
*   **Kasbon / Pinjam**: `linear-gradient(135deg, #D1FAE5 0%, #ECFDF5 100%)` (Hijau)
*   **Slip Gaji**: `linear-gradient(135deg, #FCE7F3 0%, #FDF2F8 100%)` (Pink)

### D. Warna Status (Status Meta)
Sistem status menggunakan kombinasi tiga komponen warna (Text, Background, Border) agar mudah dibaca:
*   **Terkirim**: Text: `#2563EB` (blue-600) | BG: `bg-blue-50` | Border: `border-blue-200`
*   **Proses**: Text: `#D97706` (amber-600) | BG: `bg-amber-50` | Border: `border-amber-200`
*   **Selesai**: Text: `#059669` (emerald-600) | BG: `bg-emerald-50` | Border: `border-emerald-200`

---

## 4. Tipografi (Typography)

*   **Font Family**: Menggunakan font sistem bawaan (`font-[inherit]`) untuk performa maksimal, dan `font-mono` khusus untuk penulisan angka, jam/waktu, serta kode unik agar presisi dan rapi.
*   **Letter Spacing (Tracking)**:
    *   Headline/Judul Utama: Menggunakan tracking negatif kecil (`tracking-[-0.2px]` atau `tracking-[-0.01em]`) untuk memberikan kesan padat dan premium.
    *   Sub-Header Kategori (Upper-case): Menggunakan tracking lebar (`tracking-[.14em] text-[9.5px] uppercase`) untuk estetika minimalis.
*   **Ukuran Font (Font Size Hierarchy)**:
    *   `text-[9.5px]` s/d `text-[10px]`: Metadata terkecil, kategori atas, label status, dan deskripsi ikon bottom nav.
    *   `text-[11px]` s/d `text-[11.5px]`: Sub-deskripsi kartu, teks bantuan (helper text), info detail shift, badge info.
    *   `text-[12.5px]` s/d `text-[13px]`: Teks standar form, label input, isi baris riwayat, dan teks body utama.
    *   `text-[14px]`: Judul bagian (section title), teks navigasi header, dan label tombol sedang.
    *   `text-[15px]` s/d `text-[16px]`: Judul utama formulir/banner, angka input kuantitas.
    *   `text-[28px]`: Penunjuk jam/waktu dinamis (Font Mono & Bold).
*   **Ketebalan Font**:
    *   `font-extrabold`: Nama user, judul menu, penunjuk navigasi aktif.
    *   `font-bold`: Judul banner, tombol aksi utama, tab aktif.
    *   `font-semibold` / `font-medium`: Informasi pendukung, label input, isi item.

---

## 5. Spacing System (Margin, Padding, & Gap)

Kunci kenyamanan aplikasi mobile adalah konsistensi jarak antar elemen (spacing):

*   **Padding Konten Halaman**: `px-[13px] py-[14px]` atau `px-4 pt-[18px]` untuk memberikan ruang bernapas yang cukup di sisi kiri-kanan layar.
*   **Jarak Antar Kartu/Elemen List**: Menggunakan `flex flex-col gap-2.5` atau `gap-3`.
*   **Padding Kartu (Cards)**:
    *   Kartu Menu Utama: `px-[14px] pt-5 pb-4`.
    *   Kartu Detail Riwayat: `px-4 py-3.5`.
    *   Banner Highlight: `px-5 py-[18px]`.
*   **Form Field & Input Padding**: `px-3 py-2.5` (memberikan tinggi sentuh yang pas untuk jari handphone tanpa terlihat terlalu tebal).
*   **Jarak Margin Luar (Outside Margin)**: `mx-4 mt-[14px]` untuk memposisikan komponen kartu melayang secara simetris di dalam frame.

---

## 6. Bentuk Komponen UI (Border Radius & Shadows)

Untuk memberikan kesan modern dan ramah pengguna (friendly UX), sudut-sudut tajam dihindari:

*   **Pill/Badges & Bulatan**: `rounded-full` (digunakan pada status pill, ikon melingkar).
*   **Elemen Tab Kecil & Tombol Navigasi**: `rounded-[10px]`.
*   **Input Form & Dropdown**: `rounded-[12px]` atau `rounded-xl`.
*   **Navigasi Bawah (Bottom Nav)**: `rounded-[14px]` pada efek hover/fokus.
*   **Kartu List / Item**: `rounded-[16px]`.
*   **Banner Besar & Kartu Menu Utama**: `rounded-[20px]` atau `rounded-[22px]`.
*   **Bagian Bawah Hero Halaman**: `rounded-b-[32px]` (lengkungan dramatis di atas layar dashboard).

---

## 7. Desain Form & Controls

*   **Input Default**:
    Latar belakang abu-abu terang (`bg-slate-50`), berbatasan dengan border halus (`border-slate-200`).
*   **Input State Focus**:
    Latar belakang berubah menjadi putih bersih (`focus:bg-white`), warna border berubah menjadi biru (`focus:border-blue-400`), dan ditambahkan efek glow shadow tipis: `focus:shadow-[0_0_0_3px_rgba(59,130,246,.12)]`.
*   **Custom Dropdown (Select)**:
    Menggunakan `appearance-none` untuk mematikan panah bawaan browser, digantikan dengan gambar panah SVG khusus berformat *inline data-uri* pada CSS background:
    ```javascript
    const selectStyle = {
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' ... stroke='%2394A3B8' ...%3E%3Cpath d='M1 1l4 4 4-4' .../%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 12px center',
      paddingRight: 32,
    };
    ```
*   **Card-based Radio Button**:
    Pilihan tipe (seperti lokasi "Rumah Sakit" vs "IKM") tidak menggunakan bulatan radio jadul, melainkan tombol kartu seleksi yang interaktif:
    *   *Default*: `border-slate-200 bg-slate-50 text-slate-700`
    *   *Terpilih*: `border-emerald-400 bg-emerald-50 text-emerald-800` (disertai indikator titik bulat kustom di dalamnya).

---

## 8. Ikonografi (Iconography)

Aplikasi ini menggunakan **Raw Inline SVG** daripada menggunakan paket ikon pihak ketiga (seperti FontAwesome atau Lucide-react) untuk menghemat ukuran bundle dan rendering secepat kilat:

*   **Spesifikasi SVG Ikon standar**:
    *   `viewBox="0 0 24 24"` (atau `0 0 20 20` untuk ikon kecil).
    *   `fill="none"` dengan `stroke="currentColor"` (memudahkan kontrol warna mengikuti class text Tailwind).
    *   `strokeWidth="1.8"` s/d `2` (ketebalan garis sedang yang modern dan terlihat jelas).
    *   `strokeLinecap="round"` dan `strokeLinejoin="round"` untuk sudut garis yang membulat alami.
*   **Ukuran Ikon**:
    *   Ikon Navigasi Bawah / Header: `width="18" height="18"` atau `width="22" height="22"`.
    *   Ikon Grid Menu: `width="26" height="26"`.

---

## 9. Animasi & Efek Visual Premium (Visual Polish)

Untuk membuat aplikasi terasa dinamis dan "hidup", diterapkan detail kosmetik berikut:

*   **Hover & Active State**:
    *   Tombol menu/aksi menggunakan efek bergeser ke atas tipis saat didekati pointer (`hover:-translate-y-0.5`).
    *   Saat ditekan menggunakan efek menciut sedikit (`active:scale-[.95]` atau `active:scale-[.98]`) untuk mensimulasikan tekanan tombol fisik (haptic-like feedback).
*   **Animasi Transisi**:
    *   Menggunakan transisi waktu pendek untuk perubahan warna border/background: `transition duration-150` atau `transition-all`.
    *   `animate-fade-up` pada kartu menu dan item list agar muncul perlahan dari bawah saat halaman selesai dimuat.
*   **Efek Glassmorphism (Transparansi & Blur)**:
    *   Navigasi Bawah (Bottom Nav) menggunakan background putih transparan dengan efek blur latar belakang untuk kesan premium melayang: `bg-white/92 backdrop-blur-[20px]`.
    *   Tombol aksi pada Hero menggunakan `bg-white/10 backdrop-blur-xl border-white/12`.
*   **Dekorasi Background (Visual Background Noise)**:
    *   Penggunaan lingkaran abstrak bersinar redup (`animate-pulse`) di sudut Hero.
    *   Pola titik-titik (dot grid pattern) transparan pada latar belakang hero untuk menambah tekstur premium:
        ```css
        background-image: radial-gradient(circle at 1px 1px, white 1px, transparent 0);
        background-size: 24px 24px;
        ```
