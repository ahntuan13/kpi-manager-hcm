# Quản lý KPI nhân viên – KPI Manager HCM

Web app đánh giá công việc của từng nhân viên theo **tháng / quý / năm**, dựng trên cùng kiến trúc với app **Quản lý Dự án – TPY** (menu trái, đăng nhập, phân quyền, Firebase, sao lưu, xuất Excel / PDF / In).
Chạy thuần trình duyệt, đưa lên GitHub Pages là dùng được.

Có 2 chế độ: **cục bộ** (lưu trong trình duyệt) và **Firebase** (cả phòng dùng chung dữ liệu, đồng bộ realtime, mỗi nhân viên chỉ đọc được việc của mình).

## Địa chỉ
- Repo: **https://github.com/ahntuan13/kpi-manager-hcm**
- App: **https://ahntuan13.github.io/kpi-manager-hcm/**

Chế độ dùng thử (chưa bật Firebase) đăng nhập bằng `admin` / `admin123` → Settings → Sao lưu & Hệ thống → **Nạp dữ liệu mẫu** để xem thử (tên nhân viên trong dữ liệu mẫu là giả).

## Chức năng chính
- **Dashboard**: KPI trung bình, KPI tháng gần nhất, tỷ lệ hoàn thành đúng hạn, xếp loại; biểu đồ KPI theo tháng; bảng việc quá hạn, việc chờ chuyển tháng, việc **chờ quản lý duyệt** và việc **Re-check**; ma trận nhân viên × 12 tháng.
- **Xếp hạng nhân viên** theo **tháng / quý / năm**: biểu đồ cột xếp từ cao xuống thấp, biểu đồ thứ hạng qua các tháng hoặc các quý, cột “so với kỳ trước” (▲ ▼).
- **Nhân viên**: danh sách, lọc theo nhóm / năm; trang riêng từng người có **biểu đồ Tháng / Quý / Năm** (trục 0–130, vạch xếp loại 80 / 100 / 120, tooltip, nhãn giá trị) và **bảng việc từng tháng** đúng các cột của file Excel KPI: Trọng số · Deadline · Ngày hoàn thành · Điểm cơ bản · Điểm thưởng (tự động) · Điểm thành phần · Quản lý duyệt · Ghi chú.
- **Trọng số** do nhân viên tự chấm cho từng việc theo thang **1–10** (số nguyên).
- **Quản lý duyệt** ngay trên bảng: **Duyệt** → điểm thành phần được tính vào KPI; **Re-check** → không tính điểm, dòng việc báo đỏ (nhân viên sửa lại thì việc quay về Chờ duyệt); **Chờ duyệt** → chưa tính. Có nút duyệt hàng loạt theo tháng, theo năm của một nhân viên, hoặc tất cả ở Tổng quan.
- **Giao việc (By Manager)**: Admin / Quản lý bấm **Giao việc** ở trang nhân viên hoặc danh sách nhân viên; việc được gắn nhãn **By Manager**, có thể gắn tag **Ưu tiên**, **Quan trọng**. Trọng số, deadline nhập như Thêm việc. Nhân viên cập nhật Ngày hoàn thành, Ghi chú, trọng số; không đổi được nội dung, deadline và không xoá được.
- **Comment by Manager**: khi chọn **Re-check**, ô comment hiện ở cột cuối bảng (và trong hộp Sửa việc) để quản lý ghi cần sửa gì. Nhân viên thấy comment; khi nhân viên cập nhật lại việc, việc quay về Chờ duyệt và comment hiện mờ, gạch đi.
- **Chuyển việc sang tháng sau**: nút **Chuyển sang tháng…** nằm trong hộp **Sửa việc**, luôn bật với việc **chưa hoàn thành** (không cần ghi `delays`). Ghi `delays` vào Ghi chú chỉ để việc được liệt kê ở Tổng quan. Khi chuyển, chọn giữ deadline gốc (tiếp tục tính trễ) hoặc dời deadline. Tháng cũ giữ lại dòng “Đã chuyển” (không tính trọng số, điểm) và có nút **Hoàn tác**. Việc ghi `delays` được liệt kê ở Dashboard → Tổng quan; dải 12 tháng của mỗi nhân viên đánh dấu tháng còn việc quá hạn.
- **Nhập Excel**: chọn một hoặc nhiều file theo mẫu `KPI_Individual_report` (sheet `Summary` + `M01…M12`); nhân viên chưa có sẽ được tạo theo Mã NV. Mặc định các việc đã có điểm trong file được coi là đã Duyệt (bỏ chọn được khi nhập). Cột Điểm thưởng của file không được đọc vì điểm thưởng luôn tính tự động.
- **Báo cáo**: theo nhân viên (năm), theo tháng, theo quý, theo nhóm. Mọi báo cáo xuất **Excel**, **PDF**, **In**. Mỗi tháng của nhân viên in được **Phiếu đánh giá KPI** có chỗ ký. Bản In / PDF của trang nhân viên có nhận xét của quản lý và 2 ô chữ ký (Nhân viên tự đánh giá · Quản lý duyệt); PDF không cắt ngang dòng, tiêu đề cột lặp lại ở đầu mỗi trang, khổ A4 ngang.
- **Settings** (chỉ Admin): nhóm, ngày nghỉ lễ, người dùng / phân quyền, sao lưu / khôi phục JSON, sao lưu đám mây. Mục **Quy chế KPI** ai cũng xem được.

