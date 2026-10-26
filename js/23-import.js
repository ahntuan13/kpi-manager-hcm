/* 23-import.js – Nhập file Excel KPI cá nhân (mẫu KPI_Individual_report: sheet Summary + M01…M12). Chọn được nhiều file một lần. */
'use strict';
(self.__mods=self.__mods||[]).push('23-import');

function xlDate(c){
  if(!c||c.v==null||c.v==='')return null;
  if(typeof c.v==='number')return isoOf(Math.round(c.v)-25569);          /* số ngày kiểu Excel → yyyy-mm-dd */
  if(c.v instanceof Date)return dstr(c.v);
  const s=String(c.v).trim();let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);if(m)return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[0]:null;
}
/* Đọc một workbook → {code,name,year,months}. Báo lỗi rõ khi file sai mẫu. */
function parseKpiWorkbook(wb){
  const cv=(ws,a)=>ws&&ws[a]&&ws[a].v!=null?ws[a].v:null,sm=wb.Sheets['Summary'];
  const name=cv(sm,'B2'),code=cv(sm,'F2'),year=+cv(sm,'I2');
  if(!sm||!name||!code||!(year>2000&&year<2100))throw new Error('không đúng mẫu KPI cá nhân: cần sheet Summary có Họ tên (B2), Mã NV (F2) và Năm (I2).');
  const months=emptyMonths();let total=0,found=0;
  for(const mm of MM){
    const ws=wb.Sheets['M'+mm];if(!ws||!ws['!ref'])continue;found++;
    const last=XLSX.utils.decode_range(ws['!ref']).e.r+1;
    for(let r=4;r<=last;r++){
      const a=cv(ws,'A'+r);
      if(typeof a==='string'&&a.includes('KPI T')){const k=cv(ws,'K'+r);months[mm].comment=typeof k==='string'?k.trim():'';break}
      const title=cv(ws,'B'+r);if(typeof title!=='string'||!title.trim())continue;
      const note=[cv(ws,'K'+r),cv(ws,'L'+r)].filter(x=>x!=null&&x!=='').map(x=>String(x).trim()).join('\n');
      /* Cột Điểm thưởng (H) không đọc: điểm thưởng luôn tính tự động theo ngày hoàn thành sớm. Cột Quản lý duyệt (J): "Đạt"/"Duyệt" → Duyệt, "Reject"/"Re-check" → Re-check. */
      const t={id:uid('t')+total,title:title.trim(),weight:+cv(ws,'C'+r)||0,deadline:xlDate(ws['D'+r]),submitted:xlDate(ws['E'+r]),approval:AP_VAL[apOf({approval:cv(ws,'J'+r)})],note};
      months[mm].tasks.push(t);total++;
    }
  }
  if(!found)throw new Error('không có sheet tháng nào (M01…M12).');
  return{code:String(code).trim(),name:String(name).trim(),year,months,total};
}

/* =====================================================================
   DANH MỤC CHỈ TIÊU KPI (Khung 2) – file Excel KPI cá nhân có các sheet "Individual KPIs – <tên>"
   Đọc mục I (từ dòng có cột A = I đến trước dòng II) của từng sheet, ghép nhân viên theo Mã NV (ô F4).
   Chỉ Admin / Quản lý. Không đổi điểm của việc. Nhập lại thì danh mục theo đúng file (xem kpiMerge).
   ===================================================================== */
