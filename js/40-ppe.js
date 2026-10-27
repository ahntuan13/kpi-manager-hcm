/* 40-ppe.js – Quản lý PPE (phương tiện bảo vệ cá nhân): cấp phát đồng phục, giày, nón, dây an toàn, kính, chụp tai cho người lao động theo từng dự án.
   Dựa theo mẫu "Sổ theo dõi cấp phát PTBVCN" (người nhận ký nhận, thời hạn sử dụng, cấp lại khi hư / mất / hết hạn) và mẫu PPE Issue Register của công trường.
   Dữ liệu: db.ppe (Firestore: collection ppe), mỗi document có kind:
     item  – danh mục PPE: tên, đơn vị, thời hạn sử dụng (tháng), size, tiêu chuẩn (6 loại mặc định nằm sẵn trong PPE_DEF, sửa thì lưu đè)
     proj  – dự án / công trường: mã, tên, địa điểm, ngày bắt đầu / kết thúc, trạng thái
     issue – một lần cấp: dự án, người nhận (mã NV, họ tên, tổ / bộ phận), loại PPE, size, số lượng, ngày cấp, lý do, đã ký nhận, ngày thu hồi
     po    – một lần request mua: dự án, số PR, ngày request, người request, các dòng {loại, size, SL request, ngày PU giao, SL giao, chi tiết sản phẩm}
   Luồng: Request mua → PU giao hàng → cấp phát cho người nhận (ký sổ "PPE Allocation Book"). Tồn = PU đã giao − đã cấp phát.
   Mọi người dùng đều xem và nhập. */
'use strict';
(self.__mods=self.__mods||[]).push('40-ppe');

/* en = tên in trên sổ "PPE Allocation Book" (theo mẫu của công trường) */
const PPE_DEF=[
  {id:'pi_helm',name:'Nón bảo hộ',en:'Helmet',unit:'cái',life:24,sizes:'',std:'EN 397',ord:1},
  {id:'pi_harn',name:'Dây an toàn toàn thân',en:'Safety Belt',unit:'bộ',life:36,sizes:'',std:'EN 361 · kiểm tra định kỳ 6 tháng, thay ngay sau khi đã chịu lực rơi',ord:2},
  {id:'pi_shoe',name:'Giày bảo hộ',en:'Safety Shoes',unit:'đôi',life:12,sizes:'38, 39, 40, 41, 42, 43, 44',std:'EN ISO 20345',ord:3},
  {id:'pi_ear',name:'Nút tai / chụp tai chống ồn',en:'Ear Plug',unit:'cái',life:12,sizes:'',std:'EN 352',ord:4},
  {id:'pi_glass',name:'Kính bảo hộ',en:'Safety Glass',unit:'cái',life:6,sizes:'',std:'EN 166',ord:5},
  {id:'pi_uni',name:'Áo đồng phục',en:'Áo',unit:'cái',life:12,sizes:'S, M, L, XL, XXL',std:'',ord:6},
  {id:'pi_pant',name:'Quần đồng phục',en:'Quần',unit:'cái',life:12,sizes:'S, M, L, XL, XXL',std:'',ord:7}
];
const PPE_REASON={new:'Cấp mới',replace:'Thay định kỳ',damaged:'Hư hỏng',lost:'Mất'};
const PPE_SOON=30;   /* số ngày trước hạn thay thì báo "sắp đến hạn" */
const ppeDocs=k=>(db.ppe||[]).filter(x=>x.kind===k);
function ppeItems(all){
  const saved=ppeDocs('item'),m=new Map(PPE_DEF.map(d=>[d.id,{...d,kind:'item'}]));
  saved.forEach(d=>m.set(d.id,{...(m.get(d.id)||{}),...d}));
  return [...m.values()].filter(d=>all||!d.deleted).sort((a,b)=>(a.ord||99)-(b.ord||99)||String(a.name).localeCompare(String(b.name),'vi'));
}
const ppeItem=id=>ppeItems(true).find(x=>x.id===id);
const ppeProjs=()=>ppeDocs('proj').sort((a,b)=>(a.status==='done')-(b.status==='done')||String(b.start||'').localeCompare(String(a.start||''))||String(a.code).localeCompare(String(b.code)));
const ppeProj=id=>ppeDocs('proj').find(x=>x.id===id);
const ppeIssues=()=>ppeDocs('issue');
const projLbl=p=>p?`${p.code?p.code+' · ':''}${p.name||''}`:'—';
const ppePOs=()=>ppeDocs('po');
/* khách tham quan (Visitor): không có mã NV, chỉ ghi số lượng, không theo dõi hạn thay */
const isVisitor=x=>!String(x.code||'').trim()&&/^(visitor|khách)/i.test(String(x.name||'').trim());
const ppeAddM=(iso,n)=>{const [y,m,d]=iso.split('-').map(Number),t=new Date(Date.UTC(y,m-1+(+n||0),1)),last=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate();t.setUTCDate(Math.min(d,last));return t.toISOString().slice(0,10)};
const pKey=x=>norm(x.code||x.name||'');
/* hạn thay của một lần cấp: ngày cấp + thời hạn sử dụng; đã thu hồi hoặc đã có lần cấp mới hơn (cùng người, cùng loại, cùng dự án) thì không còn theo dõi */
function ppeDue(x){const it=ppeItem(x.item);return x.date&&it&&+it.life>0&&!isVisitor(x)?ppeAddM(x.date,it.life):''}
function ppeState(x){
  if(x.returned)return 'ret';if(isVisitor(x))return 'vis';
  const d=ppeDue(x);if(!d)return 'ok';
  const left=dayNum(d)-dayNum(todayStr());return left<0?'over':left<=PPE_SOON?'soon':'ok';
}
const PPE_ST={ok:['ok','Còn hạn'],soon:['warn','Sắp đến hạn thay'],over:['bad','Quá hạn thay'],ret:['mute','Đã thu hồi'],old:['mute','Đã cấp lần mới'],vis:['mute','Khách · không theo dõi hạn']};
/* lần cấp còn hiệu lực = lần mới nhất của mỗi (dự án, người, loại PPE), chưa thu hồi */
function ppeCurrent(list){
  const m=new Map();(list||ppeIssues()).forEach(x=>{const k=`${x.proj}|${pKey(x)}|${x.item}`,o=m.get(k);if(!o||String(x.date)>String(o.date)||(x.date===o.date&&String(x.at||'')>String(o.at||'')))m.set(k,x)});
  return m;
}
function ppeStateOf(x,cur){const k=`${x.proj}|${pKey(x)}|${x.item}`;return cur.get(k)===x?ppeState(x):'old'}
const stBadge=s=>badge(PPE_ST[s][0],PPE_ST[s][1]);
const canPPE=()=>{if(!session){toast('Cần đăng nhập.','error');return false}return true};   /* mọi người dùng đều xem và nhập PPE */
const ppeSave=fn=>transact(()=>{if(!Array.isArray(db.ppe))db.ppe=[];fn()});
const ppeTiles=list=>{const cur=ppeCurrent(list),live=[...cur.values()].filter(x=>!x.returned),c=s=>live.filter(x=>ppeState(x)===s).length,ppl=new Set(list.map(pKey)).size;
  return `<div class="kpis sm">${kpi('Lượt cấp phát',fmtNum(list.length),`${fmtNum(list.reduce((a,x)=>a+(+x.qty||0),0))} món`,'acc')}${kpi('Người đã nhận',fmtNum(ppl),`${new Set(list.map(x=>x.proj)).size} dự án`,'info')}${kpi('Sắp đến hạn thay',fmtNum(c('soon')),`trong ${PPE_SOON} ngày tới`,c('soon')?'warn':'ok')}${kpi('Quá hạn thay',fmtNum(c('over')),'cần cấp lại',c('over')?'bad':'ok')}${kpi('Chưa ký nhận',fmtNum(list.filter(x=>!x.signed&&!x.returned).length),'lượt cấp','mute')}</div>`};
