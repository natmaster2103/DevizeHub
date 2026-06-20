# Equipment Management Desktop App — Design Spec

**Date:** 2026-06-18  
**Stack:** Electron + TypeScript + React + SQLite (Drizzle ORM)  
**Platform:** Windows, standalone, offline, single machine  

---

## 1. Tổng quan

App desktop quản lý trang thiết bị cấp phát cho các phòng ban nội bộ. Chạy hoàn toàn offline trên một máy Windows duy nhất. Dữ liệu lưu trong file SQLite local.

---

## 2. Kiến trúc

```
┌─────────────────────────────────────────┐
│              Electron App               │
│                                         │
│  ┌──────────────┐   ┌────────────────┐  │
│  │ Main Process │   │    Renderer    │  │
│  │              │◄──│  (React + UI)  │  │
│  │  - SQLite    │IPC│                │  │
│  │  - Drizzle   │──►│  - shadcn/ui   │  │
│  │  - File I/O  │   │  - TanStack    │  │
│  │  - Export    │   │    Table       │  │
│  └──────────────┘   └────────────────┘  │
└─────────────────────────────────────────┘
```

- **Main process** — xử lý database (Drizzle + better-sqlite3), xuất file (Excel/PDF), logic nghiệp vụ
- **Renderer process** — UI React, giao tiếp với main qua IPC handlers
- **IPC bridge** — `contextBridge` expose các API an toàn sang renderer, không expose Node.js trực tiếp
- **Build tool** — `electron-vite` (Vite + Electron, HMR trong dev)

---

## 3. Database Schema

### Bảng `categories` — Loại thiết bị
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| id | INTEGER PK | |
| name | TEXT | Ví dụ: Máy tính, Máy chiếu, Bàn ghế |
| min_stock | INTEGER | Ngưỡng cảnh báo tồn kho tối thiểu |
| created_at | TEXT | ISO 8601 |

### Bảng `departments` — Phòng ban
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| id | INTEGER PK | |
| name | TEXT | |
| created_at | TEXT | |

### Bảng `employees` — Người mượn
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| id | INTEGER PK | |
| name | TEXT | |
| employee_code | TEXT | Mã nhân viên |
| department_id | INTEGER FK | → departments |
| created_at | TEXT | |

### Bảng `app_users` — Người dùng phần mềm
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| id | INTEGER PK | |
| username | TEXT UNIQUE | |
| password_hash | TEXT | bcrypt |
| role | TEXT | `admin` hoặc `staff` |
| display_name | TEXT | |
| created_at | TEXT | |

### Bảng `devices` — Thiết bị
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| id | INTEGER PK | |
| sku | TEXT UNIQUE | Mã phân loại |
| name | TEXT | Tên thiết bị |
| category_id | INTEGER FK | → categories |
| serial_number | TEXT | Số serial (nếu có) |
| status | TEXT | `available` / `allocated` / `maintenance` / `broken` / `decommissioned` |
| notes | TEXT | Ghi chú chung |
| created_at | TEXT | |
| updated_at | TEXT | |

### Bảng `requests` — Phiếu Đề nghị
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| id | INTEGER PK | |
| code | TEXT UNIQUE | Mã phiếu, ví dụ: "DX-301" |
| department_id | INTEGER FK | → departments (phòng ban đề nghị) |
| employee_id | INTEGER FK | → employees (người đề nghị) |
| created_by | INTEGER FK | → app_users (người tạo phiếu trong hệ thống) |
| created_at | TEXT | ISO 8601 |
| notes | TEXT | Ghi chú |

> **Trạng thái phiếu** được suy ra từ các allocations liên quan: nếu còn bất kỳ thiết bị nào chưa trả (`returned_at IS NULL`) → **Đang trang bị**; tất cả đã trả → **Hoàn tất**.

### Bảng `allocations` — Lịch sử cấp phát
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| id | INTEGER PK | |
| request_id | INTEGER FK | → requests (nullable — cấp phát lẻ không cần phiếu) |
| device_id | INTEGER FK | → devices |
| employee_id | INTEGER FK | → employees |
| department_id | INTEGER FK | → departments |
| issued_by | INTEGER FK | → app_users (người cấp phát) |
| issued_at | TEXT | Ngày giờ cấp phát |
| due_date | TEXT | Ngày dự kiến trả (nullable) |
| returned_at | TEXT | Ngày giờ trả thực tế (null nếu chưa trả) |
| condition_out | TEXT | Tình trạng khi cấp phát |
| condition_in | TEXT | Tình trạng khi thu hồi |
| notes | TEXT | Ghi chú thêm |

