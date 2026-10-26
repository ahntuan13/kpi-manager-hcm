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
/* Quy chế KPI (theo file Excel): trễ 1 ngày −3 điểm, sớm 1 ngày làm việc +3 điểm thưởng (tối đa 30), KPI tháng khống chế 0–120.
   Trọng số do nhân viên tự chấm theo thang 1–10. */
const KPI_CAP=120, LATE_PENALTY=3, BONUS_PER_DAY=3, BONUS_CAP=30, W_MIN=1, W_MAX=10;
/* Quản lý duyệt: 'ok' = Duyệt → điểm thành phần được tính vào KPI · 'recheck' = Re-check → không tính điểm, báo đỏ · '' = chờ duyệt → chưa tính.
   Dữ liệu cũ / file Excel ghi "Đạt", "Reject" vẫn được hiểu đúng. */
const apOf=t=>{const a=String((t&&t.approval)||'').normalize('NFC').trim();return /^(duyệt|đạt|approved?)/i.test(a)?'ok':/^(re-?check|reject)/i.test(a)?'recheck':''};
const AP={'':['mute','Chờ duyệt'],ok:['ok','Duyệt'],recheck:['bad','Re-check']};
const AP_VAL={'':'',ok:'Duyệt',recheck:'Re-check'};
/* Xếp loại: [ngưỡng, màu badge, nhãn] */
/* Xếp loại giống file Excel KPI cá nhân: A+ ≥100 · A ≥86 · B ≥75 · C ≥61 · D >41 · E */
const GRADES=[[100,'ok','A+'],[86,'info','A'],[75,'mute','B'],[61,'warn','C'],[41.0000001,'bad','D'],[-1e9,'bad','E']];
const EMP_COLORS=['#2f7de1','#0e9f8b','#ec6a5e','#6c5ce7','#e29a2d','#d6447a','#22b8c9','#64748b'];

function defaultDB(){return{
  version:1,
  seq:{NV:0},
  company:{name:'TVE-HCM · KPI nhân viên',note:'',depts:[...DEFAULT_DEPTS],holidays:[...DEFAULT_HOLIDAYS]},
  users:[{id:'u_admin',username:'admin',name:'Quản trị',role:'admin',pass:pw('admin123'),active:true}],
  employees:[],sheets:[],groups:[],ppe:[]
}}
function emptyCloudDB(){const d=defaultDB();d.users=[];return d}
let db=null, session=null;
const emptyMonths=()=>Object.fromEntries(MM.map(m=>[m,{tasks:[],comment:''}]));
function migrate(){const d=defaultDB();for(const k in d){if(db[k]===undefined)db[k]=d[k]}for(const k in d.seq){if(db.seq[k]===undefined)db.seq[k]=0}
  if(!db.company)db.company=d.company;
  if(!Array.isArray(db.company.depts))db.company.depts=[...DEFAULT_DEPTS];
  if(!Array.isArray(db.company.holidays))db.company.holidays=[...DEFAULT_HOLIDAYS];
  db.employees.forEach(e=>{if(e.active===undefined)e.active=true});
  if(!Array.isArray(db.groups))db.groups=[];
  if(!Array.isArray(db.ppe))db.ppe=[];
  if(!Array.isArray(db.notifs))db.notifs=[];
  db.sheets.forEach(s=>{if(!s.months)s.months={};MM.forEach(m=>{const x=s.months[m]||(s.months[m]={tasks:[],comment:''});if(!Array.isArray(x.tasks))x.tasks=[];if(x.comment==null)x.comment=''})});
  _hol=null;hydrateGroups()}