const projOpts=(all='Tất cả dự án')=>[['',all],...ppeProjs().map(p=>[p.id,projLbl(p)+(p.status==='done'?' (đã xong)':'')])];
const noProj=()=>`<div class="empty"><b>Chưa có dự án nào.</b><br>Vào <a href="#/ppe/cat">Danh mục &amp; dự án</a> để thêm dự án trước khi cấp phát PPE.</div>`;
const ppeHelp=`<details class="card ppeh"><summary><b>Cách dùng mục PPE</b></summary><ol class="note" style="margin:8px 0 0 18px;padding:0">
  <li><b>Danh mục &amp; dự án</b>: thêm dự án / bộ phận (kèm người phụ trách – PIC); sửa thời hạn sử dụng, size của các loại có sẵn (Helmet, Safety Belt, Safety Shoes, Ear Plug, Safety Glass, Áo, Quần) hoặc thêm loại khác.</li>
  <li><b>Mua PPE</b>: ghi <b>Request mua</b> (ngày request, loại, size, số lượng); khi PU giao hàng thì nhập <b>ngày PU giao</b>, số lượng giao và chi tiết sản phẩm (hãng, model, màu…). Bảng <b>Tồn</b> = PU đã giao − đã cấp phát.</li>
  <li><b>Sổ cấp phát</b>: bấm <b>＋ Cấp phát PPE</b>, chọn dự án, người nhận (khách thì ghi <b>Visitor</b>, bỏ trống mã NV), đánh dấu các món giao (size, số lượng, lý do). In <b>Biên bản giao nhận</b> cho từng lần giao, hoặc in cả <b>Sổ cấp phát (PPE Allocation Book)</b> của dự án để người nhận ký.</li>
  <li><b>Theo dự án</b>: bảng mỗi người × mỗi loại PPE, màu cho biết còn hạn / sắp đến hạn / quá hạn / chưa cấp.</li>
  <li><b>Đến hạn thay</b>: danh sách cần cấp lại, bấm <b>Cấp thay</b> để giao món mới (lý do Thay định kỳ).</li></ol>
  <p class="note" style="margin:8px 0 0">Theo quy định hiện hành, người sử dụng lao động phải cấp PPE bằng hiện vật (không trả tiền thay), có sổ theo dõi cấp phát kèm chữ ký của người nhận, và cấp lại khi PPE hư hỏng, mất hoặc hết hạn sử dụng. Thời hạn mặc định ở đây chỉ là gợi ý, hãy chỉnh theo quy định của công ty.</p></details>`;

/* ---------- Sổ cấp phát ---------- */
PAGES['ppe/issue']={t:'Sổ cấp phát PPE',
  sub(){const f=F();return [f.proj?projLbl(ppeProj(f.proj)):'Tất cả dự án',f.item?ppeItem(f.item)?.name:'',f.st?PPE_ST[f.st][1]:''].filter(Boolean).join(' · ')},
  head(){return `${ppeHelp}<div class="bar"><label class="fl">Dự án ${fSel('proj','Dự án',projOpts())}</label><label class="fl">Loại ${fSel('item','Loại PPE',[['','Tất cả'],...ppeItems().map(i=>[i.id,i.name])])}</label><label class="fl">Tình trạng ${fSel('st','Tình trạng',[['','Tất cả'],['ok','Còn hạn'],['soon','Sắp đến hạn'],['over','Quá hạn'],['nosign','Chưa ký nhận'],['ret','Đã thu hồi']])}</label><input class="in" data-f="q" value="${esc(F().q||'')}" placeholder="Tìm tên / mã NV" aria-label="Tìm người nhận" style="max-width:180px"><div class="sp"></div>${F().proj?`<button class="btn" data-act="ppe-book" data-proj="${esc(F().proj)}" title="In sổ cấp phát theo mẫu PPE Allocation Book để người nhận ký">🖨 In sổ cấp phát</button>`:''}<button class="btn primary" data-act="ppe-new">＋ Cấp phát PPE</button>${rptBtns('so-cap-phat-ppe')}</div>`},
  tbl(){
    if(!ppeProjs().length)return noProj();
    const f=F(),q=norm(f.q),all=ppeIssues(),cur=ppeCurrent(all);
    const rows=all.filter(x=>(!f.proj||x.proj===f.proj)&&(!f.item||x.item===f.item)&&(!q||norm(`${x.name} ${x.code} ${x.dept}`).includes(q)))
      .map(x=>({x,s:ppeStateOf(x,cur),it:ppeItem(x.item),p:ppeProj(x.proj)}))
      .filter(r=>!f.st||(f.st==='nosign'?!r.x.signed&&!r.x.returned:r.s===f.st))
      .sort((a,b)=>String(b.x.date).localeCompare(String(a.x.date))||String(a.x.name).localeCompare(String(b.x.name),'vi'));
    return ppeTiles(rows.map(r=>r.x))+table([
      {h:'Ngày cấp',f:r=>`<span style="white-space:nowrap">${fmtDate(r.x.date)}</span>`,x:r=>fmtDate(r.x.date)},
      {h:'Dự án',f:r=>`<span style="white-space:nowrap" title="${esc(projLbl(r.p))}">${esc(r.p?(r.p.code||r.p.name):'—')}</span>`,x:r=>projLbl(r.p)},
      {h:'Mã NV',f:r=>`<span style="white-space:nowrap">${esc(r.x.code||'')}</span>`,x:r=>r.x.code||''},
      {h:'Người nhận',f:r=>`<b>${esc(r.x.name)}</b>${r.x.dept?`<small class="muted"> ${esc(r.x.dept)}</small>`:''}`,x:r=>r.x.name},
      {h:'Tổ / Bộ phận',xonly:1,x:r=>r.x.dept||''},
      {h:'Loại PPE',f:r=>esc(r.it?r.it.name:'(đã xoá)'),x:r=>r.it?r.it.name:''},
      {h:'Size',f:r=>esc(r.x.size||''),x:r=>r.x.size||''},
      {h:'SL',c:'num',f:r=>`${fmtNum(+r.x.qty||0)} <small class="muted">${esc(r.it?.unit||'')}</small>`,x:r=>+r.x.qty||0},
      {h:'Lý do',f:r=>esc(PPE_REASON[r.x.reason]||''),x:r=>PPE_REASON[r.x.reason]||''},
      {h:'Hạn thay',f:r=>`<span style="white-space:nowrap">${fmtDate(ppeDue(r.x))||'–'}</span>`,x:r=>fmtDate(ppeDue(r.x))},
      {h:'Tình trạng',f:r=>stBadge(r.s)+(r.x.returned?`<small class="muted"> ${fmtDate(r.x.returned)}</small>`:''),x:r=>PPE_ST[r.s][1]+(r.x.returned?' '+fmtDate(r.x.returned):'')},
      {h:'Ký nhận',c:'c',f:r=>r.x.signed?'<span class="pos">✔</span>':`<button class="btn sm" data-act="ppe-sign" data-id="${r.x.id}" title="Đánh dấu người nhận đã ký biên bản">Đã ký</button>`,x:r=>r.x.signed?'Đã ký':'Chưa'},
      {h:'Ghi chú',c:'nt',f:r=>esc(r.x.note||''),x:r=>r.x.note||''},
      actCol(r=>`<button class="btn sm" data-act="ppe-rcpt" data-id="${r.x.id}" title="In biên bản giao nhận" aria-label="In biên bản giao nhận">🖨</button><button class="btn sm" data-act="ppe-edit" data-id="${r.x.id}">Sửa</button>`)
    ],rows,{empty:'Chưa có lượt cấp phát nào phù hợp bộ lọc. Bấm “＋ Cấp phát PPE” để ghi lần giao đầu tiên.'});
  }};

