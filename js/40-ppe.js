/* 40-ppe.js – Quản lý PPE & Đồng phục
   Trang: Nhập kho · Cấp phát (PPE và đồng phục chung một phiếu) · Danh mục · Báo cáo.
   Tồn của từng vật tư (theo size) = SL nhập − SL cấp phát, hiện ở Danh mục và Nhập kho.
   Một phiếu cấp phát = một dự án / phòng ban + ngày cấp + nhiều người nhận; mỗi người nhận có số lượng và size của từng vật tư,
   ký nhận từng người. In theo mẫu giấy "PPE ALLOCATION BOOK" (No · Receiver Name · Staff code · từng vật tư · Date · Sign).
   Dữ liệu: db.ppe (Firestore: collection ppe), mỗi document có kind:
     item  – vật tư: tên, nhóm (ppe | uni), đơn vị, các size, szKey (lấy size mặc định theo hồ sơ NV: shirt | pant | shoe | glove)
     pemp  – nhân viên nhận cấp phát: mã NV, họ tên, phòng ban, dự án, size áo / quần / giày / găng tay
     proj  – dự án: mã, tên, PIC          dept – phòng ban: tên
     rcv   – phiếu nhập: {no, reqDate (ngày request mua), puDate (ngày PU giao), pr (số PR/PO), note, lines:[{item, sz, n, detail}], by, at}
     slip  – phiếu cấp phát: {no, type, job (Job number), proj, dept, date, note, items:[id], lines:[{pid, code, name, dept, q:{id:{n,sz}}, signed, signedAt}], by, at}
   Mọi người dùng đều xem và nhập. App không tự tạo việc KPI. */
'use strict';
(self.__mods=self.__mods||[]).push('40-ppe');

const SZ_CLOTH='S, M, L, XL, 2XL, 3XL',SZ_SHOE='36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46',SZ_GLOVE='S, M, L, XL';
const PITEM_DEF=[
  {id:'pi_helm',type:'ppe',name:'Mũ bảo hộ',en:'Helmet',unit:'Cái',sizes:'',ord:1},
  {id:'pi_harn',type:'ppe',name:'Dây an toàn',en:'Safety Belt',unit:'Bộ',sizes:'',ord:2},
  {id:'pi_shoe',type:'ppe',name:'Giày bảo hộ',en:'Safety Shoes',unit:'Đôi',sizes:SZ_SHOE,szKey:'shoe',ord:3},
  {id:'pi_glass',type:'ppe',name:'Kính bảo hộ',en:'Safety Glass',unit:'Cái',sizes:'',ord:4},
  {id:'pi_ear',type:'ppe',name:'Nút tai chống ồn',en:'Ear Plug',unit:'Đôi',sizes:'',ord:5},
  {id:'pi_glove',type:'ppe',name:'Găng tay',en:'Gloves',unit:'Đôi',sizes:SZ_GLOVE,szKey:'glove',ord:6},
  {id:'pi_vest',type:'ppe',name:'Áo phản quang',en:'Safety Vest',unit:'Cái',sizes:SZ_CLOTH,szKey:'shirt',ord:7},
  {id:'pi_uni',type:'uni',name:'Áo đồng phục',en:'Áo',unit:'Cái',sizes:SZ_CLOTH,szKey:'shirt',ord:11},
  {id:'pi_pant',type:'uni',name:'Quần đồng phục',en:'Quần',unit:'Cái',sizes:SZ_CLOTH,szKey:'pant',ord:12},
  {id:'pi_ushoe',type:'uni',name:'Giày đồng phục',en:'Giày',unit:'Đôi',sizes:SZ_SHOE,szKey:'shoe',ord:13}
];
const PTYPE={ppe:{icon:'⛑️',book:'PPE ALLOCATION BOOK',grp:'PPE',sub:'bảo hộ lao động'},
  uni:{icon:'👕',book:'PPE ALLOCATION · ĐỒNG PHỤC',grp:'Đồng phục',sub:'đồng phục'},
  mix:{icon:'⛑️',book:'PPE ALLOCATION BOOK',grp:'PPE & đồng phục',sub:'bảo hộ lao động & đồng phục'}};
const slipType=items=>{const t=new Set(items.map(id=>pItem(id)?.type||'ppe'));return t.size>1?'mix':t.has('uni')?'uni':'ppe'};
/* tồn theo vật tư + size: nhập (phiếu nhập) − cấp (phiếu cấp phát) */
function pStock(){const m=new Map(),g=(id,sz)=>{const k=id+'|'+(sz||'');if(!m.has(k))m.set(k,{id,sz:sz||'',inn:0,out:0});return m.get(k)};
  pDocs('rcv').forEach(r=>(r.lines||[]).forEach(l=>{if(l.item&&+l.n>0)g(l.item,l.sz).inn+=+l.n}));
  pDocs('slip').forEach(s=>(s.lines||[]).forEach(l=>Object.entries(l.q||{}).forEach(([id,v])=>{if(+v.n>0)g(id,v.sz).out+=+v.n})));
  pDocs('ret').forEach(s=>(s.lines||[]).filter(l=>l.reuse!==false).forEach(l=>Object.entries(l.q||{}).forEach(([id,v])=>{if(+v.n>0)g(id,v.sz).inn+=+v.n})));   /* thu hồi còn dùng được: cộng lại tồn */
  return m}
const stockOf=(st,id)=>[...st.values()].filter(o=>o.id===id);
const stockTxt=(st,id)=>{const rs=stockOf(st,id),t=rs.reduce((a,o)=>a+o.inn-o.out,0);return{t,inn:rs.reduce((a,o)=>a+o.inn,0),out:rs.reduce((a,o)=>a+o.out,0),
  sz:rs.filter(o=>o.sz&&(o.inn||o.out)).sort((a,b)=>{const it=pItem(id),ss=splitSz(it?.sizes);return ss.indexOf(a.sz)-ss.indexOf(b.sz)}).map(o=>`<span class="chip ${o.inn-o.out<0?'bad':''}">${esc(o.sz)}: <b>${o.inn-o.out}</b></span>`).join(' ')}};
const SZK={shirt:'Size áo',pant:'Size quần',shoe:'Size giày',glove:'Size găng tay'};
const canPPE=()=>{if(!session){toast('Cần đăng nhập.','error');return false}return true};   /* mọi người dùng đều xem và nhập */
const ppeSave=fn=>transact(()=>{if(!Array.isArray(db.ppe))db.ppe=[];fn()});
const pDocs=k=>(db.ppe||[]).filter(x=>x.kind===k);
const splitSz=s=>String(s||'').split(',').map(x=>x.trim()).filter(Boolean);
function pItems(type,all){
  const m=new Map(PITEM_DEF.map(d=>[d.id,{...d,kind:'item'}]));pDocs('item').forEach(d=>m.set(d.id,{...(m.get(d.id)||{}),...d}));
  return [...m.values()].filter(d=>(all||!d.deleted)&&(!type||d.type===type)).sort((a,b)=>(a.ord||99)-(b.ord||99)||String(a.name).localeCompare(String(b.name),'vi'));
}
const pItem=id=>pItems('',true).find(x=>x.id===id);
const pEmps=()=>pDocs('pemp').sort((a,b)=>String(a.name).localeCompare(String(b.name),'vi'));
const pEmp=id=>pDocs('pemp').find(x=>x.id===id);
const pProjs=()=>pDocs('proj').filter(p=>p.name||p.code).sort((a,b)=>(a.status==='done')-(b.status==='done')||String(a.code||a.name).localeCompare(String(b.code||b.name)));
const pProj=id=>pDocs('proj').find(x=>x.id===id);
const projName=id=>{const p=pProj(id);return p?(p.code&&p.name&&p.code!==p.name?`${p.code} · ${p.name}`:p.code||p.name):''};
const pDepts=()=>[...new Set([...pDocs('dept').map(d=>d.name),...pEmps().map(e=>e.dept)].map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));
const pSlips=type=>pDocs('slip').filter(s=>!type||s.type===type);
const slipLines=s=>(s.lines||[]).filter(l=>Object.values(l.q||{}).some(v=>+v.n>0));
const lineQty=l=>Object.values(l.q||{}).reduce((a,v)=>a+(+v.n||0),0);
const slipQty=s=>slipLines(s).reduce((a,l)=>a+lineQty(l),0);
function slipSt(s){const ls=slipLines(s),k=ls.filter(l=>l.signed).length;return !ls.length?'empty':k===ls.length?'ok':k?'part':'wait'}
const SLIP_ST={ok:['ok','Đã ký'],part:['warn','Ký một phần'],wait:['warn','Chờ ký'],empty:['mute','Chưa có vật tư']};
const stB=s=>{const v=SLIP_ST[slipSt(s)],ls=slipLines(s),k=ls.filter(l=>l.signed).length;return badge(v[0],slipSt(s)==='part'?`Đã ký ${k}/${ls.length}`:v[1])};
const slipItemsTxt=s=>{const ids=new Set();slipLines(s).forEach(l=>Object.entries(l.q||{}).forEach(([id,v])=>{if(+v.n>0)ids.add(id)}));return [...ids].map(id=>pItem(id)?.name||'?').join(', ')};
const projOptsP=(all)=>[['',all||'— Chọn dự án —'],...pProjs().map(p=>[p.id,projName(p.id)+(p.status==='done'?' (đã xong)':'')])];
const deptOptsP=(all)=>[['',all||'— Chọn phòng ban —'],...pDepts().map(d=>[d,d])];

/* ---------- phiếu đang tạo / sửa (giữ trong bộ nhớ đến khi bấm Lưu) ---------- */
let PDRAFT=null;
/* ---------- tự ghi việc vào KPI (Work B) của người thao tác: cấp phát / thu hồi / nhập PPE, nhập số liệu ESG ----------
   ref: mã duy nhất của nguồn (id phiếu, esg-2026-11…) – lưu lại thì cập nhật, xoá phiếu thì xoá việc. Chỉ ghi vào bảng KPI của chính mình. */
const KPI_MATCH={ppe:r=>!!r.ppe||/ppe|cap phat|bao ho/.test(norm(r.text||'')),esg:r=>/esg/.test(norm(r.text||''))};
function kpiAuto(ref,o){const me=session&&session.empId;if(!me||!empOf(me)||!/^\d{4}-\d{2}/.test(o.ym||''))return false;
  const y=+o.ym.slice(0,4),mm=o.ym.slice(5,7),sh=sheetOf(me,y,true);if(!sh||!sh.months[mm])return false;
  const m=sh.months[mm];if(m.lock&&!m.tasks.some(t=>t.auto===ref)){toast(`Tháng ${+mm}/${y} đã chốt điểm nên không tự ghi việc “${o.title}”.`,'warn');return false}
  db.sheets.filter(x=>x.empId===me).forEach(x=>Object.values(x.months).forEach(mo=>{if(mo===m)return;const i=mo.tasks.findIndex(t=>t.auto===ref);if(i>=0)mo.tasks.splice(i,1)}));
  const line=kpiRows(kpiOf(me,y)).find(r=>+r.w>0&&KPI_MATCH[o.match](r));
  let t=m.tasks.find(t=>t.auto===ref);const before=t?JSON.stringify(t):'';if(!t){t={id:uid('t'),weight:1,approval:'',auto:ref,src:'auto'};m.tasks.push(t)}
  const dl0=t.deadline;Object.assign(t,{title:o.title,deadline:o.keepDl&&dl0?dl0:(o.deadline||o.done),submitted:o.keep&&t.submitted?t.submitted:(o.done||''),note:o.note||''});if(line&&!t.kpi)t.kpi=line.id;if(JSON.stringify(t)!==before)sh.updatedAt=todayStr();return true}
