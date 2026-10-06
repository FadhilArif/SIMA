// Isi dari Supabase: Project Settings > API. Kosong = mode demo.
const SUPABASE_URL = 'https://vgzhkvxzzvllmricfzto.supabase.co', SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnemhrdnh6enZsbG1yaWNmenRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNzQxNjAsImV4cCI6MjEwNjc1MDE2MH0.iVvnXgFfYimUuFytlHQBM4OXDyVGirWY_eReM-8Dm34';
const sb = SUPABASE_URL && window.supabase ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const $ = s => document.querySelector(s), $$ = (s,r=document) => [...r.querySelectorAll(s)], rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID'), esc = v => String(v ?? '').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[m]));
const ST = { draft:['Draft',''], proposal_diajukan:['Menunggu review','wa'], revisi:['Revisi','er'], disetujui:['Disetujui','ok'], berjalan:['Berjalan','ok'], selesai:['Selesai','bl'], tidak_terlaksana:['Tidak terlaksana','er'] };
function currentContext(){ return S.ctxs[S.ctx] || S.ctxs[0] || {kind:'none',org:'Tanpa konteks',peran:'Pengguna'}; }

const S = {
  user:{ nama:'', email:'' },
  profile:{ tipe:'mahasiswa' },
  ctx:0, view:'beranda', tab:'semua', q:'', orgId:null,
  ctxs:[], proker:[]
};

const MENU_MAP = {
  organisasi: [['Utama',[['beranda','Beranda'],['proker','Proker'],['undangan','Undangan kolaborasi'],['galeri','Galeri'],['laporan','Laporan akhir'],['struktur','Struktur dan anggota']]]],
  bph: [['Utama',[['beranda','Beranda'],['proker','Semua proker'],['inbox','Inbox review'],['rapat','Rapat'],['galeri','Galeri pemantau'],['plafon','Anggaran'],['struktur','Struktur BEM']]]],
  review: [['Utama',[['beranda','Beranda'],['inbox','Inbox review'],['proker','Proker binaan'],['galeri','Galeri binaan']]]],
  pembimbing: [['Utama',[['beranda','Beranda'],['inbox','Inbox review'],['cair','Pencairan dan verifikasi'],['proker','Proker'],['galeri','Galeri']]]],
  wakil_rektor: [['Utama',[['beranda','Beranda'],['plafon','Plafon'],['cair','Anggaran & pencairan'],['inbox','Inbox tahap BEM'],['proker','Semua proker'],['galeri','Galeri pemantau'],['audit','Jejak audit']]]],
  staf_keuangan: [['Anggaran',[['plafon','Plafon'],['cair','Dashboard anggaran']]]],
  admin: [['Admin',[['periode','Periode'],['akun','Akun dan penetapan'],['audit','Jejak audit']]]],
  none: []
};

function menuForContext(ctx){ return MENU_MAP[ctx?.kind] || MENU_MAP.none; }
function canCreateProker(ctx){
  return ['organisasi','bph'].includes(ctx?.kind);
}

function roleLabel(tipe){
  return ({
    admin:'Admin Sistem',
    wakil_rektor:'Wakil Rektor Bidang Kemahasiswaan',
    staf_keuangan:'Staf Keuangan',
    dosen:'Dosen Pembimbing',
    mahasiswa:'Mahasiswa'
  })[tipe] || tipe || 'Pengguna';
}

