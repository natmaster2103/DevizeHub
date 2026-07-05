import type { RequestDetail } from '@shared/ipc'

export function printRequest(data: RequestDetail): void {
  const win = window.open('', '_blank', 'width=794,height=1123')
  if (!win) return
  win.document.write(buildPrintHTML(data))
  win.document.close()
  win.focus()
  win.print()
}

export function buildPrintHTML(data: RequestDetail): string {
  const rows = data.lines
    .map((l, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td style="font-family:'Courier New',monospace">${escHtml(l.deviceSku)}</td>
        <td>${escHtml(l.deviceName)}</td>
        <td>${escHtml(l.category)}</td>
        <td>${escHtml(l.recipient || '—')}</td>
        <td style="text-align:center">${l.isReturned ? 'Đã trả' : 'Đang cấp phát'}</td>
      </tr>`)
    .join('')

  const emptyRow = data.lines.length === 0
    ? `<tr><td colspan="6" style="text-align:center;padding:16px;color:#666">Chưa có thiết bị nào trong phiếu này.</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Phiếu ${escHtml(data.code)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 13px; padding: 24px 32px; color: #111; }
    h1 { font-size: 15px; text-align: center; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
    .subtitle { text-align: center; font-size: 12px; color: #555; margin-bottom: 20px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 24px; margin-bottom: 18px; font-size: 13px; }
    .meta-row { display: flex; gap: 6px; }
    .meta-label { font-weight: bold; min-width: 96px; }
    .meta-full { grid-column: 1 / -1; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    th { background: #f4f4f4; font-weight: bold; border: 1px solid #aaa; padding: 6px 8px; }
    td { border: 1px solid #aaa; padding: 6px 8px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 36px; }
    .sig-box { text-align: center; }
    .sig-label { font-weight: bold; font-size: 13px; margin-bottom: 4px; }
    .sig-date { font-size: 12px; color: #555; margin-bottom: 48px; }
    .sig-name { font-size: 12px; color: #555; font-style: italic; border-top: 1px solid #aaa; padding-top: 4px; }
    @media print {
      @page { size: A4; margin: 14mm 18mm; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h1>Phiếu đề nghị cấp phát thiết bị</h1>
  <div class="subtitle">Mã phiếu: <strong>${escHtml(data.code)}</strong></div>
  <div class="meta">
    <div class="meta-row"><span class="meta-label">Phòng ban:</span><span>${escHtml(data.department || '—')}</span></div>
    <div class="meta-row"><span class="meta-label">Ngày lập:</span><span>${escHtml(data.createdAt)}</span></div>
    <div class="meta-row"><span class="meta-label">Số thiết bị:</span><span>${data.deviceCount}</span></div>
    <div class="meta-row"><span class="meta-label">Trạng thái:</span><span>${statusLabel(data.status)}</span></div>
    ${data.notes ? `<div class="meta-row meta-full"><span class="meta-label">Ghi chú:</span><span>${escHtml(data.notes)}</span></div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:36px">STT</th>
        <th style="width:100px">SKU</th>
        <th>Tên thiết bị</th>
        <th style="width:120px">Loại</th>
        <th style="width:140px">Người nhận</th>
        <th style="width:110px">Trạng thái</th>
      </tr>
    </thead>
    <tbody>${rows}${emptyRow}</tbody>
  </table>
  <div class="signatures">
    <div class="sig-box">
      <div class="sig-label">Người lập phiếu</div>
      <div class="sig-date">Ngày &nbsp;&nbsp;&nbsp; tháng &nbsp;&nbsp;&nbsp; năm</div>
      <div class="sig-name">(Ký tên, ghi rõ họ tên)</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">Người nhận thiết bị</div>
      <div class="sig-date">Ngày &nbsp;&nbsp;&nbsp; tháng &nbsp;&nbsp;&nbsp; năm</div>
      <div class="sig-name">(Ký tên, ghi rõ họ tên)</div>
    </div>
  </div>
</body>
</html>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function statusLabel(s: string): string {
  if (s === 'pending') return 'Chưa cấp phát'
  if (s === 'allocated') return 'Đang trang bị'
  return 'Hoàn tất'
}
