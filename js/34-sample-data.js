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
    ['MAU-01','Trần Minh Khoa','S-AD','IT Support',.9,['Cài máy tính cho nhân viên mới','Bảo trì PC / laptop dự án','Rà soát license phần mềm','Báo cáo OT weekly','Gửi bảng chấm công cho nhân viên','Xử lý cảnh báo virus','Cập nhật danh sách thiết bị','Thu hồi máy nhân viên nghỉ việc','Kiểm tra camera văn phòng','Hỗ trợ cài VPN']],
    ['MAU-02','Lê Thị Hạnh','S-AD','HR Officer',.95,['Tổng hợp chấm công tháng','Đăng tin tuyển dụng','Phỏng vấn ứng viên vòng 1','Cập nhật hồ sơ nhân sự','Báo cáo biến động nhân sự','Làm thủ tục BHXH','Tổ chức đào tạo hội nhập','Rà soát hợp đồng sắp hết hạn']],
    ['MAU-03','Phạm Quốc Bảo','S-PD','Site Engineer',.7,['Lập tiến độ thi công tuần','Nghiệm thu hạng mục ống gió','Báo cáo an toàn công trường','Kiểm tra vật tư về công trường','Họp giao ban với thầu phụ','Cập nhật bản vẽ hoàn công','Lập hồ sơ thanh toán đợt']],
    ['MAU-04','Nguyễn Thu Trang','S-PU','Purchasing Staff',.85,['Lấy báo giá 3 nhà cung cấp','Lập PR / PO vật tư','Theo dõi giao hàng','Đối chiếu công nợ nhà cung cấp','Đánh giá nhà cung cấp quý','Cập nhật bảng giá vật tư']],
    ['MAU-05','Võ Thành Đạt','S-QC','QC Engineer',.6,['Kiểm tra chất lượng lắp đặt','Lập biên bản NCR','Theo dõi khắc phục NCR','Báo cáo chất lượng tháng','Kiểm định thiết bị đo','Đào tạo quy trình QC cho đội thi công']],
    ['MAU-06','Đặng Ngọc Mai','S-ED','Design Engineer',.92,['Thiết kế hệ thống HVAC','Bóc khối lượng','Phối hợp bản vẽ combine','Trả lời RFI của khách hàng','Cập nhật thư viện CAD / Revit','Tính tải lạnh']],
    ['MAU-07','Bùi Gia Huy','HCM-EC','Electrical Engineer',.8,['Thiết kế tủ điện điều khiển','Kiểm tra bản vẽ shop drawing điện','Test & commissioning','Lập danh mục vật tư điện','Hỗ trợ kỹ thuật công trường','Báo cáo tiến độ phần điện']],
    ['MAU-08','Hoàng Anh Thư','S-AZ','Accountant',.97,['Đối chiếu công nợ khách hàng','Lập báo cáo thuế tháng','Kiểm tra chứng từ thanh toán','Phân bổ chi phí dự án','Chốt sổ cuối tháng','Hỗ trợ kiểm toán']]
  ];
  E.forEach(([code,name,dept,title,q,pool],ei)=>{
    const e={id:uid('e')+ei,code,name,dept,title,email:'',note:'Dữ liệu mẫu',active:true,createdAt:Date.now()-ei*1000};db.employees.push(e);
    const sh={id:sheetId(e.id,y),empId:e.id,year:y,months:emptyMonths(),updatedAt:today,source:'Dữ liệu mẫu'};db.sheets.push(sh);
    for(let m=1;m<=cm;m++){
      const mm=pad(m),n=ri(5,8),ws=[];let left=100;
      for(let i=0;i<n;i++){const w=i===n-1?left:Math.max(5,Math.min(left-(n-1-i)*5,ri(8,24)));ws.push(w);left-=w}
      const titles=[...pool].sort(()=>rnd()-.5).slice(0,n);
      ws.forEach((w,i)=>{
        const dl=iso(m,ri(4,28)),t={id:uid('t')+ei+m+i,title:titles[i%titles.length],weight:w,deadline:dl,submitted:null,approval:'',note:''};
        const past=dl<today,r=rnd();
        if(m<cm||(past&&rnd()<.75)){
          const d=dayNum(dl);let sub;
          if(r<q*.25)sub=isoOf(d-ri(1,4));else if(r<q+.02)sub=dl;else sub=isoOf(d+ri(1,ei===4?9:5));
          if(sub>today)sub=today;
          t.submitted=sub;t.approval=rnd()<.8?'Đạt':'';t.note=rnd()<.4?'Done':rnd()<.3?'Đã gửi qua email':'';
        }
        /* vài việc tháng trước chưa xong: có việc đã ghi "delays", có việc chỉ quá hạn */
        if(m===cm-1&&i===n-1&&[0,2,4].includes(ei)){t.submitted=null;t.approval='';t.note=ei===2?'Chờ khách hàng phản hồi':'delays - xin dời sang tháng sau do vướng lịch công trường'}
        sh.months[mm].tasks.push(t);
      });
      /* người làm tốt thường nhận thêm việc phát sinh ngoài kế hoạch → tổng trọng số vượt 100, KPI trên 100 */
      if(m<cm&&q>=.9){const k=ei%3===1?ri(2,4):ri(0,2);for(let i=0;i<k;i++){const dl=iso(m,ri(8,27));sh.months[mm].tasks.push({id:uid('t')+'x'+ei+m+i,title:'Việc phát sinh: '+pool[ri(0,pool.length-1)].toLowerCase(),weight:ri(5,9),deadline:dl,submitted:rnd()<.5?isoOf(dayNum(dl)-ri(1,3)):dl,approval:'Đạt',note:'Phát sinh ngoài kế hoạch tháng'})}}
      /* người hay trễ: thỉnh thoảng còn việc tháng cũ chưa nộp */
      if(m<cm-1&&q<.75&&rnd()<.45){const t=sh.months[mm].tasks[ri(0,n-1)];t.submitted=null;t.approval='';t.note='Chưa hoàn thành'}
      if(m<cm&&rnd()<.5)sh.months[mm].comment=['Hoàn thành tốt, chủ động báo cáo tiến độ.','Cần chú ý hạn nộp các báo cáo định kỳ.','Tinh thần trách nhiệm tốt, hỗ trợ đồng nghiệp tích cực.','Một số việc còn trễ, cần lập kế hoạch tuần rõ hơn.'][ri(0,3)];
    }
  });
  save();toast('Đã nạp dữ liệu mẫu (tên nhân viên là giả)');
}