async function loadUserAccessContext(){
  if(!sb || !S.user?.id){
    S.profile={tipe:'mahasiswa'};
    S.ctxs=[];
    S.orgId=null;
    return;
  }

  const [profileRes,membershipRes,coordRes,mentorRes] = await Promise.all([
    sb.from('profiles').select('id,nama,email,tipe,status').eq('id',S.user.id).maybeSingle(),
    sb.from('keanggotaan').select('organisasi_id,jabatan,status,organisasi:organisasi_id(id,nama,periode:periode_id(nama))').eq('akun_id',S.user.id).eq('status','aktif'),
    sb.from('penugasan_koordinator').select('organisasi_id,status,organisasi:organisasi_id(id,nama,periode:periode_id(nama))').eq('akun_id',S.user.id).eq('status','aktif'),
    sb.from('pembimbing_organisasi').select('organisasi_id,status,organisasi:organisasi_id(id,nama,periode:periode_id(nama))').eq('akun_id',S.user.id).eq('status','aktif')
  ]);

  if(profileRes.error) throw profileRes.error;
  S.profile=profileRes.data || {tipe:'mahasiswa'};
  S.ctxs=[];

  const add=(ctx)=>{
    const key=[ctx.kind,ctx.org_id||'global',ctx.peran||''].join(':');
    if(!S.ctxs.some(x=>x.key===key)) S.ctxs.push({...ctx,key});
  };

  const tipe=S.profile.tipe;

  if(tipe==='admin') add({kind:'admin',org_id:null,org:'Administrasi Sistem',peran:'Admin Sistem'});
  else if(tipe==='wakil_rektor') add({kind:'wakil_rektor',org_id:null,org:'Institusi',peran:'Wakil Rektor Bidang Kemahasiswaan'});
  else if(tipe==='staf_keuangan') add({kind:'staf_keuangan',org_id:null,org:'Institusi',peran:'Staf Keuangan'});

  if(membershipRes.error && !['admin','wakil_rektor','staf_keuangan'].includes(tipe)) throw membershipRes.error;
  if(coordRes.error) throw coordRes.error;
  if(mentorRes.error) throw mentorRes.error;

  for(const x of membershipRes.data||[]){
    const org=x.organisasi;
    const periode=org?.periode?.nama;
    const isBph = org?.nama?.toUpperCase()==='BEM' && ['Presiden','Wakil Presiden','Sekretaris','Bendahara'].includes(x.jabatan);
    const kind = isBph ? 'bph' : (x.jabatan==='Menteri' ? 'review' : 'organisasi');
    add({
      kind, org_id:x.organisasi_id, org:org?.nama||'Organisasi',
      peran:x.jabatan||'Anggota', periode, review:kind==='review',
      konteks: periode ? (org?.nama+' · '+x.jabatan+' · '+periode) : (org?.nama+' · '+x.jabatan)
    });
  }

  for(const x of coordRes.data||[]){
    const org=x.organisasi, periode=org?.periode?.nama;
    add({
      kind:'review', org_id:x.organisasi_id, org:org?.nama||'Organisasi',
      peran:'Koordinator', periode, review:true,
      konteks: periode ? (org?.nama+' · Koordinator · '+periode) : (org?.nama+' · Koordinator')
    });
  }

  for(const x of mentorRes.data||[]){
    const org=x.organisasi, periode=org?.periode?.nama;
    add({
      kind:'pembimbing', org_id:x.organisasi_id, org:org?.nama||'Organisasi',
      peran:'Pembimbing', periode, review:true,
      konteks: periode ? (org?.nama+' · Pembimbing · '+periode) : (org?.nama+' · Pembimbing')
    });
  }

  if(tipe==='dosen' && !S.ctxs.length) add({kind:'none',org_id:null,org:'Belum ditetapkan',peran:'Dosen'});
  if(!S.ctxs.length) add({kind:'none',org_id:null,org:'Tanpa konteks',peran:roleLabel(tipe)});

  S.ctx=0;
  S.orgId=S.ctxs[0]?.org_id || null;
}


function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.append(e); setTimeout(() => e.remove(), 2600); }
async function loadProker() {
  if (!sb || !S.orgId) { S.proker=[]; return; }
  let q = sb.from('proker').select('id,nama,ketua_pelaksana,pengajuan,tanggal_mulai,tanggal_selesai,status,organisasi_id,item_anggaran(subtotal),pencairan_dana(jumlah)').order('tanggal_mulai'); q=q.eq('organisasi_id',S.orgId); const { data, error } = await q;
  if (error) return toast('Gagal memuat proker: ' + error.message);
  S.proker = (data || []).map(p => ({ id:p.id, nama:p.nama, ketua:p.ketua_pelaksana, jenis:p.pengajuan, mulai:p.tanggal_mulai, selesai:p.tanggal_selesai, organisasi_id:p.organisasi_id, status:p.status,
    ajuan:(p.item_anggaran || []).reduce((a, i) => a + Number(i.subtotal || 0), 0), cair:(p.pencairan_dana || []).reduce((a, i) => a + Number(i.jumlah || 0), 0) }));
}
const chip = s => { const [t, c] = ST[s] || [s, '']; return `<span class="chip ${c}">${t}</span>`; };