## Công thức KPI (giữ theo file Excel)
| Mục | Quy tắc |
|---|---|
| Trọng số | Nhân viên tự chấm, số nguyên 1–10. Tổng trọng số chuẩn của một tháng là 100 |
| Số ngày trễ (F) | So Ngày hoàn thành với Deadline. Trễ: ngày lịch. Sớm: ngày làm việc (bỏ Thứ 7, Chủ nhật, ngày lễ), ra số âm, không bao giờ bị tính thành trễ |
| Điểm cơ bản (G) | 100 − 3 × số ngày trễ (không âm) |
| Điểm thưởng (H, tự động) | `=IF(F<0, MIN(30, ABS(F)*3), 0)`. Không nhập tay |
| Điểm thành phần (I) | `=(G × Trọng số + H) / 100`. Đây là điểm KPI của từng việc |
| Quản lý duyệt | Duyệt: tính điểm. Re-check: không tính điểm, báo đỏ. Chờ duyệt: chưa tính |
| KPI tháng | Tổng điểm thành phần của các việc **đã Duyệt**, khống chế 0–130 |
| KPI quý / năm | Trung bình các tháng **đã có điểm và đã kết thúc**. Tháng chưa có điểm không tính là 0; tháng đang diễn ra chỉ là điểm tạm tính |
| Xếp loại | Xuất sắc ≥ 120 · Tốt 100–119 · Đạt 80–99 · Cần cải thiện < 80 |

Hai điểm khác file Excel gốc (cố ý):
1. Sheet `Summary` của Excel lấy trung bình cả 12 tháng, tháng chưa có điểm tính là 0. App chỉ tính tháng đã có điểm.
2. Công thức Excel tính nhầm “hoàn thành sớm vào cuối tuần” thành trễ 1 ngày (ví dụ deadline Chủ nhật, hoàn thành Thứ 7). App tính là đúng hạn.

## Cấu trúc thư mục
```
index.html                 Trang chính: chỉ nạp thư viện, cấu hình và các file js/ theo thứ tự
css/style.css              Toàn bộ giao diện
config/firebase-config.js  ⚙ Cấu hình Firebase – FILE DUY NHẤT cần sửa khi bật dùng chung
firestore.rules            Rules bảo mật dán vào Firebase Console
js/
  01-core-utils.js         Tiện ích chung (định dạng số, ngày, tìm kiếm không dấu)
  02-data-model.js         Mô hình dữ liệu, CÔNG THỨC KPI, chuyển việc sang tháng sau; tải/lưu
  10-ui-core.js            Menu, toast, modal, form, bảng, biểu đồ, xuất Excel / PDF / in
  11-router-auth.js        Thanh menu trái, điều hướng, đăng nhập
  20-dashboard.js          Dashboard: Tổng quan, KPI theo tháng, Xếp hạng (tháng / quý / năm)
  21-employees.js          Nhân viên: danh sách, theo nhóm, trang chi tiết, bảng việc tháng, phiếu in
  23-import.js             Nhập file Excel KPI cá nhân
  31-reports.js            Báo cáo: nhân viên, tháng, quý, nhóm
  33-settings.js           Nhóm & ngày lễ, Quy chế KPI, User / Permission, Sao lưu & Hệ thống
  34-sample-data.js        Dữ liệu mẫu (tên giả)
  50-firebase-sync.js      Firebase: đăng nhập, đồng bộ realtime, quản lý người dùng
  51-cloud-backup.js       Sao lưu đám mây: tự sao lưu mỗi ngày lên Firestore, khôi phục / tải về
  99-main.js               Khởi động, kiểm tra đủ file
```
Các file `js/` được nạp **theo thứ tự số**. Khi cập nhật, đổi số phiên bản `?v=` trong `index.html` để trình duyệt tải bản mới.

## Phân quyền (3 vai trò)
| Chức năng | Admin | Quản lý | Nhân viên |
|---|---|---|---|
| Xem dashboard, công việc, báo cáo | ✔ tất cả | ✔ tất cả | Chỉ của chính mình |
| Xem danh sách nhân viên, xếp hạng, theo nhóm | ✔ | ✔ | — |
| Thêm / sửa việc, tự chấm trọng số 1–10, chuyển việc chưa hoàn thành sang tháng sau | ✔ mọi người | ✔ mọi người | Việc của mình (chưa được Duyệt) |
| Giao việc (By Manager), gắn tag Ưu tiên / Quan trọng | ✔ | ✔ | — |
| Duyệt / Re-check, Comment by Manager, nhận xét, dời deadline khi chuyển việc | ✔ | ✔ | — |
| Thêm / sửa / xoá nhân viên, nhập Excel KPI | ✔ | — | — |
| Settings: nhóm, ngày lễ, người dùng, sao lưu / khôi phục | ✔ | — | — |

