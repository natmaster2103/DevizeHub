# Thiết kế: Chức năng Báo cáo

Ngày: 2026-06-30

## Mục tiêu

Xây dựng trang Báo cáo (`/reports`, hiện là `Placeholder`) hiển thị các chỉ số
thống kê theo khoảng thời gian do người dùng chọn:

1. **Số phiếu đề nghị** trong kỳ, kèm danh sách từng phiếu: `Mã phiếu – Phòng ban`
   và số lượt cấp phát của phiếu đó.
2. **Lượt cấp phát theo nhóm thiết bị** (vd: "Điện thoại Samsung: 13 lượt").
3. **Lượt cấp phát theo phòng ban** (kèm tỉ lệ %).

Bộ chọn mốc thời gian: preset `Tuần này` / `Tháng này` (theo chu kỳ đặc thù) và
`Tùy chọn` khoảng ngày.

## Phạm vi

- CÓ: 3 nhóm số liệu trên + bộ chọn kỳ + 2 thẻ tổng + 2 cột danh sách.
- KHÔNG (giai đoạn này): xuất/in (Excel/CSV/PDF), thêm gate quyền `view_reports`
  (giữ nguyên hành vi hiện tại — route và sidebar không gate, giống Dashboard).
- Các báo cáo gợi ý khác (tồn kho theo trạng thái, quá hạn & bảo trì, top thiết
  bị/người mượn) tạm để dành cho giai đoạn sau.

## Kiến trúc

Bám sát đúng pattern của `dashboard`.

### Backend

- File mới `electron/main/handlers/reports.ts` → `makeReportHandlers(db)` với một
  method `summary(args: ReportArgs)`. Trả toàn bộ số liệu trong một lần gọi.
- IPC (`electron/shared/ipc.ts`):
  - Thêm channel `reportsSummary: 'reports.summary'` vào `CHANNELS`.
  - Thêm type `ReportArgs`, `ReportSummary`, `ReportGroupRow`, `ReportDeptRow`,
    `ReportRequestRow`.
  - Thêm `reports: { summary(args): Promise<ApiResponse<ReportSummary>> }` vào
    interface `Api`.
- Wiring trong `electron/main/handlers/index.ts`:
  `ipcMain.handle(CHANNELS.reportsSummary, (_e, args) => auth_guard(() => reportsH.summary(args)))`.
- Preload (`electron/preload/index.ts`): expose `reports.summary` theo pattern
  hiện có.
- `src/lib/api.ts`: thêm getter `get reports() { return window.api.reports }`.

### Frontend

- Helper thuần `src/lib/period.ts` (kèm `period.test.ts`): tính khoảng thời gian
  từ preset → `{ from, to }`. Tách riêng để test logic preset đặc thù.
- Hook `src/hooks/useReports.ts` → `useReports(args)` (react-query; `queryKey`
  bao gồm `from`/`to`).
- Trang `src/pages/Reports.tsx` thay `Placeholder` trong `src/router.tsx`.

### Luồng dữ liệu

Trang Reports giữ state `{ preset, from, to }` → khi preset đổi, gọi
`resolvePeriod` để suy ra `from`/`to` → `useReports({from,to})` → handler lọc &
gom nhóm bằng Drizzle → trả `ReportSummary` → trang render.

## Logic khoảng thời gian (`src/lib/period.ts`)

```ts
type Preset = 'week' | 'month' | 'custom'
function resolvePeriod(preset: Preset, today: Date): { from: string; to: string }
```

Quy tắc chung cho preset: **lấy kỳ gần nhất đã đóng hoàn toàn** = kỳ có ngày kết
thúc **< hôm nay** (so sánh theo UTC).

- **Tháng này** — kỳ tháng = `[15 → 14 tháng sau]`. Tìm ngày 14 gần nhất < hôm
  nay làm ngày kết thúc; ngày bắt đầu = ngày 15 của tháng liền trước ngày kết
  thúc.
  - Ví dụ hôm nay 30/06/2026 → `15/05/2026 – 14/06/2026`.
- **Tuần này** — kỳ tuần = `[thứ 5 → thứ 4 sau]`. Tìm thứ 4 gần nhất < hôm nay
  làm ngày kết thúc; ngày bắt đầu = thứ 5 (ngày kết thúc − 6 ngày).
  - Ví dụ hôm nay thứ 3 30/06/2026 → `18/06/2026 – 24/06/2026`.
- **Tùy chọn** — dùng trực tiếp `from`/`to` người dùng nhập (không qua
  `resolvePeriod`).

### Biên & múi giờ

- Tính theo **UTC** để đồng nhất với cách hiển thị ngày hiện có (`getUTC*`).
- `from` = `${ngàyBắtĐầu}T00:00:00.000Z`.
- `to` = `${ngàyKếtThúc + 1 ngày}T00:00:00.000Z` (loại trừ).
- Lọc: `field >= from AND field < to` bằng so sánh chuỗi ISO.

## Số liệu & cách tính (`reports.summary`)

### Input / Output

```ts
interface ReportArgs { from: string; to: string }  // ISO UTC, frontend tính sẵn

interface ReportRequestRow { code: string; deptName: string; allocationCount: number }
interface ReportGroupRow { groupId: number | null; groupName: string; count: number; share: number }
interface ReportDeptRow  { deptId: number | null;  deptName: string;  count: number; share: number }

interface ReportSummary {
  range: { from: string; to: string }       // echo lại để hiển thị
  requestCount: number                       // (1)
  requests: ReportRequestRow[]               // (1) chi tiết từng phiếu
  totalAllocations: number                   // tổng lượt cấp phát trong kỳ
  byGroup: ReportGroupRow[]                   // (2)
  byDepartment: ReportDeptRow[]              // (3)
}
```

