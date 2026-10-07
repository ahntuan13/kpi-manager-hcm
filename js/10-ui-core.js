/* 10-ui-core.js – Khung giao diện: menu, toast, modal, form, bộ lọc, bảng, biểu đồ, in/PDF/Excel */
'use strict';
(self.__mods=self.__mods||[]).push('10-ui-core');

/* =====================================================================
   KHUNG GIAO DIỆN
   ===================================================================== */
const ui={key:'',f:{},open:{},charts:[],cur:null};
/* Ghi công tác giả – hiện ở menu trái, cuối mỗi trang, màn hình đăng nhập và báo cáo in */
const CREDIT='🔧 KPI Manager HCM · chỉ dùng trong nội bộ';
const creditHTML=(cls='credit')=>`<div class="${cls}">${esc(CREDIT)}</div>`;
const PAGES={},ACT={},SUB={};
let PAGE=null,S=null,T=null,IMP=null;
const F=()=>(ui.f[ui.key]??={});
const badge=(t,x)=>`<span class="bd ${t}">${esc(x)}</span>`;
const logoBlock=()=>typeof LOGO_DATA!=='undefined'?`<img class="lm-img" src="${LOGO_DATA}" alt="KPI">`:'<div class="lm">KPI</div>';
const PAL=['#2f7de1','#0e9f8b','#e29a2d','#6c5ce7','#ec6a5e','#22b8c9','#d6447a','#64748b','#84b33a','#9b7bf0'];
/* Màu biểu đồ theo ý nghĩa */
const CC={bar:'#2f7de1',low:'#dc4f47',line:'#0e9f8b',prev:'#a3abc4',xs:'#0e9f8b',tot:'#2f7de1',dat:'#a3abc4',cct:'#dc4f47'};

/* Mục có nhãn thứ 3: 'admin' = chỉ Admin · 'mgr' = Admin + Quản lý · 'me' = tài khoản đã gắn với một nhân viên · không ghi = mọi vai trò */
const MENU=[
 {g:'dash',icon:'📊',label:'Dashboard',items:[['me','KPI của tôi','me'],['overview','Tổng quan','mgr'],['month','KPI theo tháng','mgr'],['rank','Xếp hạng nhân viên','mgr']]},
 {g:'emp',icon:'👥',label:'Nhân viên',items:[['list','Tất cả nhân viên','mgr'],['dept','Theo nhóm','mgr']]},
 {g:'rpt',icon:'📅',label:'Báo cáo',items:[['employee','Theo nhân viên'],['monthly','Theo tháng'],['quarter','Theo quý'],['dept','Theo nhóm','mgr']]},
 {g:'help',icon:'📘',label:'Quy chế',items:[['rules','Quy chế KPI']]},
 {g:'set',icon:'⚙️',label:'Settings',items:[['org','Nhóm & ngày lễ','admin'],['users','User / Permission','admin'],['system','Sao lưu & Hệ thống','admin']]}
];
const itemOk=it=>{const w=it[2];return !w||(w==='admin'?can('admin'):w==='mgr'?can('manage'):(isStaff()||!!(session&&session.empId)))};
const menu=()=>MENU.map(g=>({...g,items:g.items.filter(itemOk)})).filter(g=>g.items.length);
/* Trang có được mở với vai trò hiện tại không (gõ thẳng địa chỉ cũng bị chặn) */
function allowedHash(h){const [g,k]=h.split('/'),grp=MENU.find(x=>x.g===g);if(!grp||!session)return false;const it=grp.items.find(i=>i[0]===k);if(it)return itemOk(it);return g==='emp'&&(can('manage')||(!!k&&k===session.empId))}
/* ---------- toast / modal ---------- */
function toast(msg,type='ok'){const r=$('#toast-root');if(!r)return;const d=document.createElement('div');d.className='toast '+type;d.textContent=msg;r.appendChild(d);setTimeout(()=>d.classList.add('out'),3400);setTimeout(()=>d.remove(),3800)}
function modal(title,body,{footer='',size=''}={}){
  $('#modal-root').innerHTML=`<div class="ov"><div class="md ${size}" role="dialog" aria-modal="true"><div class="mh"><h3>${esc(title)}</h3><button class="x" data-act="close" aria-label="Đóng">✕</button></div><div class="mb">${body}</div>${footer?`<div class="mf">${footer}</div>`:''}</div></div>`;
  document.body.classList.add('noscroll');
  setTimeout(()=>$('#modal-root .mb input:not([type=checkbox]):not([type=hidden]):not([readonly]),#modal-root .mb select')?.focus(),40);
}
function closeModal(){const r=$('#modal-root');if(r)r.innerHTML='';document.body.classList.remove('noscroll');S=null;T=null;IMP=null}
const done=msg=>{closeModal();rerender();toast(msg||'Đã lưu')};
const cancelBtn=`<button class="btn" data-act="close">Hủy</button>`;

