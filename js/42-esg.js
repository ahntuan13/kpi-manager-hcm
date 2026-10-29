/* 42-esg.js – Báo cáo ESG văn phòng (sử dụng tài nguyên & năng lượng)
   Đọc file Excel "ESG REPORT" của phòng (các sheet 1. CÁC CHỈ TIÊU · 2. Bảng tính chỉ tiêu · 3. Tiêu chí phòng ban · SUMMARY ·
   4. ĐIỆN NĂNG - CO2 · 5. GIẤY, IN, CHẤT THẢI · 6. XĂNG · 7. REF-IT-PRINT) → số liệu từng tháng, chỉ tiêu, hoạt động kaizen.
   App tự so sánh thực tế với chỉ tiêu theo quý / lũy kế, vẽ biểu đồ, đánh giá rủi ro + khuyến nghị cho từng sheet, kiểm tra lỗi công thức
   trong file, và xuất lại Excel đầy đủ các sheet (A4 ngang, vừa trang) hoặc PDF.
   Dữ liệu: db.ppe (collection ppe – mọi người dùng xem và nhập), mỗi năm một document kind:'esg', id 'esg_<năm>':
     {year, factor (kg CO2/kWh), staff, rev, ind:{<chỉ tiêu>:{act,tgt,cost,base,baseCost,note}} (mảng 12 tháng),
      kz:[hoạt động kaizen], plan:[sheet 1], dept:[bảng sheet 3], itp:[in theo phòng ban], qa:[lỗi phát hiện trong file], cmt:{nhận xét theo sheet}, src} */
'use strict';
(self.__mods=self.__mods||[]).push('42-esg');

const ESG_IND=[
  {k:'elec',n:'Điện năng tiêu thụ',u:'kWh',sec:'elec',icon:'⚡',cost:'Tiền điện (VND)'},
  {k:'ac',n:'Điện lạnh OT (sau 18h)',u:'kWh',sec:'elec',icon:'❄️',cost:'Tiền điện lạnh (VND)'},
  {k:'paper',n:'Giấy in',u:'ram',sec:'paper',icon:'📄'},
  {k:'print',n:'Số bản in',u:'trang',sec:'paper',icon:'🖨',cost:'Chi phí mực in (VND)'},
  {k:'waste',n:'Rác thải văn phòng',u:'tấn',sec:'paper',icon:'🗑',dec:3},
  {k:'battery',n:'Pin thải bỏ',u:'viên',sec:'paper',icon:'🔋'},
  {k:'bottle',n:'Nước uống đóng chai',u:'chai',sec:'paper',icon:'🧴'},
  {k:'km',n:'Km xe sử dụng',u:'km',sec:'fuel',icon:'🚗'},
  {k:'fuel',n:'Xăng tiêu thụ',u:'lít',sec:'fuel',icon:'⛽'}
];
const ESG_SEC=[['sum','Tổng quan'],['elec','4. Điện năng - CO2'],['paper','5. Giấy, in, chất thải'],['fuel','6. Xăng'],['itp','7. In theo phòng ban'],['dept','3. Tiêu chí phòng ban'],['plan','1. Các chỉ tiêu'],['calc','2. Bảng tính chỉ tiêu'],['risk','Rủi ro & khuyến nghị'],['qa','Kiểm tra số liệu']];
const ESG_PER={Q1:[0,1,2],Q2:[3,4,5],Q3:[6,7,8],Q4:[9,10,11],H1:[0,1,2,3,4,5],'9T':[0,1,2,3,4,5,6,7,8],Y:[0,1,2,3,4,5,6,7,8,9,10,11]};
const ESG_PER_L={Q1:'Quý 1',Q2:'Quý 2',Q3:'Quý 3',Q4:'Quý 4',H1:'6 tháng',
  '9T':'9 tháng',Y:'Cả năm'};
const ESG_PQ=Object.keys(ESG_PER);   /* kỳ chọn bằng nút; thêm từng tháng M01…M12 chọn bằng ô chọn */
for(let i=0;i<12;i++){const k='M'+String(i+1).padStart(2,'0');ESG_PER[k]=[i];ESG_PER_L[k]='Tháng '+(i+1)}
/* Firestore không lưu mảng lồng mảng: chi tiết kaizen lưu {h,v}, dòng bảng sheet 3 lưu {c:[…]} – đọc được cả dạng cũ */
const kzDet=x=>(x.detail||[]).map(e=>Array.isArray(e)?e:[e.h,e.v]);
const dRows=t=>(t.rows||[]).map(r=>Array.isArray(r)?r:r.c||[]);
function esgPack(d){(d.kz||[]).forEach(z=>{z.detail=kzDet(z).map(([h,v])=>({h,v}))});(d.dept||[]).forEach(t=>{t.rows=dRows(t).map(c=>({c}))});return d}
const FUEL_CO2=2.3;   /* kg CO2 / lít xăng – hệ số ước tính thông dụng */
const MON=Array.from({length:12},(_,i)=>'T'+(i+1));
const esgDocs=()=>(db.ppe||[]).filter(x=>x.kind==='esg').sort((a,b)=>b.year-a.year);
const esgDoc=y=>esgDocs().find(x=>+x.year===+y);
const e12=()=>Array(12).fill(null);
const esgN=(v,k)=>{if(v==null||v==='')return '–';const it=ESG_IND.find(i=>i.k===k);const d=it&&it.dec;return d?(+v).toLocaleString('vi-VN',{maximumFractionDigits:d}):Math.abs(v)<100&&v%1?fmtK(v):fmtNum(v)};

/* ======================= ĐỌC FILE EXCEL ======================= */
function esgParse(wb){
  const shN=re=>wb.SheetNames.find(n=>re.test(norm(n))),SH=re=>{const n=shN(re);return n?wb.Sheets[n]:null};
  const S1=SH(/cac chi tieu/),S2=SH(/bang tinh chi tieu/),S3=SH(/tieu chi phong ban/),S4=SH(/dien nang/),S5=SH(/giay/),S6=SH(/xang/),S7=SH(/it.?-?print|^7\./),SM=SH(/^summary/);
  if(!S4&&!S5&&!S2)throw new Error('Không thấy các sheet ESG (Điện năng - CO2, Giấy - in - chất thải, Bảng tính chỉ tiêu…).');
  const A=(r,c)=>XLSX.utils.encode_cell({r,c}),cell=(ws,r,c)=>ws&&ws[A(r,c)]||null;
  const val=(ws,r,c)=>{const x=cell(ws,r,c);return x?x.v:null},txt=(ws,r,c)=>String(val(ws,r,c)??'').replace(/\s+/g,' ').trim();
  const num=(ws,r,c)=>{const v=val(ws,r,c);if(typeof v==='number')return v;if(typeof v==='string'){const t=v.replace(/[\s,]/g,'');return /^-?\d+(\.\d+)?$/.test(t)?+t:null}return null};
  const last=ws=>ws&&ws['!ref']?XLSX.utils.decode_range(ws['!ref']).e.r:-1;
  const lab=(ws,r,cols)=>cols.map(c=>norm(txt(ws,r,c))).find(Boolean)||'';
  const find=(ws,re,cols=[0],from=0,to)=>{const L=to??last(ws);for(let r=from;r<=L;r++)if(re.test(lab(ws,r,cols)))return r;return -1};
  const t1Col=(ws,r)=>{for(let y=r;y>=0&&y>=r-30;y--)for(let c=0;c<12;c++)if(txt(ws,y,c).toUpperCase()==='T1')return c;return -1};
  const months=(ws,r,c0)=>{const c=c0??t1Col(ws,r);return c<0||r<0?e12():Array.from({length:12},(_,i)=>num(ws,r,c+i))};
  /* số thực tế: ô công thức ra 0 (ví dụ =M6 khi tháng chưa nhập) coi như chưa có số liệu */
  const acts=(ws,r)=>{const c=t1Col(ws,r);return c<0||r<0?e12():Array.from({length:12},(_,i)=>{const x=cell(ws,r,c+i),v=num(ws,r,c+i);return x&&x.f&&v===0?null:v})};
  const notes=(ws,r)=>{const c=t1Col(ws,r);return c<0||r<0?e12():Array.from({length:12},(_,i)=>txt(ws,r,c+i)||null)};
  const fml=(ws,r,c)=>{const x=cell(ws,r,c);return x&&x.f?String(x.f):''};
  const year=+((/20\d\d/.exec(txt(S4,0,0)+' '+txt(S2,0,1)+' '+txt(S5,0,0))||[])[0]||new Date().getFullYear());
  const ind={};ESG_IND.forEach(i=>ind[i.k]={act:e12(),tgt:e12(),cost:e12(),base:e12(),baseCost:e12(),note:e12()});
  const qa=[],q=(sheet,cellRef,issue,fix,lvl='TB')=>qa.push({sheet,cell:cellRef,issue,fix,lvl});
  const kz=[];
  /* kaizen: bảng có cột "Nội dung hoạt động" và cột "Tỷ lệ khu vực thực hiện" */
  const readKz=(ws,sec,sheetName)=>{if(!ws)return;const L=last(ws);
    for(let r=0;r<=L;r++){if(!/noi dung hoat dong/.test(lab(ws,r,[1])))continue;
      let rc=-1;for(let c=2;c<30&&rc<0;c++){if(/ty le/.test(norm(txt(ws,r,c)))||(r>0&&/ty le/.test(norm(txt(ws,r-1,c)))))rc=c}if(rc<0)continue;
      const areas=[];for(let c=2;c<rc-1;c++){const h=txt(ws,r,c);if(h)areas.push([c,h])}
      let area='';
      for(let y=r+1;y<=Math.min(L,r+16);y++){const a=txt(ws,y,0),b=txt(ws,y,1),c2=txt(ws,y,2);if(/noi dung hoat dong/.test(norm(b)))break;if(a&&!b&&!c2)continue;if(a)area=a;
        const rate=num(ws,y,rc);if(!b&&!c2)continue;if(!b&&/^\d+$/.test(c2))continue;if(rate==null&&!areas.some(([c])=>val(ws,y,c)!=null))continue;
        const short=b&&b.length<=28&&c2;const det=areas.map(([c,h])=>{const v=val(ws,y,c);return v==null||v===''?null:[h,typeof v==='number'?v:String(v).trim()]}).filter(Boolean);
        kz.push({sec,area,type:short?b:'',text:short?c2:b||c2,rate:rate==null?null:Math.max(0,Math.min(1,rate)),detail:det,ref:`${sheetName}!${A(y,rc)}`})}
      const kr=find(ws,/ket qua/,[Math.max(0,rc-3),rc-2,rc-1,rc-4,3,4,10],r,Math.min(L,r+20));
      if(kr>=0){for(let c=0;c<30;c++){const f=fml(ws,kr,c);if(/MAX\(/i.test(f)&&!qa.some(x=>x.cell===A(kr,c)&&x.sheet===sheetName)){q(sheetName,A(kr,c),'Ô “Kết quả” kaizen dùng MAX(...) ≥ 50%: chỉ cần một hoạt động đạt là cả mục “Đạt”.','Nên dùng trung bình các tỷ lệ (AVERAGE) hoặc yêu cầu mọi hoạt động ≥ 50%.','Thấp');break}}}}};
  /* đánh giá O/X: kiểm tra công thức so sánh đúng dòng thực tế và dòng chỉ tiêu */
  const chkEval=(ws,sheetName,evalRow,actRow,tgtRow,name)=>{if(!ws||evalRow<0)return;const c0=t1Col(ws,evalRow);if(c0<0)return;const f=fml(ws,evalRow,c0);if(!f)return;
    const refs=[...f.matchAll(/\$?([A-Z]{1,2})\$?(\d+)/g)].map(m=>({col:m[1],row:+m[2]-1,abs:/\$[A-Z]+\$?\d|\$\d/.test(m[0])&&/\$[A-Z]/.test(m[0])}));if(refs.length<2)return;
    const [x,y]=refs;
    if(x.row!==actRow||y.row!==tgtRow)q(sheetName,A(evalRow,c0),`Đánh giá ${name}: công thức “=${f}” so sánh dòng ${x.row+1} với dòng ${y.row+1}, nhưng số liệu thực tế ở dòng ${actRow+1} và chỉ tiêu ở dòng ${tgtRow+1}.`,`Sửa thành so sánh dòng ${actRow+1} với dòng ${tgtRow+1} của cùng tháng (ví dụ =IF(${A(actRow,c0)}<=${A(tgtRow,c0)},"O","X")).`,'Cao');
    else if(y.abs)q(sheetName,A(evalRow,c0),`Đánh giá ${name}: công thức “=${f}” cố định cột chỉ tiêu ($), mọi tháng đều so với chỉ tiêu tháng 1.`,`Bỏ dấu $ ở cột để mỗi tháng so với chỉ tiêu của chính tháng đó.`,'TB')};
  /* ---------- sheet 2: chỉ tiêu 2025 → 2026 ---------- */
  const staff={},rev={},tgt2={};
  if(S2){const L=last(S2);
    const r4=find(S2,/so nhan vien thuc te/,[1]);if(r4>=0){staff.prev=num(S2,r4,4);staff.cur=num(S2,r4+1,4)}
    const r9=find(S2,/^nam 20\d\d/,[1]);if(r9>=0){rev.prev=txt(S2,r9,3);rev.cur=txt(S2,r9+1,3);rev.grow=num(S2,r9,5)}
    for(let r=0;r<=L;r++){if(txt(S2,r,3).toUpperCase()!=='T1')continue;const tl=norm(txt(S2,r,1));
      const k=/dien lanh/.test(tl)?'ac':/dien nang/.test(tl)?'elec':/muc in/.test(tl)?'print':/chai|nhua/.test(tl)?'bottle':/giay/.test(tl)?'paper':/rac thai/.test(tl)?'waste':/km|xe/.test(tl)?'km':'';if(!k)continue;
      let end=r+1;while(end<=L&&txt(S2,end,3).toUpperCase()!=='T1')end++;
      let gotB=false,gotC=false,gotT=false;
      for(let y=r+1;y<end;y++){const l=norm(txt(S2,y,1));if(!l)continue;
        if(!gotT&&/^chi tieu hang thang/.test(l)&&!/thung/.test(l)){tgt2[k]=months(S2,y,3);gotT=true;
          const f=fml(S2,y,3),refRow=+((/\$?[A-Z]+\$?(\d+)/.exec(f)||[])[1]||0)-1;if(f&&refRow>=0&&(refRow<r||refRow>=end))q(S2.__n||'2. Bảng tính chỉ tiêu',A(y,3),`Chỉ tiêu ${ESG_IND.find(i=>i.k===k).n}: công thức “=${f}” lấy số của bảng khác (dòng ${refRow+1}), nên ra ${fmtNum(num(S2,y,3))}.`,k==='km'?`Sửa thành =Số km TB 2025 × (1 − % cắt giảm) (≈ ${fmtNum(((num(S2,find(S2,/km trung binh/,[1]),3))||0)*(1-(num(S2,find(S2,/% cat giam/,[1],r,end),15)||0.1)))} km/tháng).`:'Kiểm tra lại ô tham chiếu.','Cao');continue}
        if(/2025/.test(l)&&!/trung binh/.test(l)){const z=a=>a.map(v=>v===0?null:v);if(/tien|phi/.test(l)){if(!gotC){ind[k].baseCost=z(months(S2,y,3));gotC=true}}else if(!gotB){ind[k].base=z(months(S2,y,3));gotB=true}}}}}
  /* ---------- sheet 4: điện năng, điện lạnh ---------- */
  const N4=shN(/dien nang/)||'4. ĐIỆN NĂNG - CO2';
  if(S4){const re=find(S4,/^so kwh dien tieu thu/),rc=find(S4,/^so tien dien tieu thu/),rt=find(S4,/^tieu chi/,[0],Math.max(0,re)),ra=find(S4,/^so kwh dien lanh/),rac=find(S4,/^so tien dien lanh/),rat=ra>=0?find(S4,/^tieu chi/,[0],ra):-1;
    if(re>=0)ind.elec.act=acts(S4,re);if(rc>=0)ind.elec.cost=acts(S4,rc);if(rt>=0)ind.elec.tgt=months(S4,rt);
    if(ra>=0)ind.ac.act=acts(S4,ra);if(rac>=0)ind.ac.cost=acts(S4,rac);if(rat>=0)ind.ac.tgt=months(S4,rat);
    const n1=find(S4,/^ghi ro ly do/,[0],Math.max(0,re)),n2=ra>=0?find(S4,/^ghi ro ly do/,[0],ra):-1;if(n1>=0&&(ra<0||n1<ra))ind.elec.note=notes(S4,n1);if(n2>=0)ind.ac.note=notes(S4,n2);
    const co2r=find(S4,/^so kg co2 thai/,[0],Math.max(0,re)),ev1=find(S4,/^danh gia/,[0],Math.max(0,re)),ev2=ra>=0?find(S4,/^danh gia/,[0],ra):-1,co2a=ra>=0?find(S4,/^so kg co2 thai/,[0],ra):-1;
    if(ev1>=0&&(ra<0||ev1<ra))chkEval(S4,N4,ev1,co2r,rt,'điện năng');if(ev2>=0)chkEval(S4,N4,ev2,co2a,rat,'điện lạnh');
    if(rt>=0&&/kg co2/.test(lab(S4,rt,[0]))&&tgt2.elec&&ind.elec.tgt.some((v,i)=>v!=null&&tgt2.elec[i]!=null&&Math.abs(v-tgt2.elec[i])<1))
      q(N4,A(rt,0),'Dòng “Tiêu chí số kg CO2” đang chứa chỉ tiêu theo kWh (2.058 / 2.716 = số kWh của sheet 2), nhưng lại đem so với số kg CO2 → lệch đơn vị (kg CO2 = kWh × hệ số).','Hoặc so kWh thực tế với chỉ tiêu kWh, hoặc nhân chỉ tiêu với hệ số phát thải trước khi so. App so kWh với kWh.','Cao');
    readKz(S4,'elec',N4)}
  /* ---------- sheet 5: giấy, in, rác, pin ---------- */
  const N5=shN(/giay/)||'5. GIẤY, IN, CHẤT THẢI';
  if(S5){const rp=find(S5,/^1\.1\.?\s*giay in|^giay in/),rpt=rp>=0?find(S5,/^chi tieu/,[0],rp+1,rp+3):-1,rb=find(S5,/so ba(n|ng) in/),ri=find(S5,/so tien muc in/),rbt=find(S5,/^chi tieu ban in/),rw=find(S5,/^luong rac thai/),rwt=find(S5,/chi tieu .*rac/),rbat=find(S5,/so luong pin/);
    if(rp>=0)ind.paper.act=acts(S5,rp);if(rpt>=0)ind.paper.tgt=months(S5,rpt);if(rb>=0)ind.print.act=acts(S5,rb);if(ri>=0)ind.print.cost=acts(S5,ri);if(rbt>=0)ind.print.tgt=months(S5,rbt);
    if(rw>=0)ind.waste.act=acts(S5,rw);if(rwt>=0)ind.waste.tgt=months(S5,rwt);if(rbat>=0)ind.battery.act=acts(S5,rbat);
    const np=rp>=0?find(S5,/^ghi ro ly do/,[0],rp,rp+5):-1;if(np>=0)ind.paper.note=notes(S5,np);
    const nb=rb>=0?find(S5,/^ghi ro ly do/,[0],rb,rb+6):-1;if(nb>=0)ind.print.note=notes(S5,nb);
    const nw=rw>=0?find(S5,/^ghi ro ly do/,[0],rw,rw+5):-1;if(nw>=0)ind.waste.note=notes(S5,nw);
    const pb=rbat>=0?find(S5,/^chi tieu/,[0],rbat,rbat+4):-1;if(pb>=0){const c=t1Col(S5,pb);const t=[];for(let i=0;i<12;i++){const s=txt(S5,pb,c+i);if(s)t.push(s)}if(t.length)ind.battery.note[8]=t.join(' ')}
    const ev=(row,from)=>row>=0?find(S5,/^danh gia/,[0],row,row+4):-1;
    if(rp>=0)chkEval(S5,N5,ev(rp),rp,rpt,'giấy in');if(rb>=0)chkEval(S5,N5,ev(rbt>=0?rbt:rb),rb,rbt,'bản in');if(rw>=0)chkEval(S5,N5,ev(rw),rw,rwt,'rác thải');
    if(rbat>=0){const e=find(S5,/^danh gia/,[0],rbat,rbat+5),c=t1Col(S5,e),f=fml(S5,e,c);if(f&&!new RegExp('[A-Z]'+(rbat+1)+'\\b').test(f))q(N5,A(e,c),`Đánh giá pin thải bỏ: công thức “=${f}” không dùng dòng số lượng pin (dòng ${rbat+1}) nên luôn ra “O”.`,'Đặt chỉ tiêu số pin / tháng (ví dụ giảm 50% so với TB 2025) rồi so dòng số lượng với chỉ tiêu.','TB')}
    readKz(S5,'paper',N5)}
  /* ---------- sheet 6: xăng ---------- */
  const N6=shN(/xang/)||'6. XĂNG';
  if(S6){const rk=find(S6,/^so km/),rl=find(S6,/^so lit/),rt=find(S6,/chi tieu/);
    if(rk>=0)ind.km.act=acts(S6,rk);if(rl>=0)ind.fuel.act=acts(S6,rl);if(rt>=0)ind.km.tgt=months(S6,rt);
    const nn=rk>=0?find(S6,/^ghi ro ly do/,[0],rk,rk+6):-1;if(nn>=0)ind.km.note=notes(S6,nn);
    const b=ind.km.base.filter(v=>v!=null),avg=b.length?b.reduce((a,v)=>a+v,0)/b.length:null,t0=ind.km.tgt.find(v=>v!=null);
    if(avg&&t0!=null&&Math.abs(t0-avg*0.9)>avg*0.03)q(N6,rt>=0?A(rt,t1Col(S6,rt)):'',`Chỉ tiêu km xe = ${fmtNum(t0)} km/tháng${ind.km.base[0]!=null&&Math.abs(t0-ind.km.base[0])<1?' (đúng bằng số km tháng 1/2025)':''}, chưa phải “cắt giảm 10%” so với trung bình 2025 (${fmtNum(avg)} km).`,`Chỉ tiêu đúng ≈ ${fmtNum(avg*0.9)} km/tháng (TB 2025 × 90%).`,'TB');
    readKz(S6,'fuel',N6)}
  if(tgt2.bottle)ind.bottle.tgt=tgt2.bottle;
  ESG_IND.forEach(i=>{if(!ind[i.k].tgt.some(v=>v!=null)&&tgt2[i.k])ind[i.k].tgt=tgt2[i.k]});
  /* ---------- sheet 7: in theo phòng ban ---------- */
  const MN=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],itp=[];
  if(S7){const L=last(S7);
    for(let r=0;r<=L;r++){const cols=[];for(let c=0;c<40;c++){const t=txt(S7,r,c).toUpperCase().slice(0,3);const m=MN.indexOf(t);if(m>=0&&txt(S7,r+1,c).toUpperCase().startsWith('COLOR'))cols.push([c,m])}if(!cols.length)continue;
      for(let y=r+2;y<=Math.min(L,r+14);y++){const d=txt(S7,y,0);if(!d)continue;if(/^total/i.test(d))break;
        let o=itp.find(x=>x.d===d);if(!o){o={d,m:Array.from({length:12},()=>null)};itp.push(o)}
        cols.forEach(([c,m])=>{const v=[num(S7,y,c),num(S7,y,c+1),num(S7,y,c+2),num(S7,y,c+3)];if(v.some(x=>x!=null))o.m[m]={c:v[0]||0,cf:v[1]||0,b:v[2]||0,bf:v[3]||0}})}}}
  /* số bản in sheet 5 so với tổng in theo phòng ban sheet 7 */
  if(itp.length){const bad=[];for(let m=0;m<12;m++){const p=ind.print.act[m];if(p==null)continue;const bw=itp.reduce((a,o)=>a+(o.m[m]?o.m[m].b:0),0),cl=itp.reduce((a,o)=>a+(o.m[m]?o.m[m].c:0),0);if(bw&&cl&&Math.abs(p-bw)<1)bad.push(`T${m+1}: ghi ${fmtNum(p)} = chỉ bản trắng đen, thiếu ${fmtNum(cl)} bản màu`)}
    if(bad.length)q(N5,'','Số bản in hàng tháng chưa thống nhất: '+bad.join('; ')+'. Các tháng khác đã cộng cả bản màu.','Thống nhất cách tính: Số bản in = trắng đen + màu (theo sheet 7), chi phí mực = phí trắng đen + phí màu.','TB')}
  /* ---------- sheet 1: kế hoạch hoạt động ---------- */
  const plan=[];
  if(S1){const h=find(S1,/^stt$/,[1]);const L=last(S1);let grp='';
    for(let r=h<0?0:h+1;r<=L;r++){const c=txt(S1,r,2);if(!c)continue;if(/^duy tri/i.test(norm(txt(S1,r,3)))&&!txt(S1,r,1))continue;const s=txt(S1,r,1);if(s)grp=c;
      plan.push({stt:s,grp:s?'':grp,act:c,done:!!txt(S1,r,3),todo:!!txt(S1,r,4),dept:txt(S1,r,5),tgt:txt(S1,r,6),time:txt(S1,r,7),method:txt(S1,r,8),note:txt(S1,r,9)})}}
  /* ---------- sheet 3: tiêu chí phòng ban (giữ nguyên bảng) ---------- */
  const dept=[],DEPTS=/^(AD|PD|PU|PUR|HSE|QC|ED|EC|AZ|TOTAL)$/i;
  if(S3){const L=last(S3);
    for(let r=0;r<=L;r++){const t=txt(S3,r,1);if(!/^\d\.\s*ti/i.test(norm(t)))continue;
      let hr=-1;for(let y=r+1;y<=r+4;y++)if(/^dept$/i.test(txt(S3,y,2))){hr=y;break}if(hr<0)continue;
      let maxC=2;const rows=[];
      for(let y=hr+1;y<=Math.min(L,hr+16);y++){const d=txt(S3,y,2);if(!d)continue;if(!DEPTS.test(d))break;const vals=[];for(let c=3;c<16;c++){const v=val(S3,y,c);vals.push(v==null||v===''?null:v);if(v!=null&&v!=='')maxC=Math.max(maxC,c)}rows.push([d,...vals]);if(/total/i.test(d))break}
      const cols=[];for(let c=3;c<=maxC;c++)cols.push([txt(S3,hr,c),txt(S3,hr+1,c)].filter(Boolean).join(' · ')||'');
      dept.push({title:t,cols,rows:rows.map(x=>[x[0],...x.slice(1,maxC-1)])})}}
  /* ---------- SUMMARY: còn là số liệu quý cũ? ---------- */
  if(SM){const hr=find(SM,/^hang muc$/,[2]);if(hr>=0){const ms=[];for(let c=3;c<12;c++){const t=txt(SM,hr,c).toUpperCase();if(/^T\d+$/.test(t))ms.push(t)}
    const lastM=Math.max(...ESG_IND.map(i=>ind[i.k].act.reduce((a,v,j)=>v!=null?j:a,-1)));
    if(ms.length&&lastM+1>+ms[ms.length-1].slice(1))q(shN(/^summary/)||'SUMMARY','',`Sheet SUMMARY chỉ tổng hợp ${ms.join(', ')} trong khi file đã có số liệu đến T${lastM+1}.`,'App tự lập lại bảng tổng hợp theo quý / lũy kế ở sheet “Tổng quan” khi xuất.','TB')}}
  return{year,factor:0.72,staff,rev,ind,kz,plan,dept,itp,qa};
}

