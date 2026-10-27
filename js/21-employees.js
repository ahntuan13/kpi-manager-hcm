/* 21-employees.js – Nhân viên: danh sách, theo nhóm, trang chi tiết (biểu đồ tháng / quý / năm, bảng việc từng tháng, quản lý duyệt, giao việc By Manager, Comment by Manager, chuyển việc sang tháng sau, phiếu đánh giá) */
'use strict';
(self.__mods=self.__mods||[]).push('21-employees');

/* Nút gộp / dải tháng đổi bộ lọc của trang đang mở */
ACT.setf=el=>{const k=el.dataset.k,v=el.dataset.v;if(F()[k]===v)return;F()[k]=v;refreshTbl();document.querySelector(`[data-act="setf"][data-k="${k}"][data-v="${v}"]`)?.focus({preventScroll:true})};

/* ---------- danh sách nhân viên ---------- */
PAGES['emp/list']={t:'Tất cả nhân viên',
  head(){return `<div class="bar">${fSearch('Tìm tên, mã NV, chức danh…')}${scopeBar(fSel('st','Trạng thái',[['','Đang theo dõi'],['all','Tất cả'],['off','Ngừng theo dõi']]))}<div class="sp"></div><button class="btn" data-act="export" data-name="nhan-vien-kpi">⬇ Excel</button>${can('manage')?'<button class="btn" data-act="kt-assign">📌 Giao việc</button>':''}${can('manage')?`<button class="btn" data-act="kc-imp" data-y="${esc(F().year||curYear())}">${KPI_ICO}Nhập KPI Individual (Excel)</button>`:''}${addBtns()}</div>`},
  tbl(){
    const f=F(),y=f.year||curYear(),q=norm(f.q),st=f.st||'';
    const rows=sortedEmps().filter(e=>(!f.dept||e.dept===f.dept)&&(st==='all'||(st==='off'?e.active===false:e.active!==false))&&(!q||norm(`${e.code} ${e.name} ${e.title||''} ${e.email||''} ${e.dept||''}`).includes(q))).map(e=>({e,ys:empStats(e,y)}));
    const cols=[
      {h:'Mã NV',f:r=>`<span style="white-space:nowrap">${esc(r.e.code)}</span>`,x:r=>r.e.code},
      {h:'Nhân viên',f:r=>`<span class="mem">${empAv(r.e)}<span>${empLink(r.e)}${r.e.title?`<small>${esc(r.e.title)}</small>`:''}</span></span>`,x:r=>r.e.name},
      {h:'Chức danh',xonly:1,x:r=>r.e.title||''},{h:'Email',xonly:1,x:r=>r.e.email||''},
      {h:'Nhóm',f:r=>r.e.dept?`<span class="pf">${esc(r.e.dept)}</span>`:'—',x:r=>r.e.dept||''},
      {h:`KPI năm ${y}`,f:r=>kBar(r.ys.avg),x:r=>r.ys.avg==null?'':r2(r.ys.avg)},{h:'Xếp loại',f:r=>gradeBd(r.ys.avg),x:r=>gradeOf(r.ys.avg)?.[2]||''},
      {h:'Tháng gần nhất',c:'num',f:r=>r.ys.last==null?'–':`${kCell(r.ys.months[r.ys.last].kpi)}<small>T${MM[r.ys.last]}</small>`,x:r=>r.ys.last==null?'':r2(r.ys.months[r.ys.last].kpi)},
      pctCol('Đúng hạn',r=>r.ys.onPct),nc('Chưa hoàn thành',r=>r.ys.open),{h:'Chờ duyệt',c:'num',f:r=>r.ys.pending?`<span class="tag-warn">${r.ys.pending}</span>`:'0',x:r=>r.ys.pending},{h:'Quá hạn',c:'num',f:r=>badNum(r.ys.overdue),x:r=>r.ys.overdue},
      {h:'Trạng thái',f:r=>r.e.active===false?badge('mute','Ngừng theo dõi'):badge('ok','Đang theo dõi'),x:r=>r.e.active===false?'Ngừng theo dõi':'Đang theo dõi'},
      actCol(r=>(can('manage')?`<button class="btn sm" data-act="kt-assign" data-e="${r.e.id}" data-y="${y}" aria-label="Giao việc cho ${esc(r.e.name)}">Giao việc</button> `:'')+(can('admin')?`<button class="btn sm" data-act="emp-edit" data-id="${r.e.id}" aria-label="Sửa thông tin ${esc(r.e.name)}">Sửa</button>`:''))
    ];
    if(!rows.length)return table(cols,rows,{empty:db.employees.length?'Không có nhân viên nào khớp bộ lọc.':'Chưa có nhân viên nào. Bấm “Nhập Excel KPI” để đưa file KPI cá nhân vào, hoặc “Thêm nhân viên”.'});
    /* mỗi nhóm một khung: Nhóm AD gồm ai, Nhóm HR gồm ai … */
    const groups=[...depts(),''].map(d=>({d,rs:rows.filter(r=>(r.e.dept||'')===d)})).filter(g=>g.rs.length);
    const html=groups.map(g=>`<section class="card egrp"><div class="hdr" style="align-items:baseline;margin-bottom:8px"><h4 style="margin:0">${g.d?'Nhóm '+esc(g.d):'Chưa gán nhóm'} <small class="muted">· ${g.rs.length} nhân viên</small></h4></div><p class="egm">${g.rs.map(r=>esc(r.e.name)).join(', ')}</p>${table(cols,g.rs,{meta:false})}</section>`).join('');
    ui.cur={cols,rows};   /* Xuất Excel: cả danh sách */
    return html;
  }};
/* ---------- theo nhóm ---------- */
function deptRows(f){
  const rows=scopeStats({year:f.year}),names=[...depts(),''];
  return names.map(d=>{const rs=rows.filter(r=>(r.e.dept||'')===d),ev=rs.filter(r=>r.ys.avg!=null),cnt=gCount(ev.map(r=>r.ys.avg));
    const scored=sumK(rs,'scored');return{d:d||'Chưa gán nhóm',n:rs.length,avg:avgOf(ev.map(r=>r.ys.avg)),cnt,onPct:scored?sumK(rs,'onTime')/scored*100:null,late:sumK(rs,'late'),open:sumK(rs,'open'),overdue:sumK(rs,'overdue'),q:[0,1,2,3].map(k=>avgOf(rs.map(r=>r.ys.quarters[k].avg).filter(v=>v!=null)))}}).filter(x=>x.n);
}
const deptCols=()=>[{h:'Nhóm',f:r=>`<b>${esc(r.d)}</b>`,x:r=>r.d},nc('Nhân viên',r=>r.n),{h:'KPI trung bình năm',f:r=>kBar(r.avg),x:r=>r.avg==null?'':r2(r.avg)},{h:'Xếp loại',f:r=>gradeBd(r.avg),x:r=>gradeOf(r.avg)?.[2]||''},
  ...QN.map((n,k)=>kc(n,r=>r.q[k])),...GRADES.map(g=>g[1]==='bad'?{h:g[2],c:'num',f:r=>badNum(r.cnt[g[2]]),x:r=>r.cnt[g[2]]}:nc(g[2],r=>r.cnt[g[2]])),pctCol('Đúng hạn',r=>r.onPct),nc('Chưa hoàn thành',r=>r.open),{h:'Quá hạn',c:'num',f:r=>badNum(r.overdue),x:r=>r.overdue}];
function deptChart(rows,y){if(!rows.length)return;const d=rows.map(r=>r.avg);
  kChart('c1',{type:'bar',data:{labels:rows.map(r=>r.d),datasets:[{label:'KPI trung bình năm',data:d,backgroundColor:barColors(d),showVal:true,maxBarThickness:40}]},options:kpiOpt({plugins:{legend:{display:false},tooltip:kTip(i=>[`${rows[i].n} nhân viên`])}})},`KPI trung bình năm ${y} theo nhóm: `+rows.map(r=>`${r.d} ${fmtK(r.avg)}`).join(', '))}
PAGES['emp/dept']={t:'Nhân viên theo nhóm',
  head(){F().year??=curYear();return `<div class="bar"><label class="fl">Năm ${fSel('year','Năm',yearOpts())}</label><div class="sp"></div><button class="btn" data-act="export" data-name="kpi-theo-nhom">⬇ Excel</button></div>`},
  tbl(){const f=F(),rows=deptRows(f);return (rows.length?`<div class="card"><h4>KPI trung bình năm ${f.year||curYear()} theo nhóm</h4><div class="ch"><canvas id="c1"></canvas></div></div>`:'')+table(deptCols(),rows,{empty:'Chưa có nhân viên nào.'})+`<p class="note">Danh sách nhóm sửa ở <a href="#/set/org">Settings → Nhóm & ngày lễ</a>.</p>`},
  tm(){const f=F();deptChart(deptRows(f),f.year||curYear())}};

/* ---------- thêm / sửa / xoá nhân viên ---------- */
function empForm(id){
  const e=id?empOf(id):{code:'',name:'',dept:'',title:'',email:'',note:'',active:true};
  modal(id?'Sửa nhân viên':'Thêm nhân viên',`<form id="mf" data-submit="emp-save" data-id="${id||''}"><div class="fg">${inp('code','Mã NV',e.code,{req:1,ph:'VD: S20123'})}${inp('name','Họ và tên',e.name,{req:1})}${sel('dept','Nhóm',deptOpts(),e.dept||'',{blank:'— Chưa gán —'})}${inp('title','Chức danh',e.title||'')}${inp('email','Email',e.email||'',{type:'email'})}${inp('note','Ghi chú',e.note||'')}${chk('active','Đang theo dõi KPI',e.active!==false)}</div></form>`,
    {footer:(id&&can('admin')?`<button class="btn danger" data-act="emp-del" data-id="${id}" style="margin-right:auto">Xoá nhân viên</button>`:'')+cancelBtn+'<button class="btn primary" form="mf">Lưu</button>'});
}
ACT['emp-new']=()=>can('admin')&&empForm();ACT['emp-edit']=el=>can('admin')&&empForm(el.dataset.id);
SUB['emp-save']=form=>{
  if(!can('admin'))return toast('Chỉ Admin được thêm / sửa nhân viên.','error');
  const d=fd(form),id=form.dataset.id,code=d.code.trim();let nid=id;
  const dup=empByCode(code);if(dup&&dup.id!==id)return toast(`Mã NV ${code} đã thuộc về ${dup.name}.`,'error');
  if(transact(()=>{let e=id?empOf(id):null;if(!e){e={id:uid('e'),createdAt:Date.now()};db.employees.push(e);nid=e.id}
    Object.assign(e,{code,name:d.name.trim(),dept:d.dept||'',title:d.title.trim(),email:d.email.trim(),note:d.note.trim(),active:!!d.active})})){done();if(!id)location.hash='#/emp/'+nid}
};
ACT['emp-del']=el=>{
  if(!can('admin'))return toast('Chỉ Admin được xoá nhân viên.','error');
  const id=el.dataset.id,e=empOf(id),sh=db.sheets.filter(s=>s.empId===id),n=sh.reduce((a,s)=>a+MM.reduce((b,m)=>b+s.months[m].tasks.length,0),0);
  if(!confirm(n?`Xoá ${e.name} cùng TOÀN BỘ ${sh.length} bảng KPI (${n} công việc)? Không thể hoàn tác.\nNếu chỉ muốn ẩn, hãy bỏ chọn “Đang theo dõi KPI”.`:`Xoá nhân viên ${e.name}?`))return;
  if(transact(()=>{db.employees=db.employees.filter(x=>x.id!==id);db.sheets=db.sheets.filter(s=>s.empId!==id)})){closeModal();toast('Đã xoá');if(location.hash==='#/emp/'+id)location.hash='#/emp/list';else rerender()}
};

