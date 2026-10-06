const APPS_SCRIPT_URL = Deno.env.get("APPS_SCRIPT_URL") || "";
const APPS_SCRIPT_TOKEN = Deno.env.get("APPS_SCRIPT_TOKEN") || "";

export async function sendAccountEmail(input:{
  name:string;
  email:string;
  password:string;
  role:string;
}) {
  if(!APPS_SCRIPT_URL || !APPS_SCRIPT_TOKEN) {
    return { sent:false, skipped:true, reason:"APPS_SCRIPT_URL/APPS_SCRIPT_TOKEN belum dikonfigurasi." };
  }

  const payload = {
    token: APPS_SCRIPT_TOKEN,
    type: "sima_account",
    name: input.name,
    email: input.email,
    password: input.password,
    role: input.role,
    loginUrl: "https://simawa.vercel.app"
  };

  const res = await fetch(APPS_SCRIPT_URL,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });

  const text=await res.text();
  if(!res.ok) {
    return { sent:false, skipped:false, reason:"Apps Script HTTP "+res.status+": "+text.slice(0,300) };
  }

  let data:any={};
  try{data=JSON.parse(text)}catch(_){}

  if(data.ok===false) return { sent:false, skipped:false, reason:data.error||"Apps Script menolak pengiriman email." };
  return { sent:true, skipped:false };
}
