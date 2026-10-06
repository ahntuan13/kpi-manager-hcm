/* =====================================================================
   CẤU HÌNH – ĐÂY LÀ FILE DUY NHẤT BẠN CẦN SỬA KHI BẬT DÙNG CHUNG
   ===================================================================== */

/* Admin duy nhất của hệ thống (toàn quyền). Chỉ email này được "Thiết lập lần đầu".
   Nếu đổi, phải đổi cả dòng adminEmail() trong firestore.rules rồi dán lại Rules vào Firebase. */
const ADMIN_EMAIL = "ahntuan13@gmail.com";

/* Firebase:
   - Đang dùng project kpi-adhr-hcm. Đổi thành null: app chạy chế độ dùng thử (dữ liệu lưu trong trình duyệt từng máy, KHÔNG bảo mật giữa các vai trò).
   - Bật dùng chung: tạo project Firebase RIÊNG cho app này (xem README), rồi dán cấu hình vào, ví dụ:
       const FIREBASE_CONFIG = { apiKey:"...", authDomain:"...", projectId:"...", storageBucket:"...", messagingSenderId:"...", appId:"..." };  */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBJ1KRziEP6--szS1qCr5TDXia56Fe9F8U",
  authDomain: "kpi-adhr-hcm.firebaseapp.com",
  projectId: "kpi-adhr-hcm",
  storageBucket: "kpi-adhr-hcm.firebasestorage.app",
  messagingSenderId: "105700686797",
  appId: "1:105700686797:web:e92a5d9c09c0fe9cdf2284"
};
