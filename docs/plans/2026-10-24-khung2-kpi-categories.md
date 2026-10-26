# Khung 2 grouped by KPI category (Excel style) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make "Khung 2 · Công việc By User" look like Section I of the Excel sheet `Individual KPIs – <name>`: a section row (I · 80%), numbered categories (1, 2, 3…), sub-KPIs with their Excel weights, and the employee's tasks listed under each sub-KPI. Scoring does not change.

**Architecture:** Each person-year KPI sheet (`sheets/{empId}_{year}`) gets an optional `kpi` catalogue whose rows mirror the Excel rows (`no` = category number, `text`, `w` = weight %, `rule`). Each By User task gets an optional `kpi` row id. Row ids are `'k'+hash(normalised text)`, so re-importing the same Excel re-links tasks automatically. A pure function `kpiGroups()` turns the catalogue plus the month's tasks into display rows. `monthTable()` renders those rows only when the person has a catalogue. With no catalogue, every code path produces exactly the HTML it produces today.

**Tech Stack:** Plain browser JS (no build; `js/NN-*.js` load in order from `index.html`), SheetJS 0.18.5 (already loaded from CDN), optional Firebase/Firestore (no rules change), Node 22 `node:test` + `vm` for the unit test.

---

## 0. Ground rules for whoever executes this

1. **Nothing outside this feature may change behaviour** (user requirement). Every new branch is gated on "this person has a KPI catalogue", "this is a Khung 2 / By User row" or "this is an 80/20 month". The non-regression contract in §2 and the before/after HTML comparison in Task 8 enforce this. If the comparison shows a difference that is not explained by data you changed, stop and fix it before you commit.
2. Repo style: dense one-line JS, Vietnamese comments and UI text, no new files except the test, no new dependencies, and no build step.
3. Every edit below is an **exact find → replace**. Each *Find* string occurs exactly once in the file. This was verified against `main` at `fc8583c`. Copy the strings exactly, including whitespace. If a *Find* does not match, the file has changed since this plan was written, so re-read the area before editing.
4. **Never test against the real Firebase project.** `config/firebase-config.js` points at the live `kpi-adhr-hcm` project. All manual testing happens in a local-mode copy (Task 0).
5. Line numbers are approximate (taken from `main`). Search for the *Find* text.

## 1. Decisions (locked with the user, then reviewed by Skeptic, Constraint Guardian and User Advocate, ruled by an Arbiter, and dry-run in a browser)

| # | Decision |
|---|---|
| L1 | Scoring is unchanged (deadline, −3 per day late, early bonus, manager Duyệt). A catalogue changes only how the rows are grouped. |
| L2 | The layout is the existing monthly table with Excel-style rows: `STT \| Trọng số nhóm \| Chỉ tiêu / Nội dung \| Trọng số \| …`. It has a section row I, category rows, sub-KPI rows, task rows, a "Chưa phân loại" bucket and the footer. |
| L3 | The catalogue comes from the Excel file (all `Individual KPIs…` sheets, matched by Mã NV in F4) and can be edited in the app. |
| L4 | The employee picks the sub-KPI in Thêm/Sửa việc. It is required for new tasks and for staff saves. A manager editing an old task is not forced to pick one. |
| D3 | Row id = `'k'+hash(kpiKey(text))` and never changes after the row is created. |
| D4/S5 | A re-import makes the file authoritative for that person-year. Existing ids are reused when the text matches. Unmatched old rows are dropped, and the preview shows how many tasks fall back to "Chưa phân loại". |
| D8 | The section target is always `kpi2().userStd` (80 by default). Nothing hard-codes 80. |
| D9 | Only the section row is coloured when the weights are off. Sub-KPI rows show `tasks' weight · chỉ tiêu 40%` in neutral colour, because the Excel weight is annual and many KPIs are quarterly. |
| D12 | "Chưa phân loại" task rows get an inline KPI select. It is allowed even on approved tasks, because it never changes the score. |
| G3 | `t.kpi` is only written when the submitted value is non-empty and exists in the catalogue. A blank never deletes an id, so orphaned ids can re-link after a re-import. |
| S1 | The existing task-workbook import (`KPI_Individual_report`) carries `sheet.kpi` over when it overwrites a sheet. |
| D21 | No Firestore rules change. Staff can already rewrite their own sheet doc, including `approval`. The catalogue never affects scores, and every string is escaped, so XSS is closed. |
| — | Out of scope: Excel year matrix, turning Khung 1 into Section II, the printed slip (`slipHTML`), per-sub-KPI scoring, sample data. |

### UI design rules (`/design-taste-frontend`, adapted to this app)
The skill targets React, Tailwind and Framer Motion. This app is plain JS with its own CSS themes, and the user's rule is that nothing outside the feature may change. Its own limits say not to override existing product conventions. So:
- **Adopted for the new UI only:**
  - No emoji in the new controls. They use one SVG line icon (`KPI_ICO`, `currentColor`, `aria-hidden`), like the existing `NB_ICON`.
  - Full states: an empty state (the "no catalogue yet" hint and the zero rows that show which KPIs have no tasks), a loading state ("Đang đọc file…" with `role=status`), and inline error states (the bad editor field is red, `aria-invalid`, focused).
  - Motion uses `transform`/`opacity` only, `cubic-bezier(.16,1,.3,1)`, and respects `prefers-reduced-motion`. It runs once, only on the row that just moved.
  - One accent per meaning: Excel peach for the I row, the existing `--warn` for "needs a choice", and the existing `--ok` for "just moved".
  - Keyboard focus is never lost after an inline action.
  - Labels sit above inputs (the existing `.f`).
  - The editor shows the Excel hierarchy with dividers and indentation instead of more boxes.
- **Not adopted, on purpose:**
  - React, Tailwind, Framer Motion and new fonts. Adding a build step or dependencies would change the whole app.
  - Replacing the existing emoji buttons elsewhere (📌, ⬆, 🖨). That is out of scope and would change unrelated UI.
  - Perpetual or looping animations. The table redraws often and its job is data entry.
  - Changing the app's fonts. That is global, and the themes own them.

Facts from the workbook (verified): Section I of all 6 sheets (Nga, Yen, Tuyen, Tuan, Chau, An) sums to 80%, except **An = 85%**. In An's sheet the Excel total itself is `=SUM(G11:G18)-G16`. The import keeps the row as it is and shows "85 / chuẩn 80" in warning colour, and the manager fixes it in the editor. Some category rows carry their own weight (Tuyen #1, #2). Others are headers with sub-rows (Tuyen #3). Chau #2 has an empty number row followed by its title row, and the parser merges the two.

## 2. Non-regression contract (what each touched shared function does when the feature is off)

