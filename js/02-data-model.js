/* 02-data-model.js – Mô hình dữ liệu: nhân viên, bảng KPI (nhân viên × năm × 12 tháng), công thức tính điểm; tải/lưu */
'use strict';
(self.__mods=self.__mods||[]).push('02-data-model');

/* ---------- danh mục cố định ---------- */
/* 3 vai trò: Admin (toàn quyền) · Quản lý (xem tất cả, sửa việc, duyệt, nhận xét) · Nhân viên (chỉ thấy và sửa việc của chính mình) */
const ROLES={admin:'Admin',member:'Quản lý',staff:'Nhân viên'};
/* Nhóm trong phòng (trường dept của nhân viên). Sửa ở Settings → Nhóm & ngày lễ. */
const DEFAULT_DEPTS=['AD','HR'];
/* Ngày nghỉ lễ Việt Nam – lấy từ sheet Holiday_VN của file KPI cá nhân. Sửa ở Settings → Nhóm & ngày lễ. */
const DEFAULT_HOLIDAYS='2024-01-01,2024-02-10,2024-02-11,2024-02-12,2024-02-13,2024-02-14,2024-04-30,2024-05-01,2024-05-07,2024-06-01,2024-09-02,2024-09-17,2025-01-01,2025-01-29,2025-01-30,2025-01-31,2025-02-01,2025-02-02,2025-04-30,2025-05-01,2025-06-01,2025-09-02,2025-10-06,2026-01-01,2026-02-14,2026-02-16,2026-02-17,2026-02-18,2026-02-19,2026-02-20,2026-02-21,2026-04-25,2026-04-27,2026-04-30,2026-05-01,2026-06-01,2026-09-01,2026-09-02,2026-09-24,2027-01-01,2027-02-06,2027-02-07,2027-02-08,2027-02-09,2027-02-10,2027-04-30,2027-05-01,2027-06-01,2027-09-02,2027-09-14,2028-01-01,2028-01-25,2028-01-26,2028-01-27,2028-01-28,2028-01-29,2028-04-30,2028-05-01,2028-06-01,2028-09-02,2028-10-02,2029-01-01,2029-02-13,2029-02-14,2029-02-15,2029-02-16,2029-02-17,2029-04-30,2029-05-01,2029-06-01,2029-09-02,2029-09-22,2030-01-01,2030-02-02,2030-02-03,2030-02-04,2030-02-05,2030-02-06,2030-04-30,2030-05-01,2030-06-01,2030-09-02,2030-09-11'.split(',');
const MM=['01','02','03','04','05','06','07','08','09','10','11','12'];
const QN=['Quý I','Quý II','Quý III','Quý IV'], QR=['T01–T03','T04–T06','T07–T09','T10–T12'];
/* Quy chế KPI (theo file Excel): trễ 1 ngày −3 điểm, sớm 1 ngày làm việc +3 điểm thưởng (tối đa 30), KPI tháng khống chế 0–130.
   Trọng số do nhân viên tự chấm theo thang 1–10. */
const KPI_CAP=130, LATE_PENALTY=3, BONUS_PER_DAY=3, BONUS_CAP=30, W_MIN=1, W_MAX=10;
/* Quản lý duyệt: 'ok' = Duyệt → điểm thành phần được tính vào KPI · 'recheck' = Re-check → không tính điểm, báo đỏ · '' = chờ duyệt → chưa tính.
   Dữ liệu cũ / file Excel ghi "Đạt", "Reject" vẫn được hiểu đúng. */
const apOf=t=>{const a=String((t&&t.approval)||'').normalize('NFC').trim();return /^(duyệt|đạt|approved?)/i.test(a)?'ok':/^(re-?check|reject)/i.test(a)?'recheck':''};
const AP={'':['mute','Chờ duyệt'],ok:['ok','Duyệt'],recheck:['bad','Re-check']};
const AP_VAL={'':'',ok:'Duyệt',recheck:'Re-check'};
/* Xếp loại: [ngưỡng, màu badge, nhãn] */
const GRADES=[[120,'ok','Xuất sắc'],[100,'info','Tốt'],[80,'mute','Đạt'],[-1e9,'bad','Cần cải thiện']];
const DELAYS_RE=/\bdelays?\b/i;
const EMP_COLORS=['#2f7de1','#0e9f8b','#ec6a5e','#6c5ce7','#e29a2d','#d6447a','#22b8c9','#64748b'];

