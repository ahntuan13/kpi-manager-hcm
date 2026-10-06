/* 22-tasks.js – Công việc của mọi nhân viên: chưa nộp, quá hạn, chờ chuyển tháng ("delays"), tất cả */
'use strict';
(self.__mods=self.__mods||[]).push('22-tasks');

const monthOpts=()=>[['','Mọi tháng'],...MM.map(m=>[m,'Tháng '+m])];
const taskBar=(extra='')=>`${fSearch('Tìm công việc, ghi chú…')}${scopeBar((isStaff()?'':fSel('emp','Nhân viên',empOpts('Mọi nhân viên')))+fSel('mm','Tháng',monthOpts())+extra)}`;
function taskRows(f){const y=f.year||curYear(),q=norm(f.q);
  return allRows(y).filter(r=>(!f.dept||r.e.dept===f.dept)&&(!f.emp||r.e.id===f.emp)&&(!f.mm||r.mm===f.mm)&&(!q||norm(r.t.title+' '+(r.t.note||'')+' '+r.e.name).includes(q)))}
function kTaskTable(rows,y,empty){
  return table([
    {h:'Công việc',c:'ttl',f:r=>`<span class="tt">${esc(r.t.title)}</span>${r.t.note?`<small class="nt">${linkify(r.t.note)}</small>`:''}`,x:r=>r.t.title},
    {h:'Ghi chú',xonly:1,x:r=>r.t.note||''},
    {h:'Nhân viên',f:r=>`${empLink(r.e)}<small>${esc(r.e.code||'')}${r.e.dept?' · '+esc(r.e.dept):''}</small>`,x:r=>r.e.name},{h:'Mã NV',xonly:1,x:r=>r.e.code},{h:'Nhóm',xonly:1,x:r=>r.e.dept||''},
    {h:'Tháng',f:r=>`<a class="lnk" href="${empHref(r.e)}" data-act="goto-month" data-id="${r.e.id}" data-y="${y}" data-mm="${r.mm}">T${r.mm}</a>`,x:r=>'T'+r.mm},
    {h:'Trọng số',c:'num',f:r=>fmtK(r.sc.w)+'%',x:r=>r.sc.w},
    {h:'Deadline',f:r=>`<span style="white-space:nowrap">${fmtDM(r.t.deadline,y)}</span>`,x:r=>fmtDate(r.t.deadline)},
    {h:'Ngày nộp',f:r=>`<span style="white-space:nowrap">${fmtDM(r.t.submitted,y)}</span>`,x:r=>fmtDate(r.t.submitted)},
    {h:'Trạng thái',f:r=>stBd(r.t,r.sc,y),x:r=>stText(r.t,r.sc,y)},
    {h:'Điểm',c:'num',f:r=>r.sc.comp==null?'–':fmtK2(r.sc.comp),x:r=>r.sc.comp==null?'':r2(r.sc.comp)},
    actCol(r=>!canSheet(r.e.id)||r.sc.state==='moved'?'':`${carryReady(r.t,r.sc)?`<button class="btn sm acc" data-act="kt-move" data-e="${r.e.id}" data-y="${y}" data-mm="${r.mm}" data-id="${r.t.id}">Chuyển → ${mLbl(nextOf(y,r.mm).mm,nextOf(y,r.mm).year,y)}</button> `:''}${canTask(r.e.id,r.t)?`<button class="btn sm" data-act="kt-edit" data-e="${r.e.id}" data-y="${y}" data-mm="${r.mm}" data-id="${r.t.id}">Sửa</button>`:''}`)
  ],rows,{empty,rc:r=>r.sc.state==='moved'?'moved':''});
}
const byDeadline=(a,b)=>(a.t.deadline||'9999').localeCompare(b.t.deadline||'9999')||a.mm.localeCompare(b.mm);

PAGES['task/open']={t:'Việc chưa nộp',
  head(){return `<div class="bar">${taskBar()}<div class="sp"></div><button class="btn" data-act="export" data-name="viec-chua-nop">⬇ Excel</button></div>`},
  tbl(){const f=F(),rows=taskRows(f).filter(r=>canCarry(r.t,r.sc)).sort(byDeadline);
    return kTaskTable(rows,f.year||curYear(),'Không còn việc nào chưa nộp trong phạm vi lọc.')}};

