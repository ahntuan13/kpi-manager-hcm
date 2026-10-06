/* 31-reports.js – Báo cáo: theo nhân viên (năm), theo tháng, theo quý, theo nhóm. Mọi báo cáo xuất được Excel / PDF / In. */
'use strict';
(self.__mods=self.__mods||[]).push('31-reports');

const scopeSub=f=>`Năm ${f.year||curYear()}${f.dept?' · '+f.dept:' · mọi nhóm'}`;
const shortName=n=>{n=String(n);return n.length>18?n.slice(0,17)+'…':n};
function empBarChart(rows,vals,label,aria){if(!rows.length)return;const R=rows.slice(0,24),d=vals.slice(0,24);
  kChart('c1',{type:'bar',data:{labels:R.map(r=>shortName(r.e.name)),datasets:[{label,data:d,backgroundColor:barColors(d),showVal:true}]},options:kpiOpt({plugins:{legend:{display:false},tooltip:kTip(i=>[R[i].e.code+(R[i].e.dept?' · '+R[i].e.dept:'')])}})},aria+': '+R.map((r,i)=>`${r.e.name} ${fmtK(d[i])}`).join(', '))}

/* ---------- theo nhân viên (cả năm) ---------- */
PAGES['rpt/employee']={t:'Báo cáo KPI theo nhân viên',
  sub(){return scopeSub(F())},
  head(){return `<div class="bar">${scopeBar()}<div class="sp"></div>${rptBtns('bao-cao-kpi-nhan-vien')}</div>`},
  tbl(){
    const f=F(),y=f.year||curYear(),rows=scopeStats(f);
    const A=fn=>fmtK(avgOf(rows.map(fn).filter(v=>v!=null)));
    return (rows.length?`<div class="card"><h4>KPI trung bình năm ${y} của từng nhân viên</h4><div class="ch"><canvas id="c1"></canvas></div></div>`:'')+table([
      {h:'Mã NV',f:r=>`<span style="white-space:nowrap">${esc(r.e.code)}</span>`,x:r=>r.e.code},{h:'Nhân viên',f:r=>empLink(r.e),x:r=>r.e.name},{h:'Nhóm',f:r=>esc(r.e.dept||'—')},
      ...QN.map((n,k)=>kc(n,r=>r.ys.quarters[k].avg)),
      {h:'TB năm',c:'num',f:r=>`<b>${fmtK(r.ys.avg)}</b>`,x:r=>r.ys.avg==null?'':r2(r.ys.avg)},{h:'Xếp loại',f:r=>gradeBd(r.ys.avg),x:r=>gradeOf(r.ys.avg)?.[2]||''},
      nc('Tháng đã chấm',r=>r.ys.ev.length),nc('Số việc',r=>r.ys.tasks),nc('Đã chấm',r=>r.ys.scored),pctCol('Đúng hạn',r=>r.ys.onPct),nc('Nộp trễ',r=>r.ys.late),nc('Chưa nộp',r=>r.ys.open),{h:'Quá hạn',c:'num',f:r=>badNum(r.ys.overdue),x:r=>r.ys.overdue}
    ],rows,{empty:'Chưa có nhân viên nào trong phạm vi lọc.',foot:rows.length?`<tr><td colspan="3">Trung bình / Tổng</td>${[0,1,2,3].map(k=>`<td class="num">${A(r=>r.ys.quarters[k].avg)}</td>`).join('')}<td class="num">${A(r=>r.ys.avg)}</td><td></td><td></td><td class="num">${sumK(rows,'tasks')}</td><td class="num">${sumK(rows,'scored')}</td><td></td><td class="num">${sumK(rows,'late')}</td><td class="num">${sumK(rows,'open')}</td><td class="num">${sumK(rows,'overdue')}</td></tr>`:''});
  },
  tm(){const f=F(),rows=scopeStats(f).filter(r=>r.ys.avg!=null).sort((a,b)=>b.ys.avg-a.ys.avg);empBarChart(rows,rows.map(r=>r.ys.avg),'KPI trung bình năm',`KPI trung bình năm ${f.year||curYear()} của từng nhân viên`)}};