/* ---------- trang chi tiết nhân viên ---------- */
const MODES={thang:'Tháng',quy:'Quý',nam:'Năm'};
const wOk=v=>Number.isInteger(v)&&v>=W_MIN&&v<=W_MAX;
const apBd=k=>badge(AP[k][0],(k==='ok'?'✓ ':k==='recheck'?'! ':'○ ')+AP[k][1]);
function empPage(e){const P={t:e.name,sign:true,   /* bản in / PDF của trang nhân viên có nhận xét của quản lý và 2 ô chữ ký */
  
  sub(){const f=F();return `${esc(e.code)} · ${esc(e.dept||'')} · Năm ${f.year} · Tháng ${f.mm||''}`},
  head(){
    const f=F(),ys=db.sheets.filter(s=>s.empId===e.id).map(s=>+s.year).sort((a,b)=>b-a);
    f.year??=String(ys.includes(+curYear())?curYear():(ys[0]||curYear()));
    const opts=[...new Set([...allYears(),...ys,+f.year])].sort((a,b)=>b-a).map(v=>[String(v),String(v)]);
    return `${isStaff()?'':'<p class="note" style="padding-top:0"><a href="#/emp/list">← Tất cả nhân viên</a></p>'}<div class="bar"><label class="fl">Năm ${fSel('year','Năm',opts)}</label><div class="sp"></div>${rptBtns('kpi-'+slug(e.code||e.name))}</div>`;
  },
  tbl(){
    e=empOf(e.id)||e;const f=F(),y=f.year,w=canSheet(e.id),mg=can('manage'),adm=can('admin'),sheet=sheetOf(e.id,y),ys=yearStats(sheet);
    if(!MM.includes(f.mm)){const lp=ys.months.reduce((a,m,i)=>m.n?i:a,-1);f.mm=ys.last!=null?MM[ys.last]:(String(y)===curYear()?curMonth():lp>=0?MM[lp]:'01')}
    f.mode=MODES[f.mode]?f.mode:'thang';
    const mm=f.mm,mi=+mm-1,st=ys.months[mi],nx=nextOf(y,mm),nxL=mLbl(nx.mm,nx.year,y),lq=ys.last!=null?Math.floor(ys.last/3):null;
    const comment=(sheet&&sheet.months[mm].comment)||'';
    const carri=st.rows.filter(r=>canCarry(r.t,r.sc)),nMgr=st.rows.filter(r=>byMgr(r.t)&&r.sc.state!=='moved').length;
    const dA=`data-e="${e.id}" data-y="${y}" data-mm="${mm}"`;
    const mCell=m=>m.prov?fmtK(m.kpiProv)+'*':m.kpi!=null?fmtK(m.kpi):m.self!=null?`<i class="self" title="Điểm tự chấm, đang chờ quản lý duyệt">(${fmtK(m.self)})</i>`:'–';
    const mMark=m=>m.overdue?`<em class="mk bad" title="${m.overdue} việc quá hạn">${m.overdue}</em>`:m.recheck?`<em class="mk bad" title="${m.recheck} việc Re-check">R</em>`:'';
    const mAria=m=>`KPI ${mVal(m)==null?(m.self!=null?'chờ duyệt, tự chấm '+fmtK(m.self):'chưa có điểm'):fmtK(mVal(m))+(m.prov?' tạm tính':'')}${m.overdue?', '+m.overdue+' việc quá hạn':''}${m.recheck?', '+m.recheck+' việc Re-check':''}`;
    const inv=session&&session.empId===e.id?myInvites(e.id):[];
    const invCard=inv.length?`<section class="card invc"><h4>📨 Lời mời làm chung (${inv.length})</h4><div class="lst">${inv.map(g=>`<div><span><b>${esc(String(g.title||'').split('\n')[0])}</b><small>${esc((g.invitedBy&&g.invitedBy[e.id]&&g.invitedBy[e.id].name)||g.byName||'')} mời · T${g.mm}/${g.year}${g.deadline?' · deadline '+fmtDM(g.deadline,g.year):''}${g.members.length?' · cùng '+esc(g.members.map(x=>gName(g,x)).join(', ')):''}</small></span><span class="acts"><button class="btn sm acc" data-act="grp-accept" data-g="${g.id}" data-e="${e.id}">Nhận</button><button class="btn sm" data-act="grp-decline" data-g="${g.id}" data-e="${e.id}">Từ chối</button></span></div>`).join('')}</div></section>`:'';
    return `${invCard}<section class="card"><div class="hdr"><div><div class="tags">${e.dept?`<span class="pf">${esc(e.dept)}</span>`:''}${e.active===false?badge('mute','Ngừng theo dõi'):''}${gradeBd(ys.avg)}</div><h2>${esc(e.name)}</h2>
      <p>Mã NV ${esc(e.code)}${e.title?' · '+esc(e.title):''}${e.email?' · '+esc(e.email):''}${sheet?' · cập nhật '+fmtDate(sheet.updatedAt):''}</p>${e.note?`<p class="desc">${esc(e.note)}</p>`:''}</div>
      ${w?`<div class="acts">${adm?`<button class="btn" data-act="emp-edit" data-id="${e.id}">Sửa thông tin</button>`:''}<button class="btn" data-act="imp-open">⬆ Nhập Excel KPI</button>${mg&&ys.pending?`<button class="btn" data-act="ap-all" data-e="${e.id}" data-y="${y}">✓ Duyệt cả năm (${ys.pending} việc chờ)</button>`:''}${mg?`<button class="btn" data-act="kt-assign" ${dA}>📌 Giao việc T${mm}</button>`:''}<button class="btn acc" data-act="kt-new" ${dA}>＋ Thêm việc T${mm}</button></div>`:''}</div></section>
    <div class="kpis">${kpi(`KPI trung bình năm ${y}`,fmtK(ys.avg),ys.avg==null?'chưa có tháng nào có điểm được duyệt':`${gradeBd(ys.avg)} · ${ys.ev.length} tháng có điểm`,gradeTone(ys.avg)||'acc')}${kpi(lq!=null?`${QN[lq]} (${QR[lq]})`:'Quý gần nhất',fmtK(lq!=null?ys.quarters[lq].avg:null),lq!=null?`trung bình ${ys.quarters[lq].n}/3 tháng`:'chưa có điểm','info')}${kpi('Cao nhất · Thấp nhất',ys.maxI!=null?`${fmtK(ys.months[ys.maxI].kpi)} · ${fmtK(ys.months[ys.minI].kpi)}`:'–',ys.maxI!=null?`T${MM[ys.maxI]} · T${MM[ys.minI]}`:'','acc')}${kpi('Hoàn thành đúng hạn',ys.onPct==null?'–':fmtK(ys.onPct)+'%',ys.scored?`${ys.onTime}/${ys.scored} việc đã hoàn thành · ${ys.late} việc trễ`:'chưa có việc hoàn thành','ok')}<button type="button" class="kpib ${f.focus==='open'?'on':''}" data-act="focus" data-v="open" aria-pressed="${f.focus==='open'}" title="Xem các việc chưa hoàn thành">${kpi('Việc chưa hoàn thành ›',ys.open+ys.overdue,ys.overdue?`<span class="tag-bad">${ys.overdue} quá hạn</span> · bấm để xem`:'bấm để xem danh sách',ys.overdue?'bad':'ok')}</button><button type="button" class="kpib ${f.focus==='pending'?'on':''}" data-act="focus" data-v="pending" aria-pressed="${f.focus==='pending'}" title="Xem các việc chờ quản lý duyệt">${kpi('Chờ quản lý duyệt ›',ys.pending,ys.recheck?`<span class="tag-bad">${ys.recheck} việc Re-check</span> · bấm để xem`:ys.pending?'bấm để xem danh sách':'không có việc chờ duyệt',ys.recheck?'bad':ys.pending?'warn':'ok')}</button></div>${focusCard(e,y,ys)}
    <section class="card"><div class="hdr" style="align-items:center;margin-bottom:10px"><h4 style="margin:0">${{thang:'KPI theo tháng',quy:'KPI trung bình theo quý',nam:'KPI lũy kế từ đầu năm'}[f.mode]} – ${y}</h4><div class="seg" role="group" aria-label="Kỳ hiển thị">${Object.entries(MODES).map(([k,l])=>`<button type="button" data-act="setf" data-k="mode" data-v="${k}" aria-pressed="${f.mode===k}" class="${f.mode===k?'on':''}">${l}</button>`).join('')}</div></div>
      <div class="ch"><canvas id="c1"></canvas></div>
      <p class="note">${f.mode==='thang'?'Bấm vào một cột để mở bảng việc của tháng đó. ':f.mode==='quy'?'Mỗi cột là trung bình các tháng đã có điểm trong quý. ':'Điểm cuối đường là KPI năm tính đến tháng gần nhất. '}Xếp loại: A+ ≥100 · A ≥86 · B ≥75 · C ≥61 · D >41 · E · tối đa ${KPI_CAP}. Cột đỏ: dưới 75. Cột nhạt và dấu *: tháng đang diễn ra, điểm tạm tính.</p></section>
    <section class="card mcard"><div class="mstrip" role="group" aria-label="Chọn tháng">${MM.map((m,i)=>`<button type="button" data-act="setf" data-k="mm" data-v="${m}" aria-pressed="${m===mm}" class="${m===mm?'on':''}" aria-label="Tháng ${m}, ${mAria(ys.months[i])}"><b>T${m}${mMark(ys.months[i])}</b><span>${mCell(ys.months[i])}</span></button>`).join('')}</div>
      <div class="hdr" style="margin:14px 0 10px"><div><h4 style="margin:0 0 6px">Đánh giá KPI tháng ${mm}/${y}</h4><div class="mmeta"><span class="big">${fmtK(mVal(st))}</span>${st.prov?badge('info','Tạm tính · tháng chưa kết thúc'):mVal(st)!=null?gradeBd(st.kpi):badge('mute',st.pending?'Chờ quản lý duyệt':'Chưa có điểm')}<span class="muted">${st.n} việc · ${st.scored} đã hoàn thành · ${st.counted} đã duyệt</span>${nMgr?`<span class="pf mgr">${nMgr} việc By Manager</span>`:''}${st.pending?badge('warn',`○ ${st.pending} việc chờ duyệt · nếu duyệt hết: ${fmtK2(st.self)}`):''}${st.recheck?badge('bad',`! ${st.recheck} việc Re-check · không tính điểm`):''}${(()=>{const std=st.v2?kpi2().userStd:100;return st.n&&!st.fixed&&!(st.kri&&st.kri.length)?(Math.abs(st.weight-std)<0.01?`<span class="muted">Tổng trọng số ${std}</span>`:badge('warn',`! Tổng trọng số ${fmtK(st.weight)} (chuẩn ${std})`)):''})()}${st.raw>KPI_CAP?`<span class="muted">Cộng dồn ${fmtK(st.raw)}, khống chế ở ${KPI_CAP}</span>`:''}</div></div>
        <div class="acts">${st.n?`<button class="btn" data-act="sheet-print" ${dA}>🖨 In phiếu</button><button class="btn" data-act="sheet-pdf" ${dA}>Phiếu PDF</button>`:''}${w?`<button class="btn" data-act="kt-new" ${dA}>＋ Thêm việc</button>`:''}${mg?`<button class="btn" data-act="kt-assign" ${dA}>📌 Giao việc</button>`:''}${mg&&st.pending?`<button class="btn acc" data-act="ap-all" ${dA}>✓ Duyệt ${st.pending} việc chờ duyệt</button>`:''}</div></div>
      ${w&&carri.length?`<p class="hint">Tháng này còn ${carri.length} việc chưa hoàn thành. Việc nào cần dời sang ${nxL}: bấm <b>Sửa</b> ở việc đó rồi chọn <b>Chuyển sang ${nxL}</b>.</p>`:''}
      ${st.fixed?fixedCard(e,y,mm,st)+(st.n?monthTable(e,y,mm,st):''):st.v2?kpiFrames(e,y,mm,st):`<p class="note" style="padding-top:0">Tháng này tính theo quy chế cũ (100% công việc); quy chế mới (Khung 1 + KRI + Thưởng) áp dụng từ T${kpi2().since.slice(5)}/${kpi2().since.slice(0,4)}.</p>${monthTable(e,y,mm,st)}`}
      ${(()=>{if(st.v2)return'';const bm=st.rows.filter(r=>byMgr(r.t)&&r.sc.state!=='moved');if(!bm.length||!session||session.empId!==e.id)return'';
        return `<div class="bmlist"><b>📌 Việc quản lý giao cho bạn tháng ${mm} (${bm.length})</b><ul>${bm.map(r=>`<li>${tagsOf(r.t).map(k=>`<span class="pf tg ${k}">${TAGS[k]}</span>`).join('')}<span>${esc(r.t.title.split('\n')[0])}</span><small class="muted">${r.t.deadline?'deadline '+fmtDM(r.t.deadline,y):'chưa đặt hạn'}${r.t.byName?' · giao bởi '+esc(r.t.byName):''}</small> ${stBd(r.t,r.sc,y)}</li>`).join('')}</ul></div>`})()}
      <form class="cmt" data-submit="cmt-save" ${dA}><label class="f"><span>Nhận xét của quản lý – tháng ${mm}</span><textarea class="in" name="comment" rows="2" ${mg?'':'readonly'} placeholder="${mg?'Điểm mạnh, điểm cần cải thiện, mục tiêu tháng sau…':'Quản lý chưa nhận xét tháng này.'}">${esc(comment)}</textarea></label>${mg?'<div><button class="btn sm">Lưu nhận xét</button></div>':''}</form>
    </section>`;
  },
  tm(){
    e=empOf(e.id)||e;const f=F(),y=f.year,ys=yearStats(sheetOf(e.id,y)),sel=+f.mm-1;
    if(f.mode==='quy'){const d=ys.quarters.map(q=>q.avg);
      kChart('c1',{type:'bar',data:{labels:QN.map((n,i)=>[n,QR[i]]),datasets:[{label:'KPI trung bình quý',data:d,backgroundColor:barColors(d),showVal:true,maxBarThickness:44}]},options:kpiOpt({plugins:{legend:{display:false},tooltip:kTip(i=>[ys.quarters[i].n?`Trung bình ${ys.quarters[i].n}/3 tháng có điểm`:'Chưa có tháng nào có điểm'])}})},
        `KPI trung bình theo quý của ${e.name}, năm ${y}: `+ys.quarters.map((q,i)=>`${QN[i]} ${q.avg==null?'chưa có điểm':fmtK(q.avg)}`).join(', '));
    }else if(f.mode==='nam'){const prev=sheetOf(e.id,+y-1),py=prev?yearStats(prev):null;
      kChart('c1',{type:'line',data:{labels:MM.map(m=>'T'+m),datasets:[{label:`Lũy kế ${y}`,data:ys.ytd,borderColor:CC.bar,backgroundColor:CC.fill,fill:true,tension:.25,pointRadius:4,pointBackgroundColor:CC.bar,pointBorderColor:'#fff',pointBorderWidth:2,borderWidth:2,spanGaps:true,showVal:'last'},
        ...(py?[{label:`Lũy kế ${+y-1}`,data:py.ytd,borderColor:CC.prev,backgroundColor:CC.prev,tension:.25,pointRadius:3,borderWidth:2,spanGaps:true}]:[])]},
        options:kpiOpt({interaction:{mode:'index',intersect:false},plugins:{legend:{display:!!py,position:'bottom'},tooltip:kTip(i=>ys.months[i].kpi!=null?[`KPI tháng: ${fmtK2(ys.months[i].kpi)}`]:['Tháng chưa có điểm'])}})},
        `KPI lũy kế từ đầu năm ${y} của ${e.name}: `+(ys.ev.length?ys.ev.map(i=>`đến T${MM[i]} ${fmtK(ys.ytd[i])}`).join(', '):'chưa có điểm'));
    }else{const d=ys.months.map(mVal);
      kChart('c1',{type:'bar',data:{labels:MM.map(m=>'T'+m),datasets:[{label:'KPI tháng',data:d,backgroundColor:d.map((v,i)=>ys.months[i].prov?CC.prov:v!=null&&v<80?CC.low:CC.bar),borderColor:CC.ink,borderWidth:d.map((_,i)=>i===sel?2:0),showVal:true}]},
        options:kpiOpt({onClick:(ev,els)=>{if(els.length){F().mm=MM[els[0].index];refreshTbl()}},onHover:(ev,els)=>{ev.native.target.style.cursor=els.length?'pointer':'default'},plugins:{legend:{display:false},tooltip:kTip(i=>{const m=ys.months[i];return m.n?[...(m.prov?['Tạm tính: tháng chưa kết thúc, chưa tính vào quý / năm']:[]),`${m.n} việc · ${m.counted} đã duyệt · ${m.pending} chờ duyệt${m.recheck?' · '+m.recheck+' Re-check':''}`,`Đúng hạn hoặc sớm ${m.ontime+m.early} · Trễ ${m.late}`,`Chưa hoàn thành ${m.open+m.nodate+m.overdue}`]:['Chưa có việc nào']})}})},
        `KPI theo tháng của ${e.name}, năm ${y}: `+(ys.ev.length?ys.ev.map(i=>`T${MM[i]} ${fmtK(ys.months[i].kpi)}`).join(', '):'chưa có tháng nào có điểm'));
    }
  }};return P}

/* ---------- bảng việc của một tháng (đủ các cột của sheet tháng trong file Excel) ---------- */
function linkify(text){return esc(text).replace(/https?:\/\/[^\s<]+/g,u=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)}
const CP_TIP={ok:'Đã duyệt: tính vào KPI',recheck:'Re-check: không tính điểm','':'Chờ quản lý duyệt: chưa tính vào KPI'};
/* Nhãn trên tên việc: By Manager (việc quản lý giao) + tag Ưu tiên / Quan trọng */
const tagBd=t=>`${byMgr(t)?`<span class="pf mgr" title="Việc do quản lý giao${t.byName?' · '+esc(t.byName):''}${t.byAt?' · '+fmtDate(t.byAt):''}">By Manager</span>`:''}${tagsOf(t).map(k=>`<span class="pf tg ${k}">${TAGS[k]}</span>`).join('')}`;
const tagText=t=>{const g=grpOfT(t);return [byMgr(t)?'By Manager':'',...tagsOf(t).map(k=>TAGS[k].replace(/^\S+\s/,'')),g?'Làm chung: '+g.members.map(x=>gName(g,x)).join(', '):''].filter(Boolean).join(', ')};
/* Nhãn việc làm chung: những người cùng làm, người đang được mời / đã từ chối */
function grpBd(t,eid){const g=grpOfT(t);if(!g)return'';const o=g.members.filter(x=>x!==eid).map(x=>gName(g,x)),inv=(g.invited||[]).map(x=>gName(g,x)),dec=(g.declined||[]).filter(x=>!g.members.includes(x)).map(x=>gName(g,x));
  if(!o.length&&!inv.length&&!dec.length)return'';
  return `<span class="pf grp" title="Việc làm chung: Ngày hoàn thành áp dụng cho cả nhóm${g.locked?' · đã được quản lý duyệt':''}">👥 ${o.length?'Làm chung: '+esc(o.join(', ')):'Làm chung'}${inv.length?` · chờ nhận: ${esc(inv.join(', '))}`:''}${dec.length?` · từ chối: ${esc(dec.join(', '))}`:''}</span>`}
/* biểu tượng danh mục chỉ tiêu: 3 vạch, vạch cuối thụt vào như chỉ tiêu con (SVG nét theo màu chữ; phần giao diện mới không dùng emoji) */
const KPI_ICO='<svg class="kico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M2.5 3.5h.5M6 3.5h7.5M2.5 8h.5M6 8h7.5M5 12.5h.5M8.5 12.5h5"/></svg>';
/* Mục Work B: tiêu đề dòng nhóm / chỉ tiêu = nhãn gọn + phần còn lại của ô Excel; rê chuột xem Quy ước đánh giá */
const kpiTtl=(text,pre='',rule='')=>{const s=String(text||''),rest=s.split('\n').slice(1).join('\n').trim();return `<span class="tt"${rule?` title="${esc('Quy ước đánh giá (file Excel): '+rule)}"`:''}>${pre}${esc(kpiLabel(s))}</span>${rest?`<small class="kpx">${esc(rest)}</small>`:''}`};
/* ô chọn chỉ tiêu KPI: nhóm có tiêu đề → optgroup, nhóm một dòng → option; luôn có dòng trống đầu để không tự chọn thay người dùng */
/* Mã mục Work B theo cấp: mục có số nhóm = B.1, B.2…; chỉ tiêu con dưới một nhóm tiêu đề = B.2.1, B.2.2… */
function wbCodes(kc){const m=new Map();let top=0,sub=0,grp=false;
  for(const r of (kc&&kc.rows)||[]){
    if(r.no||r.w==null){top++;sub=0;grp=r.w==null;m.set(r.id,'B.'+top)}
    else if(grp){sub++;m.set(r.id,`B.${top}.${sub}`)}
    else{top++;m.set(r.id,'B.'+top)}}
  return m}
const wbCode=(kc,id)=>wbCodes(kc).get(id)||'';
/* ô chọn mục Work B (giống mã và tên trên khung Work B): nhóm tiêu đề → optgroup; luôn có dòng trống đầu để không tự chọn thay người dùng */
function kpiSel(k,cur,attrs=''){let h='',open=false;const C=wbCodes(k),opt=r=>`<option value="${esc(r.id)}" ${r.id===cur?'selected':''}>${esc(C.get(r.id)+' '+kpiLabel(r.text))}</option>`,close=()=>{if(open){h+='</optgroup>';open=false}};
  for(const r of (k&&k.rows)||[]){
    if(r.w==null){close();h+=`<optgroup label="${esc(C.get(r.id)+' '+kpiLabel(r.text))}">`;open=true}
    else if(r.no){close();h+=opt(r)}
    else h+=opt(r);
  }
  close();return `<select class="in" name="kpi" ${attrs}><option value="" ${kpiHas(k,cur)?'':'selected'}>— Chọn mục Work B —</option>${h}</select>`}