function kpiAutoDel(ref){const me=session&&session.empId,all=can('manage');db.sheets.filter(x=>all||x.empId===me).forEach(x=>Object.values(x.months).forEach(mo=>{const i=mo.tasks.findIndex(t=>t.auto===ref);if(i>=0){mo.tasks.splice(i,1);x.updatedAt=todayStr()}}))}
const grpWord=t=>t==='uni'?'đồng phục':t==='mix'?'PPE & đồng phục':'PPE';
const whoTxt=ls=>{const n=ls.map(l=>l.name);return n.length===1?`bạn ${n[0]}`:n.length===2?`bạn ${n[0]}, ${n[1]}`:`bạn ${n[0]}, ${n[1]} và ${n.length-2} người khác`};
const whereTxt=v=>{const p=pProj(v.proj);return p?(p.code||p.name):v.dept||''};
const slipTitle=(v,kind)=>`${kind==='ret'?'Thu hồi':'Cấp phát'} ${grpWord(v.type)} ${kind==='ret'?'của':'cho'} ${whoTxt(v.lines)}${whereTxt(v)?' - '+whereTxt(v):''}`;
const RET_REASON=[['quit','Nghỉ việc'],['proj','Kết thúc dự án / chuyển dự án'],['swap','Đổi mới / cấp thay'],['dmg','Hư hỏng'],['other','Khác']];
const findSlip=id=>(db.ppe||[]).find(x=>x.id===id&&(x.kind==='slip'||x.kind==='ret'));
const pRets=()=>pDocs('ret');
/* đồ đang giữ của một người = đã cấp − đã thu hồi (theo vật tư + size) */
function holdings(e){const m=new Map(),me=l=>e.pid?l.pid===e.pid:!l.pid&&norm(l.name)===norm(e.name),add=(s,k)=>(s.lines||[]).filter(me).forEach(l=>Object.entries(l.q||{}).forEach(([id,v])=>{const key=id+'|'+(v.sz||'');m.set(key,(m.get(key)||0)+k*(+v.n||0))}));
  pSlips().forEach(s=>add(s,1));pRets().forEach(s=>add(s,-1));return [...m.entries()].filter(([,n])=>n>0).map(([k,n])=>{const [id,sz]=k.split('|');return{id,sz,n}})}
const nextNo=(pfx,date)=>{const pre=`${pfx}-${String(date||todayStr()).replace(/-/g,'')}-`,used=new Set([...pSlips(),...pDocs('rcv')].map(s=>s.no));let n=1;while(used.has(pre+String(n).padStart(3,'0')))n++;return pre+String(n).padStart(3,'0')};
function newDraft(kind='slip'){const f=F();
  return{kind,no:'',job:'',proj:f.proj||'',dept:f.dept||'',date:todayStr(),note:'',reason:kind==='ret'?'quit':'',items:kind==='ret'?[]:pItems('ppe').slice(0,3).map(i=>i.id),lines:[]}}
const defSz=(it,e)=>it&&it.szKey&&e?String(e['sz_'+it.szKey]||''):'';
function addLine(e){const d=PDRAFT;if(e.pid&&d.lines.some(l=>l.pid===e.pid))return false;
  const q={};
  if(d.kind==='ret'){const h=holdings(e);h.forEach(x=>{if(!d.items.includes(x.id))d.items.push(x.id);if(!q[x.id])q[x.id]={n:x.n,sz:x.sz}});   /* thu hồi: điền sẵn đồ người đó đang giữ */
    const ord=pItems('').map(i=>i.id);d.items.sort((a,b)=>ord.indexOf(a)-ord.indexOf(b))}
  d.items.forEach(id=>{if(!q[id]){const it=pItem(id);q[id]={n:d.kind==='ret'?0:1,sz:defSz(it,e.pid?pEmp(e.pid):null)}}});
  d.lines.push({pid:e.pid||'',code:e.code||'',name:e.name,dept:e.dept||'',q,signed:false,...(d.kind==='ret'?{reuse:true}:{})});return true}
