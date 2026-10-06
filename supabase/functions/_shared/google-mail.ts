const APPS_SCRIPT_URL = Deno.env.get("APPS_SCRIPT_URL") || "";
const SIMAWA_MAIL_TOKEN = Deno.env.get("SIMAWA_MAIL_TOKEN") || "";

export async function sendAccountEmail(input:{
  name:string;
  email:string;
  password:string;
  role:string;
}) {
  if(!APPS_SCRIPT_URL || !SIMAWA_MAIL_TOKEN) {
    return {
      sent:false,
      skipped:true,
      reason:"APPS_SCRIPT_URL/SIMAWA_MAIL_TOKEN belum dikonfigurasi."
    };
  }

  try {
    const res = await fetch(APPS_SCRIPT_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        token:SIMAWA_MAIL_TOKEN,
        type:"sima_account",
        name:input.name,
        email:input.email,
        password:input.password,
        role:input.role,
        loginUrl:"https://simawa.vercel.app"
      })
    });

    const body=await res.text();

    if(!res.ok) {
      return {
        sent:false,
        skipped:false,
        reason:"Apps Script HTTP "+res.status+": "+body.slice(0,300)
      };
    }

    let data:any={};
    try{data=JSON.parse(body)}catch(_){}

    if(data.ok===false) {
      return {
        sent:false,
        skipped:false,
        reason:data.error||"Apps Script menolak pengiriman email."
      };
    }

    return {sent:true,skipped:false};
  } catch(e) {
    return {
      sent:false,
      skipped:false,
      reason:"Apps Script tidak dapat dihubungi: "+(e instanceof Error?e.message:String(e))
    };
  }
}