function renderShell() {
  const ctx=currentContext(), menu=menuForContext(ctx);
  $('#nav').innerHTML = menu.map(([g,it]) => `<div class="grp">${g}</div>` + it.map(([k,t]) => `<button class="nav ${S.view===k?'on':''}" data-go="${k}">${t}</button>`).join('')).join('');
  const flat=menu.flatMap(([,it])=>it);
  const mobile=[];
  if(canCreateProker(ctx)){
    if(flat.some(([k])=>k==='beranda')) mobile.push(['beranda','Beranda']);
    if(flat.some(([k])=>k==='proker')) mobile.push(['proker','Proker']);
    mobile.push(['form','+']);
    if(flat.some(([k])=>k==='inbox')) mobile.push(['inbox','Review']);
    if(flat.some(([k])=>k==='galeri')) mobile.push(['galeri','Galeri']);
  } else {
    mobile.push(...flat.slice(0,5));
  }
  $('#bn').innerHTML=mobile.map(([k,t])=>`<button class="${k==='form'?'fab':S.view===k?'on':''}" data-go="${k}" aria-label="${t}">${t}</button>`).join('');
  $('#cx').innerHTML=S.ctxs.map((x,i)=>`<option value="${i}" ${i===S.ctx?'selected':''}>${x.konteks||x.org+(x.peran?' · '+x.peran:'')}</option>`).join('');
  const displayName=S.user?.user_metadata?.nama||S.user?.user_metadata?.name||S.profile?.nama||S.user?.email||'User';
  $('#av').textContent=displayName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
}
const V = {
  beranda: () => `<h1 class="t">Beranda</h1><p class="sub">Ringkasan aktivitas dari semua konteks Anda.</p>
  <div class="card"><h3>Belum ada data</h3><p class="sub">${S.ctxs.length ? 'Belum ada aktivitas, pengajuan, atau anggaran untuk konteks ini.' : 'Belum ada organisasi atau periode yang ditetapkan ke akun ini.'}</p></div>`,
  proker() {
    const f = S.proker.filter(p => (S.tab === 'semua' || p.status === S.tab) && p.nama.toLowerCase().includes(S.q.toLowerCase()));
    const tabs = [['semua','Semua'],['draft','Draft'],['proposal_diajukan','Menunggu review'],['revisi','Revisi'],['disetujui','Disetujui'],['berjalan','Berjalan']];
    return `<h1 class="t">Daftar program kerja</h1><p class="sub">Kelola program kerja organisasi Anda.</p>
    <div class="bar2"><input id="q" placeholder="Cari proker atau ketua" value="${S.q}"><button class="btn" data-go="form">+ Buat proker</button></div>
    <div class="tabs">${tabs.map(([k, t]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
    <div class="card"><table><thead><tr><th>Nama program kerja</th><th>Jenis</th><th>Jadwal</th><th>Diajukan</th><th>Cair</th><th>Status</th></tr></thead><tbody>
    ${f.map(p => `<tr data-id="${p.id}" data-go="detail"><td><b>${p.nama}</b><br><small>Ketua: ${p.ketua || '-'}</small></td><td>${p.jenis === 'kolaboratif' ? '<span class="chip pu">Kolaboratif</span>' : '<span class="chip">Mandiri</span>'}</td><td>${p.mulai}</td><td>${rp(p.ajuan)}</td><td>${rp(p.cair)}</td><td>${chip(p.status)}</td></tr>`).join('') || '<tr><td colspan="6">Belum ada proker pada filter ini. Buat proker baru untuk memulai.</td></tr>'}</tbody></table></div>`;
  },
  form: () => `<h1 class="t">Form proposal program kerja</h1><p class="sub">Lengkapi data kegiatan, anggaran, dan dokumen proposal.</p>
  <div class="step"><span class="on">Data kegiatan</span><span>Anggaran</span><span>Dokumen</span><span>Pengajuan</span></div>
  <form id="ff" class="card" novalidate><div class="f2"><div><label for="n">Nama program kerja *</label><input id="n" name="nama" placeholder="Contoh: Seminar Kesehatan Mental"></div>
  <div><label for="j">Jenis kegiatan</label><select id="j" name="jenis"><option value="sekali">Sekali</option><option value="berulang">Berulang</option></select></div>
  <div><label for="m">Tanggal mulai *</label><input id="m" name="mulai" type="date"></div><div><label for="e">Tanggal selesai *</label><input id="e" name="selesai" type="date"><small>Batas LPJ otomatis 7 hari setelahnya.</small></div></div>
  <label for="t">Lokasi *</label><input id="t" name="tempat"><label for="d">Deskripsi kegiatan</label><textarea id="d" name="deskripsi" rows="3"></textarea>
  <label>Penyelenggara</label><label><input type="radio" name="pengajuan" value="mandiri" checked style="width:auto"> Diselenggarakan sendiri</label>
  <label><input type="radio" name="pengajuan" value="kolaboratif" style="width:auto"> Kolaboratif dengan organisasi lain</label>
  <div id="kb" hidden><label for="dk">Dana kampus proker (Rp)</label><input id="dk" type="number" min="0" value="0"><div id="ps"></div>
  <button type="button" class="btn w" id="tp">+ Tambah peserta</button><p class="sub" id="tt"></p></div><p class="err" id="fe"></p>
  <div style="margin-top:16px;display:flex;gap:8px"><button class="btn s" type="button" data-go="proker">Batal</button><button class="btn">Simpan draft</button></div></form>`,
  review: () => '<h1 class="t">Review dokumen proposal</h1><p class="sub">Belum ada dokumen yang perlu direview.</p><div class="card">Belum ada dokumen yang perlu direview.</div>'
};
function stub(t) { return `<h1 class="t">${t}</h1><p class="sub">Halaman ini mengikuti pola yang sama dan tersambung ke tabel Supabase terkait.</p><div class="card">Belum ada data untuk ditampilkan.</div>`; }
function render() { renderShell(); $('#v').innerHTML = (V[S.view] || (() => stub(S.view)))(); if (S.view === 'form') pesertaRow(true); }

