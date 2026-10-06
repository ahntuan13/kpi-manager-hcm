/* 21-employees.js – Nhân viên: danh sách, theo nhóm, trang chi tiết (biểu đồ tháng / quý / năm, bảng việc từng tháng, chuyển việc "delays", phiếu đánh giá) */
'use strict';
(self.__mods=self.__mods||[]).push('21-employees');

/* Nút gộp / dải tháng đổi bộ lọc của trang đang mở */
ACT.setf=el=>{const k=el.dataset.k,v=el.dataset.v;if(F()[k]===v)return;F()[k]=v;refreshTbl();document.querySelector(`[data-act="setf"][data-k="${k}"][data-v="${v}"]`)?.focus({preventScroll:true})};

/* ---------- danh sách nhân viên ---------- */
PAGES['emp/list']={t:'Tất cả nhân viên',
  head(){return `<div class="bar">${fSearch('Tìm tên, mã NV, chức danh…')}${scopeBar(fSel('st','Trạng thái',[['','Đang theo dõi'],['all','Tất cả'],['off','Ngừng theo dõi']]))}<div class="sp"></div><button class="btn" data-act="export" data-name="nhan-vien-kpi">⬇ Excel</button>${addBtns()}</div>`},
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
      pctCol('Đúng hạn',r=>r.ys.onPct),nc('Chưa nộp',r=>r.ys.open),{h:'Quá hạn',c:'num',f:r=>badNum(r.ys.overdue),x:r=>r.ys.overdue},
      {h:'Trạng thái',f:r=>r.e.active===false?badge('mute','Ngừng theo dõi'):badge('ok','Đang theo dõi'),x:r=>r.e.active===false?'Ngừng theo dõi':'Đang theo dõi'},
      actCol(r=>can('admin')?`<button class="btn sm" data-act="emp-edit" data-id="${r.e.id}">Sửa</button>`:'')
    ],rows,{empty:db.employees.length?'Không có nhân viên nào khớp bộ lọc.':'Chưa có nhân viên nào. Bấm “Nhập Excel KPI” để đưa file KPI cá nhân vào, hoặc “Thêm nhân viên”.'});
  }};

