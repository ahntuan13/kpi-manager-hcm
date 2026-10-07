/* 33-settings.js – Nhóm & ngày lễ, Quy chế KPI, User / Permission, Sao lưu & Hệ thống */
'use strict';
(self.__mods=self.__mods||[]).push('33-settings');

/* ---------- nhóm & ngày lễ ---------- */
PAGES['set/org']={t:'Nhóm & ngày lễ',
  r(){
    const adm=can('admin'),f=F();f.hy??=curYear();
    const hs=(db.company.holidays||[]).filter(d=>d.startsWith(f.hy)).sort(),ys=[...new Set([...(db.company.holidays||[]).map(d=>d.slice(0,4)),curYear(),String(+curYear()+1)])].sort();
    return `<div class="grid g2">
    ${card('Nhóm',`<form data-submit="depts"><label class="f"><span>Mỗi dòng một nhóm</span><textarea class="in" name="depts" rows="9" ${adm?'':'readonly'}>${esc((db.company.depts||[]).join('\n'))}</textarea></label><p class="note">Nhóm dùng để lọc Dashboard, báo cáo và gán cho nhân viên. Nhóm đang có nhân viên vẫn hiện ở bộ lọc kể cả khi bị xoá khỏi danh sách này.</p><div class="bar" style="margin:0"><button class="btn primary" ${adm?'':'disabled'}>Lưu nhóm</button></div></form>`)}
    ${card('Ngày nghỉ lễ',`<form data-submit="holidays"><div class="bar"><label class="fl">Năm ${fSel('hy','Năm',ys.map(v=>[v,v]))}</label><span class="muted">${hs.length} ngày</span></div><label class="f"><span>Mỗi dòng một ngày, dạng dd/mm/yyyy</span><textarea class="in" name="days" rows="9" ${adm?'':'readonly'}>${esc(hs.map(fmtDate).join('\n'))}</textarea></label><p class="note">Ngày lễ không được tính là ngày làm việc khi cộng điểm <b>hoàn thành sớm</b> (cùng với Thứ 7, Chủ nhật). Hoàn thành trễ luôn tính đủ ngày lịch. Danh sách ban đầu lấy từ sheet Holiday_VN của file KPI.</p><div class="bar" style="margin:0"><button class="btn primary" ${adm?'':'disabled'}>Lưu ngày lễ năm ${esc(f.hy)}</button></div></form>`)}
    </div>`;
  }};
SUB.depts=form=>{if(!can('admin'))return toast('Chỉ Admin được sửa.','error');
  const list=[...new Set(fd(form).depts.split('\n').map(s=>s.trim()).filter(Boolean))];
  if(transact(()=>{db.company.depts=list})){rerender();toast('Đã lưu nhóm')}};
SUB.holidays=form=>{if(!can('admin'))return toast('Chỉ Admin được sửa.','error');
  const y=F().hy||curYear(),days=[],bad=[];
  fd(form).days.split('\n').map(s=>s.trim()).filter(Boolean).forEach(s=>{const m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/),iso=m?`${m[3]}-${pad(m[2])}-${pad(m[1])}`:'';
    if(!m||isNaN(Date.parse(iso))||iso.slice(0,4)!==y)bad.push(s);else days.push(iso)});
  if(bad.length)return toast(`Không đọc được hoặc sai năm ${y}: ${bad.slice(0,3).join(', ')}. Dùng dạng dd/mm/${y}.`,'error');
  if(transact(()=>{db.company.holidays=[...(db.company.holidays||[]).filter(d=>!d.startsWith(y)),...new Set(days)].sort()})){rerender();toast(`Đã lưu ${days.length} ngày lễ năm ${y}`)}};