| Touched code | Behaviour when the person has no catalogue / not By User / not an 80-20 month |
|---|---|
| `scoreTask`, `monthStats`, `yearStats`, reports, dashboard, ranking | **Not edited.** |
| `moveTasks` (02) | Copies `kpi` only `if(t.kpi)`. Tasks without a `kpi` are copied exactly as before. |
| `grpCopy` (02) | Copies `kpi` only if the source task has one that exists in the co-worker's catalogue. Otherwise nothing changes. |
| `monthTable` (21) | `grp=false`, so rows, columns, footer colspans (`c0=2` gives `nVis-9`) and row classes are byte-identical. Proven in the dry run: 88 of 88 snapshots matched. |
| `kpiFrames` (21) | Staff: identical. Managers: one new "Chỉ tiêu KPI" button (SVG list icon) and one hint (the feature's entry point). The tables are identical. |
| `taskForm` / `ktRead` / `ktSave` (21) | The select and the check are only present when a catalogue exists. Otherwise `d.kpi=''` and nothing is written. |
| Task-workbook import (23) | `kpi` is carried over only if the old sheet had it. The new error text appears only when parsing fails **and** the file has `Individual KPIs` sheets. The extra note appears only if a catalogue exists. |
| CSS | Appended selectors only (`tr.kh*`, `tr.kt`, `.kce`, `select[data-kpi]`). No existing rule is changed. |
| Firestore / rules / sync | Unchanged. The new fields are optional. Old clients keep unknown fields because they write back the whole loaded doc. |

---

### Task 0: Branch, local-mode test copy, baseline (BEFORE any code change)

**Files:** none in the repo.

**Step 1: Create the branch** (only when the user says so):
```bash
git switch -c feat/khung2-kpi-categories main
```

**Step 2: Make a local-mode copy outside the repo.** It never talks to Firebase:
```bash
rm -rf ../kpi-local && mkdir ../kpi-local && cp -r index.html css js config ../kpi-local/ && printf '%s\n' 'const ADMIN_EMAIL = "ahntuan13@gmail.com";' 'const FIREBASE_CONFIG = null;' > ../kpi-local/config/firebase-config.js
```
```bash
python -m http.server 8765 --bind 127.0.0.1 --directory ../kpi-local
```
Keep the port fixed at 8765. localStorage is per origin, so the "after" run in Task 8 must use the same address to see the same data.

**Step 3: Load demo data.** Open `http://127.0.0.1:8765`, sign in with the demo account `admin` / `admin123` (from `defaultDB()`), and go to Settings → Sao lưu & Hệ thống → **Nạp dữ liệu mẫu**.

**Step 4: Capture the baseline** in the DevTools console. Paste this and keep it for Task 8:
```js
window.CAP=async()=>{const out={},wait=ms=>new Promise(r=>setTimeout(r,ms));
for(const e of db.employees.filter(x=>x.code.startsWith('MAU'))){for(const mm of ['09','10']){ui.f['emp/'+e.id]={year:'2026',mm};if(location.hash!=='#/emp/'+e.id){location.hash='#/emp/'+e.id;await wait(120)}rerender();await wait(60);
  const k=e.code+'_'+mm,tbl=$('#tbl');out[k+'_k1']=[...tbl.querySelectorAll('.kf20 .tw')].map(x=>x.outerHTML).join('\n');out[k+'_k2']=[...tbl.querySelectorAll('.kf80 .tw')].map(x=>x.outerHTML).join('\n');
  out[k+'_mt']=mm==='09'?[...tbl.querySelectorAll('.mcard .tw')].map(x=>x.outerHTML).join('\n'):'';const t=ui.cur;out[k+'_xls']=JSON.stringify(t.rows.map(r=>t.cols.filter(c=>!c.noexp).map(c=>c.x?c.x(r):strip(c.f(r)))));out[k+'_slip']=slipHTML(e.id,'2026',mm);}
 out[e.code+'_score']=JSON.stringify(empStats(e,'2026').months.map(m=>[m.kpi,m.kpiProv,m.self,m.p80,m.p20,m.weight,m.counted,m.pending]));}return out};
localStorage.setItem('kpi_base',JSON.stringify(await CAP()));Object.keys(JSON.parse(localStorage.getItem('kpi_base'))).length
```
Expected: `88`. This covers Khung 1, Khung 2, the legacy T09 table, the Excel export rows, the printed slip and every month's scores for the 8 sample employees.
**Do not save anything in the app between this step and Task 8, Step 2.** Any manager save runs the existing `relockGroups()`, which flips the joint task's `locked` flag and changes its tooltip in T09 for MAU-02 and MAU-06. That difference comes from the data, not from the code.

---

### Task 1: Unit test + pure helpers in the data model

**Files:**
- Create: `tests/kpi.test.js`
- Modify: `js/02-data-model.js`: insert after `mVal` (~line 166); `moveTasks` (~line 269); `grpCopy` (~line 237)

**Step 1: Write the failing test.** Create `tests/kpi.test.js`:
```js
/* tests/kpi.test.js – kiểm tra Chỉ tiêu KPI (Khung 2): nhãn, id, gom nhóm, nhập lại danh mục, đọc sheet Excel, chuyển việc giữ chỉ tiêu.
   Chạy: node --test tests/kpi.test.js   (Node 22, không cần cài gì) */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
/* nạp các file js/ của app vào một vm, giả lập phần trình duyệt mà các file này cần lúc nạp */
const ctx=vm.createContext({FIREBASE_CONFIG:null,localStorage:{getItem:()=>null,setItem(){}},self:{},ACT:{},SUB:{},console});
for(const f of['01-core-utils.js','02-data-model.js','23-import.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',f),'utf8'),ctx,{filename:f});
const run=code=>{const v=vm.runInContext(code,ctx);return v&&typeof v==='object'?JSON.parse(JSON.stringify(v)):v};   /* đưa kết quả về realm của test để so sánh deepEqual */
run('db=defaultDB()');
/* sheet giả theo kiểu SheetJS: {A10:'I', G11:0.1, …} → {A10:{v:'I'}, …} */
const ws=cells=>Object.fromEntries(Object.entries(cells).map(([k,v])=>[k,{v}]));
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
```

**Step 2: Run it and confirm it fails**
```bash
node --test tests/kpi.test.js
```
Expected: `# pass 0` and `# fail 6` (`kpiLabel is not defined`, and similar).

**Step 3: Add the helper block.** In `js/02-data-model.js`:
*In `js/02-data-model.js`, find this line:*
```js
const mVal=m=>m.kpi??m.kpiProv??null;   /* điểm tháng, kể cả tạm tính */
```
*and insert right after it:*
```js

/* =====================================================================
   CHỈ TIÊU KPI (Khung 2) – danh mục theo mục I của file Excel "Individual KPIs – <tên>"
   - sheet.kpi = {sec, rows:[{id,no,text,w,rule}]} lưu trong bảng KPI (nhân viên × năm).
     Mỗi dòng giống một dòng Excel: no = số nhóm (dòng có no bắt đầu một nhóm), text = cột C,
     w = trọng số chỉ tiêu (cột G × 100; để trống = dòng tiêu đề), rule = Quy ước đánh giá (cột H).
   - task.kpi = id của dòng chỉ tiêu. Chỉ để xếp việc theo nhóm, KHÔNG đổi cách tính điểm.
   - id = 'k' + hash(nội dung đã chuẩn hoá): nhập lại cùng file Excel ra cùng id nên việc tự gắn lại.
   ===================================================================== */
const kpiTrim=s=>String(s??'').replace(/^[\s'"‘’“”\-–—•·]+|[\s'"‘’“”:]+$/g,'');
const kpiKey=s=>norm(kpiTrim(s));
/* nhãn gọn: dòng đầu, bỏ dấu nháy / gạch đầu dòng / số thứ tự riêng của ô Excel, tối đa 90 ký tự */
function kpiLabel(s){const l=String(s??'').split('\n').map(kpiTrim).find(Boolean)||'',t=kpiTrim(l.replace(/^\d+\s*[.)]\s*/,'')).replace(/\s+/g,' ');return t.length>90?t.slice(0,89)+'…':t}
/* id cố định theo nội dung; trùng nội dung trong cùng danh mục thì thêm -2, -3 */
const kpiId=(text,taken)=>{const b='k'+hash(kpiKey(text));let id=b,n=1;while(taken&&taken.has(id))id=`${b}-${++n}`;return id};
/* danh mục của nhân viên trong năm; năm chưa có thì dùng tạm danh mục năm trước (chỉ đọc, không tự chép) */
const kpiOf=(empId,y)=>{const a=sheetOf(empId,y),b=sheetOf(empId,+y-1);return(a&&a.kpi)||(b&&b.kpi)||null};
const kpiRows=k=>((k&&k.rows)||[]).filter(r=>r.w!=null);   /* các dòng gắn việc được */
const kpiHas=(k,id)=>!!id&&kpiRows(k).some(r=>r.id===id);
/* đếm việc (chưa chuyển tháng) trong năm có chỉ tiêu thoả hit(id) → {n, by:'T10: 5, T11: 2'}; báo trước khi xoá / nhập lại danh mục */
function kpiUse(empId,y,hit){const sh=sheetOf(empId,y),m={};let n=0;
  if(sh)MM.forEach(mm=>((sh.months[mm]&&sh.months[mm].tasks)||[]).forEach(t=>{if(t.kpi&&!t.movedTo&&hit(t.kpi)){n++;m[mm]=(m[mm]||0)+1}}));
  return{n,by:Object.entries(m).map(([k,c])=>`T${k}: ${c}`).join(', ')}}
/* Nhập lại danh mục: file là chuẩn. Dòng trùng nội dung với dòng đang có giữ id cũ để việc vẫn gắn đúng;
   dòng đang có mà file không còn thì bị bỏ (dropped) – các việc gắn với nó về "Chưa phân loại". */
function kpiMerge(old,rows){const o=(old&&old.rows)||[],byKey=new Map(o.map(r=>[kpiKey(r.text),r.id])),taken=new Set();
  const out=rows.map(r=>{let id=byKey.get(kpiKey(r.text))||r.id;if(taken.has(id))id=kpiId(r.text,taken);taken.add(id);return{...r,id}}),keep=new Set(out.map(r=>r.id));
  return{rows:out,dropped:o.filter(r=>r.w!=null&&!keep.has(r.id))}}
/* Khung 2 theo danh mục: các dòng hiển thị theo đúng thứ tự file Excel.
   lv: 'sec' (mục I) · 'cat' (nhóm có số) · 'hdr' (tiêu đề trong nhóm) · 'line' (chỉ tiêu có trọng số) · 'none' (Chưa phân loại) · 'task' (việc).
   Dòng sec / cat / line / none có wUsed (tổng trọng số việc, không tính việc đã chuyển), wStd (trọng số chỉ tiêu), pts (điểm thành phần việc đã Duyệt).
   Dòng sec cộng cả việc Chưa phân loại nên luôn bằng tổng Khung 2. Việc được đánh số lại (i) theo thứ tự trên màn hình. */
function kpiGroups(kpi,rows){
  const ids=new Set(kpiRows(kpi).map(r=>r.id)),out=[],z=()=>({wUsed:0,wStd:0,pts:0});
  const sec={lv:'sec',text:(kpi&&kpi.sec)||'KPI Công ty và hoạt động của phòng (KRI)',...z()};out.push(sec);
  let cat=null,i=0;
  const put=(id,heads)=>sortRows(rows.filter(r=>(ids.has(r.t.kpi)?r.t.kpi:'')===id)).forEach(r=>{
    if(r.sc.state!=='moved')heads.forEach(h=>{h.wUsed+=r.sc.w;if(r.sc.counted)h.pts+=r.sc.comp});out.push({lv:'task',r:{...r,i:i++}})});
  for(const k of (kpi&&kpi.rows)||[]){
    if(k.no){cat={lv:'cat',no:k.no,text:k.text,row:k.w!=null?k:null,...z()};out.push(cat);if(k.w!=null){cat.wStd=k.w;sec.wStd+=k.w;put(k.id,[sec,cat])}continue}
    if(k.w==null){out.push({lv:'hdr',text:k.text});continue}
    const ln={lv:'line',row:k,...z(),wStd:k.w};out.push(ln);sec.wStd+=k.w;if(cat)cat.wStd+=k.w;put(k.id,[sec,...(cat?[cat]:[]),ln]);
  }
  if(rows.some(r=>!ids.has(r.t.kpi))){const nb={lv:'none',...z()};out.push(nb);put('',[sec,nb])}
  out.forEach(h=>{if('pts' in h){h.wUsed=r2(h.wUsed);h.wStd=r2(h.wStd);h.pts=r2(h.pts)}});
  return out;
}
```

**Step 4: Keep `kpi` when a task moves to the next month.** In `moveTasks`:
*In `js/02-data-model.js`, find this line:*
```js
      if(tagsOf(t).length)c.tags=tagsOf(t);
```
*and insert right after it:*
```js
      if(t.kpi)c.kpi=t.kpi;   /* giữ chỉ tiêu KPI (Khung 2) */
```

**Step 5: Keep `kpi` on joint-task copies when the co-worker's catalogue has the same row.** In `grpCopy`:
*In `js/02-data-model.js`, find this line:*
```js
  if(src&&tagsOf(src).length)t.tags=tagsOf(src);
```
*and insert right after it:*
```js
  if(src&&src.kpi&&kpiHas(kpiOf(eid,g.year),src.kpi))t.kpi=src.kpi;   /* cùng nội dung chỉ tiêu → cùng id trong danh mục của người kia */
```

**Step 6: Run the test**
```bash
node --test tests/kpi.test.js
```
Expected: `# pass 5`, `# fail 1`. Only `parseKpiCatalog` still fails (Task 2).

**Step 7: Commit**
```bash
git add tests/kpi.test.js js/02-data-model.js
git commit -m "Chỉ tiêu KPI (Khung 2): mô hình dữ liệu, gom nhóm việc theo danh mục, kiểm tra tự động" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Excel catalogue parser

**Files:** Modify `js/23-import.js`: insert right after `parseKpiWorkbook` (~line 33)

**Step 1: Add `parseKpiCatalog`**
*In `js/23-import.js`, find this line:*
```js
  return{code:String(code).trim(),name:String(name).trim(),year,months,total};
}
```
*and insert right after it:*
```js

