import { withSupabase } from "npm:@supabase/server@^1";
import nodemailer from "npm:nodemailer@^9";
import { json, options } from "../_shared/http.ts";

function sha256(value:string){ return crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)); }
function hex(bytes:ArrayBuffer){ return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join(""); }
function otp(){ return String(Math.floor(100000 + Math.random()*900000)); }

const transport = nodemailer.createTransport({
  host:Deno.env.get("SMTP_HOSTNAME")!,
  port:Number(Deno.env.get("SMTP_PORT")||587),
  secure:Deno.env.get("SMTP_SECURE")==="true",
  auth:{user:Deno.env.get("SMTP_USERNAME")!,pass:Deno.env.get("SMTP_PASSWORD")!},
});

export default {
  fetch: withSupabase({ auth:"user" }, async(req,ctx)=>{
    const opt=options(req); if(opt)return opt;
    try{
      const {action="request",email,code}=await req.json();
      const {data:me}=await ctx.supabaseAdmin.from("profiles").select("tipe,email,nama").eq("id",ctx.user.id).maybeSingle();
      if(me?.tipe!=="admin") return json({error:"Sesi ini bukan akun Admin institusi."},403);
      const {data:op}=await ctx.supabaseAdmin.from("admin_operator").select("id,email,aktif").eq("akun_id",ctx.user.id).eq("aktif",true).eq("email",email).maybeSingle();
      if(!op) return json({error:"Email operator tidak terdaftar sebagai operator aktif."},403);

      if(action==="request"){
        const value=otp(), hash=hex(await sha256(value)), expires=new Date(Date.now()+5*60*1000).toISOString();
        await ctx.supabaseAdmin.from("admin_otp").update({used_at:new Date().toISOString()}).eq("admin_akun_id",ctx.user.id).is("used_at",null);
        const {error}=await ctx.supabaseAdmin.from("admin_otp").insert({admin_akun_id:ctx.user.id,operator_id:op.id,code_hash:hash,expires_at:expires});
        if(error)return json({error:error.message},400);
        await transport.sendMail({from:Deno.env.get("SMTP_FROM")!,to:email,subject:"OTP Admin SIMA MHS",text:"Kode OTP Admin SIMA MHS: "+value+"\nBerlaku 5 menit.",html:"<p>Kode OTP Admin SIMA MHS:</p><h2>"+value+"</h2><p>Berlaku 5 menit.</p>"});
        return json({ok:true,expires_at:expires});
      }

      if(action==="verify"){
        if(!code)return json({error:"Kode OTP wajib."},400);
        const hash=hex(await sha256(String(code)));
        const {data:row}=await ctx.supabaseAdmin.from("admin_otp").select("id,expires_at").eq("admin_akun_id",ctx.user.id).eq("operator_id",op.id).eq("code_hash",hash).is("used_at",null).order("created_at",{ascending:false}).limit(1).maybeSingle();
        if(!row || new Date(row.expires_at).getTime()<Date.now()) return json({error:"OTP salah atau sudah kedaluwarsa."},400);
        await ctx.supabaseAdmin.from("admin_otp").update({used_at:new Date().toISOString()}).eq("id",row.id);
        await ctx.supabaseAdmin.from("jejak_audit").insert({akun_id:ctx.user.id,sebagai:"Admin",aksi:"admin_otp_verified",objek:"admin_operator",objek_id:op.id});
        return json({ok:true});
      }
      return json({error:"Action tidak valid."},400);
    }catch(e){return json({error:e instanceof Error?e.message:String(e)},500);}
  }),
};