function needsMigrate(){return db.sheets.some(s=>!s.months||MM.some(m=>!s.months[m]||!Array.isArray(s.months[m].tasks)))}
function load(){if(CLOUD){db=emptyCloudDB();migrate();return}try{const raw=localStorage.getItem(LS_KEY);db=raw?JSON.parse(raw):defaultDB()}catch(e){db=defaultDB()}migrate()}
function save(){_hol=null;if(CLOUD){cloudPush();return}try{localStorage.setItem(LS_KEY,JSON.stringify(db))}catch(e){toast('Không lưu được dữ liệu (bộ nhớ trình duyệt đầy?). Hãy xuất sao lưu ngay.','error')}}
/* Thực hiện thay đổi an toàn: lỗi thì trả lại dữ liệu cũ */
function transact(fn){const snap=JSON.stringify(db);try{fn();save();return true}catch(e){db=JSON.parse(snap);toast(e.message,'error');return false}}
const nextCode=(k,len=3)=>{db.seq[k]=(db.seq[k]||0)+1;return `${k}-${String(db.seq[k]).padStart(len,'0')}`};

/* =====================================================================
   CÔNG THỨC KPI – giữ đúng theo file Excel KPI cá nhân
   - Số ngày trễ: nộp trễ tính ngày lịch; nộp sớm tính ngày làm việc (Thứ 2 – Thứ 7; bỏ Chủ nhật, lễ) và ra số âm.
   - Số ngày trễ (F): hoàn thành trễ tính ngày lịch; hoàn thành sớm tính ngày làm việc và ra số âm.
   - Điểm cơ bản (G) = 100 − 3 × ngày trễ (không âm).
   - Điểm thưởng (H, tự động) = IF(F<0, MIN(30, ABS(F)*3), 0). Không còn điểm thưởng nhập tay.
   - Điểm thành phần (I) = (G × Trọng số + H) / 100. Đây là điểm KPI của việc; chỉ được tính khi quản lý chọn Duyệt.
   - KPI tháng = tổng điểm thành phần của các việc đã Duyệt, khống chế 0–120.
   ===================================================================== */
