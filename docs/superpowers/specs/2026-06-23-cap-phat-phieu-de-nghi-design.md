# Design — Hoàn thiện tính năng Cấp phát & Phiếu đề nghị

**Ngày:** 2026-06-23  
**Phạm vi:** 4 tính năng: status phiếu, wire nút Trả về trên Dashboard, extract ReturnDialog, in phiếu

---

## 1. Bối cảnh

Ứng dụng Electron (React + Drizzle/SQLite) quản lý thiết bị văn phòng. Các tính năng cấp phát (allocation) và phiếu đề nghị (request) đã có nền tảng nhưng còn 4 điểm chưa hoàn thiện:

1. Status phiếu đề nghị tính sai (phiếu mới tạo = "Hoàn tất" thay vì "Chưa cấp phát")
2. Nút "Trả về" trên Dashboard dept card items có TODO, không làm gì
3. `ReturnDialog` bị nhúng inline trong `RequestDetail.tsx`, không dùng lại được
4. Chưa có tính năng in phiếu đề nghị

---

## 2. Thiết kế từng tính năng

### 2.1 Status phiếu đề nghị — 3 trạng thái

**Vấn đề:** `deriveStatus(0, 0)` trả về `'completed'` vì cả hai nhánh đều sai.

**Giải pháp:**

```ts
// electron/shared/ipc.ts
export type RequestStatus = 'pending' | 'allocated' | 'completed'

// electron/main/handlers/requests.ts
function deriveStatus(totalLines: number, activeLines: number): RequestStatus {
  if (totalLines === 0) return 'pending'
  if (activeLines > 0) return 'allocated'
  return 'completed'
}
```

**Badge label và màu** (`src/lib/status.ts`):

| Status | Label | Màu |
|---|---|---|
| `pending` | Chưa cấp phát | Xám (`var(--text-muted)` / `var(--surface-2)`) |
| `allocated` | Đang trang bị | Xanh dương (giữ nguyên) |
| `completed` | Hoàn tất | Xanh lá (giữ nguyên) |

**`AllocationDrawer` filter** — phiếu có thể liên kết khi drag-drop:
```ts
// Trước: status === 'allocated'
// Sau:   status === 'pending' || status === 'allocated'
select: d => d.requests.filter(r => r.status !== 'completed'),
```

**Files thay đổi:**
- `electron/shared/ipc.ts` — type `RequestStatus`
- `electron/main/handlers/requests.ts` — hàm `deriveStatus`
- `src/lib/status.ts` — thêm badge `pending`
- `src/components/AllocationDrawer.tsx` — sửa filter

---

### 2.2 Extract `ReturnDialog` thành shared component

**Vấn đề:** `ReturnDialog` hiện inline trong `RequestDetail.tsx` ~130 dòng. Dashboard cần dùng lại.

**Giải pháp:** Tách ra `src/components/ReturnDialog.tsx`.

**Props interface:**
```ts
export interface ReturnDialogProps {
  allocationId: number
  deviceName: string
  deviceSku: string
  recipient: string
  contextLabel: string   // "Phiếu liên kết: DX-302" hoặc "Phòng ban: IT"
  onClose(): void
  onConfirm(args: ReturnDeviceArgs): void
  loading: boolean
}
```

**`RequestDetail.tsx`** — import và dùng `ReturnDialog` từ shared component, xóa inline code.

---

### 2.3 Wire nút "Trả về" trên Dashboard

**Thêm `allocationId` vào `DeptCardItem`:**
```ts
// electron/shared/ipc.ts
export interface DeptCardItem {
  allocationId: number   // ← thêm mới
  name: string
  datetime: string
  borrower: string
  lender: string
  returnable: boolean
}
```

**Backend dashboard handler** (`electron/main/handlers/dashboard.ts`) — thêm `allocations.id` vào query build `DeptCardItem`.