/* Ô Quản lý duyệt: quản lý chọn ngay trên bảng; nhân viên chỉ thấy kết quả */
function apCell(e,y,mm,r){
  const sc=r.sc;if(sc.state==='moved')return '';
  if(sc.comp==null&&!sc.ap)return '<span class="muted">–</span>';
  if(!can('manage'))return apBd(sc.ap);
  return `<select class="in aps ${AP[sc.ap][0]}" data-appr data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}" aria-label="Quản lý duyệt việc ${r.i+1}">${['','ok','recheck'].map(k=>`<option value="${k}" ${sc.ap===k?'selected':''}${k==='ok'&&sc.comp==null?' disabled':''}>${AP[k][1]}</option>`).join('')}</select>`;
}
/* Ô Comment by Manager: quản lý nhập khi việc đang Re-check; nhân viên chỉ đọc. Nhân viên cập nhật lại việc → comment mờ và gạch đi. */
const mcShow=(c,y)=>{const who=`<small>${esc(c.by||'Quản lý')}${c.at?' · '+fmtDM(c.at,y):''}${c.done?' · nhân viên đã cập nhật':''}</small>`;return c.done?`<s class="mc done">${esc(c.text)}</s>${who}`:`<span class="mc">${esc(c.text)}</span>${who}`};
function mcCell(e,y,mm,r){
  const sc=r.sc,c=mcOf(r.t);if(sc.state==='moved')return '';
  if(can('manage')&&sc.ap==='recheck')return `<form class="mcf" data-submit="mc-save" data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}"><textarea class="in" name="mc" rows="2" maxlength="500" data-mc placeholder="Cần sửa / bổ sung gì…" aria-label="Comment by Manager cho việc ${r.i+1}">${esc(c&&!c.done?c.text:'')}</textarea><button class="btn sm">Lưu</button></form>${c&&c.done?mcShow(c,y):''}`;
  return c?mcShow(c,y):'';
}
/* opt.kind: (không có) = cả tháng, cách tính cũ · 'user' = Khung 2 By User · 'bm' = việc quản lý giao trong Khung 1. opt.rows: các dòng của khung. */
const focusHit=(f,r)=>f==='open'?canCarry(r.t,r.sc):f==='pending'?(r.sc.comp!=null&&r.sc.ap===''&&r.sc.state!=='moved'):false;
function monthTable(e,y,mm,st,opt={}){
  const w=canSheet(e.id),mg=can('manage'),kind=opt.kind||'',bm=kind==='bm',P=kpi2(),fc=F().focus||'';
  /* Khung 2 có danh mục chỉ tiêu KPI: xếp việc theo nhóm giống mục I của file Excel; dòng nhóm là dòng giả {hdr} */
  const kc=kind==='user'?kpiOf(e.id,y):null,grp=kpiRows(kc).length>0&&!opt.flat&&!opt.line,flat=!!opt.flat&&kpiRows(kc).length>0;
  const ek=(flat||!!opt.line)&&isV2(`${y}-${mm}`);   /* Work B: việc chấm theo lỗi, không dùng trọng số / điểm từng việc */
  const errTxt=sc=>sc.ap==='recheck'?'Re-check':sc.state==='overdue'?'quá hạn':'trễ hạn';
  const tRows=flat?kpiRows(kc).filter(r=>r.src!=='res'):[],kAuto=tRows.length===1?tRows[0]:null;   /* bảng phẳng (quy chế KRI): cột Chỉ tiêu KRI cho từng việc */
  const rows=grp?kpiGroups(kc,opt.rows||st.rows).map(x=>x.lv==='task'?x.r:{hdr:x}):sortRows(opt.rows||st.rows).map((r,i)=>({...r,i})),tk=rows.filter(r=>!r.hdr),scd=r=>r.sc.state!=='moved'&&(r.sc.comp!=null||r.sc.ap);
  /* ô của dòng nhóm: STT (I / số nhóm / —); Trọng số: mục I so với chuẩn Khung 2 (báo màu khi lệch), chỉ tiêu = tổng việc / trọng số chỉ tiêu năm trong Excel (chỉ để đối chiếu) */
  const kpiNo=h=>h.lv==='sec'?'I':h.lv==='cat'?h.no:h.lv==='none'?'—':'',kpiW=h=>h.lv==='sec'?`<b class="${Math.abs(h.wUsed-P.userStd)>=0.01?'tag-warn':''}">${fmtK(h.wUsed)}</b><small>chuẩn ${P.userStd}</small>`:h.lv==='none'?fmtK(h.wUsed):h.wStd?`<span title="Tổng trọng số các việc của chỉ tiêu này trong tháng / trọng số chỉ tiêu năm trong file Excel (để đối chiếu, không phải điểm)">${fmtK(h.wUsed)}<small>chỉ tiêu ${fmtK(h.wStd)}%</small></span>`:'';
  /* Cột Comment by Manager chỉ hiện khi khung có việc Re-check (quản lý) hoặc đã có comment */
  const mcX=r=>{const c=mcOf(r.t);return c?c.text+(c.done?' (nhân viên đã cập nhật)':''):''};
  const per=fmtK2(st.bmPer||0),bmPts=r=>r.sc.comp==null?'–':r.sc.ap==='ok'?`<b class="cp ok">+${per}</b>`:r.sc.ap==='recheck'?'<b class="cp recheck">0</b><small class="tag-bad">không tính</small>':`<b class="cp pend">${per}</b><small>chờ duyệt</small>`;
  const cols=[
    {h:'STT',c:'num',f:r=>grp?'':r.i+1,x:r=>grp?'':r.i+1,hf:h=>esc(kpiNo(h)),hx:kpiNo},
    grp?{h:'Trọng số nhóm',c:'num',f:()=>'',x:()=>'',hf:h=>h.lv==='sec'?P.userStd+'%':'',hx:h=>h.lv==='sec'?P.userStd+'%':''}:null,
    {h:'Nội dung công việc / Đóng góp',c:'ttl',f:r=>`${r.t.carriedFrom?`<span class="pf">Chuyển từ ${mLbl(r.t.carriedFrom.month,r.t.carriedFrom.year,y)}</span>`:''}${tagBd(r.t)}${grpBd(r.t,e.id)}<span class="tt">${esc(r.t.title)}</span>${grp&&w&&r.sc.state!=='moved'&&!kpiHas(kc,r.t.kpi)?`<span class="kpw">${kpiSel(kc,'',`data-kpi aria-label="Chỉ tiêu KPI cho việc ${r.i+1}"`)}<button type="button" class="btn sm" data-act="kpi-set" data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}" disabled aria-label="Gắn chỉ tiêu KPI cho việc ${r.i+1}">Gắn</button></span>`:''}`,x:r=>r.t.title,
      hf:h=>h.lv==='none'?`<span class="tt">Chưa phân loại</span><small>${w?'Chọn chỉ tiêu KPI cho từng việc ở ô bên dưới.':'Các việc chưa được gắn chỉ tiêu KPI.'}</small>`:kpiTtl(h.lv==='line'?h.row.text:h.text,h.lv==='line'?'▸ ':'',h.row&&h.row.rule),
      hx:h=>h.lv==='none'?'Chưa phân loại':h.lv==='line'?h.row.text:h.text},
    flat?{h:'Mục Work B',c:'kric',f:r=>{const k=kpiRows(kc).find(z=>z.id===r.t.kpi);if(k)return `<span class="kri-l${k.src!=='res'?' on':''}" title="${esc(k.text)}">${esc(wbCode(kc,k.id)+' '+kpiLabel(k.text))}</span>${k.src!=='res'?'':'<small class="muted">mục này không tính từ việc</small>'}`;
      if(kAuto)return `<span class="kri-l on" title="${esc(kAuto.text)}">${esc(kpiLabel(kAuto.text))}</span><small class="muted">tự gắn</small>`;
      return w&&r.sc.state!=='moved'?`<span class="kpw">${kpiSel(kc,'',`data-kpi aria-label="Chỉ tiêu KRI cho việc ${r.i+1}"`)}<button type="button" class="btn sm" data-act="kpi-set" data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}" disabled aria-label="Gắn chỉ tiêu cho việc ${r.i+1}">Gắn</button></span>`:'<span class="muted">Chưa gắn</span>'},x:r=>{const k=kpiRows(kc).find(z=>z.id===r.t.kpi)||kAuto;return k?kpiLabel(k.text):''}}:null,
    {h:'Giao bởi / Tag / Làm chung',xonly:1,x:r=>tagText(r.t)},
    bm||ek?null:{h:'Trọng số',c:'num',f:r=>fmtK(r.sc.w),x:r=>r.sc.w,hf:kpiW,hx:h=>h.wUsed??''},
    {h:'Deadline',f:r=>`<span style="white-space:nowrap">${fmtDM(r.t.deadline,y)}</span>${r.t.carriedFrom&&r.t.carriedFrom.deadline&&r.t.carriedFrom.deadline!==r.t.deadline?`<small>gốc ${fmtDM(r.t.carriedFrom.deadline,y)}</small>`:''}`,x:r=>fmtDate(r.t.deadline)},
    {h:'Ngày hoàn thành',f:r=>{const g=grpOfT(r.t);return `<span style="white-space:nowrap">${fmtDM(r.t.submitted,y)}</span>${g&&r.t.submitted&&g.doneBy&&g.doneBy.empId!==e.id?`<small title="Việc làm chung: ngày hoàn thành do ${esc(g.doneBy.name)} ghi">ghi bởi ${esc(String(g.doneBy.name).split(' ').pop())}</small>`:''}`},x:r=>fmtDate(r.t.submitted)},
    {h:'Số ngày trễ',xonly:1,x:r=>r.sc.late??''},
    {h:'Trạng thái',c:'stc',f:r=>stBd(r.t,r.sc,y),x:r=>stText(r.t,r.sc,y)},
    ek?{h:'Lỗi',c:'c',f:r=>taskErr(r.sc)?`<b class="tag-bad">1 lỗi</b><small>${errTxt(r.sc)}</small>`:'<span class="muted">–</span>',x:r=>taskErr(r.sc)?'1 lỗi ('+errTxt(r.sc)+')':''}:null,
    bm||ek?null:{h:'Điểm cơ bản',c:'num',f:r=>r.sc.base==null?'–':fmtK(r.sc.base),x:r=>r.sc.base??''},
    bm||ek?null:{h:'Điểm thưởng (tự động)',c:'num',f:r=>r.sc.bonus==null?'–':r.sc.bonus?`<span class="pos">+${fmtK(r.sc.bonus)}</span>`:'0',x:r=>r.sc.bonus??''},
    ek?null:bm?{h:'Điểm giao việc',c:'num',f:bmPts,x:r=>r.sc.comp==null?'':r.sc.ap==='ok'?r2(st.bmPer||0):0}
      :{h:'Điểm thành phần',c:'num',f:r=>r.sc.comp==null?'–':`<b class="cp ${r.sc.ap||'pend'}" title="${CP_TIP[r.sc.ap]}">${fmtK2(r.sc.comp)}</b>${r.sc.ap==='recheck'?'<small class="tag-bad">không tính</small>':r.sc.ap===''?'<small>chờ duyệt</small>':''}`,x:r=>r.sc.comp==null?'':r2(r.sc.comp),hf:h=>h.wStd||h.wUsed?`<b>${fmtK2(h.pts)}</b>`:'',hx:h=>h.pts??''},
    {h:'Quản lý duyệt',c:'apc',f:r=>apCell(e,y,mm,r),x:r=>scd(r)?AP[r.sc.ap][1]:''},
    {h:'Tính vào KPI',xonly:1,x:r=>r.sc.comp==null?'':r.sc.counted?'Có':'Không'},
    /* Ghi chú / Link bằng chứng: chỉ hiện icon 📄, bấm vào xem nội dung (bản In / PDF vẫn in đủ chữ) */
    {h:'Ghi chú / Link',c:'ntc',f:r=>{const fs=filesOf(r.t);return r.t.note||fs.length?`<button type="button" class="ntb" data-act="note-view" data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}" title="Xem ghi chú / file bằng chứng${fs.length?' ('+fs.length+' file)':''}" aria-label="Xem ghi chú việc ${r.i+1}">${fs.length?'📎':'📄'}${fs.length?`<em class="ntn">${fs.length}</em>`:''}</button><span class="ntp" hidden>${linkify(r.t.note||'')}${fs.length?`${r.t.note?'\n':''}📎 ${fs.map(f=>esc(f.name)).join(', ')}`:''}</span>`:''},x:r=>[r.t.note||'',...filesOf(r.t).map(f=>f.url)].filter(Boolean).join('\n')},
    {h:'Comment by Manager',c:'mcc',f:r=>mcCell(e,y,mm,r),x:mcX},
    Object.assign(actCol(r=>!w?'':r.sc.state==='moved'?`<button class="btn sm" data-act="kt-undo" data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}" aria-label="Hoàn tác chuyển việc ${r.i+1}">Hoàn tác</button>`
      :canTask(e.id,r.t)?`<button class="btn sm" data-act="kt-edit" data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}" aria-label="Sửa việc ${r.i+1}">Sửa</button>`:'<span class="muted" title="Việc đã được quản lý Duyệt, chỉ quản lý sửa được">Đã duyệt</span>'),
      /* dòng mục I / nhóm / tiêu đề / chỉ tiêu: quản lý sửa ngay dòng đó */
      {hf:h=>!mg||h.lv==='none'?'':`<button class="btn sm" data-act="kc-row" data-e="${e.id}" data-y="${y}" data-id="${esc(h.lv==='sec'?'':h.lv==='line'?h.row.id:h.id)}" aria-label="${esc('Sửa '+(h.lv==='sec'?'mục I':kpiLabel(h.lv==='line'?h.row.text:h.text)))}">Sửa</button>`})
  ].filter(Boolean);
  if(grp)cols.forEach(c=>{const f=c.f,x=c.x;if(f)c.f=r=>r.hdr?(c.hf?c.hf(r.hdr):''):f(r);if(x)c.x=r=>r.hdr?(c.hx?c.hx(r.hdr):''):x(r)});   /* dòng nhóm dùng hf / hx của từng cột */
  const nVis=cols.filter(c=>!c.xonly).length,live=tk.filter(r=>r.sc.state!=='moved').length,c0=grp||flat?3:2,tkPts=r2(tk.reduce((a,r)=>a+(r.sc.counted?r.sc.comp:0),0));
  const nErr=tk.filter(r=>taskErr(r.sc)).length;
  const foot=!live?'':ek?`<tr><td colspan="${nVis}">${live} việc · ${tk.filter(r=>r.sc.ap==='ok').length} đã Duyệt · <b class="${nErr?'tag-bad':''}">${nErr} lỗi</b>${opt.flat?' · việc chưa gắn mục không tính':''}</td></tr>`:bm
    ?`<tr><td colspan="2">Điểm giao việc</td><td colspan="3"></td><td class="num">${fmtK(st.pMgr)}/${P.mgrMax}</td><td colspan="${nVis-6}">${st.bmOk}/${st.bmN} việc được Duyệt × ${fmtK2(st.bmPer||0)} điểm (${P.mgrMax} ÷ ${st.bmN} việc)${st.bmPend?` · ${st.bmPend} việc chờ duyệt`:''}</td></tr>`
    :`<tr><td colspan="${c0}">${opt.line?'Cộng mục':flat?'Chưa phân loại':kind==='user'?'Work B · By User':'KPI tổng tháng'}</td><td class="num">${fmtK(flat||opt.line?r2(tk.filter(r=>r.sc.state!=='moved').reduce((a,r)=>a+r.sc.w,0)):st.weight)}</td><td colspan="5"></td><td class="num">${flat||opt.line?fmtK2(tkPts):kind==='user'?fmtK2(st.p80):fmtK2(mVal(st))+(st.prov?'*':'')}</td><td colspan="${nVis-c0-7}">${kind==='user'?`${tk.filter(r=>r.sc.counted).length}/${tk.filter(r=>r.sc.comp!=null).length} việc đã duyệt`:st.scored?`${st.counted}/${st.scored} việc đã duyệt`:''}</td></tr>`;
  return table(cols,rows,{meta:false,rc:r=>r.hdr?'kh kh-'+r.hdr.lv+(r.hdr.d?' kd'+r.hdr.d:''):[r.sc.state==='moved'?'moved':r.sc.ap==='recheck'?'recheck':'',focusHit(fc,r)?'hl':'',grp?(ui.kjust===r.t.id?'kt kj':'kt'):''].join(' ').trim(),   /* kd1 / kd2 / kd3: màu theo cấp */
    empty:bm?`Tháng ${mm} chưa có việc nào do quản lý giao.${mg?' Bấm “Giao việc” để giao việc cho nhân viên.':''}`:`Tháng ${mm} chưa có việc nào.${w?' Bấm “Thêm việc” để nhập việc của tháng.':''}`,foot});
}
/* ---------- Khung 1 (Quản lý giao & Tuân thủ, 20) · Khung 2 (By User, 80) · Khung 3 (KPI tháng) ---------- */
const lateChip=(x,mg,dA)=>`<span class="chip late" title="${x.t?'Giờ vào '+esc(x.t):''}">${fmtDate(x.d).slice(0,5)}${x.t?` <small>${esc(x.t)}</small>`:''}${mg?` <button type="button" class="x" data-act="late-x" ${dA} data-id="${x.id}" aria-label="Bỏ ngày đi trễ ${fmtDate(x.d)}">✕</button>`:''}</span>`;
const NC_KIND={safety:'TVE Safety',audit:'Audit định kỳ',iso:'Tiêu chuẩn ISO / OHSAS'};
const pctTxt=p=>p==null?'–':fmtK(r2(p*100))+'%';
const entryChips=(list,act,mg,dA,lb)=>list.length?`<ul class="ncl">${list.map(x=>`<li><span>${fmtDate(x.d).slice(0,5)}</span> ${x.k&&NC_KIND[x.k]?`<b>${NC_KIND[x.k]}</b> · `:''}${esc(x.note||'')}${mg?` <button type="button" class="x" data-act="${act}" ${dA} data-id="${x.id}" aria-label="Bỏ ${lb} ngày ${fmtDate(x.d)}">✕</button>`:''}</li>`).join('')}</ul>`:'';
/* mã mục Work B: B.1, B.2… theo thứ tự các dòng có trọng số trong danh mục */
/* Work B: mỗi mục một khối – dòng "Công việc hằng ngày" có danh sách việc riêng (thêm việc ngay vào mục), dòng "Kết quả tháng" nhập kết quả */
function workB(e,y,mm,st,kc,usRows){
  const mg=can('manage'),w=canSheet(e.id),dA=`data-e="${e.id}" data-y="${y}" data-mm="${mm}"`,O=new Map((st.kri||[]).map(o=>[o.row.id,o])),ids=new Set((st.kri||[]).map(o=>o.row.id)),C=wbCodes(kc);
  const tl=(st.kri||[]).filter(o=>o.src==='tasks'),only=tl.length===1?tl[0].row.id:null,edB=(id,code)=>mg?`<button class="btn sm" data-act="kc-row" data-e="${e.id}" data-y="${y}" data-id="${esc(id)}" aria-label="${esc('Sửa mục '+code)}">Sửa</button>`:'';
  const block=(o,child)=>{const r=o.row,code=C.get(r.id)||'';
    const ff=o.src==='tasks'?(r.ef||KRI_EF):r.f,tbl=ff?kxTable(ff,o.src==='tasks'?[0,1,2,3,4,5]:undefined):[],tip=`${r.rule?'Quy ước (Excel): '+r.rule+'\n':''}${o.src==='tasks'?'Số lỗi trong tháng (việc trễ hạn, bị Re-check, quá hạn chưa làm, lỗi quản lý ghi thêm) → % đạt: ':ff?'Công thức: '+ff+'\n':''}${tbl.length?tbl.map(t=>`${t.x}${t.plus?'+':''}${o.src==='tasks'?' lỗi':''} → ${pctTxt(t.p)}`).join(' · '):'Chưa có quy ước tính'}`;
    const errIn=o.src==='tasks'?(mg?`<label class="wbe2" title="Lỗi quản lý ghi thêm (ví dụ có phàn nàn)">+<input class="in kerr" type="number" min="0" step="1" data-kerr ${dA} data-id="${esc(r.id)}" value="${o.errM||''}" placeholder="0" aria-label="${esc('Lỗi ghi thêm mục '+code)}"> lỗi</label>`:o.errM?`<span>+${o.errM} lỗi quản lý ghi</span>`:''):'';
    const stat=o.off?'<span class="tag-warn">chưa có quy ước</span>':`<span class="wbst" title="${esc(tip)}">${o.src==='tasks'?`<span>${o.n?`${o.n} việc · `:'chưa có việc · '}<b class="${o.err?'tag-bad':''}">${o.err} lỗi</b></span>`:''}<span>% đạt <b>${pctTxt(o.pct)}</b></span></span>`;
    const head=`<div class="wbh"><span class="wbc${child?' sub':''}">${code}</span><div class="wbt">${kpiTtl(r.text,'',r.rule)}${r.ppe?'<a class="pf kri-src" href="#/ppe/issue">Liên kết mục Quản lý PPE</a>':''}${o.src==='tasks'?'':`<span class="pf">Kết quả tháng${r.tgt!=null&&r.tgt!==''?` · mục tiêu ${esc(r.tgt)}${r.unit?' '+esc(r.unit):''}`:''}${r.freq?' · '+esc(r.freq):''}</span>`}</div>
      <div class="wbs">${o.src==='tasks'?errIn:mg?`<input class="in kres" data-kri ${dA} data-id="${esc(r.id)}" value="${esc(o.res)}" placeholder="kết quả" inputmode="decimal" aria-label="${esc('Kết quả tháng mục '+code)}">`:`<span>Kết quả: ${o.res===''?'<span class="muted">trống</span>':esc(o.res)}</span>`}${stat}<span class="wbw">Trọng số <b>${fmtK(o.w)}</b></span><span class="wbp" title="Điểm của mục">${o.off?'–':fmtK2(o.score)}</span><span class="wba">${o.src==='tasks'&&w?`<button class="btn sm acc" data-act="kt-new" ${dA} data-k="${esc(r.id)}">＋ Thêm việc</button>`:''}${edB(r.id,code)}</span></div></div>`;
    if(o.src!=='tasks')return `<section class="wb${child?' wbk':''}">${head}</section>`;
    const mine=usRows.filter(x=>x.t.kpi===r.id||(only===r.id&&!ids.has(x.t.kpi)));
    return `<section class="wb${child?' wbk':''}">${head}${mine.length?monthTable(e,y,mm,st,{rows:mine,kind:'user',line:true}):`<p class="note wbe">Chưa có việc nào trong mục này tháng ${mm}.${w?' Bấm “＋ Thêm việc”.':''}</p>`}</section>`};
  const rows=(kc&&kc.rows)||[];let out='';
  rows.forEach((r,i)=>{
    if(r.w==null){   /* nhóm tiêu đề: tổng trọng số và điểm các mục con */
      const kids=[];for(let j=i+1;j<rows.length&&!rows[j].no&&rows[j].w!=null;j++){const o=O.get(rows[j].id);if(o)kids.push(o)}
      if(!kids.length)return;const code=C.get(r.id);
      out+=`<div class="wbg"><span class="wbc">${code}</span><div class="wbt">${kpiTtl(r.text,'',r.rule)}</div><div class="wbs"><span class="wbw">Trọng số <b>${fmtK(r2(kids.filter(o=>!o.off).reduce((a,o)=>a+o.w,0)))}</b></span><span class="wbp">${fmtK2(r2(kids.reduce((a,o)=>a+o.score,0)))}</span><span class="wba">${edB(r.id,code)}</span></div></div>`;return}
    const o=O.get(r.id);if(o)out+=block(o,!r.no&&(C.get(r.id)||'').split('.').length>2);
  });
  const loose=only?[]:usRows.filter(x=>!ids.has(x.t.kpi));
  return out+(loose.length?`<section class="wb wbx"><div class="wbh"><span class="wbc">?</span><div class="wbt"><b>Chưa phân loại</b><small>Chọn mục Work B cho từng việc rồi bấm Gắn; việc chưa gắn không được tính điểm.</small></div></div>${monthTable(e,y,mm,st,{rows:loose,kind:'user',flat:true})}</section>`:'');
}
function kpiFrames(e,y,mm,st){
  const P=kpi2(),mg=can('manage'),dA=`data-e="${e.id}" data-y="${y}" data-mm="${mm}"`,dmin=`${y}-${mm}-01`,dmax=isoOf(dayNum(`${nextOf(y,mm).year}-${nextOf(y,mm).mm}-01`)-1);
  const bmRows=st.rows.filter(r=>byMgr(r.t)),usRows=st.rows.filter(r=>!byMgr(r.t)),k=mVal(st),kc=kpiOf(e.id,y),hasKc=!!(st.kri&&st.kri.length);
  const dateIn=`<input class="in" type="date" name="d" required min="${dmin}" max="${dmax}" aria-label="Ngày">`;
  const lateBox=`<div class="cmpc"><div class="cmph"><span>Đi trễ <small class="muted">(giờ vào sau ${esc(P.lateAfter)})</small></span><b class="${st.lateList.length?'tag-bad':''}">${st.lateList.length} lần</b></div>
      <div class="chips">${st.lateList.length?st.lateList.map(x=>lateChip(x,mg,dA)).join(''):'<span class="muted">Không đi trễ ngày nào.</span>'}</div>
      ${mg?`<form class="cmpf" data-submit="late-add" ${dA}>${dateIn}<input class="in" type="time" name="t" value="08:15" aria-label="Giờ vào"><button class="btn sm">＋ Thêm ngày trễ</button></form>`:''}</div>`;
  /* lỗi NC chia 2 ô: TVE Safety hàng tháng · NC Audit định kỳ (gồm cả lỗi tiêu chuẩn ISO / OHSAS cũ) */
  const ncBox=(kinds,ttl,sub,k)=>{const l=st.ncList.filter(x=>kinds.includes(x.k||'audit'));return `<div class="cmpc"><div class="cmph"><span>${ttl} <small class="muted">${sub}</small></span><b class="${l.length?'tag-bad':''}">${l.length} lỗi</b></div>
      ${entryChips(l.map(x=>({...x,k:x.k==='iso'?'iso':''})),'nc-x',mg,dA,'lỗi')||'<div class="chips"><span class="muted">Không có lỗi.</span></div>'}
      ${mg?`<form class="cmpf" data-submit="nc-add" ${dA}><input type="hidden" name="k" value="${k}">${dateIn}<input class="in" name="note" required maxlength="200" placeholder="Nội dung lỗi" aria-label="Nội dung lỗi ${esc(ttl)}"><button class="btn sm">＋ Thêm lỗi</button></form>`:''}</div>`};
  const bonusBox=(list,act,add,ttl,sub,pts,max,ph)=>`<div class="cmpc"><div class="cmph"><span>${ttl} <small class="muted">${sub}</small></span><b class="${pts?'pos':''}">${fmtK(pts)} / ${max}</b></div>
      ${entryChips(list,act,mg,dA,ttl.toLowerCase())||'<div class="chips"><span class="muted">Chưa có.</span></div>'}
      ${mg?`<form class="cmpf" data-submit="${add}" ${dA}>${dateIn}<input class="in" name="note" required maxlength="200" placeholder="${ph}" aria-label="Nội dung"><button class="btn sm">＋ Thêm</button></form>`:''}</div>`;
  const wSum=hasKc?r2(st.kri.filter(o=>!o.off).reduce((a,o)=>a+o.w,0)):P.userStd;
  return `<section class="kf kf20"><div class="kfh"><h4>Work A · Quản lý giao &amp; Tuân thủ</h4><span class="kfs"><b>${fmtK(st.p20)}</b> / ${P.mgrMax+P.compMax}</span></div>
    <div class="kfsub"><div class="kfsh"><b>A.1 · Quản lý giao việc</b><span class="muted">${st.bmN?`${P.mgrMax} điểm chia đều cho ${st.bmN} việc giao = ${fmtK2(st.bmPer)} điểm/việc; cộng khi việc được Duyệt, không trừ khi trễ`:`việc giao bởi quản lý · tháng này chưa có việc giao nên giữ đủ ${P.mgrMax} điểm`}</span><span class="kfs sm">${fmtK(st.pMgr)} / ${P.mgrMax}</span></div>${monthTable(e,y,mm,st,{rows:bmRows,kind:'bm'})}</div>
    <div class="kfsub"><div class="kfsh"><b>A.2 · Thái độ &amp; Tuân thủ nội quy và quy định</b><span class="muted">${P.compMax} điểm, trừ ${fmtK(P.ncPen)} mỗi lỗi và ${fmtK(P.latePen)} mỗi lần đi trễ; không vi phạm thì giữ nguyên</span><span class="kfs sm">${fmtK(st.pComp)} / ${P.compMax}</span></div>
      <div class="cmp cmp3">${ncBox(['safety'],'TVE Safety hàng tháng','(lỗi NC khi kiểm tra)','safety')}${ncBox(['audit','iso'],'No NC Audit định kỳ','(lỗi NC khi Audit, ISO / OHSAS)','audit')}${lateBox}</div></div>
  </section>
  <section class="kf kf80"><div class="kfh"><h4>Work B · Công việc By User <small class="muted">${esc((kc&&kc.sec)||'KPI Công ty và hoạt động của phòng (KRI)')}</small>${mg?` <button class="btn sm" data-act="kc-edit" data-e="${e.id}" data-y="${y}">${KPI_ICO}Chỉ tiêu KPI</button>${hasKc?` <button class="btn sm" data-act="kc-add" data-e="${e.id}" data-y="${y}">＋ Thêm mục</button>`:''}`:''}</h4><span class="kfs"><b>${fmtK2(st.p80)}</b> / ${fmtK(wSum)}</span></div>
    ${hasKc?workB(e,y,mm,st,kc,usRows):`<p class="hint">${mg?`Chưa có danh mục Work B năm ${y} của ${esc(e.name)}. Bấm <b>Chỉ tiêu KPI</b> để dùng mẫu hoặc nhập từ file Excel. Tạm thời Work B = tổng điểm các việc By User đã Duyệt.`:'Chưa có danh mục Work B. Tạm thời Work B = tổng điểm các việc By User đã Duyệt.'}</p>${monthTable(e,y,mm,st,{rows:usRows,kind:'user'})}`}
  </section>
  <section class="kf kf3"><div class="kfh"><h4>Work C · Điểm thưởng <small class="muted">quản lý nhập</small></h4><span class="kfs"><b>${fmtK(st.p3)}</b> / ${P.gaMax+P.mocMax}</span></div>
    <div class="cmp">${bonusBox(st.gaList,'ga-x','ga-add','Hỗ trợ việc phát sinh',`(ngoài việc thường ngày: 1 lần = ${fmtK(P.gaMax/2)}, từ 2 lần = ${fmtK(P.gaMax)})`,st.pGa,P.gaMax,'Việc phát sinh đã hỗ trợ')}${bonusBox(st.mocList,'moc-x','moc-add','Sáng kiến MOC',`(được công ty chấp nhận = ${fmtK(P.mocMax)})`,st.pMoc,P.mocMax,'Nội dung sáng kiến')}</div>
  </section>
  <section class="kf kftot"><div class="kfh"><h4>KPI tháng ${mm}/${y} ${st.lock?badge('ok','Đã chốt'):badge('mute','Chưa chốt')}</h4><span class="kfs big"><b>${fmtK2(k)}</b>${st.prov?'*':''}</span></div>
    <div class="kfeq"><span>${fmtK(st.p20)} <small>Work A</small></span><i>+</i><span>${fmtK2(st.p80)} <small>Work B</small></span><i>+</i><span>${fmtK(st.p3)} <small>Work C · Thưởng</small></span><i>=</i><span><b>${k==null?'–':fmtK2(k)}</b> <small>KPI tháng${st.prov?' (tạm tính)':''}</small></span>${k!=null?gradeBd(st.kpi??st.kpiProv):''}</div>
    <p class="note">${k==null?'Chưa có điểm: cần danh mục Work B hoặc ít nhất một việc được Duyệt. ':''}${st.pending?`Còn ${st.pending} việc chờ duyệt; nếu duyệt hết: ${fmtK2(st.self)}. `:''}Khống chế 0 – ${KPI_CAP}. Xếp loại: A+ ≥100 · A ≥86 · B ≥75 · C ≥61 · D >41 · E.</p>
    <p class="note" style="margin:0">${st.lock?`Quản lý ${esc(st.lock.by||'')} đã chốt điểm ngày ${fmtDate(st.lock.at)}.`:'Cuối tháng quản lý xem lại lỗi của từng mục rồi bấm Chốt điểm tháng.'}${mg?` <button type="button" class="btn sm${st.lock?'':' primary'}" data-act="m-lock" ${dA}>${st.lock?'Bỏ chốt':'Chốt điểm tháng'}</button>`:''}</p>
  </section>`;
}
ACT['m-lock']=el=>{if(!can('manage'))return;const {e,y,mm}=el.dataset,sh=sheetOf(e,y),lk=sh&&sh.months[mm].lock;
  if(lk&&!confirm('Bỏ chốt điểm tháng này?'))return;
  if(transact(()=>{const s2=sheetOf(e,y,true),m=s2.months[mm];if(lk)delete m.lock;else m.lock={by:session?.name||'',at:todayStr()};s2.updatedAt=todayStr()})){refreshTbl();toast(lk?'Đã bỏ chốt':'Đã chốt điểm tháng');if(!lk)notifyEmp(e,{ic:'🔒',title:`Điểm KPI tháng ${mm}/${y} đã được chốt`,body:'Xem chi tiết từng mục trong trang KPI của bạn',e,y,mm})}};