function parseKpiCatalog(wb){
  const cv=(ws,a)=>ws&&ws[a]&&ws[a].v!=null?ws[a].v:null,s=v=>String(v??'').replace(/\r/g,'').trim();
  return wb.SheetNames.filter(n=>/^individual kpis/i.test(n.trim())).map(n=>{
    const ws=wb.Sheets[n];let r0=0;
    for(let r=1;r<=60&&!r0;r++)if(s(cv(ws,'A'+r))==='I')r0=r;   /* ponytail: mẫu hiện tại có mục I ở dòng 10; quét 60 dòng đầu, mẫu đổi thì nâng số này */
    const x={sheet:n.trim(),code:s(cv(ws,'F4')),name:s(cv(ws,'C3')),year:+((/nam\s*(\d{4})/.exec(norm(cv(ws,'A1')))||[])[1]||0)||null,
      sec:r0?s(cv(ws,'C'+r0)):'',secW:r0?r2((+cv(ws,'B'+r0)||0)*100):0,rows:[]};
    for(let r=r0+1;r0&&r<=r0+80;r++){
      const a=s(cv(ws,'A'+r));if(/^[IVX]+$/.test(a))break;   /* gặp mục II là hết mục I */
      const text=s(cv(ws,'C'+r)),g=cv(ws,'G'+r),w=typeof g==='number'?r2(g*100):null,last=x.rows[x.rows.length-1];
      if(!text&&w==null&&!a)continue;
      if(!a&&w==null&&last&&last.no&&!last.text&&last.w==null){last.text=text;continue}   /* sheet Chau: dòng số nhóm để trống, tên nhóm ở dòng dưới */
      x.rows.push({no:/^\d+$/.test(a)?a:'',text,w,rule:s(cv(ws,'H'+r))});
    }
    const taken=new Set();x.rows.forEach(k=>{k.id=kpiId(k.text||k.no,taken);taken.add(k.id)});
    return x;
  });
}
/* Quyền nhập: Admin – mọi file, tạo được nhân viên mới · Quản lý – nhân viên đã có trong danh sách · Nhân viên – chỉ file của chính mình (Mã NV trùng),
   mọi việc vào trạng thái Chờ duyệt, không ghi đè năm đã có việc được quản lý Duyệt. Trả về '' khi được nhập, ngược lại là lý do. */
