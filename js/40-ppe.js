/* 40-ppe.js – Quản lý PPE & đồng phục, theo đúng mẫu đăng ký giấy của công trường / bộ phận:
     PPE ALLOCATION BOOK – Project/Department ; PIC
       No · Receiver Name · Staff code · Helmet · Safety Belt · Safety Shoes (SL, size) · Ear Plug · Safety Glass · Date · Sign
     PPE ALLOCATION (đồng phục) – Project/Department
       No · Receiver Name · Staff code · Áo (SL, size) · Quần (SL, size) · Date · Sign
   Mỗi phiếu đăng ký đi qua 4 bước: Đăng ký → Request mua (ngày) → PU giao hàng (ngày + chi tiết sản phẩm) → Cấp phát (ngày nhận, ký).
   Dữ liệu: db.ppe (Firestore: collection ppe), mỗi phiếu là một document
     {id, kind:'reg', type:'ppe'|'uni', proj, pic, regDate, reqDate, puDate, pu:{<món>:'chi tiết sp'}, note,
      rows:[{name, code, helm, belt, shoe, shoeSz, ear, glass, shirt, shirtSz, pant, pantSz, date, signed}], by, at}
   Mọi người dùng đều xem và nhập. App không tự tạo việc KPI – ai làm thì tự ghi việc ở Work B. */
'use strict';
(self.__mods=self.__mods||[]).push('40-ppe');

const SHOE_SZ=['36','37','38','39','40','41','42','43','44','45','46'];
const CLOTH_SZ=['S','M','L','XL','2XL','3XL'];
const PPE_TYPES={
  ppe:{t:'PPE bảo hộ',book:'PPE ALLOCATION BOOK',cols:[
    {k:'helm',en:'Helmet',vi:'Nón bảo hộ'},{k:'belt',en:'Safety Belt',vi:'Dây an toàn'},{k:'shoe',en:'Safety Shoes',vi:'Giày bảo hộ',sz:SHOE_SZ},
    {k:'ear',en:'Ear Plug',vi:'Nút tai chống ồn'},{k:'glass',en:'Safety Glass',vi:'Kính bảo hộ'}]},
  uni:{t:'Đồng phục',book:'PPE ALLOCATION',cols:[{k:'shirt',en:'Áo',vi:'Áo đồng phục',sz:CLOTH_SZ},{k:'pant',en:'Quần',vi:'Quần đồng phục',sz:CLOTH_SZ}]}
};
const REG_ST={reg:['mute','Đang đăng ký'],req:['info','Đã request mua'],pu:['warn','PU đã giao · đang cấp phát'],done:['ok','Đã cấp phát xong']};
const canPPE=()=>{if(!session){toast('Cần đăng nhập.','error');return false}return true};   /* mọi người dùng đều xem và nhập */
const ppeRegs=()=>(db.ppe||[]).filter(x=>x.kind==='reg');
const ppeReg=id=>ppeRegs().find(x=>x.id===id);
const regCols=r=>(PPE_TYPES[r.type]||PPE_TYPES.ppe).cols;
const rowQty=(r,row)=>regCols(r).reduce((a,c)=>a+(+row[c.k]||0),0);
const regRows=r=>(r.rows||[]).filter(x=>String(x.name||'').trim()||rowQty(r,x));
const regPeople=r=>regRows(r).filter(x=>rowQty(r,x)>0);
function regState(r){const p=regPeople(r);if(p.length&&p.every(x=>x.date))return 'done';if(r.puDate)return 'pu';if(r.reqDate)return 'req';return 'reg'}
/* tổng theo món và size: [{c, total, bySz:[[size,qty]]}] */
function regTotals(r,rows){
  return regCols(r).map(c=>{const m=new Map();let t=0;(rows||regRows(r)).forEach(x=>{const q=+x[c.k]||0;if(!q)return;t+=q;if(c.sz){const s=x[c.k+'Sz']||'?';m.set(s,(m.get(s)||0)+q)}});
    const ord=s=>{const i=c.sz?c.sz.indexOf(s):-1;return i<0?99:i};return{c,total:t,bySz:[...m.entries()].sort((a,b)=>ord(a[0])-ord(b[0]))}});
}
const totTxt=(r,rows)=>regTotals(r,rows).filter(o=>o.total).map(o=>`${o.c.en} ${o.total}${o.bySz.length?` (${o.bySz.map(([s,q])=>`${s}: ${q}`).join(', ')})`:''}`).join(' · ');
const ppeSave=fn=>transact(()=>{if(!Array.isArray(db.ppe))db.ppe=[];fn()});
const ppeHelp=`<details class="card ppeh"><summary><b>Cách dùng mục PPE &amp; đồng phục</b></summary><ol class="note" style="margin:8px 0 0 18px;padding:0">
  <li>Bấm <b>＋ Phiếu PPE</b> (Helmet, Safety Belt, Safety Shoes, Ear Plug, Safety Glass) hoặc <b>＋ Phiếu đồng phục</b> (Áo, Quần), nhập Project/Department và PIC.</li>
  <li>Ghi từng người đăng ký: họ tên (khách thì ghi <b>Visitor</b>), mã NV, số lượng từng món, size giày / áo / quần. App tự cộng tổng theo size để gửi PU.</li>
  <li>Khi gửi đề nghị mua: nhập <b>Ngày request mua</b>. Khi PU giao hàng: nhập <b>Ngày PU giao</b> và <b>chi tiết sản phẩm</b> (hãng, model, màu…).</li>
  <li>Cấp cho ai thì ghi <b>ngày nhận</b> ở dòng người đó và đánh dấu <b>Đã ký</b>. Bấm <b>🖨 In phiếu</b> để in đúng mẫu giấy cho mọi người ký.</li></ol></details>`;

