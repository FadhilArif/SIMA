// Isi dari Supabase: Project Settings > API. Kosong = mode demo.
const SUPABASE_URL = 'https://vgzhkvxzzvllmricfzto.supabase.co', SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnemhrdnh6enZsbG1yaWNmenRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNzQxNjAsImV4cCI6MjEwNjc1MDE2MH0.iVvnXgFfYimUuFytlHQBM4OXDyVGirWY_eReM-8Dm34';
const sb = SUPABASE_URL && window.supabase ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const $ = s => document.querySelector(s), $$ = (s,r=document) => [...r.querySelectorAll(s)], rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID'), esc = v => String(v ?? '').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[m]));
const ST = { draft:['Draft',''], proposal_diajukan:['Menunggu review','wa'], revisi:['Revisi','er'], disetujui:['Disetujui','ok'], berjalan:['Berjalan','ok'], selesai:['Selesai','bl'], tidak_terlaksana:['Tidak terlaksana','er'] };
function currentContext(){ return S.ctxs[S.ctx] || S.ctxs[0] || {kind:'none',org:'Tanpa konteks',peran:'Pengguna'}; }

const S = {
  user:{ nama:'', email:'' },
  kolabs:[],
  profile:{ tipe:'mahasiswa' },
  ctx:0, view:'beranda', tab:'semua', q:'', orgId:null,
  ctxs:[], proker:[], memberships:[], notifications:[], notificationsLoaded:false
};

const MENU_MAP = {
  organisasi: [['Utama',[['beranda','Beranda'],['proker','Proker'],['undangan','Undangan kolaborasi'],['galeri','Galeri'],['laporan','Laporan akhir'],['struktur','Struktur dan anggota']]]],
  bph: [['Utama',[['beranda','Beranda'],['proker','Semua proker'],['inbox','Inbox review'],['rapat','Rapat'],['galeri','Galeri pemantau'],['plafon','Anggaran'],['struktur','Struktur BEM']]]],
  review: [['Utama',[['beranda','Beranda'],['inbox','Inbox review'],['proker','Proker binaan'],['galeri','Galeri binaan']]]],
  pembimbing: [['Utama',[['beranda','Beranda'],['inbox','Inbox review'],['cair','Pencairan dan verifikasi'],['proker','Proker'],['galeri','Galeri']]]],
  wakil_rektor: [['Utama',[['beranda','Beranda'],['plafon','Plafon'],['cair','Anggaran & pencairan'],['inbox','Inbox tahap BEM'],['proker','Semua proker'],['galeri','Galeri pemantau'],['audit','Jejak audit']]]],
  staf_keuangan: [['Anggaran',[['plafon','Plafon'],['cair','Dashboard anggaran']]]],
  admin: [['Admin',[['periode','Periode'],['organisasi','Organisasi'],['akun','Akun dan penetapan'],['audit','Jejak audit'],['profil','Profil saya']]]],
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
  S.memberships=membershipRes.data||[];
  S.ctxs=[];
  if(['menunggu','ditolak'].includes(S.profile.status)){
    S.orgId=null;
    return;
  }

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
  S.profile.foto_url='';
  if(S.profile.foto_path){
    const {data:signed}=await sb.storage.from('profile-avatars').createSignedUrl(S.profile.foto_path,3600);
    S.profile.foto_url=signed?.signedUrl||'';
  }
}

