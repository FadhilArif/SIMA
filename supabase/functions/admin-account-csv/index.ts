import { withSupabase } from "npm:@supabase/server@^1";
import nodemailer from "npm:nodemailer@^9";
import { json, options } from "../_shared/http.ts";

function parseCsv(input:string){
  const rows:string[][]=[]; let row:string[]=[]; let cell=""; let quoted=false;
  for(let i=0;i<input.length;i++){
    const c=input[i], n=input[i+1];
    if(c=='"' && quoted && n=='"'){cell+='"';i++;continue;}
    if(c=='"'){quoted=!quoted;continue;}
    if(c===',' && !quoted){row.push(cell.trim());cell="";continue;}
    if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&n==='\n')i++;
      row.push(cell.trim());cell="";
      if(row.some(Boolean))rows.push(row);
      row=[];continue;
    }
    cell+=c;
  }
  row.push(cell.trim());
  if(row.some(Boolean))rows.push(row);
  return rows;
}
function idx(headers:string[],name:string){
  const target=name.toLowerCase().replace(/[^a-z0-9_]/g,"");
  return headers.findIndex(h=>h.toLowerCase().replace(/[^a-z0-9_]/g,"")===target);
}
function randomPassword(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes=crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes,b=>chars[b%chars.length]).join("")+"!";
}
function profileType(kind:string){
  if(kind==="wakil_rektor") return "wakil_rektor";
  if(kind==="staf_keuangan") return "staf_keuangan";
  if(kind==="dosen") return "dosen";
  return "mahasiswa";
}
const transport=nodemailer.createTransport({
  host:Deno.env.get("SMTP_HOSTNAME")!,
  port:Number(Deno.env.get("SMTP_PORT")||587),
  secure:Deno.env.get("SMTP_SECURE")==="true",
  auth:{user:Deno.env.get("SMTP_USERNAME")!,pass:Deno.env.get("SMTP_PASSWORD")!}
});