/* ======================= PHÂN TÍCH ======================= */
const esgLast=d=>Math.max(-1,...ESG_IND.map(i=>(d.ind[i.k]?.act||[]).reduce((a,v,j)=>v!=null?j:a,-1)));
const esgDefPer=d=>{const l=esgLast(d);return l<0?'Q1':'Q'+(Math.floor(l/3)+1)};
const sumIdx=(arr,ms)=>ms.reduce((a,m)=>a+(arr&&arr[m]!=null?+arr[m]:0),0);
function esgStat(d,k,ms){const x=d.ind[k]||{},act=x.act||e12(),tgt=x.tgt||e12(),lastM=esgLast(d);
  const have=ms.filter(m=>act[m]!=null),miss=ms.filter(m=>act[m]==null&&m<=lastM),a=sumIdx(act,have),hasT=have.some(m=>tgt[m]!=null),t=sumIdx(tgt,have.filter(m=>tgt[m]!=null)),b=sumIdx(x.base,have.filter(m=>x.base&&x.base[m]!=null));
  const r=hasT&&t?a/t:null,st=!have.length?(tgt.some(v=>v!=null)||act.some(v=>v!=null)?'nodata':'none'):!hasT?'notgt':r<=1?'ok':'bad';
  const badM=have.filter(m=>tgt[m]!=null&&act[m]>tgt[m]);
  return{k,a,t,r,st,have,miss,badM,b,chg:b?a/b-1:null,cost:sumIdx(x.cost,have)}}
const ESG_ST={ok:['ok','Đạt'],bad:['bad','Không đạt'],nodata:['warn','Chưa có số liệu'],notgt:['info','Theo dõi (chưa có chỉ tiêu)'],none:['mute','Chưa theo dõi']};
const stBadgeE=s=>badge(...ESG_ST[s.st]);
const pctE=v=>v==null?'–':Math.round(v*100)+'%';
const monL=ms=>{if(!ms.length)return '';const g=[];let s=ms[0],p=ms[0];for(const m of ms.slice(1)){if(m===p+1){p=m;continue}g.push(s===p?`T${s+1}`:`T${s+1}–T${p+1}`);s=p=m}g.push(s===p?`T${s+1}`:`T${s+1}–T${p+1}`);return g.join(', ')};
const co2Arr=d=>Array.from({length:12},(_,m)=>{const e=d.ind.elec.act[m],a=d.ind.ac.act[m];return e==null&&a==null?null:((+e||0)+(+a||0))*(+d.factor||0.72)});
const kzOf=(d,sec)=>(d.kz||[]).filter(z=>z.sec===sec);
const kzLow=(d,sec)=>kzOf(d,sec).filter(z=>z.rate!=null&&z.rate<1);