/* ---------- Danh sách phiếu / mở một phiếu ---------- */
PAGES['ppe/form']={t:'Phiếu đăng ký PPE & đồng phục',
  sub(){const r=ppeReg(F().open);return r?`${PPE_TYPES[r.type].t} · ${r.proj||''}`:'Đăng ký → Request mua → PU giao → Cấp phát'},
  head(){const f=F();if(f.open&&ppeReg(f.open))return '';
    return `${ppeHelp}<div class="bar"><label class="fl">Loại ${fSel('type','Loại phiếu',[['','Tất cả'],['ppe','PPE bảo hộ'],['uni','Đồng phục']])}</label><label class="fl">Tình trạng ${fSel('st','Tình trạng',[['','Tất cả'],...Object.entries(REG_ST).map(([k,v])=>[k,v[1]])])}</label>${fSearch('Tìm dự án / PIC / người nhận')}<div class="sp"></div><button class="btn primary" data-act="reg-new" data-type="ppe">＋ Phiếu PPE</button><button class="btn primary" data-act="reg-new" data-type="uni">＋ Phiếu đồng phục</button>${rptBtns('phieu-dang-ky-ppe')}</div>`},
  tbl(){const f=F();if(f.open){const r=ppeReg(f.open);if(r)return regEditor(r);f.open=''}
    const q=norm(f.q),all=ppeRegs(),td=dayNum(todayStr());
    const rows=all.filter(r=>(!f.type||r.type===f.type)&&(!f.st||regState(r)===f.st)&&(!q||norm(`${r.proj} ${r.pic} ${(r.rows||[]).map(x=>x.name+' '+x.code).join(' ')}`).includes(q)))
      .map(r=>({r,s:regState(r),p:regPeople(r)})).sort((a,b)=>(a.s==='done')-(b.s==='done')||String(b.r.regDate).localeCompare(String(a.r.regDate)));
    const c=s=>all.filter(r=>regState(r)===s).length;
    const lead=r=>r.reqDate&&r.puDate?dayNum(r.puDate)-dayNum(r.reqDate):null;
    return `<div class="kpis sm">${kpi('Phiếu đăng ký',fmtNum(all.length),`${fmtNum(all.reduce((a,r)=>a+regPeople(r).length,0))} lượt người`,'acc')}${kpi('Chưa request mua',fmtNum(c('reg')),'đang gom đăng ký',c('reg')?'warn':'ok')}${kpi('Chờ PU giao',fmtNum(c('req')),'đã request, chưa có hàng',c('req')?'warn':'ok')}${kpi('Đang cấp phát',fmtNum(c('pu')),'PU đã giao, chưa nhận hết',c('pu')?'info':'ok')}${kpi('Đã xong',fmtNum(c('done')),'phiếu','ok')}</div>`+table([
      {h:'Ngày đăng ký',f:x=>`<b style="white-space:nowrap">${fmtDate(x.r.regDate)}</b>`,x:x=>fmtDate(x.r.regDate)},
      {h:'Project / Department',f:x=>`<a href="#/ppe/form" data-act="reg-open" data-id="${x.r.id}"><b>${esc(x.r.proj||'(chưa đặt tên)')}</b></a><br>${badge(x.r.type==='uni'?'acc':'info',PPE_TYPES[x.r.type].t)}`,x:x=>x.r.proj||''},
      {h:'Loại',xonly:1,x:x=>PPE_TYPES[x.r.type].t},
      {h:'PIC',f:x=>esc(x.r.pic||''),x:x=>x.r.pic||''},
      {h:'Số người',c:'num',f:x=>fmtNum(x.p.length),x:x=>x.p.length},
      {h:'Tổng đăng ký',c:'nt',f:x=>esc(totTxt(x.r))||'<span class="muted">–</span>',x:x=>totTxt(x.r)},
      {h:'Request mua',f:x=>x.r.reqDate?`<span style="white-space:nowrap">${fmtDate(x.r.reqDate)}</span>`:'<span class="muted">–</span>',x:x=>fmtDate(x.r.reqDate)},
      {h:'PU giao',f:x=>x.r.puDate?`<span style="white-space:nowrap">${fmtDate(x.r.puDate)}</span>${lead(x.r)!=null?`<small class="muted"> · ${lead(x.r)} ngày</small>`:''}`:x.r.reqDate?`<span class="${td-dayNum(x.r.reqDate)>14?'tag-bad':'muted'}" style="white-space:nowrap">chờ ${td-dayNum(x.r.reqDate)} ngày</span>`:'<span class="muted">–</span>',x:x=>fmtDate(x.r.puDate)},
      {h:'Đã nhận',c:'num',f:x=>`${fmtNum(x.p.filter(y=>y.date).length)} / ${fmtNum(x.p.length)}`,x:x=>`${x.p.filter(y=>y.date).length}/${x.p.length}`},
      {h:'Tình trạng',f:x=>badge(...REG_ST[x.s]),x:x=>REG_ST[x.s][1]},
      actCol(x=>`<button class="btn sm" data-act="reg-print" data-id="${x.r.id}" title="In phiếu theo mẫu" aria-label="In phiếu">🖨</button><button class="btn sm acc" data-act="reg-open" data-id="${x.r.id}">Mở</button>`)
    ],rows,{empty:'Chưa có phiếu đăng ký nào. Bấm “＋ Phiếu PPE” hoặc “＋ Phiếu đồng phục”.'});
  }};