### Bảng `maintenance_logs` — Bảo trì
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| id | INTEGER PK | |
| device_id | INTEGER FK | → devices |
| started_at | TEXT | |
| completed_at | TEXT | null nếu đang bảo trì |
| description | TEXT | Mô tả nội dung bảo trì |
| performed_by | TEXT | Đơn vị / người thực hiện |

---

## 4. Trạng thái thiết bị

```
available ──(cấp phát)──► allocated
    ▲                         │
    │(thu hồi)                │
    └─────────────────────────┘

available ──(gửi bảo trì)──► maintenance ──(xong)──► available
available ──(đánh dấu hỏng)──► broken
broken/available ──(thanh lý)──► decommissioned
```

| Trạng thái | Hiển thị | Màu gợi ý |
|-----------|----------|-----------|
| available | Trong kho | Xanh lá |
| allocated | Đang trang bị | Xanh dương |
| maintenance | Đang bảo trì | Vàng |
| broken | Hỏng | Đỏ |
| decommissioned | Thanh lý | Xám |

---

## 5. Màn hình & tính năng

### 5.1 Đăng nhập
- Form username / password
- Session lưu in-memory (thoát app = đăng xuất)
- Tài khoản admin mặc định tạo lần đầu khởi động

### 5.2 Dashboard
- Thẻ tổng quan: tổng thiết bị / đang cấp phát / đang bảo trì / hỏng
- Danh sách cảnh báo:
  - Thiết bị quá hạn trả (due_date < hôm nay, chưa trả)
  - Loại thiết bị dưới ngưỡng tồn kho tối thiểu
- Biểu đồ đơn giản: số lượt cấp phát theo tháng

### 5.3 Quản lý thiết bị
- Bảng danh sách với filter: SKU, tên, loại, trạng thái, phòng ban đang giữ
- Hỗ trợ quét barcode/QR (thiết bị đọc barcode gõ như bàn phím → ô tìm kiếm nhận input)
- Thêm / sửa / xem chi tiết thiết bị
- Tab "Lịch sử" trong chi tiết thiết bị: toàn bộ allocations + maintenance của thiết bị đó
- Chuyển trạng thái: gửi bảo trì, đánh dấu hỏng, thanh lý

### 5.4 Quản lý Phiếu Đề nghị
- Danh sách phiếu: mã phiếu, phòng ban, người đề nghị, ngày tạo, trạng thái (Đang trang bị / Hoàn tất)
- Tạo phiếu mới: nhập mã phiếu (ví dụ: "DX-301"), chọn phòng ban, người đề nghị, ghi chú
- Chi tiết phiếu: danh sách thiết bị thuộc phiếu, trạng thái từng thiết bị, nút thu hồi từng thiết bị
- Tìm kiếm / lọc theo mã phiếu, phòng ban, trạng thái

### 5.5 Cấp phát thiết bị
- **Cấp phát theo phiếu Đề nghị:** từ màn hình chi tiết phiếu, thêm thiết bị (filter `available`) vào phiếu — mỗi thiết bị tạo một allocation liên kết `request_id`
- **Cấp phát lẻ (không có phiếu):** form độc lập, `request_id = null`
- Sau khi lưu: thiết bị → `allocated`
- Danh sách đang cấp phát: highlight quá hạn, hiển thị mã phiếu nếu có

### 5.6 Thu hồi thiết bị
- Từ danh sách đang cấp phát, chọn "Thu hồi"
- Nhập tình trạng khi nhận lại, ghi chú
- Thiết bị → `available`

### 5.7 Bảo trì
- Tạo phiếu bảo trì cho thiết bị `available` hoặc `broken`
- Thiết bị → `maintenance`
- Đánh dấu hoàn thành → `available`