/* Đánh giá + rủi ro + khuyến nghị cho từng sheet (tự sinh từ số liệu; quản lý ghi thêm nhận xét riêng) */
function esgAssess(d,per){const ms=ESG_PER[per],ytd=ESG_PER.Y.filter(m=>m<=Math.max(...ms)),S=k=>esgStat(d,k,ms),Y=k=>esgStat(d,k,ytd),out={},R=[];
  const risk=(sec,item,risk,lvl,ev,act,pic='')=>R.push({sec,item,risk,lvl,ev,act,pic});
  const nm=k=>ESG_IND.find(i=>i.k===k).n,u=k=>ESG_IND.find(i=>i.k===k).u;
  const line=(k,s)=>s.st==='nodata'?`<b>${nm(k)}</b>: chưa có số liệu ${ESG_PER_L[per].toLowerCase()} (${monL(ms)}).`:s.st==='none'?`<b>${nm(k)}</b>: chưa theo dõi số liệu thực tế.`:s.st==='notgt'?`<b>${nm(k)}</b>: ${esgN(s.a,k)} ${u(k)} (${monL(s.have)}) – chưa có chỉ tiêu tháng để so.`:
    `<b>${nm(k)}</b>: ${esgN(s.a,k)} / chỉ tiêu ${esgN(s.t,k)} ${u(k)} = <b>${pctE(s.r)}</b> → ${s.st==='ok'?'<span class="pos">Đạt</span>':'<span class="neg">Không đạt</span>'}${s.chg!=null?` · so cùng kỳ 2025: ${s.chg>0?'+':''}${Math.round(s.chg*100)}%`:''}${s.miss.length?` · <span class="tag-warn">thiếu ${monL(s.miss)}</span>`:''}.`;
  const missRisk=(sec,k)=>{const s=Y(k);if(s.miss.length)risk(sec,nm(k),`Thiếu số liệu ${monL(s.miss)} – không chứng minh được việc đạt chỉ tiêu, báo cáo gửi TMV không đầy đủ.`,s.miss.length>=3?'Cao':'TB',`Lũy kế mới có ${s.have.length}/${s.have.length+s.miss.length} tháng.`,'Lấy số liệu từ hóa đơn / đồng hồ, nhập trước ngày 20 hàng tháng (deadline gửi TMV).','AD')};
  const loose=(sec,k)=>{const s=Y(k);if(s.r!=null&&s.r<0.6&&s.have.length>=3)risk(sec,nm(k),`Thực tế chỉ bằng ${pctE(s.r)} chỉ tiêu – chỉ tiêu đang quá rộng, không tạo động lực cắt giảm.`,'Thấp',`Lũy kế ${esgN(s.a,k)} / ${esgN(s.t,k)} ${u(k)}.`,'Đề xuất siết chỉ tiêu năm sau theo số thực tế 2026 (ví dụ TB 2026 × 95%).','AD / HODs')};
  /* ---- Điện ---- */
  {const se=S('elec'),sa=S('ac'),ye=Y('elec'),ya=Y('ac'),co2=co2Arr(d),c=sumIdx(co2,ms.filter(m=>co2[m]!=null)),tg=sumIdx(d.ind.elec.tgt,ms.filter(m=>d.ind.elec.act[m]!=null))*(+d.factor||0.72)+sumIdx(d.ind.ac.tgt,ms.filter(m=>d.ind.ac.act[m]!=null))*(+d.factor||0.72);
    const b=[line('elec',se),line('ac',sa)];if(c)b.push(`<b>Phát thải CO2 từ điện</b>: ${fmtNum(c)} kg (chỉ tiêu tương ứng ${fmtNum(tg)} kg, hệ số ${d.factor||0.72} kg CO2/kWh).`);
    const ac=d.ind.ac.act,acL=ac.reduce((a,v,j)=>v!=null?j:a,-1);if(acL>=2&&ac[acL-2]&&ac[acL]>ac[acL-2]*1.3)b.push(`Điện lạnh OT tăng nhanh: T${acL-1} ${fmtNum(ac[acL-2])} → T${acL+1} ${fmtNum(ac[acL])} kWh${d.ind.ac.note[acL]?` (${esc(d.ind.ac.note[acL])})`:''}.`);
    out.elec=b;missRisk('elec','elec');missRisk('elec','ac');
    const peak=d.ind.ac.base.reduce((a,v,j)=>v!=null&&(a<0||v>d.ind.ac.base[a])?j:a,-1);
    risk('elec','Điện lạnh OT',`Mùa nóng (đỉnh 2025: T${peak+1} ${fmtNum(d.ind.ac.base[peak])} kWh) và OT làm hồ sơ thầu của ED/EC dễ làm vượt chỉ tiêu.`,ya.st==='bad'?'Cao':'TB',`ED + EC chiếm phần lớn nhân sự văn phòng; ${kzLow(d,'elec').filter(z=>/may lanh/i.test(norm(z.area))).length?'hoạt động WFH chủ nhật của ED/EC mới đạt 50%':'cần duy trì các hoạt động đã đề ra'}.`,'Giữ máy lạnh 26°C (mỗi 1°C tăng tiết kiệm khoảng 3–5% điện), đăng ký OT có quản lý duyệt, gom người OT về một khu vực, WFH chủ nhật cho nhân viên có laptop, vệ sinh lưới lọc định kỳ.','AD / ED / EC');
    risk('elec','Điện năng',`Thiết bị để chạy ngoài giờ (máy tính, máy in, màn hình, sạc) tiêu tốn điện “ngầm”.`,'Thấp','Kaizen tắt đèn & thiết bị đạt 100% khu vực theo báo cáo.','Bật chế độ ngủ cho PC / máy in sau 10–15 phút, ổ cắm có công tắc tổng, kiểm tra cuối ngày theo checklist, ưu tiên đèn LED + cảm biến.','AD / IT');
    if(ye.st==='bad')risk('elec','Điện năng',`Vượt chỉ tiêu lũy kế (${pctE(ye.r)}).`,'Cao',`Các tháng vượt: ${monL(ye.badM)}.`,'Rà soát nguồn tăng (OT, thiết bị mới), áp hạn mức theo phòng ban (sheet 3).','AD / HODs')}
  /* ---- Giấy, in, chất thải ---- */
  {const b=['paper','print','waste'].map(k=>line(k,S(k)));const sb=S('battery');b.push(sb.have.length?`<b>Pin thải bỏ</b>: ${fmtNum(sb.a)} viên (${monL(sb.have)}), trung bình ${fmtK(sb.a/sb.have.length)} viên/tháng.`:'<b>Pin thải bỏ</b>: chưa có số liệu.');
    const sbo=S('bottle');b.push(sbo.st==='nodata'||sbo.st==='none'?`<b>Nước đóng chai</b>: có chỉ tiêu ${fmtNum(sumIdx(d.ind.bottle.tgt,ms))} chai nhưng <span class="tag-warn">chưa ghi nhận số thực tế</span>.`:line('bottle',sbo));
    const ink=S('print').cost;if(ink)b.push(`Chi phí mực in ${ESG_PER_L[per].toLowerCase()}: <b>${fmtNum(ink)} đ</b>.`);
    out.paper=b;['paper','print','waste'].forEach(k=>missRisk('paper',k));loose('paper','print');loose('paper','waste');
    const yp=Y('paper');if(yp.badM.length)risk('paper','Giấy in',`Vượt chỉ tiêu giấy ở ${monL(yp.badM)}${d.ind.paper.note.find(Boolean)?` (${esc(d.ind.paper.note.find(Boolean))})`:''}.`,yp.st==='bad'?'Cao':'TB',`Lũy kế ${esgN(yp.a,'paper')} / ${esgN(yp.t,'paper')} ram.`,'In 2 mặt mặc định, hạn mức ram theo phòng (sheet 3), duyệt / ký số hợp đồng – hồ sơ bàn giao, tái sử dụng giấy 1 mặt để in nháp.','AD / EC / PD');
    const pv=d.ind.paper.act.filter(v=>v!=null);if(pv.length>=4&&new Set(pv.slice(-6)).size===1)risk('paper','Giấy in',`Số ram ${pv.slice(-6).length} tháng gần nhất giống hệt nhau (${pv[pv.length-1]} ram) – có thể là số ước tính, không phải số xuất kho thực tế.`,'TB','Sheet 5 dòng 1.1.','Lấy số theo phiếu xuất kho văn phòng phẩm từng tháng.','AD');
    risk('paper','Mực in',`Bản in màu chi phí cao, in sai / in bỏ quên trên máy làm tăng giấy và mực.`,'TB',`${(d.itp||[]).length?'Theo sheet 7, ED và EC là 2 phòng in nhiều nhất.':''}`,'Mặc định in trắng đen + toner save, in màu cần lý do; dùng in bảo mật (nhập PIN mới in) để bỏ bản in quên lấy; chuyển báo cáo nội bộ, bài thi AZ sang file / form online.','AD / IT / HODs');
    risk('paper','Rác thải',`Mục tiêu “phân loại 90%”, “tái chế ≥ 50%” và “giảm 30% nước đóng chai” chưa có số liệu đo.`,'TB','File chỉ ghi tổng tấn rác; không có số chai nước thực tế.','Cân rác theo 3 loại (tái chế / thường / nguy hại) mỗi tháng, ghi số thùng nước nhập; giữ phiếu bàn giao của đơn vị thu gom.','AD');
    risk('paper','Pin thải bỏ',`Chỉ tiêu “giảm 50% pin thải bỏ” chưa có số gốc 2025 để so; pin là chất thải nguy hại, xử lý sai có thể vi phạm quy định môi trường.`,'TB',sb.have.length?`TB ${fmtK(sb.a/sb.have.length)} viên/tháng.`:'','Chốt số gốc, chuyển dần chuột / bàn phím sạc, hộp thu gom riêng có nhãn, bàn giao cho đơn vị có giấy phép xử lý chất thải nguy hại.','AD')}
  /* ---- Xăng ---- */
  {const sk=S('km'),sf=S('fuel'),yk=Y('km');const b=[line('km',sk),sf.have.length?`<b>Xăng</b>: ${fmtNum(sf.a)} lít (${monL(sf.have)}) ≈ ${fmtNum(sf.a*FUEL_CO2)} kg CO2${sk.a&&sf.a?` · mức tiêu hao ${fmtK(sf.a/sk.a*100)} lít/100 km`:''}.`:'<b>Xăng</b>: chưa có số liệu.'];
    out.fuel=b;missRisk('fuel','km');missRisk('fuel','fuel');
    const lowK=kzLow(d,'fuel').concat(kzOf(d,'fuel').filter(z=>z.rate==null));risk('fuel','Xe công tác',`Xe thuê chưa ưu tiên hybrid / đời mới; đi lẻ nhiều chuyến làm tăng km và phát thải.`,yk.st==='bad'?'Cao':'Thấp',lowK.map(z=>kzDet(z).map(x=>x[1]).filter(x=>typeof x==='string').join(' ')).filter(Boolean).join(' ')||'Hoạt động kaizen xe hybrid chưa thực hiện.','Gom chuyến theo lịch, ưu tiên xe điện / hybrid (Xanh SM) cho chặng ngắn, bảo dưỡng định kỳ, theo dõi lít/100 km từng xe.','AD / PU')}
  /* ---- In theo phòng ban ---- */
  {const it=d.itp||[],tot=it.map(o=>({d:o.d,b:o.m.reduce((a,x)=>a+(x?x.b:0),0),c:o.m.reduce((a,x)=>a+(x?x.c:0),0),f:o.m.reduce((a,x)=>a+(x?x.cf+x.bf:0),0)})).sort((a,b)=>b.b+b.c-a.b-a.c);
    const all=tot.reduce((a,o)=>a+o.b+o.c,0),col=tot.reduce((a,o)=>a+o.c,0),mm=it.length?Math.max(...it.map(o=>o.m.reduce((a,x,j)=>x?j:a,-1))):-1;
    out.itp=all?[`Tổng ${fmtNum(all)} bản in (T1–T${mm+1}), trong đó màu ${fmtNum(col)} bản (${pctE(col/all)}). Chi phí ${fmtNum(tot.reduce((a,o)=>a+o.f,0))} đ.`,`In nhiều nhất: ${tot.slice(0,3).map(o=>`<b>${esc(o.d)}</b> ${fmtNum(o.b+o.c)} (${pctE((o.b+o.c)/all)})`).join(' · ')}.`]:['Chưa có số liệu in theo phòng ban.'];
    if(mm>=0&&mm<esgLast(d))risk('itp','In theo phòng ban',`Bảng in theo phòng ban mới có đến T${mm+1}, trong khi số bản in tổng đã có đến T${esgLast(d)+1}.`,'TB','Sheet 7 trống các tháng sau.','IT gửi số liệu máy in theo phòng ban hàng tháng để đối chiếu hạn mức phòng ban.','IT / AD')}
  out.risk=R;return out}

/* ======================= GIAO DIỆN ======================= */
const canESG=()=>!!session;
const esgSave=fn=>transact(()=>{if(!Array.isArray(db.ppe))db.ppe=[];fn();db.ppe.filter(x=>x.kind==='esg').forEach(esgPack)});
function esgF(){const f=F();f.y=esgYear();const d=esgDoc(f.y);if(d&&!ESG_PER[f.per])f.per=esgDefPer(d);if(!f.sec)f.sec='sum';return{f,d}}
PAGES['esg/report']={t:'Báo cáo ESG văn phòng',
  sub(){const {f,d}=esgF();return d?`Năm ${d.year} · ${ESG_PER_L[f.per]} · dữ liệu đến T${esgLast(d)+1}${d.src&&d.src.file?' · file '+d.src.file:''}`:'Chưa có dữ liệu'},
  head(){const {f,d}=esgF(),ds=esgDocs();
    return `<div class="bar">${esgYearSel()}<div class="sp"></div><a class="btn" href="#/esg/elec">✏ Nhập số liệu</a><label class="btn" title="Chọn file ESG REPORT (.xls / .xlsx)">⬆ Nhập file ESG<input type="file" id="esg-file" accept=".xls,.xlsx,.xlsm" hidden></label>${d?`<button class="btn" data-act="esg-xlsx">⬇ Excel báo cáo</button><button class="btn" data-act="esg-pdf">⬇ PDF</button>`:''}</div>`},
  tbl(){const {f,d}=esgF();
    if(!d)return `<div class="empty"><b>Chưa có số liệu ESG.</b><br>Bấm <b>⬆ Nhập file ESG</b> và chọn file ESG REPORT của phòng (.xls / .xlsx). App đọc các sheet Điện năng - CO2, Giấy - in - chất thải, Xăng, Bảng tính chỉ tiêu, Tiêu chí phòng ban, REF-IT-PRINT.</div>`;
    const seg=(k,l)=>`<button type="button" data-act="setf" data-k="per" data-v="${k}" class="${f.per===k?'on':''}" aria-pressed="${f.per===k}">${l}</button>`,tab=([k,l])=>`<button type="button" class="etab ${f.sec===k?'on':''}" data-act="esg-sec" data-k="${k}">${l}</button>`;
    return `<div class="bar"><div class="seg" role="group" aria-label="Kỳ báo cáo">${ESG_PQ.map(k=>seg(k,ESG_PER_L[k])).join('')}</div><label class="fl">hoặc tháng <select class="in" data-f="per" aria-label="Báo cáo theo tháng"><option value="">—</option>${MON.map((m,i)=>{const k='M'+String(i+1).padStart(2,'0');return `<option value="${k}" ${f.per===k?'selected':''}>${m}</option>`}).join('')}</select></label></div><div class="etabs" role="tablist">${ESG_SEC.map(tab).join('')}</div>${esgSecHTML(d,f.sec,f.per,{ui:true})}`},
  tm(){const {f,d}=esgF();if(d)esgCharts(d,f.sec,f.per)}};
ACT['esg-sec']=el=>{F().sec=el.dataset.k;refreshTbl()};

/* ---------- nội dung từng sheet (dùng chung cho màn hình, PDF) ---------- */
const eRow=(cells,cls='')=>`<tr class="${cls}">${cells.join('')}</tr>`;
function esgMonthTable(d,keys,ms,opt={}){
  const head=`<tr><th>Hạng mục</th><th>ĐVT</th>${MON.map((m,i)=>`<th class="${ms.includes(i)?'cur':''}">${m}</th>`).join('')}<th>Lũy kế</th></tr>`;
  const rows=[];
  keys.forEach(k=>{const it=ESG_IND.find(i=>i.k===k),x=d.ind[k],tot=a=>a&&a.some(v=>v!=null)?esgN(a.reduce((s,v)=>s+(+v||0),0),k):'–';
    const cell=(a,i,cls='')=>`<td class="num ${ms.includes(i)?'cur':''} ${cls}">${a&&a[i]!=null?esgN(a[i],k):''}</td>`;
    rows.push(eRow([`<td><b>${it.icon} ${it.n}</b></td><td>${it.u}</td>`,...MON.map((_,i)=>cell(x.act,i,x.tgt[i]!=null&&x.act[i]!=null?(x.act[i]<=x.tgt[i]?'eok':'ebad'):'')),`<td class="num"><b>${tot(x.act)}</b></td>`],'ea'));
    if(x.tgt.some(v=>v!=null))rows.push(eRow([`<td>Chỉ tiêu 2026</td><td>${it.u}</td>`,...MON.map((_,i)=>cell(x.tgt,i)),`<td class="num">${tot(x.tgt)}</td>`],'et'));
    if(x.base.some(v=>v!=null))rows.push(eRow([`<td>Thực tế 2025</td><td>${it.u}</td>`,...MON.map((_,i)=>cell(x.base,i)),`<td class="num">${tot(x.base)}</td>`],'eb'));
    if(x.cost.some(v=>v!=null))rows.push(eRow([`<td>${it.cost||'Chi phí (VND)'}</td><td>VND</td>`,...MON.map((_,i)=>`<td class="num ${ms.includes(i)?'cur':''}">${x.cost[i]!=null?fmtNum(x.cost[i]):''}</td>`),`<td class="num">${fmtNum(x.cost.reduce((s,v)=>s+(+v||0),0))}</td>`],'ec'));
    if(x.tgt.some(v=>v!=null)&&x.act.some(v=>v!=null))rows.push(eRow([`<td>Đánh giá (O đạt · X không đạt)</td><td></td>`,...MON.map((_,i)=>`<td class="c ${ms.includes(i)?'cur':''}">${x.act[i]==null||x.tgt[i]==null?'':x.act[i]<=x.tgt[i]?'<b class="pos">O</b>':'<b class="neg">X</b>'}</td>`),'<td></td>'],'ee'));
    const nt=(x.note||[]).map((v,i)=>v?`T${i+1}: ${esc(v)}`:'').filter(Boolean);if(nt.length)rows.push(`<tr class="en"><td colspan="15"><small>Lý do / ghi chú: ${nt.join(' · ')}</small></td></tr>`)});
  if(opt.co2){const c=co2Arr(d),f=+d.factor||0.72,t=Array.from({length:12},(_,i)=>d.ind.elec.tgt[i]!=null||d.ind.ac.tgt[i]!=null?((+d.ind.elec.tgt[i]||0)+(+d.ind.ac.tgt[i]||0))*f:null);
    rows.push(eRow([`<td><b>🌫 CO2 từ điện (điện + điện lạnh)</b></td><td>kg</td>`,...MON.map((_,i)=>`<td class="num ${ms.includes(i)?'cur':''} ${c[i]!=null&&t[i]!=null?(c[i]<=t[i]?'eok':'ebad'):''}">${c[i]!=null?fmtNum(c[i]):''}</td>`),`<td class="num"><b>${fmtNum(c.reduce((s,v)=>s+(+v||0),0))}</b></td>`],'ea'));
    rows.push(eRow([`<td>Chỉ tiêu CO2 (= chỉ tiêu kWh × ${f})</td><td>kg</td>`,...MON.map((_,i)=>`<td class="num ${ms.includes(i)?'cur':''}">${t[i]!=null?fmtNum(t[i]):''}</td>`),`<td class="num">${fmtNum(t.reduce((s,v)=>s+(+v||0),0))}</td>`],'et'))}
  return `<div class="tw"><table class="t emt"><thead>${head}</thead><tbody>${rows.join('')}</tbody></table></div>`}
function esgKzHTML(d,sec){const z=kzOf(d,sec);if(!z.length)return '';
  return `<h5 class="esub">Hoạt động cắt giảm (kaizen)</h5><div class="tw"><table class="t ekz"><thead><tr><th>Lĩnh vực</th><th>Nội dung hoạt động</th><th>Chi tiết theo khu vực</th><th>Tỷ lệ thực hiện</th></tr></thead><tbody>${z.map(x=>`<tr><td><b>${esc(x.area)}</b>${x.type?`<br><small class="muted">${esc(x.type)}</small>`:''}</td><td>${esc(x.text).slice(0,260)}</td><td><small>${kzDet(x).filter(([h,v])=>typeof v==='string'||v<1).map(([h,v])=>`${esc(h)}: <b>${typeof v==='number'?pctE(v):esc(v)}</b>`).join(' · ')||'<span class="muted">tất cả khu vực 100%</span>'}</small></td><td>${x.rate==null?'<span class="muted">–</span>':`<div class="ebar"><i style="width:${Math.round(x.rate*100)}%" class="${x.rate>=1?'ok':x.rate>=0.8?'mid':'low'}"></i><b>${pctE(x.rate)}</b></div>`}</td></tr>`).join('')}</tbody></table></div>`}
function esgAssessHTML(d,sec,per,A,opt){const b=A[sec]||[],rs=A.risk.filter(r=>r.sec===sec),cm=(d.cmt||{})[sec]||'';
  return `${b.length||rs.length?`<div class="eass"><div><h5 class="esub">Nhận xét</h5><ul class="elist">${b.map(x=>`<li>${x}</li>`).join('')}</ul></div>${rs.length?`<div><h5 class="esub">Rủi ro &amp; khuyến nghị</h5><ul class="erisk">${rs.map(r=>`<li><span class="elv ${r.lvl==='Cao'?'eh':r.lvl==='TB'?'em':'el'}">${r.lvl}</span> <b>${esc(r.item)}</b>: ${r.risk}<br><small>→ ${esc(r.act)}</small></li>`).join('')}</ul></div>`:''}</div>`:''}
    ${opt.ui?`<form class="ecm" data-esgcm="${sec}"><label><b>Nhận xét của người lập / quản lý</b><textarea class="in" rows="2" name="c" placeholder="Ghi thêm nhận xét, nguyên nhân, hành động tháng tới…">${esc(cm)}</textarea></label><button class="btn sm">Lưu nhận xét</button></form>`:cm?`<div class="cmtp"><b>Nhận xét của người lập / quản lý:</b> ${esc(cm)}</div>`:''}`}