/* Tháng có điểm chốt nhập từ file Excel */
function fixedCard(e,y,mm,st){
  const f=st.fixed,mg=can('manage'),n=v=>v==null?'–':fmtK2(v);
  return `<section class="kf kftot"><div class="kfh"><h4>Điểm chốt tháng ${mm}/${y} <small class="muted">từ file Excel${f.sheet?' · sheet '+esc(f.sheet):''}</small></h4><span class="kfs big"><b>${fmtK2(st.kpi)}</b></span></div>
    <div class="kfeq"><span>${n(f.k1)} <small>Work A · Thái độ &amp; tuân thủ (mục II)</small></span><i>+</i><span>${n(f.k2)} <small>Work B · KRI (mục I)</small></span><i>+</i><span>${n(f.k3)} <small>Work C · Thưởng (mục III)</small></span><i>=</i><span><b>${fmtK2(st.kpi)}</b> <small>KPI tháng</small></span>${gradeBd(st.kpi)}</div>
    <p class="note">Điểm tháng này lấy nguyên từ file Excel${f.at?`, nhập ngày ${fmtDate(f.at)}${f.by?' bởi '+esc(f.by):''}`:''}; các việc trên app (nếu có) chỉ để theo dõi, không tính điểm.${mg?` <button type="button" class="btn sm" data-act="fx-del" data-e="${e.id}" data-y="${y}" data-mm="${mm}">Bỏ điểm chốt</button>`:''}</p></section>`;
}
ACT['fx-del']=el=>{if(!can('manage')||!confirm('Bỏ điểm chốt từ Excel của tháng này? Điểm sẽ tính lại từ dữ liệu trên app.'))return;const {e,y,mm}=el.dataset;
  if(transact(()=>{const sh=sheetOf(e,y);if(sh){delete sh.months[mm].fixed;sh.updatedAt=todayStr()}})){refreshTbl();toast('Đã bỏ điểm chốt')}};
/* Work B: lỗi quản lý ghi thêm cho một mục (ngoài lỗi app tự đếm từ việc) */
document.addEventListener('change',ev=>{const el=ev.target.closest&&ev.target.closest('input[data-kerr]');if(!el)return;
  if(!can('manage'))return toast('Chỉ quản lý ghi lỗi.','error');const {e,y,mm,id}=el.dataset,n=Math.max(0,Math.floor(+el.value||0));
  if(transact(()=>{const sh=sheetOf(e,y,true),m=sh.months[mm];m.kri=m.kri||{};const v={...(m.kri[id]||{})};if(n)v.x=n;else delete v.x;if(v.x==null&&v.r==null)delete m.kri[id];else m.kri[id]={...v,by:session?.name||'',at:todayStr()};sh.updatedAt=todayStr()})){refreshTbl();toast(n?`Đã ghi ${n} lỗi`:'Đã bỏ lỗi ghi thêm')}});
/* Kết quả tháng của một dòng KRI (quản lý nhập, lưu khi rời ô) */
document.addEventListener('change',ev=>{const el=ev.target.closest&&ev.target.closest('input[data-kri]');if(!el)return;
  if(!can('manage'))return toast('Chỉ quản lý nhập Kết quả tháng.','error');
  const {e,y,mm,id}=el.dataset,raw=el.value.trim(),v=raw===''?'':Number.isFinite(+raw.replace(',','.'))?+raw.replace(',','.'):raw;
  if(transact(()=>{const sh=sheetOf(e,y,true),m=sh.months[mm];m.kri=m.kri||{};if(v==='')delete m.kri[id];else m.kri[id]={r:v,by:session?.name||'',at:todayStr()};sh.updatedAt=todayStr()})){refreshTbl();toast('Đã lưu kết quả')}});
/* nhập đi trễ / lỗi NC (chỉ quản lý) */
function cmpEdit(form,fn){if(!can('manage'))return toast('Chỉ quản lý được nhập phần Tuân thủ.','error');const {e,y,mm}=form.dataset;
  if(transact(()=>{const sh=sheetOf(e,y,true),m=sh.months[mm];fn(m);sh.updatedAt=todayStr()})){refreshTbl();return true}}
SUB['late-add']=form=>{const d=fd(form),P=kpi2();
  if(d.t&&d.t<=P.lateAfter)return toast(`Giờ vào ${d.t} không tính là đi trễ (chỉ tính sau ${P.lateAfter}).`,'error');
  cmpEdit(form,m=>{m.late=m.late||[];if(m.late.some(x=>x.d===d.d))throw new Error('Ngày này đã ghi đi trễ rồi.');m.late.push({id:uid('l'),d:d.d,t:d.t||'',by:session?.name||'',at:todayStr()})})&&(toast('Đã ghi ngày đi trễ'),notifyEmp(form.dataset.e,{ic:'⏰',title:'Ghi nhận đi trễ',body:`Ngày ${fmtDate(d.d)}${d.t?' · giờ vào '+d.t:''} · trừ ${fmtK(P.latePen)} điểm Tuân thủ`,e:form.dataset.e,y:form.dataset.y,mm:form.dataset.mm}))};
SUB['nc-add']=form=>{const d=fd(form);if(!String(d.note||'').trim())return toast('Nhập nội dung lỗi NC.','error');
  cmpEdit(form,m=>{(m.nc=m.nc||[]).push({id:uid('n'),d:d.d,k:NC_KIND[d.k]?d.k:'audit',note:d.note.trim(),by:session?.name||'',at:todayStr()})})&&(toast('Đã ghi lỗi NC'),notifyEmp(form.dataset.e,{ic:'⚠️',title:`Lỗi NC · ${NC_KIND[d.k]||'Audit'}`,body:`Ngày ${fmtDate(d.d)}: ${d.note.trim()} · trừ ${fmtK(kpi2().ncPen)} điểm Tuân thủ`,e:form.dataset.e,y:form.dataset.y,mm:form.dataset.mm}))};
ACT['late-x']=el=>{if(confirm('Bỏ ngày đi trễ này?'))cmpEdit(el,m=>{m.late=(m.late||[]).filter(x=>x.id!==el.dataset.id)})};
ACT['nc-x']=el=>{if(confirm('Bỏ lỗi NC này?'))cmpEdit(el,m=>{m.nc=(m.nc||[]).filter(x=>x.id!==el.dataset.id)})};
/* Work C · Điểm thưởng: hỗ trợ việc phát sinh, sáng kiến MOC (quản lý nhập) */
const bonusAdd=(key,lb,pts)=>form=>{const d=fd(form);if(!String(d.note||'').trim())return toast('Nhập nội dung.','error');
  cmpEdit(form,m=>{(m[key]=m[key]||[]).push({id:uid(key),d:d.d,note:d.note.trim(),by:session?.name||'',at:todayStr()})})&&(toast('Đã ghi '+lb),notifyEmp(form.dataset.e,{ic:'🎁',title:'Điểm thưởng: '+lb,body:`Ngày ${fmtDate(d.d)}: ${d.note.trim()}`,e:form.dataset.e,y:form.dataset.y,mm:form.dataset.mm}))};
SUB['ga-add']=bonusAdd('ga','hỗ trợ việc phát sinh');SUB['moc-add']=bonusAdd('moc','sáng kiến MOC');
ACT['ga-x']=el=>{if(confirm('Bỏ dòng này?'))cmpEdit(el,m=>{m.ga=(m.ga||[]).filter(x=>x.id!==el.dataset.id)})};
ACT['moc-x']=el=>{if(confirm('Bỏ dòng này?'))cmpEdit(el,m=>{m.moc=(m.moc||[]).filter(x=>x.id!==el.dataset.id)})};
/* ---------- danh mục chỉ tiêu KPI (Khung 2) của một nhân viên trong năm – Admin / Quản lý ----------
   Bảng giống mục I của file Excel: Nhóm số · Chỉ tiêu · Trọng số chỉ tiêu (%) · Quy ước đánh giá.
   Mỗi dòng giữ id ở data-id; khi lưu đọc từng dòng theo thứ tự trên màn hình (không dùng fd() vì các ô trùng tên). */
const kcRowHTML=r=>`<tr data-kr data-id="${esc(r.id||'')}"><td><input class="in" name="no" value="${esc(r.no||'')}" placeholder="—" aria-label="Nhóm số (để trống = chỉ tiêu con của nhóm trên)"></td><td><textarea class="in" name="text" rows="2" aria-label="Chỉ tiêu">${esc(r.text||'')}</textarea></td><td><input class="in" name="w" type="number" min="0" max="100" step="any" value="${r.w!=null&&r.w!==''&&Number.isFinite(+r.w)?+r.w:''}" placeholder="tiêu đề" aria-label="Trọng số chỉ tiêu (%), để trống = dòng tiêu đề"></td><td><textarea class="in" name="rule" rows="2" aria-label="Quy ước đánh giá">${esc(r.rule||'')}</textarea></td><td class="act"><button type="button" class="btn sm" data-act="kc-ins" title="Thêm một dòng ngay dưới, cùng nhóm" aria-label="Thêm dòng dưới">＋</button> <button type="button" class="btn sm danger" data-act="kc-del" title="Xoá dòng" aria-label="Xoá dòng">✕</button></td></tr>`;
function kcTot(){const el=$('#kc-tot');if(!el)return;const P=kpi2(),t=r2($$('#kc-rows input[name=w]').reduce((a,x)=>a+(+x.value||0),0));
  el.innerHTML=`Tổng trọng số chỉ tiêu: <b class="${Math.abs(t-P.userStd)>=0.01?'tag-warn':''}">${fmtK(t)}</b> / chuẩn ${P.userStd} của Khung 2.`}