function defaultDB(){return{
  version:1,
  seq:{NV:0},
  company:{name:'TVE-HCM · KPI nhân viên',note:'',depts:[...DEFAULT_DEPTS],holidays:[...DEFAULT_HOLIDAYS]},
  users:[{id:'u_admin',username:'admin',name:'Quản trị',role:'admin',pass:pw('admin123'),active:true}],
  employees:[],sheets:[]
}}
function emptyCloudDB(){const d=defaultDB();d.users=[];return d}
let db=null, session=null;
const emptyMonths=()=>Object.fromEntries(MM.map(m=>[m,{tasks:[],comment:''}]));
function migrate(){const d=defaultDB();for(const k in d){if(db[k]===undefined)db[k]=d[k]}for(const k in d.seq){if(db.seq[k]===undefined)db.seq[k]=0}
  if(!db.company)db.company=d.company;
  if(!Array.isArray(db.company.depts))db.company.depts=[...DEFAULT_DEPTS];
  if(!Array.isArray(db.company.holidays))db.company.holidays=[...DEFAULT_HOLIDAYS];
  db.employees.forEach(e=>{if(e.active===undefined)e.active=true});
  db.sheets.forEach(s=>{if(!s.months)s.months={};MM.forEach(m=>{const x=s.months[m]||(s.months[m]={tasks:[],comment:''});if(!Array.isArray(x.tasks))x.tasks=[];if(x.comment==null)x.comment=''})});
  _hol=null}
function needsMigrate(){return db.sheets.some(s=>!s.months||MM.some(m=>!s.months[m]||!Array.isArray(s.months[m].tasks)))}
function load(){if(CLOUD){db=emptyCloudDB();migrate();return}try{const raw=localStorage.getItem(LS_KEY);db=raw?JSON.parse(raw):defaultDB()}catch(e){db=defaultDB()}migrate()}
function save(){_hol=null;if(CLOUD){cloudPush();return}try{localStorage.setItem(LS_KEY,JSON.stringify(db))}catch(e){toast('Không lưu được dữ liệu (bộ nhớ trình duyệt đầy?). Hãy xuất sao lưu ngay.','error')}}
/* Thực hiện thay đổi an toàn: lỗi thì trả lại dữ liệu cũ */
function transact(fn){const snap=JSON.stringify(db);try{fn();save();return true}catch(e){db=JSON.parse(snap);toast(e.message,'error');return false}}
const nextCode=(k,len=3)=>{db.seq[k]=(db.seq[k]||0)+1;return `${k}-${String(db.seq[k]).padStart(len,'0')}`};

/* =====================================================================
   CÔNG THỨC KPI – giữ đúng theo file Excel KPI cá nhân
   - Số ngày trễ: nộp trễ tính ngày lịch; nộp sớm tính ngày làm việc (bỏ T7, CN, lễ) và ra số âm.
   - Số ngày trễ (F): hoàn thành trễ tính ngày lịch; hoàn thành sớm tính ngày làm việc và ra số âm.
   - Điểm cơ bản (G) = 100 − 3 × ngày trễ (không âm).
   - Điểm thưởng (H, tự động) = IF(F<0, MIN(30, ABS(F)*3), 0). Không còn điểm thưởng nhập tay.
   - Điểm thành phần (I) = (G × Trọng số + H) / 100. Đây là điểm KPI của việc; chỉ được tính khi quản lý chọn Duyệt.
   - KPI tháng = tổng điểm thành phần của các việc đã Duyệt, khống chế 0–130.
   ===================================================================== */