**`Dashboard.tsx`** — wire nút "Trả về":
```tsx
// State
const [returnTarget, setReturnTarget] = useState<{
  allocationId: number
  deviceName: string
  deviceSku: string
  recipient: string
  dept: string
} | null>(null)

// Mutation
const returnMutation = useMutation({
  mutationFn: (args: ReturnDeviceArgs) => unwrap(api.requests.returnDevice(args)),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['devices'] })
    setReturnTarget(null)
  },
})

// Nút onClick (trong DeptCardPanel)
onClick={() => setReturnTarget({
  allocationId: item.allocationId,
  deviceName: item.name,
  deviceSku: '',           // Dashboard không có SKU — để trống hoặc thêm vào DeptCardItem
  recipient: item.borrower,
  dept: card.dept,
})}

// Render ReturnDialog
{returnTarget && (
  <ReturnDialog
    {...returnTarget}
    contextLabel={`Phòng ban: ${returnTarget.dept}`}
    onClose={() => setReturnTarget(null)}
    onConfirm={args => returnMutation.mutate(args)}
    loading={returnMutation.isPending}
  />
)}
```

> **Lưu ý:** `DeptCardItem` cần thêm `deviceSku` nếu muốn hiện SKU trong dialog. Thêm luôn khi sửa IPC type.

**Files thay đổi:**
- `electron/shared/ipc.ts` — thêm `allocationId` (và `deviceSku`) vào `DeptCardItem`
- `electron/main/handlers/dashboard.ts` — query thêm `allocations.id`, `devices.sku`
- `src/components/ReturnDialog.tsx` — file mới (shared)
- `src/pages/RequestDetail.tsx` — dùng shared `ReturnDialog`
- `src/pages/Dashboard.tsx` — state + mutation + wire nút + render dialog

---

### 2.4 In phiếu đề nghị

**Nút "In phiếu"** thêm vào `RequestDetail.tsx` trong header card, cạnh nút "Thêm thiết bị":
```tsx
import { printRequest } from '@/lib/print'

<button onClick={() => printRequest(data)}>
  <IconPrint size={14} />
  In phiếu
</button>
```

