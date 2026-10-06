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
      const hc=ws['H'+r],note=[cv(ws,'K'+r),cv(ws,'L'+r)].filter(x=>x!=null&&x!=='').map(x=>String(x).trim()).join('\n');
      const t={id:uid('t')+total,title:title.trim(),weight:+cv(ws,'C'+r)||0,deadline:xlDate(ws['D'+r]),submitted:xlDate(ws['E'+r]),approval:String(cv(ws,'J'+r)||'').trim(),note};
      if(hc&&!hc.f&&typeof hc.v==='number')t.bonusManual=hc.v;         /* cột Điểm thưởng bị gõ đè số → điểm thưởng nhập tay */
      months[mm].tasks.push(t);total++;
    }
  }
  if(!found)throw new Error('không có sheet tháng nào (M01…M12).');
  return{code:String(code).trim(),name:String(name).trim(),year,months,total};
}
ACT['imp-open']=()=>{
  if(!can('admin'))return toast('Chỉ Admin được nhập file Excel.','error');
  IMP={items:[]};
  modal('Nhập file Excel KPI cá nhân',`<form id="mf" data-submit="imp-save">
    <p class="note" style="padding-top:0">Chọn một hoặc nhiều file <b>.xlsx</b> theo mẫu <b>KPI_Individual_report</b> (sheet Summary + M01…M12). Mỗi file là một nhân viên trong một năm. Nhân viên chưa có trong danh sách sẽ được tạo mới theo Mã NV.</p>
    <div class="drop" id="imp-drop"><input class="in" type="file" id="imp-file" accept=".xlsx,.xlsm" multiple aria-label="File Excel KPI cá nhân"><small class="muted">hoặc kéo thả file vào đây</small></div>
    <div id="imp-list"></div></form>`,{footer:cancelBtn+'<button class="btn primary" form="mf" id="imp-ok" disabled>Nhập</button>',size:'mid'});
  const dz=$('#imp-drop');
  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('over')}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('over')}));
  dz.addEventListener('drop',e=>impRead(e.dataTransfer.files));
  $('#imp-file').addEventListener('change',e=>impRead(e.target.files));
};
async function impRead(files){
  if(!IMP)return;
  if(!window.XLSX)return toast('Chưa tải được thư viện Excel (SheetJS). Kiểm tra kết nối mạng.','error');
  const box=$('#imp-list');if(box)box.innerHTML='<p class="note" role="status">Đang đọc file…</p>';
  const items=[];
  for(const f of [...files]){
    try{const d=parseKpiWorkbook(XLSX.read(await f.arrayBuffer(),{type:'array'}));items.push({file:f.name,d})}
    catch(e){items.push({file:f.name,err:/^không/.test(e.message)?e.message:'không đọc được file. Hãy chọn file .xlsx theo mẫu KPI cá nhân.'})}
  }
  if(!IMP)return;IMP.items=items;impRender();
}
function impRender(){
  const box=$('#imp-list'),ok=$('#imp-ok');if(!box)return;const good=IMP.items.filter(x=>x.d);
  box.innerHTML=IMP.items.length?miniTable(['File','Nhân viên','Năm','Số việc','KPI trung bình','Kết quả'],IMP.items.map(x=>{
    if(x.err)return `<tr><td>${esc(x.file)}</td><td colspan="4" class="tag-bad">File ${esc(x.err)}</td><td>${badge('bad','Bỏ qua')}</td></tr>`;
    const e=empByCode(x.d.code),ys=yearStats(x.d),has=e&&sheetOf(e.id,x.d.year);
    return `<tr><td>${esc(x.file)}</td><td><b>${esc(x.d.name)}</b><small>${esc(x.d.code)}${e?'':' · nhân viên mới'}</small></td><td class="num">${x.d.year}</td><td class="num">${x.d.total}</td><td class="num">${fmtK(ys.avg)}<small>${ys.ev.length} tháng đã chấm</small></td><td>${has?badge('warn','Ghi đè bảng KPI '+x.d.year):badge('ok','Thêm mới')}</td></tr>`})):'' ;
  if(good.some(x=>{const e=empByCode(x.d.code);return e&&sheetOf(e.id,x.d.year)}))box.innerHTML+='<p class="note tag-warn">Bảng KPI bị ghi đè sẽ mất các thay đổi đã làm trên app cho năm đó (việc đã chuyển tháng, nhận xét, việc thêm tay).</p>';
  if(ok){ok.disabled=!good.length;ok.textContent=good.length?`Nhập ${good.length} file`:'Nhập'}
}
SUB['imp-save']=()=>{
  if(!IMP||!can('admin'))return;const good=IMP.items.filter(x=>x.d);if(!good.length)return;let lastId=null,lastY=null;
  const ok=transact(()=>{good.forEach(({d})=>{
    let e=empByCode(d.code);if(!e){e={id:uid('e'),code:d.code,name:d.name,dept:'',title:'',email:'',note:'',active:true,createdAt:Date.now()};db.employees.push(e)}
    db.sheets=db.sheets.filter(s=>s.id!==sheetId(e.id,d.year));
    db.sheets.push({id:sheetId(e.id,d.year),empId:e.id,year:d.year,months:d.months,updatedAt:todayStr(),source:'Excel'});lastId=e.id;lastY=d.year})});
  if(!ok)return;
  const n=good.length;closeModal();toast(`Đã nhập ${n} bảng KPI`);
  if(n===1){(ui.f['emp/'+lastId]??={}).year=String(lastY);delete ui.f['emp/'+lastId].mm;if(location.hash==='#/emp/'+lastId)render(false);else location.hash='#/emp/'+lastId}else rerender();
};