async function loadCollaborations(){if(!sb||!S.orgId){S.kolabs=[];return;}const {data,error}=await sb.from('proker_kolaborator').select('proker_id,status,porsi_plafon,komentar,proker:proker_id(id,nama,organisasi:organisasi_id(id,nama))').eq('organisasi_id',S.orgId).order('proker_id');if(error)return;S.kolabs=data||[];}
async function loadNotifications(){
  if(!sb||!S.user?.id) return;
  const {data,error}=await sb.from('notifikasi').select('id,organisasi_id,pesan,dibaca,created_at,organisasi:organisasi_id(nama)').eq('akun_id',S.user.id).order('created_at',{ascending:false}).limit(30);
  if(error) return;
  S.notifications=data||[]; S.notificationsLoaded=true; updateNotificationBadge();
}
function updateNotificationBadge(){
  const b=$('#nbadge'); if(!b) return;
  const n=S.notifications.filter(x=>!x.dibaca).length;
  b.hidden=n===0; if(n)b.textContent=n>9?'9+':String(n);
}
function renderNotifications(){
  const p=$('#notifyPanel'); if(!p) return;
  const rows=S.notifications.map(n=>{
    const org=n.organisasi?.nama||'SIMA MHS';
    const d=new Date(n.created_at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
    return `<button class="notify-item ${n.dibaca?'':'unread'}" type="button" data-notif="${n.id}"><b>${esc(org)}</b><span>${esc(n.pesan)}</span><small>${d}</small></button>`;
  }).join('');
  p.innerHTML=`<div class="notify-head"><span>Notifikasi</span><button class="btn s small" id="notif-read-all" type="button">Tandai dibaca</button></div><div class="notify-list">${rows||'<div class="card" style="margin:12px">Belum ada notifikasi.</div>'}</div>`;
  p.hidden=false;
}


function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.append(e); setTimeout(() => e.remove(), 2600); }
function showAuthPanel(mode){
  $('#fl').hidden=mode!=='login';
  $('#fsu').hidden=mode!=='signup';
  $('#frp').hidden=mode!=='forgot';
  if(mode==='login') $('#le').textContent='';
  if(mode==='signup') $('#sue').textContent='';
  if(mode==='forgot') $('#rpe').textContent='';
}
async function loadOrganizations(){
  if(!sb) return;
  const {data,error}=await sb.from('organisasi').select('id,nama,tipe,aktif,periode_id,periode:periode_id(id,nama,status)').order('nama');
  if(error){toast('Gagal memuat organisasi: '+error.message);return;}
  S.organizations=data||[];
}
async function loadApprovalQueue(){
  if(S.profile?.tipe!=='admin') return;
  const box=$('#pending-users');
  if(!box) return;
  const [{data:pending,error:pe},{data:orgs,error:oe}]=await Promise.all([
    sb.from('profiles').select('id,nama,email,nim,status').in('status',['menunggu','ditolak']).order('nama',{ascending:true}),
    sb.from('organisasi').select('id,nama,tipe,aktif,periode_id,periode:periode_id(nama,status)').order('nama')
  ]);
  if(pe){box.innerHTML='<p class="err">'+esc(pe.message)+'</p>';return;}
  if(oe){box.innerHTML='<p class="err">'+esc(oe.message)+'</p>';return;}

  const options=(orgs||[]).map(o=>{
    const periodStatus=o.periode?.status||'-';
    const active=(o.aktif===true && periodStatus==='aktif');
    return '<option value="'+o.id+'" '+(!active?'data-inactive="1"':'')+'>'+esc(o.nama)+' · '+esc(o.tipe)+' · '+esc(o.periode?.nama||'-')+(active?'':' · tidak aktif')+'</option>';
  }).join('');

  const assignmentRow=(index,orgId='',jabatan='Anggota')=>'<div class="assignment-row f2" data-assignment-row>'+
    '<div><label>Organisasi</label><select data-assignment-org><option value="">Pilih organisasi</option>'+options+'</select></div>'+
    '<div><label>Jabatan</label><div style="display:flex;gap:8px"><select data-assignment-jabatan>'+
      '<option '+(jabatan==='Anggota'?'selected':'')+'>Anggota</option>'+
      '<option '+(jabatan==='Ketua'?'selected':'')+'>Ketua</option>'+
      '<option '+(jabatan==='Wakil'?'selected':'')+'>Wakil</option>'+
      '<option '+(jabatan==='Sekretaris'?'selected':'')+'>Sekretaris</option>'+
      '<option '+(jabatan==='Bendahara'?'selected':'')+'>Bendahara</option>'+
      '<option '+(jabatan==='Presiden'?'selected':'')+'>Presiden</option>'+
      '<option '+(jabatan==='Wakil Presiden'?'selected':'')+'>Wakil Presiden</option>'+
      '<option '+(jabatan==='Menteri'?'selected':'')+'>Menteri</option>'+
      '<option '+(jabatan==='Ketua Divisi'?'selected':'')+'>Ketua Divisi</option>'+
    '</select><button type="button" class="btn s small" data-remove-assignment>×</button></div></div>';

  box.innerHTML=(pending||[]).map(p=>'<div class="card pending-card" data-pending="'+p.id+'">'+
    '<h3>'+esc(p.nama)+' '+(p.status==='ditolak'?'<span class="chip er">Ditolak</span>':'<span class="chip wa">Menunggu</span>')+'</h3>'+
    '<p class="sub">'+esc(p.email)+' · NIM '+esc(p.nim||'-')+'</p>'+
    '<div><label>Role</label><select data-role>'+
      '<option value="mahasiswa">Mahasiswa</option>'+
      '<option value="dosen">Dosen</option>'+
      '<option value="wakil_rektor">Wakil Rektor Kemahasiswaan</option>'+
      '<option value="staf_keuangan">Staf Keuangan</option>'+
      '<option value="admin">Admin Sistem</option>'+
    '</select></div>'+
    '<div data-assignment-list>'+assignmentRow(0)+'</div>'+
    '<button type="button" class="btn s small" data-add-assignment>+ Tambah organisasi</button>'+
    '<p class="sub" style="margin-top:8px">Mahasiswa dapat memiliki lebih dari satu organisasi, dengan jabatan berbeda pada tiap organisasi.</p>'+
    '<p class="err" data-pending-error></p>'+
    '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn" type="button" data-approve-user="'+p.id+'">Setujui & tetapkan</button><button class="btn d" type="button" data-reject-user="'+p.id+'">Tolak</button></div>'+
  '</div>').join('')||'<div class="card"><p class="sub">Belum ada calon pengguna yang menunggu persetujuan.</p></div>';

  box.querySelectorAll('[data-assignment-row]').forEach((row)=>{
    const sel=row.querySelector('[data-assignment-org]');
    if(sel && sel.options.length===1){
      row.insertAdjacentHTML('beforebegin','<p class="err">Belum ada organisasi yang terdaftar di database.</p>');
    }
  });
}
async function approvePending(id,card){
  const role=card.querySelector('[data-role]').value;
  const er=card.querySelector('[data-pending-error]'); er.textContent='';
  const assignments=[...card.querySelectorAll('[data-assignment-row]')].map(row=>({
    organisasi_id:row.querySelector('[data-assignment-org]')?.value||'',
    jabatan:row.querySelector('[data-assignment-jabatan]')?.value||'Anggota'
  })).filter(x=>x.organisasi_id);

  if((role==='mahasiswa'||role==='dosen')&&!assignments.length){
    er.textContent='Minimal pilih satu organisasi.';
    return;
  }

  const unique=new Set();
  for(const a of assignments){
    if(unique.has(a.organisasi_id)){
      er.textContent='Organisasi yang sama dipilih lebih dari sekali.';
      return;
    }
    unique.add(a.organisasi_id);
  }

  const inactive=[...card.querySelectorAll('[data-assignment-row]')].some(row=>{
    const sel=row.querySelector('[data-assignment-org]');
    const opt=sel?.selectedOptions?.[0];
    return opt?.dataset?.inactive==='1';
  });
  if(inactive){
    er.textContent='Pilih organisasi yang aktif dan berada pada periode aktif.';
    return;
  }

  const btn=card.querySelector('[data-approve-user]'); btn.disabled=true; btn.textContent='Menyimpan...';
  try{
    const {error:pe}=await sb.from('profiles').update({tipe:role,status:'aktif'}).eq('id',id);
    if(pe) throw pe;

    if(role==='mahasiswa'){
      const {data:existing,error:ee}=await sb.from('keanggotaan').select('id,organisasi_id').eq('akun_id',id);
      if(ee) throw ee;
      const existingMap=new Map((existing||[]).map(x=>[x.organisasi_id,x.id]));
      for(const a of assignments){
        const oldId=existingMap.get(a.organisasi_id);
        if(oldId){
          const {error:e2}=await sb.from('keanggotaan').update({jabatan:a.jabatan,status:'aktif',ditetapkan_oleh:S.user.id}).eq('id',oldId);
          if(e2) throw e2;
        }else{
          const {error:e2}=await sb.from('keanggotaan').insert({akun_id:id,organisasi_id:a.organisasi_id,jabatan:a.jabatan,status:'aktif',ditetapkan_oleh:S.user.id});
          if(e2) throw e2;
        }
      }
      const {error:pd}=await sb.from('pembimbing_organisasi').update({status:'nonaktif'}).eq('akun_id',id).eq('status','aktif');
      if(pd) throw pd;
    }else if(role==='dosen'){
      const {error:de}=await sb.from('keanggotaan').update({status:'nonaktif'}).eq('akun_id',id).eq('status','aktif');
      if(de) throw de;
      const {data:existing,error:ee}=await sb.from('pembimbing_organisasi').select('id,organisasi_id').eq('akun_id',id);
      if(ee) throw ee;
      const existingMap=new Map((existing||[]).map(x=>[x.organisasi_id,x.id]));
      for(const a of assignments){
        const oldId=existingMap.get(a.organisasi_id);
        if(oldId){
          const {error:e2}=await sb.from('pembimbing_organisasi').update({status:'aktif',ditetapkan_oleh:S.user.id}).eq('id',oldId);
          if(e2) throw e2;
        }else{
          const {error:e2}=await sb.from('pembimbing_organisasi').insert({akun_id:id,organisasi_id:a.organisasi_id,status:'aktif',ditetapkan_oleh:S.user.id});
          if(e2) throw e2;
        }
      }
    }

    await sb.from('notifikasi').insert({akun_id:id,pesan:'Pendaftaran Anda telah disetujui. Role dan organisasi sudah ditetapkan. Silakan login kembali.'});
    toast('Akun disetujui. '+(assignments.length?assignments.length+' organisasi ditetapkan.':''));
    loadApprovalQueue();
  }catch(ex){
    er.textContent=ex.message||String(ex);
    btn.disabled=false; btn.textContent='Setujui & tetapkan';
  }
}
async function loadProker() {
  if (!sb || !S.orgId) { S.proker=[]; return; }
  let q = sb.from('proker').select('id,nama,ketua_pelaksana,pengajuan,tanggal_mulai,tanggal_selesai,status,organisasi_id,item_anggaran(subtotal),pencairan_dana(jumlah)').order('tanggal_mulai'); q=q.eq('organisasi_id',S.orgId); const { data, error } = await q;
  if (error) return toast('Gagal memuat proker: ' + error.message);
  S.proker = (data || []).map(p => ({ id:p.id, nama:p.nama, ketua:p.ketua_pelaksana, jenis:p.pengajuan, mulai:p.tanggal_mulai, selesai:p.tanggal_selesai, organisasi_id:p.organisasi_id, status:p.status,
    ajuan:(p.item_anggaran || []).reduce((a, i) => a + Number(i.subtotal || 0), 0), cair:(p.pencairan_dana || []).reduce((a, i) => a + Number(i.jumlah || 0), 0) }));
}
const chip = s => { const [t, c] = ST[s] || [s, '']; return `<span class="chip ${c}">${t}</span>`; };

