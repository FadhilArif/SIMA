import { withSupabase } from "npm:@supabase/server@^1";
import nodemailer from "npm:nodemailer@^9";
import { json, options } from "../_shared/http.ts";

function parseCsv(input: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i=0;i<input.length;i++) {
    const c=input[i], n=input[i+1];
    if (c === '"' && quoted && n === '"') { cell += '"'; i++; continue; }
    if (c === '"') { quoted = !quoted; continue; }
    if (c === "," && !quoted) { row.push(cell.trim()); cell=""; continue; }
    if ((c === "\n" || c === "\r") && !quoted) { if (c==="\r" && n==="\n") i++; row.push(cell.trim()); cell=""; if(row.some(Boolean)) rows.push(row); row=[]; continue; }
    cell += c;
  }
  row.push(cell.trim()); if(row.some(Boolean)) rows.push(row);
  return rows;
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"[b % 58]).join("") + "!";
}

function headerIndex(headers: string[], name: string) {
  const target = name.toLowerCase().replace(/[^a-z0-9]/g,"");
  return headers.findIndex(h => h.toLowerCase().replace(/[^a-z0-9]/g,"") === target);
}

const transport = nodemailer.createTransport({
  host: Deno.env.get("SMTP_HOSTNAME")!,
  port: Number(Deno.env.get("SMTP_PORT") || 587),
  secure: Deno.env.get("SMTP_SECURE") === "true",
  auth: { user: Deno.env.get("SMTP_USERNAME")!, pass: Deno.env.get("SMTP_PASSWORD")! },
});

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const opt = options(req); if (opt) return opt;
    try {
      const body = await req.json();
      const { action = "preview", organisasi_id, nama_file = "import.csv", csv, impor_id } = body;
      if (!organisasi_id) return json({ error: "organisasi_id wajib." }, 400);

      const { data: profile } = await ctx.supabaseAdmin.from("profiles").select("tipe").eq("id", ctx.user.id).maybeSingle();
      const { data: member } = await ctx.supabaseAdmin.from("keanggotaan").select("jabatan").eq("akun_id",ctx.user.id).eq("organisasi_id",organisasi_id).eq("status","aktif").maybeSingle();
      const allowed = ["admin","wakil_rektor"].includes(profile?.tipe || "") || ["Presiden","Ketua"].includes(member?.jabatan || "");
      if (!allowed) return json({ error: "Anda tidak berwenang melakukan impor." }, 403);

      if (action === "preview") {
        if (typeof csv !== "string" || !csv.trim()) return json({ error: "CSV kosong." }, 400);
        const rows = parseCsv(csv);
        if (rows.length < 2) return json({ error: "CSV harus memiliki header dan minimal satu baris." }, 400);
        const headers = rows[0];
        const idx = {
          nama: headerIndex(headers,"nama") >= 0 ? headerIndex(headers,"nama") : headerIndex(headers,"full_name"),
          nim: headerIndex(headers,"nim"),
          email: headerIndex(headers,"email"),
          jabatan: headerIndex(headers,"jabatan") >= 0 ? headerIndex(headers,"jabatan") : headerIndex(headers,"role"),
          unit: headerIndex(headers,"unit_nama") >= 0 ? headerIndex(headers,"unit_nama") : headerIndex(headers,"unit"),
        };
        if (idx.nama < 0 || idx.email < 0) return json({ error: "Kolom minimal: nama/full_name dan email." }, 400);

        const { data: imp, error: ie } = await ctx.supabaseAdmin.from("impor_csv").insert({ organisasi_id, diunggah_oleh:ctx.user.id, nama_file, status:"pratinjau" }).select().single();
        if (ie) return json({ error: ie.message }, 400);
        const mapped = rows.slice(1).map((r,i) => ({
          impor_id: imp.id, nomor_baris:i+2, nama:r[idx.nama]||null, nim:idx.nim>=0?r[idx.nim]||null:null,
          email:r[idx.email]||null, jabatan:idx.jabatan>=0?r[idx.jabatan]||null:null, unit_nama:idx.unit>=0?r[idx.unit]||null:null,
          status: (r[idx.email]||"").includes("@") && r[idx.nama] ? "validasi" : "error",
          hasil:"preview", pesan: (r[idx.email]||"").includes("@") && r[idx.nama] ? null : "Nama/email tidak valid",
        }));
        const { error: be } = await ctx.supabaseAdmin.from("impor_csv_baris").insert(mapped);
        if (be) return json({ error: be.message }, 400);
        return json({ ok:true, impor_id:imp.id, total:mapped.length, valid:mapped.filter(x=>x.status==="validasi").length, rows:mapped });
      }

      if (action === "commit") {
        if (!impor_id) return json({ error: "impor_id wajib." }, 400);
        const { data: imp } = await ctx.supabaseAdmin.from("impor_csv").select("*").eq("id",impor_id).eq("organisasi_id",organisasi_id).maybeSingle();
        if (!imp) return json({ error: "Batch impor tidak ditemukan." }, 404);
        const { data: rows } = await ctx.supabaseAdmin.from("impor_csv_baris").select("*").eq("impor_id",impor_id).order("nomor_baris");
        let created=0, skipped=0; const results=[];
        for (const r of rows || []) {
          if (r.status === "error" || !r.email || !r.nama) { skipped++; continue; }
          const password = randomPassword();
          const { data: u, error: ue } = await ctx.supabaseAdmin.auth.admin.createUser({
            email:r.email, password, email_confirm:true,
            user_metadata:{ nama:r.nama, must_change_password:true },
          });
          if (ue) { results.push({baris:r.nomor_baris,email:r.email,status:"error",pesan:ue.message}); skipped++; continue; }
          const { error: pe } = await ctx.supabaseAdmin.from("profiles").insert({id:u.user.id,nim:r.nim,nama:r.nama,email:r.email,tipe:"mahasiswa"});
          if (pe) { await ctx.supabaseAdmin.auth.admin.deleteUser(u.user.id); results.push({baris:r.nomor_baris,email:r.email,status:"error",pesan:pe.message}); skipped++; continue; }
          const { error: ke } = await ctx.supabaseAdmin.from("keanggotaan").insert({akun_id:u.user.id,organisasi_id,jabatan:r.jabatan||"Anggota",status:"aktif",ditetapkan_oleh:ctx.user.id});
          if (ke) { results.push({baris:r.nomor_baris,email:r.email,status:"error",pesan:ke.message}); skipped++; continue; }
          await transport.sendMail({
            from:Deno.env.get("SMTP_FROM")!, to:r.email, subject:"Akun SIMA MHS Anda",
            text:"Halo "+r.nama+"\n\nAkun SIMA MHS telah dibuat.\nEmail: "+r.email+"\nKata sandi sementara: "+password+"\n\nLogin pertama wajib mengganti kata sandi.\n",
            html:"<p>Halo "+r.nama+"</p><p>Akun SIMA MHS telah dibuat.</p><p><b>Email:</b> "+r.email+"<br><b>Kata sandi sementara:</b> "+password+"</p><p>Login pertama wajib mengganti kata sandi.</p>",
          });
          await ctx.supabaseAdmin.from("impor_csv_baris").update({status:"sukses",hasil:"akun dibuat",akun_id:u.user.id}).eq("id",r.id);
          results.push({baris:r.nomor_baris,email:r.email,status:"sukses"}); created++;
        }
        await ctx.supabaseAdmin.from("impor_csv").update({status:"selesai"}).eq("id",impor_id);
        return json({ok:true,created,skipped,results});
      }

      return json({error:"Action tidak valid."},400);
    } catch (e) {
      return json({ error:e instanceof Error ? e.message : String(e) },500);
    }
  }),
};
