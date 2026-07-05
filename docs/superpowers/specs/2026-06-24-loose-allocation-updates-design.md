# Design — Cập nhật: Cấp phát lẻ, Xoá thiết bị, Phòng ban mặc định

**Date:** 2026-06-24
**Scope:** 4 nhóm tính năng — (A) DeptCard "Cấp phát lẻ" trên Dashboard, (B) Xoá thiết bị ở trang chi tiết (admin), (C) Trang Cấp phát lẻ nhập tay người nhận, (D) Đặt lại phòng ban mặc định & gỡ tab Nhân viên.

---

## Context

- **Allocation lẻ** = bản ghi `allocations` có `requestId IS NULL` (không gắn phiếu đề nghị). Hiện `dashboard.ts` **bỏ qua** các allocation này (`if (a.requestId == null) continue`), nên thiết bị cấp phát lẻ không hiển thị ở bất kỳ card phòng ban nào trên Dashboard.
- `quickAllocate` (kéo-thả Dashboard) và `allocate.create` (trang Cấp phát lẻ) đều ghi `allocations`. `quickAllocate` đã hỗ trợ `borrowerName` (lưu vào `notes` dạng `Người mượn: <tên>`, `employeeId = null`); `allocate.create` yêu cầu `employeeId`.
- `DeviceDetail.tsx` đã có nút Chỉnh sửa / Đổi trạng thái / Thu hồi cho admin; chưa có Xoá.
- `Catalog.tsx` có 3 tab: Loại thiết bị, Phòng ban, Nhân viên. `seed.ts` seed 7 phòng ban tiếng Việt + requests/allocations mẫu tham chiếu chúng.
- Schema FK: `allocations.deviceId` và `maintenanceLogs.deviceId` đều `NOT NULL references devices.id` → không thể xoá device khi còn bản ghi tham chiếu nếu không xoá kèm.

---

## A. Dashboard — DeptCard "Cấp phát lẻ"

### A.1 Kiểu dữ liệu (`electron/shared/ipc.ts`)

```ts
export interface DeptCard {
  dept: string
  deptId: number | null        // null cho card loose
  kind: 'department' | 'loose' // mới
  count: number
  share: number
  requests: DeptCardRequest[]      // [] khi kind='loose'
  looseItems?: DeptCardItem[]      // mới — chỉ dùng khi kind='loose'
}
```

`DeptCardItem` giữ nguyên (đã có `borrowerName`, `lender`, `returnable`, `allocationId`, `deviceSku`).

### A.2 Backend (`electron/main/handlers/dashboard.ts`)

- Giữ nguyên grouping theo phòng ban cho allocation có `requestId`.
- Thu thập riêng các allocation **active** (`returnedAt IS NULL`) có **`requestId IS NULL`** → dựng `looseItems: DeptCardItem[]`:
  - `borrowerName` = `employeeName ?? parseBorrowerFromNotes(notes)`
  - `lender` = displayName của `issuedBy`
  - `datetime` = `fmtDateTime(issuedAt)`, `returnable = true`
- Tạo một card loose:
  ```ts
  { dept: 'Cấp phát lẻ', deptId: null, kind: 'loose', count: looseItems.length,
    share: <theo deptAllocTotal>, requests: [], looseItems }
  ```
- **`deptAllocTotal`** và **`share`**: gộp cả `looseItems.length` vào tổng để tỷ lệ nhất quán. Stats (`total/allocated/...`) không đổi.
- Mọi card phòng ban đặt `kind: 'department'`.
- Thứ tự: các card phòng ban (sort như cũ) trước, **card "Cấp phát lẻ" đặt cuối**. Luôn hiển thị card loose kể cả khi rỗng (đồng bộ với cách mọi phòng ban luôn có card).

### A.3 UI (`src/pages/Dashboard.tsx` — `DeptCardPanel`)

Khi `card.kind === 'loose'`:
- Header dùng icon riêng + màu phụ (nét đứt) để phân biệt; bỏ dòng "x% tổng cấp phát" giữ `share` tuỳ chọn.
- **Bỏ** chips phiếu, nhãn "PHIẾU ĐỀ NGHỊ (nn)", và dòng meta phiếu.
- Render trực tiếp `card.looseItems` qua đúng item-row hiện có (tên, SKU/datetime, "Mượn: …", "Cấp: …", nút **Trả về**), vẫn phân trang `PAGE_SIZE = 6`.
- Empty state: icon thùng + "Chưa có thiết bị cấp phát lẻ".