export default {
  fetch:withSupabase({auth:"user"},async(req,ctx)=>{
    const opt=options(req);if(opt)return opt;
    try{
      const body=await req.json();
      const {csv,action="preview"}=body;
      const {data:admin}=await ctx.supabaseAdmin.from("profiles").select("tipe").eq("id",ctx.user.id).maybeSingle();
      if(admin?.tipe!=="admin")return json({error:"Hanya Admin Sistem yang dapat membuat akun awal."},403);
      if(typeof csv!=="string"||!csv.trim())return json({error:"CSV kosong."},400);

      const rows=parseCsv(csv);
      if(rows.length<2)return json({error:"CSV harus memiliki header dan minimal satu baris."},400);
      const headers=rows[0];
      const map={
        kind:idx(headers,"jenis_akun"),
        nama:idx(headers,"nama"),
        nim:idx(headers,"nim"),
        email:idx(headers,"email"),
        organisasi:idx(headers,"organisasi_nama"),
        periode:idx(headers,"periode")
      };
      if(map.kind<0||map.nama<0||map.email<0)return json({error:"Kolom minimal: jenis_akun,nama,email."},400);

      const allowedKinds=["wakil_rektor","staf_keuangan","dosen","presiden_bem","ketua_organisasi"];
      const parsed=rows.slice(1).map((r,i)=>{
        const kind=(r[map.kind]||"").trim().toLowerCase();
        const nama=(r[map.nama]||"").trim();
        const email=(r[map.email]||"").trim();
        const nim=map.nim>=0?(r[map.nim]||"").trim():"";
        const organisasi=map.organisasi>=0?(r[map.organisasi]||"").trim():"";
        const periode=map.periode>=0?(r[map.periode]||"").trim():"";
        let pesan="";
        if(!allowedKinds.includes(kind))pesan="jenis_akun tidak valid";
        else if(!nama||!email.includes("@"))pesan="nama/email tidak valid";
        else if(["presiden_bem","ketua_organisasi"].includes(kind)&&!nim)pesan="NIM wajib untuk pimpinan mahasiswa";
        else if(["dosen","presiden_bem","ketua_organisasi"].includes(kind)&&!organisasi)pesan="organisasi_nama wajib diisi";
        return {nomor_baris:i+2,kind,nama,email,nim,organisasi,periode,status:pesan?"error":"valid",pesan};
      });

      if(action==="preview")return json({ok:true,total:parsed.length,valid:parsed.filter(x=>x.status==="valid").length,invalid:parsed.filter(x=>x.status==="error").length,rows:parsed});

      if(action!=="commit")return json({error:"Action tidak valid."},400);

      let created=0,skipped=0;const results=[];
      for(const r of parsed){
        if(r.status==="error"){skipped++;results.push(r);continue;}

        let organisasi_id:string|null=null;
        if(r.organisasi){
          let q=ctx.supabaseAdmin.from("organisasi").select("id,nama,tipe,periode:periode_id(nama)").eq("nama",r.organisasi).eq("aktif",true);
          if(r.periode)q=q.eq("periode.nama",r.periode);
          const {data:orgs,error:oe}=await q;
          if(oe||!orgs?.length){
            skipped++;results.push({...r,status:"error",pesan:"Organisasi/periode tidak ditemukan"});continue;
          }
          if(orgs.length>1){skipped++;results.push({...r,status:"error",pesan:"Nama organisasi tidak unik; isi periode untuk memperjelas"});continue;}
          const org=orgs[0];
          if(r.kind==="presiden_bem"&&org.tipe!=="BEM"){skipped++;results.push({...r,status:"error",pesan:"Presiden BEM harus memilih organisasi BEM"});continue;}
          if(r.kind==="ketua_organisasi"&&!["HMJ","UKM","Club"].includes(org.tipe)){skipped++;results.push({...r,status:"error",pesan:"Ketua organisasi hanya HMJ/UKM/Club"});continue;}
          organisasi_id=org.id;
        }

        const password=randomPassword();
        const {data:u,error:ue}=await ctx.supabaseAdmin.auth.admin.createUser({
          email:r.email,password,email_confirm:true,user_metadata:{nama:r.nama,must_change_password:true}
        });
        if(ue){skipped++;results.push({...r,status:"error",pesan:ue.message});continue;}

        let profileMade=false,membershipId:string|null=null,mentorId:string|null=null;
        try{
          const {error:pe}=await ctx.supabaseAdmin.from("profiles").insert({
            id:u.user.id,nim:["presiden_bem","ketua_organisasi"].includes(r.kind)?r.nim||null:null,
            nama:r.nama,email:r.email,tipe:profileType(r.kind),status:"aktif"
          });
          if(pe)throw pe;profileMade=true;

          if(r.kind==="presiden_bem"||r.kind==="ketua_organisasi"){
            const jab=r.kind==="presiden_bem"?"Presiden":"Ketua";
            const {data:m,error:me}=await ctx.supabaseAdmin.from("keanggotaan").insert({
              akun_id:u.user.id,organisasi_id,jabatan:jab,status:"aktif",ditetapkan_oleh:ctx.user.id
            }).select("id").single();
            if(me)throw me;membershipId=m.id;
          }
          if(r.kind==="dosen"){
            const {data:m,error:me}=await ctx.supabaseAdmin.from("pembimbing_organisasi").insert({
              akun_id:u.user.id,organisasi_id,status:"aktif",ditetapkan_oleh:ctx.user.id
            }).select("id").single();
            if(me)throw me;mentorId=m.id;
          }

          await transport.sendMail({
            from:Deno.env.get("SMTP_FROM")!,to:r.email,subject:"Akun awal SIMA MHS",
            text:"Halo "+r.nama+"\n\nAkun SIMA MHS Anda telah dibuat oleh Admin Sistem.\nEmail: "+r.email+"\nKata sandi sementara: "+password+"\n\nLogin pertama wajib mengganti kata sandi sementara.",
            html:"<p>Halo "+r.nama+"</p><p>Akun SIMA MHS Anda telah dibuat oleh Admin Sistem.</p><p><b>Email:</b> "+r.email+"<br><b>Kata sandi sementara:</b> "+password+"</p><p>Login pertama wajib mengganti kata sandi sementara.</p>"
          });
          await ctx.supabaseAdmin.from("jejak_audit").insert({
            akun_id:ctx.user.id,sebagai:"Admin",aksi:"akun_awal_dibuat_csv",objek:"profiles",objek_id:u.user.id,
            nilai_baru:{nama:r.nama,email:r.email,kind:r.kind,organisasi_id}
          });
          created++;results.push({...r,status:"sukses"});
        }catch(e){
          if(mentorId)await ctx.supabaseAdmin.from("pembimbing_organisasi").delete().eq("id",mentorId);
          if(membershipId)await ctx.supabaseAdmin.from("keanggotaan").delete().eq("id",membershipId);
          if(profileMade)await ctx.supabaseAdmin.from("profiles").delete().eq("id",u.user.id);
          await ctx.supabaseAdmin.auth.admin.deleteUser(u.user.id);
          skipped++;results.push({...r,status:"error",pesan:e instanceof Error?e.message:String(e)});
        }
      }
      return json({ok:true,created,skipped,results});
    }catch(e){
      return json({error:e instanceof Error?e.message:String(e)},500);
    }
  })
};