/* ---------- Tổng hợp số lượng ---------- */
PAGES['ppe/sum']={t:'Tổng hợp PPE & đồng phục',
  sub(){const f=F();return [f.y||'Tất cả năm',f.type?PPE_TYPES[f.type].t:'PPE và đồng phục'].join(' · ')},
  head(){const ys=[...new Set(ppeRegs().map(r=>String(r.regDate||'').slice(0,4)).filter(Boolean))].sort().reverse();
    return `<div class="bar"><label class="fl">Năm ${fSel('y','Năm',[['','Tất cả'],...ys.map(y=>[y,y])])}</label><label class="fl">Loại ${fSel('type','Loại',[['','Tất cả'],['ppe','PPE bảo hộ'],['uni','Đồng phục']])}</label><div class="sp"></div>${rptBtns('tong-hop-ppe')}</div>`},
  tbl(){const f=F(),regs=ppeRegs().filter(r=>(!f.y||String(r.regDate||'').startsWith(f.y))&&(!f.type||r.type===f.type));
    const m=new Map(),add=(c,s,k,q)=>{const key=c.k+'|'+s;if(!m.has(key))m.set(key,{c,s,reg:0,req:0,pu:0,got:0});m.get(key)[k]+=q};
    regs.forEach(r=>regRows(r).forEach(x=>regCols(r).forEach(c=>{const q=+x[c.k]||0;if(!q)return;const s=c.sz?(x[c.k+'Sz']||'?'):'';add(c,s,'reg',q);if(r.reqDate)add(c,s,'req',q);if(r.puDate)add(c,s,'pu',q);if(x.date)add(c,s,'got',q)})));
    const order=[...PPE_TYPES.ppe.cols,...PPE_TYPES.uni.cols].map(c=>c.k),si=o=>o.c.sz?o.c.sz.indexOf(o.s):0;
    const rows=[...m.values()].sort((a,b)=>order.indexOf(a.c.k)-order.indexOf(b.c.k)||si(a)-si(b));
    return table([
      {h:'Món',f:o=>`<b>${esc(o.c.en)}</b> <small class="muted">${esc(o.c.vi)}</small>`,x:o=>`${o.c.en} – ${o.c.vi}`},
      {h:'Size',f:o=>esc(o.s||'–'),x:o=>o.s},
      {h:'Đăng ký',c:'num',f:o=>fmtNum(o.reg),x:o=>o.reg},
      {h:'Đã request mua',c:'num',f:o=>fmtNum(o.req),x:o=>o.req},
      {h:'PU đã giao',c:'num',f:o=>fmtNum(o.pu),x:o=>o.pu},
      {h:'Đã cấp (người nhận)',c:'num',f:o=>fmtNum(o.got),x:o=>o.got},
      {h:'Chưa request',c:'num',f:o=>o.reg-o.req?`<span class="tag-warn">${fmtNum(o.reg-o.req)}</span>`:'0',x:o=>o.reg-o.req},
      {h:'PU chưa giao',c:'num',f:o=>o.req-o.pu?`<span class="tag-warn">${fmtNum(o.req-o.pu)}</span>`:'0',x:o=>o.req-o.pu}
    ],rows,{empty:'Chưa có số liệu đăng ký nào.'})+`<p class="note">Tính theo ${fmtNum(regs.length)} phiếu đăng ký. “Đã request mua” / “PU đã giao” = số lượng của các phiếu đã có ngày request / ngày PU giao; “Đã cấp” = các dòng đã ghi ngày nhận.</p>`;
  }};