const dayNum=iso=>{const [y,m,d]=iso.split('-').map(Number);return Math.round(Date.UTC(y,m-1,d)/864e5)};
const isoOf=n=>new Date(n*864e5).toISOString().slice(0,10);
let _hol=null;
const holSet=()=>_hol||(_hol=new Set(db.company.holidays||[]));
/* Ngày nghỉ (Chủ nhật, ngày lễ; Thứ 7 là ngày làm việc) – dùng để giải thích vì sao hoàn thành trước một ngày nghỉ không có điểm thưởng */
const DOW=['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
const offDay=iso=>{if(!iso)return'';const wd=new Date(dayNum(iso)*864e5).getUTCDay();return wd===0?DOW[wd]:holSet().has(iso)?'ngày lễ':''};
function networkdays(a,b){let n=0;const H=holSet();for(let x=a;x<=b;x++){const wd=new Date(x*864e5).getUTCDay();if(wd!==0&&!H.has(isoOf(x)))n++}return n}
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
/* Việc chưa hoàn thành (chưa có Ngày hoàn thành, chưa chuyển) là chuyển sang tháng sau được, bằng nút trong hộp Sửa việc. */
const canCarry=(t,sc)=>sc.comp==null&&sc.state!=='moved'&&!t.submitted;
/* Tháng đã kết thúc chưa (việc của tháng đó còn dang dở thì nên chuyển sang tháng sau) */
const monthEnded=(y,mm)=>`${y}-${mm}`<todayStr().slice(0,7);
/* Việc do quản lý giao (By Manager) và tag của việc */
const TAGS={pri:'★ Ưu tiên',imp:'◆ Quan trọng'};
const byMgr=t=>!!t&&t.by==='manager';
const tagsOf=t=>((t&&t.tags)||[]).filter(k=>TAGS[k]);
/* Comment by Manager: quản lý ghi khi chọn Re-check; done = nhân viên đã cập nhật lại (hiện mờ, gạch đi) */
const mcOf=t=>t&&t.mgrComment&&String(t.mgrComment.text||'').trim()?t.mgrComment:null;
/* =====================================================================
   QUY CHẾ 80 / 20 (áp dụng từ tháng kpi2().since; các tháng trước giữ cách tính cũ 100% công việc)
   KPI tháng = Khung 1 (20) + Khung 2 · KRI (~80) + Khung 3 · Điểm thưởng (20), khống chế 0–120 (giống file Excel "Individual KPIs").
   - Khung 1 · Quản lý giao & Tuân thủ (20):
       + Việc quản lý giao: 10 điểm chia đều cho số việc By Manager trong tháng, cộng khi việc được Duyệt.
       + Tuân thủ: 10 điểm, trừ 1 mỗi lần đi trễ (giờ vào sau 08:05) và 1 mỗi lỗi NC (TVE Safety / Audit); thấp nhất 0.
   - Khung 2 · KRI: danh mục chỉ tiêu riêng của từng nhân viên (sheet.kpi, nhập từ file Excel). Mỗi dòng: Điểm = % đạt × trọng số.
       + Dòng "Kết quả tháng": % đạt = Quy ước tính (công thức kiểu Excel, 03-kri.js) áp lên Kết quả tháng (m.kri[id].r); để trống như Excel.
       + Dòng "Công việc hằng ngày": % đạt = điểm thành phần các việc đã Duyệt / tổng trọng số các việc gắn vào dòng (tối đa taskCap %).
       + Chưa có danh mục: Khung 2 = tổng điểm thành phần việc By User đã Duyệt (cách cũ).
   - Khung 3 · Điểm thưởng (20): Hỗ trợ việc phát sinh (1 lần = 50%, từ 2 lần = 100% của gaMax) + Sáng kiến MOC được chấp nhận (mocMax).
   - Tháng có điểm chốt (m.fixed, nhập từ file Excel) dùng đúng điểm đó.
   Tham số sửa được ở Settings → Nhóm & ngày lễ (db.company.kpi2).
   ===================================================================== */
const KPI2_DEF={since:'2026-10',userStd:80,mgrMax:10,perTask:2,compMax:10,latePen:1,ncPen:1,lateAfter:'08:05',gaMax:10,mocMax:10,taskCap:110};
const kpi2=()=>({...KPI2_DEF,...((db&&db.company&&db.company.kpi2)||{})});
const isV2=ym=>!!ym&&ym>=kpi2().since;
function monthStats(m,ym,kc){
  const v2=isV2(ym),P=kpi2(),rows=((m&&m.tasks)||[]).map(t=>({t,sc:scoreTask(t)}));
  /* scored = việc đã hoàn thành (có deadline + ngày hoàn thành) · counted = đã Duyệt · pending = chờ duyệt · recheck = Re-check
     kpi = điểm chính thức (chỉ việc đã Duyệt) · self = điểm tự chấm (đã Duyệt + chờ duyệt, không gồm Re-check)
     Quy chế 80/20: raw / weight chỉ gồm việc By User; việc By Manager đếm ở bm*; lateList / ncList = tuân thủ */
  const st={rows,v2,n:0,weight:0,raw:0,rawSelf:0,bonus:0,scored:0,counted:0,pending:0,recheck:0,ontime:0,early:0,late:0,open:0,nodate:0,overdue:0,moved:0,kpi:null,self:null,
    bmN:0,bmOk:0,bmPend:0,bmRe:0,bmPer:0,lateList:[],ncList:[],p80:null,p20:null,p3:null,pMgr:null,pComp:null,pGa:0,pMoc:0,gaList:[],mocList:[],kri:null,fixed:null};
  for(const {t,sc} of rows){
    if(sc.state==='moved'){st.moved++;continue}
    st.n++;st[sc.state]++;
    const bm=v2&&byMgr(t);if(bm)st.bmN++;else st.weight+=sc.w;
    if(sc.comp!=null){st.scored++;
      if(sc.ap==='ok'){st.counted++;if(bm)st.bmOk++;else{st.raw+=sc.comp;st.bonus+=sc.bonus}}
      else if(sc.ap==='recheck'){st.recheck++;if(bm)st.bmRe++}
      else{st.pending++;if(bm)st.bmPend++}
      if(sc.ap!=='recheck'&&!bm)st.rawSelf+=sc.comp}
  }
  st.weight=r2(st.weight);
  const cap=v=>Math.min(KPI_CAP,Math.max(0,v));
  if(m&&m.fixed&&m.fixed.total!=null&&Number.isFinite(+m.fixed.total)){   /* điểm chốt từ file Excel: dùng đúng điểm đó */
    st.fixed=m.fixed;st.v2=false;st.kpi=cap(+m.fixed.total);st.self=st.kpi;return st;
  }
  if(v2){
    st.lateList=[...((m&&m.late)||[])].sort((a,b)=>a.d<b.d?-1:1);st.ncList=[...((m&&m.nc)||[])].sort((a,b)=>a.d<b.d?-1:1);
    /* Khung 1 – việc quản lý giao: ${mgrMax} điểm chia đều cho số việc giao trong tháng (10 việc → 1 điểm/việc, 5 việc → 2, 8 việc → 1,25) */
    st.bmPer=st.bmN?P.mgrMax/st.bmN:0;
    st.pMgr=st.bmN?r2(Math.min(P.mgrMax,st.bmPer*st.bmOk)):P.mgrMax;   /* tháng không có việc quản lý giao: giữ đủ điểm (giống ô Kết quả để trống trong Excel) */
    st.pComp=Math.max(0,P.compMax-P.latePen*st.lateList.length-P.ncPen*st.ncList.length);
    st.p20=st.pMgr+st.pComp;
    const mgrSelf=st.bmN?Math.min(P.mgrMax,st.bmPer*(st.bmOk+st.bmPend)):P.mgrMax;
    /* Khung 2 – KRI theo danh mục chỉ tiêu */
    const lines=kc?((kc.rows)||[]).filter(r=>r.w!=null&&+r.w>0):[];let k2Self=st.rawSelf;
    if(lines.length){
      const ids=new Set(lines.map(r=>r.id)),tl=lines.filter(r=>r.src==='tasks'),only=tl.length===1?tl[0].id:null,res=(m&&m.kri)||{},capT=(+P.taskCap||110)/100;
      let a=0,b=0;
      st.kri=lines.map(r=>{
        const w=+r.w,o={row:r,w,src:r.src==='tasks'?'tasks':'res',pct:null,pSelf:null,res:'',n:0,done:0,ok:0,den:0};
        if(o.src==='tasks'){   /* việc By User gắn vào dòng (việc chưa gắn chỉ tiêu nào thuộc về dòng "việc hằng ngày" duy nhất) */
          const mine=rows.filter(x=>x.sc.state!=='moved'&&!byMgr(x.t)&&(x.t.kpi===r.id||(only===r.id&&!ids.has(x.t.kpi))));
          let num=0,numS=0;mine.forEach(x=>{o.n++;o.den+=x.sc.w;if(x.sc.comp!=null){o.done++;if(x.sc.ap==='ok'){o.ok++;num+=x.sc.comp}if(x.sc.ap!=='recheck')numS+=x.sc.comp}});
          o.den=r2(o.den);if(o.den>0){o.pct=Math.min(capT,num/o.den);o.pSelf=Math.min(capT,numS/o.den)}
        }else{const v=res[r.id];o.res=v&&v.r!=null?v.r:'';o.note=v&&v.n||'';o.pct=kxPct(r.f,o.res);o.pSelf=o.pct}
        o.off=o.src==='res'&&!r.f;   /* chưa có quy ước tính: không tính điểm (giống Excel không có công thức) */
        o.score=r2((o.pct||0)*w);o.sSelf=(o.pSelf||0)*w;a+=o.score;b+=o.sSelf;return o});
      st.p80=r2(a);k2Self=b;
    }else st.p80=r2(st.raw);
    /* Khung 3 – điểm thưởng */
    st.gaList=[...((m&&m.ga)||[])].sort((x,y)=>x.d<y.d?-1:1);st.mocList=[...((m&&m.moc)||[])].sort((x,y)=>x.d<y.d?-1:1);
    st.pGa=st.gaList.length>=2?P.gaMax:st.gaList.length===1?P.gaMax/2:0;st.pMoc=st.mocList.length?P.mocMax:0;st.p3=st.pGa+st.pMoc;
    const live=lines.length&&(st.n||st.lateList.length||st.ncList.length||st.gaList.length||st.mocList.length||Object.keys((m&&m.kri)||{}).length||(ym&&ym<=todayStr().slice(0,7)));   /* tháng chưa tới, chưa có gì: chưa có điểm */
    if(live||st.counted)st.kpi=cap(st.p80+st.p20+st.p3);
    if(live||st.counted+st.pending)st.self=cap(k2Self+mgrSelf+st.pComp+st.p3);
  }else{
    if(st.counted)st.kpi=cap(st.raw);
    if(st.counted+st.pending)st.self=cap(st.rawSelf);
  }
  return st;
}
/* Thứ tự hiển thị việc: chưa hoàn thành lên trên (deadline gần trước), đã hoàn thành ở dưới, việc đã chuyển tháng cuối cùng */
function sortRows(rows){
  const g=r=>r.sc.state==='moved'?2:r.t.submitted?1:0,k=r=>r.t.deadline||'9999';
  return rows.map((r,i)=>({r,i})).sort((a,b)=>g(a.r)-g(b.r)||(k(a.r)<k(b.r)?-1:k(a.r)>k(b.r)?1:a.i-b.i)).map(x=>x.r);
}
const avgOf=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
/* Trung bình chỉ tính các tháng đã có điểm (tháng chưa chấm không bị coi là 0).
   Tháng đang diễn ra (chưa kết thúc) chỉ là điểm TẠM TÍNH: giữ ở kpiProv, không tính vào quý / năm / xếp hạng. */
function yearStats(sheet){
  const kc=sheet?(sheet.kpi||(sheet.empId&&typeof kpiOf==='function'?kpiOf(sheet.empId,sheet.year):null)):null;   /* danh mục chỉ tiêu KRI của năm (năm chưa có: dùng tạm năm trước) */
  const months=MM.map(mm=>monthStats(sheet&&sheet.months&&sheet.months[mm],sheet&&sheet.year?`${sheet.year}-${mm}`:null,kc));
  if(sheet){const cy=+curYear(),ci=new Date().getMonth();months.forEach((m,i)=>{if(m.kpi!=null&&(+sheet.year>cy||(+sheet.year===cy&&i>=ci))){m.prov=true;m.kpiProv=m.kpi;m.kpi=null}})}
  const ev=months.map((m,i)=>m.kpi==null?null:i).filter(i=>i!=null),vals=ev.map(i=>months[i].kpi);
  const quarters=[0,1,2,3].map(q=>{const v=[0,1,2].map(k=>months[q*3+k].kpi).filter(x=>x!=null);return{avg:avgOf(v),n:v.length}});
  let sum=0,cnt=0;const ytd=months.map(m=>{if(m.kpi==null)return null;sum+=m.kpi;cnt++;return sum/cnt});
  const tot=k=>months.reduce((s,m)=>s+m[k],0);
  const maxI=ev.length?ev.reduce((a,b)=>months[b].kpi>months[a].kpi?b:a):null,minI=ev.length?ev.reduce((a,b)=>months[b].kpi<months[a].kpi?b:a):null;
  const scored=tot('scored'),onTime=tot('ontime')+tot('early');
  return{months,ev,avg:avgOf(vals),maxI,minI,quarters,ytd,last:ev.length?ev[ev.length-1]:null,
    scored,onTime,onPct:scored?onTime/scored*100:null,late:tot('late'),open:tot('open')+tot('nodate'),overdue:tot('overdue'),moved:tot('moved'),pending:tot('pending'),recheck:tot('recheck'),counted:tot('counted'),tasks:tot('n')};
}
const gradeOf=v=>v==null?null:GRADES.find(g=>v>=g[0]);
const mVal=m=>m.kpi??m.kpiProv??null;   /* điểm tháng, kể cả tạm tính */

/* =====================================================================
   CHỈ TIÊU KPI (Khung 2) – danh mục theo mục I của file Excel "Individual KPIs – <tên>"
   - sheet.kpi = {sec, rows:[{id,no,text,w,rule}]} lưu trong bảng KPI (nhân viên × năm).
     Mỗi dòng giống một dòng Excel: no = số nhóm (dòng có no bắt đầu một nhóm), text = cột C,
     w = trọng số chỉ tiêu (cột G × 100; để trống = dòng tiêu đề), rule = Quy ước đánh giá (cột H).
   - task.kpi = id của dòng chỉ tiêu. Chỉ để xếp việc theo nhóm, KHÔNG đổi cách tính điểm.
   - id = 'k' + hash(nội dung đã chuẩn hoá): nhập lại cùng file Excel ra cùng id nên việc tự gắn lại.
   ===================================================================== */
const kpiTrim=s=>String(s??'').replace(/^[\s'"‘’“”\-–—•·]+|[\s'"‘’“”:]+$/g,'');
const kpiKey=s=>norm(kpiTrim(s));
/* nhãn gọn: dòng đầu, bỏ dấu nháy / gạch đầu dòng / số thứ tự riêng của ô Excel, tối đa 90 ký tự */
function kpiLabel(s){const l=String(s??'').split('\n').map(kpiTrim).find(Boolean)||'',t=kpiTrim(l.replace(/^\d+\s*[.)]\s*/,'')).replace(/\s+/g,' ');return t.length>90?t.slice(0,89)+'…':t}
/* id cố định theo nội dung; trùng nội dung trong cùng danh mục thì thêm -2, -3 */
const kpiId=(text,taken)=>{const b='k'+hash(kpiKey(text));let id=b,n=1;while(taken&&taken.has(id))id=`${b}-${++n}`;return id};
/* danh mục của nhân viên trong năm; năm chưa có thì dùng tạm danh mục năm trước (chỉ đọc, không tự chép) */
const kpiOf=(empId,y)=>{const a=sheetOf(empId,y),b=sheetOf(empId,+y-1);return(a&&a.kpi)||(b&&b.kpi)||null};
const kpiRows=k=>((k&&k.rows)||[]).filter(r=>r.w!=null);   /* các dòng gắn việc được */
const kpiHas=(k,id)=>!!id&&kpiRows(k).some(r=>r.id===id);
/* đếm việc (chưa chuyển tháng) trong năm có chỉ tiêu thoả hit(id) → {n, by:'T10: 5, T11: 2'}; báo trước khi xoá / nhập lại danh mục */
function kpiUse(empId,y,hit){const sh=sheetOf(empId,y),m={};let n=0;
  if(sh)MM.forEach(mm=>((sh.months[mm]&&sh.months[mm].tasks)||[]).forEach(t=>{if(t.kpi&&!t.movedTo&&hit(t.kpi)){n++;m[mm]=(m[mm]||0)+1}}));
  return{n,by:Object.entries(m).map(([k,c])=>`T${k}: ${c}`).join(', ')}}
/* Nhập lại danh mục: file là chuẩn. Dòng trùng nội dung với dòng đang có giữ id cũ để việc vẫn gắn đúng;
   dòng đang có mà file không còn thì bị bỏ (dropped) – các việc gắn với nó về "Chưa phân loại". */
function kpiMerge(old,rows){const o=(old&&old.rows)||[],q=new Map(),taken=new Set();
  o.forEach(r=>{const k=kpiKey(r.text);(q.get(k)||q.set(k,[]).get(k)).push(r.id)});   /* nhiều dòng cùng nội dung: giữ id cũ theo thứ tự */
  const hit=rows.map(r=>{const a=q.get(kpiKey(r.text)),id=a&&a.shift();if(id)taken.add(id);return id});   /* lượt 1: dòng trùng nội dung nhận id cũ */
  const out=rows.map((r,i)=>{let id=hit[i];if(!id){id=taken.has(r.id)?kpiId(r.text,taken):r.id;taken.add(id)}return{...r,id}}),keep=new Set(out.map(r=>r.id));   /* lượt 2: dòng còn lại dùng id theo nội dung của file */
  return{rows:out,dropped:o.filter(r=>r.w!=null&&!keep.has(r.id))}}
/* Khung 2 theo danh mục: các dòng hiển thị theo đúng thứ tự file Excel.
   lv: 'sec' (mục I) · 'cat' (nhóm có số) · 'hdr' (tiêu đề trong nhóm) · 'line' (chỉ tiêu có trọng số) · 'none' (Chưa phân loại) · 'task' (việc).
   Dòng sec / cat / line / none có wUsed (tổng trọng số việc, không tính việc đã chuyển), wStd (trọng số chỉ tiêu), pts (điểm thành phần việc đã Duyệt).
   Dòng sec cộng cả việc Chưa phân loại nên luôn bằng tổng Khung 2. Việc được đánh số lại (i) theo thứ tự trên màn hình. */
function kpiGroups(kpi,rows){
  const ids=new Set(kpiRows(kpi).map(r=>r.id)),out=[],z=()=>({wUsed:0,wStd:0,pts:0});
  const sec={lv:'sec',text:(kpi&&kpi.sec)||'KPI Công ty và hoạt động của phòng (KRI)',...z()};out.push(sec);
  /* cấp (d) để tô màu theo cấp: nhóm có số = 1 · tiêu đề và chỉ tiêu ngay trong nhóm = 2 · chỉ tiêu nằm dưới một tiêu đề = 3 */
  let cat=null,i=0,sub=false;
  const put=(id,heads)=>sortRows(rows.filter(r=>(ids.has(r.t.kpi)?r.t.kpi:'')===id)).forEach(r=>{
    if(r.sc.state!=='moved')heads.forEach(h=>{h.wUsed+=r.sc.w;if(r.sc.counted)h.pts+=r.sc.comp});out.push({lv:'task',r:{...r,i:i++}})});
  for(const k of (kpi&&kpi.rows)||[]){
    if(k.no){sub=false;cat={lv:'cat',id:k.id,no:k.no,text:k.text,row:k.w!=null?k:null,d:1,...z()};out.push(cat);if(k.w!=null){cat.wStd=k.w;sec.wStd+=k.w;put(k.id,[sec,cat])}continue}
    if(k.w==null){out.push({lv:'hdr',id:k.id,text:k.text,d:2});sub=true;continue}
    const ln={lv:'line',row:k,d:sub?3:2,...z(),wStd:k.w};out.push(ln);sec.wStd+=k.w;if(cat)cat.wStd+=k.w;put(k.id,[sec,...(cat?[cat]:[]),ln]);
  }
  if(rows.some(r=>!ids.has(r.t.kpi))){const nb={lv:'none',...z()};out.push(nb);put('',[sec,nb])}
  out.forEach(h=>{if('pts' in h){h.wUsed=r2(h.wUsed);h.wStd=r2(h.wStd);h.pts=r2(h.pts)}});
  return out;
}

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

/* =====================================================================
   VIỆC LÀM CHUNG
   - Một nhóm (db.groups / Firestore groups/{id}) giữ phần dùng chung: nội dung, deadline, NGÀY HOÀN THÀNH
     (một người ghi là áp dụng cho cả nhóm), danh sách người làm (members) và người được mời (invited).
   - Mỗi thành viên có một bản việc riêng trong bảng KPI của mình (task.gid = id nhóm): tự chấm trọng số,
     ghi chú, quản lý duyệt riêng từng người.
   - Quản lý thêm người là vào nhóm ngay; nhân viên thêm người thì người đó nhận lời mời và tự bấm Nhận.
   ===================================================================== */
let DIR=[];   /* danh bạ (id, tên, mã NV, nhóm) cho tài khoản Nhân viên ở chế độ Firebase, để chọn người làm chung */
const dirEmps=()=>(CLOUD&&isStaff()?DIR:db.employees).filter(e=>e.active!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name),'vi'));
const nameOf=id=>{const e=empOf(id)||DIR.find(x=>x.id===id);return e?e.name:''};
const grpOf=id=>id?(db.groups||[]).find(g=>g.id===id)||null:null;
const grpOfT=t=>t&&t.gid?grpOf(t.gid):null;
const gName=(g,id)=>(g.names&&g.names[id])||nameOf(id)||'?';
function newGroup(o){
  const g={id:uid('g'),title:o.title,deadline:o.deadline||null,submitted:o.submitted||null,doneBy:null,members:[...o.members],invited:[],declined:[],names:{},invitedBy:{},
    year:+o.y,mm:o.mm,by:o.by||'',byName:session?.name||'',createdAt:todayStr()};
  g.members.forEach(x=>g.names[x]=nameOf(x));(db.groups||(db.groups=[])).push(g);return g;
}
/* Bản việc của một thành viên mới trong bảng KPI của họ (tháng gốc của nhóm) */
function grpCopy(g,eid,src){
  const sh=sheetOf(eid,g.year,true),t={id:uid('t'),gid:g.id,title:g.title,weight:src&&wOk(+src.weight)?+src.weight:1,deadline:g.deadline||null,submitted:g.submitted||null,approval:'',note:''};
  if(src&&byMgr(src)){t.by='manager';t.byName=src.byName||'';t.byAt=src.byAt||todayStr()}else if(g.by==='manager'){t.by='manager';t.byName=g.byName||'';t.byAt=g.createdAt||todayStr()}
  if(src&&tagsOf(src).length)t.tags=tagsOf(src);
  if(src&&src.kpi&&kpiHas(kpiOf(eid,g.year),src.kpi))t.kpi=src.kpi;   /* cùng nội dung chỉ tiêu → cùng id trong danh mục của người kia */
  sh.months[g.mm].tasks.push(t);sh.updatedAt=todayStr();return t;
}
/* Đưa phần dùng chung của nhóm (nội dung, deadline, ngày hoàn thành) vào bản việc của từng người */
function hydrateGroups(){
  if(!db||!Array.isArray(db.groups)||!db.groups.length)return;
  const G=new Map(db.groups.map(g=>[g.id,g]));
  db.sheets.forEach(s=>MM.forEach(mm=>((s.months[mm]&&s.months[mm].tasks)||[]).forEach(t=>{
    const g=t.gid&&!t.movedTo&&G.get(t.gid);if(!g)return;
    if(g.title)t.title=g.title;t.submitted=g.submitted||null;if(!t.carriedFrom)t.deadline=g.deadline||null;
  })));
}
/* Nhóm bị khoá (nhân viên không đổi ngày hoàn thành / nội dung) khi quản lý đã Duyệt bản việc của bất kỳ ai trong nhóm. Chỉ quản lý tính được (thấy mọi bảng). */
function relockGroups(){
  if(!can('manage')||!db.groups||!db.groups.length)return;
  const ok=new Set();db.sheets.forEach(s=>MM.forEach(m=>s.months[m].tasks.forEach(t=>{if(t.gid&&!t.movedTo&&apOf(t)==='ok')ok.add(t.gid)})));
  db.groups.forEach(g=>{const v=ok.has(g.id);if(!!g.locked!==v){if(v)g.locked=true;else delete g.locked}});
}

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
        note:t.note||'',carriedFrom:{year:+year,month:mm,id:t.id,deadline:t.deadline||null}};
      if(t.gid)c.gid=t.gid;   /* việc làm chung: chỉ chuyển phần của người này, vẫn thuộc nhóm */
      if(byMgr(t)){c.by='manager';c.byName=t.byName||'';c.byAt=t.byAt||''}
      if(tagsOf(t).length)c.tags=tagsOf(t);
      if(t.kpi)c.kpi=t.kpi;   /* giữ chỉ tiêu KPI (Khung 2) */
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
