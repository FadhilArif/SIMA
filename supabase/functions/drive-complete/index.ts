import { withSupabase } from "npm:@supabase/server@^1";
import { getDriveFile } from "../_shared/google-drive.ts";
import { json, options } from "../_shared/http.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const opt = options(req); if (opt) return opt;
    try {
      const body = await req.json();
      const { proker_id, dokumen_id, kind, drive_file_id, urutan = 1, thumb_path = null } = body;
      if (!proker_id || !drive_file_id || !kind) return json({ error: "Konfirmasi upload tidak lengkap." }, 400);

      const { data: p } = await ctx.supabaseAdmin.from("proker").select("id,organisasi_id").eq("id", proker_id).maybeSingle();
      if (!p) return json({ error: "Proker tidak ditemukan." }, 404);
      const { data: member } = await ctx.supabaseAdmin.from("keanggotaan").select("id").eq("akun_id", ctx.user.id).eq("organisasi_id", p.organisasi_id).eq("status","aktif").maybeSingle();
      const { data: profile } = await ctx.supabaseAdmin.from("profiles").select("tipe").eq("id", ctx.user.id).maybeSingle();
      if (!member && !["admin","wakil_rektor"].includes(profile?.tipe || "")) return json({ error: "Tidak berwenang." }, 403);

      const file = await getDriveFile(drive_file_id);
      if (file.trashed) return json({ error: "Berkas Drive sudah dihapus." }, 400);

      if (kind === "document") {
        if (!dokumen_id) return json({ error: "dokumen_id wajib untuk PDF." }, 400);
        const { data: latest } = await ctx.supabaseAdmin.from("dokumen_versi").select("nomor_versi").eq("dokumen_id", dokumen_id).order("nomor_versi",{ascending:false}).limit(1);
        const next = (latest?.[0]?.nomor_versi || 0) + 1;
        const { error } = await ctx.supabaseAdmin.from("dokumen_versi").insert({
          dokumen_id, nomor_versi: next, drive_file_id, nama_file: file.name,
          ukuran_bytes: Number(file.size || 0), checksum: file.md5Checksum || null, diunggah_oleh: ctx.user.id,
        });
        if (error) return json({ error: error.message }, 400);
      } else if (kind === "photo") {
        const { error } = await ctx.supabaseAdmin.from("foto_kegiatan").insert({
          proker_id, dokumen_id: dokumen_id || null, drive_file_id, thumb_path,
          nama_file: file.name, ukuran_bytes: Number(file.size || 0),
          checksum: file.md5Checksum || null, urutan, diunggah_oleh: ctx.user.id,
        });
        if (error) return json({ error: error.message }, 400);
      } else return json({ error: "Jenis upload tidak valid." }, 400);

      return json({ ok: true, file });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }),
};