const dayNum=iso=>{const [y,m,d]=iso.split('-').map(Number);return Math.round(Date.UTC(y,m-1,d)/864e5)};
const isoOf=n=>new Date(n*864e5).toISOString().slice(0,10);
let _hol=null;
const holSet=()=>_hol||(_hol=new Set(db.company.holidays||[]));
function networkdays(a,b){let n=0;const H=holSet();for(let x=a;x<=b;x++){const wd=new Date(x*864e5).getUTCDay();if(wd!==0&&wd!==6&&!H.has(isoOf(x)))n++}return n}
function scoreTask(t,today=todayStr()){
  const r={w:+t.weight||0,late:null,base:null,bonus:null,comp:null,state:'nodate',overdue:0,ap:apOf(t),counted:false};
  if(t.movedTo){r.state='moved';return r}
  if(!t.deadline||!t.submitted){
    if(t.deadline&&!t.submitted){if(t.deadline<today){r.state='overdue';r.overdue=dayNum(today)-dayNum(t.deadline)}else r.state='open'}
    return r;
  }
  const d=dayNum(t.deadline),s=dayNum(t.submitted);let late=0;
  if(s>d)late=s-d;
  else if(s<d){late=-(networkdays(s,d)-1);if(late>0)late=0}   /* hoàn thành sớm không bao giờ bị tính thành trễ */
  late=late||0;r.late=late;
  r.base=late>0?Math.max(0,100-late*LATE_PENALTY):100;
  r.bonus=late<0?Math.min(BONUS_CAP,-late*BONUS_PER_DAY):0;
  r.comp=(r.base*r.w+r.bonus)/100;
  r.state=late>0?'late':late<0?'early':'ontime';
  r.counted=r.ap==='ok';   /* chỉ việc đã Duyệt mới góp điểm vào KPI */
  return r;
}
/* Việc chưa hoàn thành là chuyển sang tháng sau được (không còn bắt buộc ghi "delays").
   Chữ "delays" ở Ghi chú chỉ còn là dấu đề nghị dời việc: việc đó được liệt kê ở Tổng quan. */
const canCarry=(t,sc)=>sc.comp==null&&sc.state!=='moved'&&!t.submitted;
const hasDelays=t=>DELAYS_RE.test((t&&t.note)||'');
/* Việc do quản lý giao (By Manager) và tag của việc */
const TAGS={pri:'★ Ưu tiên',imp:'◆ Quan trọng'};
const byMgr=t=>!!t&&t.by==='manager';
const tagsOf=t=>((t&&t.tags)||[]).filter(k=>TAGS[k]);
/* Comment by Manager: quản lý ghi khi chọn Re-check; done = nhân viên đã cập nhật lại (hiện mờ, gạch đi) */
const mcOf=t=>t&&t.mgrComment&&String(t.mgrComment.text||'').trim()?t.mgrComment:null;
function monthStats(m){
  const rows=((m&&m.tasks)||[]).map(t=>({t,sc:scoreTask(t)}));
  /* scored = việc đã hoàn thành (có deadline + ngày hoàn thành) · counted = đã Duyệt · pending = chờ duyệt · recheck = Re-check
     kpi = điểm chính thức (chỉ việc đã Duyệt) · self = điểm tự chấm (đã Duyệt + chờ duyệt, không gồm Re-check) */
  const st={rows,n:0,weight:0,raw:0,rawSelf:0,bonus:0,scored:0,counted:0,pending:0,recheck:0,ontime:0,early:0,late:0,open:0,nodate:0,overdue:0,moved:0,delays:0,kpi:null,self:null};
  for(const {t,sc} of rows){
    if(sc.state==='moved'){st.moved++;continue}
    st.n++;st.weight+=sc.w;st[sc.state]++;
    if(sc.comp!=null){st.scored++;
      if(sc.ap==='ok'){st.counted++;st.raw+=sc.comp;st.bonus+=sc.bonus}else if(sc.ap==='recheck')st.recheck++;else st.pending++;
      if(sc.ap!=='recheck')st.rawSelf+=sc.comp}
    if(canCarry(t,sc)&&hasDelays(t))st.delays++;
  }
  st.weight=r2(st.weight);
  const cap=v=>Math.min(KPI_CAP,Math.max(0,v));
  if(st.counted)st.kpi=cap(st.raw);
  if(st.counted+st.pending)st.self=cap(st.rawSelf);
  return st;
}
const avgOf=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
/* Trung bình chỉ tính các tháng đã có điểm (tháng chưa chấm không bị coi là 0).
   Tháng đang diễn ra (chưa kết thúc) chỉ là điểm TẠM TÍNH: giữ ở kpiProv, không tính vào quý / năm / xếp hạng. */
