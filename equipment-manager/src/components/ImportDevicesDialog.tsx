import { useState } from 'react'
import { api, unwrap } from '@/lib/api'
import type { PreviewRow } from '@shared/ipc'

interface Props {
  onClose(): void
  onImported(): void
}

export function ImportDevicesDialog({ onClose, onImported }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownloadTemplate() {
    try {
      await unwrap(api.devices.downloadTemplate())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleSelectFile() {
    setError(null)
    let filePath: string | null = null
    try {
      const r = await unwrap(api.dialog.openFile({
        filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }],
      }))
      if (r.canceled || !r.filePath) return
      filePath = r.filePath
    } catch (e) {
      setError((e as Error).message)
      return
    }

    setLoading(true)
    try {
      const preview = await unwrap(api.devices.previewImport({ filePath }))
      setRows(preview.rows)
      setStep(2)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    setError(null)
    const validRows = rows.filter(r => r.valid)
    if (!validRows.length) return
    setImporting(true)
    try {
      await unwrap(api.devices.importBatch({
        rows: validRows.map(r => ({
          sku: r.sku,
          name: r.name,
          categoryId: r.categoryId,
          groupId: r.groupId,
          serialNumber: r.serialNumber,
          notes: r.notes,
        })),
      }))
      onImported()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  function resetToStep1() {
    setStep(1)
    setRows([])
    setError(null)
  }

  const validCount = rows.filter(r => r.valid).length
  const errorCount = rows.length - validCount

  const btnBase: React.CSSProperties = {
    height: 36, padding: '0 16px', border: 'none',
    borderRadius: 'var(--rad-md)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--rad-lg)',
        width: step === 1 ? 420 : 800, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,.25)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 22px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {step === 1 ? 'Nhập thiết bị hàng loạt' : 'Xem trước dữ liệu'}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, flex: 1, overflowY: 'auto' }}>
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Tải file template mẫu, điền thông tin vào Excel, rồi chọn file để nhập hàng loạt.
                Cột <b>Loại</b> và <b>Nhóm</b> phải khớp chính xác với tên đã tạo trong Danh mục.
              </p>
              <div>
                <button
                  onClick={handleDownloadTemplate}
                  style={{
                    height: 36, padding: '0 14px',
                    border: '1px solid var(--border)', borderRadius: 'var(--rad-md)',
                    background: 'var(--surface-2)', color: 'var(--text)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
                >
                  ↓ Tải template mẫu (.xlsx)
                </button>
              </div>
              {error && <div style={{ fontSize: 13, color: '#dc2626' }}>{error}</div>}
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ marginBottom: 10, fontSize: 13 }}>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>{validCount} dòng hợp lệ</span>
                {errorCount > 0 && (
                  <span> · <span style={{ color: '#dc2626', fontWeight: 600 }}>{errorCount} dòng lỗi</span></span>
                )}
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--rad-md)', overflow: 'hidden' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 110px 1fr 110px 110px 1fr',
                  padding: '0 12px', height: 34, alignItems: 'center',
                  background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
                  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
                }}>
                  <div>#</div><div>SKU</div><div>Tên thiết bị</div>
                  <div>Loại</div><div>Nhóm</div><div>Lỗi</div>
                </div>
                {rows.map(row => (
                  <div
                    key={row.rowNum}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 110px 1fr 110px 110px 1fr',
                      padding: '0 12px', minHeight: 38, alignItems: 'center',
                      borderBottom: '1px solid var(--border)', fontSize: 13,
                      background: row.valid ? 'transparent' : 'rgba(220,38,38,.04)',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.rowNum}</div>
                    <div style={{ fontFamily: "'Consolas','SF Mono',monospace", fontWeight: 600 }}>{row.sku || '—'}</div>
                    <div>{row.name || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.category || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.group || '—'}</div>
                    <div style={{ fontSize: 12, color: '#dc2626' }}>{row.error ?? ''}</div>
                  </div>
                ))}
                {rows.length === 0 && (
                  <div style={{ padding: '20px 12px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                    File không có dữ liệu.
                  </div>
                )}
              </div>
              {error && <div style={{ marginTop: 10, fontSize: 13, color: '#dc2626' }}>{error}</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          {step === 1 ? (
            <>
              <button onClick={onClose} style={{ ...btnBase, border: '1px solid var(--border)', background: 'none', color: 'var(--text)' }}>
                Huỷ
              </button>
              <button
                onClick={handleSelectFile}
                disabled={loading}
                style={{ ...btnBase, background: 'var(--primary)', color: '#fff', opacity: loading ? 0.7 : 1, cursor: loading ? 'default' : 'pointer' }}
              >
                {loading ? 'Đang đọc…' : 'Chọn file Excel / CSV'}
              </button>
            </>
          ) : (
            <>
              <button onClick={resetToStep1} style={{ ...btnBase, border: '1px solid var(--border)', background: 'none', color: 'var(--text)' }}>
                Chọn file khác
              </button>
              <button
                onClick={handleImport}
                disabled={validCount === 0 || importing}
                style={{ ...btnBase, background: 'var(--primary)', color: '#fff', opacity: (validCount === 0 || importing) ? 0.7 : 1, cursor: (validCount === 0 || importing) ? 'default' : 'pointer' }}
              >
                {importing ? 'Đang nhập…' : `Nhập ${validCount} thiết bị`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