/* ---------- theo nhóm ---------- */
function deptRows(f){
  const rows=scopeStats({year:f.year}),names=[...depts(),''];
  return names.map(d=>{const rs=rows.filter(r=>(r.e.dept||'')===d),ev=rs.filter(r=>r.ys.avg!=null),cnt={ok:0,info:0,mute:0,bad:0};ev.forEach(r=>cnt[gradeOf(r.ys.avg)[1]]++);
    const scored=sumK(rs,'scored');return{d:d||'Chưa gán nhóm',n:rs.length,avg:avgOf(ev.map(r=>r.ys.avg)),cnt,onPct:scored?sumK(rs,'onTime')/scored*100:null,late:sumK(rs,'late'),open:sumK(rs,'open'),overdue:sumK(rs,'overdue'),q:[0,1,2,3].map(k=>avgOf(rs.map(r=>r.ys.quarters[k].avg).filter(v=>v!=null)))}}).filter(x=>x.n);
}
const deptCols=()=>[{h:'Nhóm',f:r=>`<b>${esc(r.d)}</b>`,x:r=>r.d},nc('Nhân viên',r=>r.n),{h:'KPI trung bình năm',f:r=>kBar(r.avg),x:r=>r.avg==null?'':r2(r.avg)},{h:'Xếp loại',f:r=>gradeBd(r.avg),x:r=>gradeOf(r.avg)?.[2]||''},
  ...QN.map((n,k)=>kc(n,r=>r.q[k])),nc('Xuất sắc',r=>r.cnt.ok),nc('Tốt',r=>r.cnt.info),nc('Đạt',r=>r.cnt.mute),{h:'Cần cải thiện',c:'num',f:r=>badNum(r.cnt.bad),x:r=>r.cnt.bad},pctCol('Đúng hạn',r=>r.onPct),nc('Chưa nộp',r=>r.open),{h:'Quá hạn',c:'num',f:r=>badNum(r.overdue),x:r=>r.overdue}];
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
function empPage(e){const P={t:e.name,
  sub(){const f=F();return `${esc(e.code)} · ${esc(e.dept||'')} · Năm ${f.year} · Tháng ${f.mm||''}`},
  head(){
    const f=F(),ys=db.sheets.filter(s=>s.empId===e.id).map(s=>+s.year).sort((a,b)=>b-a);
    f.year??=String(ys.includes(+curYear())?curYear():(ys[0]||curYear()));
    const opts=[...new Set([...allYears(),...ys,+f.year])].sort((a,b)=>b-a).map(v=>[String(v),String(v)]);
    return `${isStaff()?'':'<p class="note" style="padding-top:0"><a href="#/emp/list">← Tất cả nhân viên</a></p>'}<div class="bar"><label class="fl">Năm ${fSel('year','Năm',opts)}</label><div class="sp"></div>${rptBtns('kpi-'+slug(e.code||e.name))}</div>`;
  },
  tbl(){
    e=empOf(e.id)||e;const f=F(),y=f.year,w=canSheet(e.id),mg=can('manage'),adm=can('admin'),sheet=sheetOf(e.id,y),ys=yearStats(sheet);
    if(!MM.includes(f.mm))f.mm=ys.last!=null?MM[ys.last]:(String(y)===curYear()?curMonth():'01');
    f.mode=MODES[f.mode]?f.mode:'thang';
    const mm=f.mm,mi=+mm-1,st=ys.months[mi],nx=nextOf(y,mm),nxL=mLbl(nx.mm,nx.year,y),lq=ys.last!=null?Math.floor(ys.last/3):null;
    const comment=(sheet&&sheet.months[mm].comment)||'';
    const carri=st.rows.filter(r=>canCarry(r.t,r.sc)),ready=st.rows.filter(r=>carryReady(r.t,r.sc));
    const dA=`data-e="${e.id}" data-y="${y}" data-mm="${mm}"`;
    return `<section class="card"><div class="hdr"><div><div class="tags">${e.dept?`<span class="pf">${esc(e.dept)}</span>`:''}${e.active===false?badge('mute','Ngừng theo dõi'):''}${gradeBd(ys.avg)}</div><h2>${esc(e.name)}</h2>
      <p>Mã NV ${esc(e.code)}${e.title?' · '+esc(e.title):''}${e.email?' · '+esc(e.email):''}${sheet?' · cập nhật '+fmtDate(sheet.updatedAt):''}</p>${e.note?`<p class="desc">${esc(e.note)}</p>`:''}</div>
      ${w?`<div class="acts">${adm?`<button class="btn" data-act="emp-edit" data-id="${e.id}">Sửa thông tin</button><button class="btn" data-act="imp-open">⬆ Nhập Excel KPI</button>`:''}<button class="btn acc" data-act="kt-new" ${dA}>＋ Thêm việc T${mm}</button></div>`:''}</div></section>
    <div class="kpis">${kpi(`KPI trung bình năm ${y}`,fmtK(ys.avg),ys.avg==null?'chưa có tháng nào được chấm':`${gradeBd(ys.avg)} · ${ys.ev.length} tháng đã chấm`,gradeTone(ys.avg)||'acc')}${kpi(lq!=null?`${QN[lq]} (${QR[lq]})`:'Quý gần nhất',fmtK(lq!=null?ys.quarters[lq].avg:null),lq!=null?`trung bình ${ys.quarters[lq].n}/3 tháng`:'chưa có điểm','info')}${kpi('Cao nhất · Thấp nhất',ys.maxI!=null?`${fmtK(ys.months[ys.maxI].kpi)} · ${fmtK(ys.months[ys.minI].kpi)}`:'–',ys.maxI!=null?`T${MM[ys.maxI]} · T${MM[ys.minI]}`:'','acc')}${kpi('Nộp đúng hạn',ys.onPct==null?'–':fmtK(ys.onPct)+'%',ys.scored?`${ys.onTime}/${ys.scored} việc đã chấm · ${ys.late} việc trễ`:'chưa có việc được chấm','ok')}${kpi('Việc chưa nộp',ys.open+ys.overdue,ys.overdue?`<span class="tag-bad">${ys.overdue} quá hạn</span>`:'không có việc quá hạn',ys.overdue?'bad':'ok')}</div>
    <section class="card"><div class="hdr" style="align-items:center;margin-bottom:10px"><h4 style="margin:0">${{thang:'KPI theo tháng',quy:'KPI trung bình theo quý',nam:'KPI lũy kế từ đầu năm'}[f.mode]} – ${y}</h4><div class="seg" role="group" aria-label="Kỳ hiển thị">${Object.entries(MODES).map(([k,l])=>`<button type="button" data-act="setf" data-k="mode" data-v="${k}" aria-pressed="${f.mode===k}" class="${f.mode===k?'on':''}">${l}</button>`).join('')}</div></div>
      <div class="ch"><canvas id="c1"></canvas></div>
      <p class="note">${f.mode==='thang'?'Bấm vào một cột để mở bảng việc của tháng đó. ':f.mode==='quy'?'Mỗi cột là trung bình các tháng đã chấm trong quý. ':'Điểm cuối đường là KPI năm tính đến tháng gần nhất. '}Mốc xếp loại: 80 Đạt · 100 Tốt · 120 Xuất sắc · tối đa ${KPI_CAP}. Cột đỏ: dưới 80. Cột nhạt và dấu *: tháng đang diễn ra, điểm tạm tính.</p></section>
    <section class="card mcard"><div class="mstrip" role="group" aria-label="Chọn tháng">${MM.map((m,i)=>`<button type="button" data-act="setf" data-k="mm" data-v="${m}" aria-pressed="${m===mm}" class="${m===mm?'on':''}" aria-label="Tháng ${m}, KPI ${mVal(ys.months[i])==null?'chưa chấm':fmtK(mVal(ys.months[i]))+(ys.months[i].prov?' tạm tính':'')}${ys.months[i].overdue?', '+ys.months[i].overdue+' việc quá hạn':''}"><b>T${m}${ys.months[i].overdue?`<em class="mk bad" title="${ys.months[i].overdue} việc quá hạn">${ys.months[i].overdue}</em>`:ys.months[i].delays?`<em class="mk warn" title="${ys.months[i].delays} việc chờ chuyển tháng">${ys.months[i].delays}</em>`:''}</b><span>${ys.months[i].prov?fmtK(ys.months[i].kpiProv)+'*':fmtK(ys.months[i].kpi)}</span></button>`).join('')}</div>
      <div class="hdr" style="margin:14px 0 10px"><div><h4 style="margin:0 0 6px">Đánh giá KPI tháng ${mm}/${y}</h4><div class="mmeta"><span class="big">${fmtK(mVal(st))}</span>${st.prov?badge('info','Tạm tính · tháng chưa kết thúc'):gradeBd(st.kpi)}<span class="muted">${st.n} việc · ${st.scored} đã chấm</span>${st.n?(Math.abs(st.weight-100)<0.01?'<span class="muted">Tổng trọng số 100%</span>':badge('warn',`! Tổng trọng số ${fmtK(st.weight)}% (quy chế: 100%)`)):''}${st.raw>KPI_CAP?`<span class="muted">Cộng dồn ${fmtK(st.raw)}, khống chế ở ${KPI_CAP}</span>`:''}</div></div>
        <div class="acts">${st.n?`<button class="btn" data-act="sheet-print" ${dA}>🖨 In phiếu</button><button class="btn" data-act="sheet-pdf" ${dA}>Phiếu PDF</button>`:''}${w?`<button class="btn" data-act="kt-new" ${dA}>＋ Thêm việc</button><button class="btn acc" data-act="kt-move" ${dA} ${ready.length?'':'disabled'}>${ready.length?`Chuyển ${ready.length} việc “delays” sang ${nxL}`:`Chuyển việc “delays” sang ${nxL}`}</button>`:''}</div></div>
      ${w&&carri.length?`<p class="hint">${ready.length?`${ready.length}/${carri.length} việc chưa nộp đã ghi “delays” và sẵn sàng chuyển sang ${nxL}.`:`Tháng này còn ${carri.length} việc chưa nộp. Việc nào bị trễ và cần dời, bấm <b>Sửa</b> rồi ghi <code>delays</code> vào Ghi chú; nút chuyển sang ${nxL} sẽ bật cho việc đó.`}</p>`:''}
      ${monthTable(e,y,mm,st)}
      <form class="cmt" data-submit="cmt-save" ${dA}><label class="f"><span>Nhận xét của quản lý – tháng ${mm}</span><textarea class="in" name="comment" rows="2" ${mg?'':'readonly'} placeholder="${mg?'Điểm mạnh, điểm cần cải thiện, mục tiêu tháng sau…':'Quản lý chưa nhận xét tháng này.'}">${esc(comment)}</textarea></label>${mg?'<div><button class="btn sm">Lưu nhận xét</button></div>':''}</form>
    </section>`;
  },
  tm(){
    e=empOf(e.id)||e;const f=F(),y=f.year,ys=yearStats(sheetOf(e.id,y)),sel=+f.mm-1;
    if(f.mode==='quy'){const d=ys.quarters.map(q=>q.avg);
      kChart('c1',{type:'bar',data:{labels:QN.map((n,i)=>[n,QR[i]]),datasets:[{label:'KPI trung bình quý',data:d,backgroundColor:barColors(d),showVal:true,maxBarThickness:44}]},options:kpiOpt({plugins:{legend:{display:false},tooltip:kTip(i=>[ys.quarters[i].n?`Trung bình ${ys.quarters[i].n}/3 tháng đã chấm`:'Chưa có tháng nào được chấm'])}})},
        `KPI trung bình theo quý của ${e.name}, năm ${y}: `+ys.quarters.map((q,i)=>`${QN[i]} ${q.avg==null?'chưa có điểm':fmtK(q.avg)}`).join(', '));
    }else if(f.mode==='nam'){const prev=sheetOf(e.id,+y-1),py=prev?yearStats(prev):null;
      kChart('c1',{type:'line',data:{labels:MM.map(m=>'T'+m),datasets:[{label:`Lũy kế ${y}`,data:ys.ytd,borderColor:CC.bar,backgroundColor:'rgba(47,125,225,.10)',fill:true,tension:.25,pointRadius:4,pointBackgroundColor:CC.bar,pointBorderColor:'#fff',pointBorderWidth:2,borderWidth:2,spanGaps:true,showVal:'last'},
        ...(py?[{label:`Lũy kế ${+y-1}`,data:py.ytd,borderColor:CC.prev,backgroundColor:CC.prev,tension:.25,pointRadius:3,borderWidth:2,spanGaps:true}]:[])]},
        options:kpiOpt({interaction:{mode:'index',intersect:false},plugins:{legend:{display:!!py,position:'bottom'},tooltip:kTip(i=>ys.months[i].kpi!=null?[`KPI tháng: ${fmtK2(ys.months[i].kpi)}`]:['Tháng chưa chấm'])}})},
        `KPI lũy kế từ đầu năm ${y} của ${e.name}: `+(ys.ev.length?ys.ev.map(i=>`đến T${MM[i]} ${fmtK(ys.ytd[i])}`).join(', '):'chưa có điểm'));
    }else{const d=ys.months.map(mVal);
      kChart('c1',{type:'bar',data:{labels:MM.map(m=>'T'+m),datasets:[{label:'KPI tháng',data:d,backgroundColor:d.map((v,i)=>ys.months[i].prov?'#b7cdec':v!=null&&v<80?CC.low:CC.bar),borderColor:'#1f2544',borderWidth:d.map((_,i)=>i===sel?2:0),showVal:true}]},
        options:kpiOpt({onClick:(ev,els)=>{if(els.length){F().mm=MM[els[0].index];refreshTbl()}},onHover:(ev,els)=>{ev.native.target.style.cursor=els.length?'pointer':'default'},plugins:{legend:{display:false},tooltip:kTip(i=>{const m=ys.months[i];return m.n?[...(m.prov?['Tạm tính: tháng chưa kết thúc, chưa tính vào quý / năm']:[]),`${m.n} việc, ${m.scored} đã chấm`,`Đúng hạn hoặc sớm ${m.ontime+m.early} · Trễ ${m.late}`,`Chưa nộp ${m.open+m.nodate+m.overdue}`]:['Chưa có việc nào']})}})},
        `KPI theo tháng của ${e.name}, năm ${y}: `+(ys.ev.length?ys.ev.map(i=>`T${MM[i]} ${fmtK(ys.months[i].kpi)}`).join(', '):'chưa có tháng nào được chấm'));
    }
  }};return P}

