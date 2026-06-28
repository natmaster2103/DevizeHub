import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import type { GroupRow, GroupFieldTemplate } from '@shared/ipc'

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

interface Props {
  group: GroupRow
  templates: GroupFieldTemplate[]
  onClose(): void
}

export function GroupEditPanel({ group, templates, onClose }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState(group.name)
  const [pendingThumbPath, setPendingThumbPath] = useState<string | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<number, string>>({})
  const [error, setError] = useState('')

  const { data: detail } = useQuery({
    queryKey: ['groupDetail', group.id],
    queryFn: () => unwrap(api.catalog.getGroupDetail({ groupId: group.id })),
  })

  useEffect(() => {
    if (detail) {
      const vals: Record<number, string> = {}
      for (const f of detail.fields) vals[f.templateId] = f.value
      setFieldValues(vals)
    }
  }, [detail])

  useEffect(() => {
    setName(group.name)
    setPendingThumbPath(null)
    setFieldValues({})
    setError('')
  }, [group.id])

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Tên nhóm không được để trống.')
      await unwrap(api.catalog.saveGroup({ id: group.id, name: name.trim(), categoryId: group.categoryId }))
      await unwrap(api.catalog.saveGroupDetail({
        groupId: group.id,
        thumbnailSourcePath: pendingThumbPath,
        fields: templates.map(t => ({ templateId: t.id, value: fieldValues[t.id] ?? '' })),
      }))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog'] })
      qc.invalidateQueries({ queryKey: ['groupDetail', group.id] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  async function pickThumbnail() {
    const res = await api.dialog.openFile({
      filters: [{ name: 'Ảnh', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    })
    if (res.ok && !res.data.canceled && res.data.filePath) {
      setPendingThumbPath(res.data.filePath)
    }
  }

  const currentThumbPath = pendingThumbPath === null
    ? detail?.thumbnailPath ?? null
    : pendingThumbPath === '' ? null : pendingThumbPath

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 36, padding: '0 10px',
    border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
    background: 'var(--surface)', color: 'var(--text)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      width: 300, borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Chỉnh sửa nhóm</div>
        <button onClick={onClose} style={{
          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
        }}>
          <IconX size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Tên nhóm */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
            Tên nhóm <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Thumbnail */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Ảnh đại diện</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {currentThumbPath ? (
              <img
                src={`file://${currentThumbPath}`}
                alt=""
                style={{ width: 80, height: 80, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)' }}
              />
            ) : (
              <div style={{
                width: 80, height: 80, borderRadius: 6, border: '1px dashed var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, color: 'var(--text-muted)',
              }}>🖼</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={pickThumbnail}
                style={{
                  height: 30, padding: '0 10px', fontSize: 12, fontWeight: 600,
                  border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
                  background: 'none', color: 'var(--text)', cursor: 'pointer',
                }}
              >Chọn ảnh</button>
              {currentThumbPath && (
                <button
                  onClick={() => setPendingThumbPath('')}
                  style={{
                    height: 30, padding: '0 10px', fontSize: 12, fontWeight: 600,
                    border: '1px solid rgba(220,38,38,.3)', borderRadius: 'var(--rad-sm)',
                    background: 'none', color: '#dc2626', cursor: 'pointer',
                  }}
                >Xóa ảnh</button>
              )}
            </div>
          </div>
        </div>

        {/* Field values */}
        {templates.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Thông tin bổ sung
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {templates.map(t => (
                <div key={t.id}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t.name}</label>
                  <input
                    value={fieldValues[t.id] ?? ''}
                    onChange={e => setFieldValues(prev => ({ ...prev, [t.id]: e.target.value }))}
                    placeholder="Chưa điền"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 500 }}>{error}</div>}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', gap: 8,
        padding: '12px 14px', borderTop: '1px solid var(--border)',
      }}>
        <button onClick={onClose} style={{
          height: 34, padding: '0 14px', border: '1px solid var(--border)',
          borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>Hủy</button>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          style={{
            height: 34, padding: '0 14px', border: 'none',
            borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
            color: '#fff', fontSize: 12, fontWeight: 600,
            cursor: saveMut.isPending ? 'not-allowed' : 'pointer',
            opacity: saveMut.isPending ? 0.7 : 1,
          }}
        >{saveMut.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
      </div>
    </div>
  )
}
