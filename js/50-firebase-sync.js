/* 50-firebase-sync.js – Firebase: đăng nhập, đồng bộ realtime, quản lý người dùng */
'use strict';
(self.__mods=self.__mods||[]).push('50-firebase-sync');

/* =====================================================================
   FIREBASE – ĐỒNG BỘ DỮ LIỆU DÙNG CHUNG
   - Mỗi nhân viên và mỗi bảng KPI (nhân viên × năm) là 1 document trong Firestore.
   - Sau mỗi lần lưu, app chỉ ghi phần thay đổi; thay đổi của người khác
     được nhận realtime qua onSnapshot.
   - Đăng nhập bằng Firebase Authentication (Email/Password); vai trò lưu
     ở users/{uid}; Firestore Security Rules (file firestore.rules) chặn
     truy cập trái phép ở phía máy chủ.
   ===================================================================== */
const SYNC=['employees','sheets'];
/* Phiên bản Rules mà app này cần. Phải trùng dấu phiên bản trong firestore.rules (match /rulesCheck/{v}). */
const RULES_VER='v3';
let rulesOld=false;
/* Rules trên Firebase có phải bản mới nhất không? Bản cũ từ chối đường dẫn rulesCheck/<phiên bản>. */
async function checkRules(){
  try{await fbStore.doc('rulesCheck/'+RULES_VER).get();if(rulesOld){rulesOld=false;rerender()}}
  catch(e){if(e&&e.code==='permission-denied'&&!rulesOld){rulesOld=true;rerender()}}
}
function rulesBanner(){
  if(!CLOUD||!rulesOld)return'';
  return `<div class="warnbar" role="alert"><b>Quy tắc bảo mật (Firestore Rules) trên Firebase chưa phải bản mới nhất.</b> ${can('admin')
    ?`Vì vậy tài khoản Nhân viên chưa lưu được việc của mình. Cách sửa: mở <a href="https://console.firebase.google.com/project/${esc(FBCFG.projectId)}/firestore/rules" target="_blank" rel="noopener">Firebase Console → Firestore → Rules</a>, xoá hết nội dung cũ, dán toàn bộ file <a href="firestore.rules" target="_blank" rel="noopener">firestore.rules</a> (bản ${RULES_VER}) rồi bấm Publish. Sau đó tải lại trang này.`
    :'Bạn có thể chưa lưu được thay đổi. Hãy báo Admin cập nhật Rules rồi tải lại trang.'}</div>`;
}
/* Email của Admin duy nhất, khai báo ở config/firebase-config.js */
const ADMIN=(typeof ADMIN_EMAIL==='string'?ADMIN_EMAIL:'').trim().toLowerCase();
let fbAuth=null,fbStore=null,cloudReady=false,unsubs=[],remote={},remoteCfg={},setupPending=false,pushQ=Promise.resolve(),renderTimer=null;
const canon=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((o,kk)=>(o[kk]=x[kk],o),{}):x);
const loadingHTML=m=>`<div class="login"><div class="lcard">${logoBlock()}<h1>${esc(m)}</h1><p>Vui lòng đợi trong giây lát…</p></div>${creditHTML('login-credit')}</div>`;
const loadScript=src=>new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Không tải được thư viện Firebase. Kiểm tra kết nối mạng.'));document.head.appendChild(s)});
function authMsg(e){
  const c=e&&e.code||'';
  if(/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c))return 'Sai email hoặc mật khẩu.';
  if(c==='auth/email-already-in-use')return 'Email này đã có tài khoản.';
  if(c==='auth/weak-password')return 'Mật khẩu quá yếu (tối thiểu 6 ký tự).';
  if(c==='auth/invalid-email')return 'Email không hợp lệ.';
  if(c==='auth/too-many-requests')return 'Thử quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.';
  if(c==='auth/network-request-failed')return 'Mất kết nối mạng.';
  if(c==='auth/operation-not-allowed')return 'Chưa bật đăng nhập Email/Password trong Firebase Authentication.';
  if(c==='permission-denied')return 'Không có quyền thực hiện (Firestore Rules).';
  return (e&&e.message)||'Có lỗi xảy ra.';
}

