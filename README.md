# Quản lý KPI nhân viên – KPI Manager HCM

Web app đánh giá công việc của từng nhân viên theo **tháng / quý / năm**, dựng trên cùng kiến trúc với app **Quản lý Dự án – TPY** (menu trái, đăng nhập, phân quyền, Firebase, sao lưu, xuất Excel / PDF / In).
Chạy thuần trình duyệt, đưa lên GitHub Pages là dùng được.

Có 2 chế độ: **cục bộ** (lưu trong trình duyệt) và **Firebase** (cả phòng dùng chung dữ liệu, đồng bộ realtime, phân quyền ở máy chủ).

## Địa chỉ
- Repo: **https://github.com/ahntuan13/kpi-manager-hcm**
- App: **https://ahntuan13.github.io/kpi-manager-hcm/**

Chế độ cục bộ đăng nhập bằng `admin` / `admin123` (đổi mật khẩu ngay sau khi đăng nhập) → Settings → Sao lưu & Hệ thống → **Nạp dữ liệu mẫu** để xem thử (tên nhân viên trong dữ liệu mẫu là giả).

## Chức năng chính
- **Dashboard**: KPI trung bình phòng, KPI tháng gần nhất, tỷ lệ nộp đúng hạn, việc quá hạn, xếp loại; biểu đồ KPI theo tháng; ma trận nhân viên × 12 tháng; bảng xếp hạng.
- **Nhân viên**: danh sách, lọc theo phòng ban / năm; trang riêng từng người có **biểu đồ Tháng / Quý / Năm** (trục 0–130, vạch xếp loại 80 / 100 / 120, tooltip, nhãn giá trị) và **bảng việc từng tháng** đúng các cột của file Excel KPI.
- **Chuyển việc sang tháng sau**: nút chuyển chỉ bật khi việc **chưa nộp** và cột *Ghi chú / Link bằng chứng* có chữ **`delays`**. Khi chuyển, chọn giữ deadline gốc (tiếp tục tính trễ) hoặc dời deadline. Tháng cũ giữ lại dòng “Đã chuyển” (không tính trọng số, điểm) và có nút **Hoàn tác**. Có trang *Công việc → Chờ chuyển tháng* để chuyển hàng loạt.
- **Nhập Excel**: chọn một hoặc nhiều file theo mẫu `KPI_Individual_report` (sheet `Summary` + `M01…M12`); nhân viên chưa có sẽ được tạo theo Mã NV.
- **Công việc**: việc chưa nộp, quá hạn, chờ chuyển tháng, tất cả (lọc theo nhân viên / tháng / trạng thái).
- **Báo cáo**: theo nhân viên (năm), theo tháng, theo quý, theo phòng ban. Mọi báo cáo xuất **Excel**, **PDF**, **In**. Mỗi tháng của nhân viên in được **Phiếu đánh giá KPI** có chỗ ký.
- **Settings**: phòng ban, ngày nghỉ lễ, quy chế KPI, người dùng / phân quyền, sao lưu / khôi phục JSON, sao lưu đám mây.

## Công thức KPI (giữ theo file Excel)
| Mục | Quy tắc |
|---|---|
| Số ngày trễ | Nộp trễ: ngày lịch. Nộp sớm: ngày làm việc (bỏ Thứ 7, Chủ nhật, ngày lễ), không bao giờ bị tính thành trễ |
| Điểm cơ bản | 100 − 3 × số ngày trễ (không âm) |
| Điểm thưởng | 3 × số ngày sớm, tối đa 30; hoặc số nhập tay |
| Điểm thành phần | (Điểm cơ bản × Trọng số + Điểm thưởng) / 100 |
| KPI tháng | Tổng điểm thành phần, khống chế 0–130 |
| KPI quý / năm | Trung bình các tháng **đã có điểm và đã kết thúc**. Tháng chưa chấm không tính là 0; tháng đang diễn ra chỉ là điểm tạm tính |
| Xếp loại | Xuất sắc ≥ 120 · Tốt 100–119 · Đạt 80–99 · Cần cải thiện < 80 |

Hai điểm khác file Excel gốc (cố ý):
1. Sheet `Summary` của Excel lấy trung bình cả 12 tháng, tháng chưa chấm tính là 0. App chỉ tính tháng đã có điểm.
2. Công thức Excel tính nhầm “nộp sớm vào cuối tuần” thành trễ 1 ngày (ví dụ deadline Chủ nhật, nộp Thứ 7). App tính là đúng hạn.