const empLbl=e=>`${e.code?e.code+' · ':''}${e.name}`;
function draftHTML(){const d=PDRAFT,its=d.items.map(pItem).filter(Boolean),st=pStock(),RT=d.kind==='ret';
  const pool=pEmps().filter(e=>e.active!==false&&(!d.proj||!e.proj||e.proj===d.proj)&&!d.lines.some(l=>l.pid===e.id));
  const inProj=d.proj?pEmps().filter(e=>e.active!==false&&e.proj===d.proj&&!d.lines.some(l=>l.pid===e.id)).length:0;
  const szSel=(it,i,v)=>{const s=splitSz(it.sizes);return s.length?`<select class="in" data-pq="${i}|${it.id}|sz" aria-label="Size ${esc(it.name)} dòng ${i+1}"><option value="">–</option>${s.map(x=>`<option ${x===v?'selected':''}>${esc(x)}</option>`).join('')}${v&&!s.includes(v)?`<option selected>${esc(v)}</option>`:''}</select>`:''};
  return `<section class="card pform"><div class="pfh"><h4><span class="pic">${RT?'↩️':'⛑️'}</span> Thông tin ${RT?'thu hồi':'cấp phát'} PPE &amp; đồng phục ${d.id?`<small class="muted">· sửa phiếu ${esc(d.no)}</small>`:''}</h4></div>
    <div class="pgrid">
      <label class="f"><span>Dự án</span><select class="in" data-pd="proj">${projOptsP().map(([v,l])=>`<option value="${esc(v)}" ${v===d.proj?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="f"><span>Phòng ban</span><select class="in" data-pd="dept">${deptOptsP().map(([v,l])=>`<option value="${esc(v)}" ${v===d.dept?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="f"><span>Job number</span><input class="in" data-pd="job" value="${esc(d.job||'')}" placeholder="VD: J26-0158" list="dl-pd-job"><datalist id="dl-pd-job">${[...new Set(pSlips().map(x=>x.job).filter(Boolean))].map(j=>`<option value="${esc(j)}">`).join('')}</datalist></label>
      <label class="f"><span>Ngày ${RT?'thu hồi':'cấp phát'} <i>*</i></span><input class="in" type="date" data-pd="date" value="${esc(d.date)}"></label>
      <label class="f"><span>Số phiếu</span><input class="in" readonly value="${esc(d.no||'Tự động sinh')}"></label>
      ${RT?`<label class="f"><span>Lý do thu hồi</span><select class="in" data-pd="reason">${RET_REASON.map(([k,l])=>`<option value="${k}" ${d.reason===k?'selected':''}>${l}</option>`).join('')}</select></label>`:''}
      <label class="f ${RT?'w2':'w3'}"><span>Ghi chú <small class="muted">${RT?'(tình trạng đồ thu hồi, nơi cất…)':'(lý do cấp: cấp mới, thay hư hỏng, mất…)'}</small></span><input class="in" data-pd="note" value="${esc(d.note||'')}"></label>
    </div>
    <div class="psub"><b>Vật tư ${RT?'thu hồi':'cấp'}</b> <small class="muted">bấm để chọn / bỏ${RT?' · thêm người trả thì app tự điền đồ người đó đang giữ':''}</small>${['ppe','uni'].map(t=>`<div class="pchips"><span class="pcg">${PTYPE[t].icon} ${PTYPE[t].grp}</span>${pItems(t).map(i=>{const k=stockTxt(st,i.id).t;return `<button type="button" class="pchip ${d.items.includes(i.id)?'on':''}" data-act="pd-item" data-id="${i.id}" title="Tồn kho: ${k}">${d.items.includes(i.id)?'✓ ':''}${esc(i.name)} <small>· tồn ${k}</small></button>`}).join('')}</div>`).join('')}<div class="pchips"><a class="pchip add" href="#/ppe/cat" data-act="pd-cat">＋ Thêm vật tư ở Danh mục</a></div></div>
    <div class="psub"><b>${RT?'Người trả':'Người nhận'}</b> <small class="muted">${fmtNum(d.lines.length)} người</small>
      <div class="padd"><input class="in" id="pd-emp" list="dl-pd-emp" placeholder="Chọn nhân viên (gõ tên hoặc mã NV)…" autocomplete="off" aria-label="Chọn nhân viên"><datalist id="dl-pd-emp">${pool.map(e=>`<option value="${esc(empLbl(e))}">${esc([e.dept,projName(e.proj)].filter(Boolean).join(' · '))}</option>`).join('')}<option value="Visitor">Khách (không mã NV)</option></datalist>
        <button type="button" class="btn" data-act="pd-add">＋ Thêm</button>${inProj?`<button type="button" class="btn acc" data-act="pd-addall">＋ Thêm cả dự án (${inProj} người)</button>`:''}</div></div>
    ${d.lines.length?`<div class="tw"><table class="t pgt"><thead><tr><th rowspan="2">STT</th><th rowspan="2">Nhân viên</th>${its.map(it=>`<th ${splitSz(it.sizes).length?'colspan="2"':'rowspan="2"'}>${esc(it.name)}<br><small>${esc(it.unit||'')}</small></th>`).join('')}<th rowspan="2">${RT?'Ký trả':'Ký nhận'}</th>${RT?'<th rowspan="2">Nhập lại kho</th>':''}<th rowspan="2"></th></tr><tr>${its.filter(it=>splitSz(it.sizes).length).map(()=>'<th>SL</th><th>Size</th>').join('')}</tr></thead><tbody>
      ${d.lines.map((l,i)=>`<tr><td class="c">${i+1}</td><td><b>${esc(l.name)}</b><br><small class="muted">${esc([l.code,l.dept].filter(Boolean).join(' · '))}</small></td>
        ${its.map(it=>{const v=(l.q||{})[it.id]||{};return `<td><input class="in" type="number" min="0" max="999" data-pq="${i}|${it.id}|n" value="${v.n?esc(v.n):''}" aria-label="${esc(it.name)} dòng ${i+1}"></td>${splitSz(it.sizes).length?`<td>${szSel(it,i,v.sz||'')}</td>`:''}`}).join('')}
        <td class="c"><label class="chk"><input type="checkbox" data-pq="${i}||signed" ${l.signed?'checked':''}> Đã ký</label></td>${RT?`<td class="c"><label class="chk" title="Còn dùng được: cộng lại vào tồn kho"><input type="checkbox" data-pq="${i}||reuse" ${l.reuse!==false?'checked':''}> Còn dùng</label></td>`:''}<td class="c"><button type="button" class="btn sm" data-act="pd-del" data-i="${i}" title="Bỏ người này" aria-label="Bỏ dòng ${i+1}">🗑</button></td></tr>`).join('')}
      </tbody></table></div>${RT?'<p class="note">Số lượng, size điền sẵn theo đồ người đó đang giữ (đã cấp − đã thu hồi). Bỏ “Còn dùng” nếu đồ hư, không nhập lại kho.</p>':`<p class="note">Size tự điền theo hồ sơ nhân viên ở Danh mục (sửa được). Số lượng mặc định 1, để trống = không cấp món đó.</p><div id="pd-stock">${draftStockWarn()}</div>`}`:`<div class="empty sm">Chưa có ${RT?'người trả':'người nhận'}. Chọn nhân viên ở trên, hoặc chọn dự án rồi bấm “Thêm cả dự án”.</div>`}
    <div class="pfoot"><span class="muted">${fmtNum(d.lines.length)} người · ${fmtNum(d.lines.reduce((a,l)=>a+lineQty(l),0))} món</span><div class="sp"></div><button type="button" class="btn" data-act="pd-cancel">Hủy</button><button type="button" class="btn primary" data-act="pd-save">Lưu phiếu</button></div></section>`}
const redrawDraft=()=>{const el=$('#pform');if(el&&PDRAFT)el.innerHTML=draftHTML()};
/* cảnh báo cấp vượt tồn (vẫn cho lưu: có thể hàng tồn từ trước chưa nhập vào app) */
function draftStockWarn(){const d=PDRAFT;if(!d||d.kind==='ret')return '';const st=pStock(),need=new Map();
  d.lines.forEach(l=>d.items.forEach(id=>{const v=l.q[id];if(v&&+v.n>0){const k=id+'|'+(v.sz||'');need.set(k,(need.get(k)||0)+ +v.n)}}));
  if(d.id){const old=pSlips().find(x=>x.id===d.id);old&&(old.lines||[]).forEach(l=>Object.entries(l.q||{}).forEach(([id,v])=>{const o=st.get(id+'|'+(v.sz||''));if(o)o.out-=+v.n||0}))}
  const bad=[...need.entries()].map(([k,n])=>{const o=st.get(k)||{inn:0,out:0},[id,sz]=k.split('|');return{id,sz,n,left:o.inn-o.out}}).filter(x=>x.n>x.left);
  return bad.length?`<div class="pwarn">⚠ Cấp vượt tồn kho: ${bad.map(x=>`<b>${esc(pItem(x.id)?.name||'')}${x.sz?' '+esc(x.sz):''}</b> cấp ${x.n}, tồn ${x.left}`).join(' · ')}. Kiểm tra lại hoặc nhập kho trước.</div>`:''}
document.addEventListener('input',ev=>{const el=ev.target;if(!PDRAFT||!el.closest||!el.closest('#pform'))return;
  if(el.dataset.pd){PDRAFT[el.dataset.pd]=el.value;return}
  if(el.dataset.pq){const [i,id,k]=el.dataset.pq.split('|'),l=PDRAFT.lines[+i];if(!l)return;if(k==='signed'){l.signed=el.checked;return}if(k==='reuse'){l.reuse=el.checked;return}
    const v=(l.q[id]=l.q[id]||{n:0,sz:''});if(k==='n')v.n=Math.max(0,+el.value||0);else v.sz=el.value;const w=$('#pd-stock');if(w)w.innerHTML=draftStockWarn()}});
document.addEventListener('change',ev=>{const el=ev.target;if(!PDRAFT||!el.closest||!el.closest('#pform'))return;
  if(el.dataset.pd==='proj'||el.dataset.pd==='dept'){PDRAFT[el.dataset.pd]=el.value;redrawDraft();return}
  if(el.dataset.pq&&el.type==='checkbox'&&el.dataset.pq.endsWith('|reuse')){const l=PDRAFT.lines[+el.dataset.pq.split('|')[0]];if(l)l.reuse=el.checked;return}
  if(el.dataset.pq&&el.type==='checkbox'){const l=PDRAFT.lines[+el.dataset.pq.split('|')[0]];if(l){l.signed=el.checked;if(el.checked&&!l.signedAt)l.signedAt=PDRAFT.date||todayStr()}}
  if(el.id==='pd-emp'&&el.value)ACT['pd-add']()});
function pickEmp(v){v=String(v||'').trim();if(!v)return null;const e=pEmps().find(e=>norm(empLbl(e))===norm(v)||norm(e.code)===norm(v)||norm(e.name)===norm(v));
  return e?{pid:e.id,code:e.code,name:e.name,dept:e.dept||''}:{pid:'',code:'',name:v,dept:''}}
ACT['pd-new']=el=>{if(!canPPE())return;PDRAFT=newDraft(el&&el.dataset&&el.dataset.kind==='ret'?'ret':'slip');rerender();setTimeout(()=>$('#pd-emp')?.focus(),50)};
ACT['pd-cancel']=()=>{PDRAFT=null;rerender()};
ACT['pd-cat']=()=>{PDRAFT=null;location.hash='#/ppe/cat'};
ACT['pd-item']=el=>{const d=PDRAFT,id=el.dataset.id;if(d.items.includes(id))d.items=d.items.filter(x=>x!==id);else{d.items.push(id);const it=pItem(id);d.lines.forEach(l=>{if(!l.q[id])l.q[id]={n:1,sz:defSz(it,l.pid?pEmp(l.pid):null)}})}
  const ord=pItems('').map(i=>i.id);d.items.sort((a,b)=>ord.indexOf(a)-ord.indexOf(b));redrawDraft()};
ACT['pd-add']=()=>{const inp=$('#pd-emp'),e=pickEmp(inp&&inp.value);if(!e)return toast('Chọn hoặc gõ tên nhân viên.','warn');if(!addLine(e))toast('Người này đã có trong phiếu.','warn');redrawDraft();setTimeout(()=>$('#pd-emp')?.focus(),20)};
ACT['pd-addall']=()=>{const d=PDRAFT;let n=0;pEmps().filter(e=>e.active!==false&&e.proj===d.proj).forEach(e=>{if(addLine({pid:e.id,code:e.code,name:e.name,dept:e.dept}))n++});redrawDraft();toast(`Đã thêm ${n} người của dự án`)};
ACT['pd-del']=el=>{PDRAFT.lines.splice(+el.dataset.i,1);redrawDraft()};
ACT['pd-save']=()=>{if(!canPPE())return;const d=PDRAFT;
  if(!d.proj&&!d.dept){const ps=[...new Set(d.lines.map(l=>l.pid&&pEmp(l.pid)?.proj).filter(Boolean))],ds=[...new Set(d.lines.map(l=>l.dept).filter(Boolean))];if(ps.length===1)d.proj=ps[0];else if(ds.length===1)d.dept=ds[0]}   /* lấy theo hồ sơ người trong phiếu */
  if(!d.proj&&!d.dept)return toast('Chọn dự án hoặc phòng ban.','error');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date||''))return toast(d.kind==='ret'?'Nhập ngày thu hồi.':'Nhập ngày cấp phát.','error');
  const lines=d.lines.map(l=>({...l,q:Object.fromEntries(Object.entries(l.q||{}).filter(([id,v])=>d.items.includes(id)&&+v.n>0).map(([id,v])=>[id,{n:+v.n,sz:v.sz||''}]))})).filter(l=>Object.keys(l.q).length);
  if(!lines.length)return toast(d.kind==='ret'?'Phiếu chưa có người trả nào có số lượng.':'Phiếu chưa có người nhận nào có số lượng.','error');
  if(!d.dept){const ds=[...new Set(lines.map(l=>l.dept).filter(Boolean))];if(ds.length===1)d.dept=ds[0]}
  lines.forEach(l=>{if(l.signed&&!l.signedAt)l.signedAt=d.date;if(!l.signed)delete l.signedAt});
  const used=d.items.filter(id=>lines.some(l=>l.q[id]));
  const RT=d.kind==='ret',v={type:slipType(used),job:String(d.job||'').trim(),proj:d.proj,dept:d.dept,date:d.date,note:String(d.note||'').trim(),items:used,lines,...(RT?{reason:d.reason||'other'}:{})};
  let no=d.no,auto=false;const id=d.id||uid(RT?'pr':'ps');
  if(ppeSave(()=>{if(d.id){const x=db.ppe.find(z=>z.id===d.id);if(!x)throw new Error('Phiếu này không còn tồn tại.');Object.assign(x,v,{updatedAt:new Date().toISOString(),updatedBy:session?.name||''})}
    else{no=nextNo(RT?'TH':'CP',d.date);db.ppe.push({id,kind:RT?'ret':'slip',no,...v,by:session?.name||'',at:new Date().toISOString()})}
    auto=kpiAuto(id,{ym:d.date,title:slipTitle(v,d.kind),done:d.date,deadline:d.date,match:'ppe',note:`Tự ghi từ phiếu ${no} (Quản lý PPE & Đồng phục)`})})){PDRAFT=null;rerender();toast(`Đã lưu phiếu ${no}${auto===true?' · đã ghi việc vào KPI tháng '+(+d.date.slice(5,7)):''}`)}};

/* ---------- trang Cấp phát PPE / Cấp phát đồng phục ---------- */
/* nhóm của phiếu (PPE / đồng phục / cả hai) theo các vật tư trong phiếu */
const slipGrp=s=>s.type==='mix'||s.type==='uni'||s.type==='ppe'?s.type:'ppe';
const grpHas=(s,g)=>{const t=slipGrp(s);return !g||t===g||t==='mix'};
function slipListPage(kind){const RT=kind==='ret',W=RT?'thu hồi':'cấp phát',hs=RT?'ret':'out';return{t:RT?'Thu hồi PPE & đồng phục':'Cấp phát PPE & đồng phục',
  sub(){return RT?'Thu hồi khi nghỉ việc, hết dự án, đổi mới, hư hỏng – điền sẵn đồ người đó đang giữ':'Một phiếu cho nhiều người trong cùng dự án, gồm cả PPE và đồng phục'},
  head(){return `<div class="phero"><span class="pic big">${RT?'↩️':'⛑️'}</span><div><h2>${RT?'Thu hồi':'Cấp phát'} PPE &amp; đồng phục</h2><p>${RT?'Ghi nhận thu hồi trang thiết bị bảo hộ và đồng phục; đồ còn dùng được cộng lại vào tồn kho':'Quản lý cấp phát trang thiết bị bảo hộ lao động và đồng phục'}</p></div><div class="sp"></div><button class="btn primary" data-act="pd-new" data-kind="${kind}">＋ Tạo phiếu ${W}</button><button class="btn" data-act="ps-xlsx">⬇ Xuất Excel</button></div>
      <div class="bar pfil">${fSearch('Tìm tên, mã NV, mã phiếu, Job number…')}<label class="fl">Nhóm ${fSel('grp','Nhóm',[['','Tất cả'],['ppe','PPE'],['uni','Đồng phục']])}</label><label class="fl">Phòng ban ${fSel('dept','Phòng ban',deptOptsP('Tất cả'))}</label><label class="fl">Dự án ${fSel('proj','Dự án',projOptsP('Tất cả'))}</label><label class="fl">Trạng thái ${fSel('st','Trạng thái',[['','Tất cả'],['ok','Đã ký'],['wait','Chờ ký'],['part','Ký một phần']])}</label>${fDate('from','Từ ngày')}${fDate('to','Đến ngày')}<button class="btn" data-act="ps-reset" title="Bỏ các bộ lọc">⟲ Đặt lại</button></div>
      ${PDRAFT&&(PDRAFT.kind||'slip')===kind?`<div id="pform">${draftHTML()}</div>`:''}`},
  tbl(){const rows=slipRows(kind);
    return `<section class="card plist"><h4><span class="pic">📋</span> Danh sách phiếu ${W} <small class="muted">· tổng ${fmtNum(rows.length)} phiếu</small></h4>`+table([
      {h:'STT',c:'c',f:r=>r.n,x:r=>r.n},
      {h:'Mã phiếu',f:r=>`<a href="#/ppe/${hs}" data-act="ps-view" data-id="${r.s.id}"><b style="white-space:nowrap">${esc(r.s.no)}</b></a><br>${badge(slipGrp(r.s)==='uni'?'acc':slipGrp(r.s)==='mix'?'mute':'info',PTYPE[slipGrp(r.s)].grp)}`,x:r=>r.s.no},
      {h:'Job number',f:r=>`<span style="white-space:nowrap">${esc(r.s.job||'–')}</span>`,x:r=>r.s.job||''},
      {h:'Nhân viên',f:r=>{const ls=slipLines(r.s);return `${ls.slice(0,2).map(l=>esc(l.name)).join(', ')}${ls.length>2?` <small class="muted">+${ls.length-2} người</small>`:''}`},x:r=>slipLines(r.s).map(l=>l.name).join(', ')},
      {h:'Phòng ban',f:r=>esc(r.s.dept||'–'),x:r=>r.s.dept||''},
      {h:'Dự án',f:r=>{const p=pProj(r.s.proj);return p?`<span style="white-space:nowrap" title="${esc(projName(p.id))}">${esc(p.code||p.name)}</span>`:'–'},x:r=>projName(r.s.proj)},
      ...(RT?[{h:'Lý do',f:r=>esc((RET_REASON.find(x=>x[0]===r.s.reason)||[])[1]||''),x:r=>(RET_REASON.find(x=>x[0]===r.s.reason)||[])[1]||''}]:[]),{h:RT?'Ngày thu hồi':'Ngày cấp phát',f:r=>`<span style="white-space:nowrap">${fmtDate(r.s.date)}</span>`,x:r=>fmtDate(r.s.date)},
      {h:'Vật tư',c:'nt',f:r=>esc(slipItemsTxt(r.s)),x:r=>slipItemsTxt(r.s)},
      {h:'Số lượng',c:'num',f:r=>fmtNum(slipQty(r.s)),x:r=>slipQty(r.s)},
      {h:'Trạng thái',f:r=>stB(r.s),x:r=>SLIP_ST[slipSt(r.s)][1]},
      actCol(r=>`<button class="btn sm" data-act="ps-view" data-id="${r.s.id}" title="Xem / ký nhận" aria-label="Xem phiếu">👁</button><button class="btn sm" data-act="ps-edit" data-id="${r.s.id}" title="Sửa" aria-label="Sửa phiếu">✎</button>${RT?'':`<button class="btn sm" data-act="ps-iso" data-id="${r.s.id}" title="Xuất Excel theo mẫu ISO AZ-PG-440-A05" aria-label="Xuất Excel mẫu ISO">📗</button>`}<button class="btn sm" data-act="ps-print" data-id="${r.s.id}" title="In phiếu" aria-label="In phiếu">🖨</button><button class="btn sm" data-act="ps-del" data-id="${r.s.id}" title="Xoá" aria-label="Xoá phiếu">🗑</button>`)
    ],rows,{empty:`Chưa có phiếu nào phù hợp. Bấm “＋ Tạo phiếu ${W}”.`,meta:false})+'</section>'}}}
PAGES['ppe/out']=slipListPage('slip');PAGES['ppe/ret']=slipListPage('ret');
function slipRows(kind='slip'){const f=F(),q=norm(f.q);
  return (kind==='ret'?pRets():pSlips()).filter(s=>grpHas(s,f.grp)&&(!f.dept||s.dept===f.dept)&&(!f.proj||s.proj===f.proj)&&(!f.from||s.date>=f.from)&&(!f.to||s.date<=f.to)&&(!f.st||slipSt(s)===f.st)
    &&(!q||norm(`${s.no} ${s.job||''} ${slipLines(s).map(l=>l.name+' '+l.code).join(' ')}`).includes(q)))
    .sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.no).localeCompare(String(a.no))).map((s,i)=>({s,n:i+1}))}