function renderShell() {
  const waiting=['menunggu','ditolak'].includes(S.profile?.status);
  const ctx=currentContext(), menu=waiting ? [] : menuForContext(ctx);
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
  $('#bn').hidden=waiting;
  $('#cx').hidden=waiting;
  $('#bell').hidden=waiting;
  $('#cx').innerHTML=S.ctxs.map((x,i)=>`<option value="${i}" ${i===S.ctx?'selected':''}>${x.konteks||x.org+(x.peran?' · '+x.peran:'')}</option>`).join('');
  const displayName=S.user?.user_metadata?.nama||S.user?.user_metadata?.name||S.profile?.nama||S.user?.email||'User';
  const av=$('#av');
  av.textContent=S.profile?.foto_url?'':displayName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  av.style.backgroundImage=S.profile?.foto_url ? 'url("'+S.profile.foto_url+'")' : '';
  av.style.backgroundSize='cover'; av.style.backgroundPosition='center';
}
const V = {
  beranda: () => `<h1 class="t">Beranda</h1><p class="sub">Ringkasan aktivitas dari semua konteks Anda.</p>
  <div class="card"><h3>Belum ada data</h3><p class="sub">${S.ctxs.length ? 'Belum ada aktivitas, pengajuan, atau anggaran untuk konteks ini.' : 'Belum ada organisasi atau periode yang ditetapkan ke akun ini.'}</p></div>`,
  proker() {
    const q=S.q.toLowerCase(); const f = S.proker.filter(p => (S.tab === 'semua' || p.status === S.tab) && ((p.nama||'').toLowerCase().includes(q) || (p.ketua||'').toLowerCase().includes(q)));
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
function renderOrganizationList(){
  const box=$('#org-list'); if(!box) return;
  const rows=(S.organizations||[]).map(o=>{
    const ps=o.periode?.status||'-';
    return '<div class="card" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:12px"><div><b>'+esc(o.nama)+'</b><div class="sub">'+esc(o.tipe)+' · '+esc(o.periode?.nama||'-')+'</div></div><span class="chip '+(o.aktif&&ps==='aktif'?'ok':'er')+'">'+(o.aktif&&ps==='aktif'?'Aktif':'Nonaktif')+'</span></div></div>';
  }).join('');
  box.innerHTML=rows||'<p class="sub">Belum ada organisasi. Buat organisasi pertama di formulir di atas.</p>';
}
function render() { renderShell(); if($('#notifyPanel')) $('#notifyPanel').hidden=true; $('#v').innerHTML = (V[S.view] || (() => stub(S.view)))(); if (S.view === 'form') pesertaRow(true); if(S.view==='akun' && S.profile?.tipe==='admin') loadApprovalQueue(); if(S.view==='organisasi'&&S.profile?.tipe==='admin') loadOrganizations().then(renderOrganizationList); }

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
  if(e.target.id==='aa-kind') refreshInitialAccountForm();
  if(e.target.id==='cx'){
    S.ctx=+e.target.value;
    S.orgId=currentContext().org_id||null;
    S.view='beranda';
    S.tab='semua';
    S.q='';
    S.proker=[];
    loadProker().then(()=>loadCollaborations()).then(render);
  }
});
document.addEventListener('submit', async e => {{
  if(e.target.id==='org-form'){
    e.preventDefault();
    const err=$('#org-error'); err.textContent='';
    const nama=$('#org-nama').value.trim();
    const tipe=$('#org-tipe').value;
    const periode_id=$('#org-periode').value||null;
    const aktif=$('#org-aktif').value==='true';
    if(!nama||!periode_id){err.textContent='Nama dan periode wajib diisi.';return;}
    const {error}=await sb.from('organisasi').insert({nama,tipe,periode_id,aktif});
    if(error){err.textContent=error.message;return;}
    await loadOrganizations();
    toast('Organisasi berhasil dibuat.');
    render();
    return;
  }

  if(e.target.id==='fsu'){
    e.preventDefault();
    const er=$('#sue'); er.textContent='';
    const email=$('#su-email').value.trim(), nama=$('#su-nama').value.trim(), nim=$('#su-nim').value.trim(), pw=$('#su-pw').value, pw2=$('#su-pw2').value;
    if(pw.length<8) return er.textContent='Password minimal 8 karakter.';
    if(pw!==pw2) return er.textContent='Konfirmasi password tidak sama.';
    const {data,error}=await sb.auth.signUp({email,password:pw,options:{data:{nama,nim}}});
    if(error){er.textContent=error.message;return;}
    if(!data.user){er.textContent='Pendaftaran gagal: Supabase tidak mengembalikan user.';return;}
    if(!data.session){
      er.textContent='Akun berhasil dibuat. Konfirmasi email diperlukan sebelum masuk ruang tunggu.';
      return;
    }
    const {error:profileError}=await sb.from('profiles').insert({
      id:data.user.id,
      nama,
      email,
      nim,
      tipe:'mahasiswa',
      status:'menunggu'
    });
    if(profileError){
      er.textContent='Akun berhasil dibuat, tetapi profil ruang tunggu gagal disimpan: '+profileError.message;
      return;
    }
    S.user={...data.user,nama,nim};
    try{await loadUserAccessContext();}catch(ex){er.textContent=ex.message||'Gagal menyiapkan ruang tunggu.';return;}
    $('#login').hidden=true;$('#app').hidden=false;S.view=S.profile.status==='ditolak'?'ditolak':'menunggu';render();
    return;
  }
  if(e.target.id==='frp'){
    e.preventDefault();
    const er=$('#rpe'); er.textContent='';
    const email=$('#rp-email').value.trim();
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:'https://simawa.vercel.app/?reset=1'});
    if(error) er.textContent=error.message;
    else er.textContent='Jika email terdaftar, tautan reset password sudah dikirim.';
    return;
  }
  if(e.target.id==='reset-password-form'){
    e.preventDefault();
    const er=$('#reset-error');er.textContent='';
    const a=$('#reset-pw1').value,b=$('#reset-pw2').value;
    if(a.length<8)return er.textContent='Password minimal 8 karakter.';
    if(a!==b)return er.textContent='Konfirmasi password tidak sama.';
    const {error}=await sb.auth.updateUser({password:a});
    if(error)return er.textContent=error.message;
    await sb.auth.signOut();
    $('#app').hidden=true;$('#login').hidden=false;showAuthPanel('login');
    $('#le').textContent='Password berhasil diubah. Silakan login.';
    return;
  }
  if (e.target.id === 'fl') { e.preventDefault();
    if (sb) { const { data,error } = await sb.auth.signInWithPassword({ email:$('#em').value, password:$('#pw').value }); if (error) return $('#le').textContent = 'Email atau kata sandi salah.'; S.user={...data.user,nama:data.user.user_metadata?.nama||data.user.user_metadata?.name||data.user.email}; const {data:existingProfile}=await sb.from('profiles').select('id').eq('id',data.user.id).maybeSingle(); if(!existingProfile){ const meta=data.user.user_metadata||{}; const {error:pe}=await sb.from('profiles').insert({id:data.user.id,nama:meta.nama||meta.name||data.user.email,email:data.user.email,nim:meta.nim||null,tipe:'mahasiswa',status:'menunggu'}); if(pe) return $('#le').textContent='Akun login berhasil, tetapi profil belum dapat dibuat: '+pe.message; } try { await loadUserAccessContext(); await loadNotifications(); await loadCollaborations(); } catch(ex) { return $('#le').textContent=ex.message||'Gagal memuat hak akses akun.'; } await loadProker(); }
    $('#login').hidden = true; $('#app').hidden = false; if(S.profile?.status==='menunggu') S.view='menunggu'; else if(S.profile?.status==='ditolak') S.view='ditolak'; else if(S.user?.user_metadata?.must_change_password) S.view='change-password'; render(); }
  if (e.target.id === 'ff') {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const kolab = f.pengajuan === 'kolaboratif';
    const er = [];

    if (!f.nama) er.push('Nama program kerja wajib diisi');
    if (!f.mulai || !f.selesai) er.push('Tanggal mulai dan selesai wajib diisi');
    if (f.selesai < f.mulai) er.push('Tanggal selesai tidak boleh sebelum tanggal mulai');
    if (!f.tempat) er.push('Lokasi wajib diisi');

    const peserta=[...document.querySelectorAll('.peserta')].map(row=>({
      nama:row.querySelector('input[aria-label="Organisasi peserta"]')?.value.trim()||'',
      porsi:Number(row.querySelector('input[aria-label="Porsi plafon"]')?.value||0)
    })).filter(x=>x.nama);

    if (kolab && !peserta.length) er.push('Tambahkan minimal satu organisasi peserta');
    if (kolab && peserta.some(x=>x.nama===currentContext().org)) er.push('Organisasi penyelenggara tidak boleh menjadi peserta kolaborasi');
    if (kolab && !hitung()) er.push('Total porsi peserta melebihi dana kampus proker');

    $('#fe').textContent=er.join('. ');
    if(er.length) return;

    if(sb){
      let prokerId=null;
      try{
        const {data:p,error}=await sb.from('proker').insert({
          organisasi_id:S.orgId,
          nama:f.nama,
          jenis:f.jenis,
          tanggal_mulai:f.mulai,
          tanggal_selesai:f.selesai,
          tempat:f.tempat,
          deskripsi:f.deskripsi,
          pengajuan:f.pengajuan,
          ketua_pelaksana:S.user.id
        }).select('id').single();

        if(error) throw error;
        prokerId=p.id;

        if(kolab && peserta.length){
          const {data:orgs,error:oe}=await sb.from('organisasi')
            .select('id,nama,periode_id,periode:periode_id(id,nama)')
            .eq('aktif',true);

          if(oe) throw oe;

          const period=currentContext().periode;
          const rows=[];
          for(const item of peserta){
            const matches=(orgs||[]).filter(o=>
              o.nama===item.nama &&
              (!period || o.periode?.nama===period)
            );
            if(matches.length!==1) throw new Error('Organisasi peserta tidak ditemukan atau tidak unik: '+item.nama);
            rows.push({
              proker_id:prokerId,
              organisasi_id:matches[0].id,
              porsi_plafon:item.porsi,
              status:'diundang'
            });
          }

          const {error:ce}=await sb.from('proker_kolaborator').insert(rows);
          if(ce) throw ce;
        }

        await loadProker();
      }catch(ex){
        if(prokerId) await sb.from('proker').delete().eq('id',prokerId);
        return toast(ex.message||String(ex));
      }
    }else{
      S.proker.unshift({id:Date.now(),nama:f.nama,ketua:S.user.nama,jenis:f.pengajuan,mulai:f.mulai,ajuan:0,cair:0,status:'draft'});
    }

    toast('Draft proker tersimpan');
    S.view='proker';
    render();
  }
});