ACT['kc-edit']=el=>{
  if(!can('manage'))return toast('Chỉ quản lý được sửa danh mục chỉ tiêu KPI.','error');
  const {e,y}=el.dataset,k=kpiOf(e,y)||{sec:'KPI Công ty và hoạt động của phòng (KRI)',rows:[]},own=!!(sheetOf(e,y)&&sheetOf(e,y).kpi);
  modal(`Chỉ tiêu KPI · ${empName(e)} · ${y}`,`<form id="mf" data-submit="kc-save" data-e="${esc(e)}" data-y="${esc(y)}">
    <p class="note" style="padding-top:0">Giống mục <b>I</b> của file Excel KPI cá nhân. Dòng có <b>Nhóm số</b> bắt đầu một nhóm; dòng có <b>Trọng số chỉ tiêu</b> là chỉ tiêu để gắn việc; để trống trọng số là dòng tiêu đề. Bấm <b>＋</b> để thêm dòng ngay dưới (cùng nhóm). Điểm của việc không đổi.${!own&&k.rows.length?` Đang dùng tạm danh mục năm ${+y-1}; bấm Lưu để dùng cho năm ${esc(y)}.`:''}</p>
    ${inp('sec','Tên mục I',k.sec||'',{full:1})}
    <div class="tw"><table class="t kce"><thead><tr><th>Nhóm số</th><th>Chỉ tiêu</th><th>Trọng số chỉ tiêu (%)</th><th>Quy ước đánh giá</th><th class="act"></th></tr></thead><tbody id="kc-rows">${(k.rows.length?k.rows:[{}]).map(kcRowHTML).join('')}</tbody></table></div>
    <p class="note" id="kc-tot" aria-live="polite"></p></form>`,
    {footer:`<button type="button" class="btn" data-act="kc-imp" data-y="${esc(y)}" style="margin-right:auto">${KPI_ICO}Nhập từ file Excel</button><button type="button" class="btn" data-act="kc-tpl" data-e="${esc(e)}" data-y="${esc(y)}" title="Thay danh mục bằng mẫu Work B có sẵn">Dùng mẫu Work B…</button>${cancelBtn}<button class="btn primary" form="mf">Lưu</button>`,size:'wide'});
  kcTot();
};
document.addEventListener('input',ev=>{if(ev.target.closest&&ev.target.closest('#kc-rows')){ev.target.classList.remove('bad');ev.target.removeAttribute('aria-invalid');kcTot()}});
ACT['kc-ins']=el=>{const tr=el.closest('tr');tr.insertAdjacentHTML('afterend',kcRowHTML({}));tr.nextElementSibling.querySelector('textarea').focus()};
ACT['kc-del']=el=>{
  const tr=el.closest('tr'),f=el.closest('form'),id=tr.dataset.id,u=id?kpiUse(f.dataset.e,f.dataset.y,x=>x===id):{n:0};
  if(u.n&&!confirm(`Chỉ tiêu này đang gắn ${u.n} việc (${u.by}). Xoá dòng thì các việc đó về “Chưa phân loại”. Xoá?`))return;
  tr.remove();if(!$('#kc-rows tr'))$('#kc-rows').insertAdjacentHTML('beforeend',kcRowHTML({}));kcTot();
};
SUB['kc-save']=form=>{
  if(!can('manage'))return toast('Chỉ quản lý được sửa danh mục chỉ tiêu KPI.','error');
  const {e,y}=form.dataset,trs=$$('tr[data-kr]',form),taken=new Set(trs.map(tr=>tr.dataset.id).filter(Boolean)),rows=[];
  const bad=(el,msg)=>{el.classList.add('bad');el.setAttribute('aria-invalid','true');el.focus();toast(msg,'error')};   /* báo lỗi ngay tại ô sai */
  for(const tr of trs){
    const v=n=>tr.querySelector(`[name=${n}]`).value.trim(),text=v('text'),no=v('no').replace(/\.$/,''),ws=v('w');
    if(!text&&!no&&ws==='')continue;   /* dòng trống: bỏ */
    if(!text)return bad(tr.querySelector('[name=text]'),'Mỗi dòng cần có nội dung Chỉ tiêu.');
    const w=ws===''?null:Number(ws.replace(',','.'));if(w!=null&&!(w>=0&&w<=100))return bad(tr.querySelector('[name=w]'),`Trọng số của “${kpiLabel(text)}” phải từ 0 đến 100.`);
    let id=tr.dataset.id;if(!id){id=kpiId(text,taken);taken.add(id)}
    const old=(kpiOf(e,y)||{rows:[]}).rows.find(z=>z.id===id)||{},keep={};['f','tgt','unit','freq','src','ef','ppe'].forEach(k=>{if(old[k]!=null&&old[k]!=='')keep[k]=old[k]});   /* giữ quy ước tính, mục tiêu, nguồn điểm của dòng */
    rows.push({...keep,id,no,text,w,rule:v('rule')});
  }
  const sh0=sheetOf(e,y),next={sec:(fd(form).sec||'').trim(),rows},sig=k=>JSON.stringify([k.sec||'',k.rows.map(r=>[r.id,r.no||'',r.text,r.w??null,r.rule||''])]);   /* so theo nội dung, không theo thứ tự khoá */
  if(sh0&&sh0.kpi&&sig(sh0.kpi)===sig(next)){closeModal();return toast('Không có thay đổi.')}
  if(transact(()=>{const sh=sheetOf(e,y,true);sh.kpi=next;sh.updatedAt=todayStr()}))done('Đã lưu danh mục chỉ tiêu KPI');
};
/* Sửa một dòng của danh mục ngay trên bảng Khung 2 (nút Sửa ở dòng mục I / nhóm / tiêu đề / chỉ tiêu) – Admin / Quản lý.
   Giữ nguyên id của dòng nên các việc đã gắn vẫn gắn; thêm / xoá dòng vẫn ở nút "Chỉ tiêu KPI". data-id trống = tên mục I. */
ACT['kc-row']=el=>{
  if(!can('manage'))return toast('Chỉ quản lý được sửa danh mục chỉ tiêu KPI.','error');
  const {e,y,id}=el.dataset,k=kpiOf(e,y);if(!k)return toast('Chưa có danh mục chỉ tiêu KPI.','warn');
  const own=!!(sheetOf(e,y)&&sheetOf(e,y).kpi),tmp=own?'':`Đang dùng tạm danh mục năm ${+y-1}; Lưu sẽ tạo danh mục riêng cho năm ${esc(y)} (năm ${+y-1} giữ nguyên). `;
  const form=(body,note)=>`<form id="mf" data-submit="kc-row-save" data-e="${esc(e)}" data-y="${esc(y)}" data-id="${esc(id||'')}" novalidate><div class="fg">${body}<p class="note full" style="padding:0">${note}</p></div></form>`,ft={footer:cancelBtn+'<button class="btn primary" form="mf">Lưu</button>'};
  if(!id)return modal(`Sửa mục I · ${empName(e)} · ${y}`,form(inp('sec','Tên mục I',k.sec||'',{full:1}),tmp+'Tên mục I hiện ở dòng đầu của Khung 2.'),ft);
  const r=k.rows.find(x=>x.id===id);if(!r)return toast('Dòng này không còn trong danh mục.','error');
  const u=kpiUse(e,y,x=>x===id);
  modal(`Sửa ${r.no?'nhóm '+r.no:r.w==null?'dòng tiêu đề':'chỉ tiêu'} · ${empName(e)} · ${y}`,form(
    `${inp('no','Nhóm số <small class="muted">(để trống = thuộc nhóm phía trên)</small>',r.no||'')}${inp('w','Trọng số chỉ tiêu (%) <small class="muted">(để trống = dòng tiêu đề)</small>',r.w!=null&&Number.isFinite(+r.w)?+r.w:'',{type:'number',step:'any',attrs:'min="0" max="100" inputmode="decimal"'})}
    ${txa('text','Chỉ tiêu <i style="color:var(--bad);font-style:normal">*</i>',r.text||'',{full:1,rows:3})}${txa('rule','Quy ước đánh giá (mô tả)',r.rule||'',{full:1,rows:3})}
    ${inp('tgt','Mục tiêu',r.tgt??'')}${inp('unit','Đơn vị',r.unit||'')}${inp('freq','Tần suất đánh giá',r.freq||'')}
    ${sel('src','Nguồn điểm',[['tasks','Công việc (nhân viên tạo việc trong mục: nội dung, deadline, ngày hoàn thành)'],['res','Kết quả tháng (quản lý nhập, đổi ra % theo quy ước tính)']],r.src==='res'?'res':'tasks')}
    <label class="f full"><span>Quy ước theo số lỗi <small class="muted">(mục tính từ việc; để trống = ${esc(KRI_EF)}, x = số lỗi trong tháng)</small></span><input class="in" name="ef" value="${esc(r.ef||'')}" autocomplete="off" spellcheck="false" style="font-family:ui-monospace,monospace" placeholder="${esc(KRI_EF)}"></label>
    <label class="f"><span>Liên kết</span><label class="chk"><input type="checkbox" name="ppe" ${r.ppe?'checked':''}> Nhận việc tự động từ mục Quản lý PPE</label></label>
    <label class="f full"><span>Quy ước tính <small class="muted">(công thức kiểu Excel, x = Kết quả tháng; ví dụ IF(x=0,100%,IF(x=1,80%,IF(x=2,60%,0))))</small></span><input class="in" name="f" value="${esc(r.f||'')}" autocomplete="off" spellcheck="false" style="font-family:ui-monospace,monospace"></label>
    <div class="f full"><span>Bảng quy đổi</span><div class="hint" id="kx-prev" aria-live="polite"></div></div>`,
    `${tmp}${u.n?`Đang gắn ${u.n} việc (${esc(u.by)}); sửa nội dung không làm mất các việc đã gắn. `:''}Điểm của việc không đổi. Thêm / xoá dòng: nút <b>Chỉ tiêu KPI</b> ở đầu Khung 2.`),ft);kxPrev();
};
document.addEventListener('input',ev=>{const f=ev.target.closest&&ev.target.closest('form[data-submit="kc-row-save"]');if(f){ev.target.classList.remove('bad');ev.target.removeAttribute('aria-invalid');kxPrev()}});
/* xem trước Quy ước tính: Kết quả 0, 1, 2… → % đạt */
function kxPrev(){const el=$('#kx-prev'),f=$('form[data-submit="kc-row-save"] [name=f]');if(!el||!f)return;const v=f.value.trim(),src=$('form[data-submit="kc-row-save"] [name=src]');
  if(src&&src.value!=='res'){const ef=($('form[data-submit="kc-row-save"] [name=ef]')||{}).value||KRI_EF,er=kxCheck(ef);el.innerHTML=er?`<span class="tag-bad">${esc(er)}</span>`:'Tính từ việc trong mục, theo số lỗi: '+kxTable(ef,[0,1,2,3,4,5]).map(t=>`${t.x}${t.plus?'+':''} lỗi → <b>${pctTxt(t.p)}</b>`).join(' · ')+'. Tháng không có việc = 0 lỗi = đủ điểm.';return}
  if(!v){el.textContent='Chưa có quy ước tính: dòng này chưa có điểm.';return}
  const er=kxCheck(v);if(er){el.innerHTML=`<span class="tag-bad">${esc(er)}</span>`;return}
  el.innerHTML=`Kết quả trống → <b>${pctTxt(kxPct(v,''))}</b> · `+kxTable(v).map(t=>`${t.x}${t.plus?'+':''} → <b>${pctTxt(t.p)}</b>`).join(' · ')}
document.addEventListener('change',ev=>{if(ev.target.closest&&ev.target.closest('form[data-submit="kc-row-save"]'))kxPrev()});
SUB['kc-row-save']=form=>{
  if(!can('manage'))return toast('Chỉ quản lý được sửa danh mục chỉ tiêu KPI.','error');
  const {e,y,id}=form.dataset,k=kpiOf(e,y),f=fd(form);if(!k)return closeModal();
  const bad=(n,msg)=>{const el=form.querySelector(`[name=${n}]`);el.classList.add('bad');el.setAttribute('aria-invalid','true');el.focus();toast(msg,'error')};   /* báo lỗi ngay tại ô sai */
  let next,same;
  if(!id){next={sec:String(f.sec||'').trim()};same=(k.sec||'')===next.sec}
  else{const r=k.rows.find(x=>x.id===id);if(!r)return toast('Dòng này không còn trong danh mục.','error');
    const text=String(f.text||'').trim(),ws=String(f.w??'').trim(),w=ws===''?null:Number(ws.replace(',','.')),wEl=form.querySelector('[name=w]');
    if(wEl&&wEl.validity&&wEl.validity.badInput)return bad('w','Trọng số chỉ tiêu phải là số, ví dụ 40 hoặc 12.5.');   /* novalidate: ô số gõ sai trả về '' – không coi là để trống */
    if(!text)return bad('text','Cần có nội dung Chỉ tiêu.');
    if(w!=null&&!(w>=0&&w<=100))return bad('w','Trọng số chỉ tiêu phải từ 0 đến 100.');
    const fx=String(f.f||'').trim();if(fx&&kxCheck(fx))return bad('f','Quy ước tính chưa đúng: '+kxCheck(fx));
    const efx=String(f.ef||'').trim();if(efx&&kxCheck(efx))return bad('ef','Quy ước theo số lỗi chưa đúng: '+kxCheck(efx));
    next={no:String(f.no||'').trim().replace(/\.$/,''),text,w,rule:String(f.rule||'').trim(),f:fx,tgt:String(f.tgt??'').trim(),unit:String(f.unit||'').trim(),freq:String(f.freq||'').trim(),src:f.src==='res'?'res':'',ef:efx,ppe:f.ppe?true:''};
    same=['no','text','rule','f','tgt','unit','freq','ef','ppe'].every(p=>String(r[p]??'')===String(next[p]))&&(r.src==='res')===(next.src==='res')&&(r.w??null)===next.w;
    if(!same&&r.w!=null&&w==null){const u=kpiUse(e,y,x=>x===id);if(u.n&&!confirm(`Để trống trọng số thì dòng này thành dòng tiêu đề và ${u.n} việc đang gắn (${u.by}) về “Chưa phân loại”. Tiếp tục?`))return}}
  const back=()=>{const b=[...document.querySelectorAll('[data-act="kc-row"]')].find(x=>x.dataset.id===(id||''));if(b)b.focus()};   /* con trỏ về lại nút Sửa của dòng */
  if(same){closeModal();back();return toast('Không có thay đổi.')}
  if(transact(()=>{const sh=sheetOf(e,y,true);if(!sh.kpi)sh.kpi=JSON.parse(JSON.stringify(k));   /* năm đang dùng tạm danh mục năm trước: chép sang năm này */
    if(id){const row=sh.kpi.rows.find(x=>x.id===id);Object.assign(row,next);['f','tgt','unit','freq','src','ef','ppe'].forEach(k=>{if(row[k]==='')delete row[k]});delete row.empty}else sh.kpi.sec=next.sec;   /* ô để trống: bỏ hẳn trường đó */sh.updatedAt=todayStr()})){
    done('Đã lưu chỉ tiêu KPI');back()}
};
/* Mẫu danh mục Work B (cấu trúc theo công việc thực tế của từng vị trí). Dòng nào "Công việc hằng ngày": nhân viên ghi việc, deadline, ngày hoàn thành vào đúng mục. */
const WB_TPL=[{id:'ga',name:'Admin Staff (GA): PPE · thuốc & sơ cấp cứu · vệ sinh · ESG · other',sec:'Công việc By User – KPI Công ty và hoạt động của phòng (KRI)',rows:[
  {no:'1',text:'Theo dõi cấp phát PPE',w:10,ppe:true,freq:'Tháng',rule:'Mỗi lần cấp phát ở mục Quản lý PPE tự thành một việc của mục này; ghi thêm việc khác nếu có.'},
  {no:'2',text:'Enhancement CPL with OHSAS 45000 and ISO 14001',w:null},
  {no:'',text:'Tất cả các loại thuốc trong danh mục quy định luôn sẵn có, thuốc phải còn hạn sử dụng, không bị hỏng hóc hoặc biến chất',w:5,freq:'Tháng'},
  {no:'',text:'Bản kiểm tra túi / hộp sơ cấp cứu luôn được kiểm tra hàng tuần',w:5,freq:'Hàng tuần'},
  {no:'3',text:'Vệ sinh văn phòng\nCác phòng họp, khu vực office, kho luôn được giữ sạch sẽ, đầy đủ nước uống và sắp xếp gọn gàng',w:40,freq:'Hàng ngày'},
  {no:'4',text:'Cập nhật ESG report',w:10,freq:'Tháng'},
  {no:'5',text:'Other: hỗ trợ và nhận những việc ngoài giờ',w:10,freq:'Tháng'}]}];
ACT['kc-tpl']=el=>{
  if(!can('manage'))return toast('Chỉ quản lý được đổi danh mục.','error');const {e,y}=el.dataset;
  modal(`Dùng mẫu Work B · ${empName(e)} · ${y}`,`<form id="mf2" data-submit="kc-tpl-save" data-e="${esc(e)}" data-y="${esc(y)}"><div class="fg">${sel('tpl','Mẫu',WB_TPL.map(t=>[t.id,t.name]),WB_TPL[0].id,{full:1})}
    <div class="f full"><span>Các mục</span><div class="hint">${(()=>{const t=WB_TPL[0],k={rows:t.rows.map((r,i)=>({...r,id:'r'+i}))},C=wbCodes(k);return k.rows.map(r=>`${r.w==null?'<b>':''}${C.get(r.id)} ${esc(kpiLabel(r.text))}${r.w!=null?' · '+r.w:''}${r.w==null?'</b>':''}`).join('<br>')})()}</div></div>
    <p class="note full" style="padding:0">Danh mục Work B năm ${esc(y)} của ${esc(empName(e))} sẽ được thay bằng mẫu này. Các việc đã gắn mục cũ chuyển về “Chưa phân loại” để gắn lại.</p></div></form>`,{footer:cancelBtn+'<button class="btn primary" form="mf2">Dùng mẫu</button>'})};
SUB['kc-tpl-save']=form=>{if(!can('manage'))return;const {e,y}=form.dataset,t=WB_TPL.find(x=>x.id===fd(form).tpl)||WB_TPL[0];
  if(transact(()=>{const sh=sheetOf(e,y,true),taken=new Set();sh.kpi={sec:t.sec,rows:t.rows.map(r=>{const id=kpiId(r.text,taken);taken.add(id);return{...r,id}})};sh.updatedAt=todayStr()}))done('Đã dùng mẫu Work B')};