const impMode=()=>can('admin')?'admin':can('manage')?'mgr':isStaff()&&session.empId?'staff':'';
function impBlock(d){
  const m=impMode(),e=empByCode(d.code);
  if(m==='admin')return '';
  if(!e)return m==='mgr'?`Mã NV ${d.code} chưa có trong danh sách nhân viên. Nhờ Admin thêm nhân viên trước.`:`Mã NV ${d.code} trong file không phải mã của bạn.`;
  if(m==='mgr')return '';
  if(e.id!==session.empId)return `Mã NV ${d.code} trong file không phải mã của bạn.`;
  const sh=sheetOf(e.id,d.year);if(sh&&MM.some(mm=>sh.months[mm].tasks.some(t=>apOf(t)==='ok')))return `năm ${d.year} đã có việc được quản lý Duyệt nên không ghi đè được. Nhờ quản lý nhập giúp.`;
  return '';
}
ACT['imp-open']=()=>{
  const mode=impMode();if(!mode)return toast('Tài khoản chưa được gắn với nhân viên nên chưa nhập được file.','error');
  IMP={items:[]};
  modal('Nhập file Excel KPI cá nhân',`<form id="mf" data-submit="imp-save">
    <p class="note" style="padding-top:0">Chọn một hoặc nhiều file <b>.xlsx</b> theo mẫu <b>KPI_Individual_report</b> (sheet Summary + M01…M12). Mỗi file là một nhân viên trong một năm. ${mode==='admin'?'Nhân viên chưa có trong danh sách sẽ được tạo mới theo Mã NV.':mode==='mgr'?'Chỉ nhập được cho nhân viên đã có trong danh sách (khớp theo Mã NV).':'Bạn chỉ nhập được file KPI của chính mình (Mã NV trong file phải trùng mã của bạn). Mọi việc sẽ ở trạng thái <b>Chờ duyệt</b> để quản lý duyệt trên app.'}</p>
    <div class="drop" id="imp-drop"><input class="in" type="file" id="imp-file" accept=".xlsx,.xlsm" multiple aria-label="File Excel KPI cá nhân"><small class="muted">hoặc kéo thả file vào đây</small></div>
    ${mode==='staff'?'':`<label class="chk" style="margin-top:10px"><input type="checkbox" id="imp-ap" checked> Coi các việc đã có điểm trong file là đã được quản lý <b>Duyệt</b>. Bỏ chọn nếu muốn duyệt lại từng việc trên app (khi đó KPI chưa được tính).</label>`}
    <div id="imp-list"></div></form>`,{footer:cancelBtn+'<button class="btn primary" form="mf" id="imp-ok" disabled>Nhập</button>',size:'mid'});
  const dz=$('#imp-drop');
  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('over')}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('over')}));
  dz.addEventListener('drop',e=>impRead(e.dataTransfer.files));
  $('#imp-file').addEventListener('change',e=>impRead(e.target.files));
  $('#imp-ap')?.addEventListener('change',impRender);
};
/* Bảng tháng dùng để nhập: khi chọn "coi là đã Duyệt", việc đã có Deadline + Ngày hoàn thành và cột Quản lý duyệt để trống được ghi Duyệt */
function impMonths(d){
  const staff=impMode()==='staff',auto=!staff&&($('#imp-ap')?$('#imp-ap').checked:true),ms=JSON.parse(JSON.stringify(d.months));
  if(staff)MM.forEach(mm=>ms[mm].tasks.forEach(t=>{t.approval=''}));   /* nhân viên tự nhập: tất cả chờ quản lý duyệt */
  if(auto)MM.forEach(mm=>ms[mm].tasks.forEach(t=>{if(t.deadline&&t.submitted&&!t.approval)t.approval=AP_VAL.ok}));
  return ms;
}
async function impRead(files){
  if(!IMP)return;
  if(!window.XLSX)return toast('Chưa tải được thư viện Excel (SheetJS). Kiểm tra kết nối mạng.','error');
  const box=$('#imp-list');if(box)box.innerHTML='<p class="note" role="status">Đang đọc file…</p>';
  const items=[];
  for(const f of [...files]){
    let wb=null;
    try{wb=XLSX.read(await f.arrayBuffer(),{type:'array'});const d=parseKpiWorkbook(wb);items.push({file:f.name,d})}
    catch(e){items.push({file:f.name,err:wb&&wb.SheetNames.some(n=>/^individual kpis/i.test(n.trim()))?'không theo mẫu việc tháng: đây là file danh mục chỉ tiêu KPI (sheet Individual KPIs…). Dùng nút “Nhập danh mục chỉ tiêu KPI” ở trang Tất cả nhân viên.':/^không/.test(e.message)?e.message:'không đọc được file. Hãy chọn file .xlsx theo mẫu KPI cá nhân.'})}
  }
  if(!IMP)return;IMP.items=items;impRender();
}
function impRender(){
  const box=$('#imp-list'),ok=$('#imp-ok');if(!box)return;IMP.items.forEach(x=>{if(x.d){const why=impBlock(x.d);if(why){x.err=why;x.d=null}}});const good=IMP.items.filter(x=>x.d);
  box.innerHTML=IMP.items.length?miniTable(['File','Nhân viên','Năm','Số việc','KPI trung bình','Kết quả'],IMP.items.map(x=>{
    if(x.err)return `<tr><td>${esc(x.file)}</td><td colspan="4" class="tag-bad">${/^không/.test(x.err)?'File ':''}${esc(x.err)}</td><td>${badge('bad','Bỏ qua')}</td></tr>`;
    const e=empByCode(x.d.code),ms=impMonths(x.d),ys=yearStats({year:x.d.year,months:ms}),has=e&&sheetOf(e.id,x.d.year);
    const odd=MM.reduce((a,mm)=>a+ms[mm].tasks.filter(t=>!(Number.isInteger(+t.weight)&&+t.weight>=W_MIN&&+t.weight<=W_MAX)).length,0);
    return `<tr><td>${esc(x.file)}</td><td><b>${esc(x.d.name)}</b><small>${esc(x.d.code)}${e?'':' · nhân viên mới'}</small></td><td class="num">${x.d.year}</td><td class="num">${x.d.total}<small>${ys.counted} đã duyệt · ${ys.pending} chờ duyệt${ys.recheck?' · '+ys.recheck+' Re-check':''}</small></td><td class="num">${fmtK(ys.avg)}<small>${ys.ev.length} tháng có điểm</small></td><td>${has?badge('warn','Ghi đè bảng KPI '+x.d.year):badge('ok','Thêm mới')}${odd?`<small class="tag-warn">${odd} việc có trọng số ngoài thang ${W_MIN}–${W_MAX}</small>`:''}</td></tr>`})):'' ;
  if(good.some(x=>{const e=empByCode(x.d.code);return e&&sheetOf(e.id,x.d.year)}))box.innerHTML+='<p class="note tag-warn">Bảng KPI bị ghi đè sẽ mất các thay đổi đã làm trên app cho năm đó (việc đã chuyển tháng, nhận xét, việc thêm tay).</p>';
  if(good.some(x=>{const e=empByCode(x.d.code),s=e&&sheetOf(e.id,x.d.year);return s&&s.kpi}))box.innerHTML+='<p class="note">Danh mục chỉ tiêu KPI (Khung 2) được giữ nguyên; các việc nhập từ file sẽ ở “Chưa phân loại” để chọn lại chỉ tiêu.</p>';
  if(ok){ok.disabled=!good.length;ok.textContent=good.length?`Nhập ${good.length} file`:'Nhập'}
}
SUB['imp-save']=()=>{
  if(!IMP||!impMode())return;const good=IMP.items.filter(x=>x.d);if(!good.length)return;let lastId=null,lastY=null;
  const ok=transact(()=>{good.forEach(({d})=>{
    const why=impBlock(d);if(why)throw new Error(why);
    let e=empByCode(d.code);if(!e){e={id:uid('e'),code:d.code,name:d.name,dept:'',title:'',email:'',note:'',active:true,createdAt:Date.now()};db.employees.push(e)}
    const old=sheetOf(e.id,d.year);db.sheets=db.sheets.filter(s=>s.id!==sheetId(e.id,d.year));
    db.sheets.push({id:sheetId(e.id,d.year),empId:e.id,year:d.year,months:impMonths(d),updatedAt:todayStr(),source:'Excel',...(old&&old.kpi?{kpi:old.kpi}:{})});lastId=e.id;lastY=d.year})});   /* giữ danh mục chỉ tiêu KPI (Khung 2) khi ghi đè bảng */
  if(!ok)return;
  const n=good.length;closeModal();toast(`Đã nhập ${n} bảng KPI`);
  if(n===1){(ui.f['emp/'+lastId]??={}).year=String(lastY);delete ui.f['emp/'+lastId].mm;if(location.hash==='#/emp/'+lastId)render(false);else location.hash='#/emp/'+lastId}else rerender();
};