/* ---------- Theo dự án: người × loại PPE ---------- */
PAGES['ppe/proj']={t:'PPE theo dự án',
  sub(){const p=ppeProj(F().proj);return p?`${projLbl(p)}${p.site?' · '+p.site:''}`:''},
  head(){const f=F(),ps=ppeProjs();if(!f.proj||!ppeProj(f.proj))f.proj=ps[0]?.id||'';
    return `<div class="bar"><label class="fl">Dự án ${fSel('proj','Dự án',projOpts().slice(1))}</label><input class="in" data-f="q" value="${esc(f.q||'')}" placeholder="Tìm tên / mã NV" aria-label="Tìm người" style="max-width:180px"><div class="sp"></div>${f.proj?`<button class="btn" data-act="ppe-book" data-proj="${esc(f.proj)}" title="In sổ cấp phát theo mẫu PPE Allocation Book để người nhận ký">🖨 In sổ cấp phát</button>`:''}<button class="btn primary" data-act="ppe-new" data-proj="${esc(f.proj)}">＋ Cấp phát PPE</button>${rptBtns('ppe-theo-du-an')}</div>`},
  tbl(){
    const f=F(),p=ppeProj(f.proj);if(!p)return noProj();
    const list=ppeIssues().filter(x=>x.proj===p.id),cur=ppeCurrent(list),items=ppeItems(),q=norm(f.q);
    const ppl=new Map();list.forEach(x=>{const k=pKey(x),o=ppl.get(k);if(!o||String(x.date)>String(o.date))ppl.set(k,{code:x.code||'',name:x.name,dept:x.dept||'',date:x.date})});
    const rows=[...ppl.entries()].map(([k,v])=>({k,...v})).filter(r=>!q||norm(`${r.name} ${r.code} ${r.dept}`).includes(q)).sort((a,b)=>String(a.name).localeCompare(String(b.name),'vi'));
    const cell=(r,it)=>{const x=cur.get(`${p.id}|${r.k}|${it.id}`);if(!x)return{h:'<span class="pc none" title="Chưa cấp">—</span>',t:'Chưa cấp'};const s=x.returned?'ret':ppeState(x),d=ppeDue(x);
      return{h:`<span class="pc ${s}" title="${esc(PPE_ST[s][1])}${d?' · hạn thay '+fmtDate(d):''}">${fmtDM(x.date,todayStr().slice(0,4))}${x.size?` <small>${esc(x.size)}</small>`:''}</span>`,t:`${fmtDate(x.date)}${x.size?' · '+x.size:''} · ${PPE_ST[s][1]}`}};
    return `${ppeTiles(list)}<p class="note"><span class="pc ok">Còn hạn</span> <span class="pc soon">Sắp đến hạn thay (≤ ${PPE_SOON} ngày)</span> <span class="pc over">Quá hạn thay</span> <span class="pc ret">Đã thu hồi</span> <span class="pc none">— Chưa cấp</span> · Ô hiện ngày cấp gần nhất và size.</p>`+table([
      {h:'Mã NV',f:r=>`<span style="white-space:nowrap">${esc(r.code)}</span>`,x:r=>r.code},{h:'Họ tên',f:r=>`<b style="white-space:nowrap">${esc(r.name)}</b>`,x:r=>r.name},{h:'Tổ / Bộ phận',f:r=>esc(r.dept||'—'),x:r=>r.dept},
      ...items.map(it=>({h:esc(it.name),c:'c',f:r=>cell(r,it).h,x:r=>cell(r,it).t})),
      {h:'Cần cấp',c:'c',f:r=>{if(isVisitor(r))return '<span class="muted" title="Khách: không theo dõi">–</span>';const n=items.filter(it=>{const x=cur.get(`${p.id}|${r.k}|${it.id}`);return !x||x.returned||!['ok','vis'].includes(ppeState(x))}).length;return n?`<b class="tag-bad">${n}</b>`:'<span class="pos">0</span>'},x:r=>isVisitor(r)?'':items.filter(it=>{const x=cur.get(`${p.id}|${r.k}|${it.id}`);return !x||x.returned||!['ok','vis'].includes(ppeState(x))}).length},
      actCol(r=>`<button class="btn sm" data-act="ppe-new" data-proj="${p.id}" data-code="${esc(r.code)}" data-name="${esc(r.name)}" data-dept="${esc(r.dept)}">＋ Cấp</button>`)
    ],rows,{empty:'Dự án này chưa cấp PPE cho ai. Bấm “＋ Cấp phát PPE”.'});
  }};

/* ---------- Đến hạn thay ---------- */
PAGES['ppe/due']={t:'PPE đến hạn thay',
  sub(){const f=F();return (f.proj?projLbl(ppeProj(f.proj)):'Tất cả dự án')+` · quá hạn và sắp đến hạn trong ${PPE_SOON} ngày`},
  head(){return `<div class="bar"><label class="fl">Dự án ${fSel('proj','Dự án',projOpts())}</label><div class="sp"></div>${rptBtns('ppe-den-han-thay')}</div>`},
  tbl(){
    const f=F(),cur=ppeCurrent();
    const rows=[...cur.values()].filter(x=>(!f.proj||x.proj===f.proj)&&!x.returned).map(x=>({x,s:ppeState(x),d:ppeDue(x),it:ppeItem(x.item),p:ppeProj(x.proj)})).filter(r=>r.s==='soon'||r.s==='over').sort((a,b)=>a.d.localeCompare(b.d));
    const td=dayNum(todayStr());
    return table([
      {h:'Hạn thay',f:r=>`<b style="white-space:nowrap">${fmtDate(r.d)}</b>`,x:r=>fmtDate(r.d)},
      {h:'Còn / quá',c:'num',f:r=>{const n=dayNum(r.d)-td;return n<0?`<span class="tag-bad">quá ${-n} ngày</span>`:`còn ${n} ngày`},x:r=>dayNum(r.d)-td},
      {h:'Dự án',f:r=>`<span style="white-space:nowrap" title="${esc(projLbl(r.p))}">${esc(r.p?(r.p.code||r.p.name):'—')}</span>`,x:r=>projLbl(r.p)},{h:'Mã NV',f:r=>`<span style="white-space:nowrap">${esc(r.x.code||'')}</span>`,x:r=>r.x.code||''},{h:'Người nhận',f:r=>`<b>${esc(r.x.name)}</b>`,x:r=>r.x.name},
      {h:'Loại PPE',f:r=>esc(r.it?.name||''),x:r=>r.it?.name||''},{h:'Size',f:r=>esc(r.x.size||''),x:r=>r.x.size||''},{h:'Ngày cấp',f:r=>fmtDate(r.x.date),x:r=>fmtDate(r.x.date)},
      {h:'Tình trạng',f:r=>stBadge(r.s),x:r=>PPE_ST[r.s][1]},
      actCol(r=>`<button class="btn sm acc" data-act="ppe-new" data-proj="${r.x.proj}" data-code="${esc(r.x.code||'')}" data-name="${esc(r.x.name)}" data-dept="${esc(r.x.dept||'')}" data-item="${r.x.item}" data-size="${esc(r.x.size||'')}" data-reason="replace">Cấp thay</button>`)
    ],rows,{empty:`Không có PPE nào quá hạn hoặc sắp đến hạn thay trong ${PPE_SOON} ngày tới.`});
  }};