async function invokeFn(name,body){
  if(!sb)throw new Error('Supabase belum dikonfigurasi.');
  const {data,error}=await sb.functions.invoke(name,{body});
  if(error){
    let detail=error.message||'Edge Function gagal.';
    try{
      const res=error.context;
      if(res && typeof res.clone==='function'){
        const text=await res.clone().text();
        if(text){
          try{
            const parsed=JSON.parse(text);
            detail=parsed.error||parsed.message||detail;
          }catch(_){
            detail=text||detail;
          }
        }
      }
    }catch(_){}
    throw new Error(detail);
  }
  if(data?.error)throw new Error(data.error);
  return data;
}
async function uploadDriveFile({proker_id,dokumen_id,kind,file,urutan=1}){const init=await invokeFn('drive-init',{proker_id,dokumen_id,kind,filename:file.name,mime:file.type,size:file.size});const put=await fetch(init.upload_url,{method:'PUT',headers:{'Content-Type':file.type},body:file});if(!put.ok)throw new Error('Upload Google Drive gagal ('+put.status+').');let driveFile={};try{driveFile=await put.json();}catch(_){}if(!driveFile.id){const loc=put.headers.get('Location');if(loc)driveFile.id=loc.split('/').pop();}if(!driveFile.id)throw new Error('Google Drive tidak mengembalikan file id.');return invokeFn('drive-complete',{proker_id,dokumen_id,kind,drive_file_id:driveFile.id,urutan});}
async function loadMembershipContext(){ return loadUserAccessContext(); }
Object.assign(V,{
 detail:()=>{const p=S.selected||S.proker[0];if(!p)return stub('Detail proker');return '<h1 class="t">'+esc(p.nama)+'</h1><p class="sub">'+esc(currentContext().org)+' · '+(p.jenis==='kolaboratif'?'Kolaboratif':'Mandiri')+'</p><div class="row2"><div><div class="card"><h3>Status</h3><p>'+chip(p.status)+'</p><p>Tanggal: <b>'+esc(p.mulai||'-')+'</b> s/d <b>'+esc(p.selesai||'-')+'</b></p><p>Ketua: <b>'+esc(p.ketua||'-')+'</b></p></div><div class="card"><h3>Dokumen</h3><p>Proposal <span class="chip bl">Versi terbaru</span></p><p>LPJ <span class="chip">Belum diajukan</span></p></div></div><div><div class="card"><h3>Anggaran</h3><p>Diajukan <b>'+rp(p.ajuan)+'</b></p><p>Cair <b>'+rp(p.cair)+'</b></p><button class="btn w" data-go="plafon">Lihat anggaran</button></div><div class="card"><h3>Aksi</h3><button class="btn w" data-go="review">Buka review</button><button class="btn s" data-go="lpj">Form LPJ</button></div></div></div>'},
 lpj:()=>'<h1 class="t">Form LPJ</h1><p class="sub">Realisasi, dokumen, foto kegiatan, dan sertifikat.</p><div class="card"><div class="step"><span class="on">1. Realisasi</span><span>2. Foto</span><span>3. Pengajuan</span></div><label>Realisasi kegiatan *</label><textarea id="lpj-real" rows="5" placeholder="Jelaskan realisasi kegiatan..."></textarea><label>PDF LPJ *</label><input type="file" id="lpj-pdf" accept="application/pdf"><small>PDF maksimal 29 MB.</small><label>Foto kegiatan * (1–10 foto)</label><input id="lpj-photo" type="file" accept="image/jpeg,image/png,image/webp" multiple><small>Setiap foto maksimal 10 MB.</small><label>Tautan sertifikat (opsional)</label><input id="lpj-drive" placeholder="https://drive.google.com/..."><p class="err" id="lpj-error"></p><button class="btn" id="submit-lpj" type="button">Ajukan LPJ</button></div>',
 undangan:()=>{const rows=S.kolabs||[];return '<h1 class="t">Undangan kolaborasi</h1><p class="sub">Konfirmasi proker kolaboratif yang melibatkan organisasi Anda.</p>'+(rows.length?rows.map(x=>'<div class="card"><h3>'+esc(x.proker?.nama||'-')+'</h3><p class="sub">Penyelenggara: '+esc(x.proker?.organisasi?.nama||'-')+' · Porsi '+rp(x.porsi_plafon||0)+'</p><p>Status: '+chip(x.status)+'</p></div>').join(''):'<div class="card"><p class="sub">Belum ada undangan kolaborasi.</p></div>');},
 laporan:()=>stub('Laporan akhir'),
 struktur:()=>stub('Struktur dan anggota'),
 rapat:()=>stub('Rapat'),
 plafon:()=>'<h1 class="t">Plafon dan anggaran</h1><p class="sub">Pantau plafon, pengajuan, cair, dan sisa.</p><div class="card">Belum ada data anggaran.</div>',
 cair:()=>stub('Pencairan dan verifikasi'),
 periode:()=>stub('Periode'),
  menunggu:()=>'<div class="pending-box"><div class="card"><div class="pending-icon">⏳</div><h1 class="t">Menunggu persetujuan Admin</h1><p class="sub">Akunmu sudah berhasil dibuat. Saat ini kamu belum mendapatkan role dan organisasi.</p><div class="pending-meta"><div class="card"><small>Email</small><b>'+esc(S.user?.email||'-')+'</b></div><div class="card"><small>Nama</small><b>'+esc(S.profile?.nama||'-')+'</b></div><div class="card"><small>NIM</small><b>'+esc(S.profile?.nim||'-')+'</b></div></div><p class="sub" style="margin-top:18px">Silakan tunggu Admin menetapkan role dan organisasi. Setelah disetujui, kamu bisa login kembali untuk masuk ke SIMA.</p><button class="btn" id="pending-logout" type="button">Keluar</button></div></div>',
  ditolak:()=>'<div class="pending-box"><div class="card"><div class="pending-icon">!</div><h1 class="t">Pendaftaran belum disetujui</h1><p class="sub">Admin belum menyetujui pendaftaran akun ini. Hubungi Admin Sistem untuk informasi lebih lanjut.</p><button class="btn" id="pending-logout" type="button">Keluar</button></div></div>',
  'reset-password':()=>'<div class="pending-box"><div class="card"><h1 class="t">Buat password baru</h1><p class="sub">Masukkan password baru untuk akun SIMA MHS.</p><form id="reset-password-form"><label>Password baru</label><input id="reset-pw1" type="password" minlength="8" required><label>Ulangi password baru</label><input id="reset-pw2" type="password" minlength="8" required><p class="err" id="reset-error"></p><button class="btn" type="submit">Simpan password</button></form></div></div>',
  organisasi:()=>`
    <h1 class="t">Organisasi</h1>
    <p class="sub">Admin membuat dan mengatur BEM, HMJ, UKM, dan Club untuk setiap periode.</p>
    <div class="card">
      <h3>Tambah organisasi</h3>
      <form id="org-form" class="f2">
        <div><label>Nama organisasi</label><input id="org-nama" placeholder="Contoh: HIMIKA" required></div>
        <div><label>Jenis</label><select id="org-tipe"><option>BEM</option><option>HMJ</option><option>UKM</option><option>Club</option></select></div>
        <div><label>Periode</label><select id="org-periode"></select></div>
        <div><label>Status</label><select id="org-aktif"><option value="true">Aktif</option><option value="false">Nonaktif</option></select></div>
        <p class="err" id="org-error" style="grid-column:1/-1"></p>
        <button class="btn" style="grid-column:1/-1">Tambah organisasi</button>
      </form>
    </div>
    <div class="card">
      <h3>Daftar organisasi</h3>
      <div id="org-list">Memuat...</div>
    </div>`,
  akun:()=>`<h1 class="t">Akun dan penetapan</h1><p class="sub">Kelola calon pengguna yang mendaftar sendiri. Admin menetapkan role dan organisasi di sini.</p><div class="card"><h3>Calon pengguna menunggu persetujuan</h3><div id="pending-users"><p class="sub">Memuat...</p></div></div>`,
 audit:()=>stub('Jejak audit'),
 'change-password':()=>'<h1 class="t">Ganti kata sandi</h1><p class="sub">Akun baru wajib mengganti kata sandi sementara.</p><form id="cp" class="card"><label>Kata sandi baru</label><input id="newpw" type="password" minlength="8" required><label>Ulangi kata sandi</label><input id="newpw2" type="password" minlength="8" required><p class="err" id="cpe"></p><button class="btn" type="submit">Simpan kata sandi</button></form>'
});
document.addEventListener('click',async e=>{
   const ka=e.target.closest('[data-kolab-accept]'); if(ka){const {error}=await sb.from('proker_kolaborator').update({status:'bergabung',dikonfirmasi_oleh:S.user.id,komentar:null}).eq('proker_id',ka.dataset.kolabAccept).eq('organisasi_id',S.orgId);if(error)toast(error.message);else{toast('Undangan diterima.');await loadCollaborations();render();}return;} const kr=e.target.closest('[data-kolab-reject]'); if(kr){const {error}=await sb.from('proker_kolaborator').update({status:'ditolak',dikonfirmasi_oleh:S.user.id,komentar:'Ditolak oleh organisasi peserta.'}).eq('proker_id',kr.dataset.kolabReject).eq('organisasi_id',S.orgId);if(error)toast(error.message);else{toast('Undangan ditolak.');await loadCollaborations();render();}return;}
if(e.target.id==='show-signup'){showAuthPanel('signup');return;}
 if(e.target.id==='show-forgot'){showAuthPanel('forgot');return;}
 if(e.target.id==='back-login'||e.target.id==='back-login-2'){showAuthPanel('login');return;}
 if(e.target.id==='pending-logout'){await sb?.auth.signOut();S.user={nama:'',email:''};S.profile={tipe:'mahasiswa',status:null};S.ctxs=[];S.orgId=null;$('#app').hidden=true;$('#login').hidden=false;showAuthPanel('login');return;}
 const addAssignment=e.target.closest('[data-add-assignment]');
 if(addAssignment){
   const card=addAssignment.closest('[data-pending]');
   const list=card?.querySelector('[data-assignment-list]');
   const first=list?.querySelector('[data-assignment-row]');
   if(list&&first){
     const clone=first.cloneNode(true);
     clone.querySelector('[data-assignment-org]').value='';
     clone.querySelector('[data-assignment-jabatan]').value='Anggota';
     list.appendChild(clone);
   }
   return;
 }
 const removeAssignment=e.target.closest('[data-remove-assignment]');
 if(removeAssignment){
   const card=removeAssignment.closest('[data-pending]');
   const rows=card?.querySelectorAll('[data-assignment-row]');
   if(rows?.length>1) removeAssignment.closest('[data-assignment-row]').remove();
   return;
 }
 const approve=e.target.closest('[data-approve-user]');
 if(approve){const card=approve.closest('[data-pending]');await approvePending(approve.dataset.approveUser,card);return;}
 const reject=e.target.closest('[data-reject-user]');
 if(reject){const id=reject.dataset.rejectUser;const {error}=await sb.from('profiles').update({status:'ditolak'}).eq('id',id);if(error){toast(error.message);return;}await sb.from('notifikasi').insert({akun_id:id,pesan:'Pendaftaran akun Anda belum disetujui. Hubungi Admin Sistem untuk informasi lebih lanjut.'});toast('Pendaftaran ditolak.');loadApprovalQueue();return;}
 if(e.target.id==='bell'){
   if(!S.notificationsLoaded) await loadNotifications();
   const p=$('#notifyPanel'); if(p?.hidden) renderNotifications(); else if(p) p.hidden=true;
   return;
 }
 if(e.target.id==='av'){ S.view='profil'; render(); return; }
 if(e.target.id==='notif-read-all'){ await sb?.rpc('tandai_notifikasi_dibaca',{p_id:null}); await loadNotifications(); renderNotifications(); return; }
 const nr=e.target.closest('[data-notif]');
 if(nr){ await sb?.rpc('tandai_notifikasi_dibaca',{p_id:nr.dataset.notif}); await loadNotifications(); renderNotifications(); return; }
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
 const batas=p.batas_lpj ? new Date(p.batas_lpj+'T23:59:59') : null;
 const terlambat=!!(batas && new Date()>batas);
 const {error:ue}=await sb.from('dokumen').update({status:terlambat?'diajukan_terlambat':'diajukan'}).eq('id',dok.id);if(ue)throw ue;
 if(terlambat) await sb.from('notifikasi').insert({akun_id:S.user.id,organisasi_id:p.organisasi_id,pesan:'LPJ diajukan setelah batas 7 hari dan ditandai terlambat.'});
 toast(terlambat?'LPJ berhasil diunggah dan ditandai terlambat.':'LPJ dan seluruh berkas berhasil diunggah.');S.view='detail';render();
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
 if(e.target.id==='profile-form'){
   e.preventDefault();
   const er=$('#profile-error'); er.textContent='';
   const nama=$('#profile-nama').value.trim(), nim=$('#profile-nim').value.trim(), email=$('#profile-email').value.trim();
   if(!nama) return er.textContent='Nama lengkap wajib diisi.';
   try{
     let authEmail=S.user.email;
     if(email && email.toLowerCase()!==String(S.user.email||'').toLowerCase()){
       const {data,error}=await sb.auth.updateUser({email});
       if(error) throw error;
       authEmail=data.user?.email||S.user.email;
       if(String(authEmail).toLowerCase()!==email.toLowerCase()) toast('Permintaan perubahan email dikirim. Konfirmasi email baru diperlukan.');
     }
     let fotoPath=S.profile.foto_path||null;
     const file=$('#profile-photo')?.files?.[0];
     if(file){
       if(file.size>2*1024*1024) throw new Error('Foto profil maksimal 2 MB.');
       if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Foto harus JPG, PNG, atau WebP.');
       const ext=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];
       fotoPath=S.user.id+'/avatar-'+Date.now()+'.'+ext;
       const up=await sb.storage.from('profile-avatars').upload(fotoPath,file,{contentType:file.type,upsert:false});
       if(up.error) throw up.error;
     }
     const {data:upd,error}=await sb.rpc('update_profile_me',{p_nama:nama,p_nim:nim||null,p_foto_path:fotoPath});
     if(error) throw error;
     S.profile=upd||{...S.profile,nama,nim,email:authEmail,foto_path:fotoPath};
     if(fotoPath){const {data:signed}=await sb.storage.from('profile-avatars').createSignedUrl(fotoPath,3600);S.profile.foto_url=signed?.signedUrl||'';}
     toast('Profil berhasil diperbarui.'); render();
   }catch(ex){er.textContent=ex.message||String(ex);}
   return;
 }
 if(e.target.id==='cp'){e.preventDefault();const a=$('#newpw').value,b=$('#newpw2').value,er=$('#cpe');er.textContent='';if(a.length<8)return er.textContent='Kata sandi minimal 8 karakter.';if(a!==b)return er.textContent='Konfirmasi kata sandi tidak sama.';const {error}=await sb.auth.updateUser({password:a,user_metadata:{...S.user.user_metadata,must_change_password:false}});if(error)return er.textContent=error.message;S.user.user_metadata={...S.user.user_metadata,must_change_password:false};toast('Kata sandi berhasil diganti.');S.view='beranda';render();}
});

if(sb){
  sb.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'&&session){
      S.user={...session.user,nama:session.user.user_metadata?.nama||session.user.email};
      $('#login').hidden=true;$('#app').hidden=false;S.view='reset-password';render();
    }
  });
}
setInterval(()=>{ if(!$('#app')?.hidden && S.user?.id) loadNotifications(); },60000);
