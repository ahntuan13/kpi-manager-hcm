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
/* Đọc các sheet "Individual KPIs – <tên>" (file KPI KRIs cá nhân của phòng).
   Mỗi sheet → {sheet, code, name, year, sec, rows:[{id,no,text,w,rule,f,tgt,unit,freq}], months:{'01':{total,k1,k2,k3,grade}}}.
   - rows: mục I (KRI). f = Quy ước tính lấy từ công thức cột % của tháng 1 (đổi ô Kết quả thành x, ô khác thành giá trị) – 03-kri.js.
   - months: điểm Excel từng tháng: k2 = mục I, k1 = mục II (Thái độ & tuân thủ), k3 = mục III (Điểm thưởng), total = Tổng điểm đánh giá. */
const XL_MONTH_COLS=['I','L','O','U','X','AA','AG','AJ','AM','AS','AV','AY'];   /* cột Result của JAN…DEC; % = +1, Score = +2 */
function parseKpiCatalog(wb){
  const cv=(ws,a)=>ws&&ws[a]&&ws[a].v!=null?ws[a].v:null,s=v=>String(v??'').replace(/\r/g,'').trim(),sh=(c,d)=>XLSX.utils.encode_col(XLSX.utils.decode_col(c)+d);
  return wb.SheetNames.filter(n=>/^individual kpis/i.test(n.trim())).map(n=>{
    const ws=wb.Sheets[n];let r0=0,r2_=0,r3=0,rt=0,rg=0;
    for(let r=1;r<=80;r++){const a=s(cv(ws,'A'+r)),c=norm(cv(ws,'C'+r));if(a==='I'&&!r0)r0=r;else if(a==='II'&&!r2_)r2_=r;else if(a==='III'&&!r3)r3=r;if(!rt&&c.startsWith('tong diem'))rt=r;if(!rg&&c.startsWith('ket qua xep loai'))rg=r}
    const nm=s(cv(ws,'C3')),cd=s(cv(ws,'F4')),tail=n.trim().replace(/^individual kpis\s*[-–]?\s*/i,'').trim();
    const x={sheet:n.trim(),tail,code:/^[A-Za-z]{1,3}\d{3,}$/.test(cd)?cd:'',name:/[A-Za-zÀ-ỹ]{2,}/.test(nm)?nm:tail,year:+((/nam\s*(\d{4})/.exec(norm(cv(ws,'A1')))||[])[1]||0)||null,
      sec:r0?s(cv(ws,'C'+r0)):'',secW:r0?r2((+cv(ws,'B'+r0)||0)*100):0,rows:[],months:{},items:[]};
    const rowAt=new Map();
    const monthsOk=s(cv(ws,'I8')).toUpperCase()==='JAN';
    for(let r=r0+1;r0&&r<=r0+80;r++){
      const a=s(cv(ws,'A'+r));if(/^[IVX]+$/.test(a))break;   /* gặp mục II là hết mục I */
      const text=s(cv(ws,'C'+r)),g=cv(ws,'G'+r),w=typeof g==='number'?r2(g*100):null,last=x.rows[x.rows.length-1];
      if(!text&&w==null&&!a)continue;
      if(!a&&w==null&&last&&last.no&&!last.text&&last.w==null){last.text=text;continue}   /* sheet Chau: dòng số nhóm để trống, tên nhóm ở dòng dưới */
      const row={no:/^\d+$/.test(a)?a:'',text,w,rule:s(cv(ws,'H'+r))};
      if(w!=null){const pc=ws['J'+r];if(monthsOk&&pc&&pc.f)row.f=kxFromExcel(pc.f,'I'+r,ref=>cv(ws,ref));
        const tg=cv(ws,'D'+r);if(tg!=null&&tg!=='')row.tgt=s(tg);const un=s(cv(ws,'E'+r));if(un)row.unit=un;const fq=s(cv(ws,'F'+r));if(fq)row.freq=fq.replace(/\s*\n[\s\S]*/,'')}
      x.rows.push(row);if(w!=null)rowAt.set(r,row);
    }
    if(monthsOk&&rt)XL_MONTH_COLS.forEach((c,i)=>{const sc=sh(c,2),num=r=>{const v=r?cv(ws,sc+r):null;return typeof v==='number'?r2(v):null},t=num(rt);
      if(t==null)return;x.months[MM[i]]={total:t,k2:num(r0),k1:num(r2_),k3:num(r3),grade:rg?s(cv(ws,c+rg)):'',lines:{}}});
    const taken=new Set();x.rows.forEach(k=>{k.id=kpiId(k.text||k.no,taken);taken.add(k.id)});
    /* Đầu việc của cả 3 mục (I KRI · II Thái độ & tuân thủ · III Điểm thưởng): dòng có trọng số ở cột G; mỗi tháng lấy Result / % / Score */
    if(monthsOk&&r0&&rt){let sec='',n=0,head='';const cnt={};
      for(let r=r0;r<rt;r++){const a=s(cv(ws,'A'+r)),g=cv(ws,'G'+r),text=s(cv(ws,'C'+r));
        if(/^(I|II|III)$/.test(a)){sec=a;head='';continue}
        if(!sec)continue;if(typeof g!=='number'){if(text)head=text;continue}
        cnt[sec]=(cnt[sec]||0)+1;const ref=sec==='I'?rowAt.get(r):null;
        const it={key:`${sec}.${cnt[sec]}`,sec,text:(text||head).replace(/\s*\n[\s\S]*/,'').trim()||head,w:r2(g*100),...(ref?{kid:ref.id}:{})};x.items.push(it);
        XL_MONTH_COLS.forEach((c,i)=>{const m=x.months[MM[i]];if(!m)return;const rv=cv(ws,c+r),pv=cv(ws,sh(c,1)+r),sv=cv(ws,sh(c,2)+r);
          if(rv==null&&pv==null&&sv==null)return;m.lines[it.key]={r:rv==null||rv===''?null:typeof rv==='number'?r2(rv):s(rv),p:typeof pv==='number'?pv:null,s:typeof sv==='number'?r2(sv):null}})}}
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
    catch(e){items.push({file:f.name,err:wb&&wb.SheetNames.some(n=>/^individual kpis/i.test(n.trim()))?'không theo mẫu việc tháng: đây là file danh mục chỉ tiêu KPI (sheet Individual KPIs…). Dùng nút “Nhập KPI Individual (Excel)” ở trang Tất cả nhân viên.':/^không/.test(e.message)?e.message:'không đọc được file. Hãy chọn file .xlsx theo mẫu KPI cá nhân.'})}
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

/* ---------- Nhập KPI từ file Excel "Individual KPIs" – Admin / Quản lý. Một file cho cả phòng: mỗi sheet là một nhân viên ----------
   Với từng sheet: ghép nhân viên (theo Mã NV ô F4, họ tên ô C3 hoặc tên trên sheet; chọn lại được), rồi
   - Danh mục KRI: cập nhật danh mục chỉ tiêu mục I (kèm Quy ước tính) cho năm đó.
   - Điểm tháng: lấy Tổng điểm đánh giá của các tháng chọn làm điểm chốt (m.fixed); tuỳ chọn xoá việc trên app của các tháng đó.
   Trước khi ghi, app tự sao lưu đám mây (chế độ Firebase). */
ACT['kc-imp']=el=>{
  if(!can('manage'))return toast('Chỉ quản lý được nhập KPI từ file Excel.','error');
  IMP={kc:1,items:[],err:'',y:el.dataset.y||curYear()};   /* dùng chung biến IMP: đóng hộp thoại là tự xoá */
  modal('Nhập KPI từ file Excel (Individual KPIs)',`<form id="mf" data-submit="kc-imp-save">
    <p class="note" style="padding-top:0">Chọn file Excel KPI KRIs cá nhân có các sheet <b>Individual KPIs – tên</b>. Với mỗi nhân viên, chọn cần lấy gì:
      <b>Danh mục KRI</b> (mục I kèm quy ước tính, dùng để chấm các tháng từ tháng áp dụng quy chế mới) và <b>Điểm tháng</b> (Tổng điểm đánh giá của các tháng chọn, ghi thành điểm chốt; có thể xoá việc trên app của các tháng đó) và <b>Đầu việc theo tháng</b> (chọn từng đầu việc, từng tháng để đưa vào app kèm Kết quả, % đạt, Điểm như file).</p>
    <div class="drop" id="kc-drop"><input class="in" type="file" id="kc-file" accept=".xlsx,.xlsm" aria-label="File Excel KPI KRIs cá nhân"><small class="muted">hoặc kéo thả file vào đây</small></div>
    <div id="kc-list"></div></form>`,{footer:cancelBtn+'<button class="btn primary" form="mf" id="kc-ok" disabled>Nhập</button>',size:'wide'});
  const dz=$('#kc-drop');
  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('over')}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('over')}));
  dz.addEventListener('drop',e=>kcRead(e.dataTransfer.files[0]));
  $('#kc-file').addEventListener('change',e=>kcRead(e.target.files[0]));
};
/* ghép nhân viên: Mã NV → họ tên → tên trên sheet (từ cuối của họ tên, không dấu) */
function kcMatch(x){
  if(x.code){const e=empByCode(x.code);if(e)return e}
  const nn=norm(x.name),bn=db.employees.find(e=>norm(e.name)===nn);if(bn)return bn;
  const t=norm(x.tail).split(' ').pop(),c=t?db.employees.filter(e=>norm(e.name).split(' ').pop()===t):[];
  return c.length===1?c[0]:null;
}
async function kcRead(f){
  if(!IMP||!IMP.kc||!f)return;
  if(!window.XLSX)return toast('Chưa tải được thư viện Excel (SheetJS). Kiểm tra kết nối mạng.','error');
  const box=$('#kc-list');if(box)box.innerHTML='<p class="note" role="status">Đang đọc file…</p>';
  let items=[],err='';
  try{items=parseKpiCatalog(XLSX.read(await f.arrayBuffer(),{type:'array'}));if(!items.length)err='File không có sheet “Individual KPIs…”. File việc tháng theo mẫu KPI_Individual_report (sheet Summary + M01…M12) thì dùng nút “⬆ Nhập Excel KPI”.'}
  catch(e){console.error(e);err='Không đọc được file. Hãy chọn file .xlsx có các sheet “Individual KPIs…”.'}
  if(!IMP)return;
  const lastOld=MM.filter(mm=>`${IMP.y}-${mm}`<kpi2().since).pop()||'';   /* mặc định lấy điểm đến tháng trước tháng áp dụng quy chế mới */
  IMP.err=err;IMP.items=items.map((x,i)=>{const e=kcMatch(x),ms=MM.filter(mm=>x.months[mm]);
    const sel=new Set();ms.forEach(mm=>Object.keys(x.months[mm].lines||{}).forEach(k=>sel.add(k+'|'+mm)));   /* mặc định chọn mọi đầu việc có số liệu */
    return{...x,i,year:x.year||+IMP.y,eid:e?e.id:'',on:!!e,cat:true,from:ms[0]||'',to:ms.filter(mm=>mm<=lastOld).pop()||'',del:true,sel,open:false}});kcRender();
}
const kcSum=x=>{const ms=MM.filter(mm=>x.from&&x.to&&mm>=x.from&&mm<=x.to&&x.months[mm]);return ms};
const kcSelN=x=>kcSum(x).reduce((a,mm)=>a+(x.items||[]).filter(it=>x.sel.has(it.key+'|'+mm)).length,0);
const XL_SEC={I:'Work B · KRI (mục I)',II:'Work A · Thái độ & tuân thủ (mục II)',III:'Work C · Điểm thưởng (mục III)'};
const xlPct=p=>p==null?'–':Math.round(p*100)+'%',xlV=v=>v==null||v===''?'–':typeof v==='number'?fmtK2(v):esc(v);
/* bảng chọn đầu việc × tháng của một sheet */
function kcItemsHTML(x){const ms=kcSum(x);if(!ms.length)return '<p class="note">Chọn khoảng tháng lấy điểm trước.</p>';
  const cell=(it,mm)=>{const v=x.months[mm].lines[it.key];if(!v)return '<td class="c muted">·</td>';const on=x.sel.has(it.key+'|'+mm);
    return `<td class="c"><label class="kxc ${on?'on':''}" title="${esc(`T${+mm}: Kết quả ${v.r??'–'} · % ${xlPct(v.p)} · Điểm ${v.s??'–'}`)}"><input type="checkbox" data-kcx="${esc(it.key)}|${mm}" data-i="${x.i}" ${on?'checked':''}> ${v.s==null?'–':fmtK2(v.s)}</label></td>`};
  let sec='';
  return `<div class="tw"><table class="t kxm"><thead><tr><th>Đầu việc</th><th>Trọng số</th>${ms.map(mm=>`<th class="c"><button type="button" class="btn sm" data-kcxc="${mm}" data-i="${x.i}" title="Chọn / bỏ cả tháng">T${+mm}</button><br><small>${fmtK(x.months[mm].total)} đ</small></th>`).join('')}</tr></thead><tbody>
    ${x.items.map(it=>{const h=it.sec!==sec?`<tr class="kxs"><td colspan="${ms.length+2}"><b>${esc(XL_SEC[it.sec]||it.sec)}</b></td></tr>`:'';sec=it.sec;
      return h+`<tr><td><button type="button" class="lnk" data-kcxr="${esc(it.key)}" data-i="${x.i}" title="Chọn / bỏ đầu việc này ở mọi tháng"><b>${esc(it.key)}</b> ${esc(it.text)}</button></td><td class="num">${fmtK(it.w)}</td>${ms.map(mm=>cell(it,mm)).join('')}</tr>`}).join('')}</tbody></table></div>
    <p class="note">Ô đánh dấu = đưa đầu việc đó vào tháng đó (kèm Kết quả, % đạt, Điểm như file). Bấm tên đầu việc hoặc nút tháng để chọn / bỏ cả hàng, cả cột. Điểm KPI tháng luôn lấy đúng Tổng điểm đánh giá trong file.</p>`}
