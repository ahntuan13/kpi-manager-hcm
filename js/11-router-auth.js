/* 11-router-auth.js – Menu bên trái, điều hướng (router), đăng nhập, điều phối sự kiện */
'use strict';
(self.__mods=self.__mods||[]).push('11-router-auth');

/* ---------- sidebar / shell / router ---------- */
function sideHTML(){
  return `<div class="brand">${typeof LOGO_DATA!=='undefined'?`<img class="lg" src="${LOGO_DATA}" alt="KPI">`:'<div class="lg-t">KPI</div>'}<div><b>Quản lý KPI</b><span>${esc(db.company.name||'')}</span></div></div><nav class="nav">`+
  menu().map(g=>{
    const items=g.items;
    const active=ui.key.startsWith(g.g+'/');
    const open=ui.open[g.g]===undefined?active:ui.open[g.g];
    return `<div class="ng ${open?'open':''}"><button class="ngh" data-act="grp" data-g="${g.g}"><span class="ic">${g.icon}</span>${g.label}<span class="chev">▶</span></button><div class="ngi">${items.map(([k,l])=>`<a href="#/${g.g}/${k}" class="${ui.key===g.g+'/'+k?'on':''}">${esc(l)}</a>`).join('')}</div></div>`;
  }).join('')+`</nav>${creditHTML('credit side-credit')}`;
}
function shell(){
  $('#app').innerHTML=`<div class="app"><aside class="side" id="side"></aside><div class="main"><header class="top"><button class="burger" data-act="burger" aria-label="Menu">☰</button><div><div class="crumb" id="crumb"></div><h1 id="ptitle"></h1></div><div class="sp"></div><div class="usr"><span class="av">${esc((session.name||'?').trim().charAt(0).toUpperCase())}</span><div><b>${esc(session.name)}</b><small>${ROLES[session.role]}</small></div><button class="btn sm" data-act="chpw" title="Đổi mật khẩu">🔑</button><button class="btn sm" data-act="logout">Đăng xuất</button></div></header><main class="content" id="content"></main><footer class="page-foot">${esc(CREDIT)}</footer></div></div><div class="scrim" data-act="burger"></div>`;
}
function resolvePage(h){
  if(h==='dash/me'){const e=empOf(session.empId);return e?empPage(e):{t:'KPI của tôi',r:()=>'<div class="empty"><b>Tài khoản của bạn chưa được gắn với nhân viên nào.</b><br>Hãy nhờ Admin gắn tài khoản với tên của bạn ở Settings → User / Permission.</div>'}}
  if(PAGES[h])return PAGES[h];
  const [g,k]=h.split('/');
  if(g==='emp'){const e=empOf(k);if(e)return empPage(e)}
  return{t:'Không tìm thấy trang',r:()=>`<div class="empty">Trang này không tồn tại. <a href="#/dash/overview">Về Tổng quan</a></div>`};
}
function render(keep){
  if(!session){loginView();return}
  if(CLOUD&&!cloudReady){$('#app').innerHTML=loadingHTML('Đang tải dữ liệu từ Firebase…');return}
  if(!$('#content'))shell();
  let h=location.hash.replace(/^#\//,'')||homeHash();
  if(!allowedHash(h)){h=homeHash();history.replaceState(null,'','#/'+h)}   /* trang không thuộc quyền → về trang chủ của vai trò */
  ui.key=h;PAGE=resolvePage(h);
  $('#side').innerHTML=sideHTML();
  const g=MENU.find(x=>x.g===h.split('/')[0]);
  $('#crumb').textContent=g?`${g.icon} ${g.label}`:'';
  $('#ptitle').textContent=PAGE.t;document.title=`${PAGE.t} – Quản lý KPI`;
  destroyCharts();
  const sy=window.scrollY;
  try{
    $('#content').innerHTML=PAGE.r?PAGE.r():`${PAGE.head?PAGE.head():''}<div id="tbl">${PAGE.tbl()}</div>`;
    PAGE.tm&&PAGE.tm();PAGE.m&&PAGE.m();
  }catch(err){console.error(err);$('#content').innerHTML=`<div class="empty">Lỗi hiển thị trang: ${esc(err.message)}</div>`}
  $('#side').classList.remove('open');
  window.scrollTo(0,keep?sy:0);
}
const rerender=()=>render(true);
window.addEventListener('hashchange',()=>render(false));

/* ---------- đăng nhập ---------- */
function loginView(){
  if(CLOUD)return cloudLoginView();
  $('#app').innerHTML=`<div class="login"><form class="lcard" data-submit="login">${logoBlock()}<h1>Quản lý KPI</h1><p>Đánh giá công việc nhân viên theo tháng · quý · năm</p>${inp('username','Tên đăng nhập','',{req:1,attrs:'autocomplete="username" autofocus'})}${inp('password','Mật khẩu','',{type:'password',req:1,attrs:'autocomplete="current-password"'})}<button class="btn primary block">Đăng nhập</button><div class="hint">Chế độ dùng thử trên máy này. Tài khoản mặc định: <b>admin</b> / <b>admin123</b>. Để mỗi nhân viên chỉ thấy việc của mình một cách bảo mật, cần bật Firebase.</div><button type="button" class="lnk" data-act="fb-config">Kết nối Firebase để dùng chung dữ liệu…</button></form>${creditHTML('login-credit')}</div>`;
}
SUB.login=form=>{
  const d=fd(form),u=db.users.find(x=>x.username.toLowerCase()===d.username.trim().toLowerCase());
  if(!u||!u.active||u.pass!==pw(d.password))return toast('Sai tên đăng nhập hoặc mật khẩu.','error');
  if(!ROLES[u.role])return toast('Tài khoản chưa được cấp vai trò. Liên hệ Admin.','error');
  session={id:u.id,name:u.name,role:u.role,username:u.username,empId:u.empId||''};sessionStorage.setItem(SS_KEY,u.id);
  $('#app').innerHTML='';render(false);
};
ACT.logout=()=>{session=null;sessionStorage.removeItem(SS_KEY);closeModal();$('#app').innerHTML='';render()};
ACT.chpw=()=>{
  modal('Đổi mật khẩu',`<form id="mf" data-submit="chpw"><div class="fg">${inp('old','Mật khẩu hiện tại','',{type:'password',req:1,full:1})}${inp('n1','Mật khẩu mới (tối thiểu 6 ký tự)','',{type:'password',req:1,full:1,attrs:'minlength="6"'})}${inp('n2','Nhập lại mật khẩu mới','',{type:'password',req:1,full:1})}</div></form>`,{footer:cancelBtn+`<button class="btn primary" form="mf">Đổi mật khẩu</button>`});
};
SUB.chpw=form=>{
  const d=fd(form),u=by(db.users,session.id);
  if(u.pass!==pw(d.old))return toast('Mật khẩu hiện tại không đúng.','error');
  if(d.n1!==d.n2)return toast('Hai mật khẩu mới không khớp.','error');
  u.pass=pw(d.n1);save();closeModal();toast('Đã đổi mật khẩu.');
};

/* ---------- điều phối sự kiện chung ---------- */
document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el)return;const fn=ACT[el.dataset.act];if(fn){fn(el,e)}});
document.addEventListener('submit',e=>{const f=e.target.closest('form[data-submit]');if(!f)return;e.preventDefault();const fn=SUB[f.dataset.submit];if(fn)fn(f)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#modal-root .ov')){const cp=document.getElementById('cb-pop');if(cp&&!cp.hidden)return;closeModal()}});
ACT.close=()=>closeModal();
ACT.burger=()=>{$('#side')?.classList.toggle('open')};
ACT.grp=el=>{const g=el.dataset.g,cur=ui.open[g]===undefined?ui.key.startsWith(g+'/'):ui.open[g];ui.open[g]=!cur;$('#side').innerHTML=sideHTML()};
ACT.export=el=>exportCurrent(el.dataset.name||'export');
ACT['rpt-pdf']=async el=>{const box=offscreen(reportHTML(),1100);await pdfFromEls([box],`${slug(PAGE.t)}_${todayStr()}.pdf`,{landscape:true});box.remove()};
ACT['rpt-print']=()=>printHTML(reportHTML());
const rptBtns=name=>`<button class="btn" data-act="export" data-name="${name}">⬇ Excel</button><button class="btn" data-act="rpt-pdf">PDF</button><button class="btn" data-act="rpt-print">🖨 In</button>`;
