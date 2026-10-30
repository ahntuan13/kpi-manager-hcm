/* tests/kpi.test.js – kiểm tra Chỉ tiêu KPI (Khung 2): nhãn, id, gom nhóm, nhập lại danh mục, đọc sheet Excel, chuyển việc giữ chỉ tiêu.
   Chạy: node --test tests/kpi.test.js   (Node 22, không cần cài gì) */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
/* nạp các file js/ của app vào một vm, giả lập phần trình duyệt mà các file này cần lúc nạp */
const ctx=vm.createContext({FIREBASE_CONFIG:null,localStorage:{getItem:()=>null,setItem(){}},self:{},ACT:{},SUB:{},console,document:{addEventListener(){},querySelector:()=>null},CLOUD:false});
for(const f of['01-core-utils.js','02-data-model.js','03-kri.js','23-import.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',f),'utf8'),ctx,{filename:f});
const run=code=>{const v=vm.runInContext(code,ctx);return v&&typeof v==='object'?JSON.parse(JSON.stringify(v)):v};   /* đưa kết quả về realm của test để so sánh deepEqual */
run('db=defaultDB()');
/* sheet giả theo kiểu SheetJS: {A10:'I', G11:0.1, …} → {A10:{v:'I'}, …} */
const ws=cells=>Object.fromEntries(Object.entries(cells).map(([k,v])=>[k,{v}]));
const r2t=v=>Math.round(v*100)/100;
const task=(id,w,kpi,extra={})=>({id,title:id,weight:w,deadline:'2026-10-10',submitted:'2026-10-10',approval:'Duyệt',note:'',...(kpi?{kpi}:{}),...extra});

test('kpiLabel: dòng đầu, bỏ nháy / gạch / số thứ tự của ô Excel',()=>{
  ctx.T=["'Tính lương ",'- Làm ngoài giờ',' 2.  Điều phối xe nhà\' ','1.  Đáp ứng đúng yêu cầu dịch vụ hành chánh:\n   - Namecard','Enhancement CPL with OHSAS 45000 and ISO 14001\n - Đánh giá chất lượng tài xế','x'.repeat(120)];
  assert.deepEqual(run('T.map(kpiLabel)'),['Tính lương','Làm ngoài giờ','Điều phối xe nhà','Đáp ứng đúng yêu cầu dịch vụ hành chánh','Enhancement CPL with OHSAS 45000 and ISO 14001','x'.repeat(89)+'…']);
});

test('kpiId: cố định theo nội dung, bỏ qua khác biệt khoảng trắng / xuống dòng, trùng thì thêm -2',()=>{
  assert.equal(run("kpiId('Các phòng họp,khu vực office')"),run("kpiId('  các phòng họp,khu vực\\noffice ')"));
  assert.match(run("kpiId('A')"),/^k[0-9a-z]+$/);
  assert.equal(run("(()=>{const t=new Set([kpiId('A')]);return kpiId('A',t)})()"),run("kpiId('A')")+'-2');
});

/* danh mục kiểu sheet Tuyen: 1 = một dòng có trọng số; 3 = nhóm tiêu đề có 2 chỉ tiêu con */
const KPI={sec:'KPI Công ty và hoạt động của phòng (KRI)',rows:[{id:'a',no:'1',text:'Corporate compliance',w:10},{id:'b',no:'3',text:'Vệ sinh văn phòng',w:null},{id:'c',no:'',text:'Các phòng họp',w:40},{id:'d',no:'',text:'Rác thải ESG',w:10}]};
test('kpiGroups: thứ tự giống Excel, tổng mục I bằng tổng Khung 2, việc lạ / chưa gắn vào Chưa phân loại',()=>{
  ctx.K=KPI;ctx.TS=[task('t1',9,'a'),task('t2',10,'c'),task('t3',6,'c',{approval:''}),task('t4',1,''),task('t5',2,'zzz'),task('t6',5,'c',{submitted:null,movedTo:{year:2026,month:'11',id:'x'}})];
  const g=run("kpiGroups(K,TS.map(t=>({t,sc:scoreTask(t,'2026-10-31')})))");
  assert.deepEqual(g.map(x=>x.lv==='task'?x.r.t.id:x.lv),['sec','cat','t1','cat','line','t2','t3','t6','line','none','t4','t5']);
  const sec=g[0];assert.deepEqual([sec.wUsed,sec.wStd,sec.pts],[28,60,22]);   /* 9+10+6+1+2 (t6 đã chuyển không tính) · 10+40+10 · việc đã Duyệt 9+10+1+2 */
  const c=g[4];assert.deepEqual([c.row.id,c.wUsed,c.wStd,c.pts],['c',16,40,10]);
  assert.deepEqual([g[3].wStd,g[3].wUsed],[50,16]);   /* nhóm 3 = tổng 2 chỉ tiêu con */
  assert.deepEqual(g.filter(x=>x.lv==='task').map(x=>x.r.i),[0,1,2,3,4,5]);   /* đánh số theo thứ tự trên màn hình */
  assert.equal(run("kpiGroups(K,[]).some(x=>x.lv==='none')"),false);
});