/* Thêm một mục Work B (ví dụ Other…): mục riêng ở cuối, hoặc mục con trong một nhóm tiêu đề (B.2.3…) */
ACT['kc-add']=el=>{
  if(!can('manage'))return toast('Chỉ quản lý được thêm mục.','error');const {e,y}=el.dataset,k=kpiOf(e,y)||{rows:[]},C=wbCodes(k);
  const grps=k.rows.filter(r=>r.w==null).map(r=>[r.id,'Mục con trong '+C.get(r.id)+' '+kpiLabel(r.text)]);
  modal(`Thêm mục Work B · ${empName(e)} · ${y}`,`<form id="mf2" data-submit="kc-add-save" data-e="${esc(e)}" data-y="${esc(y)}"><div class="fg">
    ${inp('text','Tên mục <i style="color:var(--bad);font-style:normal">*</i>','',{full:1,req:1,ph:'VD: Other: hỗ trợ và nhận những việc ngoài giờ'})}
    ${inp('w','Trọng số (điểm)','',{type:'number',req:1,attrs:'min="0.5" max="100" step="any" inputmode="decimal"'})}${inp('freq','Tần suất đánh giá','Tháng')}
    ${sel('under','Vị trí',[['','Mục riêng ở cuối (B.'+(k.rows.filter(r=>r.no||r.w==null).length+1)+')'],...grps],'',{full:1})}
    <p class="note full" style="padding:0">Mục mới tính từ các việc nhân viên tạo trong mục, theo số lỗi (0 lỗi 100% · 1 lỗi 80% · 2 lỗi 60% · từ 3 lỗi 0%); sửa quy ước ở nút Sửa của mục.${sheetOf(e,y)&&sheetOf(e,y).kpi?'':` Năm ${esc(y)} đang dùng tạm danh mục năm trước; lưu sẽ tạo danh mục riêng cho năm ${esc(y)}.`}</p></div></form>`,{footer:cancelBtn+'<button class="btn primary" form="mf2">Thêm mục</button>'})};
SUB['kc-add-save']=form=>{if(!can('manage'))return;const {e,y}=form.dataset,d=fd(form),text=String(d.text||'').trim(),w=Number(String(d.w||'').replace(',','.'));
  if(!text)return toast('Nhập tên mục.','error');if(!(w>0&&w<=100))return toast('Trọng số từ 0 đến 100.','error');
  if(transact(()=>{const sh=sheetOf(e,y,true);if(!sh.kpi)sh.kpi=JSON.parse(JSON.stringify(kpiOf(e,y)||{sec:'KPI Công ty và hoạt động của phòng (KRI)',rows:[]}));
    const rows=sh.kpi.rows,taken=new Set(rows.map(r=>r.id)),id=kpiId(text,taken),row={id,no:'',text,w,...(String(d.freq||'').trim()?{freq:String(d.freq).trim()}:{})};
    if(d.under){let i=rows.findIndex(r=>r.id===d.under);if(i<0)throw new Error('Nhóm này không còn.');i++;while(i<rows.length&&!rows[i].no&&rows[i].w!=null)i++;rows.splice(i,0,row)}
    else{row.no=String(Math.max(0,...rows.map(r=>parseInt(r.no,10)||0))+1);rows.push(row)}
    sh.updatedAt=todayStr()}))done('Đã thêm mục Work B')};
/* Gắn chỉ tiêu KPI ngay trên bảng cho việc ở "Chưa phân loại": chọn trong ô rồi bấm Gắn. Đổi lựa chọn chưa lưu, vì Chrome / Edge trên Windows
   phát change ngay khi bấm phím mũi tên. Chỉ ghi task.kpi (không đổi điểm, không đụng trạng thái duyệt) nên nhân viên gắn được cả việc đã Duyệt;
   việc đã Duyệt mà đã có chỉ tiêu thì chỉ quản lý đổi (trong hộp Sửa việc). */
document.addEventListener('change',ev=>{const el=ev.target.closest&&ev.target.closest('select[data-kpi]');if(!el)return;const b=el.parentElement.querySelector('[data-act="kpi-set"]');if(b)b.disabled=!el.value});
ACT['kpi-set']=el=>{
  const s=el.parentElement.querySelector('select[data-kpi]'),v=s&&s.value;if(!v)return toast('Chọn mục Work B trước.','warn');
  const {e,y,mm,id}=el.dataset;if(!canSheet(e))return toast('Bạn không có quyền.','error');
  if(transact(()=>{const sh=sheetOf(e,y),t=sh&&by(sh.months[mm].tasks,id),k=kpiOf(e,y);
    if(!t||byMgr(t))throw new Error('Việc này không còn tồn tại.');
    if(!kpiHas(k,v))throw new Error('Chỉ tiêu này không còn trong danh mục.');
    if(kpiHas(k,t.kpi)&&!canTask(e,t))throw new Error('Việc đã được Duyệt và đã có chỉ tiêu KPI; nhờ quản lý đổi nếu cần.');
    t.kpi=v;sh.updatedAt=todayStr()})){ui.kjust=id;refreshTbl();toast('Đã gắn chỉ tiêu KPI');kpiJust()}else refreshTbl();
};
/* việc vừa gắn chỉ tiêu chuyển lên dòng chỉ tiêu của nó: cuộn tới, giữ con trỏ bàn phím ở dòng đó, hiện dấu "vừa chuyển" một lần */
function kpiJust(){const tr=$('tr.kj');ui.kjust='';if(!tr)return;const rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  tr.scrollIntoView({block:'center',behavior:rm?'auto':'smooth'});const b=tr.querySelector('td.act button');if(b)b.focus({preventScroll:true});else{tr.tabIndex=-1;tr.focus({preventScroll:true})}}
/* bấm ô "Việc chưa hoàn thành" / "Chờ quản lý duyệt": mở danh sách các việc đó trong năm và tô sáng trên bảng */
ACT.focus=el=>{const f=F(),v=el.dataset.v;f.focus=f.focus===v?'':v;refreshTbl();if(f.focus)setTimeout(()=>{const c=$('#focus-card');if(c){c.scrollIntoView({behavior:'smooth',block:'start'});c.focus({preventScroll:true})}},60)};
function focusCard(e,y,ys){
  const f=F().focus;if(!f)return'';
  const list=[];ys.months.forEach((m,i)=>m.rows.forEach(r=>{if(focusHit(f,r))list.push({mm:MM[i],...r})}));
  const ttl=f==='open'?'Việc chưa hoàn thành':'Việc chờ quản lý duyệt';
  return `<section class="card fcard" id="focus-card" tabindex="-1"><div class="hdr" style="align-items:center;margin-bottom:8px"><h4 style="margin:0">${ttl} – năm ${y} (${list.length})</h4><button class="btn sm" data-act="focus" data-v="${f}">Đóng</button></div>
    ${list.length?miniTable(['Tháng','Công việc','Deadline','Trạng thái',''],sortRows(list).map(r=>`<tr class="hl"><td><button type="button" class="lnk" data-act="setf" data-k="mm" data-v="${r.mm}">T${r.mm}</button></td><td>${tagBd(r.t)}${esc(r.t.title.split('\n')[0])}</td><td style="white-space:nowrap">${fmtDM(r.t.deadline,y)}</td><td>${stBd(r.t,r.sc,y)}${f==='pending'?' '+apBd(''):''}</td><td class="act">${canTask(e.id,r.t)?`<button class="btn sm" data-act="kt-edit" data-e="${e.id}" data-y="${y}" data-mm="${r.mm}" data-id="${r.t.id}">Sửa</button>`:''}</td></tr>`),'Không có việc nào.'):`<div class="note">${f==='open'?'Tất cả các việc đã hoàn thành.':'Không có việc nào đang chờ quản lý duyệt.'}</div>`}
    <p class="note">Các dòng này cũng được tô sáng trong bảng việc của từng tháng. Bấm Đóng để bỏ tô sáng.</p></section>`;
}

/* ---------- thêm / sửa / giao việc ---------- */
/* opt.assign: quản lý giao việc → đánh dấu By Manager; chọn 1 hoặc nhiều nhân viên (nhiều người = việc làm chung) và tháng ngay trong hộp thoại */
let MATE_OPTS={};
function taskForm(empId,y,mm,id,opt={}){
  const assign=!!opt.assign&&!id,sh=empId?sheetOf(empId,y):null,t=id?by(sh.months[mm].tasks,id):{title:'',weight:1,deadline:'',submitted:'',approval:'',note:'',...(opt.kpi?{kpi:opt.kpi}:{})};   /* Thêm việc từ một mục Work B: chọn sẵn mục đó */
  if(!t)return toast('Việc này không còn tồn tại.','error');
  if(assign&&!can('manage'))return toast('Chỉ quản lý được giao việc.','error');
  const ap=apOf(t),mg=can('manage'),legacy=!!id&&!wOk(+t.weight),nx=nextOf(y,mm),nxL=mLbl(nx.mm,nx.year,y),mv=!!id&&canSheet(empId)&&canCarry(t,scoreTask(t));
  if(!assign&&!canTask(empId,id?t:null))return toast(canSheet(empId)?'Việc đã được quản lý Duyệt, chỉ quản lý sửa được.':'Bạn không có quyền sửa việc này.','error');
  const g=grpOfT(t),glock=!mg&&!!(g&&g.locked),lock=!mg&&byMgr(t)||glock,c=mcOf(t),tg=tagsOf(t);
  const dlock=lock||(!mg&&!!id&&!!t.deadline);
  /* Khung 2: việc By User chọn chỉ tiêu KPI theo danh mục; bắt buộc với việc mới và khi nhân viên lưu (quản lý sửa việc cũ thì không bắt buộc) */
  const kc=!assign&&!byMgr(t)&&isV2(`${y}-${mm}`)&&empId?kpiOf(empId,y):null,kreq=kpiRows(kc).length>0&&(!mg||!id);
  const bmV2=(assign||byMgr(t))&&isV2(`${y}-${mm}`);   /* quy chế 80/20: việc quản lý giao tính điểm cố định, không cần trọng số */   /* deadline đã nhập thì nhân viên không đổi được nữa; cần dời thì nhờ quản lý */   /* việc By Manager / nhóm đã được duyệt: nhân viên không đổi nội dung, deadline */
  /* người làm chung: thành viên hiện có, người đang được mời, và danh sách để chọn thêm */
  const inGrp=g?[...g.members,...(g.invited||[])]:[],opts=assign?[]:dirEmps().filter(x=>x.id!==empId&&!inGrp.includes(x.id));
  MATE_OPTS={};opts.forEach(x=>{MATE_OPTS[`${x.name} · ${x.code}`]=x.id});
  const mateBlk=assign?'':`<div class="f full"><span>Người làm chung <small class="muted">(gõ tên hoặc mã NV rồi chọn trong danh sách)</small></span>
      <div class="mates" id="kt-mates">${g?[...g.members.filter(x=>x!==empId).map(x=>`<span class="chip">👥 ${esc(gName(g,x))}</span>`),...(g.invited||[]).map(x=>`<span class="chip wait">${esc(gName(g,x))} · chờ nhận</span>`)].join(''):''}<span id="kt-mates-new"></span></div>
      <input class="in" list="dl-emps" id="kt-mate-in" placeholder="VD: Tuấn hoặc S21401" autocomplete="off" aria-label="Thêm người làm chung"><datalist id="dl-emps">${Object.keys(MATE_OPTS).map(v=>`<option value="${esc(v)}"></option>`).join('')}</datalist><input type="hidden" name="mates" value="">
      <small class="muted">${mg?'Quản lý thêm người là vào việc ngay.':'Người được thêm sẽ nhận lời mời và tự bấm Nhận.'} Ngày hoàn thành do một người ghi được áp dụng cho cả nhóm; trọng số và duyệt tính riêng từng người.</small></div>`;
  const empPick=assign?`<div class="f full"><span>Giao cho nhân viên <i style="color:var(--bad);font-style:normal">*</i> <small class="muted">(chọn nhiều người = việc làm chung)</small></span><input class="in" id="as-q" placeholder="Lọc theo tên hoặc mã NV" autocomplete="off" aria-label="Lọc nhân viên"><div class="empck" id="as-list">${sortedEmps().filter(x=>x.active!==false||x.id===empId).map(x=>`<label class="chk" data-k="${esc(norm(x.name+' '+x.code))}"><input type="checkbox" name="emp_${x.id}" value="${x.id}" ${x.id===empId?'checked':''}> ${esc(x.name)} <small class="muted">${esc(x.code)}${x.dept?' · '+esc(x.dept):''}</small></label>`).join('')}</div></div>`:'';
  modal(assign?'Giao việc cho nhân viên':id?'Sửa việc':`Thêm việc tháng ${mm}/${y}`,`<form id="mf" data-submit="kt-save" data-e="${empId||''}" data-y="${y}" data-mm="${mm}" data-id="${id||''}" data-assign="${assign?1:''}"><div class="fg ktg">
    ${assign?`${empPick}${inp('ym','Tháng',`${y}-${mm}`,{type:'month',req:1,ph:'yyyy-mm'})}<p class="hint full">Việc được đánh dấu <b>By Manager</b>. Chọn nhiều người thì mỗi người có một bản việc riêng (tự chấm trọng số, duyệt riêng), Ngày hoàn thành do một người ghi áp dụng cho cả nhóm. Nhân viên không đổi được nội dung, deadline và không xoá được.</p>`:''}
    ${id&&(byMgr(t)||tg.length||g)?`<div class="f full"><div>${tagBd(t)}${grpBd(t,empId)}${byMgr(t)&&t.byName?`<small class="muted"> giao bởi ${esc(t.byName)}${t.byAt?' · '+fmtDate(t.byAt):''}</small>`:''}</div></div>`:''}
    ${glock?'<p class="hint full">Việc làm chung này đã được quản lý Duyệt cho một người trong nhóm nên nội dung, deadline và Ngày hoàn thành không đổi được nữa.</p>':''}
    ${mg?`<div class="f full"><span>Tag ${assign?'cho việc giao':''} <small class="muted">(nhân viên sẽ thấy trên việc của mình)</small></span><div class="tgs" role="group" aria-label="Tag">${Object.entries(TAGS).map(([k,l])=>`<label class="tgck ${k}"><input type="checkbox" name="tag_${k}" ${tg.includes(k)?'checked':''}> ${l}</label>`).join('')}</div></div>`:''}
    <label class="f full"><span>Nội dung công việc / Đóng góp <i style="color:var(--bad);font-style:normal">*</i></span><textarea class="in" name="title" rows="3" ${lock?'readonly':''}>${esc(t.title)}</textarea></label>
    ${kpiRows(kc).length?`<label class="f full"><span>Mục Work B${kreq?' <i style="color:var(--bad);font-style:normal">*</i>':''} <small class="muted">(việc thuộc mục nào trong khung Work B)</small></span>${kpiSel(kc,t.kpi,kreq?'required':'')}<small class="muted" id="kt-rule"></small></label>`:''}
    ${kpiRows(kc).length?`<input type="hidden" name="weight" value="${esc(wOk(+t.weight)?t.weight:(t.weight||1))}">`:bmV2?`<div class="f"><span>Điểm</span><div class="hint">Việc quản lý giao: ${kpi2().mgrMax} điểm chia đều cho số việc giao trong tháng (Khung 1), cộng khi được Duyệt; không dùng trọng số, không trừ khi trễ.</div><input type="hidden" name="weight" value="${esc(wOk(+t.weight)?t.weight:(t.weight||1))}"></div>`:inp('weight',`Trọng số – nhân viên tự chấm (${W_MIN}–${W_MAX})`,t.weight,{type:'number',step:legacy?'any':'1',req:1,attrs:legacy?'':`min="${W_MIN}" max="${W_MAX}" inputmode="numeric"`})}${mg?sel('approval','Quản lý duyệt',[['','Chờ duyệt'],[AP_VAL.ok,'Duyệt – tính điểm vào KPI'],[AP_VAL.recheck,'Re-check – không tính điểm']],AP_VAL[ap]):`<div class="f"><span>Quản lý duyệt</span><div>${apBd(ap)}</div></div>`}
    ${legacy?`<p class="hint full">Trọng số đang lưu là ${esc(t.weight)}, nằm ngoài thang ${W_MIN}–${W_MAX}. Có thể giữ nguyên; nếu sửa, hãy nhập số nguyên từ ${W_MIN} đến ${W_MAX}.</p>`:''}
    ${inp('deadline',dlock?'Deadline <small class="muted">🔒 đã khoá, cần dời thì nhờ quản lý</small>':`Deadline${!mg?' <small class="muted">(lưu xong sẽ khoá, không sửa được)</small>':''}`,t.deadline||'',{type:'date',attrs:dlock?'readonly aria-readonly="true"':''})}${inp('submitted',g?'Ngày hoàn thành <small class="muted">(áp dụng cho cả nhóm)</small>':'Ngày hoàn thành',t.submitted||'',{type:'date',attrs:glock?'readonly':''})}
    ${mateBlk}
    <div class="f full"><span>${kpiRows(kc).length?'Tình trạng':'Điểm (tự động tính)'}</span><div class="hint scp" id="kt-prev" aria-live="polite" ${kpiRows(kc).length?'data-err="1"':''}>–</div></div>
    ${txa('note','Ghi chú / Link bằng chứng <small class="muted">(nhân viên nhập)</small>',t.note||'',{full:1,rows:3})}
    ${evBlock(id?t:null,{edit:true,assign})}
    ${mg?`<label class="f full mcbox"><span>Comment by Manager <small class="muted">(nhân viên sẽ thấy${c&&c.done?' · nhân viên đã cập nhật sau comment này':''})</small></span><textarea class="in" name="mc" rows="3" maxlength="500" placeholder="Nhận xét / cần sửa, bổ sung gì…">${esc(c?c.text:'')}</textarea></label>`
      :`<div class="f full mcbox"><span>Comment by Manager</span><div class="mcro">${c?mcShow(c,y):'<span class="muted">Chưa có comment.</span>'}</div>${c&&!c.done&&ap==='recheck'?'<small class="muted">Cập nhật lại việc rồi bấm Lưu; việc quay về Chờ duyệt và comment được gạch đi.</small>':''}</div>`}
    <p class="note full" style="padding:0">${mv?`Việc chưa hoàn thành cần dời sang tháng sau: bấm <b>Chuyển sang ${nxL}</b> bên dưới${g?' (chỉ chuyển phần của người này)':''}.`:lock?'Nội dung và deadline do quản lý đặt.':'Điểm thành phần chỉ được tính vào KPI khi quản lý chọn Duyệt.'}</p></div></form>`,
    {footer:(id&&canDelTask(empId,t)?`<button class="btn danger" data-act="kt-del" data-e="${empId}" data-y="${y}" data-mm="${mm}" data-id="${id}" style="margin-right:auto">${g?'Rời việc làm chung':'Xoá việc'}</button>`:'')+(mv?`<button type="button" class="btn acc" id="kt-mv" data-act="kt-move-edit">Chuyển sang ${nxL}</button>`:'')+cancelBtn+`<button class="btn primary" form="mf">${assign?'Giao việc':'Lưu'}</button>`,size:'wide kt'});
  ktPreview();
}
/* chọn người làm chung: chọn đúng một dòng gợi ý là thêm vào danh sách */
function mateSync(){const h=$('#mf input[name=mates]'),box=$('#kt-mates-new');if(!h||!box)return;const ids=h.value?h.value.split(','):[];
  box.innerHTML=ids.map(x=>{const k=Object.keys(MATE_OPTS).find(v=>MATE_OPTS[v]===x)||x;return `<span class="chip new">＋ ${esc(k)} <button type="button" class="x" data-act="mate-x" data-id="${x}" aria-label="Bỏ ${esc(k)}">✕</button></span>`}).join('')}
