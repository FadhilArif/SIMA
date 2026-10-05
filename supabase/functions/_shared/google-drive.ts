const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}

function textB64url(value: string) {
  return b64url(new TextEncoder().encode(value));
}

function pemToDer(pem: string) {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\s/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function accessToken() {
  const email = Deno.env.get("GOOGLE_CLIENT_EMAIL");
  const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Kredensial Google Drive belum dikonfigurasi.");

  const now = Math.floor(Date.now() / 1000);
  const header = textB64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = textB64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + "." + claim;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  ));
  const assertion = unsigned + "." + b64url(signature);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error("Gagal memperoleh token Google Drive.");
  const data = await res.json();
  return data.access_token as string;
}

async function driveFetch(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer " + token);
  const res = await fetch(DRIVE_API + path, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error("Google Drive: " + body.slice(0, 500));
  }
  return res;
}

export async function findOrCreateFolder(name: string, parentId?: string) {
  const escaped = name.replace(/'/g, "\\'");
  const q = [
    "trashed = false",
    "mimeType = 'application/vnd.google-apps.folder'",
    "name = '" + escaped + "'",
    parentId ? "'" + parentId + "' in parents" : "'root' in parents",
  ].join(" and ");
  const list = await driveFetch("/files?" + new URLSearchParams({
    q,
    pageSize: "10",
    fields: "files(id,name)",
    spaces: "drive",
  }));
  const found = await list.json();
  if (found.files?.[0]) return found.files[0].id;

  const created = await driveFetch("/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  return (await created.json()).id;
}

export async function ensureFolderPath(names: string[]) {
  let parent = Deno.env.get("GOOGLE_DRIVE_ROOT_FOLDER_ID") || undefined;
  for (const name of names.filter(Boolean)) parent = await findOrCreateFolder(name, parent);
  if (!parent) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID belum dikonfigurasi.");
  return parent;
}

export async function createResumableUpload(meta: { name: string; mimeType: string; size: number; parentId: string }) {
  const token = await accessToken();
  const res = await fetch(DRIVE_UPLOAD + "?uploadType=resumable", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": meta.mimeType,
      "X-Upload-Content-Length": String(meta.size),
    },
    body: JSON.stringify({
      name: meta.name,
      parents: [meta.parentId],
    }),
  });
  if (!res.ok) throw new Error("Gagal membuat sesi upload Google Drive: " + (await res.text()).slice(0, 500));
  const location = res.headers.get("Location");
  if (!location) throw new Error("Google Drive tidak mengembalikan URL sesi upload.");
  return location;
}

export async function getDriveFile(fileId: string) {
  const res = await driveFetch("/files/" + encodeURIComponent(fileId) + "?" + new URLSearchParams({
    fields: "id,name,mimeType,size,parents,webViewLink,md5Checksum,trashed",
  }));
  return await res.json();
}