/* Bảng xem trước: mỗi sheet một dòng – nhân viên, danh mục KRI, điểm tháng lấy về */
function kcRender(){
  const box=$('#kc-list'),ok=$('#kc-ok');if(!box||!IMP)return;
  const opts=x=>`<option value="">— Chọn nhân viên —</option>${sortedEmps().map(e=>`<option value="${e.id}" ${e.id===x.eid?'selected':''}>${esc(e.name)} · ${esc(e.code)}</option>`).join('')}`;
  const mSel=(x,k)=>`<select class="in sm" data-kcm="${k}" data-i="${x.i}" aria-label="${k==='from'?'Từ tháng':'Đến tháng'} của ${esc(x.sheet)}"><option value="">—</option>${MM.filter(mm=>x.months[mm]).map(mm=>`<option value="${mm}" ${x[k]===mm?'selected':''}>T${+mm}</option>`).join('')}</select>`;
  box.innerHTML=IMP.err?`<p class="note tag-bad">${esc(IMP.err)}</p>`:miniTable(['','Sheet / Nhân viên','Danh mục KRI','Điểm tháng lấy về','Đầu việc theo tháng','Xoá việc trên app các tháng đó'],IMP.items.map(x=>{
    const e=empOf(x.eid),lines=x.rows.filter(r=>r.w!=null),tot=r2(lines.reduce((a,r)=>a+r.w,0)),nf=lines.filter(r=>!r.f).length,ms=kcSum(x),sh=e&&sheetOf(e.id,x.year);
    const nTask=sh?ms.reduce((a,mm)=>a+sh.months[mm].tasks.length,0):0;
    return `<tr${x.on&&e?'':' style="opacity:.6"'}><td><input type="checkbox" data-kci="on" data-i="${x.i}" ${x.on?'checked':''} aria-label="Nhập sheet ${esc(x.sheet)}"></td>
      <td><b>${esc(x.sheet)}</b><small>${esc(x.name)}${x.code?' · '+esc(x.code):''} · năm ${x.year}</small><select class="in sm" data-kce data-i="${x.i}" aria-label="Nhân viên của sheet ${esc(x.sheet)}" style="margin-top:4px;max-width:240px">${opts(x)}</select></td>
      <td><label class="chk"><input type="checkbox" data-kci="cat" data-i="${x.i}" ${x.cat?'checked':''}> Cập nhật</label><small>${lines.length} chỉ tiêu · tổng trọng số ${fmtK(tot)}${nf?` · <span class="tag-warn">${nf} dòng chưa có quy ước tính</span>`:''}</small></td>
      <td><div style="display:flex;gap:6px;align-items:center">${mSel(x,'from')}<span>→</span>${mSel(x,'to')}</div><small>${ms.length?ms.map(mm=>`T${+mm}: <b>${fmtK(x.months[mm].total)}</b>`).join(' · '):'Không lấy điểm tháng nào'}</small></td>
      <td>${ms.length&&x.items.length?`<button type="button" class="btn sm ${x.open?'primary':''}" data-kco="${x.i}">${x.open?'▲ Thu gọn':'▼ Chọn đầu việc'}</button><small>${kcSelN(x)} / ${ms.reduce((a,mm)=>a+Object.keys(x.months[mm].lines||{}).length,0)} ô đã chọn · ${x.items.length} đầu việc</small>`:'<span class="muted">—</span>'}</td>
      <td>${ms.length?`<label class="chk"><input type="checkbox" data-kci="del" data-i="${x.i}" ${x.del?'checked':''}> Xoá ${nTask} việc</label><small>${x.del?'Chỉ giữ điểm Excel cho các tháng này':'Giữ việc; điểm tháng vẫn lấy theo Excel'}</small>`:'<span class="muted">—</span>'}</td></tr>${x.open&&ms.length?`<tr class="kxrow"><td></td><td colspan="5">${kcItemsHTML(x)}</td></tr>`:''}`}),'Không có sheet nào.');
  const good=IMP.items.filter(x=>x.on&&x.eid&&(x.cat||kcSum(x).length));
  if(ok){ok.disabled=!good.length;ok.textContent=good.length?`Nhập cho ${good.length} nhân viên`:'Nhập'}
}
document.addEventListener('click',ev=>{const el=ev.target.closest&&ev.target.closest('[data-kco],[data-kcxc],[data-kcxr]');if(!el||!IMP||!IMP.kc)return;
  if(el.dataset.kco!=null){const x=IMP.items[+el.dataset.kco];if(x){x.open=!x.open;kcRender()}return}
  const x=IMP.items[+el.dataset.i];if(!x)return;const ms=kcSum(x);
  const cells=el.dataset.kcxc?x.items.filter(it=>x.months[el.dataset.kcxc].lines[it.key]).map(it=>it.key+'|'+el.dataset.kcxc):ms.filter(mm=>x.months[mm].lines[el.dataset.kcxr]).map(mm=>el.dataset.kcxr+'|'+mm);
  const all=cells.every(k=>x.sel.has(k));cells.forEach(k=>all?x.sel.delete(k):x.sel.add(k));kcRender()});