### Cách tính

Trừ khi ghi rõ, mọi phép lọc theo `issuedAt` của `allocations` trong `[from, to)`.

1. **`requestCount` + `requests`** — lấy `requests` có `createdAt` trong
   `[from, to)`. Mỗi phiếu:
   - `code` = `requests.code`.
   - `deptName` = tên phòng ban (join `departments`); không có → `"Không xác định"`.
   - `allocationCount` = **tất cả** allocation gắn `requestId` của phiếu đó
     (không giới hạn theo ngày cấp — vì phiếu đã thuộc kỳ theo ngày tạo).
   - Sắp xếp: mới nhất trước (theo `createdAt` giảm dần).
2. **`totalAllocations`** — đếm `allocations` có `issuedAt` trong `[from, to)`
   (tính cả lượt đã trả).
3. **`byGroup`** — join `allocations → devices → deviceGroups`, lọc theo
   `issuedAt`, gom theo `groupId`, đếm số lượt. Thiết bị không thuộc nhóm →
   gộp `groupName: "Chưa phân nhóm"`, `groupId: null`. `share` =
   `round(count / totalAllocations * 100)` (0 nếu `totalAllocations = 0`). Sắp
   xếp `count` giảm dần.
4. **`byDepartment`** — lọc `allocations` theo `issuedAt`, gom theo
   `allocations.departmentId`, đếm số lượt. Không có phòng ban →
   `deptName: "Cấp phát lẻ"`, `deptId: null`. `share` + sắp xếp như trên.

## Giao diện (`src/pages/Reports.tsx`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Báo cáo                                                                   │
│  Kỳ:  [ Tuần này ] [ Tháng này ] [ Tùy chọn ]   Từ [15/05/26] Đến [14/06/26]│
│  Đang xem: 15/05/2026 – 14/06/2026                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─ Số phiếu đề nghị: 27 ─────────┐   ┌─ Tổng lượt cấp phát ──┐           │
│  │ • PA12 – Đội 3          3 lượt │   │        58             │           │
│  │ • PA11 – P.Kinh doanh   1 lượt │   └───────────────────────┘           │
│  │ • PA10 – Đội 1          5 lượt │                                       │
│  │ …                              │                                       │
│  └────────────────────────────────┘                                       │
├──────────────────────────────────┬────────────────────────────────────────┤
│  Lượt cấp phát theo nhóm thiết bị │  Lượt cấp phát theo phòng ban          │
│  Điện thoại Samsung  ▓▓▓▓▓▓▓▓ 13  │  Phòng Kinh doanh  ▓▓▓▓▓▓▓▓▓▓ 22  38% │
│  Laptop Dell         ▓▓▓▓▓▓   11  │  Phòng Kỹ thuật    ▓▓▓▓▓▓▓     15  26% │
│  Chưa phân nhóm      ▓         2  │  Cấp phát lẻ       ▓▓          5    8% │
└──────────────────────────────────┴────────────────────────────────────────┘
```

- **Thanh chọn kỳ:** 3 nút `Tuần này` / `Tháng này` / `Tùy chọn`. Chọn `Tùy chọn`
  mới bật 2 ô ngày Từ–Đến. Dòng "Đang xem" hiển thị khoảng thực tế áp dụng.
- **Thẻ "Số phiếu đề nghị":** tiêu đề kèm tổng số; bên dưới là danh sách
  `Mã phiếu – Phòng ban   N lượt` (cuộn nếu dài).
- **Thẻ "Tổng lượt cấp phát":** một con số lớn (stat card giống Dashboard).
- **2 cột danh sách:** mỗi dòng "tên: N lượt"; cột phòng ban thêm `%`. Thanh `▓`
  là bar tỉ lệ trực quan (width theo `share`). Sắp xếp giảm dần theo `count`.
- Trạng thái rỗng: hiển thị thông báo "Không có dữ liệu trong kỳ" khi tất cả = 0.

## Xử lý lỗi

- Handler bọc trong `ApiResponse`; lỗi → `{ ok: false, error }` theo pattern hiện
  có. Frontend `unwrap` ném lỗi → react-query hiển thị trạng thái lỗi.
- `from`/`to` không hợp lệ (rỗng/sai định dạng) → handler trả `error` với mã phù
  hợp; UI hiển thị thông báo.

## Kiểm thử

- `src/lib/period.test.ts` — `resolvePeriod` cho `week`/`month` với nhiều mốc
  `today` (bao gồm biên: đúng ngày 14, ngày 15, đúng thứ 4, thứ 5; cuối/đầu
  tháng; giao năm).
- `electron/main/handlers/reports.test.ts` — `summary` với DB seed: kiểm tra
  `requestCount`/`requests`, `totalAllocations`, gom `byGroup` (gồm "Chưa phân
  nhóm"), `byDepartment` (gồm "Cấp phát lẻ"), tính `share`, lọc đúng biên
  `[from, to)`, và `allocationCount` đếm tất cả lượt của phiếu.

## Ghi chú triển khai

- Chạy test bằng vitest trực tiếp dưới Node 22 (xem memory về better-sqlite3 ABI).