PAGES['task/late']={t:'Công việc quá hạn',
  head(){return `<div class="bar">${taskBar()}<div class="sp"></div><button class="btn" data-act="export" data-name="viec-qua-han">⬇ Excel</button></div>`},
  tbl(){const f=F(),rows=taskRows(f).filter(r=>r.sc.state==='overdue').sort((a,b)=>b.sc.overdue-a.sc.overdue),ready=rows.filter(r=>carryReady(r.t,r.sc)).length;
    return `<div class="kpis sm">${kpi('Việc quá hạn',rows.length,'đã qua deadline, chưa nộp',rows.length?'bad':'ok')}${kpi('Quá hạn trên 30 ngày',rows.filter(r=>r.sc.overdue>30).length,'','warn')}${kpi('Nhân viên liên quan',new Set(rows.map(r=>r.e.id)).size,'','info')}${kpi('Đã ghi “delays”',ready,ready?'<a href="#/task/delays">Chuyển sang tháng sau →</a>':'chưa việc nào sẵn sàng chuyển',ready?'warn':'')}</div>`+
      kTaskTable(rows,f.year||curYear(),'Không có việc quá hạn.')}};

PAGES['task/delays']={t:'Chờ chuyển sang tháng sau',
  head(){return `<div class="bar">${taskBar()}<div class="sp"></div><button class="btn" data-act="export" data-name="viec-delays">⬇ Excel</button>${can('manage')||isStaff()?'<button class="btn acc" data-act="kt-move-all">Chuyển tất cả việc trong danh sách</button>':''}</div>
    <p class="note" style="margin-top:-6px">Chỉ những việc <b>chưa nộp</b> và có chữ <b>delays</b> trong Ghi chú / Link bằng chứng mới hiện ở đây và mới chuyển được sang tháng sau.</p>`},
  tbl(){const f=F(),rows=taskRows(f).filter(r=>carryReady(r.t,r.sc)).sort(byDeadline);
    return kTaskTable(rows,f.year||curYear(),'Chưa có việc nào ghi “delays”. Mở việc bị trễ, bấm Sửa rồi ghi delays vào Ghi chú.')}};
ACT['kt-move-all']=()=>{
  const f=F(),y=f.year||curYear(),rows=taskRows(f).filter(r=>carryReady(r.t,r.sc));
  if(!rows.length)return toast('Danh sách đang trống.','warn');
  modal(`Chuyển ${rows.length} việc sang tháng sau`,`<form id="mf" data-submit="kt-move-all-do" data-y="${y}">
    <ul class="mvl">${rows.map(r=>`<li><b>${esc(r.t.title.split('\n')[0])}</b> <span class="muted">· ${esc(r.e.name)} · T${r.mm} → ${mLbl(nextOf(y,r.mm).mm,nextOf(y,r.mm).year,y)}</span></li>`).join('')}</ul>
    <p class="note">Mỗi việc được chuyển sang tháng kế tiếp của chính nó và giữ deadline gốc (ngày trễ tiếp tục được tính). Muốn dời deadline cho một việc, hãy chuyển riêng việc đó.</p></form>`,
    {footer:cancelBtn+'<button class="btn primary" form="mf">Chuyển tất cả</button>'});
};
SUB['kt-move-all-do']=form=>{
  const f=F(),y=form.dataset.y,rows=taskRows(f).filter(r=>carryReady(r.t,r.sc)),groups={};
  rows.forEach(r=>{(groups[r.e.id+'|'+r.mm]??=[]).push(r.t.id)});let n=0;
  /* chuyển từ tháng muộn về tháng sớm để việc vừa chuyển không bị chuyển tiếp lần nữa */
  Object.keys(groups).sort((a,b)=>b.split('|')[1].localeCompare(a.split('|')[1])).forEach(k=>{const [e,mm]=k.split('|');if(!canSheet(e))return;const r=moveTasks(e,y,mm,groups[k],null);if(r)n+=r.n});
  done(`Đã chuyển ${n} việc sang tháng sau`);
};

PAGES['task/all']={t:'Tất cả công việc',
  head(){return `<div class="bar">${taskBar(fSel('st','Trạng thái',[['','Mọi trạng thái'],['scored','Đã chấm điểm'],['ontime','Đúng hạn / sớm'],['late','Nộp trễ'],['open','Chưa nộp'],['overdue','Quá hạn'],['moved','Đã chuyển tháng'],['rejected','Bị trả lại']]))}<div class="sp"></div><button class="btn" data-act="export" data-name="cong-viec-kpi">⬇ Excel</button></div>`},
  tbl(){const f=F(),st=f.st||'';
    const ok=r=>!st||(st==='scored'?r.sc.comp!=null:st==='ontime'?(r.sc.state==='ontime'||r.sc.state==='early'):st==='open'?canCarry(r.t,r.sc):r.sc.state===st);
    const rows=taskRows(f).filter(ok).sort((a,b)=>a.mm.localeCompare(b.mm)||String(a.e.name).localeCompare(String(b.e.name),'vi'));
    return kTaskTable(rows,f.year||curYear(),'Không có công việc nào khớp bộ lọc.')}};