/* ---------- khởi động ---------- */
async function cloudBoot(){
  $('#app').innerHTML=loadingHTML('Đang kết nối Firebase…');
  try{
    if(!window.firebase){for(const f of['app','auth','firestore'])await loadScript(`https://www.gstatic.com/firebasejs/10.12.2/firebase-${f}-compat.js`)}
    firebase.initializeApp(FBCFG);fbAuth=firebase.auth();fbStore=firebase.firestore();
    fbAuth.onAuthStateChanged(u=>{
      if(setupPending)return;
      if(!u){stopSync();session=null;cloudReady=false;render(false);return}
      bootSession(u);
    });
  }catch(e){
    $('#app').innerHTML=`<div class="login"><div class="lcard"><h1>Không kết nối được Firebase</h1><p>${esc(e.message)}</p>${FIREBASE_CONFIG?'':'<button class="btn" data-act="fb-disconnect">Dùng chế độ cục bộ</button>'}</div></div>`;
  }
}
async function bootSession(u){
  try{
    const snap=await fbStore.collection('users').doc(u.uid).get();
    if(!snap.exists){toast('Tài khoản chưa được cấp quyền. Hãy liên hệ Admin.','error');await fbAuth.signOut();return}
    const p=snap.data();
    if(p.active===false){toast('Tài khoản đã bị khoá.','error');await fbAuth.signOut();return}
    if(!ROLES[p.role]){toast('Tài khoản chưa được cấp vai trò. Hãy liên hệ Admin.','error');await fbAuth.signOut();return}
    session={id:u.uid,name:p.name||u.email,role:p.role,username:u.email,empId:p.empId||''};
    startSync();
  }catch(e){toast(authMsg(e),'error');try{await fbAuth.signOut()}catch(x){}}
}

/* ---------- đồng bộ ---------- */
function resetRemote(){remote={};SYNC.forEach(c=>remote[c]={});remoteCfg={company:null,seq:null}}
function stopSync(){unsubs.forEach(u=>{try{u()}catch(e){}});unsubs=[]}
function startSync(){
  stopSync();resetRemote();cloudReady=false;db=emptyCloudDB();render(false);
  const total=SYNC.length+3,seen=new Set();
  const mark=k=>{seen.add(k);if(!cloudReady&&seen.size===total){cloudReady=true;afterReady()}};
  const fail=e=>{console.error(e);toast('Lỗi đồng bộ: '+authMsg(e),'error')};
  if(isStaff()){
    /* Nhân viên chỉ tải đúng hồ sơ và bảng KPI của chính mình (Rules ở máy chủ cũng chỉ cho đọc phần này) */
    const eid=session.empId;
    if(!eid){mark('employees');mark('sheets')}
    else{
      unsubs.push(fbStore.doc('employees/'+eid).onSnapshot(s=>{applyRemote('employees',[{type:s.exists?'modified':'removed',doc:s}]);mark('employees')},fail));
      unsubs.push(fbStore.collection('sheets').where('empId','==',eid).onSnapshot(s=>{applyRemote('sheets',s.docChanges());mark('sheets')},fail));
    }
  }else SYNC.forEach(col=>unsubs.push(fbStore.collection(col).onSnapshot(s=>{applyRemote(col,s.docChanges());mark(col)},fail)));
  unsubs.push(fbStore.doc('config/company').onSnapshot(s=>{if(s.exists){const d=s.data();remoteCfg.company=canon(d);db.company={...db.company,...d};scheduleRender()}mark('company')},fail));
  unsubs.push(fbStore.doc('config/seq').onSnapshot(s=>{if(s.exists){const d=s.data();remoteCfg.seq=canon(d);for(const k in d)db.seq[k]=Math.max(db.seq[k]||0,+d[k]||0)}mark('seq')},fail));
  const uMap=(id,d)=>({id,username:d.email||'',name:d.name||'',role:d.role,empId:d.empId||'',active:d.active!==false});
  if(session.role==='admin')unsubs.push(fbStore.collection('users').onSnapshot(s=>{db.users=s.docs.map(d=>uMap(d.id,d.data()));scheduleRender();mark('users')},fail));
  else unsubs.push(fbStore.doc('users/'+session.id).onSnapshot(s=>{db.users=s.exists?[uMap(s.id,s.data())]:[];mark('users')},fail));
}
function afterReady(){
  const need=needsMigrate();migrate();
  if(need&&can('write'))save();
  render(false);checkRules();
  if(typeof autoBackup==='function')setTimeout(autoBackup,3000);
}
function applyRemote(col,changes){
  let changed=false;
  changes.forEach(ch=>{
    const id=ch.doc.id,i=db[col].findIndex(x=>x.id===id);
    if(ch.type==='removed'){delete remote[col][id];if(i>=0){db[col].splice(i,1);changed=true}return}
    const data={...ch.doc.data(),id},s=canon(data);
    if(remote[col][id]===s)return;
    remote[col][id]=s;if(i>=0)db[col][i]=data;else db[col].push(data);changed=true;
  });
  if(changed){if(cloudReady)migrate();scheduleRender()}
}
function scheduleRender(){
  if(!cloudReady)return;
  clearTimeout(renderTimer);
  renderTimer=setTimeout(()=>{
    if(!session||!$('#content'))return;
    $('#side').innerHTML=sideHTML();
    if(PAGE&&PAGE.tbl&&$('#tbl'))refreshTbl();else rerender();
  },150);
}