### 5.8 Báo cáo & Thống kê
- Lọc theo khoảng thời gian, phòng ban, loại thiết bị
- Bảng thống kê: số lượt cấp phát, tổng thời gian sử dụng, người mượn nhiều nhất
- Xuất **Excel** (exceljs) — danh sách thiết bị, lịch sử cấp phát
- Xuất **PDF** (pdfmake) — báo cáo tổng hợp

### 5.9 Danh mục
- CRUD loại thiết bị (categories) + ngưỡng tồn kho
- CRUD phòng ban (departments)
- CRUD nhân viên (employees)

### 5.10 Cài đặt & Phân quyền
- Quản lý tài khoản app (chỉ admin)
- Đổi mật khẩu
- Xem đường dẫn file database (để backup thủ công)

---

## 6. Phân quyền

| Tính năng | Admin | Staff |
|-----------|-------|-------|
| Xem dashboard | ✓ | ✓ |
| Xem danh sách thiết bị | ✓ | ✓ |
| Thêm / sửa thiết bị | ✓ | ✗ |
| Quản lý Phiếu Đề nghị | ✓ | ✓ |
| Cấp phát / Thu hồi | ✓ | ✓ |
| Bảo trì / Thanh lý | ✓ | ✗ |
| Báo cáo & Xuất file | ✓ | ✓ |
| Quản lý danh mục | ✓ | ✗ |
| Quản lý người dùng | ✓ | ✗ |

---

## 7. Cấu trúc thư mục dự án

```
equipment-manager/
├── electron/
│   ├── main/
│   │   ├── index.ts          # entry point main process
│   │   ├── db/
│   │   │   ├── schema.ts     # Drizzle schema
│   │   │   ├── migrate.ts    # migration runner
│   │   │   └── index.ts      # db instance
│   │   ├── handlers/         # IPC handlers (devices, allocations, reports...)
│   │   └── export/           # Excel & PDF export logic
│   └── preload/
│       └── index.ts          # contextBridge API
├── src/
│   ├── main.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Devices.tsx
│   │   ├── Requests.tsx
│   │   ├── Allocations.tsx
│   │   ├── Maintenance.tsx
│   │   ├── Reports.tsx
│   │   ├── Catalog.tsx
│   │   └── Settings.tsx
│   ├── components/
│   │   ├── ui/               # shadcn/ui components
│   │   ├── DeviceTable.tsx
│   │   ├── AllocateForm.tsx
│   │   └── StatusBadge.tsx
│   ├── lib/
│   │   ├── ipc.ts            # typed IPC client
│   │   └── utils.ts
│   └── hooks/
│       └── useDevices.ts
├── electron.vite.config.ts
├── drizzle.config.ts
└── package.json
```

---

## 8. Dependencies chính

| Package | Mục đích |
|---------|---------|
| `electron` | Desktop framework |
| `electron-vite` | Build tool |
| `react` + `react-dom` | UI framework |
| `typescript` | Type safety |
| `drizzle-orm` | ORM |
| `better-sqlite3` | SQLite driver (sync, phù hợp main process) |
| `@tanstack/react-table` | Data table |
| `shadcn/ui` + `tailwindcss` | UI components |
| `react-router-dom` | Routing giữa các trang |
| `exceljs` | Xuất Excel |
| `pdfmake` | Xuất PDF |
| `bcryptjs` | Hash mật khẩu |
| `date-fns` | Xử lý ngày giờ |
| `recharts` | Biểu đồ dashboard |

---

## 9. Xử lý lỗi & Edge cases

- Thiết bị `allocated` không thể cấp phát lần 2 — UI disable nút, handler kiểm tra trước khi insert
- Mã phiếu Đề nghị (code) phải unique — UI kiểm tra real-time khi nhập, handler từ chối insert nếu trùng
- Xóa phiếu Đề nghị đang có allocation active → chặn, báo lỗi rõ ràng
- Xóa nhân viên / phòng ban đang có allocation active → chặn, báo lỗi rõ ràng
- Database file bị khóa (hiếm gặp, single-machine) → thông báo restart app
- App crash giữa chừng khi cấp phát → dùng SQLite transaction để đảm bảo atomicity

---

## 10. Không nằm trong scope

- Đồng bộ nhiều máy / mạng nội bộ
- Ảnh đính kèm thiết bị
- Thông báo email / push notification
- Mobile app
