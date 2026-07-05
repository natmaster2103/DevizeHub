---
name: request-edit-delete
description: Cho phép sửa/xoá phiếu đề nghị (gated bởi permission manage_requests) và bỏ ràng buộc unique trên mã phiếu
metadata:
  type: project
---

# Thiết kế: Sửa/Xoá phiếu đề nghị & Mã phiếu trùng lặp

**Ngày:** 2026-06-27

## Yêu cầu

1. Tài khoản có permission `manage_requests` có thể sửa và xoá phiếu đề nghị.
2. Mã phiếu (`code`) không còn bắt buộc phải duy nhất — các bản ghi phân biệt nhau bằng ngày lập và phòng ban.

## Quyết định thiết kế

- **Xoá phiếu có allocations:** cascade xoá tất cả allocations liên kết; mỗi thiết bị chưa trả tự động được đặt lại về trạng thái `available`.
- **Vị trí UI:** nút Sửa và Xoá chỉ xuất hiện trên trang `RequestDetail`, không có trên trang danh sách.
- **Phân quyền:** dùng permission mới `manage_requests` (không dùng `isAdmin` trực tiếp), cho phép cấp quyền linh hoạt cho staff.
- **Mã trùng khi tạo mới:** cho phép ngầm — không cảnh báo, không chặn.

## Các thay đổi

### 1. Permission & IPC (`electron/shared/ipc.ts`)

Thêm `'manage_requests'` vào kiểu `Permission` và mảng `ALL_PERMISSIONS`.

Thêm vào `CHANNELS`:
```ts
requestsUpdate: 'requests.update',
requestsDelete: 'requests.delete',
```

Thêm types:
```ts
interface UpdateRequestArgs {
  id: number
  code: string
  departmentId: number
  createdAt: string | null
  notes: string | null
}
interface DeleteRequestArgs { id: number }
```

Thêm vào `Api.requests`:
```ts
update(args: UpdateRequestArgs): Promise<ApiResponse<{ ok: true }>>
delete(args: DeleteRequestArgs): Promise<ApiResponse<{ ok: true }>>
```

### 2. Schema & Migration

Trong `electron/main/db/schema.ts`: bỏ `.unique()` trên `requests.code`.

Tạo migration Drizzle mới (chạy `npm run db:generate`) để sinh file SQL tương ứng.

### 3. Handler (`electron/main/handlers/requests.ts`)

**`create`:** Xoá đoạn kiểm tra duplicate (hiện ở dòng 284–291).

**`update` (mới):**
- Require `manage_requests`
- Validate: `id` phải là số, `code` không rỗng, `departmentId` phải có giá trị
- Update record trong bảng `requests`

**`delete` (mới):**
- Require `manage_requests`
- Lấy toàn bộ allocations của request (JOIN devices)
- Với mỗi allocation chưa trả (`returnedAt IS NULL`): set `devices.status = 'available'`, `devices.updatedAt = now`
- Xoá tất cả allocations của request
- Xoá request

### 4. Preload & Handler Index

`electron/preload/index.ts`: expose `api.requests.update` và `api.requests.delete`.

`electron/main/handlers/index.ts`: đăng ký 2 channel mới, bọc `auth_guard`.

### 5. UI — RequestDetail (`src/pages/RequestDetail.tsx`)

Header: thêm 2 nút mới (hiển thị khi `hasPermission('manage_requests')`), đặt giữa "In phiếu" và "Thêm thiết bị":

```
[In phiếu]  [Sửa]  [Xoá]  [Thêm thiết bị]
```

**`EditRequestDialog`:** modal mới tương tự `CreateRequestDialog`, điền sẵn giá trị hiện tại của phiếu (code, departmentId, createdAt, notes). Submit gọi `api.requests.update()`, thành công invalidate `['request', id]` và `['requests']`.

**`ConfirmDeleteRequestDialog`:** dialog xác nhận nhỏ, hiện mã phiếu và cảnh báo:
> "Thao tác này sẽ xoá tất cả {N} thiết bị đã cấp phát trong phiếu. Không thể hoàn tác."

Submit gọi `api.requests.delete()`, thành công `navigate('/requests')`.

Cả hai mutation hiển thị toast lỗi đỏ nếu thất bại (giống pattern hiện tại).

### 6. Settings UI (`src/pages/Settings.tsx`)

Thêm `manage_requests` vào permission checklist với nhãn `"Sửa/Xoá phiếu đề nghị"`, đặt ngay sau `create_request`.

## Tóm tắt các file thay đổi

| File | Loại thay đổi |
|---|---|
| `electron/shared/ipc.ts` | + permission, + 2 channel, + 2 type, + 2 api method |
| `electron/main/db/schema.ts` | Bỏ `.unique()` trên `requests.code` |
| `electron/main/db/migrations/` | File migration mới (tự generate) |
| `electron/main/handlers/requests.ts` | + `update`, + `delete`, bỏ kiểm tra trùng code |
| `electron/main/handlers/index.ts` | Đăng ký 2 channel mới |
| `electron/preload/index.ts` | Expose 2 method mới |
| `src/pages/RequestDetail.tsx` | + nút Sửa/Xoá + 2 dialog |
| `src/pages/Settings.tsx` | + label `manage_requests` trong permission list |