ACT['ps-reset']=()=>{const k=ui.key;ui.f[k]={};rerender()};
ACT['ps-edit']=el=>{if(!canPPE())return;const s=findSlip(el.dataset.id);if(!s)return;closeModal();PDRAFT=JSON.parse(JSON.stringify({...s,items:s.items&&s.items.length?s.items:[...new Set(slipLines(s).flatMap(l=>Object.keys(l.q)))]}));
  const h='#/ppe/'+(s.kind==='ret'?'ret':'out');if(location.hash!==h)location.hash=h;else rerender();setTimeout(()=>$('#pform')?.scrollIntoView({behavior:'smooth',block:'start'}),60)};
ACT['ps-del']=el=>{if(!canPPE())return;const s=findSlip(el.dataset.id);if(!s||!confirm(`Xoá phiếu ${s.no}? Việc tự ghi trong KPI (nếu có) cũng được xoá.`))return;if(ppeSave(()=>{db.ppe=db.ppe.filter(v=>v.id!==s.id);kpiAutoDel(s.id)})){closeModal();refreshTbl();toast('Đã xoá phiếu')}};
function slipTable(s,signBtns){const ids=[...new Set(slipLines(s).flatMap(l=>Object.keys(l.q)))],its=pItems('',true).filter(i=>ids.includes(i.id));
  return `<div class="tw"><table class="t pgt"><thead><tr><th>STT</th><th>Nhân viên</th>${its.map(i=>`<th>${esc(i.name)}</th>`).join('')}<th>Ký nhận</th></tr></thead><tbody>${slipLines(s).map((l,i)=>`<tr><td class="c">${i+1}</td><td><b>${esc(l.name)}</b><br><small class="muted">${esc([l.code,l.dept].filter(Boolean).join(' · '))}</small></td>${its.map(it=>{const v=l.q[it.id];return `<td class="c">${v&&+v.n?`<b>${fmtNum(+v.n)}</b>${v.sz?` <small class="muted">${esc(v.sz)}</small>`:''}`:''}</td>`}).join('')}
    <td>${l.signed?`<span class="pos">✔ Đã ký</span> <small class="muted">${fmtDate(l.signedAt)}</small>${signBtns?` <button class="btn sm" data-act="ps-sign" data-id="${s.id}" data-i="${(s.lines||[]).indexOf(l)}" data-v="0">Bỏ</button>`:''}`:signBtns?`<button class="btn sm acc" data-act="ps-sign" data-id="${s.id}" data-i="${(s.lines||[]).indexOf(l)}" data-v="1">Ký nhận</button>`:'<span class="muted">Chờ ký</span>'}</td></tr>`).join('')}</tbody></table></div>`}
ACT['ps-view']=el=>{const s=findSlip(el.dataset.id);if(!s)return;
  const info=[['Số phiếu',s.no],['Job number',s.job||'–'],['Ngày cấp',fmtDate(s.date)],['Nhóm',PTYPE[slipGrp(s)].grp],['Dự án',projName(s.proj)||'–'],['Phòng ban',s.dept||'–'],['Người lập',s.by||''],['Trạng thái',stB(s)]];
  modal(`Phiếu ${s.no}`,`<div class="pinfo">${info.map(([k,v])=>`<div><small>${k}</small><b>${k==='Trạng thái'?v:esc(v)}</b></div>`).join('')}</div>${s.note?`<p class="note">${esc(s.note)}</p>`:''}${slipTable(s,true)}`,
    {footer:`<button class="btn danger" data-act="ps-del" data-id="${s.id}" style="margin-right:auto">Xoá</button>${slipSt(s)!=='ok'?`<button class="btn acc" data-act="ps-signall" data-id="${s.id}">✔ Ký nhận tất cả</button>`:''}<button class="btn" data-act="ps-edit" data-id="${s.id}">✎ Sửa</button><button class="btn" data-act="ps-iso" data-id="${s.id}">📗 Excel mẫu ISO</button><button class="btn primary" data-act="ps-print" data-id="${s.id}">🖨 In phiếu</button>`,size:'wide kt'})};
ACT['ps-sign']=el=>{if(!canPPE())return;const id=el.dataset.id,i=+el.dataset.i,on=el.dataset.v==='1';
  if(ppeSave(()=>{const s=db.ppe.find(z=>z.id===id),l=s&&s.lines[i];if(!l)throw new Error('Dòng này không còn.');l.signed=on;if(on)l.signedAt=todayStr();else delete l.signedAt})){refreshTbl();ACT['ps-view']({dataset:{id}})}};
ACT['ps-signall']=el=>{if(!canPPE())return;const id=el.dataset.id;if(ppeSave(()=>{const s=db.ppe.find(z=>z.id===id);slipLines(s).forEach(l=>{if(!l.signed){l.signed=true;l.signedAt=todayStr()}})})){refreshTbl();ACT['ps-view']({dataset:{id}});toast('Đã ghi ký nhận cho tất cả')}};
ACT['ps-xlsx']=()=>{const rows=slipRows(location.hash.includes('/ppe/ret')?'ret':'slip');if(!rows.length)return toast('Không có phiếu để xuất.','warn');
  const out=[['Mã phiếu','Job number','Ngày cấp','Dự án','Phòng ban','Mã NV','Họ tên','Phòng ban NV','Nhóm','Vật tư','Size','Số lượng','ĐVT','Ký nhận','Ngày ký','Ghi chú']];
  rows.forEach(({s})=>slipLines(s).forEach(l=>Object.entries(l.q).forEach(([id,v])=>{if(!(+v.n>0))return;const it=pItem(id)||{};out.push([s.no,s.job||'',fmtDate(s.date),projName(s.proj),s.dept||'',l.code||'',l.name,l.dept||'',PTYPE[it.type||'ppe'].grp,it.name||'',v.sz||'',+v.n,it.unit||'',l.signed?'Đã ký':'Chờ ký',fmtDate(l.signedAt)||'',s.note||''])})));
  xlsxSave(out,'cap-phat-ppe-dong-phuc','Cap phat')};