/* ---------- ghi thay đổi lên Firestore ---------- */
function cloudPush(){
  const staff=isStaff();
  if(!cloudReady||!(can('manage')||staff))return;
  const ops=[];
  SYNC.forEach(col=>{
    if(col==='employees'&&session.role!=='admin')return;   /* danh sách nhân viên: chỉ Admin ghi */
    const cur={};db[col].forEach(r=>{cur[r.id]=canon(r)});const old=remote[col];
    for(const id in cur)if(old[id]!==cur[id])ops.push({col,id,data:JSON.parse(cur[id])});
    if(session.role==='admin')for(const id in old)if(!(id in cur))ops.push({col,id,del:true});   /* xoá: chỉ Admin */
    remote[col]=cur;
  });
  const sq=canon(db.seq);if(!staff&&remoteCfg.seq!==sq){ops.push({path:'config/seq',data:JSON.parse(sq)});remoteCfg.seq=sq}
  if(session.role==='admin'){const cc=canon(db.company);if(remoteCfg.company!==cc){ops.push({path:'config/company',data:JSON.parse(cc)});remoteCfg.company=cc}}
  if(!ops.length)return;
  pushQ=pushQ.then(()=>commitOps(ops)).catch(e=>{console.error(e);const denied=e&&e.code==='permission-denied';toast('Chưa lưu được lên Firebase: '+authMsg(e)+(denied?(can('admin')?' Hãy dán lại file firestore.rules mới nhất vào Firebase.':' Hãy báo Admin cập nhật Firestore Rules.'):'')+' Trang sẽ tải lại để đồng bộ.','error');setTimeout(()=>location.reload(),denied?6000:3000)});
}
async function commitOps(ops){
  for(let i=0;i<ops.length;i+=400){
    const b=fbStore.batch();
    ops.slice(i,i+400).forEach(o=>{const ref=o.path?fbStore.doc(o.path):fbStore.collection(o.col).doc(o.id);o.del?b.delete(ref):b.set(ref,o.data)});
    await b.commit();
  }
}

/* ---------- đăng nhập / thiết lập lần đầu ---------- */
function cloudLoginView(){
  const setup=ui.loginMode==='setup';
  $('#app').innerHTML=`<div class="login"><form class="lcard" data-submit="${setup?'fb-setup':'login'}">${logoBlock()}<h1>${setup?'Thiết lập lần đầu':'Quản lý KPI'}</h1><p>${setup?'Tạo tài khoản Admin':'Đánh giá công việc nhân viên theo tháng · quý · năm'}</p>
    ${inp('username','Email',setup?ADMIN:'',{req:1,type:'email',attrs:'autocomplete="username" autofocus'+(setup&&ADMIN?' readonly':'')})}
    ${setup?inp('name','Họ tên','',{req:1}):''}
    ${inp('password','Mật khẩu'+(setup?' (tối thiểu 6 ký tự)':''),'',{type:'password',req:1,attrs:`autocomplete="${setup?'new-password':'current-password'}" ${setup?'minlength="6"':''}`})}
    ${setup?inp('password2','Nhập lại mật khẩu','',{type:'password',req:1}):''}
    <button class="btn primary block">${setup?'Tạo tài khoản Admin':'Đăng nhập'}</button>
    ${setup?`<div class="hint">Chỉ dùng cho lần đầu tiên khi hệ thống chưa có ai. Tài khoản Admin duy nhất là <b>${esc(ADMIN||'người thiết lập đầu tiên')}</b>; mọi người khác do Admin tạo tài khoản.</div>`:'<button type="button" class="lnk" data-act="fb-forgot">Quên mật khẩu?</button>'}
    <button type="button" class="lnk" data-act="fb-mode">${setup?'← Quay lại đăng nhập':'Thiết lập lần đầu (chưa có tài khoản quản trị)'}</button>
    ${FIREBASE_CONFIG?'':'<button type="button" class="lnk" data-act="fb-disconnect">Ngắt kết nối Firebase (chế độ cục bộ)</button>'}</form>${creditHTML('login-credit')}</div>`;
}
ACT['fb-mode']=()=>{ui.loginMode=ui.loginMode==='setup'?'login':'setup';cloudLoginView()};
ACT['fb-forgot']=async()=>{
  const em=($('input[name=username]')?.value||'').trim();if(!em)return toast('Nhập email vào ô Email trước.','warn');
  try{await fbAuth.sendPasswordResetEmail(em);toast('Đã gửi email đặt lại mật khẩu (nếu email tồn tại).')}catch(e){toast(authMsg(e),'error')}
};
if(CLOUD){
  SUB.login=async form=>{const d=fd(form);try{await fbAuth.signInWithEmailAndPassword(d.username.trim(),d.password)}catch(e){toast(authMsg(e),'error')}};
  ACT.logout=async()=>{closeModal();try{await fbAuth.signOut()}catch(e){}};
  SUB.chpw=async form=>{
    const d=fd(form);if(d.n1!==d.n2)return toast('Hai mật khẩu mới không khớp.','error');
    try{const u=fbAuth.currentUser;await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email,d.old));await u.updatePassword(d.n1);closeModal();toast('Đã đổi mật khẩu.')}catch(e){toast(authMsg(e),'error')}
  };
}
SUB['fb-setup']=async form=>{
  const d=fd(form),email=d.username.trim().toLowerCase();
  if(ADMIN&&email!==ADMIN)return toast('Chỉ '+ADMIN+' được thiết lập làm Admin.','error');
  if(d.password!==d.password2)return toast('Hai mật khẩu không khớp.','error');
  setupPending=true;
  try{
    const cred=await fbAuth.createUserWithEmailAndPassword(email,d.password),u=cred.user,b=fbStore.batch();
    b.set(fbStore.doc('users/'+u.uid),{email,name:d.name.trim(),role:'admin',active:true});
    b.set(fbStore.doc('meta/init'),{by:u.uid,at:Date.now()});
    try{await b.commit()}catch(e){try{await u.delete()}catch(x){}try{await fbAuth.signOut()}catch(x){}throw new Error('Hệ thống đã được thiết lập trước đó. Hãy nhờ Admin tạo tài khoản cho bạn.')}
    setupPending=false;ui.loginMode='login';await bootSession(u);   /* lần sau đăng xuất sẽ về màn hình đăng nhập, không phải thiết lập */
  }catch(e){setupPending=false;toast(authMsg(e),'error')}
};

