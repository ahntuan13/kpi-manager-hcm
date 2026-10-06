/* 51-cloud-backup.js – Sao lưu đám mây: tự chụp dữ liệu mỗi ngày lên Firestore, sao lưu thủ công, khôi phục / tải về
   - Mỗi bản sao lưu = backups/{id} (thông tin) + backups/{id}/parts/{n} (dữ liệu JSON chia nhỏ, mỗi phần ≤ 900 KB).
   - Bản sao lưu KHÔNG sửa được sau khi tạo (Rules chặn update) nên lỗi app hay thao tác nhầm không ghi đè được bản cũ.
   - Tự động: người có quyền ghi mở app lần đầu trong ngày → tạo 1 bản "Tự động". Giữ BACKUP_KEEP bản gần nhất (Admin dọn bớt).
   - Trước khi khôi phục, app tự tạo thêm 1 bản "Trước khôi phục" để có thể quay lại. */
'use strict';
(self.__mods=self.__mods||[]).push('51-cloud-backup');

const BACKUP_KEEP=60, PART_SIZE=900000;
const BK_KIND={auto:['mute','Tự động'],manual:['info','Thủ công'],pre:['warn','Trước khôi phục']};
let bkList=null,bkBusy=false,bkAt=0;

function bkPayload(){return{app:'kpi-hcm',version:db.version||1,at:new Date().toISOString(),company:db.company,seq:db.seq,employees:db.employees,sheets:db.sheets}}