Tái dùng phần render item + pager hiện tại bằng cách trích `items` từ `looseItems` thay vì `req.items`.

### A.4 Luật kéo-thả

`dragStateRef.current` đã chứa `{ devices, requestId }`. Quy ước:

| Kéo | Card phòng ban (`deptId` number) | Card "Cấp phát lẻ" (`kind='loose'`) |
|---|---|---|
| `requestId == null` | **từ chối** (không ring, không nhận) | **nhận** |
| `requestId != null` | **nhận** (như cũ) | **từ chối** |

- `onDragOver`: chỉ `setDropDept(card.dept)` (hiện ring) khi card là **drop target hợp lệ** theo bảng trên (đọc `dragStateRef.current?.requestId`).
- `onDrop`: kiểm tra lại tính hợp lệ; nếu không hợp lệ → bỏ qua (no-op). Nếu hợp lệ → mở `LendConfirmDialog` với `deptId = card.deptId` (`null` cho loose) và `requestId = dragStateRef.current.requestId`.
- `LendConfirmDialog`: với card loose, header hiển thị `Phòng ban: Cấp phát lẻ` (hoặc nhãn "Cấp phát lẻ"). Form không đổi (tên người mượn bắt buộc + ghi chú).

### A.5 quickAllocate cho phép department null

`QuickAllocateArgs.departmentId: number | null`. Trong `allocate.ts > quickAllocate`:
- Bỏ ràng buộc bắt buộc `departmentId`; cho phép `null`.
- `db.insert(allocations).values({ departmentId: args.departmentId ?? null, requestId: args.requestId ?? null, ... })`.
- Vẫn yêu cầu `borrowerName` không rỗng và thiết bị `available`.

`Dashboard.tsx`: state `lendModal.deptId` đổi sang `number | null`; truyền `departmentId: lendModal.deptId` (không ép kiểu).

---

## B. Xoá thiết bị ở trang chi tiết (admin)

### B.1 IPC (`ipc.ts`, preload, `api.ts`, `index.ts`)

```ts
// CHANNELS
devicesDelete: 'devices.delete'
// types
export interface DeviceDeleteArgs { sku: string }
// Api.devices
delete(args: DeviceDeleteArgs): Promise<ApiResponse<{ ok: true }>>
```
Đăng ký channel trong `electron/main/handlers/index.ts`, `preload/index.ts`, `src/lib/api.ts`.

### B.2 Backend (`devices.ts > delete`)

- Tìm device theo `sku`; không có → `NOT_FOUND`.
- Nếu có allocation **active** (`returnedAt IS NULL`) → `CONFLICT` "Thiết bị đang được cấp phát. Vui lòng thu hồi trước khi xoá."
- Ngược lại, trong `db.transaction`:
  1. `delete maintenanceLogs where deviceId = id`
  2. `delete allocations where deviceId = id`
  3. `delete devices where id = id`
- Trả `{ ok: true }`.

### B.3 UI (`DeviceDetail.tsx`)

- Trong cụm nút `isAdmin`, thêm nút **"Xoá"** (variant nguy hiểm: viền/đỏ `#dc2626`).
- Mở `ConfirmDeleteDialog` (component mới `src/components/ConfirmDeleteDialog.tsx`): tiêu đề cảnh báo, nêu tên + SKU, nút "Xoá" đỏ + "Huỷ". Props: `{ deviceName, deviceSku, loading, error, onClose, onConfirm }`.
- `deleteMutation` → `unwrap(api.devices.delete({ sku }))`; onSuccess: `invalidateQueries(['devices'])` + `navigate('/devices')`.
- Lỗi (vd CONFLICT) hiển thị trong dialog.

---

## C. Trang Cấp phát lẻ — "Nhân viên nhận" nhập tay

### C.1 UI (`src/pages/Allocate.tsx`)

Form còn lại: Thiết bị (combobox đa chọn), Nhân viên nhận (text), Phòng ban (select), Tình trạng/ghi chú bàn giao (textarea), badge "Không liên kết phiếu đề nghị".

- Thay `<select>` "Nhân viên nhận" → `<input type="text">` (state `borrowerName`), placeholder "Nhập tên người nhận", **bắt buộc**.
- **Bỏ** field "Liên kết phiếu đề nghị" và state `requestId`.
- **Bỏ** field "Ngày hẹn trả" và state `dueDate` — `quickAllocate` không có field dueDate, tránh dữ liệu rớt âm thầm.
- **Giữ** "Phòng ban" (bắt buộc) và "Tình trạng / ghi chú bàn giao".
- Thêm chỉ báo trạng thái tĩnh: badge xám "Không liên kết phiếu đề nghị" (cạnh tiêu đề hoặc dưới phần mô tả).
- Bỏ phần `requests` khỏi render (handler `allocate.formData` có thể giữ nguyên).

