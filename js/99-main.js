/* 99-main.js – Khởi động ứng dụng */
'use strict';
(self.__mods=self.__mods||[]).push('99-main');

load();
if(!location.hash)history.replaceState(null,'','#/dash/overview');
/* Kiểm tra đủ file (phòng khi quên upload một file lên GitHub) */
{
  const need=['01-core-utils','02-data-model','10-ui-core','11-router-auth','20-dashboard','21-employees','23-import','31-reports','33-settings','34-sample-data','50-firebase-sync','51-cloud-backup','99-main'];
  const miss=need.filter(n=>!(self.__mods||[]).includes(n));
  if(miss.length){document.getElementById('app').innerHTML='<div style="padding:30px;font-family:sans-serif"><h2>Thiếu file chương trình</h2><p>Chưa tải được: <b>'+miss.map(n=>'js/'+n+'.js').join(', ')+'</b></p><p>Hãy upload đủ toàn bộ thư mục <code>js/</code> lên GitHub rồi tải lại trang (Ctrl+Shift+R).</p></div>';throw new Error('Thiếu module: '+miss.join(', '))}
}
if(CLOUD)cloudBoot();
else{
  const uid0=sessionStorage.getItem(SS_KEY),u=db.users.find(x=>x.id===uid0&&x.active);if(u&&ROLES[u.role])session={id:u.id,name:u.name,role:u.role,username:u.username,empId:u.empId||''};
  render(false);
}
self.__APP_BOOTED=true;
window.__kpi={get db(){return db},get session(){return session},ACT,SUB,PAGES,render,loadSample,parseKpiWorkbook,yearStats,scoreTask,get ready(){return CLOUD?cloudReady:true}};