document.addEventListener('change',ev=>{const el=ev.target;if(!IMP||!IMP.kc||!el.closest||!el.closest('#kc-list'))return;const x=IMP.items[+el.dataset.i];if(!x)return;
  if(el.dataset.kcx){el.checked?x.sel.add(el.dataset.kcx):x.sel.delete(el.dataset.kcx);kcRender();return}
  if(el.dataset.kci)x[el.dataset.kci]=el.checked;else if(el.matches('[data-kce]')){x.eid=el.value;if(el.value)x.on=true}else if(el.dataset.kcm){x[el.dataset.kcm]=el.value;if(x.from&&x.to&&x.from>x.to){if(el.dataset.kcm==='from')x.to=x.from;else x.from=x.to}}
  kcRender()});
SUB['kc-imp-save']=async()=>{
  if(!IMP||!IMP.kc||!can('manage'))return;const good=IMP.items.filter(x=>x.on&&x.eid&&empOf(x.eid)&&(x.cat||kcSum(x).length));if(!good.length)return;
  const dup=good.map(x=>x.eid+'_'+x.year).find((k,i,a)=>a.indexOf(k)!==i);if(dup)return toast(`Hai sheet đang chọn cùng một nhân viên (${empName(dup.split('_')[0])}). Chọn lại nhân viên cho từng sheet.`,'error');
  const delN=good.reduce((a,x)=>{const sh=sheetOf(x.eid,x.year);return a+(x.del&&sh?kcSum(x).reduce((b,mm)=>b+sh.months[mm].tasks.length,0):0)},0);
  if(delN&&!confirm(`Sẽ xoá ${delN} việc trên app ở các tháng lấy điểm Excel. ${CLOUD?'App tự sao lưu đám mây trước khi ghi. ':'Nên xuất sao lưu trước. '}Tiếp tục?`))return;
  const btn=$('#kc-ok');if(btn){btn.disabled=true;btn.textContent='Đang nhập…'}
  if(CLOUD&&typeof cloudBackup==='function'&&can('write')){try{await cloudBackup('pre')}catch(e){if(!confirm('Chưa sao lưu đám mây được ('+authMsg(e)+'). Vẫn nhập?')){kcRender();return}}}
  const at=todayStr(),by=session?.name||'';let nCat=0,nM=0,nDel=0,nX=0;
  if(transact(()=>good.forEach(x=>{const sh=sheetOf(x.eid,x.year,true);
    if(x.cat){sh.kpi={sec:x.sec,rows:kpiMerge(kpiOf(x.eid,x.year),x.rows).rows.map(r=>{const o=sh.kpi&&sh.kpi.rows.find(z=>z.id===r.id);return o&&o.src?{...r,src:o.src}:r})};nCat++}   /* giữ lựa chọn "Công việc hằng ngày" đã đặt */
    kcSum(x).forEach(mm=>{const m=sh.months[mm],v=x.months[mm];m.fixed={total:v.total,k1:v.k1,k2:v.k2,k3:v.k3,grade:v.grade||'',src:'Excel',sheet:x.sheet,at,by};nM++;
      /* đầu việc đã chọn của tháng: lưu kèm Kết quả / % đạt / Điểm như file */
      const xl=x.items.filter(it=>x.sel.has(it.key+'|'+mm)&&v.lines[it.key]).map(it=>{const l=v.lines[it.key];return{key:it.key,sec:it.sec,text:it.text,w:it.w,...(it.kid?{kid:it.kid}:{}),r:l.r,p:l.p,s:l.s}});
      if(xl.length){m.xl=xl;nX+=xl.length}else delete m.xl;
      if(x.del&&m.tasks.length){nDel+=m.tasks.length;m.tasks=[]}});
    sh.updatedAt=at})))done(`Đã nhập: ${nCat} danh mục KRI · ${nM} tháng điểm chốt · ${nX} đầu việc${nDel?` · xoá ${nDel} việc`:''}`);
  else kcRender();
};
