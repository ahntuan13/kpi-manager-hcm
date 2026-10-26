/* 03-kri.js – Tính điểm KRI giống file Excel "Individual KPIs – <tên>".
   Mỗi dòng chỉ tiêu có một Quy ước tính (công thức kiểu Excel, biến x = Kết quả tháng) cho ra % đạt (1 = 100%):
     IF(x=0,100%,IF(x=1,80%,IF(x=2,60%,0)))          số lỗi / số lần trễ
     MAX(0,100%-x*10%)                                  trừ dần 10% mỗi lỗi
     IF(ISBLANK(x),100%,IF(x>=90,110%,IF(x>=85,100%,90%)))   tỷ lệ càng cao càng tốt
   Điểm dòng = % đạt × trọng số (trọng số theo điểm, ví dụ 10).
   Hỗ trợ: số, %, "chuỗi", x, + - * / ^, = <> < <= > >=, & (nối chuỗi), ngoặc, hàm IF MAX MIN AND OR NOT ISBLANK ABS ROUND IFERROR.
   Giống Excel: ô Kết quả để trống là "blank" – ISBLANK(x) đúng, còn khi so sánh / tính toán thì coi như 0. */
'use strict';
(self.__mods=self.__mods||[]).push('03-kri');

function kxTokens(src){
  const s=String(src||'').replace(/^\s*=/,''),out=[];let i=0;
  while(i<s.length){
    const c=s[i];
    if(/\s/.test(c)){i++;continue}
    if(/[0-9.]/.test(c)){let j=i;while(j<s.length&&/[0-9.]/.test(s[j]))j++;if(s[j]==='E'||s[j]==='e'){let k=j+1;if(s[k]==='+'||s[k]==='-')k++;if(/[0-9]/.test(s[k]||'')){j=k;while(j<s.length&&/[0-9]/.test(s[j]))j++}}
      const v=Number(s.slice(i,j));if(!Number.isFinite(v))throw new Error('Số không hợp lệ: '+s.slice(i,j));out.push({t:'n',v});i=j;continue}
    if(c==='"'){let j=i+1,v='';while(j<s.length){if(s[j]==='"'){if(s[j+1]==='"'){v+='"';j+=2;continue}break}v+=s[j++]}if(j>=s.length)throw new Error('Thiếu dấu " đóng chuỗi');out.push({t:'s',v});i=j+1;continue}
    if(/[A-Za-z_]/.test(c)){let j=i;while(j<s.length&&/[A-Za-z0-9_.]/.test(s[j]))j++;out.push({t:'id',v:s.slice(i,j).toUpperCase()});i=j;continue}
    const two=s.slice(i,i+2);if(two==='<='||two==='>='||two==='<>'){out.push({t:'op',v:two});i+=2;continue}
    if('+-*/^=<>&%(),;'.includes(c)){out.push({t:c==='('||c===')'||c===','||c===';'?c===';'?',':c:'op',v:c});i++;continue}
    throw new Error('Ký tự lạ trong công thức: '+c);
  }
  return out;
}
/* phân tích theo độ ưu tiên của Excel: so sánh < & < + - < * / < ^ < dấu âm < % */
function kxParse(src){
  const tk=kxTokens(src);let p=0;
  const peek=()=>tk[p],eat=(t,v)=>{const x=tk[p];if(!x||x.t!==t||(v!==undefined&&x.v!==v))throw new Error('Công thức sai cú pháp gần '+(x?JSON.stringify(x.v??x.t):'cuối'));p++;return x};
  const isOp=(...v)=>peek()&&peek().t==='op'&&v.includes(peek().v);
  const cmp=()=>{let a=cat();while(isOp('=','<>','<','<=','>','>=')){const o=tk[p++].v;a={k:'bin',o,a,b:cat()}}return a};
  const cat=()=>{let a=add();while(isOp('&')){p++;a={k:'bin',o:'&',a,b:add()}}return a};
  const add=()=>{let a=mul();while(isOp('+','-')){const o=tk[p++].v;a={k:'bin',o,a,b:mul()}}return a};
  const mul=()=>{let a=pow();while(isOp('*','/')){const o=tk[p++].v;a={k:'bin',o,a,b:pow()}}return a};
  const pow=()=>{let a=una();while(isOp('^')){p++;a={k:'bin',o:'^',a,b:una()}}return a};
  const una=()=>{if(isOp('-')){p++;return{k:'neg',a:una()}}if(isOp('+')){p++;return una()}return pct()};
  const pct=()=>{let a=atom();while(isOp('%')){p++;a={k:'pct',a}}return a};
  const atom=()=>{const x=peek();if(!x)throw new Error('Công thức chưa hết');
    if(x.t==='n'){p++;return{k:'n',v:x.v}}
    if(x.t==='s'){p++;return{k:'s',v:x.v}}
    if(x.t==='('){p++;const e=cmp();eat(')');return e}
    if(x.t==='id'){p++;
      if(peek()&&peek().t==='('){p++;const args=[];if(!(peek()&&peek().t===')')){args.push(cmp());while(peek()&&peek().t===','){p++;args.push(peek()&&(peek().t===','||peek().t===')')?{k:'blank'}:cmp())}}eat(')');return{k:'fn',f:x.v,args}}
      if(x.v==='X')return{k:'x'};if(x.v==='TRUE')return{k:'n',v:1};if(x.v==='FALSE')return{k:'n',v:0};
      throw new Error('Không hiểu “'+x.v+'”: công thức chỉ dùng biến x (Kết quả tháng)')}
    throw new Error('Công thức sai cú pháp gần '+JSON.stringify(x.v??x.t))};
  const e=cmp();if(p<tk.length)throw new Error('Công thức thừa phần cuối: '+JSON.stringify(tk[p].v??tk[p].t));
  return e;
}
const KX_FN=new Set(['IF','MAX','MIN','AND','OR','NOT','ISBLANK','ABS','ROUND','IFERROR']);
/* blank = null; khi tính toán / so sánh coi như 0 (giống Excel) */
function kxEval(n,x){
  const num=v=>{if(v==null)return 0;if(typeof v==='number')return v;const f=Number(v);if(Number.isFinite(f))return f;throw new Error('#VALUE')},truthy=v=>typeof v==='string'?v!=='':num(v)!==0;
  const ev=n=>{switch(n.k){
    case 'n':case 's':return n.v;case 'x':return x;case 'blank':return null;
    case 'neg':return -num(ev(n.a));case 'pct':return num(ev(n.a))/100;
    case 'bin':{const a=ev(n.a),b=ev(n.b);
      if(n.o==='&')return String(a??'')+String(b??'');
      if(['=','<>','<','<=','>','>='].includes(n.o)){const sa=typeof a==='string',sb=typeof b==='string';let A=a,B=b;
        if(sa&&sb){A=a.toLowerCase();B=b.toLowerCase()}
        else if(sa||sb){if(a==null||b==null){A=a==null?'':String(a).toLowerCase();B=b==null?'':String(b).toLowerCase()}else{A=sa?1:0;B=sb?1:0}}   /* Excel: chữ luôn lớn hơn số */
        else{A=num(a);B=num(b)}
        return {'=':A===B,'<>':A!==B,'<':A<B,'<=':A<=B,'>':A>B,'>=':A>=B}[n.o]?1:0}
      const A=num(a),B=num(b);if(n.o==='/'&&B===0)throw new Error('#DIV/0!');
      return n.o==='+'?A+B:n.o==='-'?A-B:n.o==='*'?A*B:n.o==='/'?A/B:Math.pow(A,B)}
    case 'fn':{const a=n.args,f=n.f;
      if(!KX_FN.has(f))throw new Error('Hàm '+f+' chưa hỗ trợ');
      if(f==='IF')return truthy(ev(a[0]))?(a.length>1?ev(a[1]):1):(a.length>2?ev(a[2]):0);
      if(f==='IFERROR'){try{return ev(a[0])}catch(e){return ev(a[1])}}
      if(f==='ISBLANK'){const v=ev(a[0]);return v==null||v===''?1:0}
      if(f==='NOT')return truthy(ev(a[0]))?0:1;
      if(f==='AND')return a.every(z=>truthy(ev(z)))?1:0;
      if(f==='OR')return a.some(z=>truthy(ev(z)))?1:0;
      if(f==='ABS')return Math.abs(num(ev(a[0])));
      if(f==='ROUND'){const d=a.length>1?num(ev(a[1])):0,m=Math.pow(10,d);return Math.round(num(ev(a[0]))*m)/m}
      const v=a.map(z=>num(ev(z)));return f==='MAX'?Math.max(...v):Math.min(...v)}
  }};
  return ev(n);
}
const KX_CACHE=new Map();
/* Chạy quy ước: trả về % đạt (1 = 100%) hoặc null khi công thức trống / lỗi / ra chữ (ví dụ "N/A") */
function kxPct(src,res){
  const s=String(src||'').trim();if(!s)return null;
  let ast=KX_CACHE.get(s);if(ast===undefined){try{ast=kxParse(s)}catch(e){ast=null}KX_CACHE.set(s,ast)}
  if(!ast)return null;
  const t=typeof res==='string'?res.trim().replace(',','.'):res,x=t===''||t==null||Number.isNaN(t)?null:Number.isFinite(+t)?+t:String(res).trim();   /* chữ (ví dụ "-") giữ nguyên như Excel */
  try{const v=kxEval(ast,x);return typeof v==='number'&&Number.isFinite(v)?v:null}catch(e){return null}
}
const kxCheck=src=>{try{kxParse(src);return ''}catch(e){return e.message}};
/* Bảng quy đổi để xem nhanh: Kết quả 0, 1, 2, 3… → % đạt (gộp các giá trị cuối giống nhau thành "3+") */
function kxTable(src,xs){
  if(kxCheck(src))return [];
  if(!xs){   /* ngưỡng trong công thức (số không có %): quy ước theo tỷ lệ / số giờ thì thử tại các ngưỡng đó */
    const th=[...new Set((String(src).match(/(?<![\w.])\d+(?:\.\d+)?(?![\d.%\w])/g)||[]).map(Number))].sort((a,b)=>a-b);
    xs=th.length&&th[th.length-1]>5?[...new Set([...th.flatMap(t=>[t-1,t]),th[th.length-1]+1])].filter(v=>v>=0).sort((a,b)=>a-b):[0,1,2,3,4,5];
    if(xs.length>9)xs=xs.slice(-9);
  }
  const out=xs.map(x=>({x,p:kxPct(src,x)}));
  while(out.length>2&&out[out.length-1].p===out[out.length-2].p)out.pop();
  if(out.length<xs.length)out[out.length-1].plus=true;return out;
}
/* Chuyển công thức % của một ô Excel sang quy ước dùng biến x.
   resRef = ô Kết quả (ví dụ I12) → x; ô khác → giá trị của ô đó (trống = 0), giống lúc Excel tính. */
function kxFromExcel(formula,resRef,valOf){
  const R=String(resRef).replace(/\$/g,'').toUpperCase();
  let out='',i=0;const s=String(formula||'').replace(/^\s*=/,'');
  while(i<s.length){
    if(s[i]==='"'){let j=s.indexOf('"',i+1);if(j<0)j=s.length-1;out+=s.slice(i,j+1);i=j+1;continue}
    const m=/^\$?([A-Z]{1,3})\$?(\d+)(?![A-Za-z0-9_(])/.exec(s.slice(i));
    if(m&&!/[A-Za-z0-9_]/.test(s[i-1]||'')){const ref=m[1]+m[2];if(ref===R)out+='x';else{const v=valOf?valOf(ref):null;out+=typeof v==='number'?String(v):'0'}i+=m[0].length;continue}
    out+=s[i++];
  }
  return out;
}
if(typeof module!=='undefined')module.exports={kxTokens,kxParse,kxEval,kxPct,kxCheck,kxTable,kxFromExcel};
