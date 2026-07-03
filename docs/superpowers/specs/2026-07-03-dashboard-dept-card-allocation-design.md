# Dashboard: Tạo phiếu từ DeptCard & AllocationDrawer rút gọn

## Bối cảnh

Hiện tại trang Dashboard (`src/pages/Dashboard.tsx`) hiển thị các `DeptCardPanel` theo phòng ban, và một `AllocationDrawer` (`src/components/AllocationDrawer.tsx`) cho phép chọn thiết bị trong kho + chọn một phiếu đề nghị, rồi kéo-thả (drag & drop) vào DeptCard tương ứng để cấp phát nhanh qua `LendConfirmDialog`.

Yêu cầu điều chỉnh:
1. `DeptCardPanel` có thêm nút tạo phiếu đề nghị mới, tự động gán phòng ban.
2. `AllocationDrawer` bỏ phần chọn phiếu đề nghị (việc gán phiếu chuyển sang tự động khi drop), chỉ giữ tìm kiếm thiết bị trong kho; thêm thumbnail nhóm thiết bị và hiệu ứng hover cho danh sách.

## Phần 1 — Nút "Tạo phiếu" trên DeptCardPanel

- Thêm nút icon nhỏ hình `+` ngay bên phải số đếm (count) ở header của `DeptCardPanel` (Dashboard.tsx:261-264), có `title="Tạo phiếu"` làm tooltip.
- Tách `CreateRequestDialog` (hiện định nghĩa cục bộ trong `src/pages/Requests.tsx:49-244`) thành component dùng chung, ví dụ `src/components/CreateRequestDialog.tsx`, nhận thêm prop tùy chọn:
  ```ts
  interface CreateRequestDialogProps {
    presetDepartmentId?: number
    onClose(): void
  }
  ```
  - Khi có `presetDepartmentId`: trường "Phòng ban" được điền sẵn giá trị tương ứng và bị `disabled` (khóa cứng, không cho đổi).
  - Khi không có (trang Requests.tsx dùng như cũ): trường "Phòng ban" hoạt động bình thường, người dùng tự chọn.
- `Requests.tsx` cập nhật để import và dùng component dùng chung này thay vì định nghĩa cục bộ (không đổi hành vi hiện tại).
- Dashboard.tsx: thêm state `createReqForDept: { deptId: number; deptName: string } | null`; nút `+` trên mỗi `DeptCardPanel` set state này (`card.deptId` có thể `null` với card loại `loose` — trường hợp này nút vẫn hiển thị nhưng **disabled** vì không có phòng ban cụ thể để gán, có `title` giải thích).
- Khi tạo phiếu thành công: invalidate query `['dashboard']` (và `['requests']` để trang Phiếu đề nghị đồng bộ nếu đang mở) để chip phiếu mới xuất hiện ngay trên DeptCardPanel.

## Phần 2 — AllocationDrawer: bỏ form phiếu đề nghị, thêm thumbnail & hover

### Loại bỏ
- Toàn bộ khối "PHIẾU ĐỀ NGHỊ" `<select>` và state `lendReqId` (AllocationDrawer.tsx:191-235 hiện tại).
- `dragStateRef` không còn mang `requestId` từ phía Drawer — payload chỉ còn `{ devices: AvailableDeviceRow[] }`.

### Dữ liệu / kiểu dữ liệu
- `AvailableDeviceRow` (`electron/shared/ipc.ts:336`) thêm trường:
  ```ts
  export interface AvailableDeviceRow { sku: string; name: string; category: string; thumbnailPath: string | null }
  ```
- `electron/main/handlers/requests.ts` → `availableDevices()`: import `deviceGroups` từ `../db/schema`, thêm `leftJoin(deviceGroups, eq(devices.groupId, deviceGroups.id))`, select thêm `thumbnailPath: deviceGroups.thumbnailPath`, map vào kết quả (`thumbnailPath: r.thumbnailPath ?? null`).
- `electron/main/handlers/allocate.ts:51` (form Allocate cũ, cũng dựng `AvailableDeviceRow`) cập nhật tương tự để giữ tương thích kiểu dữ liệu — không đổi hành vi UI của trang Allocate.

### Hiển thị danh sách thiết bị (giữ nguyên: ô tìm kiếm, thanh chọn tất cả, checkbox multi-select, icon kéo)
- Mỗi hàng thêm ô ảnh 48×48px bên trái:
  - Có `thumbnailPath`: `<img src={file://${thumbnailPath}} style={{ width:48, height:48, borderRadius:'var(--rad-sm)', objectFit:'cover' }} />`
  - Không có: khung 48×48px nền `var(--surface-2)`, icon `IconBox` (`var(--text-muted)`) căn giữa.
- Nội dung hiện tại (tên, sku, category) dịch sang phải, nằm cạnh ô ảnh.
- Thêm hiệu ứng hover cho mỗi hàng theo pattern `--hoverbg` đã dùng trong `Devices.tsx:378-389`:
  ```tsx
  onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
  onMouseLeave={e => (e.currentTarget.style.background = '')}
  ```
  (row đã chọn giữ style highlight hiện tại, ưu tiên hơn hover).

### Drag & drop — tự động gán phiếu tại điểm drop
- `handleDragStart` trong AllocationDrawer chỉ còn set `dragStateRef.current = { devices: picked }`.
- `Dashboard.tsx`:
  - `dragStateRef` đổi kiểu thành `useRef<{ devices: AvailableDeviceRow[] } | null>(null)`.
  - `validDrop(card)`: nếu `card.kind === 'loose'` → luôn hợp lệ (loose không cần phiếu). Nếu không phải loose → hợp lệ chỉ khi `card.requests.length > 0` (đã có ít nhất 1 phiếu để gán vào).
  - `onDrop`: xác định `requestId` cần gán —
    - Card loose: `requestId = null`.
    - Card thường: `requestId` = id của phiếu đang **active chip** trên card đó tại thời điểm drop (không phải phiếu mới nhất/theo trạng thái).
  - Nếu card thường chưa có phiếu nào (`card.requests.length === 0`), từ chối drop (giữ hành vi hiện tại: không mở `dropDept`/`isDrop` cho card này, tương tự khi `validDrop()` trả về false ngày nay) — người dùng phải bấm "Tạo phiếu" trước.
  - Phần còn lại (mở `LendConfirmDialog`, gọi `quickAllocMutation`) giữ nguyên logic hiện tại, chỉ khác nguồn gốc của `requestId`.

## Không thuộc phạm vi
- Không đổi trang "Phiếu đề nghị" (Requests.tsx) ngoài việc tái sử dụng component dialog dùng chung.
- Không đổi trang "Allocate" (form cấp phát cũ) ngoài cập nhật kiểu dữ liệu để biên dịch được.
- Không hồi tố gán phiếu cho các items đã cấp phát dạng loose từ trước.

## Testing
- Cập nhật/viết test cho `electron/main/handlers/requests.test.ts` (nếu có) kiểm tra `availableDevices()` trả về `thumbnailPath` đúng khi device có/không có group.
- Test tương tác kéo-thả trong Dashboard: drop vào card thường có phiếu active → alloc gán đúng `requestId`; drop vào card thường chưa có phiếu → bị từ chối; drop vào card loose → `requestId: null`.
- Kiểm tra thủ công (`npm run dev`): mở AllocationDrawer, xác nhận không còn chọn phiếu, thumbnail hiển thị đúng, hover hoạt động; bấm nút "+" trên DeptCard mở dialog tạo phiếu với phòng ban khóa sẵn.