**`src/lib/print.ts`** — file mới:
```ts
export function printRequest(data: RequestDetail): void {
  const win = window.open('', '_blank', 'width=794,height=1123')
  if (!win) return
  win.document.write(buildPrintHTML(data))
  win.document.close()
  win.focus()
  win.print()
}

function buildPrintHTML(data: RequestDetail): string {
  const rows = data.lines.map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${l.deviceSku}</td>
      <td>${l.deviceName}</td>
      <td>${l.category}</td>
      <td>${l.recipient || '—'}</td>
      <td>${l.isReturned ? 'Đã trả' : 'Đang cấp phát'}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html><html lang="vi"><head>
    <meta charset="utf-8">
    <title>Phiếu ${data.code}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Times New Roman', serif; font-size: 13px; padding: 24px 32px; }
      .header { text-align: center; margin-bottom: 20px; }
      .header h2 { font-size: 16px; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 16px; }
      .meta-row { display: flex; gap: 8px; font-size: 13px; }
      .meta-label { font-weight: bold; min-width: 100px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
      th { background: #f0f0f0; font-weight: bold; }
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 32px; }
      .sig-box { text-align: center; }
      .sig-label { font-weight: bold; margin-bottom: 4px; }
      .sig-space { height: 60px; }
      .sig-name { font-style: italic; }
      @media print { @page { size: A4; margin: 16mm 20mm; } }
    </style>
  </head><body>
    <div class="header">
      <h2>Phiếu đề nghị cấp phát thiết bị</h2>
    </div>
    <div class="meta">
      <div class="meta-row"><span class="meta-label">Mã phiếu:</span><span>${data.code}</span></div>
      <div class="meta-row"><span class="meta-label">Ngày lập:</span><span>${data.createdAt}</span></div>
      <div class="meta-row"><span class="meta-label">Phòng ban:</span><span>${data.department || '—'}</span></div>
      <div class="meta-row"><span class="meta-label">Số thiết bị:</span><span>${data.deviceCount}</span></div>
      ${data.notes ? `<div class="meta-row" style="grid-column:1/-1"><span class="meta-label">Ghi chú:</span><span>${data.notes}</span></div>` : ''}
    </div>
    <table>
      <thead><tr><th>STT</th><th>SKU</th><th>Tên thiết bị</th><th>Loại</th><th>Người nhận</th><th>Trạng thái</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="signatures">
      <div class="sig-box">
        <div class="sig-label">Người lập phiếu</div>
        <div class="sig-space"></div>
        <div class="sig-name">(ký tên, ghi rõ họ tên)</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">Người nhận thiết bị</div>
        <div class="sig-space"></div>
        <div class="sig-name">(ký tên, ghi rõ họ tên)</div>
      </div>
    </div>
  </body></html>`
}
```

**Files thay đổi:**
- `src/lib/print.ts` — file mới
- `src/lib/icons.tsx` — thêm `IconPrint`
- `src/pages/RequestDetail.tsx` — thêm nút "In phiếu"

---

## 3. Tổng hợp files thay đổi

| File | Loại thay đổi |
|---|---|
| `electron/shared/ipc.ts` | Sửa: `RequestStatus`, `DeptCardItem` |
| `electron/main/handlers/requests.ts` | Sửa: `deriveStatus` |
| `electron/main/handlers/dashboard.ts` | Sửa: thêm `allocationId`, `deviceSku` vào query |
| `src/lib/status.ts` | Sửa: thêm badge `pending` |
| `src/lib/print.ts` | **Mới**: hàm `printRequest` + HTML template |
| `src/lib/icons.tsx` | Sửa: thêm `IconPrint` |
| `src/components/ReturnDialog.tsx` | **Mới**: shared return dialog |
| `src/components/AllocationDrawer.tsx` | Sửa: filter phiếu liên kết |
| `src/pages/RequestDetail.tsx` | Sửa: dùng shared `ReturnDialog` + thêm nút In |
| `src/pages/Dashboard.tsx` | Sửa: state + mutation + wire Trả về + ReturnDialog |

---

## 4. Acceptance criteria

### AC1 — Status phiếu
- [ ] Phiếu mới tạo (0 dòng thiết bị) hiển thị badge "Chưa cấp phát" màu xám
- [ ] Phiếu có ≥1 thiết bị active → "Đang trang bị" màu xanh dương
- [ ] Phiếu tất cả đã trả → "Hoàn tất" màu xanh lá
- [ ] `AllocationDrawer` hiện cả phiếu `pending` và `allocated` để liên kết

### AC2 — Nút Trả về Dashboard
- [ ] Click "Trả về" trên item trong dept card → mở `ReturnDialog`
- [ ] Chọn tình trạng + ghi chú → Xác nhận → thiết bị trả về kho
- [ ] Dashboard card tự refresh sau khi trả
- [ ] Nút "Trả về" chỉ hiện khi `item.returnable === true`

### AC3 — ReturnDialog shared
- [ ] `RequestDetail.tsx` dùng `ReturnDialog` từ `components/ReturnDialog.tsx`
- [ ] `Dashboard.tsx` dùng cùng component đó
- [ ] Behavior giống hệt như trước khi extract

### AC4 — In phiếu
- [ ] Nút "In phiếu" xuất hiện trên `RequestDetail` (mọi user có thể xem detail)
- [ ] Click → mở cửa sổ mới với HTML template định dạng A4
- [ ] Template có: header, meta (mã phiếu / ngày / phòng ban), bảng thiết bị, ô ký tên
- [ ] Browser print dialog hiện ra tự động

---

## 5. Không trong scope

- Thay đổi DB schema (status vẫn được tính toán, không lưu)
- Luồng tạo phiếu (giữ nguyên)
- Export PDF thực sự (chỉ dùng browser print)
- Approval workflow / nhiều cấp duyệt