test('kpiMerge: file là chuẩn, giữ id khi trùng nội dung, báo dòng bị bỏ',()=>{
  ctx.OLD={rows:[{id:'k_old',no:'1',text:'Corporate  compliance',w:10},{id:'k_gone',no:'',text:'Chỉ tiêu cũ',w:5},{id:'k_h',no:'2',text:'Tiêu đề',w:null}]};
  ctx.NEW=[{id:'kx',no:'1',text:'corporate compliance',w:10},{id:'ky',no:'',text:'Chỉ tiêu mới',w:5}];
  const m=run('kpiMerge(OLD,NEW)');
  assert.deepEqual(m.rows.map(r=>r.id),['k_old','ky']);
  assert.deepEqual(m.dropped.map(r=>r.id),['k_gone']);   /* dòng tiêu đề bị bỏ không có việc nên không báo */
  assert.deepEqual(run('kpiMerge(null,NEW)').rows.map(r=>r.id),['kx','ky']);
});

test('kpiUse + moveTasks: đếm việc theo tháng; chuyển sang tháng sau giữ chỉ tiêu',()=>{
  run(`db=defaultDB();db.employees.push({id:'e1',code:'S1',name:'A',active:true});const s=sheetOf('e1',2026,true);
    s.months['10'].tasks.push({id:'m1',title:'x',weight:3,deadline:'2026-10-30',submitted:null,approval:'',note:'',kpi:'c'},{id:'m2',title:'y',weight:2,deadline:'2026-10-30',submitted:null,approval:'',note:'',kpi:'d'});
    s.months['11'].tasks.push({id:'m3',title:'z',weight:2,deadline:'2026-11-30',submitted:null,approval:'',note:'',kpi:'c'})`);
  assert.deepEqual(run("kpiUse('e1',2026,id=>id==='c')"),{n:2,by:'T10: 1, T11: 1'});
  assert.ok(run("moveTasks('e1',2026,'10',['m1'],null)"));
  assert.equal(run("sheetOf('e1',2026).months['11'].tasks.find(t=>t.carriedFrom&&t.carriedFrom.id==='m1').kpi"),'c');
});

test('parseKpiCatalog: đọc mục I các sheet Individual KPIs (Tuyen, Chau, An), bỏ sheet khác',()=>{
  const head={A1:'PERFORMANCE RATINGS / BIỂU ĐÁNH GIÁ KẾT QUẢ CÔNG VIỆC \nNăm 2026',A10:'I',B10:0.8,C10:'KPI Công ty và hoạt động của phòng (KRI)'};
  const tuyen=ws({...head,C3:'CHAU THI MONG TUYEN',F4:'S22501',A11:1,C11:'Corporate compliance : violation case',G11:0.1,H11:' - Tối đa 100%.',A12:2,C12:'Enhancement CPL with OHSAS 45000 and ISO 14001\n - Thuốc luôn sẵn có',G12:0.1,
    A13:3,C13:'Vệ sinh văn phòng - Mức độ sạch sẽ và gọn gàng của văn phòng',C14:'Các phòng họp,khu vực office, kho  luôn được giữ sạch sẽ',G14:0.4,C15:' Cập nhật rác thải, nhựa & giấy phục vụ ESG report',G15:0.1,A16:4,C16:'- Làm ngoài giờ',C17:'Số giờ làm thêm trong tháng không vượt quá 10 giờ',G17:0.1,
    A18:'II',C18:'Thái độ công việc & Tuân thủ nội quy và quy định',G18:0.2,C19:'Working time',G19:0.1});
  const chau=ws({...head,C3:'Dang Thi Huyen Chau',F4:'S20506',A11:1,C11:'Corporate compliance : violation case',G11:0.1,A12:2,C13:'Learning & Development',C14:'Tỷ lệ giữ chân nhân viên chủ chốt',G14:0.4,A15:3,C15:"'Tính lương ",C16:'Thanh toán lương đúng tiến độ',G16:0.1,A17:4,C17:'Báo cáo OT & AL hàng tháng',C18:'Monthly OT & Off day Monitoring',G18:0.2,A19:'II'});
  const an=ws({...head,C3:'Nguyen Thi Tan An',A11:1,C11:'Corporate compliance',G11:0.1,A12:2,C12:'Tuyển dụng',C13:'a',G13:0.2,C14:'b',G14:0.2,C15:'c',G15:0.2,C16:'Chứng chỉ hành nghề',G16:0.05,A17:3,C17:'- Làm ngoài giờ',C18:'OT',G18:0.1,A19:'II'});
  ctx.WB={SheetNames:['KPI RESULT','Individual KPIs -Tuyen ','Individual KPIs-Chau ','Individual KPIs-An '],Sheets:{'KPI RESULT':ws({A10:'I'}),'Individual KPIs -Tuyen ':tuyen,'Individual KPIs-Chau ':chau,'Individual KPIs-An ':an}};
  const [t,c,a]=run('parseKpiCatalog(WB)');
  assert.deepEqual([t.sheet,t.code,t.name,t.year,t.sec,t.secW],['Individual KPIs -Tuyen','S22501','CHAU THI MONG TUYEN',2026,'KPI Công ty và hoạt động của phòng (KRI)',80]);
  assert.deepEqual(t.rows.map(r=>[r.no,r.w]),[['1',10],['2',10],['3',null],['',40],['',10],['4',null],['',10]]);   /* dừng ở mục II */
  assert.equal(t.rows[0].rule,'- Tối đa 100%.');
  assert.equal(t.rows[3].id,run("kpiId('Các phòng họp,khu vực office, kho luôn được giữ sạch sẽ')"));
  assert.deepEqual(c.rows.map(r=>[r.no,r.text,r.w]).slice(0,4),[['1','Corporate compliance : violation case',10],['2','Learning & Development',null],['','Tỷ lệ giữ chân nhân viên chủ chốt',40],['3',"'Tính lương",null]]);
  assert.equal(a.code,'');   /* sheet không có Mã NV → màn hình nhập báo "Sheet không có Mã NV (ô F4)" */
  assert.equal(a.rows.filter(r=>r.w!=null).reduce((s,r)=>s+r.w,0),85);   /* sheet An cộng ra 85 (Excel tự trừ G16): nhập nguyên, màn hình báo khác chuẩn 80 */
});