/* ---------- Danh mục PPE & dự án ---------- */
PAGES['ppe/cat']={t:'Danh mục PPE & dự án',
  r(){const iss=ppeIssues(),nIt=id=>iss.filter(x=>x.item===id).length,nPr=id=>iss.filter(x=>x.proj===id).length;
    return `<div class="grid g2">${card(`Dự án / bộ phận <button class="btn sm primary" data-act="ppe-proj" style="float:right">＋ Thêm dự án</button>`,miniTable(['Mã','Tên dự án / bộ phận','PIC','Địa điểm','Thời gian','Trạng thái','Lượt cấp',''],ppeProjs().map(p=>`<tr><td>${esc(p.code||'')}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.pic||'')}</td><td>${esc(p.site||'')}</td><td style="white-space:nowrap">${fmtDate(p.start)||'…'} – ${fmtDate(p.end)||'…'}</td><td>${p.status==='done'?badge('mute','Đã xong'):badge('ok','Đang chạy')}</td><td class="num">${nPr(p.id)}</td><td class="act"><button class="btn sm" data-act="ppe-proj" data-id="${p.id}">Sửa</button></td></tr>`),'Chưa có dự án nào. Bấm “＋ Thêm dự án”.'))}
      ${card(`Danh mục PPE <button class="btn sm primary" data-act="ppe-item" style="float:right">＋ Thêm loại</button>`,miniTable(['Loại PPE','Tên in sổ','ĐVT','Thời hạn sử dụng','Size','Tiêu chuẩn / ghi chú','Lượt cấp',''],ppeItems().map(i=>`<tr><td><b>${esc(i.name)}</b></td><td>${esc(i.en||'')}</td><td>${esc(i.unit||'')}</td><td class="num">${+i.life?i.life+' tháng':'Không giới hạn'}</td><td>${esc(i.sizes||'—')}</td><td class="nt">${esc(i.std||'')}</td><td class="num">${nIt(i.id)}</td><td class="act"><button class="btn sm" data-act="ppe-item" data-id="${i.id}">Sửa</button></td></tr>`))+'<p class="note">Thời hạn sử dụng dùng để tính <b>Hạn thay</b> = Ngày cấp + thời hạn. Đặt 0 nếu loại đó không có hạn (chỉ thay khi hư / mất).</p>')}</div>${ppeHelp}`}};

/* ---------- hộp thoại ---------- */
function personFields(v={}){
  const emps=sortedEmps();
  return `<datalist id="dl-ppe-code">${emps.map(e=>`<option value="${esc(e.code)}">${esc(e.name)}</option>`).join('')}</datalist><datalist id="dl-ppe-name"><option value="Visitor">Khách tham quan (không mã NV)</option>${emps.map(e=>`<option value="${esc(e.name)}">${esc(e.code)}</option>`).join('')}</datalist>
    ${inp('code','Mã NV',v.code||'',{attrs:'list="dl-ppe-code" autocomplete="off" data-ppe-code'})}${inp('name','Họ tên người nhận <small class="muted">(khách: Visitor)</small>',v.name||'',{req:1,attrs:'list="dl-ppe-name" autocomplete="off" data-ppe-name'})}${inp('dept','Tổ / Bộ phận / Nhà thầu phụ',v.dept||'',{})}`;
}
/* gõ mã NV hoặc tên nhân viên có trong danh sách thì tự điền phần còn lại */
document.addEventListener('input',ev=>{const el=ev.target;if(!el.closest||!el.closest('form[data-ppe]'))return;const form=el.form;
  if(el.matches('[data-ppe-code]')){const e=db.employees.find(x=>norm(x.code)===norm(el.value));if(e){form.name.value=e.name;if(!form.dept.value)form.dept.value=e.dept||''}}
  if(el.matches('[data-ppe-name]')){const e=db.employees.find(x=>norm(x.name)===norm(el.value));if(e){if(!form.code.value)form.code.value=e.code;if(!form.dept.value)form.dept.value=e.dept||''}}});
const sizeInp=(name,it,v)=>{const s=String(it.sizes||'').split(',').map(x=>x.trim()).filter(Boolean);return s.length?`<select class="in" name="${name}" aria-label="Size ${esc(it.name)}"><option value="">–</option>${s.map(x=>`<option ${x===v?'selected':''}>${esc(x)}</option>`).join('')}${v&&!s.includes(v)?`<option selected>${esc(v)}</option>`:''}</select>`:`<input class="in" name="${name}" value="${esc(v||'')}" placeholder="–" aria-label="Size ${esc(it.name)}">`};
ACT['ppe-new']=el=>{if(!canPPE())return;if(!ppeProjs().length){toast('Thêm dự án trước khi cấp phát PPE.','warn');location.hash='#/ppe/cat';return}
  const d=el.dataset,items=ppeItems(),pj=d.proj||F().proj||ppeProjs().find(p=>p.status!=='done')?.id||'';
  modal('Cấp phát PPE',`<form id="mf" data-submit="ppe-new" data-ppe="1"><div class="fg ktg">
    ${sel('proj','Dự án',projOpts().slice(1),pj,{req:1})}${inp('date','Ngày cấp',todayStr(),{type:'date',req:1})}${sel('reason','Lý do',Object.entries(PPE_REASON),d.reason||'new')}<label class="f"><span>Ký nhận</span><label class="chk"><input type="checkbox" name="signed"> Người nhận đã ký biên bản</label></label>
    ${personFields(d)}
    <div class="f full"><span>Các món giao <small class="muted">(đánh dấu món giao, chọn size và số lượng)</small></span><div class="tw"><table class="t ppei"><thead><tr><th></th><th>Loại PPE</th><th>Size</th><th>Số lượng</th><th>Hạn thay</th></tr></thead><tbody>
      ${items.map(it=>`<tr><td class="c"><input type="checkbox" name="it_${it.id}" ${d.item===it.id?'checked':''} aria-label="Giao ${esc(it.name)}"></td><td><b>${esc(it.name)}</b> <small class="muted">${esc(it.unit||'')}</small></td><td>${sizeInp('sz_'+it.id,it,d.item===it.id?d.size:'')}</td><td><input class="in" type="number" name="qt_${it.id}" value="1" min="1" max="99" style="width:72px" aria-label="Số lượng ${esc(it.name)}"></td><td class="muted">${+it.life?it.life+' tháng':'—'}</td></tr>`).join('')}
    </tbody></table></div></div>
    ${txa('note','Ghi chú',d.note||'',{full:1,rows:2})}
    <p class="note full" style="padding:0">Mỗi món là một dòng trong sổ cấp phát. Sau khi lưu có thể in <b>Biên bản giao nhận</b> (🖨) để người nhận ký.</p></div></form>`,
    {footer:cancelBtn+`<button class="btn" type="submit" form="mf" name="then" value="print">Lưu &amp; in biên bản</button><button class="btn primary" form="mf">Lưu</button>`,size:'wide kt'});
};
SUB['ppe-new']=(form,ev)=>{if(!canPPE())return;const d=fd(form),items=ppeItems().filter(it=>d['it_'+it.id]);
  if(!d.proj||!ppeProj(d.proj))return toast('Chọn dự án.','error');
  if(!String(d.name||'').trim())return toast('Nhập họ tên người nhận.','error');
  if(!items.length)return toast('Đánh dấu ít nhất một món PPE được giao.','error');
  const rc=uid('r'),now=new Date().toISOString(),print=!!(SUBMITTER&&SUBMITTER.value==='print');SUBMITTER=null;
  const ppeTask=()=>{   /* Work B: mỗi lần cấp phát thành một việc (đã hoàn thành, chờ quản lý duyệt) ở mục "Theo dõi cấp phát PPE" của người nhập */
    const me=session&&session.empId;if(!me||!empOf(me)||!/^\d{4}-\d{2}-\d{2}$/.test(d.date||''))return;const y=d.date.slice(0,4),mm=d.date.slice(5,7),sh=sheetOf(me,y,true),k=kpiOf(me,y);
    const line=kpiRows(k).find(r=>r.ppe)||kpiRows(k).find(r=>+r.w>0&&/ppe/i.test(r.text)),p=ppeProj(d.proj);
    sh.months[mm].tasks.push({id:uid('t'),title:`Cấp phát PPE: ${items.map(it=>it.name).join(', ')} – ${d.name.trim()}${p?' ('+(p.code||p.name)+')':''}`,weight:1,deadline:d.date,submitted:d.date,approval:'',note:'Tự tạo từ mục Quản lý PPE',src:'ppe',ppeRc:rc,...(line?{kpi:line.id}:{})});sh.updatedAt=todayStr()};
  if(ppeSave(()=>{ppeTask();items.forEach(it=>db.ppe.push({id:uid('pp'),kind:'issue',rcpt:rc,proj:d.proj,date:d.date,code:String(d.code||'').trim(),name:d.name.trim(),dept:String(d.dept||'').trim(),item:it.id,size:String(d['sz_'+it.id]||'').trim(),qty:Math.max(1,+d['qt_'+it.id]||1),reason:d.reason||'new',signed:!!d.signed,returned:null,note:String(d.note||'').trim(),by:session?.name||'',at:now}))})){
    done(`Đã ghi cấp phát ${items.length} món PPE cho ${d.name.trim()}${session&&session.empId?' · đã thêm việc vào Work B':''}`);if(print)printHTML(rcptHTML(rc))}};
