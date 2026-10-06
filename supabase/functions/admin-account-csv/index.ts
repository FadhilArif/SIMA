import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...corsHeaders,"Content-Type":"application/json"}
  });
}

function parseCsv(input:string){
  const rows:string[][]=[];
  let row:string[]=[];
  let cell="";
  let quoted=false;

  for(let i=0;i<input.length;i++){
    const c=input[i],n=input[i+1];

    if(c==='"'&&quoted&&n==='"'){
      cell+='"';
      i++;
      continue;
    }

    if(c==='"'){
      quoted=!quoted;
      continue;
    }

    if(c===','&&!quoted){
      row.push(cell.trim());
      cell="";
      continue;
    }

    if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&n==='\n')i++;
      row.push(cell.trim());
      cell="";
      if(row.some(Boolean))rows.push(row);
      row=[];
      continue;
    }

    cell+=c;
  }

  row.push(cell.trim());
  if(row.some(Boolean))rows.push(row);

  return rows;
}

function col(headers:string[],name:string){
  const clean=(s:string)=>s.toLowerCase().replace(/[^a-z0-9_]/g,"");
  return headers.findIndex(h=>clean(h)===clean(name));
}

function randomPassword(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes=crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes,b=>chars[b%chars.length]).join("")+"!";
}

function profileType(kind:string){
  if(kind==="wakil_rektor")return "wakil_rektor";
  if(kind==="staf_keuangan")return "staf_keuangan";
  if(kind==="dosen")return "dosen";
  return "mahasiswa";
}

async function sendAccountEmail(input:{name:string;email:string;password:string;role:string}){
  const url=Deno.env.get("APPS_SCRIPT_URL")||"";
  const token=Deno.env.get("SIMAWA_MAIL_TOKEN")||"";

  if(!url||!token){
    return {sent:false,reason:"APPS_SCRIPT_URL atau SIMAWA_MAIL_TOKEN belum dikonfigurasi."};
  }

  try{
    const response=await fetch(url,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        token,
        type:"sima_account",
        name:input.name,
        email:input.email,
        password:input.password,
        role:input.role,
        loginUrl:"https://simawa.vercel.app"
      })
    });

    const body=await response.text();

    if(!response.ok){
      return {sent:false,reason:"Apps Script HTTP "+response.status+": "+body.slice(0,300)};
    }

    let data:any={};
    try{data=JSON.parse(body);}catch(_){}

    if(data.ok===false){
      return {sent:false,reason:data.error||"Apps Script menolak pengiriman email."};
    }

    return {sent:true};
  }catch(e){
    return {sent:false,reason:"Apps Script tidak dapat dihubungi: "+(e instanceof Error?e.message:String(e))};
  }
}