/* ---------- in phiếu theo mẫu giấy ---------- */
function slipPrintHTML(s){const ids=[...new Set(slipLines(s).flatMap(l=>Object.keys(l.q)))],its=pItems('',true).filter(i=>ids.includes(i.id)),ls=slipLines(s),pad=Math.max(0,10-ls.length),c=db.company||{},p=pProj(s.proj);
  const hasSz=it=>splitSz(it.sizes).length||ls.some(l=>(l.q[it.id]||{}).sz);
  const cells=l=>its.map(it=>{const v=l&&l.q[it.id];return `<td class="c">${v&&+v.n?fmtNum(+v.n):''}</td>${hasSz(it)?`<td class="c">${v?esc(v.sz||''):''}</td>`:''}`}).join('');
  const tot=it=>ls.reduce((a,l)=>a+(+(l.q[it.id]||{}).n||0),0);
  return `<div class="slip book iso"><div class="sh"><img class="iso-l" src="assets/iso/logo-left.png" alt="Logo"><div style="text-align:center;font-size:11px">Số phiếu: <b>${esc(s.no)}</b> · Ngày in: ${fmtDate(todayStr())}</div><img class="iso-r" src="assets/iso/logo-right.png" alt="Chứng nhận ISO"></div>
    <h2>${s.kind==='ret'?'PHIẾU THU HỒI PPE / ĐỒNG PHỤC':esc(PTYPE[slipGrp(s)].book)}</h2><div class="sub">Phiếu ${s.kind==='ret'?'thu hồi':'cấp phát'} ${PTYPE[slipGrp(s)].sub}${s.kind==='ret'&&s.reason?' · lý do: '+esc((RET_REASON.find(x=>x[0]===s.reason)||[])[1]||''):''}</div>
    <div class="mt"><div>Project/Department: <b>${esc([projName(s.proj),s.dept].filter(Boolean).join(' ; '))}</b></div><div>PIC: <b>${esc(p?.pic||'')}</b></div><div>Job number: <b>${esc(s.job||'')}</b></div><div>Ngày cấp: <b>${fmtDate(s.date)}</b></div></div>
    <table><thead><tr><th rowspan="2" style="width:34px">No</th><th rowspan="2">Receiver Name</th><th rowspan="2">Staff code</th>${its.map(it=>`<th ${hasSz(it)?'colspan="2"':'rowspan="2"'}>${esc(it.en||it.name)}${it.en&&it.en!==it.name?`<br><i>${esc(it.name)}</i>`:''}</th>`).join('')}<th rowspan="2">Date</th><th rowspan="2" style="width:120px">Sign</th></tr><tr>${its.filter(hasSz).map(()=>'<th>SL</th><th>Size</th>').join('')}</tr></thead><tbody>
    ${ls.map((l,n)=>`<tr><td class="c">${n+1}</td><td>${esc(l.name)}</td><td>${esc(l.code||'')}</td>${cells(l)}<td style="white-space:nowrap">${fmtDate(l.signedAt||s.date)}</td><td></td></tr>`).join('')}
    ${Array.from({length:pad},(_,n)=>`<tr><td class="c">${ls.length+n+1}</td><td></td><td></td>${cells(null)}<td></td><td></td></tr>`).join('')}
    <tr class="rgtot"><td colspan="3"><b>Tổng</b></td>${its.map(it=>`<td class="c"><b>${fmtNum(tot(it))}</b></td>${hasSz(it)?'<td></td>':''}`).join('')}<td></td><td></td></tr></tbody></table>
    ${s.note?`<p class="sn">Ghi chú: ${esc(s.note)}</p>`:''}
    <p class="iso-note"><b><i>${esc(ISO_NOTE_EN)}</i></b><br><i>${esc(ISO_NOTE_VI)}</i></p>
    <div class="iso-ft"><span>${esc(ISO_CODE)}</span><span>Page: 1 / 1</span></div></div>`}
ACT['ps-print']=el=>{const s=findSlip(el.dataset.id);if(s){closeModal();printHTML(slipPrintHTML(s))}};

/* ---------- Danh mục: nhân viên, dự án & phòng ban, vật tư ---------- */
PAGES['ppe/cat']={t:'Danh mục PPE & đồng phục',
  sub(){return 'Dữ liệu dùng chung để nhập phiếu nhanh và đồng nhất'},
  head(){const f=F(),tab=f.tab||'emp',tb=(k,l)=>`<button class="btn ${tab===k?'primary':''}" data-act="pc-tab" data-k="${k}">${l}</button>`;
    return `<div class="bar">${tb('emp',`👷 Nhân viên (${pDocs('pemp').length})`)}${tb('org',`🏗 Dự án & phòng ban (${pProjs().length}/${pDepts().length})`)}${tb('item',`🦺 Vật tư PPE & đồng phục (${pItems().length})`)}</div>`+
      (tab==='emp'?`<div class="bar">${fSearch('Tìm tên, mã NV…')}<label class="fl">Dự án ${fSel('proj','Dự án',projOptsP('Tất cả'))}</label><label class="fl">Phòng ban ${fSel('dept','Phòng ban',deptOptsP('Tất cả'))}</label><div class="sp"></div>${can('manage')&&pDocs('pemp').length?`<button class="btn danger" data-act="pe-delall" title="Xoá toàn bộ danh sách nhân viên để nhập lại (phiếu đã lập vẫn giữ tên, mã NV)">🗑 Xoá tất cả nhân viên</button>`:''}<button class="btn" data-act="pe-fromapp" title="Thêm các nhân viên đang có trong app (mã, tên, phòng ban)">⇩ Lấy từ danh sách NV của app</button><label class="btn" title="File Excel có các cột: Mã NV, Họ tên, Phòng ban, Dự án, Size áo, Size quần, Size giày, Size găng tay">⬆ Nhập Excel<input type="file" id="pe-file" accept=".xlsx,.xls,.csv" hidden></label><button class="btn primary" data-act="pe-edit">＋ Thêm nhân viên</button></div>`:'')},
  tbl(){const f=F(),tab=f.tab||'emp';
    if(tab==='org')return `<div class="grid g2">${card(`Dự án <button class="btn sm primary" data-act="pp-edit" style="float:right">＋ Thêm dự án</button>`,miniTable(['Mã','Tên dự án','PIC','Trạng thái','Nhân viên','Phiếu',''],pProjs().map(p=>`<tr><td><b>${esc(p.code||'')}</b></td><td>${esc(p.name||'')}</td><td>${esc(p.pic||'')}</td><td>${p.status==='done'?badge('mute','Đã xong'):badge('ok','Đang chạy')}</td><td class="num">${pEmps().filter(e=>e.proj===p.id).length}</td><td class="num">${pSlips().filter(s=>s.proj===p.id).length}</td><td class="act"><button class="btn sm" data-act="pp-edit" data-id="${p.id}">Sửa</button></td></tr>`),'Chưa có dự án. Bấm “＋ Thêm dự án”.'))}
      ${card(`Phòng ban <button class="btn sm primary" data-act="pdp-add" style="float:right">＋ Thêm phòng ban</button>`,miniTable(['Phòng ban','Nhân viên','Phiếu',''],pDepts().map(d=>{const doc=pDocs('dept').find(x=>x.name===d);return `<tr><td><b>${esc(d)}</b></td><td class="num">${pEmps().filter(e=>e.dept===d).length}</td><td class="num">${pSlips().filter(s=>s.dept===d).length}</td><td class="act">${doc?`<button class="btn sm" data-act="pdp-del" data-id="${doc.id}">Xoá</button>`:'<small class="muted">từ hồ sơ NV</small>'}</td></tr>`}),'Chưa có phòng ban.'))}</div>`;
    const ST=pStock();
    if(tab==='item')return `<div>${['ppe','uni'].map(t=>card(`${PTYPE[t].icon} ${t==='ppe'?'Vật tư PPE':'Đồng phục'} <button class="btn sm primary" data-act="pi-edit" data-type="${t}" style="float:right">＋ Thêm</button>`,miniTable(['Tên','ĐVT','Size','Lấy size theo','Nhập','Đã cấp','Tồn',''],pItems(t).map(i=>{const k=stockTxt(ST,i.id);return `<tr><td><b>${esc(i.name)}</b>${i.en?`<br><small class="muted">${esc(i.en)}</small>`:''}</td><td>${esc(i.unit||'')}</td><td class="nt"><small>${esc(i.sizes||'—')}</small></td><td><small>${esc(SZK[i.szKey]||'—')}</small></td><td class="num">${fmtNum(k.inn)}</td><td class="num">${fmtNum(k.out)}</td><td><b class="${k.t<0?'tag-bad':''}">${fmtNum(k.t)}</b>${k.sz?`<div class="pszs">${k.sz}</div>`:''}</td><td class="act"><button class="btn sm" data-act="pi-edit" data-id="${i.id}">Sửa</button></td></tr>`}))+'<p class="note">Nhập = tổng các phiếu nhập kho; Tồn = Nhập − Đã cấp (theo size). “Lấy size theo”: khi thêm người vào phiếu, size tự điền theo hồ sơ nhân viên (ví dụ Giày bảo hộ lấy Size giày).</p>')).join('')}</div>`;
    const q=norm(f.q),rows=pEmps().filter(e=>(!f.proj||e.proj===f.proj)&&(!f.dept||e.dept===f.dept)&&(!q||norm(`${e.code} ${e.name}`).includes(q)));
    return table([
      {h:'Mã NV',f:e=>`<b style="white-space:nowrap">${esc(e.code||'')}</b>`,x:e=>e.code||''},
      {h:'Họ tên',f:e=>`${esc(e.name)}${e.active===false?' '+badge('mute','Nghỉ'):''}`,x:e=>e.name},
      {h:'Phòng ban',f:e=>esc(e.dept||''),x:e=>e.dept||''},
      {h:'Dự án',f:e=>esc(projName(e.proj)||''),x:e=>projName(e.proj)},
      ...Object.entries(SZK).map(([k,l])=>({h:l,c:'c',f:e=>esc(e['sz_'+k]||'–'),x:e=>e['sz_'+k]||''})),
      {h:'Lần cấp gần nhất',f:e=>{const s=pSlips().filter(s=>(s.lines||[]).some(l=>l.pid===e.id)).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];return s?`<small>${fmtDate(s.date)} · ${esc(s.no)}</small>`:'<small class="muted">–</small>'},x:e=>''},
      actCol(e=>`<button class="btn sm" data-act="pe-edit" data-id="${e.id}">Sửa</button>`)
    ],rows,{empty:'Chưa có nhân viên nào. Bấm “＋ Thêm nhân viên”, “Nhập Excel” hoặc “Lấy từ danh sách NV của app”.'})}};