test('Nhập Excel việc tháng (ghi đè bảng KPI) vẫn giữ danh mục chỉ tiêu KPI',()=>{
  Object.assign(ctx,{document:{querySelector:()=>null},toast(){},closeModal(){},rerender(){},render(){},ui:{f:{}},location:{hash:''}});   /* phần giao diện mà SUB['imp-save'] gọi tới */
  run(`db=defaultDB();session={role:'admin'};db.employees.push({id:'e9',code:'S9',name:'B',active:true});sheetOf('e9',2026,true).kpi={sec:'I',rows:[{id:'k1',no:'1',text:'A',w:10}]};
    IMP={items:[{file:'f.xlsx',d:{code:'S9',name:'B',year:2026,months:emptyMonths(),total:0}}]};SUB['imp-save']()`);
  assert.equal(run("sheetOf('e9',2026).source"),'Excel');   /* bảng đã được ghi lại từ file */
  assert.deepEqual(run("(sheetOf('e9',2026).kpi||{rows:[]}).rows.map(r=>r.id)"),['k1']);
});

test('Nhập danh mục chỉ tiêu: ghi theo file, giữ id cũ khi trùng nội dung, bỏ dòng file không còn, bỏ qua sheet chưa chọn nhân viên',()=>{
  Object.assign(ctx,{done(){},closeModal(){},toast(){},rerender(){}});
  run(`db=defaultDB();session={role:'member'};db.employees.push({id:'e7',code:'S7',name:'C',active:true});sheetOf('e7',2026,true).kpi={sec:'I',rows:[{id:'k_cu',no:'1',text:'Corporate compliance',w:10},{id:'k_bo',no:'',text:'Chỉ tiêu cũ',w:5}]};
    IMP={kc:1,items:[{sheet:'S',code:'S7',name:'C',year:2026,sec:'KPI',rows:[{id:'k_new1',no:'1',text:'corporate  compliance',w:10},{id:'k_new2',no:'',text:'Mới',w:70}],months:{},eid:'e7',on:true,cat:true,from:'',to:'',del:false,i:0},{sheet:'X',code:'S0',name:'Z',year:2026,sec:'',rows:[],months:{},eid:'',on:true,cat:true,i:1}]};SUB['kc-imp-save']()`);
  assert.deepEqual(run("sheetOf('e7',2026).kpi.rows.map(r=>r.id)"),['k_cu','k_new2']);
  assert.equal(run("sheetOf('e7',2026).kpi.sec"),'KPI');
  assert.equal(run("db.sheets.length"),1);   /* người không khớp Mã NV không tạo bảng */
});

test('kpiSel: dòng trống đầu được chọn khi chưa gắn / chỉ tiêu lạ; nhóm tiêu đề là optgroup; chữ từ Excel được escape',()=>{
  ctx.L={};Object.assign(ctx,{PAGES:{},document:{addEventListener:(t,f)=>(ctx.L[t]=ctx.L[t]||[]).push(f),querySelector:()=>null}});   /* giữ các listener của 21-employees để test 12 gọi */
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js','21-employees.js'),'utf8'),ctx,{filename:'21-employees.js'});
  ctx.K2={rows:[{id:'a',no:'1',text:'Solo',w:10},{id:'b',no:'3',text:'<img src=x onerror=alert(1)>',w:null},{id:'c',no:'',text:'Con "1" a',w:40}]};
  const h=run("kpiSel(K2,'zzz','required')");
  assert.match(h,/^<select class="in" name="kpi" required><option value="" selected>— Chọn mục Work B —<\/option>/);
  assert.match(h,/<option value="a" >B\.1 Solo<\/option>/);   /* mã mục Work B */
  assert.match(h,/<optgroup label="B\.2 &lt;img src=x onerror=alert\(1\)&gt;"><option value="c" >B\.2\.1 Con &quot;1&quot; a<\/option><\/optgroup>/);
  assert.ok(!h.includes('<img'));
  assert.match(run("kpiSel(K2,'c')"),/<option value="" >— Chọn mục Work B —<\/option>.*<option value="c" selected>/);
});