/* ---------- bảng việc của một tháng (đủ các cột của sheet tháng trong file Excel) ---------- */
function linkify(text){return esc(text).replace(/https?:\/\/[^\s<]+/g,u=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)}
function monthTable(e,y,mm,st){
  const w=canSheet(e.id),nx=nextOf(y,mm),nxL=mLbl(nx.mm,nx.year,y),rows=st.rows.map((r,i)=>({...r,i}));
  return table([
    {h:'STT',c:'num',f:r=>r.i+1,x:r=>r.i+1},
    {h:'Nội dung công việc / Đóng góp',c:'ttl',f:r=>`${r.t.carriedFrom?`<span class="pf">Chuyển từ ${mLbl(r.t.carriedFrom.month,r.t.carriedFrom.year,y)}</span>`:''}<span class="tt">${esc(r.t.title)}</span>`,x:r=>r.t.title},
    {h:'Trọng số',c:'num',f:r=>fmtK(r.sc.w)+'%',x:r=>r.sc.w},
    {h:'Deadline',f:r=>`<span style="white-space:nowrap">${fmtDM(r.t.deadline,y)}</span>${r.t.carriedFrom&&r.t.carriedFrom.deadline&&r.t.carriedFrom.deadline!==r.t.deadline?`<small>gốc ${fmtDM(r.t.carriedFrom.deadline,y)}</small>`:''}`,x:r=>fmtDate(r.t.deadline)},
    {h:'Ngày nộp',f:r=>`<span style="white-space:nowrap">${fmtDM(r.t.submitted,y)}</span>`,x:r=>fmtDate(r.t.submitted)},
    {h:'Số ngày trễ',xonly:1,x:r=>r.sc.late??''},{h:'Điểm cơ bản',xonly:1,x:r=>r.sc.base??''},{h:'Điểm thưởng',xonly:1,x:r=>r.sc.bonus??''},
    {h:'Trạng thái',f:r=>stBd(r.t,r.sc,y)+(/^đạt/i.test(r.t.approval||'')?'<small>Quản lý đã duyệt</small>':''),x:r=>stText(r.t,r.sc,y)},
    {h:'Điểm',c:'num',f:r=>r.sc.comp==null?'–':`<b>${fmtK2(r.sc.comp)}</b><small title="Điểm cơ bản${r.sc.bonus?' · điểm thưởng':''}">${fmtK(r.sc.base)} đ${r.sc.bonus?' · +'+fmtK(r.sc.bonus):''}</small>`,x:r=>r.sc.comp==null?'':r2(r.sc.comp)},
    {h:'Quản lý duyệt',xonly:1,x:r=>r.t.approval||''},
    {h:'Ghi chú / Link bằng chứng',c:'nt',f:r=>r.t.note?linkify(r.t.note):'',x:r=>r.t.note||''},
    actCol(r=>!w?'':r.sc.state==='moved'?`<button class="btn sm" data-act="kt-undo" data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}">Hoàn tác</button>`
      :`${canCarry(r.t,r.sc)?`<button class="btn sm ${carryReady(r.t,r.sc)?'acc':''}" data-act="kt-move" data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}" ${carryReady(r.t,r.sc)?'':'disabled title="Ghi “delays” vào Ghi chú để mở nút này"'} aria-label="Chuyển việc ${r.i+1} sang ${nxL}${carryReady(r.t,r.sc)?'':': cần ghi delays vào Ghi chú'}">Chuyển → ${nxL}</button> `:''}${canTask(e.id,r.t)?`<button class="btn sm" data-act="kt-edit" data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}" aria-label="Sửa việc ${r.i+1}">Sửa</button>`:'<span class="muted" title="Việc đã được quản lý duyệt Đạt, chỉ quản lý sửa được">Đã duyệt</span>'}`)
  ],rows,{meta:false,rc:r=>r.sc.state==='moved'?'moved':'',empty:`Tháng ${mm} chưa có việc nào.${w?' Bấm “Thêm việc”, hoặc chuyển việc “delays” từ tháng trước sang.':''}`,
    foot:st.n?`<tr><td colspan="2">KPI tổng tháng</td><td class="num">${fmtK(st.weight)}%</td><td colspan="3"></td><td class="num">${fmtK2(mVal(st))}${st.prov?'*':''}</td><td colspan="2"></td></tr>`:''});
}