/* nhớ nút submit nào được bấm (Lưu / Lưu & in) */
let SUBMITTER=null;document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button[form="mf"]');SUBMITTER=b||null},true);
ACT['ppe-edit']=el=>{if(!canPPE())return;const x=(db.ppe||[]).find(v=>v.id===el.dataset.id);if(!x)return toast('Dòng này không còn tồn tại.','error');const it=ppeItem(x.item)||{name:'',sizes:''};
  modal('Sửa lượt cấp phát PPE',`<form id="mf" data-submit="ppe-edit" data-id="${x.id}" data-ppe="1"><div class="fg ktg">
    ${sel('proj','Dự án',projOpts().slice(1),x.proj,{req:1})}${inp('date','Ngày cấp',x.date,{type:'date',req:1})}${sel('item','Loại PPE',ppeItems().map(i=>[i.id,i.name]),x.item,{req:1})}${sel('reason','Lý do',Object.entries(PPE_REASON),x.reason)}
    ${personFields(x)}<label class="f"><span>Size</span>${sizeInp('size',it,x.size)}</label>${inp('qty','Số lượng',x.qty,{type:'number',req:1,attrs:'min="1" max="99"'})}
    <label class="f"><span>Ký nhận</span><label class="chk"><input type="checkbox" name="signed" ${x.signed?'checked':''}> Đã ký biên bản</label></label>${inp('returned','Ngày thu hồi <small class="muted">(nghỉ việc / rời dự án)</small>',x.returned||'',{type:'date'})}
    ${txa('note','Ghi chú',x.note||'',{full:1,rows:2})}</div></form>`,
    {footer:`<button class="btn danger" data-act="ppe-del" data-id="${x.id}" style="margin-right:auto">Xoá dòng</button>`+cancelBtn+`<button class="btn primary" form="mf">Lưu</button>`,size:'wide kt'})};
SUB['ppe-edit']=form=>{if(!canPPE())return;const d=fd(form),id=form.dataset.id;if(!String(d.name||'').trim())return toast('Nhập họ tên người nhận.','error');
  if(d.returned&&d.returned<d.date)return toast('Ngày thu hồi phải sau ngày cấp.','error');
  if(ppeSave(()=>{const x=db.ppe.find(v=>v.id===id);if(!x)throw new Error('Dòng này không còn tồn tại.');Object.assign(x,{proj:d.proj,date:d.date,item:d.item,reason:d.reason,code:String(d.code||'').trim(),name:d.name.trim(),dept:String(d.dept||'').trim(),size:String(d.size||'').trim(),qty:Math.max(1,+d.qty||1),signed:!!d.signed,returned:d.returned||null,note:String(d.note||'').trim()})}))done('Đã lưu')};
ACT['ppe-del']=el=>{if(!canPPE()||!confirm('Xoá lượt cấp phát này khỏi sổ?'))return;if(ppeSave(()=>{db.ppe=db.ppe.filter(v=>v.id!==el.dataset.id)}))done('Đã xoá')};
ACT['ppe-sign']=el=>{if(!canPPE())return;if(ppeSave(()=>{const x=db.ppe.find(v=>v.id===el.dataset.id);if(x){(x.rcpt?db.ppe.filter(v=>v.rcpt===x.rcpt):[x]).forEach(v=>v.signed=true)}})){refreshTbl();toast('Đã đánh dấu đã ký nhận')}};
ACT['ppe-proj']=el=>{if(!canPPE())return;const p=el.dataset.id?ppeProj(el.dataset.id):{code:'',name:'',pic:'',site:'',start:'',end:'',status:'run',note:''};
  modal(el.dataset.id?'Sửa dự án':'Thêm dự án',`<form id="mf" data-submit="ppe-proj" data-id="${el.dataset.id||''}"><div class="fg">${inp('code','Mã dự án',p.code,{req:1,ph:'VD: P2026-01'})}${inp('name','Tên dự án / bộ phận',p.name,{req:1})}${inp('pic','Người phụ trách (PIC)',p.pic||'',{ph:'VD: Mr Sĩ Tường'})}${inp('site','Địa điểm',p.site,{})}${inp('start','Bắt đầu',p.start,{type:'date'})}${inp('end','Kết thúc',p.end,{type:'date'})}${sel('status','Trạng thái',[['run','Đang chạy'],['done','Đã xong']],p.status)}${txa('note','Ghi chú',p.note,{full:1})}</div></form>`,
    {footer:(el.dataset.id&&!ppeIssues().some(x=>x.proj===p.id)?`<button class="btn danger" data-act="ppe-proj-del" data-id="${p.id}" style="margin-right:auto">Xoá dự án</button>`:'')+cancelBtn+`<button class="btn primary" form="mf">Lưu</button>`})};
SUB['ppe-proj']=form=>{if(!canPPE())return;const d=fd(form),id=form.dataset.id;
  if(ppeDocs('proj').some(p=>p.id!==id&&norm(p.code)===norm(d.code)))return toast('Mã dự án này đã có.','error');
  if(ppeSave(()=>{const v={code:d.code.trim(),name:d.name.trim(),pic:String(d.pic||'').trim(),site:String(d.site||'').trim(),start:d.start||'',end:d.end||'',status:d.status,note:String(d.note||'').trim()};
    const p=id&&db.ppe.find(x=>x.id===id);if(p)Object.assign(p,v);else db.ppe.push({id:uid('pj'),kind:'proj',...v})}))done(id?'Đã lưu dự án':'Đã thêm dự án')};
ACT['ppe-proj-del']=el=>{if(!canPPE()||!confirm('Xoá dự án này?'))return;if(ppeSave(()=>{db.ppe=db.ppe.filter(v=>v.id!==el.dataset.id)}))done('Đã xoá dự án')};
ACT['ppe-item']=el=>{if(!canPPE())return;const i=el.dataset.id?ppeItem(el.dataset.id):{name:'',en:'',unit:'cái',life:12,sizes:'',std:''};
  modal(el.dataset.id?'Sửa loại PPE':'Thêm loại PPE',`<form id="mf" data-submit="ppe-item" data-id="${el.dataset.id||''}"><div class="fg">${inp('name','Tên loại PPE',i.name,{req:1})}${inp('en','Tên in trên sổ cấp phát',i.en||'',{ph:'VD: Helmet'})}${inp('unit','Đơn vị tính',i.unit,{req:1})}${inp('life','Thời hạn sử dụng (tháng, 0 = không giới hạn)',i.life,{type:'number',req:1,attrs:'min="0" max="120"'})}${inp('sizes','Các size (cách nhau dấu phẩy)',i.sizes,{full:1,ph:'VD: S, M, L, XL'})}${inp('std','Tiêu chuẩn / ghi chú',i.std,{full:1})}</div></form>`,
    {footer:(el.dataset.id&&!ppeIssues().some(x=>x.item===i.id)?`<button class="btn danger" data-act="ppe-item-del" data-id="${i.id}" style="margin-right:auto">Xoá loại</button>`:'')+cancelBtn+`<button class="btn primary" form="mf">Lưu</button>`})};