async function cloudBackup(kind='manual'){
  if(!CLOUD||!cloudReady||!can('write'))throw new Error('Chỉ sao lưu đám mây được khi đã đăng nhập Firebase với quyền ghi.');
  const json=JSON.stringify(bkPayload()),parts=[];
  for(let i=0;i<json.length;i+=PART_SIZE)parts.push(json.slice(i,i+PART_SIZE));
  const id=`b_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,ref=fbStore.collection('backups').doc(id);
  const b=fbStore.batch();
  parts.forEach((d,i)=>b.set(ref.collection('parts').doc(String(i)),{d}));
  b.set(ref,{at:Date.now(),date:todayStr(),kind,by:session.name||session.username||'',parts:parts.length,size:json.length,counts:{employees:db.employees.length,sheets:db.sheets.length,tasks:taskCount()}});
  await b.commit();
  if(kind!=='pre')await fbStore.doc('config/backup').set({last:todayStr(),at:Date.now(),by:session.name||''});
  return id;
}

/* Tự động sao lưu 1 lần mỗi ngày (gọi sau khi tải xong dữ liệu Firebase) */
async function autoBackup(){
  try{
    if(!CLOUD||!can('write')||(!db.employees.length&&!db.sheets.length))return;
    const s=await fbStore.doc('config/backup').get();
    if(s.exists&&s.data().last===todayStr())return;
    await cloudBackup('auto');
    if(can('admin'))await pruneBackups();
  }catch(e){console.warn('Tự động sao lưu thất bại',e)}
}
async function pruneBackups(){
  const s=await fbStore.collection('backups').orderBy('at','desc').get();
  const old=s.docs.slice(BACKUP_KEEP);
  for(const d of old)await deleteBackup(d.id,true);
}
async function deleteBackup(id,silent){
  const ref=fbStore.collection('backups').doc(id),ps=await ref.collection('parts').get(),b=fbStore.batch();
  ps.docs.forEach(p=>b.delete(p.ref));b.delete(ref);await b.commit();
  if(!silent)toast('Đã xoá bản sao lưu');
}
async function readBackup(id){
  const ref=fbStore.collection('backups').doc(id),m=await ref.get();if(!m.exists)throw new Error('Không tìm thấy bản sao lưu.');
  const ps=await ref.collection('parts').get(),n=m.data().parts;
  if(ps.size!==n)throw new Error(`Bản sao lưu bị thiếu dữ liệu (${ps.size}/${n} phần).`);
  const json=ps.docs.sort((a,b)=>+a.id-+b.id).map(p=>p.data().d).join('');
  const p=JSON.parse(json);
  if(!Array.isArray(p.employees)||!Array.isArray(p.sheets))throw new Error('Bản sao lưu không đúng định dạng.');
  return{meta:m.data(),data:p};
}

/* ---------- giao diện (Settings → Sao lưu & Hệ thống) ---------- */
function cloudBackupCard(){
  if(!CLOUD)return card('Sao lưu đám mây',`<p class="note">Cần bật Firebase để sao lưu lên đám mây. Ở chế độ cục bộ, dùng “Xuất sao lưu (JSON)” bên dưới.</p>`);
  const adm=can('admin'),w=can('write');
  return card('Sao lưu đám mây (Firebase)',`<p class="note" style="margin-top:-6px">App <b>tự động sao lưu mỗi ngày</b> một lần khi người có quyền ghi mở app. Bản sao lưu lưu trên Firestore, không sửa được sau khi tạo, giữ ${BACKUP_KEEP} bản gần nhất. Khôi phục sẽ thay dữ liệu của <b>tất cả mọi người</b>, trước đó app tự tạo một bản “Trước khôi phục” để có thể quay lại.</p>
    <div class="bar"><button class="btn acc" data-act="bk-now" ${w?'':'disabled'}>☁ Sao lưu ngay</button>${adm?'<button class="btn" data-act="bk-refresh">↻ Tải lại danh sách</button>':''}</div>
    <div id="bk-list">${adm?'<div class="note">Đang tải danh sách…</div>':'<div class="note">Chỉ Admin xem được danh sách và khôi phục bản sao lưu.</div>'}</div>`);
}
function bkListHTML(){
  if(!bkList)return '<div class="note">Đang tải danh sách…</div>';
  if(!bkList.length)return '<div class="note">Chưa có bản sao lưu nào. Bấm “Sao lưu ngay” để tạo bản đầu tiên.</div>';
  return miniTable(['Thời điểm','Loại','Người tạo','Nhân viên','Công việc','Dung lượng',''],bkList.map(b=>`<tr><td>${fmtDT(new Date(b.at).toISOString())}</td><td>${badge(...(BK_KIND[b.kind]||BK_KIND.manual))}</td><td>${esc(b.by||'')}</td><td class="num">${b.counts?.employees??'—'}</td><td class="num">${b.counts?.tasks??'—'}</td><td class="num">${fmtNum(Math.ceil((b.size||0)/1024))} KB</td><td class="act"><button class="btn sm" data-act="bk-dl" data-id="${b.id}">⬇ JSON</button> <button class="btn sm primary" data-act="bk-restore" data-id="${b.id}">Khôi phục</button> <button class="btn sm danger" data-act="bk-del" data-id="${b.id}">Xoá</button></td></tr>`));
}
async function loadBackupList(){
  const el=$('#bk-list');if(!el||!CLOUD||!can('admin'))return;
  try{const s=await fbStore.collection('backups').orderBy('at','desc').limit(100).get();bkList=s.docs.map(d=>({id:d.id,...d.data()}));bkAt=Date.now()}
  catch(e){el.innerHTML=`<div class="note tag-bad">Không tải được danh sách: ${esc(authMsg(e))} Hãy kiểm tra đã dán Rules mới (có mục backups) vào Firebase chưa.</div>`;return}
  const el2=$('#bk-list');if(el2)el2.innerHTML=bkListHTML();
}
if(PAGES['set/system'])PAGES['set/system'].m=()=>{if(bkList){const el=$('#bk-list');if(el&&can('admin'))el.innerHTML=bkListHTML()}if(!bkList||Date.now()-bkAt>30000)loadBackupList()};

ACT['bk-now']=async el=>{
  if(bkBusy)return;bkBusy=true;el.disabled=true;
  try{await cloudBackup('manual');toast('Đã sao lưu lên đám mây');await loadBackupList()}catch(e){toast(authMsg(e),'error')}
  finally{bkBusy=false;el.disabled=false}
};
ACT['bk-refresh']=()=>loadBackupList();
ACT['bk-dl']=async el=>{
  try{const {meta,data}=await readBackup(el.dataset.id);const b=new Blob([JSON.stringify({...data,users:[]},null,1)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`sao-luu-kpi_${meta.date}_${el.dataset.id.slice(2,12)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
  catch(e){toast(authMsg(e),'error')}
};
ACT['bk-del']=async el=>{
  if(!confirm('Xoá vĩnh viễn bản sao lưu này?'))return;
  try{await deleteBackup(el.dataset.id);await loadBackupList()}catch(e){toast(authMsg(e),'error')}
};
ACT['bk-restore']=async el=>{
  if(!can('admin'))return toast('Chỉ Admin được khôi phục.','error');
  const b=(bkList||[]).find(x=>x.id===el.dataset.id);if(!b)return;
  if(!confirm(`Khôi phục dữ liệu về thời điểm ${fmtDT(new Date(b.at).toISOString())}?\n\n${b.counts?.employees??'?'} nhân viên, ${b.counts?.tasks??'?'} công việc.\nDữ liệu hiện tại của TẤT CẢ mọi người sẽ được thay thế (app tự sao lưu bản hiện tại trước).`))return;
  if(bkBusy)return;bkBusy=true;
  try{
    const {data}=await readBackup(b.id);
    await cloudBackup('pre');
    db.company={...db.company,...(data.company||{})};db.seq={...db.seq,...(data.seq||{})};
    db.employees=data.employees;db.sheets=data.sheets;
    migrate();save();await pushQ;
    shell();render(true);toast('Đã khôi phục dữ liệu từ bản sao lưu');loadBackupList();
  }catch(e){toast('Khôi phục thất bại: '+authMsg(e),'error')}
  finally{bkBusy=false}
};
