# Plan: Commit & Push ke Branch `galihdev` (Main Aman)

## Context

- Working tree ada di branch **`main`**, sync dengan `origin/main` di commit `fae1129`.
- Perubahan **belum di-commit** → remote `main` belum terpengaruh.
- User ingin push ke branch baru **`galihdev`**, bukan `main`.
- Repo: `https://github.com/saputraananda/cleanox-app.git`
- Author lokal mesin: `Galih152` / `galih.prayudo15@gmail.com` (commit akan memakai ini).

## Goal

- Membuat branch `galihdev` dari `main` saat ini.
- Commit perubahan relevan ke `galihdev`.
- Push **hanya** `galihdev` ke origin.
- Memastikan `origin/main` tetap di `fae1129` (tidak ada push ke `main`).

## Detailed Specifications

### Guardrails (wajib)

- **JANGAN** `git push origin main`
- **JANGAN** merge `galihdev` ke `main`
- **JANGAN** commit `.env` (sudah di `.gitignore`)
- Setelah push: verifikasi `origin/main` hash masih `fae1129` dan branch `galihdev` ada di remote

### Isi commit — INCLUDE

Semua perubahan working tree **kecuali** yang diabaikan `.gitignore`.

Termasuk (tidak di-ignore): `docs/`, `plans/`, `prisma/`, `prisma.config.ts`, `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `style/`, `.agents/`, `.claude/`, `.windsurf/`, `skills-lock.json`.

### Isi commit — EXCLUDE

Hanya yang kena `.gitignore` (contoh: `.env`, `node_modules/`, `/src/generated/prisma`).

### Urutan Git (exact)

1. Pastikan berada di `main` dan `HEAD == origin/main` (`fae1129`).
2. `git checkout -b galihdev`
3. `git add` hanya path INCLUDE di atas.
4. `git status` — pastikan tidak ada `.env`, tidak ada `.agents/` dll.
5. `git commit` dengan message HEREDOC (fokus why).
6. `git push -u origin galihdev` (bukan main).
7. Verifikasi:
   - `git rev-parse origin/main` → masih `fae1129…`
   - `git ls-remote --heads origin galihdev` → ada
   - branch lokal `galihdev` tracking `origin/galihdev`

### Commit message (usulan)

```
docs: add Cleanox DB flow docs and Prisma schema introspect

Document Cleanox data/flow and capture pulled MySQL schema on branch galihdev without touching main.
```

### Catatan auth push

- Push butuh akun GitHub di credential manager yang punya write access ke `saputraananda/cleanox-app`.
- Jika push gagal auth/permission, berhenti dan laporkan — jangan fallback push ke `main`.

## Implementation Checklist

1. Jalankan `git status` + `git rev-parse HEAD origin/main` — pastikan sama dan masih di `main`.
2. Buat branch: `git checkout -b galihdev`.
3. Stage INCLUDE saja: `docs/`, `plans/`, `prisma/`, `prisma.config.ts`, `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `style/`.
4. Konfirmasi `git status`: tidak ada `.env`; tidak ada `.agents/`, `.claude/`, `.windsurf/`, `skills-lock.json` di staged.
5. Commit dengan message HEREDOC di atas.
6. Push: `git push -u origin galihdev` (required permissions network/all).
7. Verifikasi `origin/main` tidak berubah; `origin/galihdev` ada.
8. Laporkan URL branch ke user: `https://github.com/saputraananda/cleanox-app/tree/galihdev`.

## Risks / Catatan

- Push bisa gagal jika user GitHub di PC bukan collaborator repo `saputraananda/cleanox-app`.
- `.env.example` berisi placeholder `DATABASE_URL` Prisma default (postgres lokal) — bukan kredensial Cleanox, tetap direview di checklist status.
- Folder skill Prisma tetap lokal untracked setelah commit (sengaja).