const esgChartBox=(id,title,opt)=>opt.ui?`<div class="ech"><h5>${title}</h5><div class="echc"><canvas id="${id}"></canvas></div></div>`:`<div class="ech"><h5>${title}</h5>${opt.img&&opt.img[id]?`<img src="${opt.img[id]}" alt="${esc(title)}">`:''}</div>`;
const ESG_CH={elec:[['ec-elec','elec'],['ec-ac','ac'],['ec-co2','co2']],paper:[['ec-paper','paper'],['ec-print','print'],['ec-waste','waste'],['ec-bat','battery']],fuel:[['ec-km','km'],['ec-fuel','fuel']],itp:[['ec-itp','itp']],sum:[['es-elec','elec'],['es-ac','ac'],['es-paper','paper'],['es-print','print'],['es-waste','waste'],['es-km','km']]};
const chTitle=k=>k==='co2'?'CO2 từ điện (kg) – thực tế so với chỉ tiêu':k==='itp'?'Số bản in theo phòng ban (trắng đen + màu)':`${ESG_IND.find(i=>i.k===k).n} (${ESG_IND.find(i=>i.k===k).u})`;
function esgSecHTML(d,sec,per,opt={}){const ms=ESG_PER[per],A=esgAssess(d,per);
  const charts=k=>`<div class="egrid">${(ESG_CH[k]||[]).map(([id,x])=>esgChartBox(id,chTitle(x),opt)).join('')}</div>`;
  if(sec==='sum'){const st=ESG_IND.map(i=>esgStat(d,i.k,ms)),cnt=s=>st.filter(x=>x.st===s).length,tot=cnt('ok')+cnt('bad'),co2=co2Arr(d),c=sumIdx(co2,ms.filter(m=>co2[m]!=null)),fuelC=sumIdx(d.ind.fuel.act,ms)*FUEL_CO2;
    const cost=['elec','ac','print'].reduce((a,k)=>a+st.find(x=>x.k===k).cost,0),comp=Math.round(ESG_IND.filter(i=>d.ind[i.k].act.some(v=>v!=null)).reduce((a,i)=>a+ms.filter(m=>d.ind[i.k].act[m]!=null).length,0)/Math.max(1,ESG_IND.filter(i=>d.ind[i.k].act.some(v=>v!=null)).length*ms.length)*100);
    const top=A.risk.filter(r=>r.lvl==='Cao');
    return `<div class="kpis sm">${kpi('Chỉ tiêu đạt',`${cnt('ok')}/${tot}`,`${ESG_PER_L[per]} · ${tot?pctE(cnt('ok')/tot):'–'} đạt`,cnt('bad')?'warn':'ok')}${kpi('Không đạt',fmtNum(cnt('bad')),st.filter(x=>x.st==='bad').map(x=>ESG_IND.find(i=>i.k===x.k).n).join(', ')||'không có',cnt('bad')?'bad':'ok')}${kpi('Thiếu số liệu',fmtNum(cnt('nodata')),st.filter(x=>x.st==='nodata').map(x=>ESG_IND.find(i=>i.k===x.k).n).join(', ')||'đủ',cnt('nodata')?'warn':'ok')}${kpi('CO2 từ điện + xăng',c+fuelC?fmtNum(c+fuelC)+' kg':'–',c+fuelC?`điện ${fmtNum(c)} · xăng ≈ ${fmtNum(fuelC)}`:'chưa có số liệu điện / xăng kỳ này',c+fuelC?'info':'warn')}${kpi('Chi phí điện + mực',fmtNum(cost)+' đ',ESG_PER_L[per],'acc')}${kpi('Độ đầy đủ số liệu',comp+'%',`các chỉ tiêu đang theo dõi`,comp<80?'warn':'ok')}</div>
      <div class="tw"><table class="t est"><thead><tr><th>Chỉ tiêu</th><th>ĐVT</th><th>Tháng có số liệu</th><th>Thực tế</th><th>Chỉ tiêu</th><th>% chỉ tiêu</th><th>So cùng kỳ 2025</th><th>Đánh giá</th></tr></thead><tbody>
      ${st.map(s=>{const it=ESG_IND.find(i=>i.k===s.k);return `<tr><td><b>${it.icon} ${it.n}</b></td><td>${it.u}</td><td>${s.have.length?monL(s.have):'–'}${s.miss.length?` <small class="tag-warn">thiếu ${monL(s.miss)}</small>`:''}</td><td class="num"><b>${s.have.length?esgN(s.a,s.k):'–'}</b></td><td class="num">${s.t?esgN(s.t,s.k):'–'}</td><td><div class="ebar"><i style="width:${s.r==null?0:Math.min(100,Math.round(s.r*100))}%" class="${s.r==null?'':s.r<=1?'ok':'low'}"></i><b>${pctE(s.r)}</b></div></td><td class="num">${s.chg==null?'–':`<span class="${s.chg>0?'neg':'pos'}">${s.chg>0?'▲ +':'▼ '}${Math.round(s.chg*100)}%</span>`}</td><td>${stBadgeE(s)}</td></tr>`}).join('')}</tbody></table></div>
      <p class="note">% chỉ tiêu = Thực tế ÷ Chỉ tiêu của các tháng có số liệu (≤ 100% là đạt, càng thấp càng tốt). So cùng kỳ 2025 tính trên cùng các tháng.</p>
      <div class="eass"><div><h5 class="esub">Kết luận ${ESG_PER_L[per].toLowerCase()}</h5><ul class="elist">${[...A.elec,...A.paper.slice(0,3),...A.fuel.slice(0,1)].map(x=>`<li>${x}</li>`).join('')}</ul></div><div><h5 class="esub">Việc cần làm ngay</h5><ul class="erisk">${(top.length?top:A.risk.slice(0,4)).slice(0,6).map(r=>`<li><span class="elv ${r.lvl==='Cao'?'eh':'em'}">${r.lvl}</span> <b>${esc(r.item)}</b>: ${r.risk}<br><small>→ ${esc(r.act)}</small></li>`).join('')}</ul></div></div>
      ${charts('sum')}${opt.ui?esgAssessHTML(d,'sum',per,{sum:[],risk:[]},opt):(d.cmt||{}).sum?`<div class="cmtp"><b>Nhận xét:</b> ${esc(d.cmt.sum)}</div>`:''}`}
  if(sec==='elec')return `<p class="note">Lượng khí thải (kg CO2) = số kWh × ${d.factor||0.72}. Ô xanh = đạt, ô đỏ = vượt chỉ tiêu tháng. Cột tô đậm là kỳ đang xem.</p>${esgMonthTable(d,['elec','ac'],ms,{co2:true})}${charts('elec')}${esgKzHTML(d,'elec')}${esgAssessHTML(d,'elec',per,A,opt)}`;
  if(sec==='paper')return `${esgMonthTable(d,['paper','print','waste','battery','bottle'],ms)}${charts('paper')}${esgKzHTML(d,'paper')}${esgAssessHTML(d,'paper',per,A,opt)}`;
  if(sec==='fuel')return `${esgMonthTable(d,['km','fuel'],ms)}${charts('fuel')}${esgKzHTML(d,'fuel')}${esgAssessHTML(d,'fuel',per,A,opt)}`;
  if(sec==='itp'){const it=d.itp||[];if(!it.length)return '<div class="empty">File chưa có sheet in theo phòng ban.</div>';const used=MON.map((_,i)=>it.some(o=>o.m[i])).map((x,i)=>x?i:-1).filter(i=>i>=0);
    const row=o=>{const t=o.m.reduce((a,x)=>a+(x?x.b+x.c:0),0),f=o.m.reduce((a,x)=>a+(x?x.bf+x.cf:0),0);return `<tr><td><b>${esc(o.d)}</b></td>${used.map(i=>{const x=o.m[i];return `<td class="num">${x?fmtNum(x.b):''}</td><td class="num ecl">${x?fmtNum(x.c):''}</td>`}).join('')}<td class="num"><b>${fmtNum(t)}</b></td><td class="num">${fmtNum(f)}</td></tr>`};
    const T={d:'TỔNG',m:MON.map((_,i)=>it.some(o=>o.m[i])?it.reduce((a,o)=>{const x=o.m[i];return x?{b:a.b+x.b,c:a.c+x.c,bf:a.bf+x.bf,cf:a.cf+x.cf}:a},{b:0,c:0,bf:0,cf:0}):null)};
    return `<div class="tw"><table class="t eit"><thead><tr><th rowspan="2">Phòng ban</th>${used.map(i=>`<th colspan="2">${MON[i]}</th>`).join('')}<th rowspan="2">Tổng bản in</th><th rowspan="2">Chi phí (VND)</th></tr><tr>${used.map(()=>'<th>T.đen</th><th>Màu</th>').join('')}</tr></thead><tbody>${it.map(row).join('')}${row(T).replace('<tr>','<tr class="etot">')}</tbody></table></div>${charts('itp')}${esgAssessHTML(d,'itp',per,A,opt)}`}
  if(sec==='dept')return (d.dept||[]).length?(d.dept.map(t=>`<h5 class="esub">${esc(t.title)}</h5><div class="tw"><table class="t edt"><thead><tr><th>Phòng ban</th>${t.cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${dRows(t).map(r=>`<tr class="${/total/i.test(r[0])?'etot':''}"><td><b>${esc(r[0])}</b></td>${r.slice(1).map(v=>`<td class="num">${v==null?'':typeof v==='number'?(v>0&&v<=1&&v%1?pctE(v):fmtNum(v)):esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')+esgDeptPrint(d,per)+esgAssessHTML(d,'dept',per,{dept:['Hạn mức theo phòng ban được AD đề xuất theo tỷ lệ nhân sự (điện, điện lạnh, giấy) và tỷ lệ bản in 2025 (mực in). Cột “Final – Các phòng” cần các HOD xác nhận.'],risk:[]},opt)):'<div class="empty">File chưa có sheet tiêu chí phòng ban.</div>';
  if(sec==='plan')return (d.plan||[]).length?`<div class="tw"><table class="t epl"><thead><tr><th>STT</th><th>Hoạt động giảm thiểu</th><th>Duy trì</th><th>Chưa thực hiện</th><th>Dept/PIC</th><th>Mục tiêu</th><th>Thời gian</th><th>Phương pháp định lượng</th><th>Ghi chú</th></tr></thead><tbody>${d.plan.map(p=>`<tr class="${p.stt?'egrp':''}"><td class="c">${esc(p.stt)}</td><td>${p.stt?'<b>':''}${esc(p.act)}${p.stt?'</b>':''}</td><td class="c">${p.done?'<b class="pos">✓</b>':''}</td><td class="c">${p.todo?'<b class="tag-warn">✓</b>':''}</td><td>${esc(p.dept)}</td><td><small>${esc(p.tgt)}</small></td><td><small>${esc(p.time)}</small></td><td><small>${esc(p.method)}</small></td><td><small>${esc(p.note)}</small></td></tr>`).join('')}</tbody></table></div><p class="note">${d.plan.filter(p=>p.done).length} hoạt động đang duy trì · <b class="tag-warn">${d.plan.filter(p=>p.todo).length} hoạt động chưa thực hiện</b>.</p>`:'<div class="empty">File chưa có sheet các chỉ tiêu.</div>';
  if(sec==='calc'){const rows=ESG_IND.filter(i=>d.ind[i.k].base.some(v=>v!=null)||d.ind[i.k].tgt.some(v=>v!=null));
    return `<div class="kpis sm">${kpi('Nhân sự văn phòng',`${fmtNum(d.staff?.cur||0)}`,`năm trước ${fmtNum(d.staff?.prev||0)}`,'info')}${kpi('Doanh thu',esc(d.rev?.cur||'–'),`năm trước ${esc(d.rev?.prev||'–')}`,'acc')}${kpi('Chỉ tiêu tăng theo doanh thu',d.rev?.grow!=null?pctE(d.rev.grow):'–','áp cho điện, điện lạnh, mực in, giấy','warn')}${kpi('Hệ số phát thải',`${d.factor||0.72}`,'kg CO2 / kWh (theo file)','mute')}</div>
      <div class="tw"><table class="t emt"><thead><tr><th>Chỉ tiêu</th><th>ĐVT</th><th></th>${MON.map(m=>`<th>${m}</th>`).join('')}<th>Cả năm</th></tr></thead><tbody>${rows.map(i=>{const x=d.ind[i.k],r=(l,a,cls)=>a.some(v=>v!=null)?`<tr class="${cls}"><td>${cls==='ea'?`<b>${i.icon} ${i.n}</b>`:''}</td><td>${i.u}</td><td>${l}</td>${a.map(v=>`<td class="num">${v!=null?esgN(v,i.k):''}</td>`).join('')}<td class="num"><b>${esgN(a.reduce((s,v)=>s+(+v||0),0),i.k)}</b></td></tr>`:'';return r('2025',x.base,'ea')+r('Chỉ tiêu 2026',x.tgt,'et')}).join('')}</tbody></table></div>
      <p class="note">Chỉ tiêu Q1 = giữ mức trung bình Q1/2025; Q2–Q4 = (tổng 2025 × (1 + tỷ lệ tăng theo doanh thu)) ÷ 11 tháng, theo cách tính trong file. Hệ số phát thải lưới điện Việt Nam các năm gần đây khoảng 0,66–0,68 kg CO2/kWh (file đang dùng ${d.factor||0.72}, an toàn hơn).</p>`}
  if(sec==='risk'){const all=A.risk;return `<div class="tw"><table class="t erk"><thead><tr><th>#</th><th>Sheet</th><th>Hạng mục</th><th>Rủi ro / vấn đề</th><th>Mức độ</th><th>Bằng chứng</th><th>Hành động đề xuất</th><th>PIC</th></tr></thead><tbody>${all.map((r,i)=>`<tr><td class="c">${i+1}</td><td><small>${esc(ESG_SEC.find(s=>s[0]===r.sec)?.[1]||r.sec)}</small></td><td><b>${esc(r.item)}</b></td><td>${r.risk}</td><td><span class="elv ${r.lvl==='Cao'?'eh':r.lvl==='TB'?'em':'el'}">${r.lvl}</span></td><td><small>${r.ev}</small></td><td><small>${esc(r.act)}</small></td><td><small>${esc(r.pic)}</small></td></tr>`).join('')}</tbody></table></div><p class="note">Mức độ: <b>Cao</b> – ảnh hưởng trực tiếp tới việc đạt / chứng minh chỉ tiêu, cần xử lý trong tháng · <b>TB</b> – cần kế hoạch · <b>Thấp</b> – theo dõi, cải tiến.</p>${esgAssessHTML(d,'risk',per,{risk:[]},opt)}`}
  if(sec==='qa'){const q=d.qa||[];return q.length?`<p class="note" style="padding-top:0">App kiểm tra công thức và số liệu trong file ESG đã nhập. Các lỗi dưới đây làm cột “Đánh giá O/X” hoặc chỉ tiêu trong file có thể sai; báo cáo của app đã tự tính lại theo đúng đơn vị và đúng tháng.</p><div class="tw"><table class="t erk"><thead><tr><th>#</th><th>Sheet</th><th>Ô</th><th>Vấn đề</th><th>Cách sửa</th><th>Mức độ</th></tr></thead><tbody>${q.map((x,i)=>`<tr><td class="c">${i+1}</td><td><small>${esc(x.sheet)}</small></td><td><code>${esc(x.cell||'')}</code></td><td>${esc(x.issue)}</td><td><small>${esc(x.fix)}</small></td><td><span class="elv ${x.lvl==='Cao'?'eh':x.lvl==='TB'?'em':'el'}">${esc(x.lvl)}</span></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Không phát hiện lỗi công thức / số liệu trong file.</div>'}
  return ''}
/* bản in theo phòng ban so với hạn mức (sheet 3 · tiêu chí mực in) */
function esgDeptPrint(d,per){const t=(d.dept||[]).find(x=>/muc in/.test(norm(x.title)));const it=d.itp||[];if(!t||!it.length)return '';
  const qi=t.cols.findIndex(c=>/suggest/i.test(c)&&/q1/i.test(c)),qj=t.cols.findIndex(c=>/suggest/i.test(c)&&/q2/i.test(c));if(qi<0)return '';
  const map={PUR:'PU',AZ:'HSE'},used=MON.map((_,i)=>it.some(o=>o.m[i])?i:-1).filter(i=>i>=0);
  const rows=dRows(t).filter(r=>!/total/i.test(r[0])).map(r=>{const o=it.find(x=>x.d===r[0]||map[x.d]===r[0]);return{d:r[0],q1:+r[qi+1]||null,q2:+r[(qj<0?qi:qj)+1]||null,o}}).filter(x=>x.o);
  if(!rows.length)return '';
  return `<h5 class="esub">Bản in thực tế theo phòng ban so với hạn mức AD đề xuất (trang / tháng)</h5><div class="tw"><table class="t eit"><thead><tr><th>Phòng ban</th><th>Hạn mức Q1</th><th>Hạn mức Q2–Q4</th>${used.map(i=>`<th>${MON[i]}</th>`).join('')}<th>Số tháng vượt</th></tr></thead><tbody>${rows.map(x=>{let n=0;const cells=used.map(i=>{const v=x.o.m[i]?x.o.m[i].b+x.o.m[i].c:null,lim=i<3?x.q1:x.q2;const bad=v!=null&&lim&&v>lim;if(bad)n++;return `<td class="num ${v==null?'':bad?'ebad':'eok'}">${v==null?'':fmtNum(v)}</td>`}).join('');return `<tr><td><b>${esc(x.d)}</b></td><td class="num">${fmtNum(x.q1)}</td><td class="num">${fmtNum(x.q2)}</td>${cells}<td class="c">${n?`<b class="neg">${n}</b>`:'<span class="pos">0</span>'}</td></tr>`}).join('')}</tbody></table></div><p class="note">Ghép tên phòng: PUR → PU, AZ → HSE. Hạn mức lấy theo cột “AD Suggest” của sheet 3.</p>`}

/* ---------- biểu đồ ---------- */
function esgChartCfg(d,x,opt={}){
  if(x==='itp'){const it=d.itp||[],used=MON.map((_,i)=>it.some(o=>o.m[i])?i:-1).filter(i=>i>=0),pal=['#2f7de1','#0e9f8b','#e0a32e','#8e6ad8','#dc4f47','#4aa3df','#7a8aa6','#c46aa0'];
    return{type:'bar',data:{labels:used.map(i=>MON[i]),datasets:it.map((o,j)=>({label:o.d,data:used.map(i=>o.m[i]?o.m[i].b+o.m[i].c:0),backgroundColor:pal[j%pal.length],stack:'s'}))},options:{...baseOpt(),scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}}}}
  const f=+d.factor||0.72,co=x==='co2';
  const act=co?co2Arr(d):d.ind[x].act,tgt=co?Array.from({length:12},(_,i)=>d.ind.elec.tgt[i]!=null||d.ind.ac.tgt[i]!=null?((+d.ind.elec.tgt[i]||0)+(+d.ind.ac.tgt[i]||0))*f:null):d.ind[x].tgt,base=co?Array.from({length:12},(_,i)=>d.ind.elec.base[i]!=null||d.ind.ac.base[i]!=null?((+d.ind.elec.base[i]||0)+(+d.ind.ac.base[i]||0))*f:null):d.ind[x].base;
  const col=act.map((v,i)=>v==null?'#c9cfdd':tgt[i]==null?'#2f7de1':v<=tgt[i]?'#18a37a':'#dc4f47');
  const ds=[{type:'bar',label:'Thực tế 2026',data:act,backgroundColor:col,order:2}];
  if(tgt.some(v=>v!=null))ds.push({type:'line',label:'Chỉ tiêu 2026',data:tgt,borderColor:'#e0a32e',backgroundColor:'#e0a32e',borderWidth:2,pointRadius:2,stepped:'middle',order:1});
  if(base.some(v=>v!=null))ds.push({type:'line',label:'Thực tế 2025',data:base,borderColor:'#a3abc4',backgroundColor:'#a3abc4',borderDash:[5,4],borderWidth:1.5,pointRadius:0,order:0});
  return{type:'bar',data:{labels:MON,datasets:ds},options:{...baseOpt(),scales:{y:{beginAtZero:true}},plugins:{...baseOpt().plugins,legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:10,boxHeight:10}}}}}}
function esgCharts(d,sec,per){(ESG_CH[sec]||[]).forEach(([id,x])=>chart(id,esgChartCfg(d,x)))}
/* ảnh biểu đồ cho PDF / Excel (vẽ ngoài màn hình) */
async function esgChartImgs(d,keys,w=900,h=330){const out={};if(!window.Chart)return out;
  for(const [id,x] of keys){const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.style.cssText=`position:fixed;left:-99999px;width:${w}px;height:${h}px`;document.body.appendChild(cv);
    const cfg=esgChartCfg(d,x);cfg.options={...cfg.options,responsive:false,animation:false,devicePixelRatio:2};
    try{const c=new Chart(cv,cfg);c.update('none');out[id]=cv.toDataURL('image/png');c.destroy()}catch(e){console.error(e)}cv.remove()}
  return out}

/* ---------- nhập file, lưu nhận xét ---------- */
/* Nhập file: lấy chỉ tiêu + các sheet ghi nhận (1, 2, 3, SUMMARY) và số liệu tháng. Năm đã có trên app: chọn giữ số liệu tháng đã nhập trên app hay ghi đè theo file */
let ESGIMP=null;
function esgMerge(old,p){const o=JSON.parse(JSON.stringify(p));
  ESG_IND.forEach(i=>{const a=(old.ind||{})[i.k]||{},b=o.ind[i.k];['act','cost','note'].forEach(f=>{b[f]=b[f].map((v,m)=>a[f]&&a[f][m]!=null&&a[f][m]!==''?a[f][m]:v)})});
  (old.itp||[]).forEach(od=>{let x=o.itp.find(z=>z.d===od.d);if(!x){x={d:od.d,m:Array(12).fill(null)};o.itp.push(x)}x.m=x.m.map((v,m)=>od.m&&od.m[m]?od.m[m]:v)});
  (old.kz||[]).filter(z=>z.app).forEach(z=>{const x=o.kz.find(y=>y.sec===z.sec&&y.text===z.text);if(x){x.rate=z.rate;x.app=true}});
  if(old.price)o.price=old.price;return o}
function esgImpSave(mode){const x=ESGIMP;if(!x)return;const {p,f}=x,id='esg_'+p.year,old=esgDoc(p.year);
  const doc={...(old&&mode==='merge'?esgMerge(old,p):p),id,kind:'esg',cmt:old&&old.cmt||{},src:{file:f,at:new Date().toISOString(),by:session?.name||''}};
  if(esgSave(()=>{db.ppe=db.ppe.filter(z=>z.id!==id);db.ppe.push(doc)})){ESGIMP=null;closeModal();ui.esgY=String(p.year);ui.esgYnew=false;if(!F().per)F().per=esgDefPer(doc);rerender();
    toast(`Đã nhập ESG ${p.year}${mode==='merge'?' (giữ số liệu đã nhập trên app)':''}: dữ liệu đến T${esgLast(doc)+1}, phát hiện ${p.qa.length} lỗi công thức / số liệu trong file`)}}
ACT['esg-imp-merge']=()=>esgImpSave('merge');ACT['esg-imp-over']=()=>esgImpSave('over');
document.addEventListener('change',async ev=>{const el=ev.target;if(el.id!=='esg-file'||!el.files||!el.files[0])return;if(!canESG())return;
  if(!window.XLSX){toast('Chưa tải được thư viện Excel.','error');return}
  const f=el.files[0];toast('Đang đọc file ESG…');
  try{const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellFormula:true});const p=esgParse(wb),old=esgDoc(p.year);ESGIMP={p,f:f.name};
    if(!old)return esgImpSave('over');
    const nApp=ESG_IND.reduce((a,i)=>a+((old.ind[i.k]||{}).act||[]).filter(v=>v!=null).length,0),nFile=ESG_IND.reduce((a,i)=>a+p.ind[i.k].act.filter(v=>v!=null).length,0);
    modal(`Nhập file ESG ${p.year}`,`<p>Năm ${p.year} đã có số liệu trên app (<b>${nApp}</b> ô số liệu tháng). File “${esc(f.name)}” có <b>${nFile}</b> ô số liệu tháng, dữ liệu đến T${esgLast(p)+1}.</p>
      <p class="note">Cả hai cách đều cập nhật <b>chỉ tiêu</b> và các sheet ghi nhận (1. Các chỉ tiêu, 2. Bảng tính chỉ tiêu, 3. Tiêu chí phòng ban) theo file, và giữ nhận xét đã ghi.</p>`,
      {footer:`${cancelBtn}<button class="btn" data-act="esg-imp-over">Ghi đè số liệu tháng theo file</button><button class="btn primary" data-act="esg-imp-merge">Giữ số liệu đã nhập trên app, chỉ bổ sung tháng còn trống</button>`})}
  catch(e){console.error(e);toast('Không đọc được file ESG: '+e.message,'error')}finally{el.value=''}});