/* =====================================================================
   DANH MỤC CHỈ TIÊU KPI (Khung 2) – file Excel KPI cá nhân có các sheet "Individual KPIs – <tên>"
   Đọc mục I (từ dòng có cột A = I đến trước dòng II) của từng sheet, ghép nhân viên theo Mã NV (ô F4).
   Chỉ Admin / Quản lý. Không đổi điểm của việc. Nhập lại thì danh mục theo đúng file (xem kpiMerge).
   ===================================================================== */
function parseKpiCatalog(wb){
  const cv=(ws,a)=>ws&&ws[a]&&ws[a].v!=null?ws[a].v:null,s=v=>String(v??'').replace(/\r/g,'').trim();
  return wb.SheetNames.filter(n=>/^individual kpis/i.test(n.trim())).map(n=>{
    const ws=wb.Sheets[n];let r0=0;
    for(let r=1;r<=60&&!r0;r++)if(s(cv(ws,'A'+r))==='I')r0=r;   /* ponytail: mẫu hiện tại có mục I ở dòng 10; quét 60 dòng đầu, mẫu đổi thì nâng số này */
    const x={sheet:n.trim(),code:s(cv(ws,'F4')),name:s(cv(ws,'C3')),year:+((/nam\s*(\d{4})/.exec(norm(cv(ws,'A1')))||[])[1]||0)||null,
      sec:r0?s(cv(ws,'C'+r0)):'',secW:r0?r2((+cv(ws,'B'+r0)||0)*100):0,rows:[]};
    for(let r=r0+1;r0&&r<=r0+80;r++){
      const a=s(cv(ws,'A'+r));if(/^[IVX]+$/.test(a))break;   /* gặp mục II là hết mục I */
      const text=s(cv(ws,'C'+r)),g=cv(ws,'G'+r),w=typeof g==='number'?r2(g*100):null,last=x.rows[x.rows.length-1];
      if(!text&&w==null&&!a)continue;
      if(!a&&w==null&&last&&last.no&&!last.text&&last.w==null){last.text=text;continue}   /* sheet Chau: dòng số nhóm để trống, tên nhóm ở dòng dưới */
      x.rows.push({no:/^\d+$/.test(a)?a:'',text,w,rule:s(cv(ws,'H'+r))});
    }
    const taken=new Set();x.rows.forEach(k=>{k.id=kpiId(k.text||k.no,taken);taken.add(k.id)});
    return x;
  });
}
```

**Step 2: Run the test**
```bash
node --test tests/kpi.test.js
```
Expected: `# pass 6`, `# fail 0`.

**Step 3: Commit**
```bash
git add js/23-import.js
git commit -m "Chỉ tiêu KPI: đọc mục I của các sheet Individual KPIs trong file Excel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The existing task-workbook import must not drop the catalogue (blocker S1)

**Files:** Modify `js/23-import.js`: `impRead` (~line 74), `impRender` (~line 86), `SUB['imp-save']` (~line 94)

**Step 1: Point the user to the right import when they pick the catalogue workbook.** In `impRead`:
*In `js/23-import.js`, find:*
```js
    try{const d=parseKpiWorkbook(XLSX.read(await f.arrayBuffer(),{type:'array'}));items.push({file:f.name,d})}
    catch(e){items.push({file:f.name,err:/^không/.test(e.message)?e.message:'không đọc được file. Hãy chọn file .xlsx theo mẫu KPI cá nhân.'})}
```
*replace with:*
```js
    let wb=null;
    try{wb=XLSX.read(await f.arrayBuffer(),{type:'array'});const d=parseKpiWorkbook(wb);items.push({file:f.name,d})}
    catch(e){items.push({file:f.name,err:wb&&wb.SheetNames.some(n=>/^individual kpis/i.test(n.trim()))?'không theo mẫu việc tháng: đây là file danh mục chỉ tiêu KPI (sheet Individual KPIs…). Dùng nút “Nhập danh mục chỉ tiêu KPI” ở trang Tất cả nhân viên.':/^không/.test(e.message)?e.message:'không đọc được file. Hãy chọn file .xlsx theo mẫu KPI cá nhân.'})}
```

**Step 2: Add an overwrite note, shown only when a catalogue exists.** In `impRender`:
*In `js/23-import.js`, find this line:*
```js
box.innerHTML+='<p class="note tag-warn">Bảng KPI bị ghi đè sẽ mất các thay đổi đã làm trên app cho năm đó (việc đã chuyển tháng, nhận xét, việc thêm tay).</p>';
```
*and insert right after it:*
```js
  if(good.some(x=>{const e=empByCode(x.d.code),s=e&&sheetOf(e.id,x.d.year);return s&&s.kpi}))box.innerHTML+='<p class="note">Danh mục chỉ tiêu KPI (Khung 2) được giữ nguyên; các việc nhập từ file sẽ ở “Chưa phân loại” để chọn lại chỉ tiêu.</p>';
```

**Step 3: Carry `kpi` over when the sheet is rebuilt.** In `SUB['imp-save']`:
*In `js/23-import.js`, find:*
```js
    db.sheets=db.sheets.filter(s=>s.id!==sheetId(e.id,d.year));
    db.sheets.push({id:sheetId(e.id,d.year),empId:e.id,year:d.year,months:impMonths(d),updatedAt:todayStr(),source:'Excel'});lastId=e.id;lastY=d.year})});
```
*replace with:*
```js
    const old=sheetOf(e.id,d.year);db.sheets=db.sheets.filter(s=>s.id!==sheetId(e.id,d.year));
    db.sheets.push({id:sheetId(e.id,d.year),empId:e.id,year:d.year,months:impMonths(d),updatedAt:todayStr(),source:'Excel',...(old&&old.kpi?{kpi:old.kpi}:{})});lastId=e.id;lastY=d.year})});   /* giữ danh mục chỉ tiêu KPI (Khung 2) khi ghi đè bảng */
```

**Step 4: Verify.** Syntax: `node --check js/23-import.js` (no output). Behaviour is covered in Task 8, check F6.

**Step 5: Commit**
```bash
git add js/23-import.js
git commit -m "Nhập Excel việc tháng: giữ danh mục chỉ tiêu KPI khi ghi đè bảng, báo đúng khi chọn nhầm file" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Catalogue import screen (managers)

**Files:** Modify `js/23-import.js` (append at the end), `js/21-employees.js`: `PAGES['emp/list'].head` (~line 10)