### C.2 Data flow

- Submit gọi **`api.allocate.quick`** một lần:
  ```ts
  api.allocate.quick({
    deviceSkus: selectedDevices.map(d => d.sku),
    departmentId: Number(departmentId),
    borrowerName: borrowerName.trim(),
    requestId: null,
    notes: conditionNotes || null,
  })
  ```
- Validate client: chọn ≥1 thiết bị, `borrowerName` không rỗng, chọn phòng ban.
- onSuccess: invalidate `['devices']`, `['allocate']`, `['dashboard']`, `['requests','available-devices']`; reset form.
- `allocate.create` + `CreateAllocationArgs` **giữ nguyên** (không dùng ở trang này nữa nhưng còn cho khả năng khác).

---

## D. Trang Danh mục

### D.1 Phòng ban mặc định (`electron/main/db/seed.ts`)

- `deptNames` = `['Đội 1', 'Đội 2', 'Đội 3', 'Đội 4']`.
- Reshape dữ liệu mẫu tham chiếu phòng ban:
  - `seedEmployees`: gán `dept` sang Đội 1–4 (phân bổ hợp lý).
  - `requestDefs`: đổi `dept` của từng phiếu sang Đội 1–4; giữ nguyên cấu trúc items.
- Chiến lược áp dụng: **đổi seed + reset DB** (xoá file SQLite dev rồi seed lại). Không viết migration wipe.
- Cập nhật `seed.test.ts`: kỳ vọng 4 phòng ban Đội 1–4 (và mọi assertion phụ thuộc tên phòng ban cũ).

### D.2 Gỡ tab Nhân viên (`src/pages/Catalog.tsx`)

- Bỏ `'employees'` khỏi `type Tab` và mảng `TABS`.
- Xoá component `EmployeesTab` và nhánh render `tab === 'employees'`.
- Giữ nguyên handler/IPC `saveEmployee/deleteEmployee/...` (còn được dùng ở `allocate.formData`, `catalog.list`); chỉ gỡ UI.
- `useCatalog` vẫn trả `employees` (không bắt buộc dùng) — không cần đổi backend.

---

## Tests

| File | Bổ sung |
|---|---|
| `devices.test.ts` | `devices.delete`: xoá thành công + cascade (allocations/maintenanceLogs biến mất); chặn khi device đang `allocated` (active alloc) → CONFLICT; NOT_FOUND khi sku sai. |
| `dashboard.test.ts` | Card `kind='loose'` gom đúng allocation `requestId IS NULL` & active; allocation lẻ **không** lọt vào card phòng ban; card loose vẫn xuất hiện khi rỗng. |
| `allocate.test.ts` (hoặc nơi test quickAllocate) | `quickAllocate` chấp nhận `departmentId = null` (ghi allocation với departmentId null, requestId null). |
| `seed.test.ts` | 4 phòng ban = Đội 1–4; cập nhật assertion phụ thuộc tên cũ. |

Dialog mới (`ConfirmDeleteDialog`) là component hiển thị — không unit test riêng.

---

## Acceptance Criteria

| Feature | Criterion |
|---|---|
| A. Card Cấp phát lẻ | Thiết bị cấp phát lẻ (requestId null) xuất hiện trong card "Cấp phát lẻ"; card phòng ban không lẫn. Kéo phiếu = "Không liên kết" chỉ thả được vào card lẻ; kéo có phiếu không thả được vào card lẻ. Nút Trả về trong card lẻ hoạt động. |
| B. Xoá thiết bị | Admin thấy nút Xoá ở trang chi tiết; xoá device không cấp phát → biến mất + về danh sách; device đang cấp phát → chặn với thông báo rõ; staff không thấy nút. |
| C. Cấp phát lẻ nhập tay | "Nhân viên nhận" là ô text; không còn field liên kết phiếu; cấp phát thành công tạo allocation requestId null, hiển thị trong card "Cấp phát lẻ"; badge "Không liên kết phiếu đề nghị". |
| D. Danh mục | Phòng ban mặc định chỉ còn Đội 1–4 (DB seed mới); trang Danh mục không còn tab Nhân viên. |
</content>
</invoke>
