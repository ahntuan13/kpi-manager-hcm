/* 41-ppe-iso.js – Xuất phiếu cấp phát ra Excel theo đúng biểu mẫu ISO AZ-PG-440-A05 (Sổ cấp phát PPE):
     A4 ngang, header có logo trái / logo chứng nhận phải (lặp lại mỗi trang), footer có mã biểu mẫu + số trang,
     dòng cam kết ký nhận song ngữ dưới bảng.
     Sheet "PPE"       – PPE ALLOCATION BOOK: No · Receiver Name · Staff code · Helmet · Safety Belt · Safety Shoes (SL, size) · Ear Plug · Safety Glass · 3 cột trống / vật tư PPE khác · Date · Sign
     Sheet "Đồng phục" – PPE ALLOCATION:      No · Receiver Name · Staff code · Áo · Size · Quần · Size · (Giày · Size) · Date · Sign
   Phiếu có cả PPE và đồng phục → một file 2 sheet. Dùng ExcelJS (định dạng) + JSZip (gắn logo vào header của Excel), tải khi bấm xuất. */
'use strict';
(self.__mods=self.__mods||[]).push('41-ppe-iso');

const ISO_CODE='AZ-PG-440-A05 Rev.: 2024.0';
const ISO_NOTE_EN='Receiver must sign after receiving exact equipment, quantity and instruction of usage and preservation. Signature is equivalent to commitment of right usage and preservation.';
const ISO_NOTE_VI='Người được cấp phát ký nhận sau khi nhận đúng chủng loại, đủ số lượng và được hướng dẫn sử dụng, bảo quản. Ký nhận tương đương với cam kết sử và bảo quản đúng theo hướng dẫn.';
const ISO_LIBS=['https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js','https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'];
const ISO_LOGO={l:'assets/iso/logo-left.png',r:'assets/iso/logo-right.png'};
const isoLoad=async()=>{if(!window.ExcelJS)await loadScript(ISO_LIBS[0]);if(!window.JSZip)await loadScript(ISO_LIBS[1])};
const isoImg=async u=>{try{const r=await fetch(u);return r.ok?new Uint8Array(await r.arrayBuffer()):null}catch(e){return null}};
const BLUE='FF2F75B5',THIN={style:'thin',color:{argb:'FF000000'}},BOX={top:THIN,left:THIN,bottom:THIN,right:THIN};

/* các cột vật tư của từng mẫu: [{h, w, k:id, sz:true|false}] – sz = cột size đi kèm */
function isoCols(s,grp){const used=new Set(slipLines(s).flatMap(l=>Object.keys(l.q).filter(id=>+l.q[id].n>0)));
  const it=id=>pItem(id)||{};
  if(grp==='ppe'){const fixed=[['pi_helm','Helmet',8.5],['pi_harn','Safety Belt',9],['pi_shoe','Safety Shoes',6.2,true],['pi_ear','Ear Plug',8.2],['pi_glass','Safety Glass',7.6]];
    const cols=[];fixed.forEach(([id,h,w,sz])=>{cols.push({h,w,k:id,sz:false});if(sz)cols.push({h:'',w:6.5,k:id,sz:true,sub:true})});
    const extra=pItems('ppe',true).filter(i=>used.has(i.id)&&!fixed.some(f=>f[0]===i.id));
    extra.forEach(i=>cols.push({h:it(i.id).en||i.name,w:7,k:i.id,sz:false,mix:splitSz(i.sizes).length>0}));
    for(let n=extra.length;n<3;n++)cols.push({h:'',w:5.5,k:'',sz:false});
    return cols}
  const cols=[{h:'Áo',w:10.6,k:'pi_uni'},{h:'Size',w:11,k:'pi_uni',sz:true},{h:'Quần',w:9.3,k:'pi_pant'},{h:'Size',w:8.4,k:'pi_pant',sz:true}];
  pItems('uni',true).filter(i=>used.has(i.id)&&!['pi_uni','pi_pant'].includes(i.id)).forEach(i=>{cols.push({h:it(i.id).en||i.name,w:9,k:i.id});if(splitSz(i.sizes).length)cols.push({h:'Size',w:8,k:i.id,sz:true})});
  return cols}
