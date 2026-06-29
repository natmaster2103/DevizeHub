# SPEC — Hệ thống Quản lý Thiết bị (engineering / coding spec)

> Tài liệu này bổ trợ cho `README.md`. README mô tả **giao diện & hành vi**; SPEC này tập trung vào **dữ liệu, state, mapping component, và tiêu chí nghiệm thu (acceptance criteria)** để code trong codebase mục tiêu (React + shadcn/ui + Tailwind, Electron offline).

Nguồn tham chiếu chính: `Equipment Manager.dc.html` (prototype). Đọc `renderVals()` ở cuối file để thấy dữ liệu mẫu & handler.

---

## 1. Data model (gợi ý schema SQLite)

```
categories(id, code, name)
departments(id, code, name)
employees(id, name, department_id)
users(id, full_name, username, role, status)          -- role: 'admin' | 'staff'; status: 'active' | 'locked'

devices(
  id, sku, name, category_id, status, department_id,   -- status: enum bên dưới
  serial, holder, notes
)

requests(
  id, code, department_id, date, status, note          -- KHÔNG có requester (đã bỏ)
)                                                        -- status: 'Đang trang bị' | 'Hoàn tất'  (chỉ 2 giá trị)

request_lines(id, request_id, device_id, holder)        -- thiết bị thuộc 1 phiếu + người nhận

allocations(
  id, device_id, department_id, request_id,             -- bản ghi cấp phát
  borrower, allocated_at, due_date, condition, note
)
```

### Enum trạng thái thiết bị (`devices.status`)
`Trong kho` · `Đang trang bị` · `Đang bảo trì` · `Hỏng` · `Thanh lý`

### Enum trạng thái phiếu (`requests.status`) — **chỉ 2**
`Đang trang bị` · `Hoàn tất`
*(Đã loại bỏ `Đang xử lý`. Map badge: Đang trang bị → blue/primary; Hoàn tất → green `#16a34a`.)*

> **Lưu ý "Người đề nghị" đã bị bỏ khỏi toàn UI** (bảng phiếu, chi tiết phiếu, dialog tạo phiếu, placeholder tìm kiếm). Field `requester` còn trong data mẫu của prototype nhưng **không render** — khi dựng app thật, bỏ hẳn khỏi schema/DTO nếu không dùng nơi khác.

---

## 2. State (prototype = 1 component; app thật nên tách context/route/store)

| Key | Kiểu | Ý nghĩa |
|---|---|---|
| `screen` | string | màn hình hiện tại (`dashboard`/`devices`/`requests`/`allocate`/`reports`/`catalog`/`settings`) |
| `loggedIn` | bool | đã đăng nhập |
| `collapsed` | bool | sidebar thu gọn (232px ↔ 68px) |
| `dark` | bool | theme tối |
| `role` | `'admin'｜'staff'` | phân quyền; ẩn hành động admin-only khi `staff` |
| `deviceQuery`, `deviceFilter` | string | tìm/lọc bảng thiết bị |
| `selectedDevice`, `selectedRequest` | obj | bản ghi đang xem |
| `detailTab`, `catalogTab` | string | tab Device Detail / Danh mục |
| `modal` | `null｜{type,device,req}` | Return / Add-Device dialog |
| `deptTab` | `{[dept]: reqCode}` | chip phiếu đang chọn mỗi card dashboard |
| `deptPage` | `{[dept]: number}` | trang hiện tại mỗi card (6 item/trang) |
| **`lendOpen`** | bool | mở Allocation Drawer (panel phải) |
| **`lendQuery`** | string | tìm kiếm trong drawer |
| **`lendSelected`** | `string[]` | SKU đã chọn (đa chọn) trong drawer |
| **`lendReq`** | string | mã phiếu chọn trong drawer (chỉ phiếu "Đang trang bị") |
| **`dragOver` / `dropDept`** | bool / string | trạng thái hover drop target (card phòng ban) |
| **`lendModal`** | `null｜{devices,dept}` | Confirm Dialog sau khi thả |
| **`allocQuery`** | string | tìm kiếm combobox màn Cấp phát lẻ |
| **`allocSelected`** | `string[]` | SKU đã chọn (chip) màn Cấp phát lẻ |
| **`allocOpen`** | bool | mở/đóng dropdown combobox |
| **`createReqOpen`** | bool | mở Create Request Dialog |
| `hoverBar` | number | cột chart đang hover (nếu khôi phục chart) |

Instance field (ngoài React state): **`draggedDevices`** — mảng thiết bị đang kéo, set ở `onDragStart`, đọc ở `onDrop`.

---

## 3. Luồng tính năng mới (acceptance criteria)