/* ---------- quản lý người dùng (chỉ admin) ---------- */
async function createAuthUser(email,password){
  let app;try{app=firebase.app('sec')}catch(e){app=firebase.initializeApp(FBCFG,'sec')}
  const cred=await app.auth().createUserWithEmailAndPassword(email,password);
  await app.auth().signOut();return cred.user.uid;
}
async function cloudUserSave(form){
  const d=fd(form),id=form.dataset.id;
  try{
    const cur=id?by(db.users,id):null,role=cur&&cur.role==='admin'?'admin':(d.role==='member'?'member':'staff'),empId=d.empId||'';
    if(role==='staff'&&!empId)throw new Error('Vai trò Nhân viên phải được gắn với một nhân viên để biết họ được xem việc của ai.');
    if(id){
      if(id===session.id&&!d.active)throw new Error('Không thể tự khoá tài khoản đang đăng nhập.');
      await fbStore.doc('users/'+id).update({name:d.name.trim(),role,empId,active:!!d.active});
      if(id===session.id){session.empId=empId;session.name=d.name.trim();closeModal();shell();render(true);toast('Đã lưu');return}
    }else{
      const email=d.username.trim().toLowerCase(),uid=await createAuthUser(email,d.password);
      await fbStore.doc('users/'+uid).set({email,name:d.name.trim(),role,empId,active:true});
    }
    closeModal();toast('Đã lưu');
  }catch(e){toast(authMsg(e),'error')}
}
ACT['user-reset']=async el=>{const u=by(db.users,el.dataset.id);if(!u)return;try{await fbAuth.sendPasswordResetEmail(u.username);toast('Đã gửi email đặt lại mật khẩu tới '+u.username)}catch(e){toast(authMsg(e),'error')}};

/* ---------- kết nối / ngắt Firebase ---------- */
function parseFbCfg(t){const o={};['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId','measurementId'].forEach(k=>{const m=new RegExp(k+'["\']?\\s*:\\s*["\']([^"\']+)["\']').exec(t);if(m)o[k]=m[1]});return o}
ACT['fb-config']=()=>modal('Kết nối Firebase',`<form id="mf" data-submit="fb-config"><p class="note">Dán đoạn <b>firebaseConfig</b> lấy từ Firebase Console (Project settings → Your apps → Web app). Xem hướng dẫn chi tiết trong file README.</p>${txa('cfg','Cấu hình Firebase','',{rows:8,full:1})}</form>`,{footer:cancelBtn+'<button class="btn primary" form="mf">Lưu và kết nối</button>'});
SUB['fb-config']=form=>{
  const o=parseFbCfg(fd(form).cfg||'');
  if(!o.apiKey||!o.projectId)return toast('Không đọc được cấu hình. Cần có ít nhất apiKey và projectId.','error');
  localStorage.setItem(FB_LS,JSON.stringify(o));location.reload();
};
ACT['fb-disconnect']=()=>{if(confirm('Ngắt kết nối Firebase và quay về chế độ lưu cục bộ trên trình duyệt này?')){localStorage.removeItem(FB_LS);location.reload()}};
