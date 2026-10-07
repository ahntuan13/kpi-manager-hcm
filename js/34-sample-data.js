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
      const mm=pad(m),n=ri(12,16),ws=Array.from({length:n},()=>ri(4,10));let sum=ws.reduce((a,b)=>a+b,0);
      while(sum!==100){const k=ri(0,n-1);if(sum>100&&ws[k]>W_MIN){ws[k]--;sum--}else if(sum<100&&ws[k]<W_MAX){ws[k]++;sum++}}
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
          if(t.approval===AP_VAL.recheck)t.note='Thiếu file bằng chứng, cần bổ sung';
        }
        /* vài việc tháng trước chưa xong: có việc đã ghi "delays", có việc chỉ quá hạn */
        if(m===cm-1&&i===0&&ei===1&&t.submitted){t.approval=AP_VAL.recheck;t.note='Số liệu chưa khớp bảng chấm công, cần kiểm tra lại'}
        if(m===cm-1&&i===n-1&&[0,2,4].includes(ei)){t.submitted=null;t.approval='';t.note=ei===2?'Chờ nhà cung cấp phản hồi':'delays - xin dời sang tháng sau do vướng lịch đào tạo'}
        sh.months[mm].tasks.push(t);
      });
      /* người làm tốt thường nhận thêm việc phát sinh ngoài kế hoạch → tổng trọng số vượt 100, KPI trên 100 */
      if(m<cm&&q>=.9){const k=ei%3===1?ri(2,4):ri(0,2);for(let i=0;i<k;i++){const dl=iso(m,ri(8,27));sh.months[mm].tasks.push({id:uid('t')+'x'+ei+m+i,title:'Việc phát sinh: '+pool[ri(0,pool.length-1)].toLowerCase(),weight:ri(3,8),deadline:dl,submitted:rnd()<.5?isoOf(dayNum(dl)-ri(1,3)):dl,approval:AP_VAL.ok,note:'Phát sinh ngoài kế hoạch tháng'})}}
      /* người hay trễ: thỉnh thoảng còn việc tháng cũ chưa hoàn thành */
      if(m<cm-1&&q<.75&&rnd()<.45){const t=sh.months[mm].tasks[ri(0,n-1)];t.submitted=null;t.approval='';t.note='Chưa hoàn thành'}
      if(m<cm&&rnd()<.5)sh.months[mm].comment=['Hoàn thành tốt, chủ động báo cáo tiến độ.','Cần chú ý hạn nộp các báo cáo định kỳ.','Tinh thần trách nhiệm tốt, hỗ trợ đồng nghiệp tích cực.','Một số việc còn trễ, cần lập kế hoạch tuần rõ hơn.'][ri(0,3)];
    }
  });
  /* Chế độ cục bộ: thêm 2 tài khoản dùng thử để xem màn hình của Quản lý và Nhân viên (không tạo khi dùng Firebase) */
  if(!CLOUD){
    const add=(username,name,role,empId)=>{if(!db.users.some(x=>x.username===username))db.users.push({id:uid('u'),username,name,role,empId:empId||'',pass:pw(username+'123'),active:true});else{const x=db.users.find(x=>x.username===username);x.empId=empId||''}};
    add('quanly','Quản lý (dùng thử)','member','');add('nhanvien',db.employees[0].name+' (dùng thử)','staff',db.employees[0].id);
  }
  save();toast(CLOUD?'Đã nạp dữ liệu mẫu (tên nhân viên là giả)':'Đã nạp dữ liệu mẫu. Tài khoản thử: quanly / quanly123 và nhanvien / nhanvien123');
}