function yearStats(sheet){
  const months=MM.map(mm=>monthStats(sheet&&sheet.months&&sheet.months[mm]));
  if(sheet){const cy=+curYear(),ci=new Date().getMonth();months.forEach((m,i)=>{if(m.kpi!=null&&(+sheet.year>cy||(+sheet.year===cy&&i>=ci))){m.prov=true;m.kpiProv=m.kpi;m.kpi=null}})}
  const ev=months.map((m,i)=>m.kpi==null?null:i).filter(i=>i!=null),vals=ev.map(i=>months[i].kpi);
  const quarters=[0,1,2,3].map(q=>{const v=[0,1,2].map(k=>months[q*3+k].kpi).filter(x=>x!=null);return{avg:avgOf(v),n:v.length}});
  let sum=0,cnt=0;const ytd=months.map(m=>{if(m.kpi==null)return null;sum+=m.kpi;cnt++;return sum/cnt});
  const tot=k=>months.reduce((s,m)=>s+m[k],0);
  const maxI=ev.length?ev.reduce((a,b)=>months[b].kpi>months[a].kpi?b:a):null,minI=ev.length?ev.reduce((a,b)=>months[b].kpi<months[a].kpi?b:a):null;
  const scored=tot('scored'),onTime=tot('ontime')+tot('early');
  return{months,ev,avg:avgOf(vals),maxI,minI,quarters,ytd,last:ev.length?ev[ev.length-1]:null,
    scored,onTime,onPct:scored?onTime/scored*100:null,late:tot('late'),open:tot('open')+tot('nodate'),overdue:tot('overdue'),delays:tot('delays'),pending:tot('pending'),recheck:tot('recheck'),counted:tot('counted'),tasks:tot('n')};
}
const gradeOf=v=>v==null?null:GRADES.find(g=>v>=g[0]);
const mVal=m=>m.kpi??m.kpiProv??null;   /* điểm tháng, kể cả tạm tính */

/* ---------- truy vấn nhanh ---------- */
const by=(a,id)=>a.find(x=>x.id===id);
const empOf=id=>by(db.employees,id);
const empByCode=c=>db.employees.find(e=>String(e.code||'').trim().toLowerCase()===String(c||'').trim().toLowerCase());
const empName=id=>{const e=empOf(id);return e?e.name:'(đã xoá)'};
const empColor=id=>{const i=db.employees.findIndex(e=>e.id===id);return i>=0?EMP_COLORS[i%EMP_COLORS.length]:'#8494a8'};
const empAv=(e,cls='av')=>`<span class="${cls}" style="background:${empColor(e.id)}">${esc((String(e.name||'?').trim().split(/\s+/).pop()||'?').charAt(0).toUpperCase())}</span>`;
const depts=()=>{const d=[...(db.company.depts||[])];db.employees.forEach(e=>{if(e.dept&&!d.includes(e.dept))d.push(e.dept)});return d};
const deptOpts=(blank)=>[...(blank!==undefined?[['',blank]]:[]),...depts().map(d=>[d,d])];
const empOpts=(blank)=>[...(blank!==undefined?[['',blank]]:[]),...sortedEmps().map(e=>[e.id,`${e.name} · ${e.code}`])];
const sortedEmps=()=>db.employees.filter(mine).sort((a,b)=>String(a.name).localeCompare(String(b.name),'vi'));
const sheetId=(empId,year)=>`${empId}_${year}`;
function sheetOf(empId,year,create){
  let s=by(db.sheets,sheetId(empId,year));
  if(!s&&create){s={id:sheetId(empId,year),empId,year:+year,months:emptyMonths(),updatedAt:todayStr()};db.sheets.push(s)}
  return s;
}
const curYear=()=>String(new Date().getFullYear());
const curMonth=()=>pad(new Date().getMonth()+1);
const allYears=()=>{const ys=new Set([+curYear()]);db.sheets.forEach(s=>ys.add(+s.year));return[...ys].sort((a,b)=>b-a)};
const yearOpts=()=>allYears().map(v=>[String(v),String(v)]);
const empStats=(e,y)=>yearStats(sheetOf(e.id,y));
/* Mọi công việc của một năm, kèm nhân viên / tháng / điểm */
function allRows(y){
  const o=[];db.sheets.forEach(s=>{if(+s.year!==+y)return;const e=empOf(s.empId);if(!e||!mine(e))return;MM.forEach(mm=>(s.months[mm].tasks||[]).forEach(t=>o.push({e,s,mm,t,sc:scoreTask(t)})))});return o;
}
const taskCount=()=>db.sheets.reduce((a,s)=>a+MM.reduce((b,m)=>b+((s.months[m]&&s.months[m].tasks)||[]).length,0),0);
const nextOf=(year,mm)=>mm==='12'?{year:+year+1,mm:'01'}:{year:+year,mm:pad(+mm+1)};
const mLbl=(mm,year,baseYear)=>'T'+mm+(baseYear!==undefined&&+year!==+baseYear?'/'+year:'');
const fmtK=v=>v==null?'–':new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(v);
const fmtK2=v=>v==null?'–':new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(v);
const fmtDM=(iso,year)=>{if(!iso)return'–';const [y,m,d]=iso.split('-');return `${d}/${m}`+(+y!==+year?`/${y.slice(2)}`:'')};
/* ---------- phân quyền ----------
   can('admin')  : chỉ Admin (nhân viên, nhóm, ngày lễ, người dùng, sao lưu, nhập Excel)
   can('manage') : Admin + Quản lý (xem tất cả; thêm / sửa / giao việc cho mọi người; duyệt; nhận xét; chuyển việc sang tháng sau)
   Nhân viên     : chỉ thấy dữ liệu của chính mình (session.empId); thêm / sửa việc và tự chấm trọng số khi quản lý chưa Duyệt; chuyển việc chưa hoàn thành sang tháng sau */