test('monthTable Khung 2: có danh mục → dòng I / nhóm / chỉ tiêu / Chưa phân loại, chân bảng thêm 1 cột; không có danh mục → như cũ',()=>{
  /* nạp thêm phần giao diện (bảng, nhãn trạng thái, file bằng chứng) với DOM giả tối thiểu */
  const el=()=>({set innerHTML(v){this._t=String(v).replace(/<[^>]*>/g,'')},get textContent(){return this._t||''}});
  Object.assign(ctx,{window:{addEventListener(){},matchMedia:()=>({matches:false})},document:{addEventListener(){},querySelector:()=>null,createElement:el}});
  for(const f of['10-ui-core.js','20-dashboard.js','22-evidence.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',f),'utf8'),ctx,{filename:f});
  run(`db=defaultDB();session={role:'admin',name:'A'};ui.key='t';db.employees.push({id:'e5',code:'S5',name:'D',active:true});
    sheetOf('e5',2026,true).months['10'].tasks.push({id:'x1',title:'Lau phòng họp',weight:9,deadline:'2026-10-10',submitted:'2026-10-10',approval:'Duyệt',note:'',kpi:'c'},{id:'x2',title:'Việc chưa gắn',weight:1,deadline:'2026-10-11',submitted:'2026-10-11',approval:'',note:''})`);
  const html=()=>run("(()=>{const st=monthStats(sheetOf('e5',2026).months['10'],'2026-10');return monthTable(empOf('e5'),'2026','10',st,{rows:st.rows,kind:'user'})})()");
  const flat=html();
  assert.ok(!flat.includes('kh-sec')&&!flat.includes('data-kpi'));
  assert.ok(flat.includes('<td colspan="2">Work B · By User</td>'));
  run("sheetOf('e5',2026).kpi={sec:'KPI Công ty',rows:[{id:'a',no:'1',text:'Solo',w:10},{id:'b',no:'3',text:'Vệ sinh',w:null},{id:'c',no:'',text:'Các phòng họp',w:40}]}");
  const g=html();
  for(const c of['class="kh kh-sec"','class="kh kh-cat','class="kh kh-line','class="kh kh-none"','class="kt'])assert.ok(g.includes(c),c);   /* nhóm / chỉ tiêu / việc có thêm lớp màu */
  assert.ok(g.includes('<td colspan="3">Work B · By User</td>'));   /* thêm cột Trọng số nhóm */
  assert.match(g,/<select class="in" name="kpi" data-kpi aria-label="Chỉ tiêu KPI cho việc \d+">/);   /* việc chưa gắn có ô chọn … */
  assert.match(g,/data-act="kpi-set" data-e="e5" data-y="2026" data-mm="10" data-id="x2" disabled/);   /* … và nút Gắn (tắt đến khi chọn) */
  assert.ok(!g.includes('data-act="kpi-set" data-e="e5" data-y="2026" data-mm="10" data-id="x1"'));   /* việc đã gắn thì không */
  assert.ok(g.indexOf('Lau phòng họp')>g.indexOf('Các phòng họp')&&g.indexOf('Việc chưa gắn')>g.indexOf('Chưa phân loại'));
});

test('ktSave: chỉ tiêu KPI bắt buộc với việc mới / khi nhân viên lưu; quản lý để trống thì giữ id đang gắn',()=>{
  Object.assign(ctx,{FormData:function(f){return Object.entries(f._data)},notify(){},notifyEmp(){}});   /* fd(form) đọc form giả */
  run(`db=defaultDB();db.employees.push({id:'e6',code:'S6',name:'E',active:true});{const s=sheetOf('e6',2026,true);s.kpi={sec:'I',rows:[{id:'a',no:'1',text:'Solo',w:10}]};
    s.months['10'].tasks.push({id:'old',title:'Việc cũ',weight:3,deadline:'2026-10-05',submitted:'2026-10-05',approval:'',note:'',kpi:'k_mo_coi'})}`);
  ctx.F1={dataset:{e:'e6',y:'2026',mm:'10',id:'',assign:''},_data:{title:'Việc mới',weight:'5',deadline:'2026-10-20',submitted:'',approval:'',note:''}};
  run("session={role:'staff',empId:'e6',name:'E'}");
  assert.equal(run('ktSave(F1)'),null);   /* nhân viên, việc mới, chưa chọn chỉ tiêu → không lưu */
  ctx.F1._data.kpi='a';const r=run('ktSave(F1)');assert.ok(r&&r.id);
  assert.equal(run(`by(sheetOf('e6',2026).months['10'].tasks,'${r.id}').kpi`),'a');
  run("session={role:'admin',name:'A'}");
  ctx.F2={dataset:{e:'e6',y:'2026',mm:'10',id:'old',assign:''},_data:{title:'Việc cũ',weight:'3',deadline:'2026-10-05',submitted:'2026-10-05',approval:'',note:'quản lý ghi',kpi:''}};
  assert.ok(run('ktSave(F2)'));   /* quản lý sửa việc cũ: không bắt buộc chọn */
  assert.equal(run("by(sheetOf('e6',2026).months['10'].tasks,'old').note"),'quản lý ghi');
  assert.equal(run("by(sheetOf('e6',2026).months['10'].tasks,'old').kpi"),'k_mo_coi');   /* id cũ (lạ) không bị xoá, nhập lại danh mục vẫn gắn lại được */
});

