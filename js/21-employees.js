/* 21-employees.js – Nhân viên: danh sách, theo nhóm, trang chi tiết (biểu đồ tháng / quý / năm, bảng việc từng tháng, quản lý duyệt, giao việc By Manager, Comment by Manager, chuyển việc sang tháng sau, phiếu đánh giá) */
'use strict';
(self.__mods=self.__mods||[]).push('21-employees');

/* Nút gộp / dải tháng đổi bộ lọc của trang đang mở */
ACT.setf=el=>{const k=el.dataset.k,v=el.dataset.v;if(F()[k]===v)return;F()[k]=v;refreshTbl();document.querySelector(`[data-act="setf"][data-k="${k}"][data-v="${v}"]`)?.focus({preventScroll:true})};

/* ---------- danh sách nhân viên ---------- */
PAGES['emp/list']={t:'Tất cả nhân viên',
  head(){return `<div class="bar">${fSearch('Tìm tên, mã NV, chức danh…')}${scopeBar(fSel('st','Trạng thái',[['','Đang theo dõi'],['all','Tất cả'],['off','Ngừng theo dõi']]))}<div class="sp"></div><button class="btn" data-act="export" data-name="nhan-vien-kpi">⬇ Excel</button>${can('manage')?'<button class="btn" data-act="kt-assign">📌 Giao việc</button>':''}${addBtns()}</div>`},
  tbl(){
    const f=F(),y=f.year||curYear(),q=norm(f.q),st=f.st||'';
    const rows=sortedEmps().filter(e=>(!f.dept||e.dept===f.dept)&&(st==='all'||(st==='off'?e.active===false:e.active!==false))&&(!q||norm(`${e.code} ${e.name} ${e.title||''} ${e.email||''} ${e.dept||''}`).includes(q))).map(e=>({e,ys:empStats(e,y)}));
    return table([
      {h:'Mã NV',f:r=>`<span style="white-space:nowrap">${esc(r.e.code)}</span>`,x:r=>r.e.code},
      {h:'Nhân viên',f:r=>`<span class="mem">${empAv(r.e)}<span>${empLink(r.e)}${r.e.title?`<small>${esc(r.e.title)}</small>`:''}</span></span>`,x:r=>r.e.name},
      {h:'Chức danh',xonly:1,x:r=>r.e.title||''},{h:'Email',xonly:1,x:r=>r.e.email||''},
      {h:'Nhóm',f:r=>r.e.dept?`<span class="pf">${esc(r.e.dept)}</span>`:'—',x:r=>r.e.dept||''},
      {h:`KPI năm ${y}`,f:r=>kBar(r.ys.avg),x:r=>r.ys.avg==null?'':r2(r.ys.avg)},{h:'Xếp loại',f:r=>gradeBd(r.ys.avg),x:r=>gradeOf(r.ys.avg)?.[2]||''},
      {h:'Tháng gần nhất',c:'num',f:r=>r.ys.last==null?'–':`${kCell(r.ys.months[r.ys.last].kpi)}<small>T${MM[r.ys.last]}</small>`,x:r=>r.ys.last==null?'':r2(r.ys.months[r.ys.last].kpi)},
      pctCol('Đúng hạn',r=>r.ys.onPct),nc('Chưa hoàn thành',r=>r.ys.open),{h:'Chờ duyệt',c:'num',f:r=>r.ys.pending?`<span class="tag-warn">${r.ys.pending}</span>`:'0',x:r=>r.ys.pending},{h:'Quá hạn',c:'num',f:r=>badNum(r.ys.overdue),x:r=>r.ys.overdue},
      {h:'Trạng thái',f:r=>r.e.active===false?badge('mute','Ngừng theo dõi'):badge('ok','Đang theo dõi'),x:r=>r.e.active===false?'Ngừng theo dõi':'Đang theo dõi'},
      actCol(r=>(can('manage')?`<button class="btn sm" data-act="kt-assign" data-e="${r.e.id}" data-y="${y}" aria-label="Giao việc cho ${esc(r.e.name)}">Giao việc</button> `:'')+(can('admin')?`<button class="btn sm" data-act="emp-edit" data-id="${r.e.id}" aria-label="Sửa thông tin ${esc(r.e.name)}">Sửa</button>`:''))
    ],rows,{empty:db.employees.length?'Không có nhân viên nào khớp bộ lọc.':'Chưa có nhân viên nào. Bấm “Nhập Excel KPI” để đưa file KPI cá nhân vào, hoặc “Thêm nhân viên”.'});
  }};