document.addEventListener('submit',ev=>{const fm=ev.target.closest&&ev.target.closest('form[data-esgcm]');if(!fm)return;ev.preventDefault();const {d}=esgF();if(!d)return;
  const k=fm.dataset.esgcm,v=String(fm.c.value||'').trim();if(esgSave(()=>{const x=db.ppe.find(z=>z.id===d.id);x.cmt={...(x.cmt||{}),[k]:v}}))toast('Đã lưu nhận xét')},true);

/* ======================= PDF ======================= */
const ESG_PRINT=['sum','elec','paper','fuel','itp','dept','plan','calc','risk','qa'];
function esgDocHead(d,per,title,i,n){const c=db.company||{};return `<div class="ehd"><img src="assets/iso/logo-left.png" alt="" class="ehl"><div class="eht"><b>BÁO CÁO ESG – SỬ DỤNG TÀI NGUYÊN &amp; NĂNG LƯỢNG VĂN PHÒNG ${d.year}</b><span>${esc(ESG_PER_L[per])} · dữ liệu đến T${esgLast(d)+1} · ${esc(title)}</span></div><img src="assets/iso/logo-right.png" alt="" class="ehr"></div>`}
ACT['esg-pdf']=async el=>{const {f,d}=esgF();if(!d)return;const b=el.closest('button');if(b)b.disabled=true;toast('Đang tạo PDF…');
  try{const img=await esgChartImgs(d,Object.values(ESG_CH).flat());
    const els=ESG_PRINT.map((k,i)=>offscreen(`<div class="rpt-doc esg-doc">${esgDocHead(d,f.per,ESG_SEC.find(s=>s[0]===k)[1],i,ESG_PRINT.length)}<h2 class="esh">${esc(ESG_SEC.find(s=>s[0]===k)[1])}</h2>${esgSecHTML(d,k,f.per,{img})}<div class="eft">${esc(db.company?.name||'')} · Ngày lập: ${fmtDate(todayStr())}</div></div>`,1120));
    await new Promise(r=>setTimeout(r,250));
    await pdfFromEls(els,`ESG_${d.year}_${f.per}_${todayStr()}.pdf`,{landscape:true});els.forEach(e=>e.remove())}
  catch(e){console.error(e);toast('Xuất PDF thất bại: '+e.message,'error')}finally{if(b)b.disabled=false}};

/* ======================= EXCEL (đủ các sheet, A4 ngang, vừa trang) ======================= */
const XC={hd:'FF1F4E3D',hd2:'FFE2EFDA',acc:'FFDDEBF7',ok:'FFC6EFCE',okT:'FF006100',bad:'FFFFC7CE',badT:'FF9C0006',warn:'FFFFEB9C',mute:'FFF2F2F2',line:'FFBFBFBF'};
const xb={style:'thin',color:{argb:XC.line}},XBOX={top:xb,left:xb,bottom:xb,right:xb};
function xSheet(wb,name,title,d,per,widths){const ws=wb.addWorksheet(name.slice(0,31),{views:[{showGridLines:false}]});ws.columns=widths.map(w=>({width:w}));const N=widths.length;
  ws.mergeCells(1,1,1,N);const t=ws.getCell(1,1);t.value=title;t.font={name:'Arial',size:14,bold:true,color:{argb:'FFFFFFFF'}};t.fill={type:'pattern',pattern:'solid',fgColor:{argb:XC.hd}};t.alignment={vertical:'middle',horizontal:'left',indent:1};ws.getRow(1).height=26;
  ws.mergeCells(2,1,2,N);const s=ws.getCell(2,1);s.value=`ESG văn phòng ${d.year} · ${ESG_PER_L[per]} · dữ liệu đến T${esgLast(d)+1} · lập ngày ${fmtDate(todayStr())}`;s.font={name:'Arial',size:9,italic:true,color:{argb:'FF595959'}};
  ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,horizontalCentered:true,margins:{left:0.4,right:0.4,top:0.9,bottom:0.6,header:0.3,footer:0.3}};
  ws.headerFooter={oddHeader:'&L&G&C&"Arial,Bold"&9BÁO CÁO ESG VĂN PHÒNG&R&G',oddFooter:`&L&"Arial,Regular"&8${(db.company?.name||'').replace(/&/g,'&&')}&C&"Arial,Regular"&8&A&R&"Arial,Regular"&8Trang &P / &N`};
  ws.__r=4;ws.__N=N;return ws}
const xPut=(ws,r,c,v,st={})=>{const x=ws.getCell(r,c);x.value=v;x.font={name:'Arial',size:9,...(st.font||{})};x.alignment={vertical:'middle',wrapText:true,...(st.al||{})};if(st.fill)x.fill={type:'pattern',pattern:'solid',fgColor:{argb:st.fill}};if(st.box!==false)x.border=XBOX;if(st.fmt)x.numFmt=st.fmt;return x};
function xTable(ws,head,rows,opt={}){let r=ws.__r;
  if(opt.title){ws.mergeCells(r,1,r,ws.__N);xPut(ws,r,1,opt.title,{font:{bold:true,size:11,color:{argb:XC.hd}},box:false});ws.getRow(r).height=20;r++}
  head.forEach((h,i)=>xPut(ws,r,i+1+(opt.off||0),h,{font:{bold:true,color:{argb:'FFFFFFFF'}},fill:'FF2E7D5B',al:{horizontal:'center'}}));ws.getRow(r).height=opt.hh||30;r++;
  rows.forEach(row=>{const cls=row.cls||'';(row.v||row).forEach((v,i)=>{const st=(row.st&&row.st[i])||{};const isN=typeof v==='number';xPut(ws,r,i+1+(opt.off||0),v==null?'':v,{fmt:isN?(st.fmt||(Math.abs(v)<10&&v%1?'#,##0.00':'#,##0')):undefined,al:{horizontal:isN?'right':st.h||'left'},fill:st.fill||(cls==='t'?XC.mute:cls==='b'?'FFFAFAFA':cls==='g'?XC.hd2:undefined),font:{bold:cls==='a'||cls==='g'||st.bold,italic:cls==='b',color:st.color?{argb:st.color}:undefined}})});if(row.h)ws.getRow(r).height=row.h;r++});
  ws.__r=r+1;return r}
const xNote=(ws,text,opt={})=>{const r=ws.__r;ws.mergeCells(r,1,r,ws.__N);const x=xPut(ws,r,1,text,{box:false,font:{size:9,italic:!!opt.i,bold:!!opt.b,color:opt.color?{argb:opt.color}:undefined}});ws.getRow(r).height=opt.h||Math.max(15,Math.ceil(String(text).length/(ws.__N*9))*13);ws.__r=r+1};
const strip2=h=>String(h).replace(/<br\s*\/?>/g,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+\n/g,'\n').trim();
function xImg(wb,ws,img,cols,rows=16){if(!img)return;const id=wb.addImage({base64:img,extension:'png'}),r=ws.__r;ws.addImage(id,{tl:{col:cols[0],row:r-1},br:{col:cols[1],row:r-1+rows},editAs:'oneCell'});return r+rows}
function xImgs(wb,ws,img,ids){const N=ws.__N,half=Math.floor(N/2);let r=ws.__r;for(let i=0;i<ids.length;i+=2){const a=img[ids[i]],b=img[ids[i+1]];ws.__r=r;if(a)xImg(wb,ws,a,[0,ids[i+1]?half:N],15);if(b)xImg(wb,ws,b,[half,N],15);r+=16}ws.__r=r+1}
function xAssess(ws,d,sec,A){const b=A[sec]||[],rs=A.risk.filter(r=>r.sec===sec);
  if(b.length){xTable(ws,['Nhận xét'],b.map(x=>({v:[strip2(x)],h:Math.max(18,Math.ceil(strip2(x).length/170)*14)})),{hh:18});ws.mergeCells(ws.__r-1-b.length-1,1,ws.__r-1-b.length-1,ws.__N);for(let i=0;i<b.length;i++)ws.mergeCells(ws.__r-1-b.length+i,1,ws.__r-1-b.length+i,ws.__N)}
  if(rs.length)xRisk(ws,rs);
  const cm=(d.cmt||{})[sec];if(cm)xNote(ws,'Nhận xét của người lập / quản lý: '+cm,{b:true})}
function xRisk(ws,rs){const N=ws.__N,w=[2,4,1,2.5,4,1.2],tot=w.reduce((a,v)=>a+v,0);let acc=0,prev=0;
  const spans=w.map((v,i)=>{acc+=v;let b=i===w.length-1?N:Math.round(acc/tot*N);b=Math.max(b,prev+1);const a=prev+1;prev=b;return[a,Math.min(b,N)]});
  const cw=([a,b])=>{let x=0;for(let c=a;c<=b;c++)x+=ws.getColumn(c).width||9;return x};
  const hdr=['Hạng mục','Rủi ro / vấn đề','Mức độ','Bằng chứng','Hành động đề xuất','PIC'];
  let r=ws.__r;const put=(vals,st)=>{vals.forEach((v,i)=>{const [a,b]=spans[i];if(b>a)ws.mergeCells(r,a,r,b);xPut(ws,r,a,v,st(i));for(let c=a+1;c<=b;c++)ws.getCell(r,c).border=XBOX})};
  ws.mergeCells(r,1,r,N);xPut(ws,r,1,'Rủi ro & khuyến nghị',{font:{bold:true,size:11,color:{argb:XC.hd}},box:false});r++;
  put(hdr,()=>({font:{bold:true,color:{argb:'FFFFFFFF'}},fill:'FF2E7D5B',al:{horizontal:'center'}}));ws.getRow(r).height=20;r++;
  rs.forEach(x=>{const v=[x.item,strip2(x.risk),x.lvl,strip2(x.ev||''),x.act,x.pic||''];put(v,i=>i===2?{fill:x.lvl==='Cao'?XC.bad:x.lvl==='TB'?XC.warn:XC.ok,al:{horizontal:'center'},font:{bold:true}}:{});
    const lines=Math.max(...v.map((t,i)=>Math.ceil(String(t).length/Math.max(4,cw(spans[i])*1.05))));ws.getRow(r).height=Math.max(18,lines*12+6);r++});
  ws.__r=r+1}