async function getRequestUser(req:Request){
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")){
    throw new Error("Sesi login tidak ditemukan.");
  }

  const token=auth.slice(7);
  const supabase=createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const {data,error}=await supabase.auth.getUser(token);

  if(error||!data.user){
    throw new Error("Sesi login tidak valid.");
  }

  return {supabase,user:data.user};
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return json({ok:true});

  try{
    const {supabase,user}=await getRequestUser(req);

    const {data:admin,error:adminError}=await supabase
      .from("profiles")
      .select("id,tipe")
      .eq("id",user.id)
      .maybeSingle();

    if(adminError)throw adminError;

    if(admin?.tipe!=="admin"){
      return json({error:"Hanya Admin Sistem yang dapat membuat akun awal."},403);
    }

    const body=await req.json();
    const action=body?.action||"preview";
    const csv=body?.csv;

    if(typeof csv!=="string"||!csv.trim()){
      return json({error:"CSV kosong."},400);
    }

    const rows=parseCsv(csv);

    if(rows.length<2){
      return json({error:"CSV harus memiliki header dan minimal satu baris."},400);
    }

    const headers=rows[0];
    const map={
      kind:col(headers,"jenis_akun"),
      nama:col(headers,"nama"),
      nim:col(headers,"nim"),
      email:col(headers,"email"),
      organisasi:col(headers,"organisasi_nama"),
      periode:col(headers,"periode")
    };

    if(map.kind<0||map.nama<0||map.email<0){
      return json({error:"Kolom minimal: jenis_akun,nama,email."},400);
    }

    const allowed=[
      "wakil_rektor",
      "staf_keuangan",
      "dosen",
      "presiden_bem",
      "ketua_organisasi"
    ];

    const parsed=rows.slice(1).map((r,i)=>{
      const kind=(r[map.kind]||"").trim().toLowerCase();
      const nama=(r[map.nama]||"").trim();
      const email=(r[map.email]||"").trim();
      const nim=map.nim>=0?(r[map.nim]||"").trim():"";
      const organisasi=map.organisasi>=0?(r[map.organisasi]||"").trim():"";
      const periode=map.periode>=0?(r[map.periode]||"").trim():"";

      let pesan="";
      if(!allowed.includes(kind))pesan="jenis_akun tidak valid";
      else if(!nama||!email.includes("@"))pesan="nama/email tidak valid";
      else if(["presiden_bem","ketua_organisasi"].includes(kind)&&!nim)pesan="NIM wajib untuk pimpinan mahasiswa";
      else if(["dosen","presiden_bem","ketua_organisasi"].includes(kind)&&!organisasi)pesan="organisasi_nama wajib diisi";

      return {
        nomor_baris:i+2,
        kind,
        nama,
        email,
        nim,
        organisasi,
        periode,
        status:pesan?"error":"valid",
        pesan
      };
    });

    if(action==="preview"){
      return json({
        ok:true,
        total:parsed.length,
        valid:parsed.filter(x=>x.status==="valid").length,
        invalid:parsed.filter(x=>x.status==="error").length,
        rows:parsed
      });
    }

    if(action!=="commit"){
      return json({error:"Action tidak valid."},400);
    }

    let created=0;
    let skipped=0;
    const results:any[]=[];

    for(const r of parsed){
      if(r.status==="error"){
        skipped++;
        results.push(r);
        continue;
      }

      let organisasiId:string|null=null;

      if(r.organisasi){
        const {data:orgs,error:orgError}=await supabase
          .from("organisasi")
          .select("id,nama,tipe,periode_id")
          .eq("nama",r.organisasi)
          .eq("aktif",true);

        if(orgError){
          skipped++;
          results.push({...r,status:"error",pesan:orgError.message});
          continue;
        }

        const matches:any[]=[];
        for(const org of orgs||[]){
          if(!r.periode){
            matches.push(org);
            continue;
          }

          const {data:per,error:perError}=await supabase
            .from("periode")
            .select("id,nama")
            .eq("id",org.periode_id)
            .maybeSingle();

          if(!perError&&per?.nama===r.periode){
            matches.push(org);
          }
        }

        if(matches.length!==1){
          skipped++;
          results.push({
            ...r,
            status:"error",
            pesan:matches.length===0?"Organisasi/periode tidak ditemukan":"Organisasi tidak unik; isi periode"
          });
          continue;
        }

        const org=matches[0];

        if(r.kind==="presiden_bem"&&org.tipe!=="BEM"){
          skipped++;
          results.push({...r,status:"error",pesan:"Presiden BEM harus memakai organisasi BEM"});
          continue;
        }

        if(r.kind==="ketua_organisasi"&&!["HMJ","UKM","Club"].includes(org.tipe)){
          skipped++;
          results.push({...r,status:"error",pesan:"Ketua organisasi hanya HMJ/UKM/Club"});
          continue;
        }

        organisasiId=org.id;
      }

      const password=randomPassword();

      const {data:user,error:userError}=await supabase.auth.admin.createUser({
        email:r.email,
        password,
        email_confirm:true,
        user_metadata:{nama:r.nama,must_change_password:true}
      });

      if(userError){
        skipped++;
        results.push({...r,status:"error",pesan:userError.message});
        continue;
      }

      let profileMade=false;
      let membershipId:string|null=null;
      let mentorId:string|null=null;

      try{
        const {error:profileError}=await supabase.from("profiles").insert({
          id:user.user.id,
          nim:["presiden_bem","ketua_organisasi"].includes(r.kind)?(r.nim||null):null,
          nama:r.nama,
          email:r.email,
          tipe:profileType(r.kind),
          status:"aktif"
        });

        if(profileError)throw profileError;
        profileMade=true;

        if(r.kind==="presiden_bem"||r.kind==="ketua_organisasi"){
          const jabatan=r.kind==="presiden_bem"?"Presiden":"Ketua";

          const {data:membership,error:membershipError}=await supabase
            .from("keanggotaan")
            .insert({
              akun_id:user.user.id,
              organisasi_id:organisasiId,
              jabatan,
              status:"aktif",
              ditetapkan_oleh:user.id
            })
            .select("id")
            .single();

          if(membershipError)throw membershipError;
          membershipId=membership.id;
        }

        if(r.kind==="dosen"){
          const {data:mentor,error:mentorError}=await supabase
            .from("pembimbing_organisasi")
            .insert({
              akun_id:user.user.id,
              organisasi_id:organisasiId,
              status:"aktif",
              ditetapkan_oleh:user.id
            })
            .select("id")
            .single();

          if(mentorError)throw mentorError;
          mentorId=mentor.id;
        }

        const mail=await sendAccountEmail({
          name:r.nama,
          email:r.email,
          password,
          role:r.kind
        });

        await supabase.from("jejak_audit").insert({
          akun_id:user.id,
          sebagai:"Admin",
          aksi:"akun_awal_dibuat_csv",
          objek:"profiles",
          objek_id:user.user.id,
          nilai_baru:{
            nama:r.nama,
            email:r.email,
            kind:r.kind,
            organisasi_id:organisasiId,
            email_status:mail.sent?"terkirim":"belum_terkirim"
          }
        });

        created++;

        results.push({
          ...r,
          status:"sukses",
          password,
          email_sent:mail.sent,
          email_message:mail.sent?"Kredensial dikirim via Google Apps Script.":mail.reason||"Email belum terkirim."
        });

      }catch(error){
        if(mentorId)await supabase.from("pembimbing_organisasi").delete().eq("id",mentorId);
        if(membershipId)await supabase.from("keanggotaan").delete().eq("id",membershipId);
        if(profileMade)await supabase.from("profiles").delete().eq("id",user.user.id);

        await supabase.auth.admin.deleteUser(user.user.id);

        skipped++;
        results.push({
          ...r,
          status:"error",
          pesan:error instanceof Error?error.message:String(error)
        });
      }
    }

    return json({
      ok:true,
      created,
      skipped,
      results,
      delivery:"google_apps_script"
    });

  }catch(error){
    return json({
      error:error instanceof Error?error.message:String(error)
    },500);
  }
});