ACT['pc-tab']=el=>{F().tab=el.dataset.k;rerender()};
ACT['pe-edit']=el=>{if(!canPPE())return;const e=el.dataset.id?pEmp(el.dataset.id):{code:'',name:'',dept:F().dept||'',proj:F().proj||'',active:true};
  const szF=k=>{const opts=splitSz(k==='shoe'?SZ_SHOE:k==='glove'?SZ_GLOVE:SZ_CLOTH);return sel('sz_'+k,SZK[k],[['','–'],...opts.map(x=>[x,x])],e['sz_'+k]||'')};
  modal(el.dataset.id?'Sửa nhân viên':'Thêm nhân viên',`<form id="mf" data-submit="pe-save" data-id="${el.dataset.id||''}"><div class="fg">${inp('code','Mã nhân viên',e.code,{ph:'VD: S22640'})}${inp('name','Họ tên',e.name,{req:1})}
    <label class="f"><span>Phòng ban</span><input class="in" name="dept" value="${esc(e.dept||'')}" list="dl-pe-dept"><datalist id="dl-pe-dept">${pDepts().map(d=>`<option value="${esc(d)}">`).join('')}</datalist></label>
    ${sel('proj','Dự án',projOptsP('— Không —'),e.proj||'')}${Object.keys(SZK).map(szF).join('')}
    <label class="f"><span>Trạng thái</span><label class="chk"><input type="checkbox" name="active" ${e.active!==false?'checked':''}> Đang làm việc</label></label></div></form>`,
    {footer:(el.dataset.id&&!pSlips().some(s=>(s.lines||[]).some(l=>l.pid===e.id))?`<button class="btn danger" data-act="pe-del" data-id="${e.id}" style="margin-right:auto">Xoá</button>`:'')+cancelBtn+`<button class="btn primary" form="mf">Lưu</button>`})};
SUB['pe-save']=form=>{if(!canPPE())return;const d=fd(form),id=form.dataset.id,code=String(d.code||'').trim();
  if(code&&pDocs('pemp').some(e=>e.id!==id&&norm(e.code)===norm(code)))return toast('Mã nhân viên này đã có trong danh mục.','error');
  const v={code,name:String(d.name||'').trim(),dept:String(d.dept||'').trim(),proj:d.proj||'',active:!!d.active,...Object.fromEntries(Object.keys(SZK).map(k=>['sz_'+k,d['sz_'+k]||'']))};
  if(ppeSave(()=>{const x=id&&db.ppe.find(z=>z.id===id);if(x)Object.assign(x,v);else db.ppe.push({id:uid('pe'),kind:'pemp',...v})}))done(id?'Đã lưu':'Đã thêm nhân viên')};
ACT['pe-del']=el=>{if(!canPPE()||!confirm('Xoá nhân viên này khỏi danh mục?'))return;if(ppeSave(()=>{db.ppe=db.ppe.filter(z=>z.id!==el.dataset.id)}))done('Đã xoá')};
/* xoá toàn bộ danh mục nhân viên để upload lại; phiếu cấp phát đã lập vẫn giữ họ tên, mã NV của từng dòng */
ACT['pe-delall']=()=>{if(!canPPE())return;if(!can('manage'))return toast('Chỉ Admin / Quản lý được xoá toàn bộ danh sách.','error');const n=pDocs('pemp').length;if(!n)return;
  const v=prompt(`Xoá toàn bộ ${n} nhân viên trong danh mục PPE?\nCác phiếu cấp phát đã lập vẫn giữ nguyên tên và mã NV.\n\nGõ XOA để xác nhận:`);if(v===null)return;
  if(String(v).trim().toUpperCase()!=='XOA')return toast('Chưa xoá: cần gõ đúng chữ XOA.','warn');
  if(ppeSave(()=>{db.ppe=db.ppe.filter(z=>z.kind!=='pemp')})){rerender();toast(`Đã xoá ${n} nhân viên. Bấm “Nhập Excel” để tải lại danh sách.`)}};
ACT['pe-fromapp']=()=>{if(!canPPE())return;const have=new Set(pDocs('pemp').map(e=>norm(e.code||e.name)));const add=(db.employees||[]).filter(e=>e.active!==false&&!have.has(norm(e.code||e.name)));
  if(!add.length)return toast('Danh mục đã có đủ nhân viên của app.','warn');
  if(ppeSave(()=>add.forEach(e=>db.ppe.push({id:uid('pe'),kind:'pemp',code:e.code||'',name:e.name,dept:e.dept||'',proj:'',active:true}))))done(`Đã thêm ${add.length} nhân viên`)};
/* nhập Excel: dòng tiêu đề có các cột Mã NV, Họ tên, Phòng ban, Dự án, Size áo, Size quần, Size giày, Size găng tay (thứ tự tuỳ ý) */
document.addEventListener('change',async ev=>{const el=ev.target;if(el.id!=='pe-file'||!el.files||!el.files[0])return;if(!canPPE())return;
  if(!window.XLSX){toast('Chưa tải được thư viện Excel.','error');return}
  try{const wb=XLSX.read(await el.files[0].arrayBuffer()),ws=wb.Sheets[wb.SheetNames[0]],aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    const hi=aoa.findIndex(r=>r.some(c=>/h[oọ].*t[eê]n|name/i.test(String(c))));if(hi<0)throw new Error('Không thấy dòng tiêu đề có cột “Họ tên”.');
    const H=aoa[hi].map(c=>norm(String(c))),col=(...re)=>H.findIndex(h=>re.some(r=>r.test(h)));
    const C={code:col(/^ma/,/code/,/msnv/),name:col(/ho.*ten/,/name/),dept:col(/phong/,/dept/,/bo phan/),proj:col(/du an/,/project/),shirt:col(/ao/,/shirt/),pant:col(/quan/,/pant/),shoe:col(/giay/,/shoe/),glove:col(/gang/,/glove/)};
    const projBy=v=>{v=norm(v);if(!v)return '';const p=pDocs('proj').find(p=>norm(p.code)===v||norm(p.name)===v);return p?p.id:null};
    let add=0,upd=0,newProj=[];
    const ok=ppeSave(()=>{aoa.slice(hi+1).forEach(r=>{const g=k=>C[k]>=0?String(r[C[k]]??'').trim():'',name=g('name');if(!name)return;
      let pj=projBy(g('proj'));if(pj===null){const id=uid('pj');db.ppe.push({id,kind:'proj',code:g('proj'),name:g('proj'),pic:'',status:'run'});pj=id;newProj.push(g('proj'))}
      const v={code:g('code'),name,dept:g('dept'),proj:pj,active:true};['shirt','pant','shoe','glove'].forEach(k=>{if(g(k))v['sz_'+k]=g(k)});
      const x=db.ppe.find(z=>z.kind==='pemp'&&(v.code?norm(z.code)===norm(v.code):norm(z.name)===norm(name)));
      if(x){Object.keys(v).forEach(k=>{if(v[k]!==''&&v[k]!=null)x[k]=v[k]});upd++}else{db.ppe.push({id:uid('pe'),kind:'pemp',...v});add++}})});
    if(ok){ppeSave(()=>{const by=new Map(pDocs('pemp').filter(e=>e.code).map(e=>[norm(e.code),e.id]));pDocs('slip').forEach(sl=>(sl.lines||[]).forEach(l=>{if(l.code&&(!l.pid||!pEmp(l.pid))){const id=by.get(norm(l.code));if(id)l.pid=id}}))});   /* gắn lại phiếu cũ với nhân viên vừa nhập (theo mã NV) */
      rerender();toast(`Đã nhập: thêm ${add}, cập nhật ${upd} nhân viên${newProj.length?` · tạo ${newProj.length} dự án mới`:''}`)}}
  catch(e){toast('Không đọc được file: '+e.message,'error')}finally{el.value=''}});
ACT['pp-edit']=el=>{if(!canPPE())return;const p=el.dataset.id?pProj(el.dataset.id):{code:'',name:'',pic:'',status:'run'};
  modal(el.dataset.id?'Sửa dự án':'Thêm dự án',`<form id="mf" data-submit="pp-save" data-id="${el.dataset.id||''}"><div class="fg">${inp('code','Mã dự án',p.code,{req:1,ph:'VD: VINCI'})}${inp('name','Tên dự án',p.name,{})}${inp('pic','PIC (người phụ trách)',p.pic||'',{ph:'VD: Mr Sĩ Tường'})}${sel('status','Trạng thái',[['run','Đang chạy'],['done','Đã xong']],p.status||'run')}</div></form>`,
    {footer:(el.dataset.id&&!pSlips().some(s=>s.proj===p.id)&&!pEmps().some(e=>e.proj===p.id)?`<button class="btn danger" data-act="pp-del" data-id="${p.id}" style="margin-right:auto">Xoá</button>`:'')+cancelBtn+`<button class="btn primary" form="mf">Lưu</button>`})};
SUB['pp-save']=form=>{if(!canPPE())return;const d=fd(form),id=form.dataset.id,code=String(d.code||'').trim();
  if(pDocs('proj').some(p=>p.id!==id&&norm(p.code)===norm(code)))return toast('Mã dự án này đã có.','error');
  if(ppeSave(()=>{const v={code,name:String(d.name||'').trim(),pic:String(d.pic||'').trim(),status:d.status};const x=id&&db.ppe.find(z=>z.id===id);if(x)Object.assign(x,v);else db.ppe.push({id:uid('pj'),kind:'proj',...v})}))done('Đã lưu dự án')};
ACT['pp-del']=el=>{if(!canPPE()||!confirm('Xoá dự án này?'))return;if(ppeSave(()=>{db.ppe=db.ppe.filter(z=>z.id!==el.dataset.id)}))done('Đã xoá dự án')};
ACT['pdp-add']=()=>{if(!canPPE())return;modal('Thêm phòng ban',`<form id="mf" data-submit="pdp-save"><div class="fg">${inp('name','Tên phòng ban','',{req:1,full:1})}</div></form>`,{footer:cancelBtn+`<button class="btn primary" form="mf">Lưu</button>`})};
SUB['pdp-save']=form=>{const n=String(fd(form).name||'').trim();if(!n)return toast('Nhập tên phòng ban.','error');if(pDepts().some(d=>norm(d)===norm(n)))return toast('Phòng ban này đã có.','error');if(ppeSave(()=>db.ppe.push({id:uid('pd'),kind:'dept',name:n})))done('Đã thêm phòng ban')};
ACT['pdp-del']=el=>{if(!canPPE()||!confirm('Xoá phòng ban này khỏi danh sách?'))return;if(ppeSave(()=>{db.ppe=db.ppe.filter(z=>z.id!==el.dataset.id)}))done('Đã xoá')};
ACT['pi-edit']=el=>{if(!canPPE())return;const i=el.dataset.id?pItem(el.dataset.id):{type:el.dataset.type||'ppe',name:'',en:'',unit:'Cái',sizes:'',szKey:''};
  modal(el.dataset.id?'Sửa vật tư':'Thêm vật tư',`<form id="mf" data-submit="pi-save" data-id="${el.dataset.id||''}"><div class="fg">${sel('type','Nhóm',[['ppe','PPE bảo hộ'],['uni','Đồng phục']],i.type)}${inp('name','Tên vật tư',i.name,{req:1})}${inp('en','Tên in trên phiếu',i.en||'',{ph:'VD: Helmet'})}${inp('unit','Đơn vị tính',i.unit,{req:1,attrs:'list="dl-pi-unit"'})}<datalist id="dl-pi-unit">${['Cái','Đôi','Bộ','Hộp','Cuộn'].map(u=>`<option value="${u}">`).join('')}</datalist>
    ${inp('sizes','Các size (cách nhau dấu phẩy, để trống nếu không có size)',i.sizes||'',{full:1,ph:'VD: S, M, L, XL, 2XL, 3XL'})}${sel('szKey','Tự điền size theo hồ sơ NV',[['','— Không —'],...Object.entries(SZK)],i.szKey||'')}</div></form>`,
    {footer:(el.dataset.id&&!pSlips().some(s=>(s.lines||[]).some(l=>l.q&&l.q[i.id]))?`<button class="btn danger" data-act="pi-del" data-id="${i.id}" style="margin-right:auto">Xoá</button>`:'')+cancelBtn+`<button class="btn primary" form="mf">Lưu</button>`})};