/* ---------- Nhập danh mục chỉ tiêu KPI (Khung 2) – Admin / Quản lý. Một file cho cả phòng: mỗi sheet "Individual KPIs…" là một nhân viên ---------- */
ACT['kc-imp']=el=>{
  if(!can('manage'))return toast('Chỉ quản lý được nhập danh mục chỉ tiêu KPI.','error');
  IMP={kc:1,items:[],err:'',y:el.dataset.y||curYear()};   /* dùng chung biến IMP: đóng hộp thoại là tự xoá */
  modal('Nhập danh mục chỉ tiêu KPI (Excel)',`<form id="mf" data-submit="kc-imp-save">
    <p class="note" style="padding-top:0">Chọn file Excel KPI cá nhân có các sheet <b>Individual KPIs – tên nhân viên</b>. App đọc mục <b>I · KPI Công ty và hoạt động của phòng</b> của từng sheet và gắn cho nhân viên có cùng <b>Mã NV</b> (ô F4). Điểm của các việc không thay đổi. Nhập lại thì danh mục theo đúng file.</p>
    <div class="drop" id="kc-drop"><input class="in" type="file" id="kc-file" accept=".xlsx,.xlsm" aria-label="File Excel danh mục chỉ tiêu KPI"><small class="muted">hoặc kéo thả file vào đây</small></div>
    <div id="kc-list"></div></form>`,{footer:cancelBtn+'<button class="btn primary" form="mf" id="kc-ok" disabled>Nhập</button>',size:'wide'});
  const dz=$('#kc-drop');
  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('over')}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('over')}));
  dz.addEventListener('drop',e=>kcRead(e.dataTransfer.files[0]));
  $('#kc-file').addEventListener('change',e=>kcRead(e.target.files[0]));
};
async function kcRead(f){
  if(!IMP||!IMP.kc||!f)return;
  if(!window.XLSX)return toast('Chưa tải được thư viện Excel (SheetJS). Kiểm tra kết nối mạng.','error');
  const box=$('#kc-list');if(box)box.innerHTML='<p class="note" role="status">Đang đọc file…</p>';
  let items=[],err='';
  try{items=parseKpiCatalog(XLSX.read(await f.arrayBuffer(),{type:'array'}));if(!items.length)err='File không có sheet “Individual KPIs…”. File việc tháng theo mẫu KPI_Individual_report (sheet Summary + M01…M12) thì dùng nút “⬆ Nhập Excel KPI”.'}
  catch(e){err='Không đọc được file. Hãy chọn file .xlsx có các sheet “Individual KPIs…”.'}
  if(!IMP)return;
  IMP.err=err;IMP.items=items.map(x=>({...x,year:x.year||+IMP.y,e:x.code?empByCode(x.code):null}));kcRender();
}
/* Bảng xem trước: ai được nhập, tổng trọng số so với chuẩn Khung 2, chỉ tiêu bị bỏ và số việc sẽ về "Chưa phân loại" */
function kcRender(){
  const box=$('#kc-list'),ok=$('#kc-ok');if(!box||!IMP)return;const P=kpi2(),good=IMP.items.filter(x=>x.e);
  box.innerHTML=IMP.err?`<p class="note tag-bad">${esc(IMP.err)}</p>`:miniTable(['Sheet','Nhân viên','Năm','Số chỉ tiêu','Tổng trọng số','Chỉ tiêu bị bỏ','Kết quả'],IMP.items.map(x=>{
    if(!x.e)return `<tr><td>${esc(x.sheet)}</td><td>${esc(x.name)}<small>${esc(x.code)}</small></td><td colspan="4" class="tag-bad">${x.code?`Mã NV ${esc(x.code)} chưa có trong danh sách nhân viên. Nhờ Admin thêm nhân viên trước.`:'Sheet không có Mã NV (ô F4).'}</td><td>${badge('bad','Bỏ qua')}</td></tr>`;
    const m=kpiMerge(kpiOf(x.e.id,x.year),x.rows),drop=new Set(m.dropped.map(r=>r.id)),lost=kpiUse(x.e.id,x.year,id=>drop.has(id)),tot=r2(kpiRows(x).reduce((a,r)=>a+r.w,0)),cur=sheetOf(x.e.id,x.year);
    return `<tr><td>${esc(x.sheet)}</td><td><b>${esc(x.e.name)}</b><small>${esc(x.code)}</small></td><td class="num">${x.year}</td><td class="num">${kpiRows(x).length}</td><td class="num"><span class="${Math.abs(tot-P.userStd)>=0.01?'tag-warn':''}">${fmtK(tot)}</span><small>chuẩn ${P.userStd}</small></td><td>${m.dropped.length?`${m.dropped.map(r=>esc(kpiLabel(r.text))).join('; ')}<small class="tag-warn">${lost.n} việc về “Chưa phân loại”${lost.n?' · '+esc(lost.by):''}</small>`:'<span class="muted">—</span>'}</td><td>${cur&&cur.kpi?badge('warn','Cập nhật'):badge('ok','Thêm mới')}</td></tr>`}),'Không có sheet nào.');
  if(ok){ok.disabled=!good.length;ok.textContent=good.length?`Nhập cho ${good.length} nhân viên`:'Nhập'}
}
SUB['kc-imp-save']=()=>{
  if(!IMP||!IMP.kc||!can('manage'))return;const good=IMP.items.filter(x=>x.e);if(!good.length)return;
  if(transact(()=>good.forEach(x=>{const sh=sheetOf(x.e.id,x.year,true);sh.kpi={sec:x.sec,rows:kpiMerge(kpiOf(x.e.id,x.year),x.rows).rows};sh.updatedAt=todayStr()})))done(`Đã nhập danh mục chỉ tiêu KPI cho ${good.length} nhân viên`);
};