/* ---------- thêm / sửa việc ---------- */
function taskForm(empId,y,mm,id){
  const sh=sheetOf(empId,y),t=id?by(sh.months[mm].tasks,id):{title:'',weight:1,deadline:'',submitted:'',approval:'',note:''};
  const ap=/^reject/i.test(t.approval||'')?'Reject':/^đạt/i.test(t.approval||'')?'Đạt':'',mg=can('manage');
  if(!canTask(empId,id?t:null))return toast(canSheet(empId)?'Việc đã được quản lý duyệt Đạt, chỉ quản lý sửa được.':'Bạn không có quyền sửa việc này.','error');
  modal(id?'Sửa việc':`Thêm việc tháng ${mm}/${y}`,`<form id="mf" data-submit="kt-save" data-e="${empId}" data-y="${y}" data-mm="${mm}" data-id="${id||''}"><div class="fg">
    ${txa('title','Nội dung công việc / Đóng góp <i style="color:var(--bad);font-style:normal">*</i>',t.title,{full:1,rows:3})}
    ${inp('weight','Trọng số (%)',t.weight,{type:'number',step:'0.5',min:0,req:1,attrs:'max="100"'})}${mg?sel('approval','Quản lý duyệt',[['','Chưa phản hồi (quy tắc 24h)'],['Đạt','Đạt'],['Reject','Reject – yêu cầu sửa']],ap):`<div class="f"><span>Quản lý duyệt</span><div class="hint">${ap||'Chưa phản hồi'}</div><input type="hidden" name="approval" value="${esc(ap)}"></div>`}
    ${inp('deadline','Deadline',t.deadline||'',{type:'date'})}${inp('submitted','Ngày nộp đạt cuối',t.submitted||'',{type:'date'})}
    ${mg?inp('bonus','Điểm thưởng nhập tay',t.bonusManual??'',{type:'number',step:'1',min:0,ph:'Để trống = tự động',attrs:'max="30"'}):`<input type="hidden" name="bonus" value="${esc(t.bonusManual??'')}">`}<div class="f ${mg?'':'full'}"><span>Điểm tạm tính</span><div class="hint" id="kt-prev" aria-live="polite">–</div></div>
    ${txa('note','Ghi chú / Link bằng chứng',t.note||'',{full:1,rows:3})}
    <p class="note full" style="padding:0">Việc bị trễ cần dời sang tháng sau: ghi <b>delays</b> vào Ghi chú để mở nút chuyển tháng.</p></div></form>`,
    {footer:(id&&canDelTask(empId,t)?`<button class="btn danger" data-act="kt-del" data-e="${empId}" data-y="${y}" data-mm="${mm}" data-id="${id}" style="margin-right:auto">Xoá việc</button>`:'')+cancelBtn+'<button class="btn primary" form="mf">Lưu</button>'});
  ktPreview();
}
function ktRead(form){const d=fd(form);return{title:(d.title||'').trim(),weight:numVN(d.weight),deadline:d.deadline||null,submitted:d.submitted||null,approval:d.approval||'',note:(d.note||'').trim(),bonus:d.bonus??''}}
function ktPreview(){const form=$('form[data-submit="kt-save"]'),el=$('#kt-prev');if(!form||!el)return;const d=ktRead(form),t={...d};if(d.bonus!=='')t.bonusManual=+d.bonus;const sc=scoreTask(t);
  el.textContent=sc.comp==null?(sc.state==='overdue'?`Chưa nộp · quá hạn ${sc.overdue} ngày`:sc.state==='rejected'?'Bị trả lại: tính điểm khi nộp bản sửa':'Chưa đủ deadline và ngày nộp để tính điểm'):`${fmtK2(sc.comp)} điểm = ${fmtK(sc.base)} × ${fmtK(sc.w)}%${sc.bonus?' + thưởng '+fmtK(sc.bonus)+'/100':''} · ${sc.late>0?'trễ '+sc.late+' ngày':sc.late<0?'sớm '+(-sc.late)+' ngày làm việc':'đúng hạn'}`}