/* ---------- form helpers ---------- */
const inp=(n,l,v,o={})=>`<label class="f ${o.full?'full':''}"><span>${l}${o.req?' <i>*</i>':''}</span><input class="in" name="${n}" type="${o.type||'text'}" value="${esc(v??'')}" ${o.req?'required':''} ${o.ph?`placeholder="${esc(o.ph)}"`:''} ${o.step?`step="${o.step}"`:''} ${o.min!==undefined?`min="${o.min}"`:''} ${o.attrs||''}></label>`;
const sel=(n,l,opts,v,o={})=>`<label class="f ${o.full?'full':''}"><span>${l}${o.req?' <i>*</i>':''}</span><select class="in" name="${n}" ${o.req?'required':''} ${o.attrs||''}>${o.blank!==undefined?`<option value="">${esc(o.blank)}</option>`:''}${opts.map(([val,lab])=>`<option value="${esc(val)}" ${val===v?'selected':''}>${esc(lab)}</option>`).join('')}</select></label>`;
const txa=(n,l,v,o={})=>`<label class="f ${o.full?'full':''}"><span>${l}</span><textarea class="in" name="${n}" rows="${o.rows||2}">${esc(v??'')}</textarea></label>`;
const chk=(n,l,v)=>`<label class="chk full"><input type="checkbox" name="${n}" ${v?'checked':''}> ${l}</label>`;
const fd=form=>Object.fromEntries(new FormData(form));