/* ---------- quy chế KPI ---------- */
PAGES['help/rules']={t:'Quy chế KPI',
  r(){return `<div class="grid g2">
    ${card('Cách tính điểm',miniTable(['Mục','Quy tắc'],[
      ['Trọng số',`Nhân viên tự chấm cho từng việc theo thang <b>${W_MIN}–${W_MAX}</b> (số nguyên). Tổng trọng số chuẩn của một tháng là 100.`],
      ['Số ngày trễ','So Ngày hoàn thành với Deadline. Hoàn thành <b>trễ</b>: tính đủ ngày lịch (kể cả Chủ nhật, lễ). Hoàn thành <b>sớm</b>: chỉ tính ngày làm việc (bỏ Thứ 7, Chủ nhật, ngày lễ).'],
      ['Điểm cơ bản',`100 điểm, trễ 1 ngày trừ ${LATE_PENALTY} điểm, không thấp hơn 0.`],
      ['Điểm thưởng (tự động)',`Sớm 1 ngày làm việc cộng ${BONUS_PER_DAY} điểm, tối đa ${BONUS_CAP}. Tính tự động, không nhập tay.`],
      ['Điểm thành phần','(Điểm cơ bản × Trọng số + Điểm thưởng) / 100. Đây là điểm KPI của từng việc.'],
      ['Quản lý duyệt','<b>Duyệt</b>: điểm thành phần được tính vào KPI. <b>Re-check</b>: không tính điểm, dòng việc báo đỏ; nhân viên sửa lại thì việc quay về Chờ duyệt. <b>Chờ duyệt</b>: chưa tính điểm.'],
      ['KPI tháng',`Tổng điểm thành phần của các việc <b>đã Duyệt</b>, khống chế từ 0 đến ${KPI_CAP}.`],
      ['KPI quý, năm','Trung bình các tháng <b>đã có điểm</b>. Tháng chưa có điểm không bị tính là 0.']
    ].map(r=>`<tr><td style="white-space:nowrap"><b>${r[0]}</b></td><td>${r[1]}</td></tr>`)))}
    ${card('Xếp loại',miniTable(['Xếp loại','KPI'],[[gradeBd(125),'từ 120 trở lên'],[gradeBd(105),'100 – dưới 120'],[gradeBd(85),'80 – dưới 100'],[gradeBd(10),'dưới 80']].map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`))+
      `<h4 style="margin:16px 0 8px">Chuyển việc sang tháng sau</h4><p class="note" style="padding-top:0">Một việc chỉ được chuyển khi <b>chưa hoàn thành</b> và cột Ghi chú / Link bằng chứng có chữ <b>delays</b>. Nút chuyển nằm trong hộp <b>Sửa việc</b>. Khi chuyển, quản lý chọn giữ deadline gốc (tiếp tục tính ngày trễ) hoặc dời deadline. Tháng cũ giữ lại dòng “Đã chuyển”, không tính trọng số và điểm.</p>
      <h4 style="margin:16px 0 8px">Quy trình</h4><p class="note" style="padding-top:0">Chu kỳ hàng tháng. Nhân viên nhập việc, tự chấm trọng số và ghi Ngày hoàn thành kèm bằng chứng, chậm nhất trong tuần đầu tháng sau. Quản lý phản hồi Duyệt hoặc Re-check; điểm chỉ được tính vào KPI khi quản lý chọn Duyệt. Deadline chỉ điều chỉnh khi quản lý phê duyệt trước hạn hoặc bất khả kháng. KPI công khai.</p>`)}
    </div>`}};

/* ---------- người dùng / phân quyền ---------- */
PAGES['set/users']={t:'User / Permission',
  r(){
    const adm=can('admin');
    return `<div class="bar"><div class="sp"></div>${adm?'<button class="btn acc" data-act="user-new">＋ Thêm người dùng</button>':''}</div>`+
    table([{h:CLOUD?'Email':'Tên đăng nhập',f:u=>`<b>${esc(u.username)}</b>`},{h:'Họ tên',f:u=>esc(u.name)},{h:'Vai trò',f:u=>badge(u.role==='admin'?'bad':u.role==='member'?'info':'ok',ROLES[u.role]||'Chưa cấp quyền')},{h:'Gắn với nhân viên',f:u=>u.empId&&empOf(u.empId)?empLink(empOf(u.empId)):u.role==='staff'?'<span class="tag-bad">Chưa gắn</span>':'<span class="muted">—</span>'},{h:'Trạng thái',f:u=>u.active?badge('ok','Đang hoạt động'):badge('mute','Đã khoá')},actCol(u=>adm?`<button class="btn sm" data-act="user-edit" data-id="${u.id}">Sửa</button>${CLOUD?` <button class="btn sm" data-act="user-reset" data-id="${u.id}" title="Gửi email đặt lại mật khẩu">Đặt lại MK</button>`:(u.id!==session.id?` <button class="btn sm danger" data-act="user-del" data-id="${u.id}">Xoá</button>`:'')}`:'')],db.users)+
    card('Phân quyền theo vai trò',miniTable(['Chức năng','Admin','Quản lý','Nhân viên'],[['Xem dashboard, công việc, báo cáo','✔ tất cả','✔ tất cả','Chỉ của chính mình'],['Xem danh sách nhân viên, xếp hạng, theo nhóm','✔','✔','—'],['Thêm / sửa việc, chuyển việc “delays”','✔ mọi người','✔ mọi người','Việc của mình (chưa được duyệt Đạt)'],['Duyệt, nhận xét, điểm thưởng nhập tay, dời deadline khi chuyển việc','✔','✔','—'],['Thêm / sửa / xoá nhân viên, nhập Excel KPI','✔','—','—'],['Settings: nhóm, ngày lễ, người dùng, sao lưu / khôi phục','✔','—','—']].map(r=>`<tr><td>${r[0]}</td><td class="c">${r[1]}</td><td class="c">${r[2]}</td><td class="c">${r[3]}</td></tr>`))+(CLOUD?'<p class="note">Chế độ Firebase: quyền được kiểm tra ở máy chủ bằng Firestore Security Rules (file firestore.rules).</p>':'<p class="note">Chế độ cục bộ: phân quyền chỉ giúp hạn chế thao tác nhầm trên máy này. Trên máy này mọi dữ liệu vẫn nằm chung trong trình duyệt. Muốn mỗi nhân viên thật sự chỉ đọc được việc của mình và cả phòng dùng chung dữ liệu, hãy bật Firebase.</p>'));
  }};
function userForm(id){
  const u=id?by(db.users,id):{username:'',name:'',role:'staff',active:true,empId:''},isAdm=u.role==='admin';
  modal(id?'Sửa người dùng':'Thêm người dùng',`<form id="mf" data-submit="user-save" data-id="${id||''}"><div class="fg">${CLOUD?inp('username','Email đăng nhập',u.username,{req:1,type:'email',attrs:id?'readonly':''}):inp('username','Tên đăng nhập',u.username,{req:1})}${inp('name','Họ tên',u.name,{req:1})}${isAdm?sel('role','Vai trò',[['admin','Admin']],'admin',{attrs:'disabled'}):sel('role','Vai trò',[['member','Quản lý'],['staff','Nhân viên']],u.role)}${sel('empId',isAdm?'Gắn với nhân viên (Admin cũng là một nhân viên)':'Gắn với nhân viên (bắt buộc với vai trò Nhân viên)',empOpts(),u.empId||'',{blank:'— Không gắn —'})}${CLOUD?(id?'':inp('password','Mật khẩu ban đầu (tối thiểu 6 ký tự)','',{type:'password',req:1,attrs:'minlength="6" autocomplete="new-password"'})):inp('password',id?'Mật khẩu mới (để trống nếu không đổi)':'Mật khẩu (tối thiểu 6 ký tự)','',{type:'password',req:!id,attrs:'minlength="6" autocomplete="new-password"'})}${chk('active','Cho phép đăng nhập',u.active)}</div></form>`,{footer:cancelBtn+`<button class="btn primary" form="mf">Lưu</button>`});
}
ACT['user-new']=()=>userForm();ACT['user-edit']=el=>userForm(el.dataset.id);
SUB['user-save']=form=>{
  if(CLOUD)return cloudUserSave(form);
  const d=fd(form),id=form.dataset.id,un=d.username.trim();
  if(db.users.some(x=>x.id!==id&&x.username.toLowerCase()===un.toLowerCase()))return toast('Tên đăng nhập đã tồn tại.','error');
  const ok=transact(()=>{
    let u=id?by(db.users,id):null;if(!u){u={id:uid('u'),role:''};db.users.push(u)}
    const role=u.role==='admin'?'admin':(d.role==='member'?'member':'staff');   /* chỉ có một Admin; không nâng người khác lên Admin */
    if(role==='staff'&&!d.empId)throw new Error('Vai trò Nhân viên phải được gắn với một nhân viên để biết họ được xem việc của ai.');
    Object.assign(u,{username:un,name:d.name.trim(),role,empId:d.empId||'',active:!!d.active});if(d.password)u.pass=pw(d.password);
    if(!db.users.some(x=>x.role==='admin'&&x.active))throw new Error('Phải còn ít nhất một Admin đang hoạt động.');
    if(u.id===session.id){if(!u.active)throw new Error('Không thể tự khoá tài khoản đang đăng nhập.');session.role=u.role;session.name=u.name;session.empId=u.empId||''}
  });
  if(ok){closeModal();shell();render(true);toast('Đã lưu')}
};
ACT['user-del']=el=>{const id=el.dataset.id;if(id===session.id)return;if(confirm('Xoá người dùng này?'))transact(()=>{db.users=db.users.filter(u=>u.id!==id);if(!db.users.some(x=>x.role==='admin'&&x.active))throw new Error('Phải còn ít nhất một Admin đang hoạt động.')})&&done('Đã xoá')};

/* ---------- hệ thống / sao lưu ---------- */
PAGES['set/system']={t:'Sao lưu & Hệ thống',
  r(){
    const adm=can('admin'),kb=Math.round(JSON.stringify(db).length/1024);
    const mode=CLOUD?card('Dữ liệu dùng chung (Firebase)',`<p class="note">Đang đồng bộ theo thời gian thực với dự án <b>${esc(FBCFG.projectId)}</b>. Đăng nhập bằng: <b>${esc(session.username)}</b>. Mọi thay đổi được lưu lên Firestore và hiện ngay cho những người đang mở app.</p>${FIREBASE_CONFIG?'':'<div class="bar"><button class="btn" data-act="fb-disconnect">Ngắt kết nối Firebase (về chế độ cục bộ)</button></div>'}`):card('Dữ liệu dùng chung',`<p class="note">Hiện dữ liệu chỉ lưu trong trình duyệt này. Kết nối Firebase để cả phòng cùng dùng một dữ liệu, có đăng nhập và phân quyền ở máy chủ.</p><div class="bar"><button class="btn acc" data-act="fb-config">Kết nối Firebase</button></div>`);
    return mode+`<div class="grid g2">
    ${card('Thông tin chung',`<form data-submit="company"><div class="fg">${inp('name','Tên đơn vị',db.company.name,{full:1,req:1})}${inp('note','Ghi chú (hiện trên báo cáo và phiếu in)',db.company.note||'',{full:1})}<div class="f full" style="justify-content:flex-end"><button class="btn primary" ${adm?'':'disabled'}>Lưu thông tin</button></div></div></form>`)}
    ${card('Sao lưu ra file (JSON)',`<p class="note">${CLOUD?`Dữ liệu nằm trên Firebase (~${kb} KB đang tải về máy). Vẫn nên <b>xuất file sao lưu định kỳ</b>. Khôi phục từ file sẽ thay thế dữ liệu của <b>tất cả mọi người</b>.`:`Dữ liệu được lưu trong trình duyệt này (~${kb} KB). Mỗi trình duyệt / máy có dữ liệu riêng, nên hãy <b>xuất file sao lưu định kỳ</b>.`}</p><div class="bar"><button class="btn primary" data-act="backup">⬇ Xuất sao lưu (JSON)</button><button class="btn" data-act="restore" ${adm?'':'disabled'}>⬆ Khôi phục từ file</button></div>`)}
    </div>
    ${typeof cloudBackupCard==='function'?cloudBackupCard():''}
    ${card('Dữ liệu mẫu & làm mới',`<p class="note">“Nạp dữ liệu mẫu” thay toàn bộ nhân viên và bảng KPI bằng bộ dữ liệu demo với tên người giả (giữ nguyên tài khoản người dùng). “Xoá toàn bộ” đưa hệ thống về trạng thái trống.</p><div class="bar"><button class="btn" data-act="sample" ${adm?'':'disabled'}>Nạp dữ liệu mẫu</button><button class="btn danger" data-act="wipe" ${adm?'':'disabled'}>Xoá toàn bộ dữ liệu</button></div>`)}
    ${card('Tổng số bản ghi',miniTable(['Nhóm','Số lượng'],[['Nhân viên',db.employees.length],['Bảng KPI (nhân viên × năm)',db.sheets.length],['Công việc',taskCount()],['Nhóm',(db.company.depts||[]).length],['Ngày lễ',(db.company.holidays||[]).length],['Người dùng',db.users.length]].map(([a,b])=>`<tr><td>${a}</td><td class="num">${b}</td></tr>`)))}`;
  }};
SUB.company=form=>{if(!can('admin'))return toast('Chỉ Admin được sửa.','error');const d=fd(form);db.company={...db.company,name:d.name.trim(),note:(d.note||'').trim()};save();shell();render(true);toast('Đã lưu')};
ACT.backup=()=>{const b=new Blob([JSON.stringify(db,null,1)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`sao-luu-kpi-hcm_${todayStr()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)};
ACT.restore=()=>{
  const i=document.createElement('input');i.type='file';i.accept='.json,application/json';
  i.onchange=()=>{const f=i.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{
    const p=JSON.parse(rd.result);if(!Array.isArray(p.employees)||!Array.isArray(p.sheets)||!Array.isArray(p.users))throw new Error('File không đúng định dạng sao lưu của ứng dụng.');
    if(!confirm('Khôi phục sẽ thay thế toàn bộ dữ liệu hiện tại. Tiếp tục?'))return;
    if(CLOUD)p.users=db.users;db=p;migrate();save();if(!db.users.some(u=>u.id===session.id&&u.active)){ACT.logout();toast('Đã khôi phục. Vui lòng đăng nhập lại.');return}
    shell();render(false);toast('Đã khôi phục dữ liệu');
  }catch(e){toast(e.message,'error')}};rd.readAsText(f)};i.click();
};
ACT.wipe=()=>{if(!confirm('Xoá TOÀN BỘ nhân viên, bảng KPI và công việc?'+(CLOUD?' Việc này ảnh hưởng tới TẤT CẢ người dùng.':'')+' Không thể hoàn tác. Hãy xuất sao lưu trước.'))return;const u=db.users,c=db.company;db=defaultDB();db.users=u;db.company=c;migrate();save();render(true);toast('Đã xoá dữ liệu')};
ACT.sample=()=>{if((db.employees.length||db.sheets.length)&&!confirm('Dữ liệu hiện tại sẽ bị thay thế bằng dữ liệu mẫu'+(CLOUD?' (cho TẤT CẢ người dùng)':'')+'. Tiếp tục?'))return;loadSample();render(true)};
