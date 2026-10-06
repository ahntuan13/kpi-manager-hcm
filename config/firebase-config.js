/* =====================================================================
   CẤU HÌNH – ĐÂY LÀ FILE DUY NHẤT BẠN CẦN SỬA KHI BẬT DÙNG CHUNG
   ===================================================================== */

/* Admin duy nhất của hệ thống (toàn quyền). Chỉ email này được "Thiết lập lần đầu".
   Nếu đổi, phải đổi cả dòng adminEmail() trong firestore.rules rồi dán lại Rules vào Firebase. */
const ADMIN_EMAIL = "ahntuan13@gmail.com";

/* Firebase:
   - Để null: app chạy chế độ dùng thử (dữ liệu lưu trong trình duyệt từng máy, KHÔNG bảo mật giữa các vai trò).
   - Bật dùng chung: tạo project Firebase RIÊNG cho app này (xem README), rồi dán cấu hình vào, ví dụ:
       const FIREBASE_CONFIG = { apiKey:"...", authDomain:"...", projectId:"...", storageBucket:"...", messagingSenderId:"...", appId:"..." };  */
const FIREBASE_CONFIG = null;