function pesertaRow(reset) { const box = $('#ps'); if (!box) return; if (reset) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', `<div class="peserta"><input placeholder="Organisasi peserta" aria-label="Organisasi peserta"><input type="number" min="0" placeholder="Porsi Rp" aria-label="Porsi plafon"><button type="button" class="btn d" data-del aria-label="Hapus peserta">×</button></div>`); }
function totalPorsi() { return [...document.querySelectorAll('.peserta input[type=number]')].reduce((a, i) => a + (+i.value || 0), 0); }
function hitung() { const dk = +$('#dk')?.value || 0, tp = totalPorsi(); if ($('#tt')) $('#tt').textContent = `Porsi peserta ${rp(tp)} dari ${rp(dk)}. Beban penyelenggara utama ${rp(Math.max(dk - tp, 0))}.`; return tp <= dk; }

document.addEventListener('click', async e => {
  const go = e.target.closest('[data-go]'); if (go) { S.view = go.dataset.go; return render(); }
  const tab = e.target.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; return render(); }
  if (e.target.id === 'tp') { pesertaRow(); return hitung(); }
  if (e.target.closest('[data-del]')) { e.target.closest('.peserta').remove(); return hitung(); }
  const act = e.target.closest('[data-act]');
  if (act) {
    const k = $('#kk').value.trim();
    if (act.dataset.act === 'revisi' && !k) return $('#ke').textContent = 'Komentar wajib diisi saat meminta revisi.';
    $('#ke').textContent = '';
    if (sb && S.dokId) { const { error } = await sb.rpc('proses_persetujuan',{p_dokumen:S.dokId,p_keputusan:act.dataset.act,p_komentar:k}); if (error) return toast(error.message); }
    toast({ revisi:'Dokumen dikembalikan untuk revisi', teruskan:'Diteruskan ke tahap berikutnya', setuju:'Dokumen disetujui' }[act.dataset.act]); S.view = 'inbox'; render();
  }
});
document.addEventListener('input', e => { if (e.target.id === 'q') { S.q = e.target.value; render(); $('#q').focus(); } if (e.target.closest('#kb')) hitung(); });
document.addEventListener('change', e => {
  if(e.target.name==='pengajuan') $('#kb').hidden=e.target.value!=='kolaboratif';
  if(e.target.id==='cx'){
    S.ctx=+e.target.value;
    S.orgId=currentContext().org_id||null;
    S.view='beranda';
    S.tab='semua';
    S.q='';
    S.proker=[];
    loadProker().then(render);
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id === 'fl') { e.preventDefault();
    if (sb) { const { data,error } = await sb.auth.signInWithPassword({ email:$('#em').value, password:$('#pw').value }); if (error) return $('#le').textContent = 'Email atau kata sandi salah.'; S.user={...data.user,nama:data.user.user_metadata?.nama||data.user.user_metadata?.name||data.user.email}; try { await loadUserAccessContext(); } catch(ex) { return $('#le').textContent=ex.message||'Gagal memuat hak akses akun.'; } await loadProker(); }
    $('#login').hidden = true; $('#app').hidden = false; if(S.user?.user_metadata?.must_change_password) S.view='change-password'; render(); }
  if (e.target.id === 'ff') { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), kolab = f.pengajuan === 'kolaboratif', er = [];
    if (!f.nama) er.push('Nama program kerja wajib diisi'); if (!f.mulai || !f.selesai) er.push('Tanggal mulai dan selesai wajib diisi'); if (f.selesai < f.mulai) er.push('Tanggal selesai tidak boleh sebelum tanggal mulai'); if (!f.tempat) er.push('Lokasi wajib diisi');
    if (kolab && !document.querySelector('.peserta input').value) er.push('Tambahkan minimal satu organisasi peserta'); if (kolab && !hitung()) er.push('Total porsi peserta melebihi dana kampus proker');
    $('#fe').textContent = er.join('. '); if (er.length) return;
    if (sb) { const { error } = await sb.from('proker').insert({ organisasi_id:S.orgId, nama:f.nama, jenis:f.jenis, tanggal_mulai:f.mulai, tanggal_selesai:f.selesai, tempat:f.tempat, deskripsi:f.deskripsi, pengajuan:f.pengajuan }); if (error) return toast(error.message); await loadProker(); }
    else S.proker.unshift({ id:Date.now(), nama:f.nama, ketua:S.user.nama, jenis:f.pengajuan, mulai:f.mulai, ajuan:0, cair:0, status:'draft' });
    toast('Draft proker tersimpan'); S.view = 'proker'; render(); }
});