/* ---------- theo nhóm ---------- */
function deptRows(f){
  const rows=scopeStats({year:f.year}),names=[...depts(),''];
  return names.map(d=>{const rs=rows.filter(r=>(r.e.dept||'')===d),ev=rs.filter(r=>r.ys.avg!=null),cnt={ok:0,info:0,mute:0,bad:0};ev.forEach(r=>cnt[gradeOf(r.ys.avg)[1]]++);
    const scored=sumK(rs,'scored');return{d:d||'Chưa gán nhóm',n:rs.length,avg:avgOf(ev.map(r=>r.ys.avg)),cnt,onPct:scored?sumK(rs,'onTime')/scored*100:null,late:sumK(rs,'late'),open:sumK(rs,'open'),overdue:sumK(rs,'overdue'),q:[0,1,2,3].map(k=>avgOf(rs.map(r=>r.ys.quarters[k].avg).filter(v=>v!=null)))}}).filter(x=>x.n);
}
const deptCols=()=>[{h:'Nhóm',f:r=>`<b>${esc(r.d)}</b>`,x:r=>r.d},nc('Nhân viên',r=>r.n),{h:'KPI trung bình năm',f:r=>kBar(r.avg),x:r=>r.avg==null?'':r2(r.avg)},{h:'Xếp loại',f:r=>gradeBd(r.avg),x:r=>gradeOf(r.avg)?.[2]||''},
  ...QN.map((n,k)=>kc(n,r=>r.q[k])),nc('Xuất sắc',r=>r.cnt.ok),nc('Tốt',r=>r.cnt.info),nc('Đạt',r=>r.cnt.mute),{h:'Cần cải thiện',c:'num',f:r=>badNum(r.cnt.bad),x:r=>r.cnt.bad},pctCol('Đúng hạn',r=>r.onPct),nc('Chưa hoàn thành',r=>r.open),{h:'Quá hạn',c:'num',f:r=>badNum(r.overdue),x:r=>r.overdue}];
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
    const mMark=m=>m.overdue?`<em class="mk bad" title="${m.overdue} việc quá hạn">${m.overdue}</em>`:m.recheck?`<em class="mk bad" title="${m.recheck} việc Re-check">R</em>`:m.delays?`<em class="mk warn" title="${m.delays} việc ghi delays, đề nghị dời sang tháng sau">${m.delays}</em>`:'';
    const mAria=m=>`KPI ${mVal(m)==null?(m.self!=null?'chờ duyệt, tự chấm '+fmtK(m.self):'chưa có điểm'):fmtK(mVal(m))+(m.prov?' tạm tính':'')}${m.overdue?', '+m.overdue+' việc quá hạn':''}${m.recheck?', '+m.recheck+' việc Re-check':''}`;
    const inv=session&&session.empId===e.id?myInvites(e.id):[];
    const invCard=inv.length?`<section class="card invc"><h4>📨 Lời mời làm chung (${inv.length})</h4><div class="lst">${inv.map(g=>`<div><span><b>${esc(String(g.title||'').split('\n')[0])}</b><small>${esc((g.invitedBy&&g.invitedBy[e.id]&&g.invitedBy[e.id].name)||g.byName||'')} mời · T${g.mm}/${g.year}${g.deadline?' · deadline '+fmtDM(g.deadline,g.year):''}${g.members.length?' · cùng '+esc(g.members.map(x=>gName(g,x)).join(', ')):''}</small></span><span class="acts"><button class="btn sm acc" data-act="grp-accept" data-g="${g.id}" data-e="${e.id}">Nhận</button><button class="btn sm" data-act="grp-decline" data-g="${g.id}" data-e="${e.id}">Từ chối</button></span></div>`).join('')}</div></section>`:'';
    return `${invCard}<section class="card"><div class="hdr"><div><div class="tags">${e.dept?`<span class="pf">${esc(e.dept)}</span>`:''}${e.active===false?badge('mute','Ngừng theo dõi'):''}${gradeBd(ys.avg)}</div><h2>${esc(e.name)}</h2>
      <p>Mã NV ${esc(e.code)}${e.title?' · '+esc(e.title):''}${e.email?' · '+esc(e.email):''}${sheet?' · cập nhật '+fmtDate(sheet.updatedAt):''}</p>${e.note?`<p class="desc">${esc(e.note)}</p>`:''}</div>
      ${w?`<div class="acts">${adm?`<button class="btn" data-act="emp-edit" data-id="${e.id}">Sửa thông tin</button><button class="btn" data-act="imp-open">⬆ Nhập Excel KPI</button>`:''}${mg&&ys.pending?`<button class="btn" data-act="ap-all" data-e="${e.id}" data-y="${y}">✓ Duyệt cả năm (${ys.pending} việc chờ)</button>`:''}${mg?`<button class="btn" data-act="kt-assign" ${dA}>📌 Giao việc T${mm}</button>`:''}<button class="btn acc" data-act="kt-new" ${dA}>＋ Thêm việc T${mm}</button></div>`:''}</div></section>
    <div class="kpis">${kpi(`KPI trung bình năm ${y}`,fmtK(ys.avg),ys.avg==null?'chưa có tháng nào có điểm được duyệt':`${gradeBd(ys.avg)} · ${ys.ev.length} tháng có điểm`,gradeTone(ys.avg)||'acc')}${kpi(lq!=null?`${QN[lq]} (${QR[lq]})`:'Quý gần nhất',fmtK(lq!=null?ys.quarters[lq].avg:null),lq!=null?`trung bình ${ys.quarters[lq].n}/3 tháng`:'chưa có điểm','info')}${kpi('Cao nhất · Thấp nhất',ys.maxI!=null?`${fmtK(ys.months[ys.maxI].kpi)} · ${fmtK(ys.months[ys.minI].kpi)}`:'–',ys.maxI!=null?`T${MM[ys.maxI]} · T${MM[ys.minI]}`:'','acc')}${kpi('Hoàn thành đúng hạn',ys.onPct==null?'–':fmtK(ys.onPct)+'%',ys.scored?`${ys.onTime}/${ys.scored} việc đã hoàn thành · ${ys.late} việc trễ`:'chưa có việc hoàn thành','ok')}${kpi('Việc chưa hoàn thành',ys.open+ys.overdue,ys.overdue?`<span class="tag-bad">${ys.overdue} quá hạn</span>`:'không có việc quá hạn',ys.overdue?'bad':'ok')}${kpi('Chờ quản lý duyệt',ys.pending,ys.recheck?`<span class="tag-bad">${ys.recheck} việc Re-check · không tính điểm</span>`:ys.pending?'điểm chưa tính vào KPI':'không có việc Re-check',ys.recheck?'bad':ys.pending?'warn':'ok')}</div>
    <section class="card"><div class="hdr" style="align-items:center;margin-bottom:10px"><h4 style="margin:0">${{thang:'KPI theo tháng',quy:'KPI trung bình theo quý',nam:'KPI lũy kế từ đầu năm'}[f.mode]} – ${y}</h4><div class="seg" role="group" aria-label="Kỳ hiển thị">${Object.entries(MODES).map(([k,l])=>`<button type="button" data-act="setf" data-k="mode" data-v="${k}" aria-pressed="${f.mode===k}" class="${f.mode===k?'on':''}">${l}</button>`).join('')}</div></div>
      <div class="ch"><canvas id="c1"></canvas></div>
      <p class="note">${f.mode==='thang'?'Bấm vào một cột để mở bảng việc của tháng đó. ':f.mode==='quy'?'Mỗi cột là trung bình các tháng đã có điểm trong quý. ':'Điểm cuối đường là KPI năm tính đến tháng gần nhất. '}KPI chỉ tính các việc quản lý đã <b>Duyệt</b>. Mốc xếp loại: 80 Đạt · 100 Tốt · 120 Xuất sắc · tối đa ${KPI_CAP}. Cột đỏ: dưới 80. Cột nhạt và dấu *: tháng đang diễn ra, điểm tạm tính.</p></section>
    <section class="card mcard"><div class="mstrip" role="group" aria-label="Chọn tháng">${MM.map((m,i)=>`<button type="button" data-act="setf" data-k="mm" data-v="${m}" aria-pressed="${m===mm}" class="${m===mm?'on':''}" aria-label="Tháng ${m}, ${mAria(ys.months[i])}"><b>T${m}${mMark(ys.months[i])}</b><span>${mCell(ys.months[i])}</span></button>`).join('')}</div>
      <div class="hdr" style="margin:14px 0 10px"><div><h4 style="margin:0 0 6px">Đánh giá KPI tháng ${mm}/${y}</h4><div class="mmeta"><span class="big">${fmtK(mVal(st))}</span>${st.prov?badge('info','Tạm tính · tháng chưa kết thúc'):mVal(st)!=null?gradeBd(st.kpi):badge('mute',st.pending?'Chờ quản lý duyệt':'Chưa có điểm')}<span class="muted">${st.n} việc · ${st.scored} đã hoàn thành · ${st.counted} đã duyệt</span>${nMgr?`<span class="pf mgr">${nMgr} việc By Manager</span>`:''}${st.pending?badge('warn',`○ ${st.pending} việc chờ duyệt · nếu duyệt hết: ${fmtK2(st.self)}`):''}${st.recheck?badge('bad',`! ${st.recheck} việc Re-check · không tính điểm`):''}${st.n?(Math.abs(st.weight-100)<0.01?'<span class="muted">Tổng trọng số 100</span>':badge('warn',`! Tổng trọng số ${fmtK(st.weight)} (chuẩn 100)`)):''}${st.raw>KPI_CAP?`<span class="muted">Cộng dồn ${fmtK(st.raw)}, khống chế ở ${KPI_CAP}</span>`:''}</div></div>
        <div class="acts">${st.n?`<button class="btn" data-act="sheet-print" ${dA}>🖨 In phiếu</button><button class="btn" data-act="sheet-pdf" ${dA}>Phiếu PDF</button>`:''}${w?`<button class="btn" data-act="kt-new" ${dA}>＋ Thêm việc</button>`:''}${mg?`<button class="btn" data-act="kt-assign" ${dA}>📌 Giao việc</button>`:''}${mg&&st.pending?`<button class="btn acc" data-act="ap-all" ${dA}>✓ Duyệt ${st.pending} việc chờ duyệt</button>`:''}</div></div>
      ${w&&carri.length?`<p class="hint">Tháng này còn ${carri.length} việc chưa hoàn thành. Việc nào cần dời sang ${nxL}: bấm <b>Sửa</b> ở việc đó rồi chọn <b>Chuyển sang ${nxL}</b>.</p>`:''}
      ${monthTable(e,y,mm,st)}
      <form class="cmt" data-submit="cmt-save" ${dA}><label class="f"><span>Nhận xét của quản lý – tháng ${mm}</span><textarea class="in" name="comment" rows="2" ${mg?'':'readonly'} placeholder="${mg?'Điểm mạnh, điểm cần cải thiện, mục tiêu tháng sau…':'Quản lý chưa nhận xét tháng này.'}">${esc(comment)}</textarea></label>${mg?'<div><button class="btn sm">Lưu nhận xét</button></div>':''}</form>
    </section>`;
  },
  tm(){
    e=empOf(e.id)||e;const f=F(),y=f.year,ys=yearStats(sheetOf(e.id,y)),sel=+f.mm-1;
    if(f.mode==='quy'){const d=ys.quarters.map(q=>q.avg);
      kChart('c1',{type:'bar',data:{labels:QN.map((n,i)=>[n,QR[i]]),datasets:[{label:'KPI trung bình quý',data:d,backgroundColor:barColors(d),showVal:true,maxBarThickness:44}]},options:kpiOpt({plugins:{legend:{display:false},tooltip:kTip(i=>[ys.quarters[i].n?`Trung bình ${ys.quarters[i].n}/3 tháng có điểm`:'Chưa có tháng nào có điểm'])}})},
        `KPI trung bình theo quý của ${e.name}, năm ${y}: `+ys.quarters.map((q,i)=>`${QN[i]} ${q.avg==null?'chưa có điểm':fmtK(q.avg)}`).join(', '));
    }else if(f.mode==='nam'){const prev=sheetOf(e.id,+y-1),py=prev?yearStats(prev):null;
      kChart('c1',{type:'line',data:{labels:MM.map(m=>'T'+m),datasets:[{label:`Lũy kế ${y}`,data:ys.ytd,borderColor:CC.bar,backgroundColor:'rgba(47,125,225,.10)',fill:true,tension:.25,pointRadius:4,pointBackgroundColor:CC.bar,pointBorderColor:'#fff',pointBorderWidth:2,borderWidth:2,spanGaps:true,showVal:'last'},
        ...(py?[{label:`Lũy kế ${+y-1}`,data:py.ytd,borderColor:CC.prev,backgroundColor:CC.prev,tension:.25,pointRadius:3,borderWidth:2,spanGaps:true}]:[])]},
        options:kpiOpt({interaction:{mode:'index',intersect:false},plugins:{legend:{display:!!py,position:'bottom'},tooltip:kTip(i=>ys.months[i].kpi!=null?[`KPI tháng: ${fmtK2(ys.months[i].kpi)}`]:['Tháng chưa có điểm'])}})},
        `KPI lũy kế từ đầu năm ${y} của ${e.name}: `+(ys.ev.length?ys.ev.map(i=>`đến T${MM[i]} ${fmtK(ys.ytd[i])}`).join(', '):'chưa có điểm'));
    }else{const d=ys.months.map(mVal);
      kChart('c1',{type:'bar',data:{labels:MM.map(m=>'T'+m),datasets:[{label:'KPI tháng',data:d,backgroundColor:d.map((v,i)=>ys.months[i].prov?'#b7cdec':v!=null&&v<80?CC.low:CC.bar),borderColor:'#1f2544',borderWidth:d.map((_,i)=>i===sel?2:0),showVal:true}]},
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
function monthTable(e,y,mm,st){
  const w=canSheet(e.id),mg=can('manage'),rows=st.rows.map((r,i)=>({...r,i})),scd=r=>r.sc.state!=='moved'&&(r.sc.comp!=null||r.sc.ap);
  /* Cột Comment by Manager chỉ hiện khi tháng có việc Re-check (quản lý) hoặc đã có comment */
  const showMc=rows.some(r=>r.sc.state!=='moved'&&(mcOf(r.t)||(mg&&r.sc.ap==='recheck'))),mcX=r=>{const c=mcOf(r.t);return c?c.text+(c.done?' (nhân viên đã cập nhật)':''):''};
  return table([
    {h:'STT',c:'num',f:r=>r.i+1,x:r=>r.i+1},
    {h:'Nội dung công việc / Đóng góp',c:'ttl',f:r=>`${r.t.carriedFrom?`<span class="pf">Chuyển từ ${mLbl(r.t.carriedFrom.month,r.t.carriedFrom.year,y)}</span>`:''}${tagBd(r.t)}${grpBd(r.t,e.id)}<span class="tt">${esc(r.t.title)}</span>`,x:r=>r.t.title},
    {h:'Giao bởi / Tag / Làm chung',xonly:1,x:r=>tagText(r.t)},
    {h:'Trọng số',c:'num',f:r=>fmtK(r.sc.w),x:r=>r.sc.w},
    {h:'Deadline',f:r=>`<span style="white-space:nowrap">${fmtDM(r.t.deadline,y)}</span>${r.t.carriedFrom&&r.t.carriedFrom.deadline&&r.t.carriedFrom.deadline!==r.t.deadline?`<small>gốc ${fmtDM(r.t.carriedFrom.deadline,y)}</small>`:''}`,x:r=>fmtDate(r.t.deadline)},
    {h:'Ngày hoàn thành',f:r=>{const g=grpOfT(r.t);return `<span style="white-space:nowrap">${fmtDM(r.t.submitted,y)}</span>${g&&r.t.submitted&&g.doneBy&&g.doneBy.empId!==e.id?`<small title="Việc làm chung: ngày hoàn thành do ${esc(g.doneBy.name)} ghi">ghi bởi ${esc(String(g.doneBy.name).split(' ').pop())}</small>`:''}`},x:r=>fmtDate(r.t.submitted)},
    {h:'Số ngày trễ',xonly:1,x:r=>r.sc.late??''},
    {h:'Trạng thái',c:'stc',f:r=>stBd(r.t,r.sc,y),x:r=>stText(r.t,r.sc,y)},
    {h:'Điểm cơ bản',c:'num',f:r=>r.sc.base==null?'–':fmtK(r.sc.base),x:r=>r.sc.base??''},
    {h:'Điểm thưởng (tự động)',c:'num',f:r=>r.sc.bonus==null?'–':r.sc.bonus?`<span class="pos">+${fmtK(r.sc.bonus)}</span>`:'0',x:r=>r.sc.bonus??''},
    {h:'Điểm thành phần',c:'num',f:r=>r.sc.comp==null?'–':`<b class="cp ${r.sc.ap||'pend'}" title="${CP_TIP[r.sc.ap]}">${fmtK2(r.sc.comp)}</b>${r.sc.ap==='recheck'?'<small class="tag-bad">không tính</small>':r.sc.ap===''?'<small>chờ duyệt</small>':''}`,x:r=>r.sc.comp==null?'':r2(r.sc.comp)},
    {h:'Quản lý duyệt',c:'apc',f:r=>apCell(e,y,mm,r),x:r=>scd(r)?AP[r.sc.ap][1]:''},
    {h:'Tính vào KPI',xonly:1,x:r=>r.sc.comp==null?'':r.sc.counted?'Có':'Không'},
    {h:'Ghi chú / Link bằng chứng',c:'nt',f:r=>r.t.note?linkify(r.t.note):'',x:r=>r.t.note||''},
    showMc?{h:'Comment by Manager',c:'mcc',f:r=>mcCell(e,y,mm,r),x:mcX}:{h:'Comment by Manager',xonly:1,x:mcX},
    actCol(r=>!w?'':r.sc.state==='moved'?`<button class="btn sm" data-act="kt-undo" data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}" aria-label="Hoàn tác chuyển việc ${r.i+1}">Hoàn tác</button>`
      :canTask(e.id,r.t)?`<button class="btn sm" data-act="kt-edit" data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}" aria-label="Sửa việc ${r.i+1}">Sửa</button>`:'<span class="muted" title="Việc đã được quản lý Duyệt, chỉ quản lý sửa được">Đã duyệt</span>')
  ],rows,{meta:false,rc:r=>r.sc.state==='moved'?'moved':r.sc.ap==='recheck'?'recheck':'',empty:`Tháng ${mm} chưa có việc nào.${w?' Bấm “Thêm việc” để nhập việc của tháng.':''}`,
    foot:st.n?`<tr><td colspan="2">KPI tổng tháng</td><td class="num">${fmtK(st.weight)}</td><td colspan="5"></td><td class="num">${fmtK2(mVal(st))}${st.prov?'*':''}</td><td colspan="${showMc?4:3}">${st.scored?`${st.counted}/${st.scored} việc đã duyệt`:''}</td></tr>`:''});
}

/* ---------- thêm / sửa / giao việc ---------- */
/* opt.assign: quản lý giao việc → đánh dấu By Manager; chọn 1 hoặc nhiều nhân viên (nhiều người = việc làm chung) và tháng ngay trong hộp thoại */
let MATE_OPTS={};
function taskForm(empId,y,mm,id,opt={}){
  const assign=!!opt.assign&&!id,sh=empId?sheetOf(empId,y):null,t=id?by(sh.months[mm].tasks,id):{title:'',weight:1,deadline:'',submitted:'',approval:'',note:''};
  if(!t)return toast('Việc này không còn tồn tại.','error');
  if(assign&&!can('manage'))return toast('Chỉ quản lý được giao việc.','error');
  const ap=apOf(t),mg=can('manage'),legacy=!!id&&!wOk(+t.weight),nx=nextOf(y,mm),nxL=mLbl(nx.mm,nx.year,y),mv=!!id&&canSheet(empId)&&canCarry(t,scoreTask(t));
  if(!assign&&!canTask(empId,id?t:null))return toast(canSheet(empId)?'Việc đã được quản lý Duyệt, chỉ quản lý sửa được.':'Bạn không có quyền sửa việc này.','error');
  const g=grpOfT(t),glock=!mg&&!!(g&&g.locked),lock=!mg&&byMgr(t)||glock,c=mcOf(t),tg=tagsOf(t);   /* việc By Manager / nhóm đã được duyệt: nhân viên không đổi nội dung, deadline */
  /* người làm chung: thành viên hiện có, người đang được mời, và danh sách để chọn thêm */
  const inGrp=g?[...g.members,...(g.invited||[])]:[],opts=assign?[]:dirEmps().filter(x=>x.id!==empId&&!inGrp.includes(x.id));
  MATE_OPTS={};opts.forEach(x=>{MATE_OPTS[`${x.name} · ${x.code}`]=x.id});
  const mateBlk=assign?'':`<div class="f full"><span>Người làm chung <small class="muted">(gõ tên hoặc mã NV rồi chọn trong danh sách)</small></span>
      <div class="mates" id="kt-mates">${g?[...g.members.filter(x=>x!==empId).map(x=>`<span class="chip">👥 ${esc(gName(g,x))}</span>`),...(g.invited||[]).map(x=>`<span class="chip wait">${esc(gName(g,x))} · chờ nhận</span>`)].join(''):''}<span id="kt-mates-new"></span></div>
      <input class="in" list="dl-emps" id="kt-mate-in" placeholder="VD: Tuấn hoặc S21401" autocomplete="off" aria-label="Thêm người làm chung"><datalist id="dl-emps">${Object.keys(MATE_OPTS).map(v=>`<option value="${esc(v)}"></option>`).join('')}</datalist><input type="hidden" name="mates" value="">
      <small class="muted">${mg?'Quản lý thêm người là vào việc ngay.':'Người được thêm sẽ nhận lời mời và tự bấm Nhận.'} Ngày hoàn thành do một người ghi được áp dụng cho cả nhóm; trọng số và duyệt tính riêng từng người.</small></div>`;
  const empPick=assign?`<div class="f full"><span>Giao cho nhân viên <i style="color:var(--bad);font-style:normal">*</i> <small class="muted">(chọn nhiều người = việc làm chung)</small></span><input class="in" id="as-q" placeholder="Lọc theo tên hoặc mã NV" autocomplete="off" aria-label="Lọc nhân viên"><div class="empck" id="as-list">${sortedEmps().filter(x=>x.active!==false||x.id===empId).map(x=>`<label class="chk" data-k="${esc(norm(x.name+' '+x.code))}"><input type="checkbox" name="emp_${x.id}" value="${x.id}" ${x.id===empId?'checked':''}> ${esc(x.name)} <small class="muted">${esc(x.code)}${x.dept?' · '+esc(x.dept):''}</small></label>`).join('')}</div></div>`:'';
  modal(assign?'Giao việc cho nhân viên':id?'Sửa việc':`Thêm việc tháng ${mm}/${y}`,`<form id="mf" data-submit="kt-save" data-e="${empId||''}" data-y="${y}" data-mm="${mm}" data-id="${id||''}" data-assign="${assign?1:''}"><div class="fg">
    ${assign?`${empPick}${inp('ym','Tháng',`${y}-${mm}`,{type:'month',req:1,ph:'yyyy-mm'})}<p class="hint full">Việc được đánh dấu <b>By Manager</b>. Chọn nhiều người thì mỗi người có một bản việc riêng (tự chấm trọng số, duyệt riêng), Ngày hoàn thành do một người ghi áp dụng cho cả nhóm. Nhân viên không đổi được nội dung, deadline và không xoá được.</p>`:''}
    ${id&&(byMgr(t)||tg.length||g)?`<div class="f full"><div>${tagBd(t)}${grpBd(t,empId)}${byMgr(t)&&t.byName?`<small class="muted"> giao bởi ${esc(t.byName)}${t.byAt?' · '+fmtDate(t.byAt):''}</small>`:''}</div></div>`:''}
    ${!mg&&c&&!c.done&&ap==='recheck'?`<p class="hint full mcn"><b>Comment by Manager:</b> ${esc(c.text)}<br><small>Cập nhật lại việc rồi bấm Lưu; việc sẽ quay về Chờ duyệt.</small></p>`:''}
    ${glock?'<p class="hint full">Việc làm chung này đã được quản lý Duyệt cho một người trong nhóm nên nội dung, deadline và Ngày hoàn thành không đổi được nữa.</p>':''}
    <label class="f full"><span>Nội dung công việc / Đóng góp <i style="color:var(--bad);font-style:normal">*</i></span><textarea class="in" name="title" rows="3" ${lock?'readonly':''}>${esc(t.title)}</textarea></label>
    ${inp('weight',`Trọng số – nhân viên tự chấm (${W_MIN}–${W_MAX})`,t.weight,{type:'number',step:legacy?'any':'1',req:1,attrs:legacy?'':`min="${W_MIN}" max="${W_MAX}" inputmode="numeric"`})}${mg?sel('approval','Quản lý duyệt',[['','Chờ duyệt'],[AP_VAL.ok,'Duyệt – tính điểm vào KPI'],[AP_VAL.recheck,'Re-check – không tính điểm']],AP_VAL[ap]):`<div class="f"><span>Quản lý duyệt</span><div>${apBd(ap)}</div></div>`}
    ${mg?`<label class="f full" id="kt-mcw" hidden><span>Comment by Manager <small class="muted">(nhân viên sẽ thấy; chỉ nhập khi chọn Re-check)</small></span><textarea class="in" name="mc" rows="2" maxlength="500" placeholder="Cần sửa / bổ sung gì…">${esc(c&&!c.done?c.text:'')}</textarea></label>`:''}
    ${legacy?`<p class="hint full">Trọng số đang lưu là ${esc(t.weight)}, nằm ngoài thang ${W_MIN}–${W_MAX}. Có thể giữ nguyên; nếu sửa, hãy nhập số nguyên từ ${W_MIN} đến ${W_MAX}.</p>`:''}
    ${inp('deadline','Deadline',t.deadline||'',{type:'date',attrs:lock?'readonly':''})}${inp('submitted',g?'Ngày hoàn thành <small class="muted">(áp dụng cho cả nhóm)</small>':'Ngày hoàn thành',t.submitted||'',{type:'date',attrs:glock?'readonly':''})}
    ${mg?`<div class="f full"><span>Tag</span><div class="tgs">${Object.entries(TAGS).map(([k,l])=>`<label class="chk"><input type="checkbox" name="tag_${k}" ${tg.includes(k)?'checked':''}> <span class="pf tg ${k}">${l}</span></label>`).join('')}</div></div>`:''}
    ${mateBlk}
    <div class="f full"><span>Điểm (tự động tính)</span><div class="hint scp" id="kt-prev" aria-live="polite">–</div></div>
    ${txa('note','Ghi chú / Link bằng chứng',t.note||'',{full:1,rows:3})}
    <p class="note full" style="padding:0">${mv?`Việc chưa hoàn thành cần dời sang tháng sau: bấm <b>Chuyển sang ${nxL}</b> bên dưới${g?' (chỉ chuyển phần của người này)':''}.`:lock?'Nội dung và deadline do quản lý đặt.':'Điểm thành phần chỉ được tính vào KPI khi quản lý chọn Duyệt.'}</p></div></form>`,
    {footer:(id&&canDelTask(empId,t)?`<button class="btn danger" data-act="kt-del" data-e="${empId}" data-y="${y}" data-mm="${mm}" data-id="${id}" style="margin-right:auto">${g?'Rời việc làm chung':'Xoá việc'}</button>`:'')+(mv?`<button type="button" class="btn acc" id="kt-mv" data-act="kt-move-edit">Chuyển sang ${nxL}</button>`:'')+cancelBtn+`<button class="btn primary" form="mf">${assign?'Giao việc':'Lưu'}</button>`,size:assign||!g?'':''});
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
  mc:(d.mc||'').trim(),tags:Object.keys(TAGS).filter(k=>d['tag_'+k]),emps:Object.keys(d).filter(k=>k.startsWith('emp_')).map(k=>d[k]),ym:d.ym,mates:(d.mates||'').split(',').filter(Boolean)}}
function ktPreview(){const form=$('form[data-submit="kt-save"]'),el=$('#kt-prev');if(!form||!el)return;const d=ktRead(form),sc=scoreTask(d),mg=can('manage');
  el.innerHTML=sc.comp==null?esc(sc.state==='overdue'?`Chưa hoàn thành · quá hạn ${sc.overdue} ngày`:'Nhập đủ Deadline và Ngày hoàn thành để tính điểm.')
    :`<span>Điểm cơ bản <b>${fmtK(sc.base)}</b></span><span>Điểm thưởng (tự động) <b>${fmtK(sc.bonus)}</b></span><span>Điểm thành phần <b>${fmtK2(sc.comp)}</b></span><small>${sc.late>0?'Trễ '+sc.late+' ngày':sc.late<0?'Sớm '+(-sc.late)+' ngày làm việc':'Đúng hạn'} · (${fmtK(sc.base)} × ${fmtK(sc.w)} + ${fmtK(sc.bonus)}) / 100${mg?' · '+CP_TIP[sc.ap]:''}</small>`;
  const mw=$('#kt-mcw');if(mw)mw.hidden=sc.ap!=='recheck';   /* ô Comment by Manager chỉ hiện khi quản lý chọn Re-check */
  const b=$('#kt-mv');if(b){b.disabled=!!d.submitted;b.title=d.submitted?'Việc đã có Ngày hoàn thành nên không chuyển tháng':'Lưu việc rồi chuyển sang tháng sau'}}
document.addEventListener('input',e=>{if(e.target.closest&&e.target.closest('form[data-submit="kt-save"]'))ktPreview()});
document.addEventListener('change',e=>{if(e.target.closest&&e.target.closest('form[data-submit="kt-save"]'))ktPreview()});
ACT['kt-new']=el=>canSheet(el.dataset.e)&&taskForm(el.dataset.e,el.dataset.y,el.dataset.mm);
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
  if(!mg&&g0&&g0.locked){d.title=g0.title||cur.title;d.submitted=g0.submitted||null;if(!cur.carriedFrom)d.deadline=g0.deadline||null}
  if(!d.title)return fail('Nhập nội dung công việc.');
  if(!(cur&&d.weight===+cur.weight)&&!wOk(d.weight))return fail(`Trọng số là số nguyên từ ${W_MIN} đến ${W_MAX}.`);
  if(mg&&apOf(d)==='ok'&&!(d.deadline&&d.submitted))return fail('Việc chưa có Deadline và Ngày hoàn thành nên chưa có điểm để Duyệt.');
  let tid=id,added=0;
  const ok=transact(()=>{
    const fill=t=>{Object.assign(t,{title:d.title,weight:d.weight,deadline:d.deadline,submitted:d.submitted,note:d.note});delete t.bonusManual;
      if(mg){
        t.approval=d.approval;if(d.tags.length)t.tags=d.tags;else delete t.tags;
        /* Comment by Manager chỉ có hiệu lực khi Re-check; đổi sang Duyệt / Chờ duyệt thì comment cũ được coi là đã xử lý */
        if(apOf(t)==='recheck'){const c=mcOf(t);if(d.mc){if(!c||c.done||c.text!==d.mc)t.mgrComment=mcNew(d.mc)}else if(c&&!c.done)delete t.mgrComment}
        else if(t.mgrComment)t.mgrComment.done=true;
      }else{t.approval='';if(t.mgrComment)t.mgrComment.done=true}};   /* nhân viên cập nhật lại việc Re-check → về Chờ duyệt, comment của quản lý mờ và gạch đi */
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
        added=add.length;
      }
      sh.updatedAt=todayStr();
    }
    relockGroups();hydrateGroups();
  });
  return ok?{e,y,mm,id:tid,n:targets.length,added}:null;
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
  const k=location.hash.slice(2);(ui.f[k]??={}).year=String(g.year);ui.f[k].mm=g.mm;rerender();
  toast('Đã nhận việc làm chung. Hãy tự chấm trọng số cho phần việc của bạn.');taskForm(me,g.year,g.mm,t.id);
};
ACT['grp-decline']=el=>{
  const g=grpOf(el.dataset.g),me=el.dataset.e;if(!g||!(g.invited||[]).includes(me))return;
  if(!confirm(`Từ chối làm chung việc “${String(g.title||'').split('\n')[0]}”?`))return;
  if(transact(()=>{g.invited=g.invited.filter(x=>x!==me);(g.declined||(g.declined=[])).push(me)})){rerender();toast('Đã từ chối lời mời')}
};
ACT['kt-del']=el=>{const {e,y,mm,id}=el.dataset;if(!canDelTask(e,by((sheetOf(e,y)||{months:{[mm]:{tasks:[]}}}).months[mm].tasks,id)))return toast('Việc đã có ngày hoàn thành hoặc đã được quản lý phản hồi, chỉ quản lý xoá được.','error');if(!confirm(grpOfT(by(sheetOf(e,y).months[mm].tasks,id))?'Rời việc làm chung này? Phần việc của bạn sẽ bị xoá khỏi bảng KPI; những người khác vẫn giữ việc.':'Xoá việc này? Việc sẽ không còn tính vào KPI của tháng.'))return;
  if(transact(()=>{const sh=sheetOf(e,y),t=by(sh.months[mm].tasks,id),g=grpOfT(t);sh.months[mm].tasks=sh.months[mm].tasks.filter(t=>t.id!==id);sh.updatedAt=todayStr();
    /* rời việc làm chung khi không còn bản việc nào của người này trong nhóm */
    if(g&&!db.sheets.some(s=>s.empId===e&&MM.some(m=>s.months[m].tasks.some(x=>x.gid===g.id&&!x.movedTo))))g.members=g.members.filter(x=>x!==e);relockGroups()}))done('Đã xoá việc')};