function xMonth(ws,d,keys,ms,opt={}){const rows=[];const N=ws.__N;
  keys.forEach(k=>{const it=ESG_IND.find(i=>i.k===k),x=d.ind[k],sum=a=>a.reduce((s,v)=>s+(+v||0),0),has=a=>a&&a.some(v=>v!=null);
    const st=a=>a.map((v,i)=>({fill:ms.includes(i)&&!(x.tgt[i]!=null&&v!=null)?'FFF7FBFF':undefined}));
    rows.push({cls:'a',v:[`${it.n}`,it.u,...x.act,has(x.act)?sum(x.act):null],st:[{},{},...x.act.map((v,i)=>v==null||x.tgt[i]==null?{}:v<=x.tgt[i]?{fill:XC.ok,color:XC.okT}:{fill:XC.bad,color:XC.badT}),{}]});
    if(has(x.tgt))rows.push({cls:'t',v:['Chỉ tiêu 2026',it.u,...x.tgt,sum(x.tgt)]});
    if(has(x.base))rows.push({cls:'b',v:['Thực tế 2025',it.u,...x.base,sum(x.base)]});
    if(has(x.cost))rows.push({v:[it.cost||'Chi phí (VND)','VND',...x.cost,sum(x.cost)]});
    if(has(x.tgt)&&has(x.act))rows.push({v:['Đánh giá (O đạt · X không đạt)','',...x.act.map((v,i)=>v==null||x.tgt[i]==null?'':v<=x.tgt[i]?'O':'X'),''],st:[{},{},...x.act.map((v,i)=>({h:'center',bold:true,color:v==null||x.tgt[i]==null?undefined:v<=x.tgt[i]?XC.okT:XC.badT})),{}]});
    const nt=(x.note||[]).map((v,i)=>v?`T${i+1}: ${v}`:'').filter(Boolean);if(nt.length)rows.push({v:['Lý do / ghi chú: '+nt.join(' · '),...Array(14).fill(null)],h:28,note:true})});
  if(opt.co2){const c=co2Arr(d),f=+d.factor||0.72,t=Array.from({length:12},(_,i)=>d.ind.elec.tgt[i]!=null||d.ind.ac.tgt[i]!=null?((+d.ind.elec.tgt[i]||0)+(+d.ind.ac.tgt[i]||0))*f:null);
    rows.push({cls:'a',v:['CO2 từ điện (điện + điện lạnh)','kg',...c,c.reduce((s,v)=>s+(+v||0),0)],st:[{},{},...c.map((v,i)=>v==null||t[i]==null?{}:v<=t[i]?{fill:XC.ok,color:XC.okT}:{fill:XC.bad,color:XC.badT}),{}]});
    rows.push({cls:'t',v:[`Chỉ tiêu CO2 (= kWh × ${f})`,'kg',...t,t.reduce((s,v)=>s+(+v||0),0)]})}
  const r0=ws.__r+(opt.title?1:0)+1;xTable(ws,['Hạng mục','ĐVT',...MON,'Lũy kế'],rows,{title:opt.title,hh:20});
  rows.forEach((row,i)=>{if(row.note){ws.mergeCells(r0+i,1,r0+i,N);ws.getCell(r0+i,1).font={name:'Arial',size:8,italic:true}}})}
function xKz(ws,d,sec){const z=kzOf(d,sec);if(!z.length)return;const N=ws.__N;
  const rows=z.map(x=>({v:[x.area+(x.type?' – '+x.type:''),x.text,kzDet(x).filter(([h,v])=>typeof v==='string'||v<1).map(([h,v])=>`${h}: ${typeof v==='number'?pctE(v):v}`).join(' · ')||'Tất cả khu vực 100%',x.rate],st:[{bold:true},{},{},{fmt:'0%',h:'center',fill:x.rate==null?undefined:x.rate>=1?XC.ok:x.rate>=0.8?XC.warn:XC.bad}],h:Math.max(30,Math.ceil(x.text.length/110)*13)}));
  /* gộp cột cho vừa bề ngang */
  const r0=ws.__r+2;xTable(ws,['Lĩnh vực','Nội dung hoạt động','Chi tiết theo khu vực','Tỷ lệ thực hiện'],rows,{title:'Hoạt động cắt giảm (kaizen)',hh:20});
  const sp=[[1,2],[3,9],[10,N-1],[N,N]];for(let i=-1;i<rows.length;i++){const r=r0+i;const vals=[1,2,3,4].map(c=>ws.getCell(r,c).value),sts=[1,2,3,4].map(c=>({font:ws.getCell(r,c).font,fill:ws.getCell(r,c).fill,al:ws.getCell(r,c).alignment,fmt:ws.getCell(r,c).numFmt}));
    for(let c=1;c<=N;c++){const x=ws.getCell(r,c);x.value=null;x.fill={type:'pattern',pattern:'none'};x.border=XBOX}
    sp.forEach(([a,b],j)=>{if(b>a)ws.mergeCells(r,a,r,b);const x=ws.getCell(r,a);x.value=vals[j];x.font=sts[j].font;if(sts[j].fill)x.fill=sts[j].fill;x.alignment=sts[j].al;if(sts[j].fmt)x.numFmt=sts[j].fmt})}}
async function esgXlsx(d,per){
  await isoLoad();const wb=new ExcelJS.Workbook();wb.creator=session?.name||'';wb.created=new Date();
  const A=esgAssess(d,per),ms=ESG_PER[per],img=await esgChartImgs(d,Object.values(ESG_CH).flat(),900,330),W15=[34,7,...Array(12).fill(9),11];
  /* Tổng quan */
  {const ws=xSheet(wb,'TỔNG QUAN',`BẢNG TỔNG HỢP ESG – VĂN PHÒNG ${d.year} (${ESG_PER_L[per].toUpperCase()})`,d,per,[30,8,18,13,13,12,14,16,4,4,4,4,4,4,4]);
    const st=ESG_IND.map(i=>esgStat(d,i.k,ms)),cnt=s=>st.filter(x=>x.st===s).length,tot=cnt('ok')+cnt('bad');
    xTable(ws,['Tổng chỉ tiêu có số liệu','Đạt','Không đạt','Thiếu số liệu','Tỷ lệ đạt'],[{v:[tot,cnt('ok'),cnt('bad'),cnt('nodata'),tot?cnt('ok')/tot:0],st:[{h:'center'},{fill:XC.ok,color:XC.okT,bold:true},{fill:XC.bad,color:XC.badT,bold:true},{fill:XC.warn,bold:true},{fmt:'0%',bold:true}],h:22}],{hh:22});
    xTable(ws,['Chỉ tiêu','ĐVT','Tháng có số liệu','Thực tế','Chỉ tiêu','% chỉ tiêu','So cùng kỳ 2025','Đánh giá'],st.map(s=>{const it=ESG_IND.find(i=>i.k===s.k),lab=ESG_ST[s.st][1];return{v:[it.n,it.u,(s.have.length?monL(s.have):'–')+(s.miss.length?` (thiếu ${monL(s.miss)})`:''),s.have.length?s.a:null,s.t||null,s.r,s.chg,lab],st:[{bold:true},{},{},{},{},{fmt:'0%'},{fmt:'+0%;-0%;0%',color:s.chg==null?undefined:s.chg>0?XC.badT:XC.okT},{h:'center',bold:true,fill:s.st==='ok'?XC.ok:s.st==='bad'?XC.bad:s.st==='nodata'?XC.warn:XC.mute}]}}),{title:'Kết quả theo chỉ tiêu',hh:30});
    xNote(ws,'% chỉ tiêu = Thực tế ÷ Chỉ tiêu của các tháng có số liệu (≤ 100% là đạt). So cùng kỳ 2025 tính trên cùng các tháng.',{i:true});
    const concl=[...A.elec,...A.paper.slice(0,3),...A.fuel.slice(0,1)].map(strip2);xTable(ws,['Kết luận'],concl.map(x=>({v:[x],h:Math.max(18,Math.ceil(x.length/150)*13)})),{hh:18});
    for(let i=0;i<=concl.length;i++){const r=ws.__r-2-concl.length+i;ws.mergeCells(r,1,r,8)}
    if((d.cmt||{}).sum)xNote(ws,'Nhận xét: '+d.cmt.sum,{b:true});
    xImgs(wb,ws,img,ESG_CH.sum.map(x=>x[0]))}
  /* 1. Các chỉ tiêu */
  if((d.plan||[]).length){const ws=xSheet(wb,'1. CÁC CHỈ TIÊU',`CHỈ TIÊU KIỂM SOÁT ESG – SỬ DỤNG TÀI NGUYÊN VÀ NĂNG LƯỢNG ${d.year}`,d,per,[5,40,8,8,10,30,13,40,30]);
    xTable(ws,['STT','Hoạt động giảm thiểu','Duy trì','Chưa thực hiện','Dept/PIC','Mục tiêu','Thời gian áp dụng','Phương pháp định lượng','Ghi chú'],d.plan.map(p=>({cls:p.stt?'g':'',v:[p.stt,p.act,p.done?'✓':'',p.todo?'✓':'',p.dept,p.tgt,p.time,p.method,p.note],st:[{h:'center'},{},{h:'center',color:XC.okT,bold:true},{h:'center',color:'FF9C5700',bold:true}],h:Math.max(18,Math.ceil(Math.max(p.act.length/45,p.method.length/45,p.tgt.length/33,p.note.length/33))*12)})),{hh:30})}
  /* 2. Bảng tính chỉ tiêu */
  {const ws=xSheet(wb,'2. BẢNG TÍNH CHỈ TIÊU',`BẢNG TÍNH CHỈ TIÊU HOẠT ĐỘNG CẮT GIẢM TẠI VĂN PHÒNG ${d.year}`,d,per,[30,7,10,...Array(12).fill(9),11]);
    xTable(ws,['Nhân sự năm trước','Nhân sự năm nay','Doanh thu năm trước','Doanh thu ước tính','Tỷ lệ tăng chỉ tiêu','Hệ số CO2 (kg/kWh)'],[{v:[d.staff?.prev??null,d.staff?.cur??null,d.rev?.prev||'',d.rev?.cur||'',d.rev?.grow??null,+d.factor||0.72],st:[{},{},{h:'center'},{h:'center'},{fmt:'0%'},{fmt:'0.00'}]}],{hh:30});
    const rows=[];ESG_IND.forEach(i=>{const x=d.ind[i.k],sum=a=>a.reduce((s,v)=>s+(+v||0),0);if(x.base.some(v=>v!=null))rows.push({cls:'a',v:[i.n,i.u,'2025',...x.base,sum(x.base)]});if(x.tgt.some(v=>v!=null))rows.push({cls:'t',v:[x.base.some(v=>v!=null)?'':i.n,i.u,'Chỉ tiêu 2026',...x.tgt,sum(x.tgt)]})});
    xTable(ws,['Chỉ tiêu','ĐVT','',...MON,'Cả năm'],rows,{title:'Số liệu 2025 và chỉ tiêu tháng 2026',hh:20});
    xNote(ws,'Chỉ tiêu Q1 = giữ mức trung bình Q1/2025; Q2–Q4 = (tổng 2025 × (1 + tỷ lệ tăng theo doanh thu)) ÷ 11 tháng, theo cách tính trong file.',{i:true})}
  /* 3. Tiêu chí phòng ban */
  if((d.dept||[]).length){const mx=Math.max(...d.dept.map(t=>t.cols.length));const ws=xSheet(wb,'3. TIÊU CHÍ PHÒNG BAN','TIÊU CHÍ CHO CÁC PHÒNG BAN',d,per,[12,...Array(Math.max(mx,8)).fill(14)]);
    d.dept.forEach(t=>xTable(ws,['Phòng ban',...t.cols],dRows(t).map(r=>({cls:/total/i.test(r[0])?'t':'',v:r.map(v=>v==null?'':v),st:r.map(v=>typeof v==='number'&&v>0&&v<=1&&v%1?{fmt:'0%'}:{})})),{title:t.title,hh:42}));
    const it=d.itp||[];if(it.length){const t=d.dept.find(x=>/muc in/.test(norm(x.title)));if(t){const box=document.createElement('div');box.innerHTML=esgDeptPrint(d,per);const tb=box.querySelector('table');if(tb){const rows=[...tb.tBodies[0].rows].map(tr=>[...tr.cells].map(c=>{const s=c.textContent.trim().replace(/\./g,'');return /^\d+$/.test(s)?+s:c.textContent.trim()}));const hd=[...tb.tHead.rows[0].cells].map(c=>c.textContent.trim());
      xTable(ws,hd,rows.map(r=>({v:r})),{title:'Bản in thực tế theo phòng ban so với hạn mức AD đề xuất (trang / tháng)',hh:20})}}}}
  /* 4. Điện năng */
  {const ws=xSheet(wb,'4. ĐIỆN NĂNG - CO2','BÁO CÁO TÌNH HÌNH ĐIỆN NĂNG & HOẠT ĐỘNG CẮT GIẢM KHÍ THẢI CO2 TẠI VĂN PHÒNG',d,per,W15);
    xNote(ws,`[Số kWh điện tiêu thụ] × ${d.factor||0.72} = [Lượng khí thải kg CO2]. Ô xanh = đạt, ô đỏ = vượt chỉ tiêu tháng.`,{i:true});
    xMonth(ws,d,['elec','ac'],ms,{co2:true,title:'Theo dõi điện năng, điện lạnh OT và CO2 hàng tháng'});xImgs(wb,ws,img,ESG_CH.elec.map(x=>x[0]));xKz(ws,d,'elec');xAssess(ws,d,'elec',A)}
  /* 5. Giấy, in, chất thải */
  {const ws=xSheet(wb,'5. GIẤY, IN, CHẤT THẢI','BÁO CÁO LƯỢNG GIẤY IN / MỰC IN / CHẤT THẢI TẠI VĂN PHÒNG',d,per,W15);
    xMonth(ws,d,['paper','print','waste','battery','bottle'],ms,{title:'Theo dõi giấy, bản in, rác thải, pin, nước đóng chai'});xImgs(wb,ws,img,ESG_CH.paper.map(x=>x[0]));xKz(ws,d,'paper');xAssess(ws,d,'paper',A)}
  /* 6. Xăng */
  {const ws=xSheet(wb,'6. XĂNG','BÁO CÁO GHI NHẬN SỐ KM SỬ DỤNG XE HÀNG THÁNG TẠI VĂN PHÒNG',d,per,W15);
    xMonth(ws,d,['km','fuel'],ms,{title:'Theo dõi km xe và lít xăng hàng tháng'});xImgs(wb,ws,img,ESG_CH.fuel.map(x=>x[0]));xKz(ws,d,'fuel');xAssess(ws,d,'fuel',A)}
  /* 7. In theo phòng ban */
  if((d.itp||[]).length){const it=d.itp,used=MON.map((_,i)=>it.some(o=>o.m[i])?i:-1).filter(i=>i>=0);const ws=xSheet(wb,'7. REF-IT-PRINT',`SỐ LIỆU MỰC IN ${d.year} THEO PHÒNG BAN`,d,per,[10,...used.flatMap(()=>[8,8]),11,13]);
    const row=o=>[o.d,...used.flatMap(i=>{const x=o.m[i];return[x?x.b:null,x?x.c:null]}),o.m.reduce((a,x)=>a+(x?x.b+x.c:0),0),o.m.reduce((a,x)=>a+(x?x.bf+x.cf:0),0)];
    const T={d:'TỔNG',m:MON.map((_,i)=>it.some(o=>o.m[i])?it.reduce((a,o)=>{const x=o.m[i];return x?{b:a.b+x.b,c:a.c+x.c,bf:a.bf+x.bf,cf:a.cf+x.cf}:a},{b:0,c:0,bf:0,cf:0}):null)};
    xTable(ws,['Phòng ban',...used.flatMap(i=>[MON[i]+' T.đen',MON[i]+' Màu']),'Tổng bản in','Chi phí (VND)'],[...it.map(o=>({v:row(o)})),{cls:'t',v:row(T)}],{hh:30});xImgs(wb,ws,img,['ec-itp']);xAssess(ws,d,'itp',A)}
  /* Rủi ro & khuyến nghị */
  {const ws=xSheet(wb,'8. RỦI RO & KHUYẾN NGHỊ','ĐÁNH GIÁ RỦI RO & KHUYẾN NGHỊ',d,per,[14,14,16,16,16,9,14,16,16,16,14,10]);xRisk(ws,A.risk);
    xNote(ws,'Mức độ: Cao – ảnh hưởng trực tiếp tới việc đạt / chứng minh chỉ tiêu, cần xử lý trong tháng · TB – cần kế hoạch · Thấp – theo dõi, cải tiến.',{i:true});if((d.cmt||{}).risk)xNote(ws,'Nhận xét: '+d.cmt.risk,{b:true})}
  /* Kiểm tra số liệu */
  if((d.qa||[]).length){const ws=xSheet(wb,'9. KIỂM TRA SỐ LIỆU','KIỂM TRA CÔNG THỨC & SỐ LIỆU TRONG FILE ESG',d,per,[5,22,9,60,50,10]);
    xTable(ws,['#','Sheet','Ô','Vấn đề','Cách sửa','Mức độ'],d.qa.map((x,i)=>({v:[i+1,x.sheet,x.cell||'',x.issue,x.fix,x.lvl],st:[{h:'center'},{},{h:'center'},{},{},{h:'center',bold:true,fill:x.lvl==='Cao'?XC.bad:x.lvl==='TB'?XC.warn:XC.ok}],h:Math.max(30,Math.ceil(Math.max(x.issue.length/70,x.fix.length/58))*13)})),{hh:22})}
  wb.worksheets.forEach(ws=>{ws.pageSetup.printArea=`A1:${ws.getColumn(ws.__N).letter}${ws.__r}`});
  const buf=await wb.xlsx.writeBuffer(),[l,r]=await Promise.all([isoImg(ISO_LOGO.l),isoImg(ISO_LOGO.r)]);
  return isoHeaderLogos(buf,wb.worksheets.length,l,r)}