**Step 1: Append the import modal, the preview and the save**
*Append to the end of `js/23-import.js`:*
```js
/* ---------- Nhập danh mục chỉ tiêu KPI (Khung 2) – Admin / Quản lý. Một file cho cả phòng: mỗi sheet "Individual KPIs…" là một nhân viên ---------- */
ACT['kc-imp']=el=>{
  if(!can('manage'))return toast('Chỉ quản lý được nhập danh mục chỉ tiêu KPI.','error');
  IMP={kc:1,items:[],err:'',y:el.dataset.y||curYear()};   /* dùng chung biến IMP: đóng hộp thoại là tự xoá */
  modal('Nhập danh mục chỉ tiêu KPI (Excel)',`<form id="mf" data-submit="kc-imp-save">
    <p class="note" style="padding-top:0">Chọn file Excel KPI cá nhân có các sheet <b>Individual KPIs – tên nhân viên</b>. App đọc mục <b>I · KPI Công ty và hoạt động của phòng</b> của từng sheet và gắn cho nhân viên có cùng <b>Mã NV</b> (ô F4). Điểm của các việc không thay đổi. Nhập lại thì danh mục theo đúng file.</p>
    <div class="drop" id="kc-drop"><input class="in" type="file" id="kc-file" accept=".xlsx,.xlsm" aria-label="File Excel danh mục chỉ tiêu KPI"><small class="muted">hoặc kéo thả file vào đây</small></div>
    <div id="kc-list"></div></form>`,{footer:cancelBtn+'<button class="btn primary" form="mf" id="kc-ok" disabled>Nhập</button>',size:'wide'});
  const dz=$('#kc-drop');
  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('over')}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('over')}));
  dz.addEventListener('drop',e=>kcRead(e.dataTransfer.files[0]));
  $('#kc-file').addEventListener('change',e=>kcRead(e.target.files[0]));
};
async function kcRead(f){
  if(!IMP||!IMP.kc||!f)return;
  if(!window.XLSX)return toast('Chưa tải được thư viện Excel (SheetJS). Kiểm tra kết nối mạng.','error');
  const box=$('#kc-list');if(box)box.innerHTML='<p class="note" role="status">Đang đọc file…</p>';
  let items=[],err='';
  try{items=parseKpiCatalog(XLSX.read(await f.arrayBuffer(),{type:'array'}));if(!items.length)err='File không có sheet “Individual KPIs…”. File việc tháng theo mẫu KPI_Individual_report (sheet Summary + M01…M12) thì dùng nút “⬆ Nhập Excel KPI”.'}
  catch(e){err='Không đọc được file. Hãy chọn file .xlsx có các sheet “Individual KPIs…”.'}
  if(!IMP)return;
  IMP.err=err;IMP.items=items.map(x=>({...x,year:x.year||+IMP.y,e:x.code?empByCode(x.code):null}));kcRender();
}
/* Bảng xem trước: ai được nhập, tổng trọng số so với chuẩn Khung 2, chỉ tiêu bị bỏ và số việc sẽ về "Chưa phân loại" */
function kcRender(){
  const box=$('#kc-list'),ok=$('#kc-ok');if(!box||!IMP)return;const P=kpi2(),good=IMP.items.filter(x=>x.e);
  box.innerHTML=IMP.err?`<p class="note tag-bad">${esc(IMP.err)}</p>`:miniTable(['Sheet','Nhân viên','Năm','Số chỉ tiêu','Tổng trọng số','Chỉ tiêu bị bỏ','Kết quả'],IMP.items.map(x=>{
    if(!x.e)return `<tr><td>${esc(x.sheet)}</td><td>${esc(x.name)}<small>${esc(x.code)}</small></td><td colspan="4" class="tag-bad">${x.code?`Mã NV ${esc(x.code)} chưa có trong danh sách nhân viên. Nhờ Admin thêm nhân viên trước.`:'Sheet không có Mã NV (ô F4).'}</td><td>${badge('bad','Bỏ qua')}</td></tr>`;
    const m=kpiMerge(kpiOf(x.e.id,x.year),x.rows),drop=new Set(m.dropped.map(r=>r.id)),lost=kpiUse(x.e.id,x.year,id=>drop.has(id)),tot=r2(kpiRows(x).reduce((a,r)=>a+r.w,0)),cur=sheetOf(x.e.id,x.year);
    return `<tr><td>${esc(x.sheet)}</td><td><b>${esc(x.e.name)}</b><small>${esc(x.code)}</small></td><td class="num">${x.year}</td><td class="num">${kpiRows(x).length}</td><td class="num"><span class="${Math.abs(tot-P.userStd)>=0.01?'tag-warn':''}">${fmtK(tot)}</span><small>chuẩn ${P.userStd}</small></td><td>${m.dropped.length?`${m.dropped.map(r=>esc(kpiLabel(r.text))).join('; ')}<small class="tag-warn">${lost.n} việc về “Chưa phân loại”${lost.n?' · '+esc(lost.by):''}</small>`:'<span class="muted">—</span>'}</td><td>${cur&&cur.kpi?badge('warn','Cập nhật'):badge('ok','Thêm mới')}</td></tr>`}),'Không có sheet nào.');
  if(ok){ok.disabled=!good.length;ok.textContent=good.length?`Nhập cho ${good.length} nhân viên`:'Nhập'}
}
SUB['kc-imp-save']=()=>{
  if(!IMP||!IMP.kc||!can('manage'))return;const good=IMP.items.filter(x=>x.e);if(!good.length)return;
  if(transact(()=>good.forEach(x=>{const sh=sheetOf(x.e.id,x.year,true);sh.kpi={sec:x.sec,rows:kpiMerge(kpiOf(x.e.id,x.year),x.rows).rows};sh.updatedAt=todayStr()})))done(`Đã nhập danh mục chỉ tiêu KPI cho ${good.length} nhân viên`);
};
```

**Step 2: Add the entry button on the "Tất cả nhân viên" bar.** In `js/21-employees.js`:
*In `js/21-employees.js`, find this text (part of a longer line: match it exactly, no line break at the end):*
```js
${can('manage')?'<button class="btn" data-act="kt-assign">📌 Giao việc</button>':''}${addBtns()}
```
*replace with (part of a longer line: match it exactly, no line break at the end):*
```js
${can('manage')?'<button class="btn" data-act="kt-assign">📌 Giao việc</button>':''}${can('manage')?`<button class="btn" data-act="kc-imp" data-y="${esc(F().year||curYear())}">${KPI_ICO}Nhập danh mục chỉ tiêu KPI</button>`:''}${addBtns()}
```

**Step 3: Verify.** `node --check js/23-import.js && node --check js/21-employees.js`

**Step 4: Commit**
```bash
git add js/23-import.js js/21-employees.js
git commit -m "Nhập danh mục chỉ tiêu KPI từ file Excel KPI cá nhân (theo Mã NV), xem trước chỉ tiêu bị bỏ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Grouped Khung 2 table + styles

**Files:** Modify `js/21-employees.js`: helpers before `apCell` (~line 138), `monthTable` (~lines 154–187), `kpiFrames` (~lines 192, 203–204); `css/style.css` (append)

**Step 1: Add the title and select helpers** (used by the table, the form and the inline classify):
*In `js/21-employees.js`, find:*
```js
/* Ô Quản lý duyệt: quản lý chọn ngay trên bảng; nhân viên chỉ thấy kết quả */
```
*and insert right before it:*
```js
/* biểu tượng danh mục chỉ tiêu: 3 vạch, vạch cuối thụt vào như chỉ tiêu con (SVG nét theo màu chữ; phần giao diện mới không dùng emoji) */
const KPI_ICO='<svg class="kico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M2.5 3.5h.5M6 3.5h7.5M2.5 8h.5M6 8h7.5M5 12.5h.5M8.5 12.5h5"/></svg>';
/* Chỉ tiêu KPI (Khung 2): tiêu đề dòng nhóm / chỉ tiêu = nhãn gọn + phần còn lại của ô Excel; rê chuột xem Quy ước đánh giá */
const kpiTtl=(text,pre='',rule='')=>{const s=String(text||''),rest=s.split('\n').slice(1).join('\n').trim();return `<span class="tt"${rule?` title="${esc('Quy ước đánh giá (file Excel): '+rule)}"`:''}>${pre}${esc(kpiLabel(s))}</span>${rest?`<small class="kpx">${esc(rest)}</small>`:''}`};
/* ô chọn chỉ tiêu KPI: nhóm có tiêu đề → optgroup, nhóm một dòng → option; luôn có dòng trống đầu để không tự chọn thay người dùng */
function kpiSel(k,cur,attrs=''){let h='',open=false;const opt=(r,lb)=>`<option value="${esc(r.id)}" ${r.id===cur?'selected':''}>${esc(lb)}</option>`,close=()=>{if(open){h+='</optgroup>';open=false}};
  for(const r of (k&&k.rows)||[]){
    if(r.no&&r.w==null){close();h+=`<optgroup label="${esc(r.no+'. '+kpiLabel(r.text))}">`;open=true}
    else if(r.no){close();h+=opt(r,r.no+'. '+kpiLabel(r.text))}
    else if(r.w!=null)h+=opt(r,kpiLabel(r.text));
  }
  close();return `<select class="in" name="kpi" ${attrs}><option value="" ${kpiHas(k,cur)?'':'selected'}>— Chọn chỉ tiêu KPI —</option>${h}</select>`}
```

**Step 2: Build grouped rows in `monthTable`, only for Khung 2 with a catalogue**
*In `js/21-employees.js`, find:*
```js
  const rows=sortRows(opt.rows||st.rows).map((r,i)=>({...r,i})),scd=r=>r.sc.state!=='moved'&&(r.sc.comp!=null||r.sc.ap);
