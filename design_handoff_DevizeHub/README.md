# Handoff: Hệ thống Quản lý Thiết bị (Equipment Management System)

## Overview
Ứng dụng desktop (Windows / Electron, hoạt động **offline**) để quản lý và theo dõi việc cấp phát thiết bị cho các phòng ban nội bộ. Người dùng đăng nhập, quản lý thiết bị, tạo phiếu đề nghị (Phiếu Đề nghị), cấp phát / thu hồi thiết bị, và chạy báo cáo.

- **Stack mục tiêu**: React + shadcn/ui + Tailwind CSS
- **Ngôn ngữ giao diện**: Tiếng Việt
- **Nền tảng**: Electron desktop app, dữ liệu cục bộ (SQLite/file), không cần mạng

## About the Design Files
Các file trong gói này là **bản thiết kế tham chiếu được dựng bằng HTML** (một Design Component duy nhất) — chúng minh hoạ giao diện và hành vi mong muốn, **không phải mã nguồn production để copy trực tiếp**.

Nhiệm vụ là **tái dựng lại các thiết kế này trong codebase mục tiêu** (React + shadcn/ui + Tailwind) theo các pattern và thư viện sẵn có của dự án. Cụ thể:
- Mỗi "màn hình" trong prototype → một route/page hoặc component trong app thật.
- Các badge / dialog / table / card tự dựng trong HTML → thay bằng component tương ứng của **shadcn/ui** (`Card`, `Table`, `Badge`, `Dialog`, `Button`, `Input`, `Select`, `Tabs`, `Checkbox`...).
- Biểu đồ (nếu khôi phục lại) → dùng **recharts**.

Đừng nhúng thẳng file HTML vào Electron — hãy coi nó là đặc tả trực quan.

## Fidelity
**High-fidelity (hifi).** Prototype có màu sắc, typography, khoảng cách và tương tác gần như cuối cùng. Hãy tái dựng pixel-perfect bằng thư viện sẵn có của codebase. Các giá trị màu/spacing/typography chính xác liệt kê ở mục **Design Tokens**.

---

## Kiến trúc chung (App Shell)

Bố cục toàn app: **Sidebar trái (collapsible) + Topbar + vùng nội dung**.

### Sidebar (trái)
- Rộng **232px** khi mở rộng, **68px** khi thu gọn (transition width .18s). Sticky, cao 100vh.
- Header: logo vuông 32px (bo góc 8px, nền primary, icon lưới 4 ô trắng) + chữ "EquipHub" (14px/700). Cao 56px, border-bottom.
- Nav items (icon 18px + nhãn): **Tổng quan, Thiết bị, Phiếu đề nghị, Cấp phát lẻ, Báo cáo, Danh mục, Cài đặt**.
  - Item active: nền `--primary-tint` (≈ primary 15% alpha), chữ primary, weight 600.
  - Item thường: chữ `--text-muted`; hover nền `--hoverbg`.
- Footer sidebar: nút "Thu gọn" (icon chevron «/») toggle collapse.

### Topbar (cao 56px, sticky, nền surface, border-bottom)
- Trái: tiêu đề trang (17px/700) + phụ đề (13px, muted). Mỗi màn hình có cặp tiêu đề riêng (xem từng màn hình).
- Phải (theo thứ tự): nút **chuyển vai trò** (demo: Quản trị viên ↔ Nhân viên, chấm xanh/vàng), nút **đổi theme** (sáng/tối), chuông thông báo (có chấm đỏ), divider, **avatar người dùng** (gradient xanh→tím, initials) + tên + vai trò, nút **đăng xuất**.

### Role-based UI
- 2 vai trò: `admin` (Quản trị viên) và `staff` (Nhân viên).
- Các hành động admin-only (nút Sửa, Đổi trạng thái, Thêm thiết bị, Thêm phiếu, bảng Quản lý người dùng) **ẩn hoàn toàn** khi là `staff`. Trong prototype dùng điều kiện `isAdmin`.

### Theme sáng/tối
Toàn bộ màu dùng CSS variables, đổi theo theme. Có toggle ở topbar. Xem bảng token bên dưới cho cả 2 theme.

---

## Screens / Views

