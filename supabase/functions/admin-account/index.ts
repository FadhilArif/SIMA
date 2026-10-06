import { withSupabase } from "npm:@supabase/server@^1";
import nodemailer from "npm:nodemailer@^9";
import { json, options } from "../_shared/http.ts";

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => chars[b % chars.length]).join("") + "!";
}

const transport = nodemailer.createTransport({
  host: Deno.env.get("SMTP_HOSTNAME")!,
  port: Number(Deno.env.get("SMTP_PORT") || 587),
  secure: Deno.env.get("SMTP_SECURE") === "true",
  auth: {
    user: Deno.env.get("SMTP_USERNAME")!,
    pass: Deno.env.get("SMTP_PASSWORD")!
  }
});

function profileType(kind:string){
  if(kind === "wakil_rektor") return "wakil_rektor";
  if(kind === "staf_keuangan") return "staf_keuangan";
  if(kind === "dosen") return "dosen";
  return "mahasiswa";
}

export default {
  fetch: withSupabase({ auth:"user" }, async(req,ctx)=>{
    const opt=options(req); if(opt)return opt;
    try{
      const body=await req.json();
      const {
        nama,
        nim=null,
        email,
        kind,
        organisasi_id=null,
        jabatan=null
      }=body;

      const {data:admin}=await ctx.supabaseAdmin
        .from("profiles")
        .select("tipe,nama")
        .eq("id",ctx.user.id)
        .maybeSingle();

      if(admin?.tipe!=="admin"){
        return json({error:"Hanya Admin Sistem yang dapat membuat akun awal."},403);
      }

      if(!nama?.trim() || !email?.trim() || !kind){
        return json({error:"Nama, email, dan jenis akun wajib diisi."},400);
      }

      const type=profileType(kind);
      const studentHead=["presiden_bem","ketua_organisasi"].includes(kind);

      if(studentHead && !nim?.trim()){
        return json({error:"NIM wajib diisi untuk akun pimpinan mahasiswa."},400);
      }

      if(["presiden_bem","ketua_organisasi","dosen"].includes(kind) && !organisasi_id){
        return json({error:"Organisasi wajib dipilih untuk akun ini."},400);
      }

      if(kind==="presiden_bem"){
        const {data:org}=await ctx.supabaseAdmin
          .from("organisasi")
          .select("id,nama,tipe")
          .eq("id",organisasi_id)
          .maybeSingle();
        if(!org || org.tipe!=="BEM"){
          return json({error:"Presiden BEM harus ditetapkan pada organisasi tipe BEM."},400);
        }
      }

      if(kind==="ketua_organisasi"){
        const {data:org}=await ctx.supabaseAdmin
          .from("organisasi")
          .select("id,nama,tipe")
          .eq("id",organisasi_id)
          .maybeSingle();
        if(!org || !["HMJ","UKM","Club"].includes(org.tipe)){
          return json({error:"Ketua organisasi awal hanya untuk HMJ, UKM, atau Club."},400);
        }
      }

      if(kind==="dosen"){
        const {data:org}=await ctx.supabaseAdmin
          .from("organisasi")
          .select("id,nama,tipe")
          .eq("id",organisasi_id)
          .maybeSingle();
        if(!org){
          return json({error:"Organisasi pembimbing tidak ditemukan."},400);
        }
      }

      const password=randomPassword();

      const {data:user,error:ue}=await ctx.supabaseAdmin.auth.admin.createUser({
        email:email.trim(),
        password,
        email_confirm:true,
        user_metadata:{
          nama:nama.trim(),
          must_change_password:true
        }
      });

      if(ue) return json({error:ue.message},400);

      let profileMade=false, membershipId:string|null=null, mentorId:string|null=null;
      try{
        const {error:pe}=await ctx.supabaseAdmin.from("profiles").insert({
          id:user.user.id,
          nim:studentHead ? nim?.trim() : null,
          nama:nama.trim(),
          email:email.trim(),
          tipe:type,
          status:"aktif"
        });
        if(pe) throw pe;
        profileMade=true;

        if(kind==="presiden_bem"){
          const {data:m,error:me}=await ctx.supabaseAdmin.from("keanggotaan").insert({
            akun_id:user.user.id,
            organisasi_id,
            jabatan:"Presiden",
            status:"aktif",
            ditetapkan_oleh:ctx.user.id
          }).select("id").single();
          if(me) throw me;
          membershipId=m.id;
        }

        if(kind==="ketua_organisasi"){
          const {data:m,error:me}=await ctx.supabaseAdmin.from("keanggotaan").insert({
            akun_id:user.user.id,
            organisasi_id,
            jabatan:"Ketua",
            status:"aktif",
            ditetapkan_oleh:ctx.user.id
          }).select("id").single();
          if(me) throw me;
          membershipId=m.id;
        }

        if(kind==="dosen"){
          const {data:m,error:me}=await ctx.supabaseAdmin.from("pembimbing_organisasi").insert({
            akun_id:user.user.id,
            organisasi_id,
            status:"aktif",
            ditetapkan_oleh:ctx.user.id
          }).select("id").single();
          if(me) throw me;
          mentorId=m.id;
        }

        await transport.sendMail({
          from:Deno.env.get("SMTP_FROM")!,
          to:email.trim(),
          subject:"Akun awal SIMA MHS",
          text:
            "Halo "+nama.trim()+"\\n\\n"+
            "Akun SIMA MHS Anda telah dibuat oleh Admin Sistem.\\n"+
            "Email: "+email.trim()+"\\n"+
            "Kata sandi sementara: "+password+"\\n\\n"+
            "Login pertama wajib mengganti kata sandi sementara.",
          html:
            "<p>Halo "+nama.trim()+"</p>"+
            "<p>Akun SIMA MHS Anda telah dibuat oleh Admin Sistem.</p>"+
            "<p><b>Email:</b> "+email.trim()+"<br><b>Kata sandi sementara:</b> "+password+"</p>"+
            "<p>Login pertama wajib mengganti kata sandi sementara.</p>"
        });

        await ctx.supabaseAdmin.from("jejak_audit").insert({
          akun_id:ctx.user.id,
          sebagai:"Admin",
          aksi:"akun_awal_dibuat",
          objek:"profiles",
          objek_id:user.user.id,
          nilai_baru:{
            nama:nama.trim(),
            email:email.trim(),
            tipe:type,
            kind,
            organisasi_id,
            jabatan
          }
        });

        return json({
          ok:true,
          account_id:user.user.id,
          profile_type:type
        });
      }catch(e){
        if(mentorId) await ctx.supabaseAdmin.from("pembimbing_organisasi").delete().eq("id",mentorId);
        if(membershipId) await ctx.supabaseAdmin.from("keanggotaan").delete().eq("id",membershipId);
        if(profileMade) await ctx.supabaseAdmin.from("profiles").delete().eq("id",user.user.id);
        await ctx.supabaseAdmin.auth.admin.deleteUser(user.user.id);
        throw e;
      }
    }catch(e){
      return json({error:e instanceof Error?e.message:String(e)},500);
    }
  })
};