async function invokeFn(name,body){if(!sb)throw new Error('Supabase belum dikonfigurasi.');const {data,error}=await sb.functions.invoke(name,{body});if(error)throw error;if(data?.error)throw new Error(data.error);return data;}
async function uploadDriveFile({proker_id,dokumen_id,kind,file,urutan=1}){const init=await invokeFn('drive-init',{proker_id,dokumen_id,kind,filename:file.name,mime:file.type,size:file.size});const put=await fetch(init.upload_url,{method:'PUT',headers:{'Content-Type':file.type},body:file});if(!put.ok)throw new Error('Upload Google Drive gagal ('+put.status+').');let driveFile={};try{driveFile=await put.json();}catch(_){}if(!driveFile.id){const loc=put.headers.get('Location');if(loc)driveFile.id=loc.split('/').pop();}if(!driveFile.id)throw new Error('Google Drive tidak mengembalikan file id.');return invokeFn('drive-complete',{proker_id,dokumen_id,kind,drive_file_id:driveFile.id,urutan});}
async function loadMembershipContext(){ return loadUserAccessContext(); }
Object.assign(V,{
 detail:()=>{const p=S.selected||S.proker[0];if(!p)return stub('Detail proker');return '<h1 class="t">'+esc(p.nama)+'</h1><p class="sub">'+esc(currentContext().org)+' · '+(p.jenis==='kolaboratif'?'Kolaboratif':'Mandiri')+'</p><div class="row2"><div><div class="card"><h3>Status</h3><p>'+chip(p.status)+'</p><p>Tanggal: <b>'+esc(p.mulai||'-')+'</b> s/d <b>'+esc(p.selesai||'-')+'</b></p><p>Ketua: <b>'+esc(p.ketua||'-')+'</b></p></div><div class="card"><h3>Dokumen</h3><p>Proposal <span class="chip bl">Versi terbaru</span></p><p>LPJ <span class="chip">Belum diajukan</span></p></div></div><div><div class="card"><h3>Anggaran</h3><p>Diajukan <b>'+rp(p.ajuan)+'</b></p><p>Cair <b>'+rp(p.cair)+'</b></p><button class="btn w" data-go="plafon">Lihat anggaran</button></div><div class="card"><h3>Aksi</h3><button class="btn w" data-go="review">Buka review</button><button class="btn s" data-go="lpj">Form LPJ</button></div></div></div>'},
 lpj:()=>'<h1 class="t">Form LPJ</h1><p class="sub">Realisasi, dokumen, foto kegiatan, dan sertifikat.</p><div class="card"><div class="step"><span class="on">1. Realisasi</span><span>2. Foto</span><span>3. Pengajuan</span></div><label>Realisasi kegiatan *</label><textarea id="lpj-real" rows="5" placeholder="Jelaskan realisasi kegiatan..."></textarea><label>PDF LPJ *</label><input type="file" id="lpj-pdf" accept="application/pdf"><small>PDF maksimal 29 MB.</small><label>Foto kegiatan * (1–10 foto)</label><input id="lpj-photo" type="file" accept="image/jpeg,image/png,image/webp" multiple><small>Setiap foto maksimal 10 MB.</small><label>Tautan sertifikat (opsional)</label><input id="lpj-drive" placeholder="https://drive.google.com/..."><p class="err" id="lpj-error"></p><button class="btn" id="submit-lpj" type="button">Ajukan LPJ</button></div>',
 undangan:()=>'<h1 class="t">Undangan kolaborasi</h1><p class="sub">Konfirmasi proker kolaboratif yang melibatkan organisasi Anda.</p><div class="card">Belum ada undangan kolaborasi.</div>',
 laporan:()=>stub('Laporan akhir'),
 struktur:()=>stub('Struktur dan anggota'),
 rapat:()=>stub('Rapat'),
 plafon:()=>'<h1 class="t">Plafon dan anggaran</h1><p class="sub">Pantau plafon, pengajuan, cair, dan sisa.</p><div class="card">Belum ada data anggaran.</div>',
 cair:()=>stub('Pencairan dan verifikasi'),
 periode:()=>stub('Periode'),
 akun:()=>'<h1 class="t">Akun dan penetapan</h1><p class="sub">Impor anggota dan verifikasi OTP Admin.</p><div class="row2"><div class="card"><h3>Impor CSV anggota</h3><p class="sub">Minimal: nama/full_name dan email. Opsional: nim, jabatan, unit_nama.</p><input id="csv-file" type="file" accept=".csv,text/csv"><div style="display:flex;gap:8px;margin-top:10px"><button class="btn" id="csv-preview" type="button">Pratinjau CSV</button><button class="btn s" id="csv-commit" type="button" disabled>Konfirmasi impor</button></div><p id="csv-result" class="sub"></p></div><div class="card"><h3>OTP Admin</h3><label>Email pribadi operator</label><input id="otp-email" type="email" placeholder="operator@contoh.ac.id"><button class="btn w" id="otp-request" type="button">Kirim OTP</button><label style="margin-top:12px">Kode OTP</label><input id="otp-code" inputmode="numeric" maxlength="6" placeholder="6 digit"><button class="btn" id="otp-verify" type="button">Verifikasi OTP</button><p id="otp-result" class="sub"></p></div></div>',
 audit:()=>stub('Jejak audit'),
 'change-password':()=>'<h1 class="t">Ganti kata sandi</h1><p class="sub">Akun baru wajib mengganti kata sandi sementara.</p><form id="cp" class="card"><label>Kata sandi baru</label><input id="newpw" type="password" minlength="8" required><label>Ulangi kata sandi</label><input id="newpw2" type="password" minlength="8" required><p class="err" id="cpe"></p><button class="btn" type="submit">Simpan kata sandi</button></form>'
});
document.addEventListener('click',async e=>{
 const row=e.target.closest('[data-id]');
 if(row && row.dataset.go){S.selected=S.proker.find(p=>String(p.id)===String(row.dataset.id))||S.selected;if(row.dataset.go==='detail')S.view='detail';else if(row.dataset.go==='review')S.view='review';render();return}
 if(e.target.id==='submit-lpj'){
 const err=$('#lpj-error'),files=[...($('#lpj-photo')?.files||[])],pdf=$('#lpj-pdf')?.files?.[0],p=S.selected;err.textContent='';
 if(!p?.id){err.textContent='Pilih proker terlebih dahulu.';return}
 if(files.length<1||files.length>10){err.textContent='LPJ wajib memiliki 1 sampai 10 foto.';return}
 if(files.some(f=>f.size>10*1024*1024)){err.textContent='Setiap foto maksimal 10 MB.';return}
 if(!pdf){err.textContent='PDF LPJ wajib diunggah.';return}
 if(pdf.size>29*1024*1024){err.textContent='PDF melebihi batas 29 MB.';return}
 const btn=e.target;btn.disabled=true;btn.textContent='Mengunggah...';
 try{let {data:dok,error:de}=await sb.from('dokumen').select('id,status').eq('proker_id',p.id).eq('jenis','lpj').maybeSingle();if(de)throw de;if(!dok){const ins=await sb.from('dokumen').insert({organisasi_id:p.organisasi_id,proker_id:p.id,jenis:'lpj',status:'draft',tahap_saat_ini:'menteri'}).select().single();if(ins.error)throw ins.error;dok=ins.data;}
 await uploadDriveFile({proker_id:p.id,dokumen_id:dok.id,kind:'document',file:pdf});
 for(let i=0;i<files.length;i++){await uploadDriveFile({proker_id:p.id,dokumen_id:dok.id,kind:'photo',file:files[i],urutan:i+1});}
 const cert=$('#lpj-drive')?.value.trim();if(cert){if(!/^https:\/\/(drive\.google\.com|docs\.google\.com)\//.test(cert))throw new Error('Tautan sertifikat harus dari Google Drive atau Google Docs.');const {error:te}=await sb.from('tautan_drive').insert({proker_id:p.id,jenis:'sertifikat',url:cert,keterangan:'Sertifikat LPJ'});if(te)throw te;}
 const {error:ue}=await sb.from('dokumen').update({status:'diajukan'}).eq('id',dok.id);if(ue)throw ue;toast('LPJ dan seluruh berkas berhasil diunggah.');S.view='detail';render();
 }catch(ex){err.textContent=ex.message||String(ex);}finally{btn.disabled=false;btn.textContent='Ajukan LPJ';}return;
}
});

document.addEventListener('click',async e=>{
 if(e.target.id==='csv-preview'){const file=$('#csv-file')?.files?.[0],out=$('#csv-result');if(!file){out.textContent='Pilih file CSV.';return}try{const r=await invokeFn('import-csv',{action:'preview',organisasi_id:S.orgId,nama_file:file.name,csv:await file.text()});S.importId=r.impor_id;$('#csv-commit').disabled=false;out.textContent='Preview: '+r.valid+' valid dari '+r.total+' baris.';}catch(ex){out.textContent=ex.message||String(ex);}return;}
 if(e.target.id==='csv-commit'){if(!S.importId)return;const out=$('#csv-result');e.target.disabled=true;try{const r=await invokeFn('import-csv',{action:'commit',organisasi_id:S.orgId,impor_id:S.importId});out.textContent='Impor selesai: '+r.created+' akun dibuat, '+r.skipped+' dilewati.';toast('Impor CSV selesai.');}catch(ex){out.textContent=ex.message||String(ex);e.target.disabled=false;}return;}
 if(e.target.id==='otp-request'){try{const r=await invokeFn('admin-otp',{action:'request',email:$('#otp-email').value.trim()});$('#otp-result').textContent='OTP dikirim sampai '+new Date(r.expires_at).toLocaleTimeString('id-ID')+'.';}catch(ex){$('#otp-result').textContent=ex.message||String(ex);}return;}
 if(e.target.id==='otp-verify'){try{await invokeFn('admin-otp',{action:'verify',email:$('#otp-email').value.trim(),code:$('#otp-code').value.trim()});$('#otp-result').textContent='OTP valid. Aktivitas Admin terverifikasi.';toast('OTP Admin berhasil diverifikasi.');}catch(ex){$('#otp-result').textContent=ex.message||String(ex);}return;}
});
document.addEventListener('submit',async e=>{
 if(e.target.id==='cp'){e.preventDefault();const a=$('#newpw').value,b=$('#newpw2').value,er=$('#cpe');er.textContent='';if(a.length<8)return er.textContent='Kata sandi minimal 8 karakter.';if(a!==b)return er.textContent='Konfirmasi kata sandi tidak sama.';const {error}=await sb.auth.updateUser({password:a,user_metadata:{...S.user.user_metadata,must_change_password:false}});if(error)return er.textContent=error.message;S.user.user_metadata={...S.user.user_metadata,must_change_password:false};toast('Kata sandi berhasil diganti.');S.view='beranda';render();}
});