document.addEventListener('input',e=>{if(e.target.closest&&e.target.closest('form[data-submit="kt-save"]'))ktPreview()});
ACT['kt-new']=el=>canSheet(el.dataset.e)&&taskForm(el.dataset.e,el.dataset.y,el.dataset.mm);
ACT['kt-edit']=el=>taskForm(el.dataset.e,el.dataset.y,el.dataset.mm,el.dataset.id);
SUB['kt-save']=form=>{
  const {e,y,mm,id}=form.dataset,d=ktRead(form),mg=can('manage'),cur=id?by((sheetOf(e,y)||{months:{[mm]:{tasks:[]}}}).months[mm].tasks,id):null;
  if(!canTask(e,cur))return toast('Bạn không có quyền sửa việc này.','error');
  if(!d.title)return toast('Nhập nội dung công việc.','error');
  if(!(d.weight>=0&&d.weight<=100))return toast('Trọng số phải từ 0 đến 100.','error');
  if(d.bonus!==''&&!(+d.bonus>=0&&+d.bonus<=BONUS_CAP))return toast(`Điểm thưởng nhập tay phải từ 0 đến ${BONUS_CAP}.`,'error');
  if(transact(()=>{const sh=sheetOf(e,y,true),list=sh.months[mm].tasks;let t=id?by(list,id):null;if(!t){t={id:uid('t')};list.push(t)}
    Object.assign(t,{title:d.title,weight:d.weight,deadline:d.deadline,submitted:d.submitted,note:d.note});
    if(mg){t.approval=d.approval;if(d.bonus==='')delete t.bonusManual;else t.bonusManual=+d.bonus}else if(t.approval===undefined)t.approval='';   /* duyệt và điểm thưởng nhập tay: chỉ quản lý */
    sh.updatedAt=todayStr()}))done(id?'Đã lưu việc':'Đã thêm việc');
};
ACT['kt-del']=el=>{const {e,y,mm,id}=el.dataset;if(!canDelTask(e,by((sheetOf(e,y)||{months:{[mm]:{tasks:[]}}}).months[mm].tasks,id)))return toast('Việc đã có ngày nộp hoặc đã được duyệt, chỉ quản lý xoá được.','error');if(!confirm('Xoá việc này? Việc sẽ không còn tính vào KPI của tháng.'))return;
  if(transact(()=>{const sh=sheetOf(e,y);sh.months[mm].tasks=sh.months[mm].tasks.filter(t=>t.id!==id);sh.updatedAt=todayStr()}))done('Đã xoá việc')};