/* ---------- theo tháng ---------- */
PAGES['rpt/monthly']={t:'Báo cáo KPI theo tháng',
  sub(){const f=F();return `Tháng ${f.mm}/${f.year||curYear()}${f.dept?' · '+f.dept:' · mọi nhóm'}`},
  head(){const f=F();if(!MM.includes(f.mm)){const d=new Date();d.setMonth(d.getMonth()-1);f.mm=pad(d.getMonth()+1);f.year??=String(d.getFullYear())}
    return `<div class="bar">${scopeBar(fSel('mm','Tháng',MM.map(m=>[m,'Tháng '+m])))}<div class="sp"></div>${rptBtns('bao-cao-kpi-thang')}</div>`},
  tbl(){
    const f=F(),y=f.year||curYear(),i=+f.mm-1,rows=scopeStats(f).map(r=>({...r,m:r.ys.months[i],v:mVal(r.ys.months[i]),cm:(sheetOf(r.e.id,y)?.months[f.mm].comment)||''}));
    const prov=rows.some(r=>r.m.prov),ev=rows.filter(r=>r.v!=null),av=avgOf(ev.map(r=>r.v)),S=k=>rows.reduce((a,r)=>a+r.m[k],0),scored=S('scored');
    return `<div class="kpis sm">${kpi(`KPI trung bình T${f.mm}${prov?' (tạm tính)':''}`,fmtK(av),av==null?'chưa có điểm':`${prov?badge('info','Tháng chưa kết thúc'):gradeBd(av)} · ${ev.length}/${rows.length} nhân viên`,prov?'info':(gradeTone(av)||'acc'))}${kpi('Nộp đúng hạn',scored?fmtK((S('ontime')+S('early'))/scored*100)+'%':'–',`${S('ontime')+S('early')}/${scored} việc đã chấm`,'ok')}${kpi('Nộp trễ',S('late'),'việc đã nộp sau deadline','warn')}${kpi('Chưa nộp · Quá hạn',`${S('open')+S('nodate')} · ${S('overdue')}`,`${S('delays')} việc ghi “delays”`,S('overdue')?'bad':'info')}</div>`+
    (ev.length?`<div class="card"><h4>KPI tháng ${f.mm}/${y} của từng nhân viên</h4><div class="ch"><canvas id="c1"></canvas></div></div>`:'')+table([
      {h:'Mã NV',f:r=>`<span style="white-space:nowrap">${esc(r.e.code)}</span>`,x:r=>r.e.code},{h:'Nhân viên',f:r=>`<a class="lnk" href="${empHref(r.e)}" data-act="goto-month" data-id="${r.e.id}" data-y="${y}" data-mm="${f.mm}">${esc(r.e.name)}</a>`,x:r=>r.e.name},{h:'Nhóm',f:r=>esc(r.e.dept||'—')},
      {h:`KPI T${f.mm}`,f:r=>kBar(r.v),x:r=>r.v==null?'':r2(r.v)},{h:'Xếp loại',f:r=>r.m.prov?badge('info','Tạm tính'):gradeBd(r.m.kpi),x:r=>r.m.prov?'Tạm tính':(gradeOf(r.m.kpi)?.[2]||'')},
      nc('Số việc',r=>r.m.n),nc('Đã chấm',r=>r.m.scored),{h:'Tổng trọng số',c:'num',f:r=>r.m.n?(Math.abs(r.m.weight-100)<0.01?'100%':`<span class="tag-warn">${fmtK(r.m.weight)}%</span>`):'–',x:r=>r.m.n?r.m.weight:''},
      nc('Đúng hạn',r=>r.m.ontime),nc('Sớm',r=>r.m.early),nc('Trễ',r=>r.m.late),nc('Chưa nộp',r=>r.m.open+r.m.nodate),{h:'Quá hạn',c:'num',f:r=>badNum(r.m.overdue),x:r=>r.m.overdue},nc('Đã chuyển tháng',r=>r.m.moved),
      {h:'Nhận xét của quản lý',c:'nt',f:r=>esc(r.cm),x:r=>r.cm}
    ],rows,{empty:'Chưa có nhân viên nào trong phạm vi lọc.'});
  },
  tm(){const f=F(),i=+f.mm-1,rows=scopeStats(f).filter(r=>mVal(r.ys.months[i])!=null).sort((a,b)=>mVal(b.ys.months[i])-mVal(a.ys.months[i]));empBarChart(rows,rows.map(r=>mVal(r.ys.months[i])),`KPI tháng ${f.mm}`,`KPI tháng ${f.mm} năm ${f.year||curYear()} của từng nhân viên`)}};