document.addEventListener('input',e=>{
  if(e.target.id==='kt-mate-in'){const id=MATE_OPTS[e.target.value.trim()];if(!id)return;const h=$('#mf input[name=mates]'),ids=h.value?h.value.split(','):[];if(!ids.includes(id))ids.push(id);h.value=ids.join(',');e.target.value='';mateSync()}
  if(e.target.id==='as-q'){const q=norm(e.target.value);$$('#as-list label').forEach(l=>{l.hidden=!!q&&!l.dataset.k.includes(q)})}
});
ACT['mate-x']=el=>{const h=$('#mf input[name=mates]');if(!h)return;h.value=h.value.split(',').filter(x=>x&&x!==el.dataset.id).join(',');mateSync()};
function ktRead(form){const d=fd(form),w=String(d.weight??'').trim().replace(',','.');return{title:(d.title||'').trim(),weight:w===''?NaN:Number(w),deadline:d.deadline||null,submitted:d.submitted||null,approval:d.approval||'',note:(d.note||'').trim(),
  mc:(d.mc||'').trim(),tags:Object.keys(TAGS).filter(k=>d['tag_'+k]),emps:Object.keys(d).filter(k=>k.startsWith('emp_')).map(k=>d[k]),ym:d.ym,mates:(d.mates||'').split(',').filter(Boolean),kpi:d.kpi||''}}
function ktPreview(){const form=$('form[data-submit="kt-save"]'),el=$('#kt-prev');if(!form||!el)return;const d=ktRead(form),sc=scoreTask(d),mg=can('manage');
  if(el.dataset.err){   /* Work B: việc không chấm điểm riêng, chỉ báo có thành 1 lỗi của mục hay không */
    el.innerHTML=!d.deadline?'Nhập deadline.':sc.state==='overdue'?`<b class="tag-bad">Quá hạn ${sc.overdue} ngày chưa hoàn thành → 1 lỗi của mục</b>`:!d.submitted?'Chưa hoàn thành, còn trong hạn.':sc.late>0?`<b class="tag-bad">Hoàn thành trễ ${sc.late} ngày → 1 lỗi của mục</b>`:'<b class="pos">Đúng hạn – không tính lỗi</b>'+(sc.ap==='recheck'?' · đang Re-check → 1 lỗi':'');
    const b=$('#kt-mv');if(b){b.disabled=!!d.submitted;b.title=d.submitted?'Việc đã có Ngày hoàn thành nên không chuyển tháng':'Lưu việc rồi chuyển sang tháng sau'}return}
  el.innerHTML=sc.comp==null?esc(sc.state==='overdue'?`Chưa hoàn thành · quá hạn ${sc.overdue} ngày`:'Nhập đủ Deadline và Ngày hoàn thành để tính điểm.')
    :`<span>Điểm cơ bản <b>${fmtK(sc.base)}</b></span><span>Điểm thưởng (tự động) <b>${fmtK(sc.bonus)}</b></span><span>Điểm thành phần <b>${fmtK2(sc.comp)}</b></span><small>${sc.late>0?'Trễ '+sc.late+' ngày':sc.late<0?'Sớm '+(-sc.late)+' ngày làm việc':'Đúng hạn'+(d.submitted<d.deadline&&offDay(d.deadline)?` (deadline ${fmtDM(d.deadline,d.deadline.slice(0,4))} là ${offDay(d.deadline)}, ngày nghỉ: chỉ tính sớm theo ngày làm việc nên chưa có điểm thưởng)`:'')} · (${fmtK(sc.base)} × ${fmtK(sc.w)} + ${fmtK(sc.bonus)}) / 100${mg?' · '+CP_TIP[sc.ap]:''}</small>`;
  const b=$('#kt-mv');if(b){b.disabled=!!d.submitted;b.title=d.submitted?'Việc đã có Ngày hoàn thành nên không chuyển tháng':'Lưu việc rồi chuyển sang tháng sau'}
  const ks=form.querySelector('select[name=kpi]'),kr=$('#kt-rule');if(ks&&kr){const row=kpiRows(kpiOf(form.dataset.e,form.dataset.y)).find(x=>x.id===ks.value);kr.textContent=row&&row.rule?'Quy ước đánh giá trong file Excel (để tham khảo, không đổi cách tính điểm của việc): '+row.rule:''}}
document.addEventListener('input',e=>{if(e.target.closest&&e.target.closest('form[data-submit="kt-save"]'))ktPreview()});
document.addEventListener('change',e=>{if(e.target.closest&&e.target.closest('form[data-submit="kt-save"]'))ktPreview()});
/* xem Ghi chú / Link bằng chứng của một việc (cột chỉ hiện icon 📄) */
ACT['note-view']=el=>{const {e,y,mm,id}=el.dataset,sh=sheetOf(e,y),t=sh&&by(sh.months[mm].tasks,id);if(!t)return toast('Việc này không còn tồn tại.','error');
  modal('Ghi chú / Link bằng chứng',`<p class="muted" style="margin:0 0 6px">${esc(empName(e))} · T${mm}/${y}</p><p style="margin:0 0 12px"><b>${esc(t.title.split('\n')[0])}</b></p><div class="ntv">${t.note?linkify(t.note):'<span class="muted">Chưa có ghi chú.</span>'}</div>${filesOf(t).length?`<p style="margin:14px 0 6px"><b>File bằng chứng (${filesOf(t).length})</b></p><div class="evl">${evList(t,false)}</div>`:''}${mcOf(t)?`<p style="margin:14px 0 4px"><b>Comment by Manager</b></p>${mcShow(mcOf(t),y)}`:''}`,{footer:`${canTask(e,t)?`<button class="btn" data-act="kt-edit" data-e="${e}" data-y="${y}" data-mm="${mm}" data-id="${id}">Sửa việc</button>`:''}<button class="btn primary" data-act="close">Đóng</button>`})};
ACT['kt-new']=el=>canSheet(el.dataset.e)&&taskForm(el.dataset.e,el.dataset.y,el.dataset.mm,null,{kpi:el.dataset.k||''});
ACT['kt-edit']=el=>taskForm(el.dataset.e,el.dataset.y,el.dataset.mm,el.dataset.id);
/* Giao việc: mở từ trang nhân viên (đã biết nhân viên, tháng) hoặc từ danh sách nhân viên (chọn trong hộp thoại) */
ACT['kt-assign']=el=>{if(!can('manage'))return toast('Chỉ quản lý được giao việc.','error');const d=el.dataset;taskForm(d.e||'',d.y||curYear(),MM.includes(d.mm)?d.mm:curMonth(),null,{assign:true})};
const mcNew=text=>({text,by:session?.name||'Quản lý',at:todayStr(),done:false});
/* Lưu việc trong hộp Thêm / Sửa / Giao việc. Trả về {e,y,mm,id,n} của việc, hoặc null khi không lưu được. */
function ktSave(form){
  const ds=form.dataset,d=ktRead(form),mg=can('manage'),assign=!!ds.assign,fail=m=>{toast(m,'error');return null};
  let e=ds.e,y=ds.y,mm=ds.mm,targets=[];const id=ds.id;
  if(assign){
    if(!mg)return fail('Chỉ quản lý được giao việc.');
    targets=d.emps.filter(x=>empOf(x));if(!targets.length)return fail('Chọn ít nhất một nhân viên được giao việc.');
    const m=/^(\d{4})-(\d{2})$/.exec(d.ym||'');if(!m||!MM.includes(m[2]))return fail('Chọn tháng giao việc.');
    e=targets[0];y=m[1];mm=m[2];
  }
  const cur=id?by((sheetOf(e,y)||{months:{[mm]:{tasks:[]}}}).months[mm].tasks,id):null,g0=grpOfT(cur);
  if(id&&!cur)return fail('Việc này không còn tồn tại. Hãy đóng hộp thoại và thử lại.');
  if(!assign&&!canTask(e,cur))return fail('Bạn không có quyền sửa việc này.');
  if(!mg&&byMgr(cur)){d.title=cur.title;d.deadline=cur.deadline||null}
  if(!mg&&cur&&cur.deadline)d.deadline=cur.deadline;   /* deadline đã khoá với nhân viên */
  if(!mg&&g0&&g0.locked){d.title=g0.title||cur.title;d.submitted=g0.submitted||null;if(!cur.carriedFrom)d.deadline=g0.deadline||null}
  if(!d.title)return fail('Nhập nội dung công việc.');
  /* Khung 2: chỉ tiêu KPI bắt buộc với việc mới và khi nhân viên lưu; để trống thì giữ nguyên chỉ tiêu đang gắn (không xoá id cũ) */
  const kc=!assign&&!byMgr(cur)&&isV2(`${y}-${mm}`)?kpiOf(e,y):null;
  if(!kpiHas(kc,d.kpi))d.kpi='';
  if(kpiRows(kc).length&&!d.kpi&&(!mg||!id))return fail('Chọn mục Work B cho việc này.');
  if(!(cur&&d.weight===+cur.weight)&&!wOk(d.weight))return fail(`Trọng số là số nguyên từ ${W_MIN} đến ${W_MAX}.`);
  if(mg&&apOf(d)==='ok'&&!(d.deadline&&d.submitted))return fail('Việc chưa có Deadline và Ngày hoàn thành nên chưa có điểm để Duyệt.');
  let tid=id,added=0,addedIds=[],gRef=null;const prevAp=cur?apOf(cur):'',prevMc=mcOf(cur)?mcOf(cur).text:'';
  const ok=transact(()=>{
    const fill=t=>{Object.assign(t,{title:d.title,weight:d.weight,deadline:d.deadline,submitted:d.submitted,note:d.note});delete t.bonusManual;if(d.kpi)t.kpi=d.kpi;
      if(mg){
        t.approval=d.approval;if(d.tags.length)t.tags=d.tags;else delete t.tags;
        /* Comment by Manager: quản lý ghi bất cứ lúc nào; sửa nội dung = comment mới; xoá trống = bỏ comment */
        const c=mcOf(t);if(d.mc){if(!c||c.text!==d.mc)t.mgrComment=mcNew(d.mc)}else if(c)delete t.mgrComment;
      }else{if(apOf(t)==='recheck'&&t.mgrComment)t.mgrComment.done=true;t.approval=''}};   /* nhân viên cập nhật lại việc Re-check → về Chờ duyệt, comment của quản lý mờ và gạch đi */
    if(assign){
      /* giao cho nhiều người: mỗi người một bản việc, cùng một nhóm làm chung */
      const g=targets.length>1?newGroup({title:d.title,deadline:d.deadline,submitted:d.submitted,members:targets,y,mm,by:'manager'}):null;
      targets.forEach((x,i)=>{const sh=sheetOf(x,y,true),t={id:uid('t'),by:'manager',byName:session?.name||'',byAt:todayStr()};fill(t);if(g)t.gid=g.id;sh.months[mm].tasks.push(t);sh.updatedAt=todayStr();if(!i)tid=t.id});
    }else{
      const sh=sheetOf(e,y,true),list=sh.months[mm].tasks;let t=id?by(list,id):null;if(!t){t={id:uid('t')};list.push(t);tid=t.id}
      fill(t);
      let g=grpOfT(t);
      if(g){g.title=t.title;if(!t.carriedFrom)g.deadline=t.deadline||null;
        if((g.submitted||null)!==(t.submitted||null)){g.submitted=t.submitted||null;g.doneBy=t.submitted?{empId:e,name:nameOf(e)||session?.name||'',at:todayStr()}:null}}
      /* thêm người làm chung */
      const add=d.mates.filter(x=>x!==e&&!(g&&(g.members.includes(x)||(g.invited||[]).includes(x))));
      if(add.length){
        if(!g){g=newGroup({title:t.title,deadline:t.deadline,submitted:t.submitted,members:[e],y,mm,by:byMgr(t)?'manager':''});t.gid=g.id;if(t.submitted)g.doneBy={empId:e,name:nameOf(e),at:todayStr()}}
        add.forEach(x=>{g.names[x]=nameOf(x);g.declined=(g.declined||[]).filter(z=>z!==x);
          if(mg){g.members.push(x);grpCopy(g,x,t)}                                                   /* quản lý thêm: vào việc ngay */
          else{g.invited.push(x);g.invitedBy[x]={empId:e,name:nameOf(e)||session?.name||'',at:todayStr()}}});   /* nhân viên thêm: gửi lời mời */
        added=add.length;addedIds=add;gRef=g;
      }
      sh.updatedAt=todayStr();
    }
    relockGroups();hydrateGroups();
  });
  if(ok){   /* thông báo */
    const nm=nameOf(e)||session?.name||'';
    if(assign)targets.forEach(x=>notifyEmp(x,{ic:'📌',title:`Việc mới được giao: ${tShort(d)}`,body:`T${mm}/${y}${d.deadline?' · deadline '+fmtDate(d.deadline):''}${d.tags.length?' · '+d.tags.map(k=>TAGS[k]).join(' '):''}${targets.length>1?` · làm chung ${targets.length} người`:''}`,e:x,y,mm}));
    else if(mg){
      const na=apOf(d);if(na!==prevAp)apNotify(e,y,mm,d,na,na==='recheck'?d.mc:'');else if(d.mc&&d.mc!==prevMc)notifyEmp(e,{ic:'💬',title:'Comment by Manager',body:`${tShort(d)}: ${d.mc}`,e,y,mm});
      addedIds.forEach(x=>notifyEmp(x,{ic:'👥',title:'Bạn được thêm vào việc làm chung',body:`${tShort(d)} · T${gRef.mm}/${gRef.year}`,e:x,y:gRef.year,mm:gRef.mm}));
    }else{
      if(prevAp==='recheck')notify('mgr',{ic:'🔁',title:`${nm} đã cập nhật việc Re-check`,body:tShort(d),e,y,mm});
      addedIds.forEach(x=>notifyEmp(x,{ic:'📨',title:`${nm} mời bạn làm chung một việc`,body:`${tShort(d)} · T${gRef.mm}/${gRef.year} · vào trang KPI của bạn để Nhận`,e:x,y:gRef.year,mm:gRef.mm}));
    }
  }
  return ok?{e,y,mm,id:tid,n:targets.length,added}:null;
}
/* thông báo cho nhân viên khi quản lý Duyệt / Re-check một việc */
function apNotify(e,y,mm,t,val,comment){
  if(val==='ok')notifyEmp(e,{ic:'✅',title:'Việc được Duyệt',body:`${tShort(t)} · điểm được tính vào KPI`,e,y,mm});
  else if(val==='recheck')notifyEmp(e,{ic:'⚠️',title:'Việc cần Re-check',body:`${tShort(t)}${comment?' · '+comment:' · xem Comment by Manager'}`,e,y,mm});
}
SUB['kt-save']=form=>{const id=form.dataset.id,assign=!!form.dataset.assign,mg=can('manage'),r=ktSave(form);if(!r)return;
  done(assign?(r.n>1?`Đã giao việc làm chung cho ${r.n} nhân viên · T${r.mm}/${r.y}`:`Đã giao việc cho ${empName(r.e)} · T${r.mm}/${r.y}`)
    :(id?'Đã lưu việc':'Đã thêm việc')+(r.added?(mg?` · đã thêm ${r.added} người làm chung`:` · đã gửi lời mời cho ${r.added} người`):''))};
/* Lời mời làm chung: người được mời tự bấm Nhận (bản việc vào bảng KPI của mình) hoặc Từ chối */
const myInvites=eid=>(db.groups||[]).filter(g=>(g.invited||[]).includes(eid));
ACT['grp-accept']=el=>{
  const g=grpOf(el.dataset.g),me=el.dataset.e;if(!g||!(g.invited||[]).includes(me))return toast('Lời mời này không còn hiệu lực.','warn');
  if(!canSheet(me))return toast('Bạn không có quyền.','error');
  let t=null;
  if(!transact(()=>{g.invited=g.invited.filter(x=>x!==me);if(!g.members.includes(me))g.members.push(me);g.names[me]=nameOf(me)||g.names[me]||session?.name||'';t=grpCopy(g,me,null);hydrateGroups()}))return;
  {const iv=g.invitedBy&&g.invitedBy[me];if(iv&&iv.empId)notifyEmp(iv.empId,{ic:'👥',title:`${g.names[me]||'Đồng nghiệp'} đã nhận làm chung`,body:String(g.title||'').split('\n')[0],e:iv.empId,y:g.year,mm:g.mm})}
  const k=location.hash.slice(2);(ui.f[k]??={}).year=String(g.year);ui.f[k].mm=g.mm;rerender();
  toast('Đã nhận việc làm chung. Hãy tự chấm trọng số cho phần việc của bạn.');taskForm(me,g.year,g.mm,t.id);
};
ACT['grp-decline']=el=>{
  const g=grpOf(el.dataset.g),me=el.dataset.e;if(!g||!(g.invited||[]).includes(me))return;
  if(!confirm(`Từ chối làm chung việc “${String(g.title||'').split('\n')[0]}”?`))return;
  if(transact(()=>{g.invited=g.invited.filter(x=>x!==me);(g.declined||(g.declined=[])).push(me)})){rerender();toast('Đã từ chối lời mời');const iv=g.invitedBy&&g.invitedBy[me];if(iv&&iv.empId)notifyEmp(iv.empId,{ic:'👥',title:`${gName(g,me)} đã từ chối làm chung`,body:String(g.title||'').split('\n')[0],e:iv.empId,y:g.year,mm:g.mm})}
};
ACT['kt-del']=el=>{const {e,y,mm,id}=el.dataset;if(!canDelTask(e,by((sheetOf(e,y)||{months:{[mm]:{tasks:[]}}}).months[mm].tasks,id)))return toast('Việc đã có ngày hoàn thành hoặc đã được quản lý phản hồi, chỉ quản lý xoá được.','error');if(!confirm(grpOfT(by(sheetOf(e,y).months[mm].tasks,id))?'Rời việc làm chung này? Phần việc của bạn sẽ bị xoá khỏi bảng KPI; những người khác vẫn giữ việc.':'Xoá việc này? Việc sẽ không còn tính vào KPI của tháng.'))return;
  if(transact(()=>{const sh=sheetOf(e,y),t=by(sh.months[mm].tasks,id),g=grpOfT(t);sh.months[mm].tasks=sh.months[mm].tasks.filter(t=>t.id!==id);sh.updatedAt=todayStr();
    /* rời việc làm chung khi không còn bản việc nào của người này trong nhóm */
    if(g&&!db.sheets.some(s=>s.empId===e&&MM.some(m=>s.months[m].tasks.some(x=>x.gid===g.id&&!x.movedTo))))g.members=g.members.filter(x=>x!==e);relockGroups()}))done('Đã xoá việc')};