ACT['esg-xlsx']=async el=>{const {f,d}=esgF();if(!d)return;const b=el.closest('button');if(b)b.disabled=true;toast('Đang tạo file Excel báo cáo ESG…');
  try{const out=await esgXlsx(d,f.per),blob=new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=`ESG_REPORT_${d.year}_${f.per}_${todayStr()}.xlsx`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);toast('Đã xuất Excel báo cáo ESG')}
  catch(e){console.error(e);toast('Không tạo được file: '+e.message,'error')}finally{if(b)b.disabled=false}};
if(typeof module!=='undefined')module.exports={esgParse,esgStat,esgAssess};

/* ======================= NHẬP SỐ LIỆU THÁNG (4 sheet nhập hàng tháng) =======================
   4. Điện năng - CO2 · 5. Giấy, in, chất thải · 6. Xăng · 7. REF-IT-PRINT. Các sheet còn lại (1, 2, 3) lấy từ file, dùng để làm báo cáo. */
const ESG_DEPTS=['AD','PD','PUR','AZ','QC','ED','EC'];
function esgNewYear(y){const prev=esgDocs().find(x=>x.year<y),ind={};
  ESG_IND.forEach(i=>{const p=prev&&prev.ind[i.k];ind[i.k]={act:e12(),tgt:p?[...p.tgt]:e12(),cost:e12(),base:p?[...p.act]:e12(),baseCost:p?[...p.cost]:e12(),note:e12()}});
  return esgPack({id:'esg_'+y,kind:'esg',year:y,factor:prev?prev.factor:0.72,staff:prev?{...prev.staff}:{},rev:prev?{...prev.rev}:{},ind,
    kz:prev?JSON.parse(JSON.stringify(prev.kz||[])).map(z=>({...z,app:false})):[],plan:prev?JSON.parse(JSON.stringify(prev.plan||[])):[],dept:prev?JSON.parse(JSON.stringify(prev.dept||[])):[],
    itp:(prev&&prev.itp||ESG_DEPTS.map(d=>({d}))).map(o=>({d:o.d,m:Array(12).fill(null)})),qa:[],cmt:{},price:prev&&prev.price||2000,src:{file:'',at:new Date().toISOString(),by:session?.name||''}})}
ACT['esg-new']=el=>{const y=+el.dataset.y;if(!canESG()||esgDoc(y))return;const prev=esgDocs().find(x=>x.year<y);
  if(!confirm(`Tạo sổ ESG năm ${y}${prev?` (chép chỉ tiêu, hoạt động kaizen, các sheet ghi nhận từ năm ${prev.year}; số liệu ${prev.year} thành số so sánh)`:''}?`))return;
  if(esgSave(()=>db.ppe.push(esgNewYear(y)))){ui.esgY=String(y);ui.esgYnew=false;rerender();toast('Đã tạo sổ ESG năm '+y)}};

/* ======================= NHẬP SỐ LIỆU THEO SHEET (giống file Excel) =======================
   Menu ESG: Điện năng - CO2 · Giấy, in, chất thải · Xăng · Báo cáo.
   Mỗi trang là một bảng giống sheet Excel: hạng mục × T1…T12 + Tổng cộng. Ô trắng nhập được (tự lưu khi rời ô),
   dòng xám tự tính (CO2, chỉ tiêu CO2, chênh lệch, đánh giá O/X), dòng nghiêng là cùng kỳ năm trước. */
const esgYear=()=>{const ds=esgDocs();if(!ui.esgY||(!esgDoc(ui.esgY)&&ds.length&&!ui.esgYnew))ui.esgY=String(ds[0]?ds[0].year:new Date().getFullYear());return ui.esgY};
document.addEventListener('change',ev=>{const el=ev.target;if(el.id!=='esg-y')return;ui.esgY=el.value;ui.esgYnew=!esgDoc(el.value);rerender()});
const esgYearSel=()=>{const y=esgYear(),cy=new Date().getFullYear(),ys=[...new Set([...esgDocs().map(x=>x.year),cy,cy+1,+y])].sort((a,b)=>b-a);
  return `<label class="fl">Năm <select class="in" id="esg-y" aria-label="Năm">${ys.map(v=>`<option value="${v}" ${String(v)===String(y)?'selected':''}>${v}${esgDoc(v)?'':' (chưa có sổ)'}</option>`).join('')}</select></label>`};
/* định dạng số kiểu Việt Nam: 8.645.000 · 0,082 */
const EF={int:{d:0},dec:{d:2},dec1:{d:1},dec3:{d:3},pct:{d:0}};
const fmtE=(v,f='dec')=>v==null||v===''||Number.isNaN(+v)?'':new Intl.NumberFormat('vi-VN',{maximumFractionDigits:EF[f]?.d??2}).format(+v);
function parseE(str,f='dec'){let t=String(str??'').trim().replace(/\s|đ|%|vnd/gi,'');if(!t)return null;
  if(f==='int')t=t.replace(/[.,](?=\d{3}(\D|$))/g,'').replace(',','.');
  else{if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t))t=t.replace(/\./g,'').replace(',','.');else if(/^\d+,\d+$/.test(t))t=t.replace(',','.');else if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t))t=t.replace(/,/g,'');}
  const n=+t;return Number.isFinite(n)?n:NaN}
/* cấu hình từng sheet: các khối, mỗi khối là danh sách dòng */
const ESG_SHEETS={
  elec:{t:'Điện năng - CO2',icon:'⚡',title:y=>`BÁO CÁO TÌNH HÌNH ĐIỆN NĂNG & HOẠT ĐỘNG CẮT GIẢM KHÍ THẢI CO2 TẠI VĂN PHÒNG ${y}`,
    blocks:d=>{const f=+d.factor||0.72;const co2=k=>m=>{const v=d.ind[k].act[m];return v==null?null:v*f},tco2=k=>m=>{const v=d.ind[k].tgt[m];return v==null?null:v*f},diff=k=>m=>{const a=co2(k)(m),t=tco2(k)(m);return a==null||t==null?null:a-t};
      const blk=(k,n,l1,l2)=>({h:n,note:`[Số kWh ${l1}] × ${f} = [Lượng khí thải kg CO2]`,rows:[
        {t:'in',k,a:'act',l:`Số kWh ${l1} ${d.year}`,u:'kWh',f:'dec1'},{t:'in',k,a:'cost',l:`Số tiền ${l2} ${d.year}`,u:'VND',f:'int'},
        {t:'calc',id:k+'co2',l:'Số kg CO2 thải ra môi trường (1)',u:'kg CO2',f:'int',fn:co2(k),sum:true},
        {t:'in',k,a:'tgt',l:`Chỉ tiêu kWh ${d.year}`,u:'kWh',f:'int',cls:'tg'},
        {t:'calc',id:k+'tco2',l:'Chỉ tiêu kg CO2 (2) = chỉ tiêu kWh × '+f,u:'kg CO2',f:'int',fn:tco2(k),sum:true,cls:'tg'},
        {t:'calc',id:k+'dif',l:'Số kg CO2 tăng (+) / giảm (−) so với chỉ tiêu',u:'kg CO2',f:'int',fn:diff(k),sum:true,sign:true},
        {t:'eval',k,l:'Đánh giá (1) so với (2) – O: Đạt · X: Không đạt'},
        {t:'base',k,a:'base',l:`Thực tế cùng kỳ ${d.year-1}`,u:'kWh',f:'int'},{t:'base',k,a:'baseCost',l:`Tiền điện cùng kỳ ${d.year-1}`,u:'VND',f:'int'},
        {t:'note',k,l:'Ghi rõ lý do nếu thấy chỉ số bất thường'}]});
      return[blk('elec','1) Theo dõi lượng điện tiêu thụ hàng tháng','điện tiêu thụ','điện tiêu thụ'),blk('ac','2) Theo dõi lượng điện lạnh OT tiêu thụ hàng tháng (sau 18h)','điện lạnh OT tiêu thụ','điện lạnh OT')]}},
  paper:{t:'Giấy, in, chất thải',icon:'📄',title:y=>`BÁO CÁO LƯỢNG GIẤY IN / MỰC IN / CHẤT THẢI TẠI VĂN PHÒNG ${y}`,
    blocks:d=>[
      {h:'1) Theo dõi lượng giấy, mực in hàng tháng',rows:[
        {t:'in',k:'paper',a:'act',l:`1.1. Giấy in ${d.year}`,u:'ram',f:'dec1'},{t:'in',k:'paper',a:'tgt',l:`Chỉ tiêu ${d.year}`,u:'ram',f:'dec1',cls:'tg'},{t:'eval',k:'paper',l:'Đánh giá – O: Đạt · X: Không đạt'},{t:'base',k:'paper',a:'base',l:`Thực tế cùng kỳ ${d.year-1}`,u:'ram',f:'dec1'},{t:'note',k:'paper',l:'Ghi rõ lý do nếu thấy chỉ số bất thường'},
        {t:'sep'},
        {t:'in',k:'print',a:'act',l:'1.2. Số bản in mỗi tháng (trắng đen + màu)',u:'trang',f:'int'},{t:'in',k:'print',a:'cost',l:'Số tiền mực in',u:'VND',f:'int'},{t:'in',k:'print',a:'tgt',l:`Chỉ tiêu bản in ${d.year}`,u:'trang',f:'int',cls:'tg'},{t:'eval',k:'print',l:'Đánh giá – O: Đạt · X: Không đạt'},{t:'base',k:'print',a:'base',l:`Thực tế cùng kỳ ${d.year-1}`,u:'trang',f:'int'},{t:'note',k:'print',l:'Ghi rõ lý do nếu thấy chỉ số bất thường'}]},
      {h:'2) Theo dõi lượng rác thải hàng tháng',rows:[
        {t:'in',k:'waste',a:'act',l:`1.3. Lượng rác thải ${d.year}`,u:'tấn',f:'dec3'},{t:'in',k:'waste',a:'tgt',l:'Chỉ tiêu giảm lượng rác thải',u:'tấn',f:'dec3',cls:'tg'},{t:'eval',k:'waste',l:'Đánh giá – O: Đạt · X: Không đạt'},{t:'base',k:'waste',a:'base',l:`Thực tế cùng kỳ ${d.year-1}`,u:'tấn',f:'dec3'},{t:'note',k:'waste',l:'Ghi rõ lý do nếu thấy chỉ số bất thường'},
        {t:'sep'},
        {t:'in',k:'bottle',a:'act',l:'Nước uống đóng chai',u:'chai',f:'int'},{t:'in',k:'bottle',a:'tgt',l:'Chỉ tiêu (giảm 30%)',u:'chai',f:'int',cls:'tg'},{t:'eval',k:'bottle',l:'Đánh giá – O: Đạt · X: Không đạt'},{t:'base',k:'bottle',a:'base',l:`Thực tế cùng kỳ ${d.year-1}`,u:'chai',f:'int'}]},
      {h:'3) Báo cáo ghi nhận số pin thải bỏ',rows:[
        {t:'in',k:'battery',a:'act',l:'Số lượng pin thải bỏ',u:'viên',f:'int'},{t:'in',k:'battery',a:'tgt',l:'Chỉ tiêu (nếu có)',u:'viên',f:'int',cls:'tg'},{t:'eval',k:'battery',l:'Đánh giá – O: Đạt · X: Không đạt'},{t:'note',k:'battery',l:'Ghi chú (hình ảnh xử lý, đơn vị thu gom…)'}]}]},
  fuel:{t:'Xăng',icon:'🚗',title:y=>`BÁO CÁO GHI NHẬN SỐ KM SỬ DỤNG XE HÀNG THÁNG TẠI VĂN PHÒNG ${y}`,
    blocks:d=>[{h:'1) Theo dõi km xe và xăng hàng tháng',rows:[
      {t:'in',k:'km',a:'act',l:`Số km sử dụng xe ${d.year}`,u:'km',f:'int'},{t:'in',k:'fuel',a:'act',l:`Số lít xăng sử dụng ${d.year}`,u:'lít',f:'dec1'},
      {t:'calc',id:'l100',l:'Mức tiêu hao (lít / 100 km)',u:'lít',f:'dec1',fn:m=>{const k=d.ind.km.act[m],l=d.ind.fuel.act[m];return k&&l?l/k*100:null},sum:'avg'},
      {t:'calc',id:'fco2',l:`CO2 từ xăng (ước tính × ${FUEL_CO2} kg/lít)`,u:'kg CO2',f:'int',fn:m=>{const l=d.ind.fuel.act[m];return l==null?null:l*FUEL_CO2},sum:true},
      {t:'in',k:'km',a:'tgt',l:'Chỉ tiêu cắt giảm 10% km sử dụng xe',u:'km',f:'int',cls:'tg'},{t:'eval',k:'km',l:'Đánh giá – O: Đạt · X: Không đạt'},
      {t:'base',k:'km',a:'base',l:`Thực tế cùng kỳ ${d.year-1}`,u:'km',f:'int'},{t:'note',k:'km',l:'Ghi rõ lý do nếu thấy chỉ số bất thường'}]}]}};
const curM=d=>{const l=esgLast(d),n=new Date();return d.year===n.getFullYear()?Math.max(0,n.getMonth()-1):Math.min(11,l+1)};   /* tháng đang báo cáo (thường là tháng trước) */
function esgRowCells(d,r,cm){const sumOf=a=>{const v=a.filter(x=>x!=null);return v.length?v.reduce((s,x)=>s+ +x,0):null};
  const cls=m=>m===cm?' cm':'';
  if(r.t==='in'){const a=(d.ind[r.k][r.a]||e12());return MON.map((_,m)=>`<td class="gi${cls(m)}"><input class="gin" data-g="${r.k}|${r.a}|${m}" data-nf="${r.f}" value="${fmtE(a[m],r.f)}" inputmode="decimal" aria-label="${esc(r.l+' '+MON[m])}"></td>`).join('')+`<td class="gt" data-c="${r.k}|${r.a}|t">${fmtE(sumOf(a),r.f)}</td>`}
  if(r.t==='calc'){const v=MON.map((_,m)=>r.fn(m)),nn=v.filter(x=>x!=null),t=!nn.length?null:r.sum==='avg'?nn.reduce((s,x)=>s+x,0)/nn.length:nn.reduce((s,x)=>s+x,0);
    const sh=x=>x==null?'':`<span class="${r.sign?(x>0?'neg':'pos'):''}">${r.sign&&x>0?'+':''}${fmtE(x,r.f)}</span>`;return MON.map((_,m)=>`<td class="gc${cls(m)}" data-c="${r.id}|${m}">${sh(v[m])}</td>`).join('')+`<td class="gt" data-c="${r.id}|t">${sh(t)}</td>`}
  if(r.t==='eval'){const x=d.ind[r.k],ok=m=>x.act[m]==null||x.tgt[m]==null?'':x.act[m]<=x.tgt[m]?'<b class="ox o">O</b>':'<b class="ox x">X</b>';
    const hv=MON.map((_,m)=>m).filter(m=>x.act[m]!=null&&x.tgt[m]!=null),ta=hv.reduce((s,m)=>s+x.act[m],0),tt=hv.reduce((s,m)=>s+x.tgt[m],0);
    return MON.map((_,m)=>`<td class="gc ge${cls(m)}" data-c="ev${r.k}|${m}">${ok(m)}</td>`).join('')+`<td class="gt ge" data-c="ev${r.k}|t">${hv.length?(ta<=tt?'<b class="ox o">O</b>':'<b class="ox x">X</b>'):''}</td>`}
  if(r.t==='base'){const a=d.ind[r.k][r.a]||e12();return MON.map((_,m)=>`<td class="gb${cls(m)}">${fmtE(a[m],r.f)}</td>`).join('')+`<td class="gt gb">${fmtE(sumOf(a),r.f)}</td>`}
  if(r.t==='note'){const a=d.ind[r.k].note||e12();return MON.map((_,m)=>`<td class="gn${cls(m)}"><input class="gin gnt" data-g="${r.k}|note|${m}" value="${esc(a[m]||'')}" title="${esc(a[m]||'')}" placeholder="…" aria-label="${esc(r.l+' '+MON[m])}"></td>`).join('')+'<td class="gt"></td>'}
  return ''}
function esgGridHTML(d,b,cm){
  return `<section class="card esb"><h4>${esc(b.h)}</h4>${b.note?`<p class="note gnote">${esc(b.note)}</p>`:''}<div class="gw"><table class="gt-tbl"><colgroup><col class="c-l"><col class="c-u">${MON.map(()=>'<col class="c-m">').join('')}<col class="c-t"></colgroup>
    <thead><tr><th class="gl">Hạng mục</th><th class="gu">ĐVT</th>${MON.map((x,m)=>`<th class="${m===cm?'cm':''}">${x}</th>`).join('')}<th>Tổng cộng</th></tr></thead><tbody>
    ${b.rows.map(r=>r.t==='sep'?`<tr class="gsep"><td colspan="15"></td></tr>`:`<tr class="r-${r.t} ${r.cls||''}"><th class="gl" scope="row">${esc(r.l)}${r.t==='in'&&r.a!=='tgt'?'':''}</th><td class="gu">${esc(r.u||'')}</td>${esgRowCells(d,r,cm)}</tr>`).join('')}</tbody></table></div></section>`}