### 1. Login (Đăng nhập)
- **Mục đích**: Đăng nhập hệ thống.
- **Layout**: Card căn giữa màn hình, rộng 380px, nền surface, bo góc `--rad-lg`, padding 36px 32px, shadow `0 12px 40px rgba(15,23,42,.12)`. Nền trang gradient nhẹ từ `--bg` → `--surface-2`.
- **Components**:
  - Logo vuông 60px bo 14px nền primary + icon lưới trắng 30px, shadow primary.
  - Tiêu đề "Quản lý Thiết bị" (18px/700) + phụ đề "Hệ thống cấp phát nội bộ" (13px muted).
  - Input "Tên đăng nhập" (mặc định `admin`) và "Mật khẩu" (password). Cao 40px, bo 8px, nền `--surface-2`, focus đổi border sang primary.
  - Checkbox "Ghi nhớ đăng nhập" + link "Quên mật khẩu?" (primary).
  - Nút "Đăng nhập" full-width cao 42px, nền primary, chữ trắng 14px/600, shadow primary.
  - Footer: "Phiên bản 2.4.1 · Ngoại tuyến".

### 2. Dashboard (Tổng quan)
- **Topbar**: "Tổng quan" / "Bảng điều khiển hệ thống".
- **Layout**: max-width 1240px căn giữa.
- **Components**:
  - **4 stat cards** (grid 4 cột, gap 16px): Tổng thiết bị (156), Đang cấp phát (92), Đang bảo trì (7), Hỏng/Thanh lý (5). Mỗi card: nhãn (13px muted) + số lớn (30px/700) + ô icon 42px bo `--rad-md` (nền tint + màu theo loại) + dòng delta nhỏ. Màu icon: primary / green `#16a34a` / yellow `#ca8a04` / red `#dc2626`.
  - **Section "Thiết bị đang trang bị theo phòng ban"** (grid **2 cột**): 4 card phòng ban — **Phòng Kinh doanh (28), Phòng Kỹ thuật (24), Phòng Kế toán (21), Phòng IT (19)**.
    - Header card: icon toà nhà 40px (nền `--primary-soft`, màu primary) + tên phòng (14px/700) + "% tổng cấp phát" + số lớn (28px/700) bên phải.
    - **Hàng chip "Phiếu đề nghị"**: các mã phiếu (vd `DX-300`, `DX-287`) dạng chip bo tròn (pill), font monospace 12px/700. Chip active: nền primary, chữ trắng. **Hàng chip cuộn ngang** (`overflow-x:auto`, `flex-wrap:nowrap`) khi tràn.
    - Dòng meta: "{người đề nghị} · {ngày} · {n} thiết bị" + **badge trạng thái chỉ hiển thị khi = "Đang trang bị"** (ẩn với "Hoàn tất").
    - **Danh sách thiết bị** của phiếu đang chọn: mỗi dòng = tên thiết bị + ngày giờ mượn (monospace 11px) + "Mượn: {người}" + "Cấp: {người cho mượn}" + **nút "Trả về"** ở cuối dòng (chỉ khi phiếu "Đang trang bị") → mở Return Dialog.
    - **Phân trang**: tối đa **6 thiết bị / trang**, nếu vượt thì hiện pager "Trang x/y" + nút ‹ [số] ›. Đổi chip thì reset về trang 1.
  - *Lưu ý*: Bản hiện tại đã **bỏ** biểu đồ cột tháng và panel Cảnh báo theo yêu cầu review. Nếu cần khôi phục, xem mục Interactions.

### 3. Device List (Quản lý thiết bị)
- **Topbar**: "Quản lý thiết bị" / "Danh sách toàn bộ thiết bị".
- **Components**:
  - Thanh tìm kiếm (icon kính lúp trái, icon barcode phải — **hỗ trợ máy quét mã vạch**), placeholder "Tìm theo SKU, tên, serial, người giữ — hoặc quét mã vạch…". Nút "Thêm thiết bị" (primary, icon +).
  - **Filter chips** theo trạng thái: Tất cả / Trong kho / Đang trang bị / Đang bảo trì / Hỏng / Thanh lý — kèm số đếm. Chip active viền + nền primary nhạt.
  - **Bảng** cột: SKU (monospace) | Tên thiết bị | Loại | Trạng thái (badge) | Phòng / Người giữ | Thao tác. Hàng cao theo `--rh` (density). Hover nền `--hoverbg`.
    - Thao tác: nút Xem (mắt) luôn có; Sửa + Đổi trạng thái chỉ admin.
  - Footer bảng: "Hiển thị X / Y thiết bị" + phân trang.
- **Badge trạng thái** (màu): Trong kho → green `#16a34a`; Đang trang bị → blue primary; Đang bảo trì → yellow `#ca8a04`; Hỏng → red `#dc2626`; Thanh lý → gray `#64748b`. (badge = pill, padding 3px 10px, 12px/600, nền màu @ ~14-18% alpha.)

