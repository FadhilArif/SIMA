# SIMA MHS

SIMA MHS — Sistem Informasi dan Manajemen Organisasi Mahasiswa.

## Struktur
- `index.html`, `style.css`, `app.js`: web statis desktop + mobile.
- `schema.sql`: schema PostgreSQL + RLS + OTP admin; file utama disimpan di Google Drive API.
- `supabase/functions/`: Edge Functions untuk Google Drive, impor anggota CSV, dan OTP Admin. Bootstrap akun tidak memakai Edge Function. **Bootstrap akun awal tidak menggunakan Edge Function.**

## Setup Supabase
1. Buat/siapkan project Supabase.
2. Buka **SQL Editor** lalu paste seluruh isi `schema.sql` dan jalankan sekali.
3. Authentication → Providers: matikan public sign-up.
4. Authentication → Providers: matikan public sign-up.
5. Buat Admin pertama di Authentication → Users, lalu buat row `profiles` dengan `tipe='admin'`.
6. Untuk pendaftaran publik, aktifkan **Allow new users to sign up**. Calon pengguna mengisi email, nama, NIM, dan password dari halaman login. Akun otomatis masuk status `menunggu` sampai Admin menyetujui role dan organisasi.
7. Admin mengelola calon pengguna melalui menu **Akun dan Penetapan**; approval menulis `profiles`, `keanggotaan`, atau `pembimbing_organisasi`.
8. Untuk **Lupa password**, gunakan Supabase Auth `resetPasswordForEmail()` dan arahkan email Auth melalui **Send Email Hook** ke Google Apps Script. Template ada di `docs/SIMA_Auth_Email_Gateway.gs`.
9. Untuk bootstrap manual, akun tetap bisa dibuat langsung di Authentication → Users lalu ditetapkan melalui SQL Editor.
10. Isi `admin_operator` untuk Admin dan email pribadi operator.

## Edge Function secrets
Jangan masukkan secret ke GitHub atau `app.js`. Supabase menyediakan secret environment untuk Edge Functions; gunakan:
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`

Template aman ada di `supabase/functions/.env.example`.

## Google Drive API — storage utama SIMA
1. Buat Google Cloud project dan aktifkan **Google Drive API**.
2. Buat **Service Account** dan buat key JSON. Dari JSON, ambil `client_email` → `GOOGLE_CLIENT_EMAIL` dan `private_key` → `GOOGLE_PRIVATE_KEY`.
3. Buat folder root khusus SIMA di Google Drive institusi. Untuk organisasi, **Shared Drive** lebih disarankan; beri Service Account akses ke folder/Shared Drive tersebut.
4. Isi ID folder root sebagai `GOOGLE_DRIVE_ROOT_FOLDER_ID`. `GOOGLE_SUBJECT` hanya diperlukan jika memakai Google Workspace Domain-Wide Delegation; jika tidak, kosongkan.
5. Function membuat struktur otomatis: **Periode / Organisasi / Proker / Dokumen|Foto**.
6. Browser meminta sesi resumable upload dari Edge Function, lalu file dikirim langsung ke URL upload Google Drive. Google mendukung resumable upload untuk file besar dan koneksi yang rawan terputus. urlDokumentasi upload Google Drive APIhttps://developers.google.com/workspace/drive/api/guides/manage-uploads
7. Supabase hanya menyimpan metadata file (`drive_file_id`, nama, ukuran, checksum), bukan file utama.

**Catatan:** Google Drive API tetap memakai Google Cloud project untuk mengaktifkan API dan membuat kredensial. Private key/service-account credential tidak boleh dimasukkan ke frontend.

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
```

Jangan pernah menaruh secret/service-role key di frontend. Browser hanya memakai publishable/anon key + RLS.

## Alur yang sudah dihubungkan
- LPJ → PDF ke Google Drive.
- LPJ → PDF + 1–10 foto langsung ke Google Drive.
- Admin → Authentication → buat akun awal → SQL Editor untuk `profiles`/`keanggotaan`/`pembimbing_organisasi`.
- Admin → OTP email operator → audit.
- Ketua/Presiden organisasi → impor anggota CSV sesuai organisasi aktif.
- Akun hasil impor membawa `must_change_password=true` dan dipaksa mengganti password saat login pertama.

## Catatan
Integrasi Google Drive belum dapat dianggap live sampai secret Google diisi, folder Drive dibagikan ke Service Account, dan Edge Functions dideploy ke project Supabase. Setelah itu lakukan uji satu organisasi dengan satu PDF dan beberapa foto dummy.
