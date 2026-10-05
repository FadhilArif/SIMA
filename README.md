# SIMA MHS

SIMA MHS — Sistem Informasi dan Manajemen Organisasi Mahasiswa.

## Struktur
- `index.html`, `style.css`, `app.js`: web statis desktop + mobile.
- `schema.sql`: schema PostgreSQL + RLS + storage thumbnail + OTP admin.
- `supabase/functions/`: Edge Functions untuk Google Drive, SMTP, impor CSV, dan OTP Admin.

## Setup Supabase
1. Buat/siapkan project Supabase.
2. Buka **SQL Editor** lalu paste seluruh isi `schema.sql` dan jalankan sekali.
3. Authentication → Providers: matikan public sign-up.
4. Authentication → SMTP: isi SMTP resmi kampus/provider. Supabase Auth memakai SMTP ini untuk email Auth.
5. Buat Admin pertama di Authentication → Users, lalu buat row `profiles` dengan `tipe='admin'`.
6. Isi `admin_operator` untuk Admin dan email pribadi operator.

## Edge Function secrets
Jangan masukkan secret ke GitHub atau `app.js`. Supabase menyediakan secret environment untuk Edge Functions; gunakan:
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`
- `SMTP_HOSTNAME`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM`

Template aman ada di `supabase/functions/.env.example`.

## Google Drive
1. Buat Google Cloud project dan aktifkan Google Drive API.
2. Buat Service Account.
3. Buat satu folder root di Drive institusi.
4. **Disarankan:** gunakan Shared Drive institusi dan beri Service Account akses yang diperlukan. Service Account tidak memiliki kuota penyimpanan Drive pribadi. Alternatif untuk Google Workspace adalah memakai delegasi domain dan isi `GOOGLE_SUBJECT` dengan email akun institusi.
5. Simpan email Service Account, private key, dan folder ID sebagai Edge Function secrets.
6. Function akan membuat struktur: **Periode / Organisasi / Proker / Dokumen|Foto**.
7. Browser meminta sesi resumable upload ke Edge Function lalu mengunggah langsung ke Drive; metadata disimpan di Supabase.

## Deploy Edge Functions
Dengan Supabase CLI:
```bash
supabase login
supabase link --project-ref vgzhkvxzzvllmricfzto
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy drive-init
supabase functions deploy drive-complete
supabase functions deploy import-csv
supabase functions deploy admin-otp
supabase functions deploy send-smtp
```

Jangan pernah menaruh secret/service-role key di frontend. Browser hanya memakai publishable/anon key + RLS.

## Alur yang sudah dihubungkan
- LPJ → PDF ke Google Drive.
- LPJ → 1–10 foto ke Google Drive + thumbnail ke Supabase Storage.
- CSV → preview → commit → pembuatan Auth/profile/keanggotaan → email kredensial sementara.
- Admin → OTP email operator → audit.
- Akun hasil impor membawa `must_change_password=true` dan dipaksa mengganti password saat login pertama.

## Catatan
Integrasi eksternal belum dapat dianggap live sampai secret Google/SMTP diisi dan Edge Functions dideploy ke project Supabase. Setelah itu lakukan uji satu organisasi dengan file dummy.
