/* 20-dashboard.js – Dashboard: Tổng quan, KPI theo tháng, Xếp hạng nhân viên */
'use strict';
(self.__mods=self.__mods||[]).push('20-dashboard');

/* ---------- khối hiển thị dùng chung ---------- */
const kpi=(l,v,s='',tone='')=>`<div class="kpi ${tone}"><div class="kl">${l}</div><div class="kv">${v}</div>${s?`<div class="ks">${s}</div>`:''}</div>`;
const card=(title,body,cls='')=>`<section class="card ${cls}">${title?`<h4>${title}</h4>`:''}${body}</section>`;
const miniTable=(heads,rows,empty='Không có dữ liệu.')=>rows.length?`<div class="tw"><table class="t"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:`<div class="note">${empty}</div>`;
const gradeBd=v=>{const g=gradeOf(v);return g?badge(g[1],g[2]):'<span class="muted">Chưa có điểm</span>'};
const gradeTone=v=>{const g=gradeOf(v);return g?(g[1]==='mute'?'':g[1]):''};
const kCell=v=>v==null?'<span class="muted">–</span>':`<span class="kc ${v<80?'low':v>=120?'top':''}">${fmtK(v)}</span>`;
const kBar=v=>v==null?'<span class="muted">Chưa có điểm</span>':`<div class="pgw"><div class="pg" style="flex:1"><i style="width:${Math.min(100,v/KPI_CAP*100)}%${v<80?';background:var(--bad)':''}"></i></div><small><b>${fmtK(v)}</b></small></div>`;
const empLink=e=>e?`<a class="lnk" href="${empHref(e)}">${esc(e.name)}</a>`:'<span class="muted">(đã xoá)</span>';
const empCell=e=>`<span class="mem">${empAv(e)}<span>${empLink(e)}<small>${esc(e.code||'')}${e.title?' · '+esc(e.title):''}</small></span></span>`;
const kc=(h,fn)=>({h,c:'num',f:r=>kCell(fn(r)),x:r=>{const v=fn(r);return v==null?'':r2(v)}});
const pctCol=(h,fn)=>({h,c:'num',f:r=>{const v=fn(r);return v==null?'–':fmtK(v)+'%'},x:r=>{const v=fn(r);return v==null?'':r2(v)}});
const badNum=n=>n?`<span class="tag-bad">${n}</span>`:'0';
function stBd(t,sc,year){
  switch(sc.state){
    case 'moved':return badge('mute','↪ Đã chuyển sang '+mLbl(t.movedTo.month,t.movedTo.year,year));
    case 'ontime':return badge('ok','✓ Đúng hạn');
    case 'early':return badge('ok',`▲ Sớm ${-sc.late} ngày`);
    case 'late':return badge(sc.late>10?'bad':'warn',`! Trễ ${sc.late} ngày`);
    case 'overdue':return badge('bad',`! Quá hạn ${sc.overdue} ngày`);
    case 'open':return badge('info','○ Đang làm');
    default:return badge('mute',t.submitted?'○ Thiếu deadline':'○ Chưa đặt hạn');
  }
}
const stText=(t,sc,year)=>strip(stBd(t,sc,year));
/* Phạm vi nhân viên theo bộ lọc năm / nhóm: đang theo dõi, hoặc đã có bảng KPI trong năm */
function scopeStats(f){const y=f.year||curYear();return sortedEmps().filter(e=>(!f.dept||e.dept===f.dept)&&(e.active!==false||sheetOf(e.id,y))).map(e=>({e,ys:empStats(e,y),has:!!sheetOf(e.id,y)}))}
const sumK=(rows,k)=>rows.reduce((a,r)=>a+r.ys[k],0);
const dueOf=(y,i)=>i===11?`${+y+1}-01-07`:`${y}-${MM[i+1]}-07`;   /* hạn nộp bản đánh giá: tuần đầu tháng sau */
const scopeBar=(extra='')=>{F().year??=curYear();return `<label class="fl">Năm ${fSel('year','Năm',yearOpts())}</label>${isStaff()?'':fSel('dept','Nhóm',deptOpts('Mọi nhóm'))}${extra}`};
const addBtns=()=>can('admin')?'<button class="btn" data-act="imp-open">⬆ Nhập Excel KPI</button><button class="btn acc" data-act="emp-new">＋ Thêm nhân viên</button>':'';

/* ---------- biểu đồ KPI: trục 0–130, vạch xếp loại 80 / 100 / 120, nhãn giá trị trên cột ---------- */
/* Biểu đồ hẹp (điện thoại) bỏ phần lề phải dành cho tên mốc xếp loại */
const padR=w=>w<420?6:86;
const kpiBands={id:'kpiBands',
  resize(c,a){const p=c.options.layout&&c.options.layout.padding;if(p&&typeof p==='object')p.right=padR(a.size.width)},
  beforeDatasetsDraw(c){const y=c.scales.y,a=c.chartArea,x=c.ctx;if(!y||!a)return;x.save();x.lineWidth=1;x.font="11px 'Be Vietnam Pro',system-ui,sans-serif";x.textAlign='left';x.textBaseline='middle';
    [[80,'Đạt 80'],[100,'Tốt 100'],[120,'Xuất sắc 120']].forEach(([v,l])=>{const py=y.getPixelForValue(v);x.setLineDash([4,4]);x.strokeStyle='#b4bdd2';x.beginPath();x.moveTo(a.left,py);x.lineTo(a.right,py);x.stroke();x.setLineDash([]);if(c.width-a.right>60){x.fillStyle='#6b7394';x.fillText(l,a.right+8,py)}});x.restore()},
  afterDatasetsDraw(c){const x=c.ctx;x.save();x.font="600 11px 'Be Vietnam Pro',system-ui,sans-serif";x.textAlign='center';x.textBaseline='bottom';x.lineJoin='round';
    c.data.datasets.forEach((ds,di)=>{if(!ds.showVal)return;const meta=c.getDatasetMeta(di);if(meta.hidden)return;const n=ds.data.filter(v=>v!=null).length,few=c.chartArea.width/Math.max(1,ds.data.length)<44;
      const vals=ds.data.map(v=>v==null?-1:v),mx=vals.indexOf(Math.max(...vals)),last=ds.data.reduce((a,v,i)=>v==null?a:i,-1);
      meta.data.forEach((el,i)=>{const v=ds.data[i];if(v==null)return;if(ds.showVal==='last'?i!==last:(few&&n>4&&i!==mx&&i!==last))return;const t=fmtK(v);x.strokeStyle='#fff';x.lineWidth=3;x.strokeText(t,el.x,el.y-5);x.fillStyle='#1f2544';x.fillText(t,el.x,el.y-5)})});x.restore()}};
const kpiScale=()=>({min:0,max:KPI_CAP,afterBuildTicks:s=>{s.ticks=[0,40,80,100,120,130].map(value=>({value}))},grid:{display:false},border:{display:false},ticks:{callback:v=>v}});
const kpiOpt=(extra={})=>baseOpt({layout:{padding:{right:86,top:22}},scales:{y:kpiScale(),x:{grid:{display:false}}},...extra});
const barColors=d=>d.map(v=>v!=null&&v<80?CC.low:CC.bar);
const kTip=(extraFn)=>({callbacks:{label:c=>{const v=c.raw;if(v==null)return ' Chưa có điểm';const g=gradeOf(v);return ` ${c.dataset.label}: ${fmtK2(v)}${g&&c.dataset.showVal?' · '+g[2]:''}`},afterBody:items=>extraFn?extraFn(items[0].dataIndex):[]}});
function kChart(id,cfg,label){cfg.plugins=[...(cfg.plugins||[]),kpiBands];const el=document.getElementById(id);if(el&&cfg.options&&cfg.options.layout)cfg.options.layout.padding.right=padR(el.parentElement.clientWidth);chart(id,cfg);const c=document.getElementById(id);if(c&&c.setAttribute){c.setAttribute('role','img');c.setAttribute('aria-label',label)}}

/* ---------- Tổng quan ---------- */
PAGES['dash/overview']={t:'Tổng quan',
  head(){return `<div class="bar">${scopeBar()}<div class="sp"></div>${addBtns()}</div>`},
  tbl(){
    const f=F(),y=f.year||curYear(),rows=scopeStats(f),ev=rows.filter(r=>r.ys.avg!=null);
    if(!db.employees.length)return `<div class="empty"><b>Chưa có nhân viên nào.</b><br>${can('admin')?'Nhập file Excel KPI cá nhân (mẫu KPI_Individual_report) của từng nhân viên, hoặc thêm nhân viên rồi nhập việc từng tháng.<br>Muốn xem thử: Settings → Sao lưu & Hệ thống → Nạp dữ liệu mẫu.':'Admin chưa thêm nhân viên vào hệ thống.'}<div class="bar" style="justify-content:center;margin:14px 0 0">${addBtns()}</div></div>`;
    const team=avgOf(ev.map(r=>r.ys.avg)),scored=sumK(rows,'scored'),onT=sumK(rows,'onTime'),over=sumK(rows,'overdue'),dl=sumK(rows,'delays'),open=sumK(rows,'open'),pend=sumK(rows,'pending'),rck=sumK(rows,'recheck');
    const mAvg=MM.map((_,i)=>avgOf(rows.map(r=>r.ys.months[i].kpi).filter(v=>v!=null)));
    const lastI=mAvg.reduce((a,v,i)=>v==null?a:i,-1);
    const cnt={ok:0,info:0,mute:0,bad:0};ev.forEach(r=>cnt[gradeOf(r.ys.avg)[1]]++);
    let miss=0;rows.forEach(r=>{if(!r.has)return;r.ys.months.forEach((m,i)=>{if(m.kpi==null&&todayStr()>dueOf(y,i))miss++})});
    const top=[...ev].sort((a,b)=>b.ys.avg-a.ys.avg).slice(0,6);
    const all=allRows(y).filter(r=>!f.dept||r.e.dept===f.dept);
    const overAll=all.filter(r=>r.sc.state==='overdue').sort((a,b)=>b.sc.overdue-a.sc.overdue),overdue=overAll.slice(0,15);
    const readyAll=all.filter(r=>carryReady(r.t,r.sc)),ready=readyAll.slice(0,15);
    const rckAll=all.filter(r=>r.sc.ap==='recheck'&&r.sc.state!=='moved'),pendRows=[];rows.forEach(r=>r.ys.months.forEach((m,i)=>{if(m.pending)pendRows.push({e:r.e,mm:MM[i],m})}));
    const dps=depts().map(d=>{const rs=ev.filter(r=>r.e.dept===d);return{d,n:rows.filter(r=>r.e.dept===d).length,avg:avgOf(rs.map(r=>r.ys.avg))}}).filter(x=>x.n);
    return `<div class="kpis k4">${kpi(`KPI trung bình ${f.dept?'nhóm '+esc(f.dept):'chung'} ${y}`,fmtK(team),team==null?'chưa có tháng nào có điểm được duyệt':`${gradeBd(team)} · ${ev.length}/${rows.length} nhân viên có điểm`,gradeTone(team)||'acc')}${kpi(lastI>=0?`KPI tháng gần nhất (T${MM[lastI]})`:'KPI tháng gần nhất',fmtK(lastI>=0?mAvg[lastI]:null),lastI>=0?gradeBd(mAvg[lastI]):'chưa có điểm','info')}${kpi('Hoàn thành đúng hạn',scored?fmtK(onT/scored*100)+'%':'–',scored?`${onT}/${scored} việc đã hoàn thành`:'chưa có việc hoàn thành','ok')}${kpi('Việc quá hạn',over,over?'xem bảng “Việc quá hạn” bên dưới':'không có việc quá hạn',over?'bad':'ok')}${kpi('Xuất sắc · Tốt',`${cnt.ok} · ${cnt.info}`,`Đạt ${cnt.mute} · Cần cải thiện ${cnt.bad}`,'ok')}${kpi('Chờ quản lý duyệt',pend,rck?`<span class="tag-bad">${rck} việc Re-check · không tính điểm</span>`:pend?'điểm chưa tính vào KPI, xem bảng bên dưới':`${open+over} việc chưa hoàn thành`,rck?'bad':pend?'warn':'info')}${kpi('Chờ chuyển tháng',dl,dl?'ghi chú có “delays”, xem bảng bên dưới':'không có việc ghi “delays”',dl?'warn':'')}${kpi('Tháng chưa có điểm',miss,miss?'đã quá tuần đầu tháng sau':'các tháng đã qua đều có điểm',miss?'warn':'ok')}</div>
    <div class="grid g2">${card(`KPI trung bình theo tháng – ${y}`,'<div class="ch"><canvas id="c1"></canvas></div><p class="note">Cột: trung bình KPI tháng của các nhân viên đã có điểm. Đường: lũy kế từ đầu năm. Tháng chưa có điểm không tính là 0; tháng đang diễn ra chỉ là tạm tính nên chưa đưa vào.</p>')}${card('Xếp loại theo KPI năm',ev.length?'<div class="ch"><canvas id="c2"></canvas></div>':'<div class="note">Chưa có nhân viên nào có điểm trong năm.</div>')}</div>
    <div class="grid g3">
      ${card('KPI năm cao nhất',top.length?`<div class="lst">${top.map((r,i)=>`<div style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><span>${i+1}. ${empLink(r.e)} <small class="muted">${esc(r.e.dept||'')}</small></span>${gradeBd(r.ys.avg)}</div>${kBar(r.ys.avg)}</div>`).join('')}</div><p class="note"><a href="#/dash/rank">Xem bảng xếp hạng đầy đủ →</a></p>`:'<div class="note">Chưa có điểm.</div>')}
      ${card('Theo nhóm',dps.length?`<div class="lst">${dps.map(x=>`<div style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(x.d)}</b><small class="muted">${x.n} nhân viên</small></div>${kBar(x.avg)}</div>`).join('')}</div><p class="note"><a href="#/emp/dept">Chi tiết theo nhóm →</a></p>`:'<div class="note">Chưa gán nhóm cho nhân viên.</div>')}
      ${card('Nhân viên cần lưu ý',(()=>{const w=rows.filter(r=>r.ys.overdue||(r.ys.avg!=null&&r.ys.avg<80)||(r.ys.last!=null&&r.ys.months[r.ys.last].kpi<80)).slice(0,6);return w.length?`<div class="lst">${w.map(r=>`<div><span class="mem">${empAv(r.e)}<span><b>${empLink(r.e)}</b><small>${r.ys.avg!=null?'KPI năm '+fmtK(r.ys.avg):'chưa có điểm'}${r.ys.last!=null?' · T'+MM[r.ys.last]+' '+fmtK(r.ys.months[r.ys.last].kpi):''}</small></span></span>${r.ys.overdue?badge('bad',r.ys.overdue+' quá hạn'):badge('warn','KPI dưới 80')}</div>`).join('')}</div>`:'<div class="note">Không có nhân viên nào dưới chuẩn hoặc có việc quá hạn.</div>'})())}
    </div>
    <div class="grid g2">
      ${card(`Việc quá hạn (${overAll.length})${overAll.length>overdue.length?' · 15 việc lâu nhất':''}`,miniTable(['Công việc / nhân viên','Tháng','Deadline','Quá hạn'],overdue.map(r=>`<tr><td>${esc(r.t.title.split('\n')[0])}<small>${esc(r.e.name)}</small></td><td><a class="lnk" href="${empHref(r.e)}" data-act="goto-month" data-id="${r.e.id}" data-y="${y}" data-mm="${r.mm}">T${r.mm}</a></td><td style="white-space:nowrap">${fmtDM(r.t.deadline,y)}</td><td>${badge('bad',r.sc.overdue+' ngày')}</td></tr>`),'Không có việc quá hạn.'))}
      ${card(`Chờ chuyển sang tháng sau · ghi chú “delays” (${readyAll.length})`,miniTable(['Công việc / nhân viên','Tháng','Deadline',''],ready.map(r=>`<tr><td>${esc(r.t.title.split('\n')[0])}<small>${esc(r.e.name)}</small></td><td>T${r.mm}</td><td style="white-space:nowrap">${fmtDM(r.t.deadline,y)}</td><td class="act"><a class="lnk" href="${empHref(r.e)}" data-act="goto-month" data-id="${r.e.id}" data-y="${y}" data-mm="${r.mm}">Mở T${r.mm} →</a></td></tr>`),'Chưa có việc nào ghi “delays”. Khi một việc bị trễ cần dời, bấm Sửa việc đó và ghi <b>delays</b> vào Ghi chú để bật nút chuyển tháng.')+(readyAll.length?'<p class="note">Mở tháng của nhân viên, bấm <b>Sửa</b> ở việc cần dời rồi chọn <b>Chuyển sang tháng sau</b>.</p>':''))}
    </div>
    <div class="grid g2">
      ${card(`Chờ quản lý duyệt (${pend} việc)`,miniTable(['Nhân viên','Tháng','Chờ duyệt','KPI hiện tại → nếu duyệt hết',''],pendRows.slice(0,15).map(p=>`<tr><td>${empLink(p.e)}<small>${esc(p.e.dept||'')}</small></td><td><a class="lnk" href="${empHref(p.e)}" data-act="goto-month" data-id="${p.e.id}" data-y="${y}" data-mm="${p.mm}">T${p.mm}</a></td><td class="num">${p.m.pending}</td><td style="white-space:nowrap">${fmtK(mVal(p.m))} → <b>${fmtK(p.m.self)}</b></td><td class="act">${can('manage')?`<button class="btn sm" data-act="ap-all" data-e="${p.e.id}" data-y="${y}" data-mm="${p.mm}" aria-label="Duyệt ${p.m.pending} việc chờ duyệt của ${esc(p.e.name)} tháng ${p.mm}">✓ Duyệt</button>`:''}</td></tr>`),'Không có việc nào đang chờ duyệt.')+(pendRows.length?`<p class="note">Điểm thành phần chỉ tính vào KPI khi quản lý chọn <b>Duyệt</b>.${pendRows.length>15?` Đang hiện 15/${pendRows.length} dòng.`:''}</p>${can('manage')?`<div class="bar" style="margin:0"><button class="btn" data-act="ap-all" data-y="${y}" data-dept="${esc(f.dept||'')}">✓ Duyệt tất cả ${pend} việc chờ duyệt</button></div>`:''}`:''))}
      ${card(`Việc Re-check · không tính điểm (${rckAll.length})`,miniTable(['Công việc / nhân viên','Tháng','Điểm thành phần'],rckAll.slice(0,15).map(r=>`<tr class="recheck"><td>${esc(r.t.title.split('\n')[0])}<small>${esc(r.e.name)}</small></td><td><a class="lnk" href="${empHref(r.e)}" data-act="goto-month" data-id="${r.e.id}" data-y="${y}" data-mm="${r.mm}">T${r.mm}</a></td><td class="num">${r.sc.comp==null?'–':fmtK2(r.sc.comp)}<small class="tag-bad">không tính</small></td></tr>`),'Không có việc nào bị Re-check.'))}
    </div>`;
  },
  tm(){
    const f=F(),y=f.year||curYear(),rows=scopeStats(f),ev=rows.filter(r=>r.ys.avg!=null);if(!db.employees.length)return;
    const mAvg=MM.map((_,i)=>avgOf(rows.map(r=>r.ys.months[i].kpi).filter(v=>v!=null))),mN=MM.map((_,i)=>rows.filter(r=>r.ys.months[i].kpi!=null).length);
    let s=0,n=0;const cum=mAvg.map(v=>{if(v==null)return null;s+=v;n++;return s/n});
    kChart('c1',{data:{labels:MM.map(m=>'T'+m),datasets:[
      {type:'line',label:'Lũy kế từ đầu năm',data:cum,borderColor:CC.line,backgroundColor:CC.line,tension:.3,pointRadius:3.5,pointBorderColor:'#fff',pointBorderWidth:2,borderWidth:2,spanGaps:true,order:0},
      {type:'bar',label:'KPI trung bình tháng',data:mAvg,backgroundColor:barColors(mAvg),showVal:true,order:1}]},
      options:kpiOpt({plugins:{legend:{position:'bottom'},tooltip:kTip(i=>mN[i]?[`${mN[i]} nhân viên có điểm`]:[])}})},
      `KPI trung bình theo tháng năm ${y}: `+(mAvg.some(v=>v!=null)?mAvg.map((v,i)=>v==null?null:`T${MM[i]} ${fmtK(v)}`).filter(Boolean).join(', '):'chưa có điểm'));
    if(ev.length){const cnt={ok:0,info:0,mute:0,bad:0};ev.forEach(r=>cnt[gradeOf(r.ys.avg)[1]]++);
      chart('c2',{type:'doughnut',data:{labels:GRADES.map(g=>`${g[2]} (${cnt[g[1]]})`),datasets:[{data:GRADES.map(g=>cnt[g[1]]),backgroundColor:[CC.xs,CC.tot,CC.dat,CC.cct],borderWidth:2,borderColor:'#fff'}]},options:baseOpt({cutout:'62%',plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c=>` ${c.raw} nhân viên`}}}})});
      const c=document.getElementById('c2');if(c){c.setAttribute('role','img');c.setAttribute('aria-label','Số nhân viên theo xếp loại: '+GRADES.map(g=>`${g[2]} ${cnt[g[1]]}`).join(', '))}}
  }};
/* Mở thẳng một tháng của nhân viên */
ACT['goto-month']=(el,e)=>{e&&e.preventDefault();const k=isStaff()?'dash/me':'emp/'+el.dataset.id;(ui.f[k]??={}).year=String(el.dataset.y);ui.f[k].mm=el.dataset.mm;if(location.hash==='#/'+k)render(false);else location.hash='#/'+k};

/* ---------- KPI theo tháng (ma trận nhân viên × 12 tháng) ---------- */
PAGES['dash/month']={t:'KPI theo tháng',
  head(){return `<div class="bar">${scopeBar()}<div class="sp"></div>${rptBtns('kpi-theo-thang')}</div>`},
  sub(){const f=F();return `Năm ${f.year||curYear()}${f.dept?' · '+f.dept:''}`},
  tbl(){
    const f=F(),y=f.year||curYear(),rows=scopeStats(f);
    const foot=rows.length?`<tr><td colspan="2">Trung bình</td>${MM.map((_,i)=>`<td class="num">${fmtK(avgOf(rows.map(r=>r.ys.months[i].kpi).filter(v=>v!=null)))}</td>`).join('')}<td class="num">${fmtK(avgOf(rows.map(r=>r.ys.avg).filter(v=>v!=null)))}</td><td></td></tr>`:'';
    return `<div class="card"><h4>KPI trung bình theo tháng của từng nhóm – ${y}</h4><div class="ch"><canvas id="c1"></canvas></div></div>`+table([
      {h:'Nhân viên',f:r=>empCell(r.e),x:r=>r.e.name},{h:'Nhóm',f:r=>esc(r.e.dept||'—')},
      ...MM.map((m,i)=>({h:'T'+m,c:'num',f:r=>`<a class="kl-m" href="${empHref(r.e)}" data-act="goto-month" data-id="${r.e.id}" data-y="${y}" data-mm="${m}" title="Mở tháng ${m}${r.ys.months[i].prov?' (tạm tính)':''}">${r.ys.months[i].prov?`<i class="muted">${fmtK(r.ys.months[i].kpiProv)}*</i>`:kCell(r.ys.months[i].kpi)}</a>`,x:r=>mVal(r.ys.months[i])==null?'':r2(mVal(r.ys.months[i]))})),
      {h:'TB năm',c:'num',f:r=>`<b>${fmtK(r.ys.avg)}</b>`,x:r=>r.ys.avg==null?'':r2(r.ys.avg)},{h:'Xếp loại',f:r=>gradeBd(r.ys.avg),x:r=>gradeOf(r.ys.avg)?.[2]||''}
    ],rows,{empty:'Chưa có nhân viên nào trong phạm vi lọc.',foot})+'<p class="note">* Tháng đang diễn ra: điểm tạm tính, chưa đưa vào trung bình năm.</p>';
  },
  tm(){
    const f=F(),y=f.year||curYear(),rows=scopeStats(f);if(!rows.length)return;
    const groups=f.dept?rows.map(r=>[r.e.name,[r]]).slice(0,8):depts().map(d=>[d,rows.filter(r=>r.e.dept===d)]).filter(g=>g[1].length).slice(0,8);
    if(!f.dept){const none=rows.filter(r=>!r.e.dept);if(none.length)groups.push(['Chưa gán nhóm',none])}
    kChart('c1',{type:'line',data:{labels:MM.map(m=>'T'+m),datasets:groups.map(([l,rs],i)=>({label:l,data:MM.map((_,k)=>avgOf(rs.map(r=>r.ys.months[k].kpi).filter(v=>v!=null))),borderColor:PAL[i%PAL.length],backgroundColor:PAL[i%PAL.length],tension:.3,pointRadius:3.5,pointBorderColor:'#fff',pointBorderWidth:2,borderWidth:2,spanGaps:true}))},
      options:kpiOpt({interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom'},tooltip:kTip()}})},`KPI trung bình theo tháng năm ${y}, mỗi đường là một ${f.dept?'nhân viên':'nhóm'}. Số liệu đầy đủ ở bảng bên dưới.`);
  }};

/* ---------- Xếp hạng nhân viên: theo tháng / quý / năm ---------- */
const RK={thang:'Tháng',quy:'Quý',nam:'Năm'};
function rankCtx(f){
  const y=f.year||curYear(),rows=scopeStats(f),per=RK[f.per]?f.per:'thang';
  /* kỳ mặc định = tháng / quý gần nhất đã có điểm; chỉ ghi nhớ khi người dùng tự chọn */
  let rm=f.rm,rq=f.rq;
  if(!MM.includes(rm)){let li=-1;rows.forEach(r=>r.ys.months.forEach((m,i)=>{if(mVal(m)!=null&&i>li)li=i}));rm=MM[li>=0?li:new Date().getMonth()]}
  if(!['0','1','2','3'].includes(rq)){let lq=-1;rows.forEach(r=>r.ys.quarters.forEach((q,i)=>{if(q.avg!=null&&i>lq)lq=i}));rq=String(lq>=0?lq:Math.floor(new Date().getMonth()/3))}
  const mi=+rm-1,qi=+rq,n=per==='thang'?12:per==='quy'?4:1,cur=per==='thang'?mi:per==='quy'?qi:0;
  const val=(r,i)=>per==='thang'?mVal(r.ys.months[i]):per==='quy'?r.ys.quarters[i].avg:r.ys.avg;
  /* thứ hạng của từng nhân viên ở từng kỳ (chỉ xếp người đã có điểm trong kỳ đó) */
  const ranks=Array.from({length:n},(_,i)=>{const m=new Map();rows.filter(r=>val(r,i)!=null).sort((a,b)=>val(b,i)-val(a,i)).forEach((r,k)=>m.set(r.e.id,k+1));return m});
  const list=rows.map(r=>({...r,v:val(r,cur),rk:ranks[cur].get(r.e.id)||null,prev:cur>0?(ranks[cur-1].get(r.e.id)||null):null})).sort((a,b)=>(a.rk??1e9)-(b.rk??1e9)||String(a.e.name).localeCompare(String(b.e.name),'vi'));
  return{y,per,mi,qi,rm,rq,n,cur,ranks,list,val,rows,
    label:per==='thang'?`tháng ${rm}/${y}`:per==='quy'?`${QN[qi]} năm ${y}`:`năm ${y}`,unit:per==='thang'?'tháng':'quý',
    prov:per==='thang'&&rows.some(r=>r.ys.months[mi].prov)};
}
const rkDelta=r=>!r.rk?'–':r.prev==null?'<span class="muted">mới</span>':r.prev>r.rk?`<span class="pos">▲ ${r.prev-r.rk}</span>`:r.prev<r.rk?`<span class="neg">▼ ${r.rk-r.prev}</span>`:'<span class="muted">=</span>';
PAGES['dash/rank']={t:'Xếp hạng nhân viên',
  head(){return `<div class="bar">${scopeBar()}<div class="sp"></div>${rptBtns('xep-hang-kpi')}</div>`},
  sub(){const f=F(),c=rankCtx(f);return `Xếp hạng ${c.label}${f.dept?' · nhóm '+f.dept:''}`},
  tbl(){
    const f=F(),c=rankCtx(f),has=c.list.some(r=>r.rk);
    return `<div class="bar"><div class="seg" role="group" aria-label="Kỳ xếp hạng">${Object.entries(RK).map(([k,l])=>`<button type="button" data-act="setf" data-k="per" data-v="${k}" aria-pressed="${c.per===k}" class="${c.per===k?'on':''}">${l}</button>`).join('')}</div>${c.per==='thang'?`<select class="in" data-f="rm" aria-label="Tháng xếp hạng">${MM.map(m=>`<option value="${m}" ${m===c.rm?'selected':''}>Tháng ${m}</option>`).join('')}</select>`:c.per==='quy'?`<select class="in" data-f="rq" aria-label="Quý xếp hạng">${QN.map((n,i)=>`<option value="${i}" ${String(i)===c.rq?'selected':''}>${n} (${QR[i]})</option>`).join('')}</select>`:''}${c.prov?badge('info','Tháng chưa kết thúc · điểm tạm tính'):''}</div>
    ${has?`<div class="grid ${c.per==='nam'?'':'g2'}">${card(`Xếp hạng KPI ${c.label}`,'<div class="ch tall"><canvas id="c1"></canvas></div><p class="note">Cột xếp từ cao xuống thấp. Vạch ngang: mốc xếp loại 80 · 100 · 120. Cột đỏ: dưới 80.</p>')}${c.per==='nam'?'':card(`Thứ hạng qua các ${c.unit} – ${c.y}`,`<div class="ch tall"><canvas id="c2"></canvas></div><p class="note">Mỗi đường là một nhân viên, hạng 1 ở trên cùng. Hiện tối đa 8 người đứng đầu ${c.label}; ${c.unit} nào chưa có điểm thì đường bị ngắt.</p>`)}</div>`:`<div class="empty">Chưa có nhân viên nào có điểm trong ${c.label}.</div>`}`+
    table([
      {h:'Hạng',c:'num',f:r=>r.rk?`<b>${r.rk}</b>`:'–',x:r=>r.rk||''},
      ...(c.per==='nam'?[]:[{h:`So với ${c.unit} trước`,c:'num',f:rkDelta,x:r=>!r.rk?'':r.prev==null?'mới':r.prev-r.rk}]),
      {h:'Nhân viên',f:r=>empCell(r.e),x:r=>r.e.name},{h:'Nhóm',f:r=>esc(r.e.dept||'—')},
      {h:`KPI ${c.label}`,f:r=>kBar(r.v),x:r=>r.v==null?'':r2(r.v)},{h:'Xếp loại',f:r=>r.v==null?gradeBd(null):c.prov?badge('info','Tạm tính'):gradeBd(r.v),x:r=>r.v==null?'':c.prov?'Tạm tính':gradeOf(r.v)[2]},
      ...(c.per==='nam'?[nc('Tháng có điểm',r=>r.ys.ev.length),kc('Cao nhất',r=>r.ys.maxI==null?null:r.ys.months[r.ys.maxI].kpi),kc('Thấp nhất',r=>r.ys.minI==null?null:r.ys.months[r.ys.minI].kpi)]:[kc('KPI năm',r=>r.ys.avg)]),
      pctCol('Đúng hạn (năm)',r=>r.ys.onPct),nc('Việc trễ',r=>r.ys.late),nc('Chưa hoàn thành',r=>r.ys.open),nc('Chờ duyệt',r=>r.ys.pending),{h:'Quá hạn',c:'num',f:r=>badNum(r.ys.overdue),x:r=>r.ys.overdue}
    ],c.list,{empty:'Chưa có nhân viên nào trong phạm vi lọc.'});
  },
  tm(){
    const f=F(),c=rankCtx(f),R=c.list.filter(r=>r.rk).slice(0,24);if(!R.length)return;
    const d=R.map(r=>r.v);
    kChart('c1',{type:'bar',data:{labels:R.map(r=>`${r.rk}. ${String(r.e.name).trim().split(/\s+/).slice(-2).join(' ')}`),datasets:[{label:`KPI ${c.label}`,data:d,backgroundColor:c.prov?d.map(()=>'#b7cdec'):barColors(d),showVal:true}]},
      options:kpiOpt({plugins:{legend:{display:false},tooltip:kTip(i=>[`Hạng ${R[i].rk} · ${R[i].e.name}`,R[i].e.code+(R[i].e.dept?' · '+R[i].e.dept:'')])}})},
      `Xếp hạng KPI ${c.label}: `+R.map(r=>`hạng ${r.rk} ${r.e.name} ${fmtK(r.v)}`).join(', '));
    if(c.per==='nam')return;
    /* biểu đồ thứ hạng: trục dọc là hạng (1 ở trên), trục ngang là 12 tháng hoặc 4 quý */
    const top=R.slice(0,8),labels=c.per==='thang'?MM.map(m=>'T'+m):QN,maxRk=Math.max(2,...c.ranks.map(m=>m.size));
    chart('c2',{type:'line',data:{labels,datasets:top.map((r,i)=>({label:r.e.name,data:c.ranks.map(m=>m.get(r.e.id)??null),borderColor:PAL[i%PAL.length],backgroundColor:PAL[i%PAL.length],borderWidth:2,pointRadius:4,pointHoverRadius:6,pointBorderColor:'#fff',pointBorderWidth:2,cubicInterpolationMode:'monotone',spanGaps:false}))},
      options:baseOpt({interaction:{mode:'nearest',intersect:false},scales:{y:{reverse:true,min:1,max:maxRk,offset:true,ticks:{stepSize:1,precision:0,callback:v=>'Hạng '+v},grid:{color:'#eef0f6'}},x:{grid:{display:false}}},
        plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:x=>{const r=top[x.datasetIndex],v=c.val(r,x.dataIndex);return ` ${r.e.name}: hạng ${x.raw}${v!=null?' · KPI '+fmtK(v):''}`}}}}})});
    const el=document.getElementById('c2');if(el){el.setAttribute('role','img');el.setAttribute('aria-label',`Thứ hạng qua các ${c.unit} năm ${c.y}: `+top.map(r=>`${r.e.name} `+c.ranks.map((m,i)=>m.get(r.e.id)?`${labels[i]} hạng ${m.get(r.e.id)}`:null).filter(Boolean).join(', ')).join('; '))}
  }};