SUB['ppe-item']=form=>{if(!canPPE())return;const d=fd(form),id=form.dataset.id;
  if(ppeSave(()=>{const v={name:d.name.trim(),en:String(d.en||'').trim(),unit:d.unit.trim(),life:Math.max(0,+d.life||0),sizes:String(d.sizes||'').trim(),std:String(d.std||'').trim()};
    const x=id&&db.ppe.find(z=>z.id===id);if(x)Object.assign(x,v);else if(id)db.ppe.push({id,kind:'item',ord:ppeItem(id)?.ord||99,...v});else db.ppe.push({id:uid('pi'),kind:'item',ord:99,...v})}))done('Đã lưu loại PPE')};
ACT['ppe-item-del']=el=>{if(!canPPE()||!confirm('Xoá loại PPE này khỏi danh mục?'))return;const id=el.dataset.id;
  if(ppeSave(()=>{const x=db.ppe.find(z=>z.id===id);if(PPE_DEF.some(d=>d.id===id)){if(x)x.deleted=true;else db.ppe.push({id,kind:'item',deleted:true})}else db.ppe=db.ppe.filter(z=>z.id!==id)}))done('Đã xoá loại PPE')};

/* ---------- Biên bản giao nhận PPE (in / ký) ---------- */
function rcptHTML(rc){
  const list=(db.ppe||[]).filter(x=>x.kind==='issue'&&(x.rcpt===rc||x.id===rc));if(!list.length)return '';
  const x=list[0],p=ppeProj(x.proj),c=db.company||{};
  return `<div class="slip"><div class="sh"><div class="co"><b>${esc(c.name||'')}</b><div>${esc(c.note||'')}</div></div><div style="text-align:right">Ngày in: ${fmtDate(todayStr())}</div></div>
    <h2>BIÊN BẢN GIAO NHẬN PHƯƠNG TIỆN BẢO VỆ CÁ NHÂN (PPE)</h2><div class="sub">Ngày giao: ${fmtDate(x.date)}</div>
    <div class="mt"><div>Dự án: <b>${esc(projLbl(p))}</b></div><div>Địa điểm: <b>${esc(p?.site||'—')}</b></div><div>Người nhận: <b>${esc(x.name)}</b></div><div>Mã NV: <b>${esc(x.code||'—')}</b></div><div>Tổ / Bộ phận: <b>${esc(x.dept||'—')}</b></div><div>Lý do: <b>${esc(PPE_REASON[x.reason]||'')}</b></div></div>
    <table><thead><tr><th>STT</th><th>Tên PPE</th><th>Size</th><th>ĐVT</th><th>Số lượng</th><th>Hạn thay</th><th>Ghi chú</th></tr></thead><tbody>
    ${list.map((v,i)=>{const it=ppeItem(v.item)||{};return `<tr><td style="text-align:center">${i+1}</td><td>${esc(it.name||'')}</td><td>${esc(v.size||'')}</td><td>${esc(it.unit||'')}</td><td style="text-align:right">${fmtNum(+v.qty||0)}</td><td>${fmtDate(ppeDue(v))||'–'}</td><td>${esc(v.note||'')}</td></tr>`}).join('')}</tbody></table>
    <p class="sn">Người nhận xác nhận đã nhận đủ số PPE trên, còn mới và đúng size; cam kết sử dụng đúng mục đích, bảo quản cẩn thận, báo ngay khi PPE hư hỏng hoặc mất để được cấp lại, và hoàn trả khi kết thúc dự án / nghỉ việc theo quy định của công ty.</p>
    <div class="sign" style="grid-template-columns:1fr 1fr"><div><b>Người nhận</b><br><small>(Ký, ghi rõ họ tên)</small></div><div><b>Người giao</b><br><small>(Ký, ghi rõ họ tên)</small></div></div>
    <div style="margin-top:6px;font-size:10.5px;color:#777;text-align:right">${esc(CREDIT)}</div></div>`;
}
ACT['ppe-rcpt']=el=>{const x=(db.ppe||[]).find(v=>v.id===el.dataset.id);if(!x)return;printHTML(rcptHTML(x.rcpt||x.id))};