const can=a=>{const r=session?.role;return a==='admin'?r==='admin':(r==='admin'||r==='member')};
const isStaff=()=>session?.role==='staff';
const mine=e=>!isStaff()||(!!e&&e.id===session.empId);
const canSheet=empId=>can('manage')||(isStaff()&&!!empId&&empId===session.empId);
const approved=t=>apOf(t)==='ok';
const canTask=(empId,t)=>can('manage')||(canSheet(empId)&&!approved(t));
const canDelTask=(empId,t)=>can('manage')||(canSheet(empId)&&t&&!t.submitted&&!t.approval&&!byMgr(t));   /* việc By Manager: nhân viên không xoá được */
const empHref=e=>isStaff()?'#/dash/me':'#/emp/'+e.id;
const homeHash=()=>isStaff()?'dash/me':'dash/overview';

/* ---------- chuyển việc chưa hoàn thành sang tháng sau ---------- */
function moveTasks(empId,year,mm,ids,newDeadline){
  const nx=nextOf(year,mm);let n=0;
  const ok=transact(()=>{
    const src=sheetOf(empId,year);if(!src)throw new Error('Không tìm thấy bảng KPI.');
    const dst=sheetOf(empId,nx.year,true);
    src.months[mm].tasks.forEach(t=>{
      if(!ids.includes(t.id))return;const sc=scoreTask(t);
      if(!canCarry(t,sc))throw new Error(`Việc “${t.title.split('\n')[0]}” đã hoàn thành hoặc đã được chuyển, không chuyển được.`);
      const c={id:uid('t'),title:t.title,weight:t.weight,deadline:newDeadline||t.deadline||null,submitted:null,approval:'',
        note:(t.note||'').replace(/\s*\bdelays?\b\s*/ig,' ').trim(),carriedFrom:{year:+year,month:mm,id:t.id,deadline:t.deadline||null}};
      if(byMgr(t)){c.by='manager';c.byName=t.byName||'';c.byAt=t.byAt||''}
      if(tagsOf(t).length)c.tags=tagsOf(t);
      dst.months[nx.mm].tasks.push(c);t.movedTo={year:nx.year,month:nx.mm,id:c.id,at:todayStr()};n++;
    });
    if(!n)throw new Error('Không có việc nào để chuyển.');
    src.updatedAt=dst.updatedAt=todayStr();
  });
  return ok?{n,nx}:null;
}
function undoMove(empId,year,mm,tid){
  return transact(()=>{
    const src=sheetOf(empId,year),t=src&&by(src.months[mm].tasks,tid);if(!t||!t.movedTo)throw new Error('Việc này chưa được chuyển.');
    const mv=t.movedTo,dst=sheetOf(empId,mv.year),copy=dst&&by(dst.months[mv.month].tasks,mv.id);
    if(copy&&copy.submitted)throw new Error(`Việc đã hoàn thành ở T${mv.month}. Hãy xoá ngày hoàn thành ở đó trước khi hoàn tác.`);
    if(dst)dst.months[mv.month].tasks=dst.months[mv.month].tasks.filter(x=>x.id!==mv.id);
    delete t.movedTo;src.updatedAt=todayStr();
  });
}