/* ---------- bộ lọc ---------- */
const fSearch=(ph='Tìm kiếm…')=>`<input class="in srch" type="search" placeholder="${esc(ph)}" value="${esc(F().q||'')}" data-f="q" aria-label="${esc(ph)}">`;
const fSel=(name,label,opts)=>`<select class="in" data-f="${name}" title="${esc(label)}" aria-label="${esc(label)}">${opts.map(([v,l])=>`<option value="${esc(v)}" ${(F()[name]||'')===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
const fDate=(name,label,def='')=>`<label class="fl">${label}<input class="in" type="date" data-f="${name}" value="${F()[name]??def}"></label>`;
const fMonth=(name,label,def='')=>`<label class="fl">${label}<input class="in" type="month" data-f="${name}" value="${F()[name]??def}"></label>`;
/* Ô số kiểu Việt Nam: data-num="money" (tiền VND, tối đa 2 số lẻ) | "int" (số nguyên). Chuẩn hoá khi rời ô. */
document.addEventListener('change',e=>{
  const el=e.target;if(!el.dataset||el.dataset.num===undefined||el.readOnly)return;
  const isM=el.dataset.num==='money',v=isM?r2(evalMoney(el.value)):numVN(el.value);el.value=el.value.trim()===''?'':(isM?fmtPrice(v):fmtNum(v));
  if(isM)el.dispatchEvent(new Event('input',{bubbles:true}));
});
document.addEventListener('focusin',e=>{const el=e.target;if(el.dataset&&el.dataset.num!==undefined&&el.select&&!el.readOnly)setTimeout(()=>el.select(),0)});
function onFilter(e){
  const el=e.target.closest&&e.target.closest('[data-f]');if(!el)return;
  const f=F(),v=el.value;if((f[el.dataset.f]??'')===v)return;
  f[el.dataset.f]=v;refreshTbl();
}
document.addEventListener('input',onFilter);document.addEventListener('change',onFilter);
function refreshTbl(){destroyCharts();const t=$('#tbl');if(PAGE&&PAGE.tbl&&t){t.innerHTML=PAGE.tbl();PAGE.tm&&PAGE.tm()}else rerender()}

/* ---------- bảng ---------- */
const nc=(h,fn,fmt=fmtNum)=>({h,c:'num',f:r=>fmt(fn(r)),x:fmt===fmtMoney?(r=>r2(fn(r))):fn});
/* Cột có xonly:1 chỉ dùng khi xuất Excel (không hiện trên màn hình); rc(r) trả về class của dòng */
function table(all,rows,{empty='Chưa có dữ liệu.',limit=1000,foot='',rc=null,meta=true}={}){
  ui.cur={cols:all,rows};const cols=all.filter(c=>!c.xonly);
  if(!rows.length)return `<div class="empty">${empty}</div>`;
  const shown=rows.slice(0,limit),lb=cols.map(c=>esc(strip(c.h)));   /* data-l: nhãn cột, dùng khi bảng xếp thành thẻ trên điện thoại */
  return `${meta?`<div class="meta">${fmtNum(rows.length)} dòng</div>`:''}<div class="tw"><table class="t"><thead><tr>${cols.map(c=>`<th class="${c.c||''}">${c.h}</th>`).join('')}</tr></thead><tbody>${shown.map(r=>`<tr class="${rc?rc(r):''}">${cols.map((c,i)=>`<td class="${c.c||''}"${lb[i]?` data-l="${lb[i]}"`:''}>${c.f(r)}</td>`).join('')}</tr>`).join('')}</tbody>${foot?`<tfoot>${foot}</tfoot>`:''}</table></div>${rows.length>limit?`<div class="note">Đang hiển thị ${limit}/${fmtNum(rows.length)} dòng đầu. Dùng bộ lọc để thu hẹp hoặc xuất Excel để lấy đầy đủ.</div>`:''}`;
}
const actCol=fn=>({h:'',c:'act',noexp:1,f:fn});
function xlsxSave(aoa,name,sheet='Data'){
  if(!window.XLSX)return toast('Chưa tải được thư viện Excel (SheetJS). Kiểm tra kết nối mạng.','error');
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=aoa[0].map((_,i)=>({wch:Math.min(42,Math.max(10,...aoa.slice(0,60).map(r=>String(r[i]??'').length+2)))}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,sheet);XLSX.writeFile(wb,`${name}_${todayStr()}.xlsx`);
}
function exportCurrent(name){
  const t=ui.cur;if(!t||!t.rows.length)return toast('Không có dữ liệu để xuất.','warn');
  const cols=t.cols.filter(c=>!c.noexp);
  xlsxSave([cols.map(c=>strip(c.h)),...t.rows.map(r=>cols.map(c=>c.x?c.x(r):strip(c.f(r))))],name);
}

/* ---------- biểu đồ ---------- */
function chart(id,cfg){
  const c=document.getElementById(id);if(!c)return;
  if(!window.Chart){c.parentElement.innerHTML='<div class="empty">Chưa tải được thư viện biểu đồ (Chart.js).</div>';return}
  Chart.defaults.font.family="'Be Vietnam Pro',system-ui,sans-serif";
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)Chart.defaults.animation=false;else if(Chart.defaults.animation)Chart.defaults.animation.duration=350;   /* tôn trọng thiết lập giảm chuyển động */Chart.defaults.color='#6b7394';Chart.defaults.borderColor='#e6e9f2';
  ui.charts.push(new Chart(c,cfg));
}
function destroyCharts(){ui.charts.forEach(c=>{try{c.destroy()}catch(e){}});ui.charts=[]}
const baseOpt=(extra={})=>({responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'rectRounded',boxWidth:10,boxHeight:10}}},datasets:{bar:{borderRadius:5,maxBarThickness:26}},...extra});