/* ---------- Mua PPE: Request → PU giao hàng, và tồn ---------- */
const poLines=po=>(po.lines||[]).filter(l=>l.item&&+l.qty>0);
const poSum=(po,k)=>poLines(po).reduce((a,l)=>a+(+l[k]||0),0);
const poLast=po=>poLines(po).map(l=>l.dDate||'').filter(Boolean).sort().pop()||'';
function poState(po){const q=poSum(po,'qty'),g=poSum(po,'dQty');return !g?'wait':g>=q?'full':'part'}
const PO_ST={wait:['warn','Chờ PU giao'],part:['info','PU giao một phần'],full:['ok','PU đã giao đủ']};
const itTxt=l=>{const it=ppeItem(l.item);return `${it?it.name:'(đã xoá)'}${l.size?' '+l.size:''}`};
/* tồn theo (loại, size) trong phạm vi dự án: request, PU đã giao, đã cấp phát */
function ppeStock(proj){
  const m=new Map(),g=(item,size)=>{const k=item+'|'+norm(size||'');if(!m.has(k))m.set(k,{item,size:size||'',req:0,got:0,out:0});return m.get(k)};
  ppePOs().filter(p=>!proj||p.proj===proj).forEach(p=>poLines(p).forEach(l=>{const o=g(l.item,l.size);o.req+=+l.qty||0;o.got+=+l.dQty||0}));
  ppeIssues().filter(x=>!proj||x.proj===proj).forEach(x=>{g(x.item,x.size).out+=+x.qty||0});
  const ord=id=>ppeItems(true).findIndex(i=>i.id===id);
  return [...m.values()].sort((a,b)=>ord(a.item)-ord(b.item)||String(a.size).localeCompare(String(b.size),'vi',{numeric:true}));
}
PAGES['ppe/buy']={t:'Mua PPE (Request → PU giao hàng)',
  sub(){const f=F();return [(f.proj?projLbl(ppeProj(f.proj)):'Tất cả dự án'),f.st?PO_ST[f.st][1]:''].filter(Boolean).join(' · ')},
  head(){return `<div class="bar"><label class="fl">Dự án ${fSel('proj','Dự án',projOpts())}</label><label class="fl">Tình trạng ${fSel('st','Tình trạng',[['','Tất cả'],...Object.entries(PO_ST).map(([k,v])=>[k,v[1]])])}</label><div class="sp"></div><button class="btn primary" data-act="ppe-po">＋ Request mua PPE</button>${rptBtns('mua-ppe')}</div>`},
  tbl(){
    if(!ppeProjs().length)return noProj();
    const f=F(),td=todayStr();
    const rows=ppePOs().filter(p=>(!f.proj||p.proj===f.proj)&&(!f.st||poState(p)===f.st)).map(p=>({p,s:poState(p),pj:ppeProj(p.proj),last:poLast(p)}))
      .sort((a,b)=>(a.s==='full')-(b.s==='full')||String(b.p.reqDate).localeCompare(String(a.p.reqDate)));
    const lead=r=>r.p.reqDate&&r.last?dayNum(r.last)-dayNum(r.p.reqDate):null,wait=r=>r.s!=='full'&&r.p.reqDate?dayNum(td)-dayNum(r.p.reqDate):null;
    const all=ppePOs().filter(p=>!f.proj||p.proj===f.proj),c=s=>all.filter(p=>poState(p)===s).length;
    const tiles=`<div class="kpis sm">${kpi('Request mua',fmtNum(all.length),`${fmtNum(all.reduce((a,p)=>a+poSum(p,'qty'),0))} món`,'acc')}${kpi('Chờ PU giao',fmtNum(c('wait')),'request chưa nhận hàng',c('wait')?'warn':'ok')}${kpi('Giao một phần',fmtNum(c('part')),'còn thiếu hàng',c('part')?'warn':'ok')}${kpi('Đã giao đủ',fmtNum(c('full')),'request','ok')}</div>`;
    const stock=ppeStock(f.proj).filter(o=>o.req||o.got||o.out);
    const stockT=card(`Tồn PPE ${f.proj?'· '+esc(projLbl(ppeProj(f.proj))):'· tất cả dự án'}`,miniTable(['Loại PPE','Size','Đã request','PU đã giao','Còn chờ PU','Đã cấp phát','Tồn'],stock.map(o=>{const it=ppeItem(o.item),t=o.got-o.out,w=Math.max(0,o.req-o.got);return `<tr><td><b>${esc(it?it.name:'(đã xoá)')}</b></td><td>${esc(o.size||'–')}</td><td class="num">${fmtNum(o.req)}</td><td class="num">${fmtNum(o.got)}</td><td class="num">${w?`<span class="tag-warn">${fmtNum(w)}</span>`:'0'}</td><td class="num">${fmtNum(o.out)}</td><td class="num"><b class="${t<0?'tag-bad':''}">${fmtNum(t)}</b></td></tr>`}),'Chưa có request mua hay cấp phát nào.')+'<p class="note">Tồn = PU đã giao − đã cấp phát (theo loại và size). Tồn âm: đã cấp nhiều hơn số PU giao trên app, thường do hàng tồn từ trước chưa nhập.</p>');
    return tiles+table([
      {h:'Ngày request',f:r=>`<b style="white-space:nowrap">${fmtDate(r.p.reqDate)}</b>`,x:r=>fmtDate(r.p.reqDate)},
      {h:'Số PR',f:r=>`<span style="white-space:nowrap">${esc(r.p.no||'')}</span>`,x:r=>r.p.no||''},
      {h:'Dự án',f:r=>`<span style="white-space:nowrap" title="${esc(projLbl(r.pj))}">${esc(r.pj?(r.pj.code||r.pj.name):'—')}</span>`,x:r=>projLbl(r.pj)},
      {h:'Người request',f:r=>esc(r.p.reqBy||''),x:r=>r.p.reqBy||''},
      {h:'Chi tiết request',c:'nt',f:r=>poLines(r.p).map(l=>`${esc(itTxt(l))} × <b>${fmtNum(+l.qty)}</b>`).join('<br>'),x:r=>poLines(r.p).map(l=>`${itTxt(l)} x${l.qty}`).join('; ')},
      {h:'Ngày PU giao',f:r=>{const ds=[...new Set(poLines(r.p).map(l=>l.dDate).filter(Boolean))].sort();return ds.length?`<span style="white-space:nowrap">${ds.map(fmtDate).join('<br>')}</span>`:'<span class="muted">–</span>'},x:r=>[...new Set(poLines(r.p).map(l=>l.dDate).filter(Boolean))].sort().map(fmtDate).join(', ')},
      {h:'Chi tiết sản phẩm PU giao',c:'nt',f:r=>poLines(r.p).filter(l=>+l.dQty>0).map(l=>`${esc(itTxt(l))} × <b>${fmtNum(+l.dQty)}</b>${l.detail?` <small class="muted">· ${esc(l.detail)}</small>`:''}${l.dDate?` <small class="muted">(${fmtDM(l.dDate,td.slice(0,4))})</small>`:''}`).join('<br>')||'<span class="muted">–</span>',x:r=>poLines(r.p).filter(l=>+l.dQty>0).map(l=>`${itTxt(l)} x${l.dQty}${l.detail?' · '+l.detail:''}`).join('; ')},
      {h:'Giao / Request',c:'num',f:r=>`${fmtNum(poSum(r.p,'dQty'))} / ${fmtNum(poSum(r.p,'qty'))}`,x:r=>`${poSum(r.p,'dQty')}/${poSum(r.p,'qty')}`},
      {h:'Thời gian',c:'num',f:r=>{const l=lead(r),w=wait(r);return r.s==='full'&&l!=null?`${l} ngày`:w!=null?`<span class="${w>14?'tag-bad':''}">chờ ${w} ngày</span>`:'–'},x:r=>r.s==='full'?lead(r):wait(r)},
      {h:'Tình trạng',f:r=>badge(...PO_ST[r.s]),x:r=>PO_ST[r.s][1]},
      {h:'Ghi chú',c:'nt',f:r=>esc(r.p.note||''),x:r=>r.p.note||''},
      actCol(r=>`${r.s!=='full'?`<button class="btn sm acc" data-act="ppe-po" data-id="${r.p.id}" data-deliver="1">PU giao</button>`:''}<button class="btn sm" data-act="ppe-po" data-id="${r.p.id}">Sửa</button>`)
    ],rows,{empty:'Chưa có request mua PPE nào. Bấm “＋ Request mua PPE”.'})+stockT;
  }};
const poRow=(l={})=>{const items=ppeItems(),it=ppeItem(l.item)||items[0]||{},sz=String(it.sizes||'').split(',').map(x=>x.trim()).filter(Boolean);
  return `<tr data-ln><td><select class="in" data-po="item" aria-label="Loại PPE">${items.map(i=>`<option value="${i.id}" ${i.id===l.item?'selected':''}>${esc(i.name)}</option>`).join('')}</select></td>
    <td><input class="in" data-po="size" value="${esc(l.size||'')}" list="dl-po-sz-${esc(it.id||'')}" placeholder="–" aria-label="Size" style="width:70px"></td>
    <td><input class="in" type="number" min="0" max="9999" data-po="qty" value="${esc(l.qty??'')}" aria-label="Số lượng request" style="width:76px"></td>
    <td><input class="in" type="date" data-po="dDate" value="${esc(l.dDate||'')}" aria-label="Ngày PU giao"></td>
    <td><input class="in" type="number" min="0" max="9999" data-po="dQty" value="${esc(l.dQty??'')}" aria-label="Số lượng PU giao" style="width:76px"></td>
    <td><input class="in" data-po="detail" value="${esc(l.detail||'')}" placeholder="Hãng, model, màu, tiêu chuẩn…" aria-label="Chi tiết sản phẩm"></td>
    <td class="c"><button type="button" class="btn sm" data-act="po-line-del" title="Xoá dòng" aria-label="Xoá dòng">✕</button></td></tr>`};