### 4. Device Detail (Chi tiết thiết bị)
- **Components**:
  - Link "‹ Quay lại danh sách".
  - Header: icon thiết bị 56px + tên (22px/700) + SKU (monospace) + badge trạng thái. Nút "Đổi trạng thái" + "Chỉnh sửa" (admin).
  - **Tabs**: "Thông tin" / "Lịch sử" (tab active gạch chân primary).
    - Tab Thông tin: bảng key-value 2 cột (200px / 1fr): SKU, Tên, Loại, Serial, Trạng thái (badge), Phòng giữ, Người dùng, Ghi chú.
    - Tab Lịch sử: **timeline dọc** — mỗi mục có chấm icon (cấp phát=blue, trả=green, bảo trì=yellow, tạo=gray) + đường nối dọc + tiêu đề + phụ đề + ngày.

### 5. Request Form List (Phiếu Đề nghị)
- **Topbar**: "Phiếu đề nghị" / "Yêu cầu cấp phát thiết bị".
- **Components**: Ô tìm kiếm + nút "Tạo phiếu đề nghị" (primary). Bảng: Mã phiếu (monospace, primary, vd `DX-301`) | Phòng ban | Người đề nghị | Ngày lập | SL | Trạng thái (badge) | ›. Click hàng → Request Detail.
- Trạng thái phiếu: "Đang trang bị" (blue) / "Hoàn tất" (green) / "Đang xử lý" (yellow).

### 6. Request Form Detail (Chi tiết phiếu)
- **Components**:
  - Link quay lại.
  - Card header: mã phiếu lớn (monospace, primary) + badge trạng thái + nút **"Thêm thiết bị"** (admin, viền dashed primary) → mở **Add Device Dialog**.
  - Grid meta 4 cột: Phòng ban / Người đề nghị / Ngày lập / Số thiết bị. + Ghi chú.
  - **Bảng thiết bị trên phiếu**: SKU | Tên | Loại | Người nhận | Thao tác (nút "Trả về" mỗi dòng nếu đang trang bị → Return Dialog).

### 7. Allocation Form (Cấp phát lẻ)
- **Topbar**: "Cấp phát lẻ" / "Bàn giao thiết bị cho nhân viên".
- **Components**: Card form max-width 720px. Các field: **Thiết bị** (select chỉ thiết bị "Trong kho"), **Nhân viên nhận** (select), **Phòng ban** (select), **Ngày hẹn trả** (date), **Liên kết phiếu đề nghị** (select, optional), **Tình trạng/ghi chú** (textarea). Footer: nút Hủy + "Xác nhận cấp phát" (primary). Field bắt buộc đánh dấu `*` đỏ.

### 8. Return Dialog (Trả thiết bị về kho)
- **Modal** rộng 440px, bo `--rad-lg`, overlay `rgba(15,23,42,.5)`, click ngoài để đóng (click trong dừng propagation).
- Header "Trả thiết bị về kho" + nút X.
- Khối thông tin (nền `--surface-2`): Thiết bị, SKU, Người đang giữ, Phiếu liên kết.
- Select "Tình trạng khi trả" (Tốt / Trầy xước nhẹ / Cần bảo trì / Hỏng) + textarea Ghi chú.
- Footer: Hủy + "Xác nhận trả về" (primary).

### 9. Add Device Dialog (Thêm thiết bị vào phiếu)
- **Modal** rộng 560px, max-height 80vh, dạng cột (header / search / list scroll / footer).
- Header: "Thêm thiết bị vào phiếu" + "Phiếu {mã} · {n} thiết bị sẵn có trong kho" + nút X.
- Ô tìm kiếm thiết bị còn trong kho.
- **Danh sách checkbox**: mỗi dòng = checkbox (accent primary) + tên thiết bị + "{SKU} · {loại}" + badge "Trong kho" (green). **Chỉ liệt kê thiết bị trạng thái "Trong kho"**.
- Footer: Hủy + "Thêm vào phiếu" (primary, icon +).

### 10. Reports (Báo cáo)
- **Components**: Hàng filter: Từ ngày / Đến ngày (date) + Phòng ban + Loại thiết bị (select) + nút **Xuất Excel** (viền+chữ green) + **Xuất PDF** (viền+chữ red). 3 stat card: Tổng thiết bị thống kê / Đang cấp phát / Tỷ lệ sử dụng. **Bảng thống kê theo loại**: Loại | Tổng | Đang cấp | Trong kho | Tỷ lệ, có hàng "Tổng cộng".