test('Gắn chỉ tiêu ngay trên bảng: được cả với việc đã Duyệt chưa gắn, không đổi điểm / duyệt; nhân viên không đổi việc đã Duyệt đã gắn',()=>{
  const fire=(id,val)=>ctx.ACT['kpi-set']({dataset:{e:'e6',y:'2026',mm:'10',id},parentElement:{querySelector:s=>s==='select[data-kpi]'?{value:val}:null}});   /* bấm nút Gắn */
  run(`session={role:'staff',empId:'e6',name:'E'};sheetOf('e6',2026).months['10'].tasks.push({id:'ap',title:'Đã duyệt',weight:4,deadline:'2026-10-06',submitted:'2026-10-06',approval:'Duyệt',note:''})`);
  const p0=run("monthStats(sheetOf('e6',2026).months['10'],'2026-10').p80");
  fire('ap','a');
  assert.equal(run("by(sheetOf('e6',2026).months['10'].tasks,'ap').kpi"),'a');
  assert.equal(run("by(sheetOf('e6',2026).months['10'].tasks,'ap').approval"),'Duyệt');
  assert.equal(run("monthStats(sheetOf('e6',2026).months['10'],'2026-10').p80"),p0);
  run("sheetOf('e6',2026).kpi.rows.push({id:'b',no:'2',text:'Khác',w:5})");fire('ap','b');
  assert.equal(run("by(sheetOf('e6',2026).months['10'].tasks,'ap').kpi"),'a');   /* đã Duyệt + đã có chỉ tiêu: nhân viên không đổi được */
});

test('Bảng sửa danh mục: lưu không đổi gì thì không ghi; chèn dòng giữ id các dòng khác; trọng số sai báo ngay tại ô',()=>{
  const toasts=[];ctx.toast=m=>toasts.push(m);ctx.document.body={classList:{add(){},remove(){}}};
  const mk=(id,no,text,w,rule='')=>{const f={};for(const [k,v] of Object.entries({no,text,w,rule})){const o={value:v,cls:[]};o.classList={add:c=>o.cls.push(c),remove(){}};o.setAttribute=()=>{};o.focus=()=>{};f[k]=o}return{dataset:{id},f,querySelector:s=>f[/name=(\w+)/.exec(s)[1]]}};
  const save=trs=>{ctx.FM={dataset:{e:'e6',y:'2026'},_data:{sec:'I'},querySelectorAll:()=>trs};run("session={role:'member',name:'Q'};globalThis.SUB['kc-save'](FM)")};   /* SUB nơi 21-employees đã đăng ký (test 10 nạp 10-ui-core có const SUB riêng) */
  const ids=()=>run("sheetOf('e6',2026).kpi.rows.map(r=>r.id)");
  save([mk('a','1','Solo','10'),mk('b','2','Khác','5')]);
  assert.equal(toasts.pop(),'Không có thay đổi.');
  save([mk('a','1','Solo','10'),mk('','','Mới\nhai dòng',''),mk('b','2','Khác','5')]);
  assert.deepEqual(ids(),['a',run("kpiId('Mới hai dòng')"),'b']);
  assert.equal(run("sheetOf('e6',2026).kpi.rows[1].text"),'Mới\nhai dòng');   /* giữ xuống dòng */
  const bad=mk('a','1','Solo','150');save([bad]);
  assert.deepEqual(bad.f.w.cls,['bad']);assert.match(toasts.pop(),/phải từ 0 đến 100/);
  assert.equal(ids().length,3);   /* không lưu khi có lỗi */
});