const poSizeLists=()=>ppeItems().map(i=>`<datalist id="dl-po-sz-${i.id}">${String(i.sizes||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>`<option value="${esc(x)}">`).join('')}</datalist>`).join('');
ACT['ppe-po']=el=>{if(!canPPE())return;if(!ppeProjs().length){toast('Thêm dự án trước.','warn');location.hash='#/ppe/cat';return}
  const id=el.dataset.id,po=id?ppePOs().find(x=>x.id===id):{proj:F().proj||ppeProjs().find(p=>p.status!=='done')?.id||'',no:'',reqDate:todayStr(),reqBy:session?.name||'',lines:[],note:''};
  if(!po)return toast('Request này không còn tồn tại.','error');
  const lines=poLines(po).length?poLines(po):[{},{},{}];
  modal(id?(el.dataset.deliver?'PU giao hàng':'Sửa request mua PPE'):'Request mua PPE',`<form id="mf" data-submit="ppe-po" data-id="${id||''}"><div class="fg ktg">
    ${sel('proj','Dự án / bộ phận',projOpts().slice(1),po.proj,{req:1})}${inp('reqDate','Ngày request mua',po.reqDate,{type:'date',req:1})}${inp('no','Số PR / phiếu đề nghị',po.no||'',{ph:'VD: PR-2026-015'})}${inp('reqBy','Người request',po.reqBy||'',{})}
    <div class="f full"><span>Chi tiết <small class="muted">(request: loại, size, số lượng · khi PU giao hàng: ngày PU giao, số lượng giao, chi tiết sản phẩm)</small></span>${poSizeLists()}<div class="tw"><table class="t ppei"><thead><tr><th>Loại PPE</th><th>Size</th><th>SL request</th><th>Ngày PU giao</th><th>SL giao</th><th>Chi tiết sản phẩm</th><th></th></tr></thead><tbody id="po-lines">${lines.map(poRow).join('')}</tbody></table></div>
      <div style="display:flex;gap:8px;margin-top:6px"><button type="button" class="btn sm" data-act="po-line-add">＋ Thêm dòng</button><button type="button" class="btn sm acc" data-act="po-full" title="Điền ngày PU giao = hôm nay và SL giao = SL request cho các dòng chưa giao">✓ PU giao đủ hôm nay</button></div></div>
    ${txa('note','Ghi chú',po.note||'',{full:1,rows:2})}</div></form>`,
    {footer:(id?`<button class="btn danger" data-act="ppe-po-del" data-id="${id}" style="margin-right:auto">Xoá request</button>`:'')+cancelBtn+`<button class="btn primary" form="mf">Lưu</button>`,size:'wide kt'});
  if(el.dataset.deliver)setTimeout(()=>{const x=document.querySelector('#po-lines [data-po="dDate"]');if(x)x.focus()},50)};
ACT['po-line-add']=()=>{const tb=document.getElementById('po-lines');if(tb)tb.insertAdjacentHTML('beforeend',poRow())};
ACT['po-line-del']=el=>{const tr=el.closest('tr');if(tr)tr.remove()};
ACT['po-full']=()=>{document.querySelectorAll('#po-lines tr[data-ln]').forEach(tr=>{const q=tr.querySelector('[data-po="qty"]').value,dq=tr.querySelector('[data-po="dQty"]'),dd=tr.querySelector('[data-po="dDate"]');if(+q>0&&!(+dq.value>0)){dq.value=q;if(!dd.value)dd.value=todayStr()}})};
document.addEventListener('change',ev=>{const s=ev.target;if(!s.matches||!s.matches('#po-lines select[data-po="item"]'))return;const z=s.closest('tr').querySelector('[data-po="size"]');z.setAttribute('list','dl-po-sz-'+s.value)});
SUB['ppe-po']=form=>{if(!canPPE())return;const d=fd(form),id=form.dataset.id;
  if(!d.proj||!ppeProj(d.proj))return toast('Chọn dự án / bộ phận.','error');
  const lines=[...form.querySelectorAll('#po-lines tr[data-ln]')].map(tr=>{const g=k=>String(tr.querySelector(`[data-po="${k}"]`).value||'').trim();
    return {item:g('item'),size:g('size'),qty:Math.max(0,+g('qty')||0),dDate:g('dDate'),dQty:Math.max(0,+g('dQty')||0),detail:g('detail')}}).filter(l=>l.item&&l.qty>0);
  if(!lines.length)return toast('Nhập ít nhất một dòng có số lượng request.','error');
  for(const l of lines){if(l.dQty>0&&!l.dDate)return toast(`Nhập ngày PU giao cho dòng ${itTxt(l)}.`,'error');if(l.dDate&&!(l.dQty>0))l.dQty=l.qty;if(l.dDate&&d.reqDate&&l.dDate<d.reqDate)return toast('Ngày PU giao không được trước ngày request.','error')}
  if(ppeSave(()=>{const v={proj:d.proj,no:String(d.no||'').trim(),reqDate:d.reqDate,reqBy:String(d.reqBy||'').trim(),lines,note:String(d.note||'').trim()};
    const x=id&&db.ppe.find(z=>z.id===id);if(x)Object.assign(x,v);else db.ppe.push({id:uid('po'),kind:'po',...v,by:session?.name||'',at:new Date().toISOString()})}))done(id?'Đã lưu request':'Đã ghi request mua PPE')};
ACT['ppe-po-del']=el=>{if(!canPPE()||!confirm('Xoá request mua này?'))return;if(ppeSave(()=>{db.ppe=db.ppe.filter(v=>v.id!==el.dataset.id)}))done('Đã xoá request')};

/* ---------- In sổ cấp phát theo mẫu "PPE Allocation Book" của công trường ----------
   Mỗi lần giao (biên bản) là một dòng: tên người nhận, mã NV, số lượng từng loại (loại có size thì thêm cột Size), ngày, chữ ký. */
function bookHTML(projId){
  const p=ppeProj(projId);if(!p)return '';
  const list=ppeIssues().filter(x=>x.proj===p.id),used=new Set(list.map(x=>x.item));
  const items=ppeItems(true).filter(i=>used.has(i.id)||(!used.size&&!i.deleted));
  const hasSz=i=>!!String(i.sizes||'').trim()||list.some(x=>x.item===i.id&&x.size);
  const g=new Map();list.forEach(x=>{const k=x.rcpt||x.id;if(!g.has(k))g.set(k,{date:x.date,name:x.name,code:x.code||'',at:x.at||'',v:{}});const o=g.get(k),c=o.v[x.item]||(o.v[x.item]={q:0,s:[]});c.q+=+x.qty||0;if(x.size&&!c.s.includes(x.size))c.s.push(x.size)});
  const rows=[...g.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.at).localeCompare(String(b.at)));
  const pad=Math.max(0,15-rows.length),c=db.company||{};
  const head=items.map(i=>`<th>${esc(i.en||i.name)}${i.en&&i.en!==i.name?`<br><i>${esc(i.name)}</i>`:''}</th>${hasSz(i)?'<th>Size</th>':''}`).join('');
  const cells=r=>items.map(i=>{const v=r&&r.v[i.id];return `<td style="text-align:center">${v?fmtNum(v.q):''}</td>${hasSz(i)?`<td style="text-align:center">${v?esc(v.s.join(', ')):''}</td>`:''}`}).join('');
  return `<div class="slip book"><div class="sh"><div class="co"><b>${esc(c.name||'')}</b></div><div style="text-align:right">Ngày in: ${fmtDate(todayStr())}</div></div>
    <h2>PPE ALLOCATION BOOK</h2><div class="sub">Sổ cấp phát bảo hộ lao động &amp; đồng phục</div>
    <div class="mt"><div>Project/Department: <b>${esc(projLbl(p))}</b></div><div>PIC: <b>${esc(p.pic||'—')}</b></div>${p.site?`<div>Địa điểm: <b>${esc(p.site)}</b></div>`:''}</div>
    <table><thead><tr><th style="width:34px">No</th><th>Receiver Name</th><th>Staff code</th>${head}<th>Date</th><th style="width:110px">Sign</th></tr></thead><tbody>
    ${rows.map((r,n)=>`<tr><td style="text-align:center">${n+1}</td><td>${esc(r.name)}</td><td>${esc(r.code)}</td>${cells(r)}<td style="white-space:nowrap">${fmtDate(r.date)}</td><td></td></tr>`).join('')}
    ${Array.from({length:pad},(_,n)=>`<tr><td style="text-align:center">${rows.length+n+1}</td><td></td><td></td>${cells(null)}<td></td><td></td></tr>`).join('')}</tbody></table>
    <p class="sn">Người nhận ký xác nhận đã nhận đủ số lượng, đúng size; cam kết sử dụng đúng mục đích, bảo quản cẩn thận và báo ngay khi hư hỏng / mất để được cấp lại.</p>
    <div style="margin-top:6px;font-size:10.5px;color:#777;text-align:right">${esc(CREDIT)}</div></div>`;
}
ACT['ppe-book']=el=>{const h=bookHTML(el.dataset.proj||F().proj);if(!h)return toast('Chọn dự án trước.','warn');printHTML(h)};