## Cấu trúc thư mục
```
index.html                 Trang chính: chỉ nạp thư viện, cấu hình và các file js/ theo thứ tự
css/style.css              Toàn bộ giao diện
config/firebase-config.js  ⚙ Cấu hình Firebase – FILE DUY NHẤT cần sửa khi bật dùng chung
firestore.rules            Rules bảo mật dán vào Firebase Console
js/
  01-core-utils.js         Tiện ích chung (định dạng số, ngày, tìm kiếm không dấu)
  02-data-model.js         Mô hình dữ liệu, CÔNG THỨC KPI, chuyển việc “delays”; tải/lưu
  10-ui-core.js            Menu, toast, modal, form, bảng, biểu đồ, xuất Excel / PDF / in
  11-router-auth.js        Thanh menu trái, điều hướng, đăng nhập
  20-dashboard.js          Dashboard: Tổng quan, KPI theo tháng, Xếp hạng
  21-employees.js          Nhân viên: danh sách, phòng ban, trang chi tiết, bảng việc tháng, phiếu in
  22-tasks.js              Công việc: chưa nộp, quá hạn, chờ chuyển tháng, tất cả
  23-import.js             Nhập file Excel KPI cá nhân
  31-reports.js            Báo cáo: nhân viên, tháng, quý, phòng ban
  33-settings.js           Phòng ban & ngày lễ, Quy chế KPI, User / Permission, Sao lưu & Hệ thống
  34-sample-data.js        Dữ liệu mẫu (tên giả)
  50-firebase-sync.js      Firebase: đăng nhập, đồng bộ realtime, quản lý người dùng
  51-cloud-backup.js       Sao lưu đám mây: tự sao lưu mỗi ngày lên Firestore, khôi phục / tải về
  99-main.js               Khởi động, kiểm tra đủ file
```
Các file `js/` được nạp **theo thứ tự số**. Khi cập nhật, đổi số phiên bản `?v=` trong `index.html` để trình duyệt tải bản mới.

## Phân quyền
| Chức năng | Quản trị viên | Quản lý | Chỉ xem |
|---|---|---|---|
| Xem dashboard, nhân viên, công việc, báo cáo | ✔ | ✔ | ✔ |
| Thêm / sửa nhân viên, nhập Excel, thêm / sửa việc, duyệt, nhận xét, chuyển việc “delays” | ✔ | ✔ | — |
| Xoá nhân viên, phòng ban, ngày lễ, người dùng, sao lưu / khôi phục | ✔ | — | — |

## Bật Firebase (cả phòng dùng chung dữ liệu)
Tạo **project Firebase riêng** cho app này, không dùng chung project của app khác.
1. https://console.firebase.google.com → Create a project (ví dụ `kpi-manager-hcm`).
2. Trang chủ project → biểu tượng `</>` (Web) → Register app (không tick Hosting) → copy `firebaseConfig`.
3. **Authentication** → Get started → Sign-in method → **Email/Password** → Enable.
4. Authentication → Settings → **Authorized domains** → thêm `ahntuan13.github.io`.
5. **Firestore Database** → Create database → vị trí `asia-southeast1` → **Production mode**.
6. Tab **Rules** → dán nội dung `firestore.rules` → **Publish**.
7. Dán `firebaseConfig` vào `config/firebase-config.js` (thay `null`), commit.
8. Mở app → **Thiết lập lần đầu** → tạo quản trị viên → Settings → User / Permission để tạo tài khoản cho quản lý (vai trò **Quản lý**) và nhân viên (vai trò **Chỉ xem**).

Với Firebase, quyền được kiểm tra ở máy chủ bằng `firestore.rules`. `apiKey` trong `firebase-config.js` là khóa công khai theo thiết kế của Firebase, bảo mật nằm ở Rules.

## Lưu ý
- Repo này công khai và **không chứa dữ liệu KPI thật**. Dữ liệu nằm trong trình duyệt (chế độ cục bộ) hoặc trên Firebase của bạn.
- Chế độ cục bộ: mỗi trình duyệt / máy có dữ liệu riêng; hãy xuất **sao lưu JSON** định kỳ.
- Với Firebase: hai người sửa cùng một bảng KPI (một nhân viên, một năm) cùng lúc thì người lưu sau thắng.
- Thanh đỏ dưới màn hình cho biết **tên file và số dòng** gây lỗi; màn hình “Thiếu file chương trình” nghĩa là quên upload một file trong `js/`.

---
🔧 KPI Manager HCM · chỉ dùng trong nội bộ
