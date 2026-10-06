# SIMA MHS — Audit & Debugging 2026-10-06

## Blocking bugs fixed in source

1. **Akun & Penetapan crashed on `profiles.created_at`**
   - Production drift: the running database did not expose `profiles.created_at`.
   - UI query no longer depends on that column.
   - Production migration adds `profiles.created_at` and `profiles.updated_at` safely when absent.

2. **Public registration was coupled to an Auth trigger**
   - Removed the `auth.users -> profiles` trigger path.
   - Signup now creates the Auth user first, then creates a waiting `profiles` row from the authenticated browser session.
   - Login also backfills a missing profile into `menunggu`, covering projects where email confirmation is enabled.

3. **Self-registration approval flow**
   - Added `menunggu / aktif / nonaktif / ditolak` profile states.
   - Admin approval sets profile role and organization membership.
   - Approval/rejection creates an in-app notification.

4. **LPJ Drive-link insert**
   - Added the missing RLS write policy for `tautan_drive`.

5. **Closed-period write protection**
   - Added `organisasi_periode_aktif()`.
   - Proker, document, budget-item, and Drive-link writes are blocked for closed periods.
   - Drive upload Edge Functions also reject closed periods.

6. **Collaborative proker**
   - Participant organizations and nominal allocation are now persisted to `proker_kolaborator`.
   - Collaboration invitations now have acceptance/rejection state and comment storage.

7. **Drive authorization**
   - Uploads are limited to organizational officers plus Admin/Wakil Rektor instead of every organization member.

8. **Import CSV cleanup**
   - Per-row failures now roll back newly-created Auth/profile/membership data instead of leaving partial accounts.
   - Email failure also rolls the row back.

9. **Admin OTP**
   - OTP generation now uses cryptographically secure randomness instead of `Math.random()`.

10. **Review authorization**
    - Review RPC now checks the reviewer against the current review stage.
    - Self-review is rejected.
    - Menteri/Koordinator/BPH/Pembimbing authorization is separated.
    - Next-stage notifications are generated.
    - Menteri + Koordinator same-person paths can be collapsed.

11. **LPJ deadline marking**
    - LPJ submissions after the calculated 7-day deadline are marked `diajukan_terlambat`.

12. **Proker search**
    - Search now matches both program name and Ketua.

## Production migration required

Run:

`supabase/migrations/20261006_simplify_auth_registration.sql`

once in the Production project's SQL Editor.

For diagnostics only, run:

`supabase/diagnostics/production_schema_audit.sql`

## Static checks performed

- `app.js` passes JavaScript parser compilation via `new Function(...)`.
- All client-side RPC names found in `app.js` exist in `schema.sql`.
- All client-side table write operations were cross-checked against the intended RLS/write paths.
- Remaining Edge Functions are limited to Google Drive, member CSV import, and Admin OTP.

## Known feature-completeness gaps

The source design document explicitly records several modules as still being framework/partial implementations. Those are not runtime errors and have not been falsely marked as complete. The current codebase still needs full implementation for parts of:
- Beranda live aggregates
- Review/Inbox UI
- Struktur & anggota UI
- Galeri
- Rapat
- Plafon and pencairan UI
- Periode administration UI
- Laporan akhir periode
- Full proposal document/anggaran workflow
- Full LPJ per-item realisasi/checklist
- Password-reset email hook deployment to Google Apps Script
- End-to-end Google Drive production credentials/configuration
- Multi-account RLS acceptance testing in the live project

This distinction is intentional: a module that currently renders a stub is not called "working" merely because the navigation button exists.