SUB['cmt-save']=form=>{if(!can('manage'))return toast('Chỉ quản lý được nhận xét.','error');const {e,y,mm}=form.dataset,v=fd(form).comment.trim();
  if(transact(()=>{const sh=sheetOf(e,y,true);sh.months[mm].comment=v;sh.updatedAt=todayStr()})){rerender();toast('Đã lưu nhận xét')}};

/* ---------- chuyển việc "delays" sang tháng sau ---------- */
ACT['kt-move']=el=>{
  const {e,y,mm,id}=el.dataset,sh=sheetOf(e,y);if(!sh)return;
  if(!canSheet(e))return toast('Bạn không có quyền chuyển việc này.','error');
  const list=sh.months[mm].tasks.filter(t=>(id?t.id===id:true)&&carryReady(t,scoreTask(t)));
  if(!list.length)return toast('Chưa có việc nào ghi “delays” ở Ghi chú. Bấm Sửa một việc chưa nộp rồi ghi delays.','warn');
  const nx=nextOf(y,mm),n2=nextOf(nx.year,nx.mm),lastDay=isoOf(dayNum(`${n2.year}-${n2.mm}-01`)-1);
  modal(`Chuyển ${list.length} việc sang T${nx.mm}/${nx.year}`,`<form id="mf" data-submit="kt-move-do" data-e="${e}" data-y="${y}" data-mm="${mm}" data-ids="${list.map(t=>t.id).join(',')}">
    <ul class="mvl">${list.map(t=>`<li><b>${esc(t.title.split('\n')[0])}</b> <span class="muted">· ${esc(empName(e))} · trọng số ${fmtK(+t.weight||0)}%${t.deadline?' · deadline '+fmtDM(t.deadline,y):' · chưa đặt hạn'}</span></li>`).join('')}</ul>
    ${can('manage')?`<div class="f"><span>Deadline ở tháng mới</span>
      <label class="chk"><input type="radio" name="dl" value="keep" checked> Giữ deadline gốc. Ngày trễ tiếp tục được tính theo quy chế.</label>
      <label class="chk"><input type="radio" name="dl" value="new"> Dời deadline (quản lý phê duyệt): <input class="in" type="date" name="nd" value="${lastDay}" style="width:auto" aria-label="Deadline mới" onfocus="this.form.dl.value='new'"></label></div>`
      :'<input type="hidden" name="dl" value="keep"><p class="hint">Deadline gốc được giữ nguyên, ngày trễ tiếp tục được tính. Muốn dời deadline, hãy nhờ quản lý chuyển việc này.</p>'}
    <p class="note">Việc được ghi vào T${nx.mm}/${nx.year} và chấm điểm ở đó. Tháng ${mm} giữ lại một dòng “Đã chuyển”, không tính trọng số và điểm, có nút Hoàn tác. Chữ “delays” được gỡ khỏi ghi chú ở tháng mới.</p></form>`,
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
  return `<div class="slip"><div class="sh"><div class="co"><b>${esc(c.name||'')}</b><div>${esc(c.note||'')}</div></div><div style="text-align:right">Ngày in: ${fmtDate(todayStr())}<br>KPI khống chế: 0 – ${KPI_CAP}</div></div>
    <h2>PHIẾU ĐÁNH GIÁ KPI</h2><div class="sub">Tháng ${mm} / ${y}</div>
    <div class="mt"><div>Họ và tên: <b>${esc(e.name)}</b></div><div>Mã NV: <b>${esc(e.code)}</b></div><div>Nhóm: <b>${esc(e.dept||'—')}</b></div><div>Chức danh: <b>${esc(e.title||'—')}</b></div></div>
    <table><thead><tr><th>STT</th><th>Nội dung công việc / Đóng góp</th><th>Trọng số (%)</th><th>Deadline</th><th>Ngày nộp</th><th>Ngày trễ</th><th>Điểm cơ bản</th><th>Thưởng</th><th>Điểm TP</th><th>Ghi chú</th></tr></thead><tbody>
    ${st.rows.map((r,i)=>`<tr><td style="text-align:center">${i+1}</td><td style="white-space:pre-line">${esc(r.t.title)}</td><td style="text-align:right">${fmtK(r.sc.w)}</td><td>${fmtDate(r.t.deadline)}</td><td>${r.sc.state==='moved'?'Đã chuyển '+mLbl(r.t.movedTo.month,r.t.movedTo.year,y):fmtDate(r.t.submitted)}</td><td style="text-align:right">${r.sc.late??''}</td><td style="text-align:right">${r.sc.base??''}</td><td style="text-align:right">${r.sc.bonus||''}</td><td style="text-align:right"><b>${r.sc.comp==null?'':fmtK2(r.sc.comp)}</b></td><td style="white-space:pre-line">${esc(r.t.note||'')}</td></tr>`).join('')}
    <tr><td colspan="2"><b>KPI TỔNG THÁNG</b></td><td style="text-align:right"><b>${fmtK(st.weight)}</b></td><td colspan="5"></td><td style="text-align:right"><b>${fmtK2(st.kpi)}</b></td><td><b>${g?g[2]:''}</b></td></tr></tbody></table>
    <p style="margin-top:10px"><b>Nhận xét của quản lý:</b> ${esc((sh&&sh.months[mm].comment)||'')}</p>
    <p class="sn">Trễ 1 ngày −${LATE_PENALTY} điểm (ngày lịch) · Sớm 1 ngày làm việc +${BONUS_PER_DAY} điểm thưởng (tối đa ${BONUS_CAP}) · Điểm thành phần = (Điểm cơ bản × Trọng số + Thưởng) / 100 · Xếp loại: Xuất sắc ≥120, Tốt 100–119, Đạt 80–99, Cần cải thiện &lt;80.</p>
    <div class="sign" style="grid-template-columns:1fr 1fr"><div><b>Nhân viên tự đánh giá</b><br><small>(Ký, ghi rõ họ tên)</small></div><div><b>Quản lý duyệt</b><br><small>(Ký, ghi rõ họ tên)</small></div></div>
    <div style="margin-top:6px;font-size:10.5px;color:#777;text-align:right">${esc(CREDIT)}</div></div>`;
}
ACT['sheet-print']=el=>printHTML(slipHTML(el.dataset.e,el.dataset.y,el.dataset.mm));
ACT['sheet-pdf']=async el=>{const {e,y,mm}=el.dataset,box=offscreen(slipHTML(e,y,mm),1000);await pdfFromEls([box],`phieu-kpi_${slug(empOf(e).code)}_${y}-${mm}.pdf`,{landscape:true});box.remove()};