test('Bảng sửa danh mục: trọng số lạ (ghi thẳng vào Firestore) không chèn được HTML; số thì giữ nguyên',()=>{
  const h=run(`kcRowHTML({id:'x',no:'1',text:'a',w:'40" autofocus onfocus="alert(1)',rule:''})`);
  assert.ok(!/onfocus="alert/.test(h)&&!/autofocus/.test(h));
  assert.match(run(`kcRowHTML({id:'x',no:'1',text:'a',w:40})`),/name="w" type="number"[^>]*value="40"/);
  assert.match(run(`kcRowHTML({id:'x',no:'1',text:'a',w:null})`),/name="w" type="number"[^>]*value=""/);
});

test('kpiMerge: hai chỉ tiêu trùng nội dung giữ đúng id khi nhập lại cùng file nhiều lần',()=>{
  ctx.DUP=run(`(()=>{const t=new Set(),r=[{no:'1',text:'Nhóm một',w:null},{no:'',text:'Khác',w:30},{no:'2',text:'Nhóm hai',w:null},{no:'',text:'Khác',w:50}];r.forEach(k=>{k.id=kpiId(k.text,t);t.add(k.id)});return r})()`);
  const m1=run('kpiMerge(null,DUP)'),m2=run('kpiMerge({rows:DUP},DUP)');ctx.M2=m2;const m3=run('kpiMerge({rows:M2.rows},DUP)');
  assert.deepEqual(m2.rows.map(r=>[r.w,r.id]),m1.rows.map(r=>[r.w,r.id]));   /* 30 giữ id của 30, 50 giữ id của 50 */
  assert.deepEqual(m3.rows.map(r=>r.id),m1.rows.map(r=>r.id));
  assert.equal(m2.dropped.length,0);
});

test('Ô chọn chỉ tiêu ở Chưa phân loại: đổi lựa chọn (kể cả bằng phím mũi tên) chưa lưu, chỉ bật nút Gắn; bấm Gắn mới lưu',()=>{
  run(`session={role:'admin',name:'A'};sheetOf('e6',2026).months['10'].tasks.push({id:'kb',title:'Phím',weight:2,deadline:'2026-10-07',submitted:'2026-10-07',approval:'',note:''})`);
  const btn={disabled:true},sel={value:'a',dataset:{e:'e6',y:'2026',mm:'10',id:'kb'},parentElement:{querySelector:s=>s.includes('kpi-set')?btn:null}};
  (ctx.L.change||[]).forEach(f=>f({target:{closest:s=>s==='select[data-kpi]'?sel:null}}));   /* Chrome / Edge trên Windows phát change ngay khi bấm mũi tên */
  assert.equal(run("'kpi' in by(sheetOf('e6',2026).months['10'].tasks,'kb')"),false);   /* chưa lưu */
  assert.equal(btn.disabled,false);   /* nút Gắn bật lên */
  ctx.ACT['kpi-set']({dataset:{e:'e6',y:'2026',mm:'10',id:'kb'},parentElement:{querySelector:s=>s==='select[data-kpi]'?sel:null}});
  assert.equal(run("by(sheetOf('e6',2026).months['10'].tasks,'kb').kpi"),'a');
});

test('Khung 2 có danh mục: quản lý thấy nút Sửa ở mọi dòng mục I / nhóm / tiêu đề / chỉ tiêu; nhân viên không; bảng không danh mục không có',()=>{
  run(`db=defaultDB();db.employees.push({id:'e8',code:'S8',name:'G',active:true});{const s=sheetOf('e8',2026,true);
    s.months['10'].tasks.push({id:'y1',title:'Việc',weight:5,deadline:'2026-10-10',submitted:'2026-10-10',approval:'Duyệt',note:'',kpi:'c'})}`);
  const html=()=>run("(()=>{const st=monthStats(sheetOf('e8',2026).months['10'],'2026-10');return monthTable(empOf('e8'),'2026','10',st,{rows:st.rows,kind:'user'})})()");
  const n=h=>(h.match(/data-act="kc-row"/g)||[]).length;
  run("session={role:'admin',name:'A'}");assert.equal(n(html()),0);   /* chưa có danh mục: bảng phẳng như cũ */
  run("sheetOf('e8',2026).kpi={sec:'KPI',rows:[{id:'a',no:'1',text:'Solo',w:10},{id:'b',no:'3',text:'Vệ sinh',w:null},{id:'h',no:'',text:'Tiêu đề con',w:null},{id:'c',no:'',text:'Các phòng họp',w:40}]}");
  const g=html();assert.equal(n(g),5);   /* I + nhóm 1 + nhóm 3 + tiêu đề + chỉ tiêu */
  for(const id of['','a','b','h','c'])assert.ok(g.includes(`data-act="kc-row" data-e="e8" data-y="2026" data-id="${id}"`),id);
  run("session={role:'staff',empId:'e8',name:'G'}");assert.equal(n(html()),0);
});

test('Sửa một dòng danh mục: chỉ đổi dòng đó, giữ id (việc vẫn gắn); trọng số sai báo tại ô; không đổi gì thì không ghi; năm dùng tạm danh mục năm trước thì chép sang',()=>{
  const toasts=[];ctx.toast=m=>toasts.push(m);ctx.document.body={classList:{add(){},remove(){}}};ctx.document.querySelectorAll=()=>[];   /* trình duyệt thật có; dùng để đưa con trỏ về nút Sửa */
  const fld=()=>{const o={cls:[]};o.classList={add:c=>o.cls.push(c),remove(){}};o.setAttribute=()=>{};o.focus=()=>{};return o};
  const save=(id,data,y='2026')=>{const f={w:fld(),text:fld()};ctx.FR={dataset:{e:'e8',y,id},_data:data,querySelector:s=>f[/name=(\w+)/.exec(s)[1]]};run("session={role:'member',name:'Q'};globalThis.SUB['kc-row-save'](FR)");return f};
  const row=(id,y=2026)=>run(`sheetOf('e8',${y}).kpi.rows.find(r=>r.id==='${id}')`);
  save('c',{no:'',text:'Các phòng họp, kho',w:'35',rule:'Trừ 20% mỗi phàn nàn'});
  assert.deepEqual(row('c'),{id:'c',no:'',text:'Các phòng họp, kho',w:35,rule:'Trừ 20% mỗi phàn nàn'});
  assert.equal(run("kpiHas(kpiOf('e8',2026),sheetOf('e8',2026).months['10'].tasks[0].kpi)"),true);   /* việc vẫn gắn */
  assert.equal(row('a').text,'Solo');   /* dòng khác không đổi */
  const f=save('c',{no:'',text:'Các phòng họp, kho',w:'150',rule:''});
  assert.deepEqual(f.w.cls,['bad']);assert.match(toasts.pop(),/từ 0 đến 100/);assert.equal(row('c').w,35);
  save('c',{no:'',text:'Các phòng họp, kho',w:'35',rule:'Trừ 20% mỗi phàn nàn'});assert.equal(toasts.pop(),'Không có thay đổi.');
  save('',{sec:'KPI Công ty và hoạt động của phòng (KRI)'});assert.equal(run("sheetOf('e8',2026).kpi.sec"),'KPI Công ty và hoạt động của phòng (KRI)');
  /* 2027 chưa có danh mục → dùng tạm 2026; sửa ở 2027 thì 2027 có danh mục riêng, 2026 giữ nguyên */
  save('a',{no:'1',text:'Solo 2027',w:'10',rule:''},'2027');
  assert.equal(row('a',2027).text,'Solo 2027');assert.equal(row('a',2026).text,'Solo');
});

test('Sửa một dòng: ô trọng số trình duyệt không đọc được (badInput) bị báo lỗi, không lặng lẽ biến chỉ tiêu thành dòng tiêu đề; năm dùng tạm danh mục năm trước có ghi chú',()=>{
  const toasts=[];ctx.toast=m=>toasts.push(m);
  const fld=extra=>{const o={cls:[],...extra};o.classList={add:c=>o.cls.push(c),remove(){}};o.setAttribute=()=>{};o.focus=()=>{};return o};
  const f={w:fld({validity:{badInput:true}}),text:fld()};
  ctx.FB={dataset:{e:'e8',y:'2026',id:'a'},_data:{no:'1',text:'Solo',w:'',rule:''},querySelector:s=>f[/name=(\w+)/.exec(s)[1]]};
  run("session={role:'member',name:'Q'};globalThis.SUB['kc-row-save'](FB)");
  assert.deepEqual(f.w.cls,['bad']);assert.match(toasts.pop(),/phải là số/);
  assert.equal(run("sheetOf('e8',2026).kpi.rows.find(r=>r.id==='a').w"),10);   /* vẫn là chỉ tiêu, không thành tiêu đề */
  let body='';ctx.modal=(t,b)=>{body=b};
  ctx.ACT['kc-row']({dataset:{e:'e8',y:'2028',id:'a'}});   /* 2028 chưa có danh mục riêng → dùng tạm 2027 */
  assert.match(body,/Đang dùng tạm danh mục năm 2027/);
  ctx.ACT['kc-row']({dataset:{e:'e8',y:'2026',id:'a'}});assert.ok(!/Đang dùng tạm/.test(body));
});

test('Màu theo cấp: mọi nhóm chính cấp 1, mọi chỉ tiêu con / tiêu đề trong nhóm cấp 2, chỉ tiêu dưới tiêu đề cấp 3; việc không mang màu',()=>{
  ctx.K3={sec:'I',rows:[{id:'a',no:'1',text:'Solo',w:10},{id:'b',no:'2',text:'Nhóm hai',w:null},{id:'c',no:'',text:'Con 1',w:20},{id:'h',no:'',text:'Tiêu đề',w:null},{id:'f',no:'',text:'Con của tiêu đề',w:30},{id:'g',no:'3',text:'Nhóm ba',w:null},{id:'k',no:'',text:'Con 3',w:20}]};
  ctx.T3=[task('p1',5,'a'),task('p2',5,'f'),task('p3',5,'')];
  const g=run("kpiGroups(K3,T3.map(t=>({t,sc:scoreTask(t,'2026-10-31')})))");
  assert.deepEqual(g.filter(x=>['cat','hdr','line'].includes(x.lv)).map(x=>[x.lv,x.d]),[['cat',1],['cat',1],['line',2],['hdr',2],['line',3],['cat',1],['line',2]]);   /* nhóm mới thì quay về cấp 2 */
  assert.ok(g.filter(x=>x.lv==='task').every(x=>x.r.d==null));
});

test('Màu theo cấp trên bảng: lớp kd1 / kd2 / kd3 ở dòng nhóm, chỉ tiêu; việc không có lớp màu; bảng không danh mục không có',()=>{
  run("session={role:'admin',name:'A'}");
  const html=id=>run(`(()=>{const st=monthStats(sheetOf('${id}',2026).months['10'],'2026-10');return monthTable(empOf('${id}'),'2026','10',st,{rows:st.rows,kind:'user'})})()`);
  const g=html('e8');
  assert.match(g,/class="kh kh-cat kd1"/);assert.match(g,/class="kh kh-hdr kd2"/);assert.match(g,/class="kh kh-line kd3"/);   /* e8: nhóm 3 → tiêu đề → chỉ tiêu */
  assert.match(g,/<tr class="kt">/);assert.match(g,/class="kh kh-sec"/);
  run("db.employees.push({id:'e9b',code:'S9B',name:'H',active:true});sheetOf('e9b',2026,true).months['10'].tasks.push({id:'z1',title:'Việc',weight:5,deadline:'2026-10-10',submitted:'2026-10-10',approval:'Duyệt',note:''})");
  assert.ok(!/ kd\d/.test(html('e9b')));   /* không có danh mục: không có lớp màu */
});

/* ---------- Quy ước tính KRI (03-kri.js): công thức kiểu Excel, x = Kết quả tháng ---------- */
test('kxPct: bậc theo số lỗi, trừ dần, tỷ lệ, ô trống như Excel',()=>{
  const P=(f,x)=>run(`kxPct(${JSON.stringify(f)},${JSON.stringify(x)})`);
  const cnt='IF(x=0,100%,IF(x=1,80%,IF(x=2,60%,0)))';
  assert.deepEqual([0,1,2,3,''].map(x=>P(cnt,x)),[1,0.8,0.6,0,1]);   /* để trống = 0 lỗi */
  assert.equal(P('MAX(0, 100% - (x * 10%))',3),0.7);
  const ge='IF(ISBLANK(x),100%,IF(x>=90,110%,IF(x>=85,100%,IF(x>=80,90%,80%))))';
  assert.deepEqual([95,86,81,50,'','-'].map(x=>P(ge,x)),[1.1,1,0.9,0.8,1,1.1]);   /* chữ lớn hơn số như Excel */
  assert.equal(P('IF(x=0,100%,IF(x<8,110%,IF(x<=10,100%,90%)))',7.5),1.1);
  assert.equal(P('IF(x=1,',1),null);   /* công thức lỗi → không có điểm */
});
test('kxFromExcel: ô Kết quả thành x, ô khác thành giá trị',()=>{
  assert.equal(run(`kxFromExcel('IF(I12=0,100%,IF(I12=1,80%,0))','I12')`),'IF(x=0,100%,IF(x=1,80%,0))');
  ctx.V={D16:100};assert.equal(run(`kxFromExcel('AG26/$D$16*100','AG26',r=>V[r])`),'x/100*100');
});
test('monthStats: Khung 1 + KRI + Thưởng, dòng công việc hằng ngày',()=>{
  run(`db.company.kpi2={since:'2026-10'}`);
  ctx.KC={rows:[{id:'a',no:'1',text:'Compliance',w:10,f:'MAX(0,100%-x*10%)',src:'res'},{id:'b',no:'2',text:'L&D',w:40,src:'tasks'},{id:'c',no:'3',text:'Lương',w:30,f:'IF(x=0,100%,IF(x=1,50%,0))',src:'res'}]};
  ctx.M={tasks:[task('t1',5,'b'),task('t2',5,'',{approval:''})],kri:{a:{r:2},c:{r:1}},late:[{id:'l',d:'2026-10-02'}],ga:[{id:'g',d:'2026-10-03'}]};
  const st=run('monthStats(M,"2026-10",KC)');
  /* KRI: 0.8*10 + (0 lỗi → 100%)*40 + 0.5*30 = 8+40+15 = 63; Khung 1: không có việc giao → 10, tuân thủ 10-1 = 9; Thưởng: 1 lần hỗ trợ = 5 */
  assert.equal(st.p80,63);assert.equal(st.p20,19);assert.equal(st.p3,5);assert.equal(st.kpi,87);
  ctx.M.kri.b={x:1};assert.equal(run('monthStats(M,"2026-10",KC)').p80,55);   /* quản lý ghi 1 lỗi → 80%*40 */
  ctx.M.kri.b={x:3};assert.equal(run('monthStats(M,"2026-10",KC)').p80,23);   /* ≥3 lỗi → 0 */
  delete ctx.M.kri.b;ctx.M.tasks=[];assert.equal(run('monthStats(M,"2026-10",KC)').p80,23);   /* mục chưa có việc hoàn thành = 0 điểm */
  /* việc chưa có ngày hoàn thành / Re-check: không tính điểm → mục được phần điểm theo số việc đã tính */
  ctx.M.tasks=[task('t1',5,'b'),task('t2',5,'b',{submitted:null}),task('t3',5,'b',{approval:'Re-check'})];
  assert.equal(run('monthStats(M,"2026-10",KC)').p80,r2t(8+40/3+15));
  ctx.M.tasks=[task('t2',5,'b',{submitted:null})];assert.equal(run('monthStats(M,"2026-10",KC)').p80,23);   /* mục có việc nhưng chưa xong: 0 */
  ctx.M.tasks=[task('t1',5,'b',{submitted:'2026-10-12'})];assert.equal(run('monthStats(M,"2026-10",KC)').p80,55);   /* hoàn thành trễ: tính, 1 lỗi → 80% */
  ctx.M.fixed={total:101,k1:20,k2:81,k3:0};assert.equal(run('monthStats(M,"2026-10",KC)').kpi,101);   /* điểm chốt từ Excel */
});