SUB['cmt-save']=form=>{if(!can('manage'))return toast('Chỉ quản lý được nhận xét.','error');const {e,y,mm}=form.dataset,v=fd(form).comment.trim();
  if(transact(()=>{const sh=sheetOf(e,y,true);sh.months[mm].comment=v;sh.updatedAt=todayStr()})){rerender();toast('Đã lưu nhận xét')}};

/* ---------- quản lý duyệt: Duyệt → điểm được tính · Re-check → không tính điểm, báo đỏ ---------- */
function setApproval(e,y,mm,ids,val){
  if(!can('manage')){toast('Chỉ quản lý được duyệt.','error');return 0}
  let n=0;
  const ok=transact(()=>{const sh=sheetOf(e,y);if(!sh)throw new Error('Không tìm thấy bảng KPI.');
    sh.months[mm].tasks.forEach(t=>{if(!ids.includes(t.id))return;
      if(val==='ok'&&scoreTask(t).comp==null)throw new Error('Việc chưa có Deadline và Ngày hoàn thành nên chưa có điểm để Duyệt.');
      t.approval=AP_VAL[val]||'';if(val!=='recheck'&&t.mgrComment)t.mgrComment.done=true;n++});
    if(!n)throw new Error('Việc này không còn tồn tại.');
    sh.updatedAt=todayStr();relockGroups()});
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
  if(transact(()=>{plan.forEach(([sid,m,ids])=>{const s=by(db.sheets,sid);s.months[m].tasks.forEach(t=>{if(ids.includes(t.id))t.approval=AP_VAL.ok});s.updatedAt=todayStr()});relockGroups()})){rerender();toast(`Đã duyệt ${n} việc`)}
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
  const e=empOf(empId),sh=sheetOf(empId,y),st=monthStats(sh&&sh.months[mm]),c=db.company||{},g=gradeOf(st.kpi);
  return `<div class="slip wide"><div class="sh"><div class="co"><b>${esc(c.name||'')}</b><div>${esc(c.note||'')}</div></div><div style="text-align:right">Ngày in: ${fmtDate(todayStr())}<br>KPI khống chế: 0 – ${KPI_CAP}</div></div>
    <h2>PHIẾU ĐÁNH GIÁ KPI</h2><div class="sub">Tháng ${mm} / ${y}</div>
    <div class="mt"><div>Họ và tên: <b>${esc(e.name)}</b></div><div>Mã NV: <b>${esc(e.code)}</b></div><div>Nhóm: <b>${esc(e.dept||'—')}</b></div><div>Chức danh: <b>${esc(e.title||'—')}</b></div></div>
    <table><thead><tr><th>STT</th><th>Nội dung công việc / Đóng góp</th><th>Trọng số</th><th>Deadline</th><th>Ngày hoàn thành</th><th>Ngày trễ</th><th>Điểm cơ bản</th><th>Điểm thưởng</th><th>Điểm thành phần</th><th>Quản lý duyệt</th><th>Ghi chú</th></tr></thead><tbody>
    ${st.rows.map((r,i)=>`<tr${r.sc.ap==='recheck'&&r.sc.state!=='moved'?' style="background:#fdecea"':''}><td style="text-align:center">${i+1}</td><td style="white-space:pre-line">${tagText(r.t)?`<i>[${esc(tagText(r.t))}]</i> `:''}${esc(r.t.title)}</td><td style="text-align:right">${fmtK(r.sc.w)}</td><td>${fmtDate(r.t.deadline)}</td><td>${r.sc.state==='moved'?'Đã chuyển '+mLbl(r.t.movedTo.month,r.t.movedTo.year,y):fmtDate(r.t.submitted)}</td><td style="text-align:right">${r.sc.late??''}</td><td style="text-align:right">${r.sc.base??''}</td><td style="text-align:right">${r.sc.bonus??''}</td><td style="text-align:right">${r.sc.comp==null?'':r.sc.counted?`<b>${fmtK2(r.sc.comp)}</b>`:`<span style="color:#888">${fmtK2(r.sc.comp)}</span>`}</td><td>${r.sc.state!=='moved'&&(r.sc.comp!=null||r.sc.ap)?AP[r.sc.ap][1]:''}</td><td style="white-space:pre-line">${esc(r.t.note||'')}${mcOf(r.t)&&!mcOf(r.t).done?`${r.t.note?'\n':''}<b>Comment by Manager:</b> ${esc(mcOf(r.t).text)}`:''}</td></tr>`).join('')}
    <tr><td colspan="2"><b>KPI TỔNG THÁNG</b> (các việc đã Duyệt)</td><td style="text-align:right"><b>${fmtK(st.weight)}</b></td><td colspan="5"></td><td style="text-align:right"><b>${fmtK2(st.kpi)}</b></td><td colspan="2"><b>${g?g[2]:''}</b>${st.pending?` · ${st.pending} việc chờ duyệt`:''}${st.recheck?` · ${st.recheck} việc Re-check`:''}</td></tr></tbody></table>
    <div class="keep"><p style="margin-top:10px;white-space:pre-line"><b>Nhận xét của quản lý:</b> ${esc((sh&&sh.months[mm].comment)||'')}</p>
    <p class="sn">Trọng số do nhân viên tự chấm, thang ${W_MIN}–${W_MAX} · Trễ 1 ngày −${LATE_PENALTY} điểm (ngày lịch) · Sớm 1 ngày làm việc +${BONUS_PER_DAY} điểm thưởng (tối đa ${BONUS_CAP}) · Điểm thành phần = (Điểm cơ bản × Trọng số + Điểm thưởng) / 100 · Chỉ việc quản lý Duyệt mới tính vào KPI; việc Re-check không tính điểm · Xếp loại: Xuất sắc ≥120, Tốt 100–119, Đạt 80–99, Cần cải thiện &lt;80.</p>
    <div class="sign" style="grid-template-columns:1fr 1fr"><div><b>Nhân viên tự đánh giá</b><br><small>(Ký, ghi rõ họ tên)</small></div><div><b>Quản lý duyệt</b><br><small>(Ký, ghi rõ họ tên)</small></div></div></div>
    <div style="margin-top:6px;font-size:10.5px;color:#777;text-align:right">${esc(CREDIT)}</div></div>`;
}
ACT['sheet-print']=el=>printHTML(slipHTML(el.dataset.e,el.dataset.y,el.dataset.mm));
ACT['sheet-pdf']=async el=>{const {e,y,mm}=el.dataset,box=offscreen(slipHTML(e,y,mm),1000);await pdfFromEls([box],`phieu-kpi_${slug(empOf(e).code)}_${y}-${mm}.pdf`,{landscape:true});box.remove()};