SUB['pi-save']=form=>{if(!canPPE())return;const d=fd(form),id=form.dataset.id;
  const v={type:d.type==='uni'?'uni':'ppe',name:d.name.trim(),en:String(d.en||'').trim(),unit:d.unit.trim(),sizes:splitSz(d.sizes).join(', '),szKey:d.szKey||''};
  if(ppeSave(()=>{const x=id&&db.ppe.find(z=>z.id===id);if(x)Object.assign(x,v);else if(id)db.ppe.push({id,kind:'item',ord:pItem(id)?.ord||99,...v});else db.ppe.push({id:uid('pi'),kind:'item',ord:99,...v})}))done('Đã lưu vật tư')};
ACT['pi-del']=el=>{if(!canPPE()||!confirm('Xoá vật tư này khỏi danh mục?'))return;const id=el.dataset.id;
  if(ppeSave(()=>{const x=db.ppe.find(z=>z.id===id);if(PITEM_DEF.some(d=>d.id===id)){if(x)x.deleted=true;else db.ppe.push({id,kind:'item',deleted:true})}else db.ppe=db.ppe.filter(z=>z.id!==id)}))done('Đã xoá vật tư')};

/* ---------- Báo cáo ---------- */
PAGES['ppe/rpt']={t:'Báo cáo cấp phát PPE & đồng phục',
  sub(){const f=F();return [f.type?PTYPE[f.type].grp:'PPE và đồng phục',f.proj?projName(f.proj):'',f.from||f.to?`${fmtDate(f.from)||'…'} – ${fmtDate(f.to)||'…'}`:''].filter(Boolean).join(' · ')},
  head(){return `<div class="bar"><label class="fl">Nhóm ${fSel('type','Nhóm',[['','Tất cả'],['ppe','PPE'],['uni','Đồng phục']])}</label><label class="fl">Dự án ${fSel('proj','Dự án',projOptsP('Tất cả'))}</label><label class="fl">Phòng ban ${fSel('dept','Phòng ban',deptOptsP('Tất cả'))}</label>${fDate('from','Từ ngày')}${fDate('to','Đến ngày')}<div class="sp"></div>${rptBtns('bao-cao-ppe')}</div>`},
  tbl(){const f=F(),ss=pSlips().filter(s=>grpHas(s,f.type)&&(!f.proj||s.proj===f.proj)&&(!f.dept||s.dept===f.dept)&&(!f.from||s.date>=f.from)&&(!f.to||s.date<=f.to));
    const m=new Map();ss.forEach(s=>slipLines(s).forEach(l=>Object.entries(l.q).forEach(([id,v])=>{if(!(+v.n>0)||(f.type&&(pItem(id)?.type||'ppe')!==f.type))return;const k=id+'|'+(v.sz||'');if(!m.has(k))m.set(k,{id,sz:v.sz||'',n:0,ppl:new Set(),slips:new Set(),sig:0});const o=m.get(k);o.n+=+v.n;o.ppl.add(l.pid||l.name);o.slips.add(s.id);if(l.signed)o.sig+=+v.n})));
    const ord=pItems('',true).map(i=>i.id),rows=[...m.values()].sort((a,b)=>ord.indexOf(a.id)-ord.indexOf(b.id)||String(a.sz).localeCompare(String(b.sz),'vi',{numeric:true}));
    const byP=new Map();ss.forEach(s=>{const k=s.proj||('d:'+s.dept);if(!byP.has(k))byP.set(k,{lbl:projName(s.proj)||s.dept||'–',slips:0,ppl:new Set(),n:0,wait:0});const o=byP.get(k);o.slips++;slipLines(s).forEach(l=>{o.ppl.add(l.pid||l.name);o.n+=lineQty(l);if(!l.signed)o.wait++})});
    const tot=rows.reduce((a,o)=>a+o.n,0);
    return `<div class="kpis sm">${kpi('Phiếu cấp phát',fmtNum(ss.length),'trong bộ lọc','acc')}${kpi('Lượt người nhận',fmtNum(ss.reduce((a,s)=>a+slipLines(s).length,0)),'','info')}${kpi('Tổng số món',fmtNum(tot),'','ok')}${kpi('Chờ ký nhận',fmtNum(ss.reduce((a,s)=>a+slipLines(s).filter(l=>!l.signed).length,0)),'lượt người',ss.some(s=>slipSt(s)!=='ok')?'warn':'ok')}</div>`
      +card('Theo vật tư và size',table([
        {h:'Vật tư',f:o=>`<b>${esc(pItem(o.id)?.name||'?')}</b> <small class="muted">${esc(PTYPE[pItem(o.id)?.type||'ppe'].grp)}</small>`,x:o=>pItem(o.id)?.name||''},
        {h:'Size',f:o=>esc(o.sz||'–'),x:o=>o.sz},{h:'ĐVT',f:o=>esc(pItem(o.id)?.unit||''),x:o=>pItem(o.id)?.unit||''},
        {h:'Số lượng cấp',c:'num',f:o=>`<b>${fmtNum(o.n)}</b>`,x:o=>o.n},{h:'Đã ký nhận',c:'num',f:o=>fmtNum(o.sig),x:o=>o.sig},{h:'Số người',c:'num',f:o=>fmtNum(o.ppl.size),x:o=>o.ppl.size},{h:'Số phiếu',c:'num',f:o=>fmtNum(o.slips.size),x:o=>o.slips.size}
      ],rows,{empty:'Chưa có số liệu cấp phát trong bộ lọc.'}))
      +card('Theo dự án / phòng ban',miniTable(['Dự án / phòng ban','Số phiếu','Số người','Số món','Chờ ký'],[...byP.values()].sort((a,b)=>b.n-a.n).map(o=>`<tr><td><b>${esc(o.lbl)}</b></td><td class="num">${o.slips}</td><td class="num">${o.ppl.size}</td><td class="num">${fmtNum(o.n)}</td><td class="num">${o.wait?`<span class="tag-warn">${o.wait}</span>`:'0'}</td></tr>`),'Chưa có số liệu.'))}};

/* ---------- Nhập PPE & đồng phục: Request mua → PU giao hàng (chi tiết sản phẩm) → cộng vào tồn ---------- */
let RDRAFT=null;
const pRcvs=()=>pDocs('rcv');
const rcvQty=r=>(r.lines||[]).reduce((a,l)=>a+(+l.n||0),0);
const rcvTxt=r=>(r.lines||[]).filter(l=>+l.n>0).map(l=>`${pItem(l.item)?.name||'?'}${l.sz?' '+l.sz:''} × ${l.n}`).join(', ');
const rcvLead=r=>r.reqDate&&r.puDate?dayNum(r.puDate)-dayNum(r.reqDate):null;
const itemOpts=v=>['ppe','uni'].map(t=>`<optgroup label="${PTYPE[t].grp}">${pItems(t).map(i=>`<option value="${i.id}" ${i.id===v?'selected':''}>${esc(i.name)}</option>`).join('')}</optgroup>`).join('');
function rcvLineHTML(l,i){const it=pItem(l.item)||{},ss=splitSz(it.sizes);
  return `<tr><td class="c">${i+1}</td><td><select class="in" data-rq="${i}|item" aria-label="Vật tư dòng ${i+1}">${itemOpts(l.item)}</select></td><td>${esc(it.unit||'')}</td>
    <td>${ss.length?`<select class="in" data-rq="${i}|sz" aria-label="Size dòng ${i+1}"><option value="">–</option>${ss.map(x=>`<option ${x===l.sz?'selected':''}>${esc(x)}</option>`).join('')}</select>`:'<span class="muted">–</span>'}</td>
    <td><input class="in" type="number" min="0" max="99999" data-rq="${i}|n" value="${l.n?esc(l.n):''}" aria-label="Số lượng dòng ${i+1}"></td>
    <td><input class="in" data-rq="${i}|detail" value="${esc(l.detail||'')}" placeholder="Hãng, model, màu, tiêu chuẩn…" aria-label="Chi tiết sản phẩm dòng ${i+1}"></td>
    <td class="c"><button type="button" class="btn sm" data-act="rd-del" data-i="${i}" aria-label="Xoá dòng ${i+1}">🗑</button></td></tr>`}
function rdraftHTML(){const d=RDRAFT;
  return `<section class="card pform"><h4><span class="pic">📦</span> Thông tin nhập ${d.id?`<small class="muted">· sửa phiếu ${esc(d.no)}</small>`:''}</h4>
    <div class="pgrid">
      <label class="f"><span>Ngày request mua</span><input class="in" type="date" data-rd="reqDate" value="${esc(d.reqDate||'')}"></label>
      <label class="f"><span>Ngày PU giao hàng <i>*</i></span><input class="in" type="date" data-rd="puDate" value="${esc(d.puDate||'')}"></label>
      <label class="f"><span>Số PR / PO</span><input class="in" data-rd="pr" value="${esc(d.pr||'')}" placeholder="VD: PR-2026-015"></label>
      <label class="f"><span>Số phiếu</span><input class="in" readonly value="${esc(d.no||'Tự động sinh')}"></label>
      <label class="f w4"><span>Ghi chú</span><input class="in" data-rd="note" value="${esc(d.note||'')}" placeholder="Nhà cung cấp, dự án đặt hàng…"></label></div>
    <div class="psub"><b>Chi tiết sản phẩm PU giao</b></div>
    <div class="tw"><table class="t pgt"><thead><tr><th>STT</th><th>Vật tư</th><th>ĐVT</th><th>Size</th><th>SL nhập</th><th>Chi tiết sản phẩm</th><th></th></tr></thead><tbody>${d.lines.map(rcvLineHTML).join('')}</tbody></table></div>
    <div class="rgbtn"><button type="button" class="btn sm" data-act="rd-add">＋ Thêm dòng</button><span class="note">Mỗi size một dòng. SL nhập được cộng vào tồn của vật tư ở Danh mục.</span></div>
    <div class="pfoot"><span class="muted">${fmtNum(d.lines.reduce((a,l)=>a+(+l.n||0),0))} món</span><div class="sp"></div><button type="button" class="btn" data-act="rd-cancel">Hủy</button><button type="button" class="btn primary" data-act="rd-save">Lưu phiếu nhập</button></div></section>`}