/* ---------- theo quý ---------- */
PAGES['rpt/quarter']={t:'Báo cáo KPI theo quý',
  sub(){const f=F();return `${QN[+f.qq||0]} (${QR[+f.qq||0]}) · ${scopeSub(f)}`},
  head(){const f=F();f.qq??=String(Math.floor(new Date().getMonth()/3));return `<div class="bar">${scopeBar(fSel('qq','Quý',QN.map((n,i)=>[String(i),`${n} (${QR[i]})`])))}<div class="sp"></div>${rptBtns('bao-cao-kpi-quy')}</div>`},
  tbl(){
    const f=F(),y=f.year||curYear(),q=+f.qq||0,rows=scopeStats(f),ms=[0,1,2].map(k=>q*3+k);
    const A=fn=>fmtK(avgOf(rows.map(fn).filter(v=>v!=null))),ev=rows.filter(r=>r.ys.quarters[q].avg!=null);
    return (ev.length?`<div class="card"><h4>KPI trung bình ${QN[q]} năm ${y} của từng nhân viên</h4><div class="ch"><canvas id="c1"></canvas></div></div>`:'')+table([
      {h:'Mã NV',f:r=>`<span style="white-space:nowrap">${esc(r.e.code)}</span>`,x:r=>r.e.code},{h:'Nhân viên',f:r=>empLink(r.e),x:r=>r.e.name},{h:'Nhóm',f:r=>esc(r.e.dept||'—')},
      ...ms.map(i=>kc('T'+MM[i],r=>r.ys.months[i].kpi)),
      {h:`TB ${QN[q]}`,f:r=>kBar(r.ys.quarters[q].avg),x:r=>r.ys.quarters[q].avg==null?'':r2(r.ys.quarters[q].avg)},{h:'Xếp loại',f:r=>gradeBd(r.ys.quarters[q].avg),x:r=>gradeOf(r.ys.quarters[q].avg)?.[2]||''},
      nc('Tháng đã chấm',r=>r.ys.quarters[q].n),nc('Số việc',r=>ms.reduce((a,i)=>a+r.ys.months[i].n,0)),nc('Nộp trễ',r=>ms.reduce((a,i)=>a+r.ys.months[i].late,0)),{h:'Quá hạn',c:'num',f:r=>badNum(ms.reduce((a,i)=>a+r.ys.months[i].overdue,0)),x:r=>ms.reduce((a,i)=>a+r.ys.months[i].overdue,0)}
    ],rows,{empty:'Chưa có nhân viên nào trong phạm vi lọc.',foot:rows.length?`<tr><td colspan="3">Trung bình</td>${ms.map(i=>`<td class="num">${A(r=>r.ys.months[i].kpi)}</td>`).join('')}<td class="num">${A(r=>r.ys.quarters[q].avg)}</td><td colspan="5"></td></tr>`:''});
  },
  tm(){const f=F(),q=+f.qq||0,rows=scopeStats(f).filter(r=>r.ys.quarters[q].avg!=null).sort((a,b)=>b.ys.quarters[q].avg-a.ys.quarters[q].avg);empBarChart(rows,rows.map(r=>r.ys.quarters[q].avg),`KPI trung bình ${QN[q]}`,`KPI trung bình ${QN[q]} năm ${f.year||curYear()} của từng nhân viên`)}};

/* ---------- theo nhóm ---------- */
PAGES['rpt/dept']={t:'Báo cáo KPI theo nhóm',
  sub(){return 'Năm '+(F().year||curYear())},
  head(){F().year??=curYear();return `<div class="bar"><label class="fl">Năm ${fSel('year','Năm',yearOpts())}</label><div class="sp"></div>${rptBtns('bao-cao-kpi-nhom')}</div>`},
  tbl(){const f=F(),rows=deptRows(f);return (rows.length?`<div class="card"><h4>KPI trung bình năm ${f.year||curYear()} theo nhóm</h4><div class="ch"><canvas id="c1"></canvas></div></div>`:'')+table(deptCols(),rows,{empty:'Chưa có nhân viên nào.'})},
  tm(){const f=F();deptChart(deptRows(f),f.year||curYear())}};
