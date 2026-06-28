# Request Status & Filters Design

**Date:** 2026-06-28  
**Scope:** Chuyển trạng thái phiếu đề nghị sang lưu DB + thêm filter danh sách

---

## Problem

Trạng thái phiếu hiện tại được **tự động tính** từ dữ liệu allocation (pending/allocated/completed). User không thể thủ công đánh dấu "Hoàn tất" — hệ thống chỉ tự chuyển khi tất cả thiết bị được trả lại. Ngoài ra trang danh sách phiếu thiếu filter để quản lý.

---

## Solution: Stored Status + Manual Transition

### Database

- Thêm cột `status TEXT NOT NULL DEFAULT 'pending'` vào bảng `requests` (Drizzle migration).
- Xóa hoàn toàn hàm `deriveStatus()` khỏi `requests.ts` handler.
- Handler `list` và `get` đọc `requests.status` trực tiếp từ DB.

### Status Values & Labels

| Value | Label (VI) | Trigger |
|---|---|---|
| `'pending'` | Chưa cấp phát | Mặc định khi tạo phiếu |
| `'allocated'` | Đang cho mượn | Auto khi `addDevices` được gọi và request đang `pending` |
| `'completed'` | Hoàn tất | Thủ công — user bấm nút trong RequestDetail |

**Label thay đổi:** `'allocated'` → "Đang cho mượn" (trước là "Đang trang bị") trong `src/lib/status.ts`.

### IPC Contract Additions

- Channel: `CHANNELS.requestsUpdateStatus = 'requests.updateStatus'`
- Type: `UpdateRequestStatusArgs { id: number; status: 'completed' }`
- Method: `api.requests.updateStatus(args)` — exposed qua preload, registered trong handlers/index với `auth_guard`
- Permission gate: `manage_requests`
- Validation: chỉ cho phép transition `allocated → completed`; trả lỗi nếu request không ở trạng thái phù hợp

### Backend Handler Changes (`requests.ts`)

1. **`list`**: Bỏ logic tính `totalByReq`/`activeByReq` từ allocations. Select `requests.status` trực tiếp.
2. **`get`**: Tương tự — đọc `requests.status` từ DB thay vì tính.
3. **`addDevices`**: Sau khi insert allocations, nếu `request.status === 'pending'` → `UPDATE requests SET status = 'allocated'`.
4. **`updateStatus`** (mới): Validate → update `requests.status = 'completed'`.
5. **`create`**: Không cần đặt status (DEFAULT 'pending' từ DB).

---

## Frontend

### RequestDetail — Nút "Đánh dấu hoàn tất"

- **Hiển thị khi:** `data.status === 'allocated'` AND `hasPermission('manage_requests')`
- **Vị trí:** Toolbar header, sau nút Xoá, trước nút Thêm thiết bị
- **Style:** Nền xanh lá `#16a34a`, text trắng, icon checkmark
- **Action:** Mutation `api.requests.updateStatus({ id, status: 'completed' })` → invalidate `['request', id]` và `['requests']`
- **Không có nút ngược lại** — transition một chiều: allocated → completed

### Requests (list page) — Filters

Toolbar layout sau khi thêm (trái → phải):
```
[🔍 Search ___________] [Tabs] [▼ Phòng ban] [+ Tạo phiếu]
```

**Status tabs:**
- `Tất cả | Chưa cấp phát | Đang cho mượn | Hoàn tất`
- Style pill tab (giống Devices page)
- State: `activeStatus: 'all' | RequestStatus`

**Department dropdown:**
- Mặc định: "Tất cả phòng ban"
- Data: lấy từ query `catalog` (đã có sẵn)
- State: `activeDept: number | null`

**Filtering logic:** Client-side trên array trả về từ API (không thêm args vào IPC).

---

## Files Changed

| File | Change |
|---|---|
| `electron/shared/ipc.ts` | + `requestsUpdateStatus` channel; + `UpdateRequestStatusArgs`; + `api.requests.updateStatus` |
| `electron/preload/index.ts` | Expose `api.requests.updateStatus` |
| `electron/main/handlers/index.ts` | Register `requestsUpdateStatus` với `auth_guard` |
| `electron/main/db/schema.ts` | Thêm `status` column vào `requests` table |
| `electron/main/db/migrations/<new>.sql` | Drizzle-generated migration |
| `electron/main/handlers/requests.ts` | Xóa `deriveStatus()`; update `list`/`get`/`addDevices`; thêm `updateStatus` |
| `src/lib/status.ts` | Đổi label `allocated` → "Đang cho mượn" |
| `src/pages/RequestDetail.tsx` | Thêm nút "Đánh dấu hoàn tất" |
| `src/pages/Requests.tsx` | Thêm status tabs + department dropdown filter |

---

## Constraints

- Tất cả label user-facing bằng tiếng Việt.
- Permission `manage_requests` gate cho `updateStatus` handler và nút frontend.
- Migration cần backfill data cho phiếu cũ (không thể chỉ dùng DEFAULT 'pending'):
  ```sql
  -- Backfill: phiếu có active allocation → 'allocated'
  UPDATE requests SET status = 'allocated'
  WHERE id IN (SELECT DISTINCT request_id FROM allocations WHERE returned_at IS NULL AND request_id IS NOT NULL);
  -- Backfill: phiếu có allocation nhưng tất cả đã trả → 'completed'
  UPDATE requests SET status = 'completed'
  WHERE id IN (SELECT DISTINCT request_id FROM allocations WHERE request_id IS NOT NULL)
  AND id NOT IN (SELECT DISTINCT request_id FROM allocations WHERE returned_at IS NULL AND request_id IS NOT NULL);
  ```
  Phiếu không có allocation nào giữ nguyên DEFAULT 'pending'.
- Test: `npx vitest run electron/main/handlers/requests.test.ts`