const redrawR=()=>{const el=$('#rform');if(el&&RDRAFT)el.innerHTML=rdraftHTML()};
document.addEventListener('input',ev=>{const el=ev.target;if(!RDRAFT||!el.closest||!el.closest('#rform'))return;
  if(el.dataset.rd){RDRAFT[el.dataset.rd]=el.value;return}
  if(el.dataset.rq){const [i,k]=el.dataset.rq.split('|'),l=RDRAFT.lines[+i];if(!l)return;l[k]=k==='n'?Math.max(0,+el.value||0):el.value;if(k==='item'){l.sz='';redrawR()}}});
ACT['rd-new']=()=>{if(!canPPE())return;RDRAFT={no:'',reqDate:'',puDate:todayStr(),pr:'',note:'',lines:[{item:'pi_helm',sz:'',n:0,detail:''},{item:'pi_shoe',sz:'',n:0,detail:''},{item:'pi_uni',sz:'',n:0,detail:''}]};rerender()};
ACT['rd-add']=()=>{const last=RDRAFT.lines[RDRAFT.lines.length-1];RDRAFT.lines.push({item:last?last.item:'pi_helm',sz:'',n:0,detail:last?last.detail:''});redrawR()};
ACT['rd-del']=el=>{RDRAFT.lines.splice(+el.dataset.i,1);redrawR()};
ACT['rd-cancel']=()=>{RDRAFT=null;rerender()};
ACT['rd-save']=()=>{if(!canPPE())return;const d=RDRAFT;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.puDate||''))return toast('Nhập ngày PU giao hàng.','error');
  if(d.reqDate&&d.reqDate>d.puDate)return toast('Ngày PU giao không được trước ngày request mua.','error');
  const lines=d.lines.filter(l=>l.item&&+l.n>0).map(l=>({item:l.item,sz:splitSz(pItem(l.item)?.sizes).length?l.sz||'':'',n:+l.n,detail:String(l.detail||'').trim()}));
  if(!lines.length)return toast('Nhập số lượng cho ít nhất một dòng.','error');
  const miss=lines.find(l=>splitSz(pItem(l.item)?.sizes).length&&!l.sz);if(miss)return toast(`Chọn size cho ${pItem(miss.item)?.name}.`,'error');
  const v={reqDate:d.reqDate||'',puDate:d.puDate,pr:String(d.pr||'').trim(),note:String(d.note||'').trim(),lines};let no=d.no;
  const rid=d.id||uid('rc'),typ=slipType([...new Set(lines.map(l=>l.item))]),qty=lines.reduce((a,l)=>a+l.n,0);let auto=false;
  if(ppeSave(()=>{if(d.id){const x=db.ppe.find(z=>z.id===d.id);if(!x)throw new Error('Phiếu này không còn tồn tại.');Object.assign(x,v)}else{no=nextNo('NK',d.puDate);db.ppe.push({id:rid,kind:'rcv',no,...v,by:session?.name||'',at:new Date().toISOString()})}
    auto=kpiAuto(rid,{ym:d.puDate,title:`Nhập ${grpWord(typ)} ${no} – ${qty} món${v.pr?' ('+v.pr+')':''}`,done:d.puDate,deadline:d.puDate,match:'ppe',note:`Tự ghi từ phiếu nhập ${no} (Quản lý PPE & Đồng phục)`})})){RDRAFT=null;rerender();toast(`Đã lưu phiếu nhập ${no}`)}};
ACT['rc-edit']=el=>{const r=pRcvs().find(x=>x.id===el.dataset.id);if(!r||!canPPE())return;closeModal();RDRAFT=JSON.parse(JSON.stringify(r));rerender();setTimeout(()=>$('#rform')?.scrollIntoView({behavior:'smooth',block:'start'}),60)};
ACT['rc-del']=el=>{const r=pRcvs().find(x=>x.id===el.dataset.id);if(!r||!canPPE()||!confirm(`Xoá phiếu nhập ${r.no}? Tồn kho sẽ giảm tương ứng.`))return;if(ppeSave(()=>{db.ppe=db.ppe.filter(z=>z.id!==r.id);kpiAutoDel(r.id)})){closeModal();refreshTbl();toast('Đã xoá phiếu nhập')}};
ACT['rc-view']=el=>{const r=pRcvs().find(x=>x.id===el.dataset.id);if(!r)return;const L=rcvLead(r);
  modal(`Phiếu nhập ${r.no}`,`<div class="pinfo">${[['Số phiếu',r.no],['Số PR / PO',r.pr||'–'],['Ngày request mua',fmtDate(r.reqDate)||'–'],['Ngày PU giao hàng',fmtDate(r.puDate)+(L!=null?` (sau ${L} ngày)`:'')],['Người nhập',r.by||'']].map(([k,v])=>`<div><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div>${r.note?`<p class="note">${esc(r.note)}</p>`:''}
    ${miniTable(['STT','Vật tư','Size','SL nhập','ĐVT','Chi tiết sản phẩm'],(r.lines||[]).map((l,i)=>{const it=pItem(l.item)||{};return `<tr><td class="c">${i+1}</td><td><b>${esc(it.name||'?')}</b></td><td>${esc(l.sz||'–')}</td><td class="num"><b>${fmtNum(+l.n)}</b></td><td>${esc(it.unit||'')}</td><td>${esc(l.detail||'')}</td></tr>`}))}`,
    {footer:`<button class="btn danger" data-act="rc-del" data-id="${r.id}" style="margin-right:auto">Xoá</button><button class="btn" data-act="rc-edit" data-id="${r.id}">✎ Sửa</button><button class="btn primary" data-act="close">Đóng</button>`,size:'wide kt'})};
function rcvRows(){const f=F(),q=norm(f.q);
  return pRcvs().filter(r=>(!f.from||r.puDate>=f.from)&&(!f.to||r.puDate<=f.to)&&(!f.grp||(r.lines||[]).some(l=>(pItem(l.item)?.type||'ppe')===f.grp))&&(!q||norm(`${r.no} ${r.pr} ${r.note} ${rcvTxt(r)} ${(r.lines||[]).map(l=>l.detail).join(' ')}`).includes(q)))
    .sort((a,b)=>String(b.puDate).localeCompare(String(a.puDate))||String(b.no).localeCompare(String(a.no))).map((r,i)=>({r,n:i+1}))}
PAGES['ppe/in']={t:'Nhập PPE & đồng phục',
  sub(){return 'Request mua → PU giao hàng → cộng vào tồn kho'},
  head(){return `<div class="phero"><span class="pic big">📦</span><div><h2>Nhập PPE &amp; đồng phục</h2><p>Ghi ngày request mua, ngày PU giao hàng và chi tiết sản phẩm; số lượng nhập cộng vào tồn của từng vật tư</p></div><div class="sp"></div><button class="btn primary" data-act="rd-new">＋ Tạo phiếu nhập</button><button class="btn" data-act="export" data-name="nhap-ppe">⬇ Xuất Excel</button></div>
      <div class="bar pfil">${fSearch('Tìm mã phiếu, số PR, vật tư, chi tiết sản phẩm…')}<label class="fl">Nhóm ${fSel('grp','Nhóm',[['','Tất cả'],['ppe','PPE'],['uni','Đồng phục']])}</label>${fDate('from','PU giao từ')}${fDate('to','đến')}<button class="btn" data-act="ps-reset" title="Bỏ các bộ lọc">⟲ Đặt lại</button></div>
      ${RDRAFT?`<div id="rform">${rdraftHTML()}</div>`:''}`},
  tbl(){const rows=rcvRows(),st=pStock(),stk=[...st.values()].filter(o=>o.inn||o.out),ord=pItems('',true).map(i=>i.id);
    stk.sort((a,b)=>ord.indexOf(a.id)-ord.indexOf(b.id)||splitSz(pItem(a.id)?.sizes).indexOf(a.sz)-splitSz(pItem(b.id)?.sizes).indexOf(b.sz));
    return `<section class="card plist"><h4><span class="pic">📦</span> Danh sách phiếu nhập <small class="muted">· tổng ${fmtNum(rows.length)} phiếu</small></h4>`+table([
      {h:'STT',c:'c',f:x=>x.n,x:x=>x.n},
      {h:'Mã phiếu',f:x=>`<a href="#/ppe/in" data-act="rc-view" data-id="${x.r.id}"><b style="white-space:nowrap">${esc(x.r.no)}</b></a>`,x:x=>x.r.no},
      {h:'Số PR / PO',f:x=>esc(x.r.pr||'–'),x:x=>x.r.pr||''},
      {h:'Ngày request mua',f:x=>`<span style="white-space:nowrap">${fmtDate(x.r.reqDate)||'–'}</span>`,x:x=>fmtDate(x.r.reqDate)},
      {h:'Ngày PU giao',f:x=>`<b style="white-space:nowrap">${fmtDate(x.r.puDate)}</b>${rcvLead(x.r)!=null?`<br><small class="muted">sau ${rcvLead(x.r)} ngày</small>`:''}`,x:x=>fmtDate(x.r.puDate)},
      {h:'Vật tư nhập',c:'nt',f:x=>esc(rcvTxt(x.r)),x:x=>rcvTxt(x.r)},
      {h:'Chi tiết sản phẩm',c:'nt',f:x=>esc([...new Set((x.r.lines||[]).map(l=>l.detail).filter(Boolean))].join('; ')||'–'),x:x=>(x.r.lines||[]).map(l=>l.detail).filter(Boolean).join('; ')},
      {h:'Số lượng',c:'num',f:x=>fmtNum(rcvQty(x.r)),x:x=>rcvQty(x.r)},
      actCol(x=>`<button class="btn sm" data-act="rc-view" data-id="${x.r.id}" title="Xem" aria-label="Xem phiếu nhập">👁</button><button class="btn sm" data-act="rc-edit" data-id="${x.r.id}" title="Sửa" aria-label="Sửa phiếu nhập">✎</button><button class="btn sm" data-act="rc-del" data-id="${x.r.id}" title="Xoá" aria-label="Xoá phiếu nhập">🗑</button>`)
    ],rows,{empty:'Chưa có phiếu nhập nào. Bấm “＋ Tạo phiếu nhập”.',meta:false})+'</section>'
    +card('Tồn kho theo vật tư & size',miniTable(['Vật tư','Nhóm','Size','Nhập','Đã cấp','Tồn'],stk.map(o=>{const it=pItem(o.id)||{},t=o.inn-o.out;return `<tr><td><b>${esc(it.name||'?')}</b></td><td><small>${esc(PTYPE[it.type||'ppe'].grp)}</small></td><td>${esc(o.sz||'–')}</td><td class="num">${fmtNum(o.inn)}</td><td class="num">${fmtNum(o.out)}</td><td class="num"><b class="${t<0?'tag-bad':t===0?'muted':''}">${fmtNum(t)}</b></td></tr>`}),'Chưa có số liệu nhập / cấp.')+'<p class="note">Tồn âm: đã cấp nhiều hơn số đã nhập trên app (thường do hàng tồn từ trước chưa nhập phiếu).</p>')}};