### 11. Catalog (Danh mục)
- **Tabs** (segmented, nền `--surface-2`): Loại thiết bị / Phòng ban / Nhân viên. Mỗi tab = bảng CRUD đơn giản (Mã | Tên | Số lượng | Thao tác Sửa/Xóa) + **hàng thêm inline** (input + nút Thêm) ở cuối.

### 12. Settings (Cài đặt)
- **Quản lý người dùng** (chỉ admin): bảng Họ tên | Tài khoản (monospace) | Vai trò | Trạng thái (Hoạt động green / Đã khóa gray) | Sửa. Nút "Thêm người dùng".
- **Đổi mật khẩu**: 3 input password + nút cập nhật.
- **Cơ sở dữ liệu**: input readonly hiển thị đường dẫn file DB (vd `C:\ProgramData\EquipHub\equiphub.db`) + nút **"Sao chép"** đường dẫn. Thông tin: Dung lượng, Sao lưu gần nhất, Chế độ "Ngoại tuyến".

---

## Interactions & Behavior
- **Điều hướng**: click nav sidebar đổi màn hình (state `screen`); reset scroll về đầu. Device/Request detail có nút quay lại.
- **Sidebar collapse**: toggle width 232px ↔ 68px, ẩn nhãn khi thu gọn.
- **Theme toggle**: đổi toàn bộ CSS variables sáng/tối.
- **Role toggle**: đổi `admin`/`staff`, ẩn/hiện các nút admin-only.
- **Device list**: lọc theo filter chip + tìm kiếm (khớp SKU/tên/người giữ/serial). Ô tìm kiếm nhận input từ máy quét mã vạch (gõ chuỗi nhanh + Enter).
- **Dashboard dept cards**: click chip phiếu → đổi danh sách thiết bị bên dưới (state per-card `deptTab`); phân trang 6/trang (state per-card `deptPage`), reset trang khi đổi chip.
- **Return Dialog / Add Device Dialog**: mở từ nút tương ứng, đóng khi click overlay / X / Hủy / Xác nhận. Modal phân biệt loại qua `modal.type` (`'add'` vs return).
- **Chart (nếu khôi phục)**: biểu đồ cột tháng dùng **recharts** — 2 series (Cấp phát = primary, Trả về = gray), gridlines, trục, tooltip hover hiển thị "Cấp X · Trả Y".
- **Bar tooltip**: hover cột hiện tooltip nền `--text`, chữ `--surface`.
- Transition mặc định: width sidebar .18s ease; hover background .12s.

## State Management
State chính (trong prototype là 1 component, ở app thật nên tách context/route):
- `screen` — màn hình hiện tại.
- `loggedIn` — đã đăng nhập.
- `collapsed` — sidebar thu gọn.
- `dark` — theme tối.
- `role` — `'admin'` | `'staff'`.
- `deviceQuery`, `deviceFilter` — tìm kiếm & lọc bảng thiết bị.
- `selectedDevice`, `selectedRequest` — bản ghi đang xem.
- `detailTab` — tab Device Detail (`'info'`/`'history'`).
- `catalogTab` — tab Danh mục.
- `modal` — `null` | `{type, device, req}` cho dialog.
- `deptTab` — map `{[dept]: requestCode}` chip đang chọn mỗi card dashboard.
- `deptPage` — map `{[dept]: pageNumber}` phân trang mỗi card.
- `hoverBar` — index cột chart đang hover (nếu dùng chart).

**Data fetching**: app offline → đọc/ghi DB cục bộ (SQLite). Thay dữ liệu mẫu trong prototype bằng truy vấn thật. Bảng dữ liệu gợi ý: `devices`, `categories`, `departments`, `employees`, `requests`, `request_lines`, `allocations`, `users`.

## Design Tokens

### Màu — Light theme
| Token | Giá trị |
|---|---|
| `--bg` | `#f6f8fb` |
| `--surface` | `#ffffff` |
| `--surface-2` | `#f1f5f9` |
| `--border` | `#e6eaf0` |
| `--text` | `#0f172a` |
| `--text-muted` | `#64748b` |
| `--primary` | `#2563eb` |
| `--primary-hover` | `#1d4ed8` |
| `--hoverbg` | `rgba(15,23,42,.045)` |
| `--barmuted` | `#cbd5e1` |
| `--sidebar` | `#ffffff` |

### Màu — Dark theme
| Token | Giá trị |
|---|---|
| `--bg` | `#0b1220` |
| `--surface` | `#111827` |
| `--surface-2` | `#1a2333` |
| `--border` | `#26303f` |
| `--text` | `#e8edf5` |
| `--text-muted` | `#8b98ad` |
| `--primary` | `#3b82f6` |
| `--primary-hover` | `#2563eb` |
| `--hoverbg` | `rgba(148,163,184,.1)` |
| `--barmuted` | `#334155` |
| `--sidebar` | `#0e1626` |