```
*replace with:*
```js
  /* Khung 2 có danh mục chỉ tiêu KPI: xếp việc theo nhóm giống mục I của file Excel; dòng nhóm là dòng giả {hdr} */
  const kc=kind==='user'?kpiOf(e.id,y):null,grp=kpiRows(kc).length>0;
  const rows=grp?kpiGroups(kc,opt.rows||st.rows).map(x=>x.lv==='task'?x.r:{hdr:x}):sortRows(opt.rows||st.rows).map((r,i)=>({...r,i})),tk=rows.filter(r=>!r.hdr),scd=r=>r.sc.state!=='moved'&&(r.sc.comp!=null||r.sc.ap);
  /* ô của dòng nhóm: STT (I / số nhóm / —); Trọng số: mục I so với chuẩn Khung 2 (báo màu khi lệch), chỉ tiêu = tổng việc / trọng số chỉ tiêu năm trong Excel (chỉ để đối chiếu) */
  const kpiNo=h=>h.lv==='sec'?'I':h.lv==='cat'?h.no:h.lv==='none'?'—':'',kpiW=h=>h.lv==='sec'?`<b class="${Math.abs(h.wUsed-P.userStd)>=0.01?'tag-warn':''}">${fmtK(h.wUsed)}</b><small>chuẩn ${P.userStd}</small>`:h.lv==='none'?fmtK(h.wUsed):h.wStd?`<span title="Tổng trọng số các việc của chỉ tiêu này trong tháng / trọng số chỉ tiêu năm trong file Excel (để đối chiếu, không phải điểm)">${fmtK(h.wUsed)}<small>chỉ tiêu ${fmtK(h.wStd)}%</small></span>`:'';
```

**Step 3: STT, the new "Trọng số nhóm" column, and the title cell (with the inline select in the bucket)**
*In `js/21-employees.js`, find:*
```js
    {h:'STT',c:'num',f:r=>r.i+1,x:r=>r.i+1},
    {h:'Nội dung công việc / Đóng góp',c:'ttl',f:r=>`${r.t.carriedFrom?`<span class="pf">Chuyển từ ${mLbl(r.t.carriedFrom.month,r.t.carriedFrom.year,y)}</span>`:''}${tagBd(r.t)}${grpBd(r.t,e.id)}<span class="tt">${esc(r.t.title)}</span>`,x:r=>r.t.title},
```
*replace with:*
```js
    {h:'STT',c:'num',f:r=>grp?'':r.i+1,x:r=>grp?'':r.i+1,hf:h=>esc(kpiNo(h)),hx:kpiNo},
    grp?{h:'Trọng số nhóm',c:'num',f:()=>'',x:()=>'',hf:h=>h.lv==='sec'?P.userStd+'%':'',hx:h=>h.lv==='sec'?P.userStd+'%':''}:null,
    {h:'Nội dung công việc / Đóng góp',c:'ttl',f:r=>`${r.t.carriedFrom?`<span class="pf">Chuyển từ ${mLbl(r.t.carriedFrom.month,r.t.carriedFrom.year,y)}</span>`:''}${tagBd(r.t)}${grpBd(r.t,e.id)}<span class="tt">${esc(r.t.title)}</span>${grp&&w&&r.sc.state!=='moved'&&!kpiHas(kc,r.t.kpi)?kpiSel(kc,'',`data-kpi data-e="${e.id}" data-y="${y}" data-mm="${mm}" data-id="${r.t.id}" aria-label="Chỉ tiêu KPI cho việc ${r.i+1}"`):''}`,x:r=>r.t.title,
      hf:h=>h.lv==='none'?`<span class="tt">Chưa phân loại</span><small>${w?'Chọn chỉ tiêu KPI cho từng việc ở ô bên dưới.':'Các việc chưa được gắn chỉ tiêu KPI.'}</small>`:kpiTtl(h.lv==='line'?h.row.text:h.text,h.lv==='line'?'▸ ':'',h.row&&h.row.rule),
      hx:h=>h.lv==='none'?'Chưa phân loại':h.lv==='line'?h.row.text:h.text},
```

**Step 4: Weight cell of group rows**
*In `js/21-employees.js`, find:*
```js
    bm?null:{h:'Trọng số',c:'num',f:r=>fmtK(r.sc.w),x:r=>r.sc.w},
```
*replace with:*
```js
    bm?null:{h:'Trọng số',c:'num',f:r=>fmtK(r.sc.w),x:r=>r.sc.w,hf:kpiW,hx:h=>h.wUsed??''},
```

**Step 5: "Điểm thành phần" of group rows**
*In `js/21-employees.js`, find:*
```js
x:r=>r.sc.comp==null?'':r2(r.sc.comp)},
```
*replace with:*
```js
x:r=>r.sc.comp==null?'':r2(r.sc.comp),hf:h=>h.wStd||h.wUsed?`<b>${fmtK2(h.pts)}</b>`:'',hx:h=>h.pts??''},
```

**Step 6: Route group rows to each column's `hf` / `hx`, and compute the footer offset**
*In `js/21-employees.js`, find:*
```js
  ].filter(Boolean);
  const nVis=cols.filter(c=>!c.xonly).length,live=rows.filter(r=>r.sc.state!=='moved').length;
```
*replace with:*
```js
  ].filter(Boolean);
  if(grp)cols.forEach(c=>{const f=c.f,x=c.x;if(f)c.f=r=>r.hdr?(c.hf?c.hf(r.hdr):''):f(r);if(x)c.x=r=>r.hdr?(c.hx?c.hx(r.hdr):''):x(r)});   /* dòng nhóm dùng hf / hx của từng cột */
  const nVis=cols.filter(c=>!c.xonly).length,live=tk.filter(r=>r.sc.state!=='moved').length,c0=grp?3:2;