### 3.1 Allocation Drawer (cấp phát kéo-thả từ Dashboard)
1. Nút **"Cấp phát"** ở header section dept của Dashboard mở panel phải 400px (`lendOpen=true`).
2. Panel **không chặn** dashboard: overlay `pointer-events:none`, `<main>` nhận `padding-right:444px` khi mở → card phòng ban vẫn click/drop được.
3. Trong panel: select **"Phiếu đề nghị"** chỉ liệt kê phiếu `status==='Đang trang bị'`; ô tìm kiếm lọc danh sách thiết bị `status==='Trong kho'`.
4. **Đa chọn**: checkbox mỗi dòng + select-all + đếm "{n} đã chọn".
5. **Kéo**: `onDragStart` — nếu thiết bị nằm trong `lendSelected` → `draggedDevices` = toàn bộ tập đã chọn; ngược lại = chỉ thiết bị đó.
6. **Thả vào card phòng ban**: card có `onDragOver` (set `dropDept`, hiện ring) + `onDrop` (mở `lendModal={devices:draggedDevices, dept}`).
7. **Confirm Dialog**: hiện phòng ban đích + list thiết bị đã thả + input "Tên người mượn" (bắt buộc) + ghi chú. "Xác nhận" → (app thật: ghi `allocations` + đổi `devices.status='Đang trang bị'`) → reset `lendSelected`, đóng dialog.

### 3.2 Allocation Form (Cấp phát lẻ) — combobox đa chọn
- Field "Thiết bị" là **combobox token/chip có tìm kiếm** (thay select cũ), tối ưu cho số lượng thiết bị lớn.
- `allocQuery` lọc theo tên/SKU/loại; dropdown nổi hiện tối đa **50** kết quả; mở khi focus, đóng khi blur (dùng `onMouseDown=preventDefault` trên option để click không bị blur nuốt).
- Chọn → thêm SKU vào `allocSelected`, **xoá query, giữ dropdown mở** cho lượt chọn tiếp; thiết bị đã chọn không xuất hiện lại ở danh sách trái.
- Mỗi lựa chọn là 1 **chip** trong ô, có nút ✕ để bỏ.
- Chỉ thiết bị `status==='Trong kho'`.

### 3.3 Create Request Dialog
- Mở từ "Tạo phiếu đề nghị". Field: **Mã phiếu** (bắt buộc, monospace), **Phòng ban** (bắt buộc), **Ngày lập** (date), **Ghi chú**. Không có "Người đề nghị".

### 3.4 Dashboard dept card (đã chỉnh)
- Card **cao cố định 430px**, list thiết bị cuộn trong card.
- Nhãn **"PHIẾU ĐỀ NGHỊ (nn)"** = số phiếu của phòng (pad 2 chữ số).
- Meta dòng thiết bị: **chỉ ngày** (bỏ người đề nghị).
- Nút **"Trả về" ở mọi dòng** thiết bị (trước đây chỉ phiếu "Đang trang bị").
- **Empty state** khi phiếu rỗng: icon thùng + "Không có thiết bị được cấp phát".

---

## 4. Component mapping (→ shadcn/ui)

| UI trong prototype | shadcn/ui |
|---|---|
| Card thống kê / phòng ban / form | `Card`, `CardHeader`, `CardContent` |
| Bảng thiết bị / phiếu / báo cáo | `Table` (+ `@tanstack/react-table` nếu cần sort/paginate) |
| Badge trạng thái (pill) | `Badge` (variant theo màu trạng thái) |
| Return / Add-Device / Create-Request / Confirm dialog | `Dialog` |
| **Allocation Drawer** | `Sheet` (side="right") — giữ non-modal: `modal={false}` để dashboard vẫn nhận drop |
| **Combobox thiết bị (Cấp phát lẻ)** | `Command` + `Popover` (pattern combobox) + chip = `Badge` có nút ✕ |
| Filter chips / tabs | `ToggleGroup` / `Tabs` |
| Input / Select / Checkbox / Textarea | `Input` / `Select` / `Checkbox` / `Textarea` |
| Nút | `Button` (variant: default/secondary/outline/ghost/dashed) |
| Icon | `lucide-react` |
| Chart (nếu khôi phục) | `recharts` |

**Kéo-thả**: dùng HTML5 DnD gốc (`draggable`, `onDragStart/Over/Drop`) như prototype, hoặc `dnd-kit` nếu muốn accessibility & touch tốt hơn. Drop target = card phòng ban.

---

## 5. Ghi chú khi dựng app thật
- Tách prototype 1-component thành route/page + state store (Zustand/Context) theo bảng §2.
- Thay dữ liệu mẫu (`devices`, `requests`, `reqLines`, `deptAlloc`) bằng truy vấn SQLite cục bộ.
- Validate: Mã phiếu unique; "Tên người mượn" bắt buộc trước khi xác nhận cấp phát; chỉ cấp phát thiết bị `Trong kho`.
- Tokens màu/spacing/typography/độ bo/density: xem **README → Design Tokens** (đầy đủ cho light + dark + các prop `accent`/`density`/`chrome`).