/* bảng kaizen như phần 3) của sheet: hoạt động × khu vực (%), tỷ lệ thực hiện */
function esgKzGrid(d,sec){const list=(d.kz||[]).map((x,i)=>({x,i})).filter(o=>o.x.sec===sec);
  if(!list.length)return `<section class="card esb"><h4>Hoạt động cắt giảm (kaizen)</h4><p class="note">Chưa có danh sách hoạt động. Nhập file ESG để lấy danh sách từ sheet.</p></section>`;
  const areas=[];list.forEach(({x})=>kzDet(x).forEach(([h])=>{if(!areas.includes(h))areas.push(h)}));
  const cell=(x,i,h)=>{const e=kzDet(x).find(z=>z[0]===h),v=e?e[1]:null;return `<td class="gi"><input class="gin" data-kz="${i}" data-kh="${esc(h)}" value="${v==null?'':typeof v==='number'?fmtE(v*100,'pct')+'%':esc(v)}" title="${typeof v==='string'?esc(v):''}" aria-label="${esc(h)}"></td>`};
  return `<section class="card esb"><h4>${{elec:3,paper:5,fuel:2}[sec]}) Theo dõi các hoạt động cắt giảm</h4><p class="note gnote">Nhập % thực hiện của từng khu vực (ví dụ 100% hoặc 50%) hoặc ghi chú ngắn; cột “Tỷ lệ thực hiện” tự tính trung bình các khu vực có số, sửa tay được.</p><div class="gw"><table class="gt-tbl kzt" style="min-width:${130+360+areas.length*88+110}px"><colgroup><col class="k-l"><col class="k-t">${areas.map(()=>'<col class="k-a">').join('')}<col class="k-r"></colgroup><thead><tr><th class="gl">Lĩnh vực</th><th class="gk">Nội dung hoạt động</th>${areas.map(h=>`<th class="ga">${esc(h)}</th>`).join('')}<th class="gr">Tỷ lệ thực hiện</th></tr></thead><tbody>
    ${list.map(({x,i})=>`<tr><th class="gl" scope="row">${esc(x.area)}${x.type?`<br><small>${esc(x.type)}</small>`:''}</th><td class="gk"><small>${esc(x.text)}</small></td>${areas.map(h=>cell(x,i,h)).join('')}<td class="gi gr"><input class="gin" data-kzr="${i}" value="${x.rate==null?'':fmtE(x.rate*100,'pct')+'%'}" aria-label="Tỷ lệ thực hiện"></td></tr>`).join('')}</tbody></table></div></section>`}
function esgSheetTiles(d,sec){const ks=ESG_IND.filter(i=>i.sec===sec&&['elec','ac','paper','print','waste','km','fuel'].includes(i.k)),y=ESG_PER.Y;
  return `<div class="kpis sm">${ks.map(i=>{const s=esgStat(d,i.k,y);return kpi(`${i.icon} ${i.n} – lũy kế`,s.have.length?`${fmtE(s.a,i.k==='waste'?'dec3':'int')} <small>${i.u}</small>`:'–',s.have.length?`${monL(s.have)}${s.r!=null?` · ${pctE(s.r)} chỉ tiêu`:''}${s.miss.length?` · thiếu ${monL(s.miss)}`:''}`:'chưa có số liệu',s.st==='ok'?'ok':s.st==='bad'?'bad':s.st==='nodata'?'warn':'info')}).join('')}</div>`}
function esgSheetPage(sec){const S=ESG_SHEETS[sec];
  return{t:'ESG · '+S.t,
    sub(){const d=esgDoc(esgYear());return d?`Năm ${d.year} · ô trắng nhập số (tự lưu khi rời ô) · dòng xám tự tính · dòng nghiêng là cùng kỳ ${d.year-1}`:''},
    head(){const d=esgDoc(esgYear());return `<div class="bar">${esgYearSel()}<div class="sp"></div><label class="btn" title="File ESG REPORT: lấy chỉ tiêu, các sheet ghi nhận và số liệu tháng">⬆ Nhập file ESG<input type="file" id="esg-file" accept=".xls,.xlsx,.xlsm" hidden></label>${d?'<a class="btn" href="#/esg/report">📊 Báo cáo</a>':''}</div>`},
    tbl(){const y=esgYear(),d=esgDoc(y);
      if(!d)return `<div class="empty"><b>Chưa có sổ ESG năm ${esc(y)}.</b><br>Bấm <b>⬆ Nhập file ESG</b> để lấy chỉ tiêu và số liệu từ file của phòng, hoặc <button class="btn sm primary" data-act="esg-new" data-y="${esc(y)}">＋ Tạo sổ năm ${esc(y)}${esgDocs().find(x=>x.year<+y)?' từ năm trước':''}</button>.</div>`;
      const cm=curM(d);
      return `<div class="esgs" data-sec="${sec}"><h3 class="estitle">${S.icon} ${esc(S.title(d.year))}</h3>${esgSheetTiles(d,sec)}${S.blocks(d).map(b=>esgGridHTML(d,b,cm)).join('')}${sec==='paper'?esgItpBlock(d):''}${esgKzGrid(d,sec)}</div>`}}}
PAGES['esg/elec']=esgSheetPage('elec');PAGES['esg/paper']=esgSheetPage('paper');PAGES['esg/fuel']=esgSheetPage('fuel');
/* cập nhật các ô tự tính tại chỗ (không vẽ lại cả bảng để không mất ô đang nhập) */
function esgRecalc(){const box=document.querySelector('.esgs');if(!box)return;const d=esgDoc(esgYear());if(!d)return;const sec=box.dataset.sec,tmp=document.createElement('div');
  tmp.innerHTML=ESG_SHEETS[sec].blocks(d).map(b=>esgGridHTML(d,b,curM(d))).join('')+`<div class="t2">${esgSheetTiles(d,sec)}</div>`;
  box.querySelectorAll('[data-c]').forEach(el=>{const n=tmp.querySelector(`[data-c="${CSS.escape(el.dataset.c)}"]`);if(n&&n.innerHTML!==el.innerHTML)el.innerHTML=n.innerHTML});
  const k=box.querySelector('.kpis'),k2=tmp.querySelector('.t2 .kpis');if(k&&k2)k.innerHTML=k2.innerHTML}
document.addEventListener('focusin',ev=>{const el=ev.target;if(el.classList&&el.classList.contains('gin')&&!el.dataset.nf)setTimeout(()=>el.select(),0);if(el.classList&&el.classList.contains('gin')&&el.dataset.nf){const v=parseE(el.value,el.dataset.nf);el.dataset.old=el.value;if(v!=null&&!Number.isNaN(v))el.value=String(v).replace('.',',');setTimeout(()=>el.select(),0)}});
document.addEventListener('focusout',ev=>{const el=ev.target;if(el.classList&&el.classList.contains('gin')&&el.dataset.nf&&el.dataset.g&&el.value===String(parseE(el.dataset.old,el.dataset.nf)??'').replace('.',','))el.value=el.dataset.old});
document.addEventListener('change',ev=>{const el=ev.target;if(!el.closest||!el.closest('.esgs'))return;if(!canESG())return;const d=esgDoc(esgYear());if(!d)return;
  if(el.dataset.g){const [k,a,ms]=el.dataset.g.split('|'),m=+ms;let v;
    if(a==='note')v=String(el.value||'').trim()||null;else{v=parseE(el.value,el.dataset.nf);if(Number.isNaN(v)){toast('Ô này cần nhập số (ví dụ 2.450 hoặc 0,082).','error');el.focus();return}if(v!=null&&v<0){toast('Số không được âm.','error');el.focus();return}}
    if(esgSave(()=>{const x=db.ppe.find(z=>z.id===d.id),o=x.ind[k];if(!o[a])o[a]=e12();o[a][m]=v;x.upd={at:new Date().toISOString(),by:session?.name||''}})){if(a!=='note'){el.value=fmtE(v,el.dataset.nf);el.dataset.old=el.value}el.classList.add('saved');setTimeout(()=>el.classList.remove('saved'),900);esgRecalc()}return}
  if(el.dataset.kz!=null||el.dataset.kzr!=null){const i=+(el.dataset.kz??el.dataset.kzr),raw=String(el.value||'').trim();
    const num=raw.replace(/%/g,'').trim(),isN=/^\d+([.,]\d+)?$/.test(num),val=raw===''?null:isN?(+num.replace(',','.'))/100:raw;
    if(typeof val==='number'&&val>1){toast('Tỷ lệ tối đa 100%.','error');el.focus();return}
    if(esgSave(()=>{const x=db.ppe.find(z=>z.id===d.id),z=x.kz[i];if(!z)return;
      if(el.dataset.kzr!=null)z.rate=typeof val==='number'?Math.max(0,Math.min(1,val)):null;
      else{const det=kzDet(z),e=det.find(q=>q[0]===el.dataset.kh);if(e)e[1]=val;else det.push([el.dataset.kh,val]);z.detail=det.map(([h,v])=>({h,v}));const nums=det.map(q=>q[1]).filter(v=>typeof v==='number');if(nums.length)z.rate=nums.reduce((s,v)=>s+v,0)/nums.length}
      z.app=true})){const z=esgDoc(esgYear()).kz[i];if(typeof val==='number')el.value=fmtE(val*100,'pct')+'%';const r=document.querySelector(`[data-kzr="${i}"]`);if(r&&document.activeElement!==r)r.value=z.rate==null?'':fmtE(z.rate*100,'pct')+'%';el.classList.add('saved');setTimeout(()=>el.classList.remove('saved'),900)}}});
/* Enter = xuống ô dưới, giống Excel */
document.addEventListener('keydown',ev=>{const el=ev.target;if(ev.key!=='Enter'||!el.classList||!el.classList.contains('gin'))return;ev.preventDefault();const td=el.closest('td'),tr=td.parentElement,idx=[...tr.children].indexOf(td);
  let n=tr.nextElementSibling;while(n&&!(n.children[idx]&&n.children[idx].querySelector('input')))n=n.nextElementSibling;const nx=n&&n.children[idx].querySelector('input');if(nx)nx.focus();else el.blur()});

/* ---------- 4) Số liệu in theo phòng ban (REF-IT-PRINT) trong trang Giấy, in ---------- */
function esgItpBlock(d){const m=ui.esgIpm!=null?+ui.esgIpm:curM(d),it=(d.itp&&d.itp.length?d.itp:ESG_DEPTS.map(x=>({d:x,m:Array(12).fill(null)}))),pr=+d.price||2000;
  const row=(o,j)=>{const x=(o.m||[])[m]||{};const c=(k,f)=>`<td class="gi"><input class="gin" data-ip="${j}" data-ik="${k}" data-nf="int" value="${x[k]!=null&&x[k]!==''?fmtE(x[k],'int'):''}" inputmode="numeric" aria-label="${esc(o.d+' '+k)}"></td>`;
    return `<tr><th class="gl" scope="row">${esc(o.d)}</th>${c('c')}${c('cf')}${c('b')}${c('bf')}<td class="gc" data-it="${j}">${x.c!=null||x.b!=null?fmtE((+x.c||0)+(+x.b||0),'int'):''}</td><td class="gc" data-itf="${j}">${x.c!=null||x.b!=null?fmtE((+x.cf||0)+(+x.bf||0),'int'):''}</td></tr>`};
  const used=MON.map((_,i)=>it.some(o=>o.m&&o.m[i])?i:-1).filter(i=>i>=0);
  return `<section class="card esb"><h4>4) Số liệu mực in theo phòng ban (REF-IT-PRINT)</h4>
    <div class="bar" style="margin:4px 0 8px"><label class="fl">Tháng <select class="in" id="esg-ipm">${MON.map((x,i)=>`<option value="${i}" ${i===m?'selected':''}>${x}${used.includes(i)?' ✓':''}</option>`).join('')}</select></label><label class="fl">Đơn giá <input class="in gin" id="esg-price" data-nf="int" value="${fmtE(pr,'int')}" style="width:90px"> đ / bản</label><div class="sp"></div><button type="button" class="btn sm" data-act="esg-itp-add">＋ Thêm phòng ban</button><button type="button" class="btn sm primary" data-act="esg-itp-save">💾 Lưu tháng ${m+1} và cập nhật dòng 1.2</button></div>
    <form id="esg-itp" data-m="${m}"><div class="gw"><table class="gt-tbl itpt"><colgroup><col class="i-l"><col><col><col><col><col><col></colgroup><thead><tr><th class="gl">Phòng ban</th><th>Bản màu</th><th>Phí màu (VND)</th><th>Bản trắng đen</th><th>Phí trắng đen (VND)</th><th>Tổng bản in</th><th>Tổng phí (VND)</th></tr></thead><tbody>${it.map(row).join('')}</tbody>
    <tfoot><tr><th class="gl">Tổng</th><td class="gt" id="itp-c"></td><td class="gt" id="itp-cf"></td><td class="gt" id="itp-b"></td><td class="gt" id="itp-bf"></td><td class="gt" id="itp-t"></td><td class="gt" id="itp-tf"></td></tr></tfoot></table></div></form>
    <p class="note">Để trống ô phí thì app tự tính = số bản × đơn giá. Bấm Lưu: số liệu phòng ban được lưu và dòng 1.2 (số bản in, số tiền mực in) của tháng ${m+1} lấy theo tổng bảng này.</p></section>`}
function esgItpTotals(){const fm=$('#esg-itp');if(!fm)return null;const pr=parseE($('#esg-price')?.value,'int')||2000,T={c:0,cf:0,b:0,bf:0},rows={};
  fm.querySelectorAll('[data-ip]').forEach(el=>{(rows[el.dataset.ip]=rows[el.dataset.ip]||{})[el.dataset.ik]=parseE(el.value,'int')});
  Object.entries(rows).forEach(([j,r])=>{const cf=r.cf??((r.c||0)*pr),bf=r.bf??((r.b||0)*pr),has=r.c!=null||r.b!=null;T.c+=r.c||0;T.b+=r.b||0;if(has||r.cf!=null)T.cf+=cf;if(has||r.bf!=null)T.bf+=bf;
    const a=fm.querySelector(`[data-it="${j}"]`),b=fm.querySelector(`[data-itf="${j}"]`);if(a)a.textContent=has?fmtE((r.c||0)+(r.b||0),'int'):'';if(b)b.textContent=has?fmtE((r.c!=null?cf:0)+(r.b!=null?bf:0),'int'):''});
  [['c',T.c],['cf',T.cf],['b',T.b],['bf',T.bf],['t',T.c+T.b],['tf',T.cf+T.bf]].forEach(([k,v])=>{const e=$('#itp-'+k);if(e)e.textContent=v?fmtE(v,'int'):''});return{T,rows,pr}}
document.addEventListener('input',ev=>{if(ev.target.closest&&(ev.target.closest('#esg-itp')||ev.target.id==='esg-price'))esgItpTotals()});
document.addEventListener('change',ev=>{if(ev.target.id==='esg-ipm'){ui.esgIpm=ev.target.value;refreshTbl();setTimeout(esgItpTotals,30)}});
const _esgTm=()=>setTimeout(esgItpTotals,30);PAGES['esg/paper'].tm=_esgTm;
ACT['esg-itp-add']=()=>{const n=prompt('Tên phòng ban (ví dụ HSE):');if(!n||!n.trim())return;const tb=document.querySelector('#esg-itp tbody');if(!tb)return;
  const name=n.trim().toUpperCase();if([...tb.rows].some(tr=>norm(tr.cells[0].textContent)===norm(name)))return toast('Phòng ban này đã có.','warn');
  const j=tb.rows.length,c=k=>`<td class="gi"><input class="gin" data-ip="${j}" data-ik="${k}" data-nf="int" inputmode="numeric" aria-label="${esc(name+' '+k)}"></td>`;
  tb.insertAdjacentHTML('beforeend',`<tr data-newd="${esc(name)}"><th class="gl" scope="row">${esc(name)} <small class="muted">mới</small></th>${c('c')}${c('cf')}${c('b')}${c('bf')}<td class="gc" data-it="${j}"></td><td class="gc" data-itf="${j}"></td></tr>`);tb.rows[j].querySelector('input').focus()};
ACT['esg-itp-save']=()=>{if(!canESG())return;const d=esgDoc(esgYear()),fm=$('#esg-itp');if(!d||!fm)return;const m=+fm.dataset.m,R=esgItpTotals();
  if([...fm.querySelectorAll('[data-ip]')].some(el=>Number.isNaN(parseE(el.value,'int'))))return toast('Có ô không phải số.','error');
  const it=(d.itp&&d.itp.length?d.itp:ESG_DEPTS.map(q=>({d:q}))).concat([...fm.querySelectorAll('tr[data-newd]')].map(tr=>({d:tr.dataset.newd})));
  if(esgSave(()=>{const x=db.ppe.find(z=>z.id===d.id);x.price=R.pr;
    x.itp=it.map((o,j)=>{const mm=[...(o.m||Array(12).fill(null))],r=R.rows[j];if(r){const has=['c','cf','b','bf'].some(k=>r[k]!=null);mm[m]=has?{c:r.c||0,cf:r.cf??((r.c||0)*R.pr),b:r.b||0,bf:r.bf??((r.b||0)*R.pr)}:null}return{d:o.d,m:mm}});
    const tot=R.T.c+R.T.b;if(tot){x.ind.print.act[m]=tot;x.ind.print.cost[m]=R.T.cf+R.T.bf}})){refreshTbl();_esgTm();toast(`Đã lưu số liệu in theo phòng ban tháng ${m+1}${R.T.c+R.T.b?' và cập nhật dòng 1.2':''}`)}};