```

**Step 7: Footer colspans and row classes.** When `grp` is false the output is identical:
*In `js/21-employees.js`, find:*
```js
    :`<tr><td colspan="2">${kind==='user'?'Khung 2 · By User':'KPI tổng tháng'}</td><td class="num">${fmtK(st.weight)}</td><td colspan="5"></td><td class="num">${kind==='user'?fmtK2(st.p80):fmtK2(mVal(st))+(st.prov?'*':'')}</td><td colspan="${nVis-9}">${kind==='user'?`${rows.filter(r=>r.sc.counted).length}/${rows.filter(r=>r.sc.comp!=null).length} việc đã duyệt`:st.scored?`${st.counted}/${st.scored} việc đã duyệt`:''}</td></tr>`;
  return table(cols,rows,{meta:false,rc:r=>[r.sc.state==='moved'?'moved':r.sc.ap==='recheck'?'recheck':'',focusHit(fc,r)?'hl':''].join(' ').trim(),
```
*replace with:*
```js
    :`<tr><td colspan="${c0}">${kind==='user'?'Khung 2 · By User':'KPI tổng tháng'}</td><td class="num">${fmtK(st.weight)}</td><td colspan="5"></td><td class="num">${kind==='user'?fmtK2(st.p80):fmtK2(mVal(st))+(st.prov?'*':'')}</td><td colspan="${nVis-c0-7}">${kind==='user'?`${tk.filter(r=>r.sc.counted).length}/${tk.filter(r=>r.sc.comp!=null).length} việc đã duyệt`:st.scored?`${st.counted}/${st.scored} việc đã duyệt`:''}</td></tr>`;
  return table(cols,rows,{meta:false,rc:r=>r.hdr?'kh kh-'+r.hdr.lv:[r.sc.state==='moved'?'moved':r.sc.ap==='recheck'?'recheck':'',focusHit(fc,r)?'hl':'',grp?(ui.kjust===r.t.id?'kt kj':'kt'):''].join(' ').trim(),
```

**Step 8: Khung 2 header button and the "no catalogue yet" hint (managers).** In `kpiFrames`:
*In `js/21-employees.js`, find:*
```js
  const bmRows=st.rows.filter(r=>byMgr(r.t)),usRows=st.rows.filter(r=>!byMgr(r.t)),k=mVal(st);
```
*replace with:*
```js
  const bmRows=st.rows.filter(r=>byMgr(r.t)),usRows=st.rows.filter(r=>!byMgr(r.t)),k=mVal(st),hasKc=kpiRows(kpiOf(e.id,y)).length>0;
```
*In `js/21-employees.js`, find this text (part of a longer line: match it exactly, no line break at the end):*
```js
  <section class="kf kf80"><div class="kfh"><h4>Khung 2 · Công việc By User</h4><span class="kfs"><b>${fmtK2(st.p80)}</b> / ${P.userStd}</span></div>
    ${usRows.some(r=>r.sc.state!=='moved')&&Math.abs(st.weight-P.userStd)>=0.01?
```
*replace with (part of a longer line: match it exactly, no line break at the end):*
```js
  <section class="kf kf80"><div class="kfh"><h4>Khung 2 · Công việc By User${mg?` <button class="btn sm" data-act="kc-edit" data-e="${e.id}" data-y="${y}">${KPI_ICO}Chỉ tiêu KPI</button>`:''}</h4><span class="kfs"><b>${fmtK2(st.p80)}</b> / ${P.userStd}</span></div>
    ${mg&&!hasKc?`<p class="hint">Chưa có danh mục chỉ tiêu KPI năm ${y} của ${esc(e.name)}. Bấm <b>Chỉ tiêu KPI</b> để nhập từ file Excel hoặc tự tạo; khi có danh mục, việc By User được xếp theo nhóm giống mục I của file Excel.</p>`:''}${!hasKc&&usRows.some(r=>r.sc.state!=='moved')&&Math.abs(st.weight-P.userStd)>=0.01?
```

**Step 9: Styles.** Append to `css/style.css`:
*Append to the end of `css/style.css`:*
```css
/* ---------- Khung 2 theo danh mục chỉ tiêu KPI (giống mục I của file Excel) ---------- */
table.t tr.kh td,table.t tbody tr.kh:hover td,table.t tr.kh td.act{background:var(--mute-s);font-weight:600}
table.t tr.kh-sec td,table.t tbody tr.kh-sec:hover td,table.t tr.kh-sec td.act{background:#fbe3d4}   /* màu cam nhạt của dòng I trong Excel */
table.t tr.kh-line td,table.t tbody tr.kh-line:hover td,table.t tr.kh-line td.act,table.t tr.kh-hdr td,table.t tbody tr.kh-hdr:hover td,table.t tr.kh-hdr td.act{background:var(--panel);font-weight:500}
table.t tr.kh td.ttl .tt{font-weight:inherit}
table.t tr.kh td small.kpx{white-space:pre-line;font-weight:400}
table.t tr.kh td.num small{white-space:normal}   /* "chỉ tiêu 40%" xuống dòng để không ép cột Nội dung */
table.t tr.kh-line td.ttl,table.t tr.kh-hdr td.ttl{padding-left:18px}
table.t tr.kt td.ttl{padding-left:30px}
table.t td.ttl select[data-kpi]{display:block;margin-top:6px;max-width:100%;font-size:12.5px;padding:3px 6px;border-color:#f0d49a;background-color:var(--warn-s)}
table.t.kce td{vertical-align:top}
table.t.kce input[name=no]{width:58px}
table.t.kce input[name=w]{width:84px}
table.t.kce textarea{min-width:220px;font-size:13px}
/* bảng sửa danh mục: dòng có Nhóm số mở nhóm mới (vạch trên), dòng con thụt vào, dòng không có trọng số là tiêu đề (chữ đậm) */
table.t.kce tr:has(input[name=no]:not(:placeholder-shown)) td{border-top:2px solid var(--line)}
table.t.kce tr:has(input[name=no]:placeholder-shown) td:nth-child(2){padding-left:24px}
table.t.kce tr:has(input[name=w]:placeholder-shown) textarea[name=text]{font-weight:600}
.kico{vertical-align:-2px;margin-right:5px}
/* việc vừa gắn chỉ tiêu: hiện dần từ trên xuống (chỉ transform / opacity), vạch xanh bên trái đến lần vẽ lại sau */
@keyframes kjust{from{opacity:.35;transform:translateY(-6px)}to{opacity:1;transform:none}}
table.t tr.kj td{animation:kjust .55s cubic-bezier(.16,1,.3,1)}
table.t tr.kj td.ttl{box-shadow:inset 3px 0 0 var(--ok)}
@media (prefers-reduced-motion: reduce){table.t tr.kj td{animation:none}}
@media (max-width:700px){
  .mcard table.t tr.kh{background:var(--mute-s);padding:8px 4px}
  .mcard table.t tr.kh-sec{background:#fbe3d4}
  .mcard table.t tr.kh-line,.mcard table.t tr.kh-hdr{background:none}
  .mcard table.t tr.kh td:first-child{display:block;font-weight:700}
  .mcard table.t tr.kh td:first-child:empty{display:none}
  .mcard table.t tr.kh td[data-l]::before{content:none}
  .mcard table.t tr.kt td.ttl,.mcard table.t tr.kh-line td.ttl,.mcard table.t tr.kh-hdr td.ttl{padding-left:0}
}
```

**Step 10: Verify.** `node --check js/21-employees.js`, then `node --test tests/kpi.test.js` (still 6 pass).

**Step 11: Commit**
```bash
git add js/21-employees.js css/style.css
git commit -m "Khung 2 xếp việc theo nhóm chỉ tiêu KPI giống mục I file Excel (mục I, nhóm, chỉ tiêu, Chưa phân loại)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Editor, inline classify, task form

**Files:** Modify `js/21-employees.js`: after `ACT['nc-x']` (~line 220), `taskForm` (~lines 243, 257), `ktRead` (~line 280), `ktPreview` (~line 284), `ktSave` (~lines 311, 316)

**Step 1: Catalogue editor (managers) and the inline "Chưa phân loại" classifier**
*In `js/21-employees.js`, find this line:*
```js
ACT['nc-x']=el=>{if(confirm('Bỏ lỗi NC này?'))cmpEdit(el,m=>{m.nc=(m.nc||[]).filter(x=>x.id!==el.dataset.id)})};
```
*and insert right after it:*
```js
/* ---------- danh mục chỉ tiêu KPI (Khung 2) của một nhân viên trong năm – Admin / Quản lý ----------
   Bảng giống mục I của file Excel: Nhóm số · Chỉ tiêu · Trọng số chỉ tiêu (%) · Quy ước đánh giá.
   Mỗi dòng giữ id ở data-id; khi lưu đọc từng dòng theo thứ tự trên màn hình (không dùng fd() vì các ô trùng tên). */
const kcRowHTML=r=>`<tr data-kr data-id="${esc(r.id||'')}"><td><input class="in" name="no" value="${esc(r.no||'')}" placeholder="—" aria-label="Nhóm số (để trống = chỉ tiêu con của nhóm trên)"></td><td><textarea class="in" name="text" rows="2" aria-label="Chỉ tiêu">${esc(r.text||'')}</textarea></td><td><input class="in" name="w" type="number" min="0" max="100" step="any" value="${r.w??''}" placeholder="tiêu đề" aria-label="Trọng số chỉ tiêu (%), để trống = dòng tiêu đề"></td><td><textarea class="in" name="rule" rows="2" aria-label="Quy ước đánh giá">${esc(r.rule||'')}</textarea></td><td class="act"><button type="button" class="btn sm" data-act="kc-ins" title="Thêm một dòng ngay dưới, cùng nhóm" aria-label="Thêm dòng dưới">＋</button> <button type="button" class="btn sm danger" data-act="kc-del" title="Xoá dòng" aria-label="Xoá dòng">✕</button></td></tr>`;
function kcTot(){const el=$('#kc-tot');if(!el)return;const P=kpi2(),t=r2($$('#kc-rows input[name=w]').reduce((a,x)=>a+(+x.value||0),0));
  el.innerHTML=`Tổng trọng số chỉ tiêu: <b class="${Math.abs(t-P.userStd)>=0.01?'tag-warn':''}">${fmtK(t)}</b> / chuẩn ${P.userStd} của Khung 2.`}
ACT['kc-edit']=el=>{
  if(!can('manage'))return toast('Chỉ quản lý được sửa danh mục chỉ tiêu KPI.','error');
  const {e,y}=el.dataset,k=kpiOf(e,y)||{sec:'KPI Công ty và hoạt động của phòng (KRI)',rows:[]},own=!!(sheetOf(e,y)&&sheetOf(e,y).kpi);
  modal(`Chỉ tiêu KPI · ${empName(e)} · ${y}`,`<form id="mf" data-submit="kc-save" data-e="${esc(e)}" data-y="${esc(y)}">
    <p class="note" style="padding-top:0">Giống mục <b>I</b> của file Excel KPI cá nhân. Dòng có <b>Nhóm số</b> bắt đầu một nhóm; dòng có <b>Trọng số chỉ tiêu</b> là chỉ tiêu để gắn việc; để trống trọng số là dòng tiêu đề. Bấm <b>＋</b> để thêm dòng ngay dưới (cùng nhóm). Điểm của việc không đổi.${!own&&k.rows.length?` Đang dùng tạm danh mục năm ${+y-1}; bấm Lưu để dùng cho năm ${esc(y)}.`:''}</p>
    ${inp('sec','Tên mục I',k.sec||'',{full:1})}
    <div class="tw"><table class="t kce"><thead><tr><th>Nhóm số</th><th>Chỉ tiêu</th><th>Trọng số chỉ tiêu (%)</th><th>Quy ước đánh giá</th><th class="act"></th></tr></thead><tbody id="kc-rows">${(k.rows.length?k.rows:[{}]).map(kcRowHTML).join('')}</tbody></table></div>
    <p class="note" id="kc-tot" aria-live="polite"></p></form>`,
    {footer:`<button type="button" class="btn" data-act="kc-imp" data-y="${esc(y)}" style="margin-right:auto">${KPI_ICO}Nhập từ file Excel</button>${cancelBtn}<button class="btn primary" form="mf">Lưu</button>`,size:'wide'});
  kcTot();
};
document.addEventListener('input',ev=>{if(ev.target.closest&&ev.target.closest('#kc-rows')){ev.target.classList.remove('bad');ev.target.removeAttribute('aria-invalid');kcTot()}});
ACT['kc-ins']=el=>{const tr=el.closest('tr');tr.insertAdjacentHTML('afterend',kcRowHTML({}));tr.nextElementSibling.querySelector('textarea').focus()};
ACT['kc-del']=el=>{
  const tr=el.closest('tr'),f=el.closest('form'),id=tr.dataset.id,u=id?kpiUse(f.dataset.e,f.dataset.y,x=>x===id):{n:0};
  if(u.n&&!confirm(`Chỉ tiêu này đang gắn ${u.n} việc (${u.by}). Xoá dòng thì các việc đó về “Chưa phân loại”. Xoá?`))return;
  tr.remove();if(!$('#kc-rows tr'))$('#kc-rows').insertAdjacentHTML('beforeend',kcRowHTML({}));kcTot();
};
SUB['kc-save']=form=>{
  if(!can('manage'))return toast('Chỉ quản lý được sửa danh mục chỉ tiêu KPI.','error');
  const {e,y}=form.dataset,trs=$$('tr[data-kr]',form),taken=new Set(trs.map(tr=>tr.dataset.id).filter(Boolean)),rows=[];
  const bad=(el,msg)=>{el.classList.add('bad');el.setAttribute('aria-invalid','true');el.focus();toast(msg,'error')};   /* báo lỗi ngay tại ô sai */
  for(const tr of trs){
    const v=n=>tr.querySelector(`[name=${n}]`).value.trim(),text=v('text'),no=v('no').replace(/\.$/,''),ws=v('w');
    if(!text&&!no&&ws==='')continue;   /* dòng trống: bỏ */
    if(!text)return bad(tr.querySelector('[name=text]'),'Mỗi dòng cần có nội dung Chỉ tiêu.');
    const w=ws===''?null:Number(ws.replace(',','.'));if(w!=null&&!(w>=0&&w<=100))return bad(tr.querySelector('[name=w]'),`Trọng số của “${kpiLabel(text)}” phải từ 0 đến 100.`);
    let id=tr.dataset.id;if(!id){id=kpiId(text,taken);taken.add(id)}
    rows.push({id,no,text,w,rule:v('rule')});
  }
  const sh0=sheetOf(e,y),next={sec:(fd(form).sec||'').trim(),rows},sig=k=>JSON.stringify([k.sec||'',k.rows.map(r=>[r.id,r.no||'',r.text,r.w??null,r.rule||''])]);   /* so theo nội dung, không theo thứ tự khoá */
  if(sh0&&sh0.kpi&&sig(sh0.kpi)===sig(next)){closeModal();return toast('Không có thay đổi.')}
  if(transact(()=>{const sh=sheetOf(e,y,true);sh.kpi=next;sh.updatedAt=todayStr()}))done('Đã lưu danh mục chỉ tiêu KPI');
};
/* Gắn chỉ tiêu KPI ngay trên bảng cho việc ở "Chưa phân loại". Chỉ ghi task.kpi (không đổi điểm, không đụng trạng thái duyệt) nên nhân viên
   gắn được cả việc đã Duyệt; việc đã Duyệt mà đã có chỉ tiêu thì chỉ quản lý đổi (trong hộp Sửa việc). */
document.addEventListener('change',ev=>{
  const el=ev.target.closest&&ev.target.closest('select[data-kpi]');if(!el||!el.value)return;
  const {e,y,mm,id}=el.dataset;if(!canSheet(e))return toast('Bạn không có quyền.','error');
  if(transact(()=>{const sh=sheetOf(e,y),t=sh&&by(sh.months[mm].tasks,id),k=kpiOf(e,y);
    if(!t||byMgr(t))throw new Error('Việc này không còn tồn tại.');
    if(!kpiHas(k,el.value))throw new Error('Chỉ tiêu này không còn trong danh mục.');
    if(kpiHas(k,t.kpi)&&!canTask(e,t))throw new Error('Việc đã được Duyệt và đã có chỉ tiêu KPI; nhờ quản lý đổi nếu cần.');
    t.kpi=el.value;sh.updatedAt=todayStr()})){ui.kjust=id;refreshTbl();toast('Đã gắn chỉ tiêu KPI');kpiJust()}else refreshTbl();
});
/* việc vừa gắn chỉ tiêu chuyển lên dòng chỉ tiêu của nó: cuộn tới, giữ con trỏ bàn phím ở dòng đó, hiện dấu "vừa chuyển" một lần */
function kpiJust(){const tr=$('tr.kj');ui.kjust='';if(!tr)return;const rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  tr.scrollIntoView({block:'center',behavior:rm?'auto':'smooth'});const b=tr.querySelector('td.act button');if(b)b.focus({preventScroll:true});else{tr.tabIndex=-1;tr.focus({preventScroll:true})}}
```

**Step 2: The task form knows the catalogue and whether a pick is required**
*In `js/21-employees.js`, find this text (part of a longer line: match it exactly, no line break at the end):*
```js
  const bmV2=(assign||byMgr(t))&&isV2(
```
*and insert right before it (part of a longer line: match it exactly, no line break at the end):*
```js
  /* Khung 2: việc By User chọn chỉ tiêu KPI theo danh mục; bắt buộc với việc mới và khi nhân viên lưu (quản lý sửa việc cũ thì không bắt buộc) */
  const kc=!assign&&!byMgr(t)&&isV2(`${y}-${mm}`)&&empId?kpiOf(empId,y):null,kreq=kpiRows(kc).length>0&&(!mg||!id);
```

**Step 3: The KPI select in the form, under "Nội dung công việc"**
*In `js/21-employees.js`, find this line:*
```js
    <label class="f full"><span>Nội dung công việc / Đóng góp <i style="color:var(--bad);font-style:normal">*</i></span><textarea class="in" name="title" rows="3" ${lock?'readonly':''}>${esc(t.title)}</textarea></label>
```
*and insert right after it:*
```js
    ${kpiRows(kc).length?`<label class="f full"><span>Chỉ tiêu KPI (Khung 2)${kreq?' <i style="color:var(--bad);font-style:normal">*</i>':''} <small class="muted">(theo mục I của file Excel)</small></span>${kpiSel(kc,t.kpi,kreq?'required':'')}<small class="muted" id="kt-rule"></small></label>`:''}
```

**Step 4: Read the select**
*In `js/21-employees.js`, find this text (part of a longer line: match it exactly, no line break at the end):*
```js
mates:(d.mates||'').split(',').filter(Boolean)}}
```
*replace with (part of a longer line: match it exactly, no line break at the end):*
```js
mates:(d.mates||'').split(',').filter(Boolean),kpi:d.kpi||''}}
```

**Step 5: Show the Excel rule for the chosen KPI.** It is labelled as reference only:
*In `js/21-employees.js`, find:*
```js
'Lưu việc rồi chuyển sang tháng sau'}}
```
*replace with:*
```js
'Lưu việc rồi chuyển sang tháng sau'}
  const ks=form.querySelector('select[name=kpi]'),kr=$('#kt-rule');if(ks&&kr){const row=kpiRows(kpiOf(form.dataset.e,form.dataset.y)).find(x=>x.id===ks.value);kr.textContent=row&&row.rule?'Quy ước đánh giá trong file Excel (để tham khảo, không đổi cách tính điểm của việc): '+row.rule:''}}
```

**Step 6: Required check. Blank never clears a stored id (G3)**
*In `js/21-employees.js`, find this line:*
```js
  if(!d.title)return fail('Nhập nội dung công việc.');
```
*and insert right after it:*
```js
  /* Khung 2: chỉ tiêu KPI bắt buộc với việc mới và khi nhân viên lưu; để trống thì giữ nguyên chỉ tiêu đang gắn (không xoá id cũ) */
  const kc=!assign&&!byMgr(cur)&&isV2(`${y}-${mm}`)?kpiOf(e,y):null;
  if(!kpiHas(kc,d.kpi))d.kpi='';
  if(kpiRows(kc).length&&!d.kpi&&(!mg||!id))return fail('Chọn chỉ tiêu KPI cho việc này (ô Chỉ tiêu KPI).');
```

**Step 7: Write `kpi` only when it is non-empty**
*In `js/21-employees.js`, find:*
```js
note:d.note});delete t.bonusManual;
```
*replace with:*
```js
note:d.note});delete t.bonusManual;if(d.kpi)t.kpi=d.kpi;
```

**Step 8: Verify.** `node --check js/21-employees.js`, then `node --test tests/kpi.test.js`.

**Step 9: Commit**
```bash
git add js/21-employees.js
git commit -m "Chỉ tiêu KPI: bảng sửa danh mục, chọn chỉ tiêu khi thêm / sửa việc, gắn nhanh việc Chưa phân loại" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Permissions card, README, cache-busting

**Files:** Modify `js/33-settings.js` (~line 68), `README.md` (~lines 45, 94, 106), `index.html`

**Step 1: Role matrix row**
*In `js/33-settings.js`, find this text (part of a longer line: match it exactly, no line break at the end):*
```js
['Duyệt / Re-check, Comment by Manager, nhận xét, dời deadline khi chuyển việc','✔','✔','—'],
```
*replace with (part of a longer line: match it exactly, no line break at the end):*
```js
['Duyệt / Re-check, Comment by Manager, nhận xét, dời deadline khi chuyển việc','✔','✔','—'],['Danh mục chỉ tiêu KPI (Khung 2): nhập từ Excel, sửa','✔','✔','Xem; chọn chỉ tiêu cho việc của mình'],
```

**Step 2: README section.** It documents the feature, the trust note and the test command:
*In `README.md`, find this line:*
```markdown
Các tháng trước tháng áp dụng giữ cách tính cũ (100% công việc, chuẩn trọng số 100).
```
*and insert right after it:*
```markdown

### Chỉ tiêu KPI (Khung 2) – xếp việc theo nhóm giống file Excel
- Mỗi nhân viên có **danh mục chỉ tiêu KPI** cho từng năm, giống mục **I · KPI Công ty và hoạt động của phòng** trong sheet `Individual KPIs – <tên>` của file Excel KPI cá nhân: nhóm 1, 2, 3… và các chỉ tiêu con có trọng số (ví dụ *Các phòng họp… 40%*).
- **Nhập**: Admin / Quản lý bấm **Nhập danh mục chỉ tiêu KPI** (trang Tất cả nhân viên) hoặc **Chỉ tiêu KPI → Nhập từ file Excel** (Khung 2). App đọc mọi sheet `Individual KPIs…` và ghép nhân viên theo **Mã NV (ô F4)**. Nhập lại thì danh mục theo đúng file; bảng xem trước báo chỉ tiêu bị bỏ và số việc sẽ về “Chưa phân loại”. Chỉ tiêu cùng nội dung luôn có cùng id, nên nhập lại cùng file thì việc tự gắn lại.
- **Sửa**: nút **Chỉ tiêu KPI** ở Khung 2 mở bảng sửa (Nhóm số · Chỉ tiêu · Trọng số chỉ tiêu % · Quy ước đánh giá; **＋** thêm dòng ngay dưới, cùng nhóm). Năm chưa có danh mục thì dùng tạm danh mục năm trước.
- **Gắn việc**: khi Thêm / Sửa việc By User, chọn **Chỉ tiêu KPI** (bắt buộc với việc mới và khi nhân viên lưu). Việc chưa gắn nằm ở **Chưa phân loại**; chọn chỉ tiêu ngay trên bảng (làm được cả với việc đã Duyệt vì không đổi điểm).
- **Điểm không đổi**: chỉ tiêu KPI chỉ để xếp việc theo nhóm. Dòng chỉ tiêu hiện tổng trọng số các việc so với trọng số chỉ tiêu năm trong Excel (để đối chiếu) và điểm thành phần các việc đã Duyệt; dòng **I** so tổng trọng số với chuẩn Khung 2.
- Lưu ở trường `kpi` của bảng KPI (`sheets/{nhân viên}_{năm}`) và trường `kpi` của từng việc; không đổi Firestore Rules. Giống ô Quản lý duyệt, việc chỉ quản lý được sửa danh mục được khoá ở giao diện.
- Kiểm tra tự động: `node --test tests/kpi.test.js` (Node 22).
```
*In `README.md`, find this line:*
```markdown
| Duyệt / Re-check, Comment by Manager, nhận xét, dời deadline khi chuyển việc | ✔ | ✔ | — |
```
*and insert right after it:*
```markdown
| Danh mục chỉ tiêu KPI (Khung 2): nhập Excel, sửa | ✔ | ✔ | Xem; chọn chỉ tiêu cho việc của mình |
```
*In `README.md`, find this line:*
```markdown
  99-main.js               Khởi động, kiểm tra đủ file
```
*and insert right after it:*
```markdown
tests/
  kpi.test.js              Kiểm tra Chỉ tiêu KPI (Khung 2): node --test tests/kpi.test.js
```

**Step 3: Bump every `?v=`.** The README requires this so browsers fetch the new files:
```bash
sed -i 's/?v=20261021\.1420/?v=20261024.1600/g' index.html && grep -c '?v=20261024.1600' index.html
```
Expected: `19`.

**Step 4: Commit**
```bash
git add js/33-settings.js README.md index.html
git commit -m "Chỉ tiêu KPI: phân quyền, README, đổi phiên bản file" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verification (all of it must pass before you say "done")

**Step 1: Unit test**
```bash
node --test tests/kpi.test.js
```
Expected: `# pass 6`, `# fail 0`.

**Step 2: Non-regression (the user's requirement).** Copy the new code into the same local-mode folder. Keep the same port so localStorage, which holds the baseline data, survives:
```bash
cp -r index.html css js ../kpi-local/ && cp "/c/Users/MSI KATANA 15/Downloads/GA-HCM KPI KRIs Ca Nhan 2026 (Q3).xlsx" ../kpi-local/kpi.xlsx
```
Hard-reload `http://127.0.0.1:8765` (Ctrl+Shift+R), paste the `CAP` function from Task 0 again, then run:
```js
const base=JSON.parse(localStorage.getItem('kpi_base')),now=await CAP();Object.keys(base).filter(k=>base[k]!==now[k])
```
Expected: `[]` (88 of 88 identical). Nothing in the sample data has a catalogue, so every table, slip, export and score must match the original.

**Step 3: Feature checks** (admin, local copy). Add an employee **Châu Thị Mộng Tuyền**, Mã NV **S22501**, nhóm AD. Add some T10/2026 tasks, approve a few, then run:

| # | Action | Expected |
|---|---|---|
| F1 | Tất cả nhân viên → **Nhập danh mục chỉ tiêu KPI** → pick `kpi.xlsx` | Preview: 6 sheets. Tuyen: Thêm mới, 5 chỉ tiêu, 80 · chuẩn 80. The other 5 show "Mã NV … chưa có trong danh sách nhân viên" and Bỏ qua. → **Nhập cho 1 nhân viên** |
| F2 | Open Tuyen, T10 | Khung 2 rows: **I · 80% · KPI Công ty và hoạt động của phòng (KRI)** (peach, weight colour shows when it is not 80); **1** Corporate compliance (chỉ tiêu 10%); **2** Enhancement CPL… (10%); **3** Vệ sinh văn phòng… (header) → ▸ Các phòng họp… (40%), ▸ Cập nhật rác thải… (10%); **4** Làm ngoài giờ → ▸ Số giờ làm thêm… (10%); **Chưa phân loại** with every old task, each with an amber "— Chọn chỉ tiêu KPI —" select. The header total and the footer equal the I row (e.g. 55 / 80). |
| F3 | Choose "Các phòng họp…" in an approved task's select | Toast "Đã gắn chỉ tiêu KPI". The task moves under ▸ Các phòng họp. Its approval stays **Duyệt**, and Khung 2 / Khung 3 points are unchanged. |
| F4 | ＋ Thêm việc as admin without choosing a KPI | The browser blocks it (required). Choosing a KPI shows "Quy ước đánh giá trong file Excel (để tham khảo…)". The saved task appears under that KPI. |
| F5 | Chỉ tiêu KPI → Lưu without changes | "Không có thay đổi." |
| F5b | Chỉ tiêu KPI → ＋ on row 1, type a new chỉ tiêu, Lưu | The new line sits under category 1. The tasks of the other lines are still linked (ids unchanged). |
| F5c | ✕ on a line that has tasks | The confirm dialog names the count per month. Confirming moves those tasks to Chưa phân loại after Lưu. |
| F6 | Re-import the same `kpi.xlsx` | Preview "Cập nhật", "—" in Chỉ tiêu bị bỏ (except a line added in F5b, which is listed with its task count). After Nhập, the old links still work. |
| F7 | ⬆ Nhập Excel KPI → pick `kpi.xlsx` | "File không theo mẫu việc tháng: đây là file danh mục chỉ tiêu KPI… Dùng nút “Nhập danh mục chỉ tiêu KPI” ở trang Tất cả nhân viên." |
| F8 | Settings → User / Permission → add a **staff** test user linked to Tuyen, log in as that user | No "Chỉ tiêu KPI" button. Thêm việc requires the KPI. An approved task that already has a KPI shows no select. Unapproved bucket tasks have a select. |
| F9 | As admin, Sửa an old unclassified task, change only Ghi chú, Lưu | Saves without asking for a KPI. The task stays in Chưa phân loại. |
| F10 | Export ⬇ Excel / PDF / 🖨 In on Tuyen's page | The group rows (I, 1, 2, 3…) are present with text values. The selects print as text. |
| F11 | DevTools phone size (375 px) | The I and category rows show their number and title without "Trọng số:" labels. Tasks render as cards. |
| F12 | A pre-80/20 month (T09) and Khung 1 for Tuyen | Unchanged flat tables. |
| F13 | Classify a bucket task with the keyboard (Tab to its select, arrow to a KPI) | The row moves under its sub-KPI. The page scrolls to it, keyboard focus lands on that row's Sửa button (or the row itself), and the row fades in once with a green left mark. The mark is gone after the next redraw. With OS "reduce motion" on, there is no animation. |
| F14 | Chỉ tiêu KPI editor: type 150 as a weight, Lưu | That field turns red (`.in.bad`, `aria-invalid="true"`) and gets focus, and a toast names the KPI. Typing clears the red. Rows with a Nhóm số have a divider above them, rows without one are indented, and rows without a weight are bold with the "tiêu đề" placeholder. |

**Step 4: Report the outcome** with the test output and the `[]` from Step 2. If anything failed, say so with the output. Do not claim it passed.

---

## 3. After merge (rollout)

1. Push the branch and open a PR (when the user asks). GitHub Pages serves the files directly, so there is nothing to build.
2. **Firestore Rules: no change.** `RULES_VER` stays `v6`, and nothing needs republishing.
3. A manager imports `GA-HCM KPI KRIs Ca Nhan 2026 (Q3).xlsx` once via **Nhập danh mục chỉ tiêu KPI**, after Admin has checked that every person's Mã NV in the app matches cell F4 (S20609, S22414, S22501, S21401, S20506, S21744). Then open An and fix the 85 / 80 total in the editor.
4. Employees classify October's existing tasks from the "Chưa phân loại" selects. New tasks require a KPI from now on.

## 4. Known limits (accepted, documented)
- Two people saving the same KPI sheet at once: the last writer wins (existing behaviour, README). A lost catalogue is recovered by re-importing the same Excel, because the ids are deterministic.
- Staff can technically write `sheet.kpi` on their own sheet doc, the same as `approval` today. The UI blocks it, and the catalogue cannot change scores.
- `kpiUse` counts only the selected year. Tasks in January of the next year that point at this year's rows are not counted in the re-import preview.
- `parseKpiCatalog` scans the first 60 rows for the "I" row and 80 rows after it. Raise those numbers if the template grows (there is a `ponytail:` comment in the code).