- **Admin** là duy nhất: `ahntuan13@gmail.com` (khai báo ở `config/firebase-config.js` và `firestore.rules`). Admin tạo tài khoản cho Quản lý và Nhân viên ở Settings → User / Permission.
- Admin (và Quản lý) cũng là nhân viên: ở User / Permission, bấm Sửa tài khoản của mình rồi chọn **Gắn với nhân viên** để có mục **KPI của tôi**.
- **Nhân viên** phải được **gắn với một nhân viên** trong danh sách; họ chỉ thấy KPI, công việc, báo cáo của người đó. Gõ thẳng địa chỉ trang khác cũng bị đưa về “KPI của tôi”.
- Nhân viên không sửa / xoá được việc đã được quản lý **Duyệt**; chỉ xoá được việc chưa có ngày hoàn thành. Việc bị **Re-check** thì nhân viên sửa được; lưu xong việc quay về Chờ duyệt.
- Ô Quản lý duyệt chỉ hiện cho Admin / Quản lý. Lưu ý: Firestore Rules chặn nhân viên đọc và ghi bảng KPI của người khác, nhưng không kiểm tra được từng ô trong bảng của chính họ; việc khoá ô duyệt đối với nhân viên được làm ở giao diện.
- **Nhóm**: mỗi nhân viên thuộc một nhóm (mặc định `AD`, `HR`; sửa ở Settings → Nhóm & ngày lễ). Gán nhóm khi thêm / sửa nhân viên.

**Quan trọng:** phân quyền chỉ bảo mật thật khi bật **Firebase** (Rules ở máy chủ chặn nhân viên đọc bảng KPI của người khác). Ở chế độ dùng thử, mọi dữ liệu nằm chung trong trình duyệt của một máy; vai trò chỉ để xem trước giao diện. Nạp dữ liệu mẫu ở chế độ dùng thử sẽ tạo sẵn 2 tài khoản thử: `quanly` / `quanly123` và `nhanvien` / `nhanvien123` (xoá ở User / Permission khi không cần).

## Bật Firebase (cả phòng dùng chung dữ liệu)
App đang nối với project Firebase **`kpi-adhr-hcm`** (cấu hình trong `config/firebase-config.js`). Các bước dưới đây dùng khi dựng lại từ đầu hoặc đổi project.

Tạo **project Firebase riêng** cho app này, không dùng chung project của app khác.
1. https://console.firebase.google.com → Create a project (ví dụ `kpi-manager-hcm`).
2. Trang chủ project → biểu tượng `</>` (Web) → Register app (không tick Hosting) → copy `firebaseConfig`.
3. **Authentication** → Get started → Sign-in method → **Email/Password** → Enable.
4. Authentication → Settings → **Authorized domains** → thêm `ahntuan13.github.io`.
5. **Firestore Database** → Create database → vị trí `asia-southeast1` → **Production mode**.
6. Tab **Rules** → dán nội dung `firestore.rules` → **Publish**.
7. Dán `firebaseConfig` vào `config/firebase-config.js` (thay `null`), commit.
8. Mở app bằng địa chỉ có thêm `?setup=1` (ví dụ `https://ahntuan13.github.io/kpi-manager-hcm/?setup=1`) → bấm **Thiết lập lần đầu** → tạo tài khoản Admin bằng email `ahntuan13@gmail.com`. Ở địa chỉ thường, màn hình đăng nhập không hiện link này nên người dùng không nhìn thấy → thêm nhân viên (hoặc nhập Excel) → Settings → User / Permission để tạo tài khoản **Quản lý** và **Nhân viên** (mỗi tài khoản Nhân viên gắn với đúng một nhân viên).

**Mỗi khi file `firestore.rules` thay đổi phải dán lại vào Firebase Console → Firestore → Rules → Publish.** App tự kiểm tra sau khi đăng nhập: nếu Firebase còn chạy bản Rules cũ, đầu trang sẽ hiện cảnh báo vàng kèm link. Dấu hiệu thường gặp của Rules cũ: tài khoản Nhân viên thêm việc bị báo “Không có quyền thực hiện (Firestore Rules)”.

Với Firebase, quyền được kiểm tra ở máy chủ bằng `firestore.rules`. `apiKey` trong `firebase-config.js` là khóa công khai theo thiết kế của Firebase, bảo mật nằm ở Rules.

## Lưu ý
- Repo này công khai và **không chứa dữ liệu KPI thật**. Dữ liệu nằm trong trình duyệt (chế độ cục bộ) hoặc trên Firebase của bạn.
- Chế độ cục bộ: mỗi trình duyệt / máy có dữ liệu riêng; hãy xuất **sao lưu JSON** định kỳ.
- Với Firebase: hai người sửa cùng một bảng KPI (một nhân viên, một năm) cùng lúc thì người lưu sau thắng.
- Thanh đỏ dưới màn hình cho biết **tên file và số dòng** gây lỗi; màn hình “Thiếu file chương trình” nghĩa là quên upload một file trong `js/`.

---
🔧 KPI Manager HCM · chỉ dùng trong nội bộ
