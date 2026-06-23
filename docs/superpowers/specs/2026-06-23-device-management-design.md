# Design — Hoàn thiện Quản lý Thiết bị

**Date:** 2026-06-23  
**Scope:** Thêm thiết bị, Sửa thiết bị, Đổi trạng thái, Sửa pagination

---

## Context

Màn hình Danh sách thiết bị (`Devices.tsx`) và Chi tiết thiết bị (`DeviceDetail.tsx`) hiện có 3 nút no-op (`/* no-op M1 */`): "Thêm thiết bị", "Sửa", "Đổi trạng thái". Backend chưa có handler create/update/changeStatus. Pagination footer là static (nút ‹/› không hoạt động).

---

## Architecture

Không thay đổi kiến trúc hiện tại. Thêm:
- 2 shared dialog components: `DeviceFormDialog`, `ChangeStatusDialog`
- 3 IPC channels + types + backend handlers
- Wire state vào `Devices.tsx` và `DeviceDetail.tsx`
- Server-side pagination cho `devices.list`

Pattern: giống `ReturnDialog` — shared component, parent giữ state + mutation.

---

## 1. IPC Layer

### Channels mới (thêm vào `CHANNELS` trong `ipc.ts`)
```ts
devicesCreate: 'devices.create'
devicesUpdate: 'devices.update'
devicesChangeStatus: 'devices.changeStatus'
```

### Types mới
```ts
export interface DeviceCreateArgs {
  sku: string           // required, unique
  name: string          // required
  categoryId: number | null
  serialNumber: string | null
  notes: string | null
}

export interface DeviceUpdateArgs {
  sku: string           // identifier, không đổi
  name: string
  categoryId: number | null
  serialNumber: string | null
  notes: string | null
}

export interface DeviceChangeStatusArgs {
  sku: string
  status: 'available' | 'maintenance' | 'broken' | 'decommissioned'
  notes: string | null
}
```

### Cập nhật `DeviceListArgs`
```ts
export interface DeviceListArgs {
  filter: 'all' | DeviceStatus
  query: string
  page: number       // 1-based
  pageSize: number   // default 20
}
```

### Cập nhật `DeviceListResult`
```ts
export interface DeviceListResult {
  devices: DeviceRow[]   // đã slice theo page
  counts: StatusCount[]  // luôn tính trên toàn bộ devices (không bị ảnh hưởng bởi query/filter)
  total: number          // tổng sau filter+search, trước slice — dùng tính totalPages
}
```
`counts` vẫn phản ánh toàn bộ kho (không thay đổi semantic). `total` đổi semantic: trước = tổng tất cả, nay = tổng sau filter+search.

### Cập nhật `Api.devices`
```ts
devices: {
  list(args: DeviceListArgs): Promise<ApiResponse<DeviceListResult>>
  get(args: DeviceGetArgs): Promise<ApiResponse<DeviceDetailResult>>
  create(args: DeviceCreateArgs): Promise<ApiResponse<{ sku: string }>>
  update(args: DeviceUpdateArgs): Promise<ApiResponse<{ ok: true }>>
  changeStatus(args: DeviceChangeStatusArgs): Promise<ApiResponse<{ ok: true }>>
}
```

---

## 2. Backend — `devices.ts`

### `create(args: DeviceCreateArgs)`
- Validate: `sku` không rỗng, `name` không rỗng
- Validate unique: `SELECT id FROM devices WHERE sku = ?` → nếu tồn tại → error `CONFLICT`
- Insert: `status = 'available'`, `createdAt = now()`
- Return: `{ sku }`

### `update(args: DeviceUpdateArgs)`
- Validate: device tồn tại theo sku
- Update: `name`, `categoryId`, `serialNumber`, `notes`, `updatedAt = now()`
- SKU không được thay đổi

### `changeStatus(args: DeviceChangeStatusArgs)`
- Validate: `status` ∉ `['allocated']` → error `BAD_REQUEST`
- Validate: device tồn tại
- Validate: nếu device có active allocation (`returnedAt IS NULL`) → error `CONFLICT` với message "Thiết bị đang được cấp phát. Vui lòng thu hồi trước khi đổi trạng thái."
- Update: `devices.status = args.status`, `updatedAt = now()`

### `list` — thêm pagination
- Tính `total` = số rows sau filter+search (trước slice)
- Slice: `devices = allFiltered.slice((page-1)*pageSize, page*pageSize)`
- `totalAll` = `devRows.length` (trước filter, dùng cho counts)

---

## 3. Frontend Components