Phái sinh từ primary: `--primary-soft` = primary @12%, `--primary-soft2` = @6%, `--primary-tint` = @15% (dùng `color-mix`).

### Màu trạng thái (status)
- Green (Trong kho / Hoàn tất / Hoạt động): `#16a34a`
- Blue (Đang trang bị / Đang cấp phát): primary `#2563eb`
- Yellow (Đang bảo trì / Đang xử lý): `#ca8a04`
- Red (Hỏng / cảnh báo): `#dc2626`
- Gray (Thanh lý / Đã khóa): `#64748b`
- Badge nền = màu @ ~14-18% alpha, chữ = màu đậm, pill 999px.

### Accent có thể đổi (prop `accent`)
- Xanh dương (default): light `#2563eb`/`#1d4ed8`, dark `#3b82f6`/`#2563eb`
- Xanh mòng két: `#0d9488`/`#0f766e` (dark `#14b8a6`/`#0d9488`)
- Tím hoàng hôn: `#7c3aed`/`#6d28d9` (dark `#8b5cf6`/`#7c3aed`)
- Lục rừng: `#059669`/`#047857` (dark `#10b981`/`#059669`)

### Density (prop `density`) — [row-height, table-font]
- Thoáng: `62px`, `14px`
- Tiêu chuẩn (default): `54px`, `13.5px`
- Gọn: `44px`, `12.5px`

### Corner radius (prop `chrome`) — [lg, md, sm]
- Mềm mại: `18px / 13px / 10px`
- Tiêu chuẩn (default): `12px / 9px / 7px`
- Sắc nét: `3px / 3px / 2px`

### Typography
- Font: **System UI / Segoe** — `"Segoe UI", -apple-system, system-ui, "Helvetica Neue", Arial, sans-serif` (giao diện native Windows). Mã/SKU/ngày giờ dùng monospace `"Consolas", "SF Mono", monospace`.
- Tiêu đề trang 17px/700; tiêu đề card 15px/700; số liệu lớn 28-30px/700 (letter-spacing -.02em); body 13-14px; phụ chú 11-12px.
- Diacritics tiếng Việt phải hiển thị tốt — Segoe UI / system-ui đáp ứng.

### Spacing & layout
- Padding nội dung chính: 24px. Gap grid: 16px. Padding card: 18-20px.
- Topbar/sidebar-header cao 56px. Input/select cao 40-42px. Nút cao 38-42px.
- Content max-width: Dashboard/List 1240px; Detail 1000-1100px; Form 720px.

### Shadows
- Card login: `0 12px 40px rgba(15,23,42,.12)`
- Modal: `0 24px 60px rgba(0,0,0,.3)`
- Nút primary: `0 4px 12px` primary @30%
- Tooltip: `0 4px 12px rgba(0,0,0,.18)`

## Assets
- **Icons**: tất cả là inline SVG kiểu **Lucide / Feather** (stroke 2, line-cap round) — dashboard, devices, requests, allocate, reports, catalog, settings, box, check, wrench, alert, clock, search, scan (barcode), eye, edit, swap, plus, back, return, trash, copy, excel, pdf, building. Ở app thật dùng thẳng `lucide-react`.
- **Logo**: placeholder icon lưới 4 ô (square grid) trên nền primary — thay bằng logo công ty thật.
- Không có ảnh bitmap; không có asset ngoài.

## Files
- `Equipment Manager.dc.html` — prototype đầy đủ 12 màn hình/dialog (Design Component, mở trực tiếp bằng trình duyệt). Toàn bộ markup inline-style + một class logic JS ở cuối file (`renderVals()` trả về dữ liệu mẫu & handler). **Đây là nguồn tham chiếu chính.**
- `support.js` — runtime của Design Component (chỉ để mở file HTML xem trực tiếp; **không cần** trong codebase mục tiêu).

### Cách đọc prototype
Mở `Equipment Manager.dc.html` trong trình duyệt để xem. Trong file:
- Phần `<x-dc>...</x-dc>` (đầu file) = markup + style từng màn hình.
- Phần `class Component extends DCLogic` (cuối file) = state, dữ liệu mẫu (`devices`, `requests`, `deptAlloc`, `chart`...), bảng màu theme (`themeVars`), và toàn bộ handler/logic. Đọc `renderVals()` để hiểu dữ liệu đổ vào mỗi màn hình.
