import { withSupabase } from "npm:@supabase/server@^1";
import { createResumableUpload, ensureFolderPath } from "../_shared/google-drive.ts";
import { json, options } from "../_shared/http.ts";

const PDF_MAX = 29 * 1024 * 1024;
const PHOTO_MAX = 10 * 1024 * 1024;

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const opt = options(req); if (opt) return opt;
    try {
      const { proker_id, dokumen_id, kind, filename, mime, size } = await req.json();
      if (!proker_id || !filename || !mime || !Number.isFinite(size)) return json({ error: "Parameter upload tidak lengkap." }, 400);
      if (kind === "document" && (mime !== "application/pdf" || size > PDF_MAX)) return json({ error: "PDF harus <= 29 MB." }, 400);
      if (kind === "photo" && (!["image/jpeg","image/png","image/webp"].includes(mime) || size > PHOTO_MAX)) return json({ error: "Foto harus JPG/PNG/WebP dan <= 10 MB." }, 400);
      if (!["document","photo"].includes(kind)) return json({ error: "Jenis upload tidak valid." }, 400);

      const { data: p, error: pe } = await ctx.supabaseAdmin.from("proker").select("id,nama,organisasi_id").eq("id", proker_id).maybeSingle();
      if (pe || !p) return json({ error: "Proker tidak ditemukan." }, 404);

      const { data: member } = await ctx.supabaseAdmin.from("keanggotaan").select("id,jabatan").eq("akun_id", ctx.user.id).eq("organisasi_id", p.organisasi_id).eq("status","aktif").maybeSingle();
      const { data: profile } = await ctx.supabaseAdmin.from("profiles").select("tipe").eq("id", ctx.user.id).maybeSingle();
      const allowed = !!member || ["admin","wakil_rektor"].includes(profile?.tipe || "");
      if (!allowed) return json({ error: "Anda tidak berwenang mengunggah berkas proker ini." }, 403);

      const org = await ctx.supabaseAdmin.from("organisasi").select("id,nama,periode_id,periode:periode_id(nama)").eq("id", p.organisasi_id).single();
      const periodName = org.data?.periode?.nama || "Periode";
      const orgName = org.data?.nama || "Organisasi";
      const folder = await ensureFolderPath([periodName, orgName, p.nama, kind === "document" ? "Dokumen" : "Foto"]);
      const sessionUrl = await createResumableUpload({ name: filename, mimeType: mime, size, parentId: folder });

      return json({ upload_url: sessionUrl, folder_id: folder, expires_hint: "Gunakan segera; sesi resumable Google bersifat sementara.", proker_id, dokumen_id: dokumen_id || null, kind });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }),
};