function isoSheet(wb,s,grp){
  const ppe=grp==='ppe',ws=wb.addWorksheet(ppe?'PPE':'Đồng phục',{views:[{showGridLines:false}]});
  const cols=isoCols(s,grp),p=pProj(s.proj),font=ppe?{name:'Tahoma',size:10}:{name:'Times New Roman',size:13};
  const widths=ppe?[5.9,23,11,...cols.map(c=>c.w),10,20]:[6.8,30,13.5,...cols.map(c=>c.w),11.7,26.5];
  ws.columns=widths.map(w=>({width:w}));
  const N=widths.length,L=n=>ws.getColumn(n).letter;
  /* tiêu đề + dự án, gạch xanh như bản Word */
  const proj=[p?(p.code||p.name):'',s.dept&&!p?s.dept:''].filter(Boolean).join(' ');
  const line2=ppe?`Project/Department ;${proj}${p&&p.pic?' ;'+p.pic:''}${s.job?' ;Job No.: '+s.job:''}`:`Project/Department: ${proj}${s.job?'   Job No.: '+s.job:''}`;
  ws.getRow(1).height=6;
  const t=ws.getCell(`C2`);t.value=ppe?'PPE ALLOCATION BOOK':'PPE ALLOCATION';t.font={name:'Tahoma',size:10};
  const d=ws.getCell(`C3`);d.value=line2;d.font={name:'Tahoma',size:10};
  for(let c=3;c<=N-1;c++){const top=ws.getCell(2,c),bot=ws.getCell(3,c);if(!ppe)top.border={top:{style:'thin',color:{argb:BLUE}}};bot.border={bottom:{style:'thin',color:{argb:BLUE}}}}
  ws.getRow(2).height=18;ws.getRow(3).height=18;ws.getRow(4).height=14;
  /* bảng */
  const H=5,hr=ws.getRow(H);hr.height=ppe?40:18;
  const head=['No','Receiver Name','Staff code',...cols.map(c=>c.h),'Date','Sign'];
  head.forEach((h,i)=>{const c=hr.getCell(i+1);c.value=h;c.font=ppe?{name:'Tahoma',size:10}:font;c.border=BOX;c.alignment=ppe?{vertical:'middle',horizontal:i===1||i>=head.length-2?'center':'left',wrapText:true}:{vertical:'top',horizontal:'left'}});
  cols.forEach((c,i)=>{if(c.sub){ws.mergeCells(H,3+i,H,4+i)}});   /* Safety Shoes trùm 2 cột: SL + size */
  const ls=slipLines(s),rows=Math.max(15,ls.length);
  for(let r=0;r<rows;r++){const l=ls[r],row=ws.getRow(H+1+r);row.height=ppe?(r===0?26:18):18;
    const vals=[l?r+1:'',l?l.name:'',l?(l.code||''):'',...cols.map(c=>{if(!l||!c.k)return '';const v=l.q[c.k];if(!v||!(+v.n>0))return '';if(c.sz)return v.sz||'';return c.mix&&v.sz?`${+v.n} (${v.sz})`:+v.n}),l?fmtDate(l.signedAt||s.date):'',''];
    vals.forEach((v,i)=>{const c=row.getCell(i+1);c.value=v;c.font=font;c.border=BOX;c.alignment={vertical:ppe?'bottom':'top',horizontal:i===0||(ppe&&i>2&&i<vals.length-2)?'center':'left'}})}
  /* cam kết ký nhận song ngữ */
  const nr=H+rows+2;ws.mergeCells(nr,1,nr,N);ws.mergeCells(nr+1,1,nr+1,N);
  const a=ws.getCell(nr,1);a.value=ISO_NOTE_EN;a.font={name:'Tahoma',size:9,bold:true,italic:true};a.alignment={wrapText:true,vertical:'top'};ws.getRow(nr).height=26;
  const b=ws.getCell(nr+1,1);b.value=ISO_NOTE_VI;b.font={name:'Tahoma',size:9,italic:true};b.alignment={wrapText:true,vertical:'top'};ws.getRow(nr+1).height=26;
  /* trang in: A4 ngang, vừa 1 trang ngang, lặp tiêu đề bảng; header logo (gắn sau bằng JSZip), footer mã biểu mẫu + số trang */
  ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,horizontalCentered:true,printArea:`A1:${L(N)}${nr+1}`,printTitlesRow:`${H}:${H}`,
    margins:{left:0.5,right:0.5,top:0.95,bottom:0.75,header:0.3,footer:0.3}};
  ws.headerFooter={oddHeader:'&L&G&R&G',oddFooter:`&L&"Tahoma,Regular"&9${ISO_CODE}&R&"Tahoma,Regular"&9Page: &P / &N`};
  return ws;
}
/* gắn 2 logo vào header của mọi sheet (Excel dùng VML cho ảnh trong header/footer) */
async function isoHeaderLogos(buf,nSheets,imgL,imgR){
  if(!imgL&&!imgR)return buf;
  const z=await JSZip.loadAsync(buf);
  z.file('xl/media/hf_logo_l.png',imgL||imgR);z.file('xl/media/hf_logo_r.png',imgR||imgL);
  let ct=await z.file('[Content_Types].xml').async('string');
  if(!/Extension="vml"/.test(ct))ct=ct.replace('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>');
  if(!/Extension="png"/.test(ct))ct=ct.replace('<Default Extension="vml"','<Default Extension="png" ContentType="image/png"/><Default Extension="vml"');
  z.file('[Content_Types].xml',ct);
  const shape=(id,n,rid,w,h)=>`<v:shape id="${id}" o:spid="_x0000_s${1024+n}" type="#_x0000_t75" style="position:absolute;margin-left:0;margin-top:0;width:${w}pt;height:${h}pt;z-index:${n}"><v:imagedata o:relid="${rid}" o:title="${id}"/><o:lock v:ext="edit" rotation="t"/></v:shape>`;
  for(let i=1;i<=nSheets;i++){
    const vml=`<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="${i}"/></o:shapelayout><v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f"><v:stroke joinstyle="miter"/><v:formulas><v:f eqn="if lineDrawn pixelLineWidth 0"/><v:f eqn="sum @0 1 0"/><v:f eqn="sum 0 0 @1"/><v:f eqn="prod @2 1 2"/><v:f eqn="prod @3 21600 pixelWidth"/><v:f eqn="prod @3 21600 pixelHeight"/><v:f eqn="sum @0 0 1"/><v:f eqn="prod @6 1 2"/><v:f eqn="prod @7 21600 pixelWidth"/><v:f eqn="sum @8 21600 0"/><v:f eqn="prod @7 21600 pixelHeight"/><v:f eqn="sum @10 21600 0"/></v:formulas><v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/><o:lock v:ext="edit" aspectratio="t"/></v:shapetype>${shape('LH',1,'rId1',104,34)}${shape('RH',2,'rId2',104,25.5)}</xml>`;
    z.file(`xl/drawings/vmlDrawingHF${i}.vml`,vml);
    z.file(`xl/drawings/_rels/vmlDrawingHF${i}.vml.rels`,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/hf_logo_l.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/hf_logo_r.png"/></Relationships>`);
    const rp=`xl/worksheets/_rels/sheet${i}.xml.rels`,rf=z.file(rp);
    let rels=rf?await rf.async('string'):'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    rels=rels.replace('</Relationships>',`<Relationship Id="rIdHF1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawingHF${i}.vml"/></Relationships>`);z.file(rp,rels);
    const sp=`xl/worksheets/sheet${i}.xml`;let x=await z.file(sp).async('string');
    if(!/xmlns:r=/.test(x))x=x.replace('<worksheet ','<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    const tag='<legacyDrawingHF r:id="rIdHF1"/>',m=x.match(/<(picture|oleObjects|controls|webPublishItems|tableParts|extLst)[\s>]/);
    x=m?x.replace(m[0],tag+m[0]):x.replace('</worksheet>',tag+'</worksheet>');z.file(sp,x)}
  return z.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
function isoGroups(s){const t=new Set(slipLines(s).flatMap(l=>Object.keys(l.q).filter(id=>+l.q[id].n>0).map(id=>pItem(id)?.type||'ppe')));return ['ppe','uni'].filter(g=>t.has(g))}
async function isoBook(s){
  await isoLoad();
  const wb=new ExcelJS.Workbook();wb.creator=session?.name||'';wb.created=new Date();
  const gs=isoGroups(s);if(!gs.length)throw new Error('Phiếu chưa có vật tư nào.');
  gs.forEach(g=>isoSheet(wb,s,g));
  const buf=await wb.xlsx.writeBuffer(),[l,r]=await Promise.all([isoImg(ISO_LOGO.l),isoImg(ISO_LOGO.r)]);
  return isoHeaderLogos(buf,gs.length,l,r);
}
ACT['ps-iso']=async el=>{const s=pSlips().find(x=>x.id===el.dataset.id);if(!s)return;
  const b=el.closest('button');if(b)b.disabled=true;toast('Đang tạo file Excel theo mẫu ISO…');
  try{const out=await isoBook(s),blob=new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=`AZ-PG-440-A05_${s.no}${s.job?'_'+String(s.job).replace(/[^\w-]+/g,''):''}.xlsx`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);toast('Đã xuất Excel theo mẫu ISO')}
  catch(e){console.error(e);toast('Không tạo được file: '+e.message,'error')}finally{if(b)b.disabled=false}};
if(typeof module!=='undefined')module.exports={isoBook};