/* ---------- Màn hình nhập một phiếu ---------- */
const szSel=(c,i,v)=>`<select class="in" data-rg="${c.k}Sz" data-i="${i}" aria-label="Size ${esc(c.en)} dòng ${i+1}"><option value=""></option>${c.sz.map(s=>`<option ${s===v?'selected':''}>${s}</option>`).join('')}${v&&!c.sz.includes(v)?`<option selected>${esc(v)}</option>`:''}</select>`;
const qIn=(c,i,v)=>`<input class="in" type="number" min="0" max="999" data-rg="${c.k}" data-i="${i}" value="${v?esc(v):''}" aria-label="${esc(c.en)} dòng ${i+1}">`;
function regSteps(r){const p=regPeople(r),got=p.filter(x=>x.date).length,s=regState(r),st=['reg','req','pu','done'].indexOf(s);
  const step=(n,t,body)=>`<div class="rgs ${n<st||s==='done'?'ok':n===st?'cur':''}"><b>${n+1}. ${t}</b>${body}</div>`;
  return `<div class="rgsteps">${step(0,'Đăng ký',`<label class="fl">Ngày <input class="in" type="date" data-rh="regDate" value="${esc(r.regDate||'')}"></label><small>${fmtNum(p.length)} người đăng ký</small>`)}
    ${step(1,'Request mua',`<label class="fl">Ngày request <input class="in" type="date" data-rh="reqDate" value="${esc(r.reqDate||'')}"></label>`)}
    ${step(2,'PU giao hàng',`<label class="fl">Ngày PU giao <input class="in" type="date" data-rh="puDate" value="${esc(r.puDate||'')}"></label>${r.reqDate&&r.puDate?`<small>sau ${dayNum(r.puDate)-dayNum(r.reqDate)} ngày</small>`:''}`)}
    ${step(3,'Cấp phát · ký nhận',`<small><b>${fmtNum(got)} / ${fmtNum(p.length)}</b> người đã nhận</small>${p.length&&got<p.length&&r.puDate?`<button class="btn sm" data-act="reg-allgot" data-id="${r.id}" title="Ghi ngày nhận = Ngày PU giao cho những người chưa nhận">Ghi nhận cho tất cả</button>`:''}`)}</div>`}