SUB['cmt-save']=form=>{if(!can('manage'))return toast('Chỉ quản lý được nhận xét.','error');const {e,y,mm}=form.dataset,v=fd(form).comment.trim();
  if(transact(()=>{const sh=sheetOf(e,y,true);sh.months[mm].comment=v;sh.updatedAt=todayStr()})){rerender();toast('Đã lưu nhận xét');if(v)notifyEmp(e,{ic:'📝',title:`Nhận xét của quản lý tháng ${mm}/${y}`,body:v,e,y,mm})}};

/* ---------- quản lý duyệt: Duyệt → điểm được tính · Re-check → không tính điểm, báo đỏ ---------- */
function setApproval(e,y,mm,ids,val){
  if(!can('manage')){toast('Chỉ quản lý được duyệt.','error');return 0}
  let n=0;
  const ok=transact(()=>{const sh=sheetOf(e,y);if(!sh)throw new Error('Không tìm thấy bảng KPI.');
    sh.months[mm].tasks.forEach(t=>{if(!ids.includes(t.id))return;
      if(val==='ok'&&scoreTask(t).comp==null)throw new Error('Việc chưa có Deadline và Ngày hoàn thành nên chưa có điểm để Duyệt.');
      t.approval=AP_VAL[val]||'';n++});
    if(!n)throw new Error('Việc này không còn tồn tại.');
    sh.updatedAt=todayStr();relockGroups()});
  if(ok){const sh=sheetOf(e,y);ids.forEach(id=>{const t=sh&&by(sh.months[mm].tasks,id);if(t)apNotify(e,y,mm,t,val,'')})}
  return ok?n:0;
}
document.addEventListener('change',ev=>{
  const el=ev.target.closest&&ev.target.closest('select[data-appr]');if(!el)return;
  const {e,y,mm,id}=el.dataset,v=el.value,n=setApproval(e,y,mm,[id],v);
  refreshTbl();
  /* chọn Re-check → ô Comment by Manager hiện ra ở cuối dòng, con trỏ nhảy vào đó */
  (v==='recheck'&&n?document.querySelector(`form.mcf[data-id="${id}"] textarea`):document.querySelector(`select[data-appr][data-id="${id}"]`))?.focus({preventScroll:v!=='recheck'});
  if(n)toast(v==='ok'?'Đã duyệt: điểm được tính vào KPI':v==='recheck'?'Re-check: không tính điểm. Ghi Comment by Manager để nhân viên biết cần sửa gì.':'Đã đưa việc về Chờ duyệt',v==='recheck'?'warn':'ok');
});
/* Lưu Comment by Manager của một việc đang Re-check. Trả về true khi có thay đổi. */
function mcSave(e,y,mm,id,text){
  if(!can('manage')){toast('Chỉ quản lý được ghi Comment by Manager.','error');return false}
  text=String(text||'').trim();let changed=false;
  const ok=transact(()=>{const sh=sheetOf(e,y),t=sh&&by(sh.months[mm].tasks,id);if(!t)throw new Error('Việc này không còn tồn tại.');
    if(apOf(t)!=='recheck')throw new Error('Chỉ ghi Comment by Manager khi việc đang Re-check.');
    const c=mcOf(t);if(text){if(!c||c.done||c.text!==text){t.mgrComment=mcNew(text);changed=true}}else if(c&&!c.done){delete t.mgrComment;changed=true}
    if(changed)sh.updatedAt=todayStr()});
  if(ok&&changed&&text){const t=by(sheetOf(e,y).months[mm].tasks,id);notifyEmp(e,{ic:'💬',title:'Comment by Manager',body:`${tShort(t)}: ${text}`,e,y,mm})}
  return ok&&changed;
}
SUB['mc-save']=form=>{const {e,y,mm,id}=form.dataset;if(mcSave(e,y,mm,id,fd(form).mc))toast('Đã lưu Comment by Manager');refreshTbl()};
/* rời ô là tự lưu (không vẽ lại bảng để không mất chỗ đang gõ) */
document.addEventListener('change',ev=>{const el=ev.target.closest&&ev.target.closest('textarea[data-mc]');if(!el)return;const {e,y,mm,id}=el.form.dataset;if(mcSave(e,y,mm,id,el.value))toast('Đã lưu Comment by Manager')});
/* Duyệt hàng loạt các việc đang chờ duyệt: một tháng (data-mm), cả năm của một nhân viên (data-e), hoặc mọi nhân viên trong phạm vi (data-dept) */
ACT['ap-all']=el=>{
  if(!can('manage'))return toast('Chỉ quản lý được duyệt.','error');
  const {e,y,mm,dept}=el.dataset,plan=[];let n=0;
  const sheets=e?[sheetOf(e,y)].filter(Boolean):db.sheets.filter(s=>{const x=empOf(s.empId);return +s.year===+y&&x&&(!dept||x.dept===dept)});
  sheets.forEach(s=>(mm?[mm]:MM).forEach(m=>{const ids=s.months[m].tasks.filter(t=>{const sc=scoreTask(t);return sc.comp!=null&&sc.ap===''}).map(t=>t.id);if(ids.length){plan.push([s.id,m,ids]);n+=ids.length}}));
  if(!n)return toast('Không có việc nào đang chờ duyệt.','warn');
  const who=e?empName(e):`${new Set(plan.map(p=>p[0])).size} nhân viên${dept?' nhóm '+dept:''}`;
  if(!confirm(`Duyệt ${n} việc đang chờ duyệt của ${who}${mm?` trong tháng ${mm}/${y}`:` trong năm ${y}`}?\nĐiểm thành phần của các việc này sẽ được tính vào KPI. Việc Re-check không bị thay đổi.`))return;
  if(transact(()=>{plan.forEach(([sid,m,ids])=>{const s=by(db.sheets,sid);s.months[m].tasks.forEach(t=>{if(ids.includes(t.id))t.approval=AP_VAL.ok});s.updatedAt=todayStr()});relockGroups()})){
    const per={};plan.forEach(([sid,m,ids])=>{const s=by(db.sheets,sid),k=s.empId+'|'+m;(per[k]??={e:s.empId,m,n:0}).n+=ids.length});
    Object.values(per).forEach(x=>notifyEmp(x.e,{ic:'✅',title:`Quản lý đã duyệt ${x.n} việc của bạn`,body:`Tháng ${x.m}/${y} · điểm được tính vào KPI`,e:x.e,y,mm:x.m}));rerender();toast(`Đã duyệt ${n} việc`)}
};

/* ---------- chuyển việc chưa hoàn thành sang tháng sau (mở từ hộp Sửa việc) ---------- */
ACT['kt-move-edit']=()=>{
  const form=$('form[data-submit="kt-save"]');if(!form)return;
  if(form.reportValidity&&!form.reportValidity())return;
  const r=ktSave(form);if(!r)return;
  rerender();ACT['kt-move']({dataset:r});
};
ACT['kt-move']=el=>{
  const {e,y,mm,id}=el.dataset,sh=sheetOf(e,y);if(!sh)return;
  if(!canSheet(e))return toast('Bạn không có quyền chuyển việc này.','error');
  const list=sh.months[mm].tasks.filter(t=>(id?t.id===id:true)&&canCarry(t,scoreTask(t)));
  if(!list.length){closeModal();return toast('Việc đã có Ngày hoàn thành hoặc đã được chuyển nên không chuyển tháng được.','warn')}
  const nx=nextOf(y,mm),n2=nextOf(nx.year,nx.mm),lastDay=isoOf(dayNum(`${n2.year}-${n2.mm}-01`)-1);
  modal(`Chuyển ${list.length} việc sang T${nx.mm}/${nx.year}`,`<form id="mf" data-submit="kt-move-do" data-e="${e}" data-y="${y}" data-mm="${mm}" data-ids="${list.map(t=>t.id).join(',')}">
    <ul class="mvl">${list.map(t=>`<li><b>${esc(t.title.split('\n')[0])}</b> <span class="muted">· ${esc(empName(e))} · trọng số ${fmtK(+t.weight||0)}${t.deadline?' · deadline '+fmtDM(t.deadline,y):' · chưa đặt hạn'}</span></li>`).join('')}</ul>
    ${can('manage')?`<div class="f"><span>Deadline ở tháng mới</span>
      <label class="chk"><input type="radio" name="dl" value="keep" checked> Giữ deadline gốc. Ngày trễ tiếp tục được tính theo quy chế.</label>
      <label class="chk"><input type="radio" name="dl" value="new"> Dời deadline (quản lý phê duyệt): <input class="in" type="date" name="nd" value="${lastDay}" style="width:auto" aria-label="Deadline mới" onfocus="this.form.dl.value='new'"></label></div>`
      :'<input type="hidden" name="dl" value="keep"><p class="hint">Deadline gốc được giữ nguyên, ngày trễ tiếp tục được tính. Muốn dời deadline, hãy nhờ quản lý chuyển việc này.</p>'}
    <p class="note">Việc đã được lưu. Khi chuyển, việc được ghi vào T${nx.mm}/${nx.year} và chấm điểm ở đó. Tháng ${mm} giữ lại một dòng “Đã chuyển”, không tính trọng số và điểm, có nút Hoàn tác. Nhãn By Manager và tag được giữ nguyên.${list.some(t=>t.gid)?' Việc làm chung: chỉ chuyển phần của người này, những người khác giữ nguyên tháng.':''}</p></form>`,
    {footer:cancelBtn+`<button class="btn primary" form="mf">Chuyển sang T${nx.mm}/${nx.year}</button>`});
};
SUB['kt-move-do']=form=>{
  const {e,y,mm,ids}=form.dataset,d=fd(form);
  if(!canSheet(e))return toast('Bạn không có quyền chuyển việc này.','error');
  if(!can('manage'))d.dl='keep';
  if(d.dl==='new'&&!d.nd)return toast('Chọn deadline mới, hoặc giữ deadline gốc.','error');
  const r=moveTasks(e,y,mm,ids.split(','),d.dl==='new'?d.nd:null);
  if(r)done(`Đã chuyển ${r.n} việc sang T${r.nx.mm}/${r.nx.year}`);
};
ACT['kt-undo']=el=>{const {e,y,mm,id}=el.dataset;if(!canSheet(e))return toast('Bạn không có quyền.','error');if(undoMove(e,y,mm,id)){rerender();toast(`Đã đưa việc về lại T${mm}`)}};

/* ---------- phiếu đánh giá KPI tháng (in / PDF) ---------- */
function slipHTML(empId,y,mm){
  const e=empOf(empId),sh=sheetOf(empId,y),kc=kpiOf(empId,y),st=monthStats(sh&&sh.months[mm],`${y}-${mm}`,kc),c=db.company||{},g=gradeOf(st.kpi),P=kpi2();
  return `<div class="slip wide"><div class="sh"><div class="co"><b>${esc(c.name||'')}</b><div>${esc(c.note||'')}</div></div><div style="text-align:right">Ngày in: ${fmtDate(todayStr())}<br>KPI khống chế: 0 – ${KPI_CAP}</div></div>
    <h2>PHIẾU ĐÁNH GIÁ KPI</h2><div class="sub">Tháng ${mm} / ${y}</div>
    <div class="mt"><div>Họ và tên: <b>${esc(e.name)}</b></div><div>Mã NV: <b>${esc(e.code)}</b></div><div>Nhóm: <b>${esc(e.dept||'—')}</b></div><div>Chức danh: <b>${esc(e.title||'—')}</b></div></div>
    <table><thead><tr><th>STT</th><th>Nội dung công việc / Đóng góp</th><th>Trọng số</th><th>Deadline</th><th>Ngày hoàn thành</th><th>Ngày trễ</th><th>Điểm cơ bản</th><th>Điểm thưởng</th><th>Điểm thành phần</th><th>Quản lý duyệt</th><th>Ghi chú</th></tr></thead><tbody>
    ${sortRows(st.rows).map((r,i)=>`<tr${r.sc.ap==='recheck'&&r.sc.state!=='moved'?' style="background:#fdecea"':''}><td style="text-align:center">${i+1}</td><td style="white-space:pre-line">${tagText(r.t)?`<i>[${esc(tagText(r.t))}]</i> `:''}${esc(r.t.title)}</td><td style="text-align:right">${fmtK(r.sc.w)}</td><td>${fmtDate(r.t.deadline)}</td><td>${r.sc.state==='moved'?'Đã chuyển '+mLbl(r.t.movedTo.month,r.t.movedTo.year,y):fmtDate(r.t.submitted)}</td><td style="text-align:right">${r.sc.late??''}</td><td style="text-align:right">${r.sc.base??''}</td><td style="text-align:right">${r.sc.bonus??''}</td><td style="text-align:right">${r.sc.comp==null?'':r.sc.counted?`<b>${fmtK2(r.sc.comp)}</b>`:`<span style="color:#888">${fmtK2(r.sc.comp)}</span>`}</td><td>${r.sc.state!=='moved'&&(r.sc.comp!=null||r.sc.ap)?AP[r.sc.ap][1]:''}</td><td style="white-space:pre-line">${esc(r.t.note||'')}${filesOf(r.t).length?`${r.t.note?'\n':''}📎 ${filesOf(r.t).map(f=>esc(f.name)).join(', ')}`:''}${mcOf(r.t)&&!mcOf(r.t).done?`${r.t.note?'\n':''}<b>Comment by Manager:</b> ${esc(mcOf(r.t).text)}`:''}</td></tr>`).join('')}
    <tr><td colspan="2"><b>KPI THÁNG</b></td><td style="text-align:right"><b>${fmtK(st.weight)}</b></td><td colspan="5"></td><td style="text-align:right"><b>${fmtK2(st.kpi)}</b></td><td colspan="2"><b>${g?g[2]:''}</b>${st.pending?` · ${st.pending} việc chờ duyệt`:''}${st.recheck?` · ${st.recheck} việc Re-check`:''}</td></tr></tbody></table>
    ${st.fixed?`<table style="margin-top:8px;width:auto"><tr><td><b>Điểm chốt từ file Excel</b></td><td>Work A (mục II): <b>${fmtK2(st.fixed.k1)}</b> · Work B KRI (mục I): <b>${fmtK2(st.fixed.k2)}</b> · Work C thưởng (mục III): <b>${fmtK2(st.fixed.k3)}</b> · Tổng: <b>${fmtK2(st.kpi)}</b> · Xếp loại <b>${g?g[2]:''}</b></td></tr></table>`:''}
    ${st.v2?`${st.kri&&st.kri.length?`<table style="margin-top:8px"><thead><tr><th>STT</th><th>Work B · Chỉ tiêu</th><th>Mục tiêu</th><th>Tần suất</th><th>Trọng số</th><th>Kết quả tháng</th><th>% đạt</th><th>Điểm</th></tr></thead><tbody>
      ${(kc.rows||[]).map(r=>{const o=st.kri.find(z=>z.row.id===r.id);return o?`<tr><td style="text-align:center">${esc(wbCode(kc,r.id))}</td><td style="white-space:pre-line">${esc(r.text)}</td><td>${esc(r.tgt??'')} ${esc(r.unit||'')}</td><td>${esc(r.freq||'')}</td><td style="text-align:right">${fmtK(o.w)}</td><td>${o.src==='tasks'?`${o.n} việc · ${o.err} lỗi`:esc(o.res)}</td><td style="text-align:right">${pctTxt(o.pct)}</td><td style="text-align:right"><b>${fmtK2(o.score)}</b></td></tr>`:`<tr><td style="text-align:center"><b>${esc(r.no||'')}</b></td><td colspan="7"><b>${esc(kpiLabel(r.text))}</b></td></tr>`}).join('')}</tbody></table>`:''}
      <table style="margin-top:8px;width:auto"><tr><td><b>Work A · Quản lý giao &amp; Tuân thủ</b></td><td style="text-align:right"><b>${fmtK(st.p20)}</b> / ${P.mgrMax+P.compMax}</td><td>Việc quản lý giao: ${st.bmOk}/${st.bmN} việc Duyệt × ${fmtK2(st.bmPer||0)} = ${fmtK(st.pMgr)} / ${P.mgrMax} · Tuân thủ: ${fmtK(st.pComp)} / ${P.compMax} (đi trễ ${st.lateList.length} lần${st.lateList.length?': '+st.lateList.map(x=>fmtDate(x.d).slice(0,5)).join(', '):''}; lỗi NC ${st.ncList.length})</td></tr>
      <tr><td><b>Work B · By User (KRI)</b></td><td style="text-align:right"><b>${fmtK2(st.p80)}</b></td><td>${st.kri&&st.kri.length?'Tổng điểm các chỉ tiêu KRI ở bảng trên':'Chưa có danh mục KRI: tổng điểm thành phần các việc By User đã Duyệt'}</td></tr>
      <tr><td><b>Work C · Điểm thưởng</b></td><td style="text-align:right"><b>${fmtK(st.p3)}</b> / ${P.gaMax+P.mocMax}</td><td>Hỗ trợ việc phát sinh ${st.gaList.length} lần = ${fmtK(st.pGa)} · Sáng kiến MOC ${st.mocList.length} = ${fmtK(st.pMoc)}</td></tr>
      <tr><td><b>KPI tháng</b></td><td style="text-align:right"><b>${fmtK2(st.kpi)}</b></td><td>Work A + Work B + Work C, khống chế 0 – ${KPI_CAP} · Xếp loại <b>${g?g[2]:''}</b></td></tr></table>`:''}
    <div class="keep"><p style="margin-top:10px;white-space:pre-line"><b>Nhận xét của quản lý:</b> ${esc((sh&&sh.months[mm].comment)||'')}</p>
    <p class="sn">Trọng số do nhân viên tự chấm, thang ${W_MIN}–${W_MAX} · Trễ 1 ngày −${LATE_PENALTY} điểm (ngày lịch) · Sớm 1 ngày làm việc +${BONUS_PER_DAY} điểm thưởng (tối đa ${BONUS_CAP}) · Điểm thành phần = (Điểm cơ bản × Trọng số + Điểm thưởng) / 100 · Chỉ việc quản lý Duyệt mới tính vào KPI; việc Re-check không tính điểm · Xếp loại: A+ ≥100, A ≥86, B ≥75, C ≥61, D &gt;41, E.</p>
    <div class="sign" style="grid-template-columns:1fr 1fr"><div><b>Nhân viên tự đánh giá</b><br><small>(Ký, ghi rõ họ tên)</small></div><div><b>Quản lý duyệt</b><br><small>(Ký, ghi rõ họ tên)</small></div></div></div>
    <div style="margin-top:6px;font-size:10.5px;color:#777;text-align:right">${esc(CREDIT)}</div></div>`;
}
ACT['sheet-print']=el=>printHTML(slipHTML(el.dataset.e,el.dataset.y,el.dataset.mm));
ACT['sheet-pdf']=async el=>{const {e,y,mm}=el.dataset,box=offscreen(slipHTML(e,y,mm),1000);await pdfFromEls([box],`phieu-kpi_${slug(empOf(e).code)}_${y}-${mm}.pdf`,{landscape:true});box.remove()};