/* ---------- in / PDF ---------- */
function offscreen(html,width=794){const d=document.createElement('div');d.style.cssText=`position:fixed;left:-99999px;top:0;width:${width}px;background:#fff;z-index:-1`;d.innerHTML=html;document.body.appendChild(d);return d}
function printHTML(html){$('#print-area').innerHTML=html;document.body.classList.add('printing');setTimeout(()=>window.print(),60)}
window.addEventListener('afterprint',()=>{document.body.classList.remove('printing');const p=$('#print-area');if(p)p.innerHTML=''});
/* Các khối không được cắt ngang khi sang trang PDF: dòng bảng, thẻ KPI, biểu đồ, nhận xét, chữ ký… */
const PDF_KEEP='tr,.kpi,.ch,img,canvas,.sign,.cmtp,.keep,.hdr,.mstrip,.rpt-hd,.sh,.mt,h1,h2,h3,h4,p,li';
/* Các khối phải đi cùng khối ngay sau nó: tiêu đề không nằm lẻ cuối trang, nhận xét đi cùng chữ ký */
const PDF_NEXT='h1,h2,h3,h4,.hdr,.mstrip,thead tr,.cmtp';
/* Chia một khối cao thành các trang: ngắt ở mép của khối gần nhất, không bao giờ cắt ngang một dòng. Trả về [[y0,y1],…] (px). */
function pdfPages(el,pageH,headOf){
  const top=el.getBoundingClientRect().top,H=el.scrollHeight,pages=[];
  const all=[...el.querySelectorAll(PDF_KEEP)].map(x=>{const r=x.getBoundingClientRect();return{a:r.top-top,b:r.bottom-top,kn:x.matches(PDF_NEXT)}}).filter(o=>o.b-o.a>1).sort((p,q)=>p.a-q.a||q.b-p.b);
  for(let i=all.length-1;i>=0;i--){const o=all[i];if(!o.kn)continue;const nx=all.find((q,j)=>j>i&&q.a>=o.b-1);if(nx&&nx.b-o.a<pageH*.8)o.b=Math.max(o.b,nx.b)}
  const bl=all.filter(o=>o.b-o.a<pageH).map(o=>[o.a,o.b]);
  const cand=[...new Set(bl.flatMap(b=>[Math.round(b[0]),Math.round(b[1])]))].sort((x,y)=>y-x),cuts=c=>bl.some(b=>b[0]<c-1&&b[1]>c+1);
  let y=0;
  while(y<H-1){
    const cap=pageH-headOf(y),lim=y+cap;let end=H;
    if(lim<H){end=cand.find(c=>c<=lim&&c>y+cap*.3&&!cuts(c));if(end===undefined)end=Math.floor(lim)}
    pages.push([y,end]);y=end;
  }
  return pages;
}
async function pdfFromEls(els,filename,{landscape=false}={}){
  if(!window.html2canvas||!window.jspdf)return toast('Chưa tải được thư viện PDF (html2canvas / jsPDF). Kiểm tra kết nối mạng.','error');
  try{
    const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:landscape?'l':'p',unit:'pt',format:'a4'});
    const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight(),M=22,out=[];
    for(const el of els){
      const W=el.offsetWidth,pageH=(ph-2*M)*W/pw,top=el.getBoundingClientRect().top;
      /* tiêu đề cột của bảng được lặp lại ở đầu trang khi bảng kéo sang trang sau */
      const tabs=[...el.querySelectorAll('table')].map(t=>{const h=t.tHead,r=t.getBoundingClientRect();if(!h)return null;const hr=h.getBoundingClientRect();return{t1:r.bottom-top,h0:hr.top-top,h1:hr.bottom-top}}).filter(x=>x&&x.h1-x.h0>1&&x.h1-x.h0<pageH/3);
      const headAt=y=>tabs.find(t=>t.h1<y+1&&t.t1>y+4),pages=pdfPages(el,pageH,y=>{const t=headAt(y);return t?t.h1-t.h0:0});
      const cv=await html2canvas(el,{scale:2,backgroundColor:'#ffffff',useCORS:true}),k=cv.width/W;
      for(const [y0,y1] of pages){
        const hd=headAt(y0),hh=hd?Math.round((hd.h1-hd.h0)*k):0,bh=Math.round((y1-y0)*k);if(bh<2)continue;
        const pg=document.createElement('canvas');pg.width=cv.width;pg.height=hh+bh;const g=pg.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,pg.width,pg.height);
        if(hd)g.drawImage(cv,0,Math.round(hd.h0*k),cv.width,hh,0,0,cv.width,hh);
        g.drawImage(cv,0,Math.round(y0*k),cv.width,bh,0,hh,cv.width,bh);
        out.push([pg.toDataURL('image/jpeg',0.92),pg.height*pw/cv.width]);
      }
    }
    out.forEach(([img,h],i)=>{if(i)pdf.addPage();pdf.addImage(img,'JPEG',0,M,pw,h);if(out.length>1){pdf.setFontSize(8);pdf.setTextColor(120);pdf.text(`${i+1} / ${out.length}`,pw-26,ph-9,{align:'right'})}});
    pdf.save(filename);
  }catch(e){toast('Xuất PDF thất bại: '+e.message,'error')}
}
/* Bản in / PDF của trang đang xem: bỏ nút bấm và cột thao tác, đổi ô chọn / ô nhập thành chữ, thêm nhận xét và chữ ký (trang có PAGE.sign) */
const SIGN_HTML='<div class="sign"><div><b>Nhân viên tự đánh giá</b><br><small>(Ký, ghi rõ họ tên)</small></div><div><b>Quản lý duyệt</b><br><small>(Ký, ghi rõ họ tên)</small></div></div>';
function printClean(clone,src){
  const ss=$$('select',src),sd=$$('select',clone),ts=$$('textarea',src),td=$$('textarea',clone);
  sd.forEach((x,i)=>{const o=ss[i]&&ss[i].selectedOptions[0],sp=document.createElement('span');sp.textContent=o?o.textContent:'';x.replaceWith(sp)});
  td.forEach((x,i)=>{const v=String(ts[i]?ts[i].value:x.value).trim(),f=x.closest('form'),d=document.createElement('div');
    if(f&&f.classList.contains('cmt')){d.className='cmtp';d.innerHTML=`<b>${esc(f.querySelector('label span')?.textContent||'Nhận xét của quản lý')}:</b> ${v?esc(v):'<i>(chưa có nhận xét)</i>'}`}
    else{d.className='mc';d.textContent=v}
    (f||x).replaceWith(d)});
  $$('th.act,td.act,.acts,.bar,.seg,p.hint,.meta',clone).forEach(x=>x.remove());
  $$('button',clone).forEach(x=>{if(!x.closest('.mstrip'))x.remove()});
}
function reportHTML(){
  const c=db.company||{},t=$('#tbl'),clone=t.cloneNode(true);
  const src=$$('canvas',t),dst=$$('canvas',clone);
  dst.forEach((cv,i)=>{try{const img=new Image();img.src=src[i].toDataURL('image/png');img.style.cssText='max-width:100%;height:auto';cv.replaceWith(img)}catch(e){cv.remove()}});
  printClean(clone,t);
  return `<div class="rpt-doc"><div class="rpt-hd"><div class="co">${typeof LOGO_DATA!=='undefined'?`<img class="slip-logo" src="${LOGO_DATA}" alt="Logo">`:''}<div><b>${esc(c.name||'')}</b><div>${esc(c.note||'')}</div></div></div><div>Ngày in: ${fmtDate(todayStr())}</div></div><h2>${esc(PAGE.t)}</h2>${PAGE.sub?`<div class="sub">${PAGE.sub()}</div>`:''}${clone.innerHTML}${PAGE.sign?SIGN_HTML:''}<div style="margin-top:14px;font-size:11px;color:#777;text-align:right">${esc(CREDIT)}</div></div>`;
}