### `src/components/DeviceFormDialog.tsx`

```ts
interface DeviceFormDialogProps {
  mode: 'create' | 'edit'
  initial?: {          // chỉ cần khi mode='edit'
    sku: string
    name: string
    categoryId: number | null
    serialNumber: string | null
    notes: string | null
  }
  categories: CategoryRow[]
  loading: boolean
  error: string
  onClose(): void
  onSubmit(args: DeviceCreateArgs | DeviceUpdateArgs): void
}
```

Fields:
- SKU: text input, required, monospace — **disabled** khi `mode='edit'`
- Tên thiết bị: text input, required
- Loại (Category): `<select>` từ `categories` prop + option "— Không phân loại —"
- Số serial: text input, optional
- Ghi chú: textarea, optional

Header: "Thêm thiết bị mới" hoặc "Chỉnh sửa thiết bị"

### `src/components/ChangeStatusDialog.tsx`

```ts
interface ChangeStatusDialogProps {
  sku: string
  deviceName: string
  currentStatus: DeviceStatus
  isAllocated: boolean  // true khi currentStatus === 'allocated'
  loading: boolean
  error: string
  onClose(): void
  onConfirm(args: DeviceChangeStatusArgs): void
}
```

- Nếu `isAllocated = true`: hiện banner cảnh báo, disable confirm button
- Select options: `available`, `maintenance`, `broken`, `decommissioned`
- Optional notes textarea

---

## 4. Wire vào Pages

### `Devices.tsx`
- Thêm state: `formDialog: null | { mode: 'create' } | { mode: 'edit'; device: DeviceRow }`, `statusDialog: null | DeviceRow`
- `categories` lấy từ `useQuery` gọi `api.catalog.list()` (đã có)
- Nút "Thêm thiết bị" → `setFormDialog({ mode: 'create' })`
- Nút "Sửa" → `setFormDialog({ mode: 'edit', device: row })`
- Nút "Đổi trạng thái" → `setStatusDialog(row)`
- onSuccess mutations: `invalidateQueries(['devices'])`
- Thêm state `page` (default 1), reset khi filter/query đổi; bind nút ‹/›

### `DeviceDetail.tsx`
- Nút "Đổi trạng thái" → `setStatusDialog(true)`
- Nút "Chỉnh sửa" → `setFormDialog(true)`
- Cần fetch `categories` cho form dialog (lazy: chỉ khi dialog mở)
- onSuccess: `invalidateQueries(['device', sku])` + `invalidateQueries(['devices'])`

---

## 5. Preload + api.ts

Thêm 3 channel invocations vào `electron/preload/index.ts` và `src/lib/api.ts`.

---

## 6. Tests

### Backend (`devices.test.ts`) — thêm 3 describe blocks
- `devices.create`: tạo thành công, lỗi khi SKU duplicate
- `devices.update`: cập nhật tên thành công, lỗi khi device không tồn tại  
- `devices.changeStatus`: đổi thành công (available→maintenance), lỗi khi device đang allocated, lỗi khi target=allocated

### Frontend — không cần unit test cho dialog (visual component)

---

## 7. Pagination fix

- `DeviceListArgs`: thêm `page: number` (1-based), `pageSize: number` (default 20)
- Backend: tính `total` = số rows sau filter+search, sau đó slice `devices = filtered.slice((page-1)*pageSize, page*pageSize)`
- `counts` vẫn tính trên `devRows` đầy đủ (không thay đổi)
- `Devices.tsx`: state `page` (default 1), reset về 1 khi `filter` hoặc `query` đổi
- Footer label: `Trang {page}/{totalPages} · {total} thiết bị` (thay label cũ)
- Nút ‹/› bind thật: disabled khi page=1 hoặc page=totalPages; `totalPages = Math.ceil(total / pageSize)`

---

## Acceptance Criteria

| Feature | Criterion |
|---|---|
| Thêm thiết bị | Tạo device mới xuất hiện đầu bảng (available), SKU duplicate → lỗi rõ ràng |
| Sửa thiết bị | Thay đổi name/category/serial/notes lưu thành công, SKU không đổi |
| Đổi trạng thái | available↔maintenance↔broken↔decommissioned OK; device allocated → disabled với cảnh báo; target=allocated → không có trong dropdown |
| Pagination | Bảng 20 dòng/trang, nút ‹/› hoạt động, reset về trang 1 khi filter đổi |
| DeviceDetail sync | Sau edit/đổi trạng thái từ Detail page, badge và info cập nhật ngay |