function regSum(r){const tt=regTotals(r),pu=r.pu||{};
  return `<div class="tw"><table class="t rgsum"><thead><tr><th>Món</th><th>Tổng đăng ký</th><th>Theo size</th><th>Chi tiết sản phẩm PU giao <small class="muted">(hãng, model, màu…)</small></th></tr></thead><tbody>${tt.map(o=>`<tr><td><b>${esc(o.c.en)}</b> <small class="muted">${esc(o.c.vi)}</small></td><td class="num"><b>${fmtNum(o.total)}</b></td><td>${o.bySz.length?o.bySz.map(([s,q])=>`<span class="chip">${esc(s)}: <b>${q}</b></span>`).join(' '):'<span class="muted">–</span>'}</td><td><input class="in" data-rpu="${o.c.k}" value="${esc(pu[o.c.k]||'')}" placeholder="${o.total?'Chi tiết hàng PU giao':''}" aria-label="Chi tiết sản phẩm ${esc(o.c.en)}"></td></tr>`).join('')}</tbody></table></div>`}
function regEditor(r){const cols=regCols(r),T=PPE_TYPES[r.type],rows=r.rows||[],emps=sortedEmps();
  const hd1=cols.map(c=>`<th ${c.sz?'colspan="2"':'rowspan="2"'}>${esc(c.en)}<br><small>${esc(c.vi)}</small></th>`).join(''),hd2=cols.filter(c=>c.sz).map(()=>'<th>SL</th><th>Size</th>').join('');
  const cells=(x,i)=>cols.map(c=>`<td>${qIn(c,i,x[c.k])}</td>${c.sz?`<td>${szSel(c,i,x[c.k+'Sz'])}</td>`:''}`).join('');
  return `<div class="ppef" data-reg="${r.id}">
    <div class="bar"><button class="btn" data-act="reg-close">← Danh sách phiếu</button>${badge(r.type==='uni'?'acc':'info',T.t)}<div class="sp"></div><button class="btn" data-act="reg-xlsx" data-id="${r.id}">⬇ Excel</button><button class="btn" data-act="reg-print" data-id="${r.id}">🖨 In phiếu</button><button class="btn danger" data-act="reg-del" data-id="${r.id}">Xoá phiếu</button></div>
    <section class="card"><div class="fg rgh"><label class="f"><span>Project / Department <i>*</i></span><input class="in" data-rh="proj" value="${esc(r.proj||'')}" list="dl-reg-proj" placeholder="VD: VINCI, ROKKO, S-AD"></label><label class="f"><span>PIC (người phụ trách)</span><input class="in" data-rh="pic" value="${esc(r.pic||'')}" placeholder="VD: Mr Sĩ Tường"></label><label class="f full"><span>Ghi chú</span><input class="in" data-rh="note" value="${esc(r.note||'')}"></label></div>
      <datalist id="dl-reg-proj">${[...new Set(ppeRegs().map(x=>x.proj).filter(Boolean))].map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
      <div id="rg-steps">${regSteps(r)}</div></section>
    <section class="card"><h4>Danh sách đăng ký <small class="muted">· ${esc(T.book)}</small></h4>
      <datalist id="dl-reg-name"><option value="Visitor">Khách (không mã NV)</option>${emps.map(e=>`<option value="${esc(e.name)}">${esc(e.code)}</option>`).join('')}</datalist>
      <div class="tw"><table class="t rgt"><thead><tr><th rowspan="2">No</th><th rowspan="2">Receiver Name</th><th rowspan="2">Staff code</th>${hd1}<th rowspan="2">Date<br><small>ngày nhận</small></th><th rowspan="2">Sign<br><small>đã ký</small></th><th rowspan="2"></th></tr><tr>${hd2}</tr></thead><tbody>
      ${rows.map((x,i)=>`<tr><td class="c">${i+1}</td><td><input class="in nm" data-rg="name" data-i="${i}" value="${esc(x.name||'')}" list="dl-reg-name" autocomplete="off" aria-label="Họ tên dòng ${i+1}"></td><td><input class="in cd" data-rg="code" data-i="${i}" value="${esc(x.code||'')}" aria-label="Mã NV dòng ${i+1}"></td>${cells(x,i)}
        <td><input class="in" type="date" data-rg="date" data-i="${i}" value="${esc(x.date||'')}" aria-label="Ngày nhận dòng ${i+1}"></td><td class="c"><input type="checkbox" data-rg="signed" data-i="${i}" ${x.signed?'checked':''} aria-label="Đã ký dòng ${i+1}"></td><td class="c"><button class="btn sm" data-act="reg-row-del" data-i="${i}" title="Xoá dòng" aria-label="Xoá dòng ${i+1}">✕</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="rgbtn"><button class="btn sm" data-act="reg-rows" data-n="1">＋ Thêm 1 dòng</button><button class="btn sm" data-act="reg-rows" data-n="5">＋ Thêm 5 dòng</button><span class="note">Tự lưu sau mỗi ô. Gõ tên hoặc mã NV có trong danh sách thì tự điền phần còn lại.</span></div></section>
    <section class="card"><h4>Tổng hợp gửi PU &amp; hàng PU giao</h4><div id="rg-sum">${regSum(r)}</div></section></div>`}
/* lưu từng ô, không vẽ lại cả trang để không mất chỗ đang gõ */
function regPatch(fn,partial=true){const id=document.querySelector('.ppef')?.dataset.reg,r=id&&ppeReg(id);if(!r)return;
  if(!ppeSave(()=>{const x=db.ppe.find(z=>z.id===id);fn(x);x.updatedAt=new Date().toISOString();x.updatedBy=session?.name||''}))return;
  if(!partial)return refreshTbl();const nr=ppeReg(id),s=$('#rg-steps'),m=$('#rg-sum');
  if(s&&!s.contains(document.activeElement))s.innerHTML=regSteps(nr);if(m&&!m.contains(document.activeElement))m.innerHTML=regSum(nr)}
document.addEventListener('change',ev=>{const el=ev.target;if(!el.closest||!el.closest('.ppef'))return;
  if(el.dataset.rh){const k=el.dataset.rh,v=String(el.value||'').trim();
    if(k==='puDate'&&v){const r=ppeReg(el.closest('.ppef').dataset.reg);if(r&&r.reqDate&&v<r.reqDate){toast('Ngày PU giao không được trước ngày request mua.','error');el.value=r.puDate||'';return}}
    regPatch(x=>{x[k]=v});return}
  if(el.dataset.rpu){regPatch(x=>{x.pu={...(x.pu||{}),[el.dataset.rpu]:String(el.value||'').trim()}});return}
  if(el.dataset.rg){const i=+el.dataset.i,k=el.dataset.rg,tr=el.closest('tr');const v=el.type==='checkbox'?el.checked:el.type==='number'?Math.max(0,+el.value||0):String(el.value||'').trim();
    const extra={};
    if(k==='name'){const e=db.employees.find(z=>norm(z.name)===norm(v)),cd=tr.querySelector('[data-rg="code"]');if(e&&!cd.value){cd.value=e.code;extra.code=e.code}}
    if(k==='code'){const e=db.employees.find(z=>norm(z.code)===norm(v)),nm=tr.querySelector('[data-rg="name"]');if(e&&!nm.value){nm.value=e.name;extra.name=e.name}}
    if(k==='signed'&&v){const d=tr.querySelector('[data-rg="date"]');if(!d.value){d.value=todayStr();extra.date=d.value}}
    regPatch(x=>{const rw=x.rows[i];if(!rw)throw new Error('Dòng này không còn, hãy tải lại trang.');if(v)rw[k]=v;else if(k==='signed')rw[k]=false;else delete rw[k];Object.assign(rw,extra)})}});
const emptyRow=()=>({name:'',code:''});
ACT['reg-new']=el=>{if(!canPPE())return;const t=el.dataset.type==='uni'?'uni':'ppe',id=uid('rg');
  if(ppeSave(()=>db.ppe.push({id,kind:'reg',type:t,proj:'',pic:'',regDate:todayStr(),reqDate:'',puDate:'',pu:{},note:'',rows:Array.from({length:10},emptyRow),by:session?.name||'',at:new Date().toISOString()}))){F().open=id;rerender();$('.ppef [data-rh="proj"]')?.focus()}};
ACT['reg-open']=el=>{F().open=el.dataset.id;rerender()};
ACT['reg-close']=()=>{const r=ppeReg(F().open);F().open='';if(r&&!String(r.proj||'').trim()&&!regPeople(r).length)ppeSave(()=>{db.ppe=db.ppe.filter(z=>z.id!==r.id)});rerender()};
ACT['reg-rows']=el=>regPatch(x=>{for(let k=0;k<(+el.dataset.n||1);k++)x.rows.push(emptyRow())},false);
ACT['reg-row-del']=el=>{const i=+el.dataset.i,r=ppeReg(F().open),x=r&&r.rows[i];if(x&&(x.name||rowQty(r,x))&&!confirm(`Xoá dòng ${i+1}${x.name?' – '+x.name:''}?`))return;regPatch(z=>{z.rows.splice(i,1)},false)};
ACT['reg-allgot']=el=>{const r=ppeReg(el.dataset.id);if(!r)return;const d=r.puDate||todayStr();regPatch(x=>{x.rows.forEach(rw=>{if(rowQty(x,rw)>0&&!rw.date)rw.date=d})},false);toast('Đã ghi ngày nhận '+fmtDate(d))};
ACT['reg-del']=el=>{if(!canPPE()||!confirm('Xoá cả phiếu đăng ký này?'))return;if(ppeSave(()=>{db.ppe=db.ppe.filter(v=>v.id!==el.dataset.id)})){F().open='';rerender();toast('Đã xoá phiếu')}};
ACT['reg-xlsx']=el=>{const r=ppeReg(el.dataset.id);if(!r)return;const cols=regCols(r);
  const head=['No','Receiver Name','Staff code',...cols.flatMap(c=>c.sz?[c.en,c.en+' size']:[c.en]),'Date','Sign'];
  xlsxSave([[PPE_TYPES[r.type].book],[`Project/Department: ${r.proj||''}`,'',`PIC: ${r.pic||''}`],[`Ngày request mua: ${fmtDate(r.reqDate)||'–'}`,'',`Ngày PU giao: ${fmtDate(r.puDate)||'–'}`],[],head,
    ...regRows(r).map((x,i)=>[i+1,x.name||'',x.code||'',...cols.flatMap(c=>c.sz?[+x[c.k]||'',x[c.k+'Sz']||'']:[+x[c.k]||'']),fmtDate(x.date)||'',x.signed?'Đã ký':'']),[],
    ['Tổng','Số lượng','Theo size','Chi tiết sản phẩm PU giao'],...regTotals(r).filter(o=>o.total).map(o=>[o.c.en,o.total,o.bySz.map(([s,q])=>`${s}: ${q}`).join(', '),(r.pu||{})[o.c.k]||''])],`ppe-${norm(r.proj||'phieu').replace(/\s+/g,'-')}`,'PPE')};

/* ---------- In phiếu đúng mẫu giấy ---------- */
function regPrintHTML(r){const cols=regCols(r),T=PPE_TYPES[r.type],rows=regRows(r),pad=Math.max(0,15-rows.length),c=db.company||{};
  const hd1=cols.map(c=>`<th ${c.sz?'colspan="2"':'rowspan="2"'}>${esc(c.en)}</th>`).join(''),hd2=cols.filter(c=>c.sz).map(()=>'<th>SL</th><th>Size</th>').join('');
  const cells=x=>cols.map(c=>`<td class="c">${x&&+x[c.k]?fmtNum(+x[c.k]):''}</td>${c.sz?`<td class="c">${x?esc(x[c.k+'Sz']||''):''}</td>`:''}`).join('');
  const tt=regTotals(r).filter(o=>o.total);
  return `<div class="slip book"><div class="sh"><div class="co"><b>${esc(c.name||'')}</b></div><div style="text-align:right">Ngày in: ${fmtDate(todayStr())}</div></div>
    <h2>${esc(T.book)}</h2>
    <div class="mt"><div>Project/Department: <b>${esc(r.proj||'')}</b></div><div>PIC: <b>${esc(r.pic||'')}</b></div><div>Ngày request mua: <b>${fmtDate(r.reqDate)||'……/……/……'}</b></div><div>Ngày PU giao: <b>${fmtDate(r.puDate)||'……/……/……'}</b></div></div>
    <table><thead><tr><th rowspan="2" style="width:34px">No</th><th rowspan="2">Receiver Name</th><th rowspan="2">Staff code</th>${hd1}<th rowspan="2">Date</th><th rowspan="2" style="width:120px">Sign</th></tr><tr>${hd2}</tr></thead><tbody>
    ${rows.map((x,n)=>`<tr><td class="c">${n+1}</td><td>${esc(x.name||'')}</td><td>${esc(x.code||'')}</td>${cells(x)}<td style="white-space:nowrap">${fmtDate(x.date)||''}</td><td></td></tr>`).join('')}
    ${Array.from({length:pad},(_,n)=>`<tr><td class="c">${rows.length+n+1}</td><td></td><td></td>${cells(null)}<td></td><td></td></tr>`).join('')}
    ${tt.length?`<tr class="rgtot"><td colspan="3"><b>Tổng</b></td>${cols.map(c=>{const o=tt.find(z=>z.c.k===c.k);return `<td class="c"><b>${o?o.total:''}</b></td>${c.sz?`<td style="font-size:10px">${o?o.bySz.map(([s,q])=>`${esc(s)}: ${q}`).join('<br>'):''}</td>`:''}`}).join('')}<td></td><td></td></tr>`:''}</tbody></table>
    ${tt.some(o=>(r.pu||{})[o.c.k])?`<p class="sn"><b>Hàng PU giao:</b> ${tt.filter(o=>(r.pu||{})[o.c.k]).map(o=>`${esc(o.c.en)} – ${esc(r.pu[o.c.k])}`).join(' · ')}</p>`:''}
    <div style="margin-top:6px;font-size:10.5px;color:#777;text-align:right">${esc(CREDIT)}</div></div>`}
ACT['reg-print']=el=>{const r=ppeReg(el.dataset.id);if(r)printHTML(regPrintHTML(r))};
