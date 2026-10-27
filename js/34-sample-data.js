/* 34-sample-data.js – Nạp dữ liệu mẫu (8 nhân viên TÊN GIẢ, KPI từ tháng 1 đến tháng hiện tại) để xem thử */
'use strict';
(self.__mods=self.__mods||[]).push('34-sample-data');

function loadSample(){
  const u=db.users,c=db.company;db=defaultDB();db.users=u;db.company={...db.company,...c};
  let seed=20260107;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff},ri=(a,b)=>a+Math.floor(rnd()*(b-a+1));
  const y=+curYear(),cm=new Date().getMonth()+1,today=todayStr();
  const iso=(m,d)=>`${y}-${pad(m)}-${pad(Math.max(1,Math.min(d,new Date(y,m,0).getDate())))}`;
  /* [mã, tên, phòng, chức danh, mức đúng hạn 0–1, các việc thường làm] */
  const E=[
    ['MAU-01','Trần Minh Khoa','AD','IT Support',.9,['Cài máy tính cho nhân viên mới','Bảo trì PC / laptop dự án','Rà soát license phần mềm','Báo cáo OT weekly','Gửi bảng chấm công cho nhân viên','Xử lý cảnh báo virus','Cập nhật danh sách thiết bị','Thu hồi máy nhân viên nghỉ việc','Kiểm tra camera văn phòng','Hỗ trợ cài VPN']],
    ['MAU-02','Lê Thị Hạnh','HR','HR Officer',.95,['Tổng hợp chấm công tháng','Đăng tin tuyển dụng','Phỏng vấn ứng viên vòng 1','Cập nhật hồ sơ nhân sự','Báo cáo biến động nhân sự','Làm thủ tục BHXH','Tổ chức đào tạo hội nhập','Rà soát hợp đồng sắp hết hạn']],
    ['MAU-03','Phạm Quốc Bảo','AD','Admin Staff',.7,['Đặt vé và khách sạn công tác','Quản lý xe công ty','Mua văn phòng phẩm','Theo dõi hợp đồng thuê văn phòng','Chuẩn bị phòng họp, đón khách','Thanh toán điện, nước, internet','Kiểm kê tài sản văn phòng']],
    ['MAU-04','Nguyễn Thu Trang','HR','C&B Staff',.85,['Tính lương tháng','Lập báo cáo thuế TNCN','Đối chiếu BHXH','Cập nhật ngày phép','Trả lời thắc mắc lương của nhân viên','Làm thủ tục nghỉ việc']],
    ['MAU-05','Võ Thành Đạt','AD','GA Staff',.6,['Kiểm tra PCCC định kỳ','Theo dõi vệ sinh, an ninh văn phòng','Báo cáo chi phí hành chính tháng','Làm thẻ ra vào cho nhân viên mới','Sửa chữa nhỏ trong văn phòng','Tổ chức sự kiện nội bộ']],
    ['MAU-06','Đặng Ngọc Mai','HR','Recruiter',.92,['Sàng lọc hồ sơ ứng viên','Lên lịch phỏng vấn','Gửi thư mời nhận việc','Cập nhật báo cáo tuyển dụng tuần','Làm việc với trường đại học','Đăng tin tuyển dụng']],
    ['MAU-07','Bùi Gia Huy','AD','IT Support',.8,['Sao lưu dữ liệu máy chủ','Kiểm tra hệ thống mạng','Cài phần mềm cho dự án','Lập danh mục thiết bị thanh lý','Hỗ trợ kỹ thuật phòng họp','Báo cáo sự cố IT tháng']],
    ['MAU-08','Hoàng Anh Thư','HR','Training Officer',.97,['Lập kế hoạch đào tạo quý','Tổ chức lớp đào tạo nội bộ','Đánh giá sau đào tạo','Cập nhật hồ sơ đào tạo','Báo cáo chi phí đào tạo','Chuẩn bị tài liệu hội nhập']]
  ];
  E.forEach(([code,name,dept,title,q,pool],ei)=>{
    const e={id:uid('e')+ei,code,name,dept,title,email:'',note:'Dữ liệu mẫu',active:true,createdAt:Date.now()-ei*1000};db.employees.push(e);
    const sh={id:sheetId(e.id,y),empId:e.id,year:y,months:emptyMonths(),updatedAt:today,source:'Dữ liệu mẫu'};db.sheets.push(sh);
    for(let m=1;m<=cm;m++){
      /* trọng số do nhân viên tự chấm theo thang 1–10; cả tháng cộng lại đúng 100 */
      const mm=pad(m),v2=isV2(`${y}-${mm}`),target=v2?kpi2().userStd:100,n=v2?ri(10,13):ri(12,16),ws=Array.from({length:n},()=>ri(4,10));let sum=ws.reduce((a,b)=>a+b,0);
      while(sum!==target){const k=ri(0,n-1);if(sum>target&&ws[k]>W_MIN){ws[k]--;sum--}else if(sum<target&&ws[k]<W_MAX){ws[k]++;sum++}}
      if(v2){const L=ei%3===0?ri(1,3):ei===5?1:0,used=new Set();sh.months[mm].late=[];for(let j=0;j<L;j++){let d;do{d=iso(m,ri(1,Math.min(28,+today.slice(8)||28)))}while(used.has(d));used.add(d);sh.months[mm].late.push({id:uid('l')+ei+j,d,t:'08:'+pad(ri(6,40)),by:'Quản lý',at:today})}
        sh.months[mm].nc=ei===4?[{id:uid('n')+ei,d:iso(m,3),note:'Hồ sơ 5S khu vực kho chưa cập nhật',by:'Quản lý',at:today}]:[]}
      const titles=[...pool].sort(()=>rnd()-.5);
      ws.forEach((w,i)=>{
        const dl=iso(m,ri(4,28)),rep=Math.floor(i/titles.length),t={id:uid('t')+ei+m+i,title:titles[i%titles.length]+(rep?` (đợt ${rep+1})`:''),weight:w,deadline:dl,submitted:null,approval:'',note:''};
        const past=dl<today,r=rnd();
        if(m<cm||(past&&rnd()<.75)){
          const d=dayNum(dl);let sub;
          if(r<q*.25)sub=isoOf(d-ri(1,4));else if(r<q+.02)sub=dl;else sub=isoOf(d+ri(1,ei===4?9:5));
          if(sub>today)sub=today;
          /* tháng đã qua: quản lý đã duyệt gần hết; tháng trước còn vài việc chờ duyệt / Re-check; tháng này mới hoàn thành nên đang chờ duyệt */
          t.submitted=sub;t.approval=m<cm-1?(rnd()<.985?AP_VAL.ok:AP_VAL.recheck):m===cm-1?(rnd()<.8?AP_VAL.ok:''):(rnd()<.35?AP_VAL.ok:'');t.note=rnd()<.4?'Done':rnd()<.3?'Đã gửi qua email':'';
          if(t.approval===AP_VAL.recheck)t.mgrComment={text:'Thiếu file bằng chứng, cần bổ sung',by:'Quản lý',at:today,done:false};
        }
        /* vài việc tháng trước chưa xong (nên chuyển sang tháng này) */
        if(m===cm-1&&i===0&&ei===1&&t.submitted){t.approval=AP_VAL.recheck;t.mgrComment={text:'Số liệu chưa khớp bảng chấm công, cần kiểm tra lại',by:'Quản lý',at:today,done:false}}
        /* vài việc do quản lý giao (By Manager), có tag Ưu tiên / Quan trọng */
        if(m>=cm-1&&i===1&&ei%2===0){t.by='manager';t.byName='Quản lý';t.byAt=iso(m,1);t.tags=ei===0?['pri','imp']:ei===2?['imp']:['pri']}
        if(m===cm-1&&i===n-1&&[0,2,4].includes(ei)){t.submitted=null;t.approval='';t.note=ei===2?'Chờ nhà cung cấp phản hồi':'Xin dời sang tháng sau do vướng lịch đào tạo'}
        sh.months[mm].tasks.push(t);
      });
      /* quy chế 80/20: việc quản lý giao không dùng trọng số → bù phần trọng số đó vào việc By User để tổng đúng chuẩn */
      if(v2){const us=sh.months[mm].tasks.filter(t=>!byMgr(t));let diff=target-us.reduce((a,t)=>a+t.weight,0);for(const t of us){if(diff<=0)break;const add=Math.min(W_MAX-t.weight,diff);t.weight+=add;diff-=add}}
      /* người làm tốt thường nhận thêm việc phát sinh ngoài kế hoạch → tổng trọng số vượt 100, KPI trên 100 */
      if(m<cm&&q>=.9){const k=ei%3===1?ri(2,4):ri(0,2);for(let i=0;i<k;i++){const dl=iso(m,ri(8,27));sh.months[mm].tasks.push({id:uid('t')+'x'+ei+m+i,title:'Việc phát sinh: '+pool[ri(0,pool.length-1)].toLowerCase(),weight:ri(3,8),deadline:dl,submitted:rnd()<.5?isoOf(dayNum(dl)-ri(1,3)):dl,approval:AP_VAL.ok,note:'Phát sinh ngoài kế hoạch tháng'})}}
      /* người hay trễ: thỉnh thoảng còn việc tháng cũ chưa hoàn thành */
      if(m<cm-1&&q<.75&&rnd()<.45){const t=sh.months[mm].tasks[ri(0,n-1)];t.submitted=null;t.approval='';t.note='Chưa hoàn thành'}
      if(m<cm&&rnd()<.5)sh.months[mm].comment=['Hoàn thành tốt, chủ động báo cáo tiến độ.','Cần chú ý hạn nộp các báo cáo định kỳ.','Tinh thần trách nhiệm tốt, hỗ trợ đồng nghiệp tích cực.','Một số việc còn trễ, cần lập kế hoạch tuần rõ hơn.'][ri(0,3)];
    }
  });
  /* Việc làm chung mẫu: Lê Thị Hạnh + Đặng Ngọc Mai (tháng trước, đã hoàn thành) và một lời mời gửi tới nhân viên MAU-01 (tháng này) */
  {const E2=i=>db.employees[i],pm=cm>1?cm-1:1,mk=(eIdx,m,title,dl,sub,ap)=>{const sh=db.sheets.find(s=>s.empId===E2(eIdx).id),t={id:uid('t')+'g'+eIdx+m,title,weight:6,deadline:dl,submitted:sub,approval:ap,note:''};sh.months[pad(m)].tasks.push(t);return t};
    const g1={id:uid('g')+'1',title:'Tổ chức ngày hội tuyển dụng tại trường đại học',deadline:iso(pm,22),submitted:iso(pm,20),doneBy:{empId:E2(1).id,name:E2(1).name,at:iso(pm,20)},members:[E2(1).id,E2(5).id],invited:[],declined:[],names:{[E2(1).id]:E2(1).name,[E2(5).id]:E2(5).name},invitedBy:{},year:y,mm:pad(pm),by:'',byName:E2(1).name,createdAt:iso(pm,2)};
    mk(1,pm,g1.title,g1.deadline,g1.submitted,AP_VAL.ok).gid=g1.id;mk(5,pm,g1.title,g1.deadline,g1.submitted,'').gid=g1.id;
    const g2={id:uid('g')+'2',title:'Kiểm kê thiết bị IT cuối quý',deadline:iso(cm,25),submitted:null,doneBy:null,members:[E2(6).id],invited:[E2(0).id],declined:[],names:{[E2(6).id]:E2(6).name,[E2(0).id]:E2(0).name},invitedBy:{[E2(0).id]:{empId:E2(6).id,name:E2(6).name,at:today}},year:y,mm:pad(cm),by:'',byName:E2(6).name,createdAt:today};
    mk(6,cm,g2.title,g2.deadline,null,'').gid=g2.id;db.groups=[g1,g2]}
  /* PPE mẫu: danh mục nhân viên công trường và 2 phiếu cấp phát, tên giả */
  {const back=d=>isoOf(dayNum(today)-d);
    db.ppe=[{id:'pj_s1',kind:'proj',code:'MAU-A',name:'Nhà máy mẫu A',pic:'Mr Mẫu',status:'run'},{id:'pj_s2',kind:'proj',code:'MAU-B',name:'Văn phòng mẫu B',pic:'Ms Mẫu',status:'run'},
      {id:'pe_s1',kind:'pemp',code:'CN-01',name:'Ngô Văn Tài',dept:'Thi công',proj:'pj_s1',sz_shirt:'L',sz_pant:'L',sz_shoe:'41',sz_glove:'L',active:true},
      {id:'pe_s2',kind:'pemp',code:'CN-02',name:'Lý Minh Phúc',dept:'Thi công',proj:'pj_s1',sz_shirt:'M',sz_pant:'M',sz_shoe:'40',sz_glove:'M',active:true},
      {id:'pe_s3',kind:'pemp',code:'CN-03',name:'Trịnh Quang Vinh',dept:'Kỹ thuật',proj:'pj_s1',sz_shirt:'XL',sz_pant:'XL',sz_shoe:'42',active:true},
      {id:'pe_s4',kind:'pemp',code:'CN-04',name:'Mai Hữu Nghĩa',dept:'Văn phòng',proj:'pj_s2',sz_shirt:'L',sz_pant:'L',sz_shoe:'41',active:true},
      {id:'ps_s1',kind:'slip',no:`PPE-${back(12).replace(/-/g,'')}-001`,type:'ppe',proj:'pj_s1',dept:'Thi công',date:back(12),reqDate:back(25),puDate:back(14),note:'Dữ liệu mẫu',items:['pi_helm','pi_shoe','pi_glass'],
        lines:[{pid:'pe_s1',code:'CN-01',name:'Ngô Văn Tài',dept:'Thi công',q:{pi_helm:{n:1,sz:''},pi_shoe:{n:1,sz:'41'},pi_glass:{n:1,sz:''}},signed:true,signedAt:back(12)},
          {pid:'pe_s2',code:'CN-02',name:'Lý Minh Phúc',dept:'Thi công',q:{pi_helm:{n:1,sz:''},pi_shoe:{n:1,sz:'40'}},signed:false},{pid:'',code:'',name:'Visitor',dept:'',q:{pi_helm:{n:3,sz:''}},signed:true,signedAt:back(12)}],by:'Quản lý',at:back(12)},
      {id:'ps_s2',kind:'slip',no:`DP-${back(3).replace(/-/g,'')}-001`,type:'uni',proj:'pj_s2',dept:'Văn phòng',date:back(3),reqDate:'',puDate:'',note:'Dữ liệu mẫu',items:['pi_uni','pi_pant'],
        lines:[{pid:'pe_s4',code:'CN-04',name:'Mai Hữu Nghĩa',dept:'Văn phòng',q:{pi_uni:{n:2,sz:'L'},pi_pant:{n:2,sz:'L'}},signed:false}],by:'Quản lý',at:back(3)}];}
  /* Chế độ cục bộ: thêm 2 tài khoản dùng thử để xem màn hình của Quản lý và Nhân viên (không tạo khi dùng Firebase) */
  if(!CLOUD){
    const add=(username,name,role,empId)=>{if(!db.users.some(x=>x.username===username))db.users.push({id:uid('u'),username,name,role,empId:empId||'',pass:pw(username+'123'),active:true});else{const x=db.users.find(x=>x.username===username);x.empId=empId||''}};
    add('quanly','Quản lý (dùng thử)','member','');add('nhanvien',db.employees[0].name+' (dùng thử)','staff',db.employees[0].id);
  }
  save();toast(CLOUD?'Đã nạp dữ liệu mẫu (tên nhân viên là giả)':'Đã nạp dữ liệu mẫu. Tài khoản thử: quanly / quanly123 và nhanvien / nhanvien123');
}
