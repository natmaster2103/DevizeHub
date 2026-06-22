import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'
import type { CreateAllocationArgs, AvailableDeviceRow } from '@shared/ipc'

function useAllocateFormData() {
  return useQuery({
    queryKey: ['allocate', 'formData'],
    queryFn: () => unwrap(api.allocate.formData()),
  })
}

const REQUIRED = <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        {label}{required && REQUIRED}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px',
  border: '1px solid var(--border)', borderRadius: 'var(--rad-sm)',
  background: 'var(--surface)', color: 'var(--text)',
  fontSize: 14, outline: 'none', boxSizing: 'border-box'
}

// ── Device combobox (multi-select token/chip) ──────────────────────────────────
function DeviceCombobox({
  available,
  selected,
  onAdd,
  onRemove,
}: {
  available: AvailableDeviceRow[]
  selected: AvailableDeviceRow[]
  onAdd(sku: string): void
  onRemove(sku: string): void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedSkus = new Set(selected.map(d => d.sku))
  const filtered = available
    .filter(d => !selectedSkus.has(d.sku))
    .filter(d => {
      const q = query.trim().toLowerCase()
      return !q || (d.name + ' ' + d.sku + ' ' + d.category).toLowerCase().includes(q)
    })
    .slice(0, 50)

  function handleAdd(sku: string) {
    onAdd(sku)
    setQuery('')
    // keep dropdown open for next pick
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Token box */}
      <div
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
        style={{
          minHeight: 42, padding: '6px 10px',
          border: `1px solid ${open ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 'var(--rad-sm)', background: 'var(--surface)',
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          cursor: 'text', boxSizing: 'border-box'
        }}
      >
        {selected.map(d => (
          <span
            key={d.sku}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 8px', borderRadius: 999,
              background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
              color: 'var(--primary)', fontSize: 12, fontWeight: 600
            }}
          >
            {d.name}
            <button
              onMouseDown={e => { e.preventDefault(); onRemove(d.sku) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, color: 'inherit', display: 'flex',
                lineHeight: 1, fontSize: 14
              }}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={selected.length ? 'Thêm thiết bị…' : 'Gõ tên hoặc SKU để tìm thiết bị…'}
          style={{
            flex: 1, minWidth: 160, border: 'none', outline: 'none',
            background: 'transparent', fontSize: 14, color: 'var(--text)',
            padding: '2px 0'
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: 4, zIndex: 60,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--rad-sm)', boxShadow: '0 4px 16px rgba(0,0,0,.12)',
          maxHeight: 240, overflowY: 'auto'
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
              Không có thiết bị phù hợp.
            </div>
          )}
          {filtered.map(d => (
            <div
              key={d.sku}
              onMouseDown={e => { e.preventDefault(); handleAdd(d.sku) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)', fontSize: 13
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  <span style={{ fontFamily: "'Consolas',monospace" }}>{d.sku}</span>
                  {d.category ? ` · ${d.category}` : ''}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                background: 'rgba(22,163,74,.14)', color: '#16a34a'
              }}>Trong kho</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Allocate() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading } = useAllocateFormData()

  const [selectedDevices, setSelectedDevices] = useState<AvailableDeviceRow[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [requestId, setRequestId] = useState('')
  const [conditionNotes, setConditionNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState(false)

  function addDevice(sku: string) {
    const dev = data?.availableDevices.find(d => d.sku === sku)
    if (dev && !selectedDevices.find(d => d.sku === sku)) {
      setSelectedDevices(prev => [...prev, dev])
    }
  }

  function removeDevice(sku: string) {
    setSelectedDevices(prev => prev.filter(d => d.sku !== sku))
  }

  const mutation = useMutation({
    mutationFn: async (args: Omit<CreateAllocationArgs, 'deviceSku'> & { deviceSkus: string[] }) => {
      for (const sku of args.deviceSkus) {
        await unwrap(api.allocate.create({ ...args, deviceSku: sku }))
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['allocate'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['requests', 'available-devices'] })
      setSuccess(true)
      setSelectedDevices([])
      setEmployeeId(''); setDepartmentId(''); setDueDate('')
      setRequestId(''); setConditionNotes('')
    },
    onError: (e) => setFormError((e as Error).message),
  })

  function submit() {
    setFormError('')
    setSuccess(false)
    if (selectedDevices.length === 0) { setFormError('Vui lòng chọn thiết bị.'); return }
    if (!employeeId) { setFormError('Vui lòng chọn nhân viên nhận.'); return }
    if (!departmentId) { setFormError('Vui lòng chọn phòng ban.'); return }
    mutation.mutate({
      deviceSkus: selectedDevices.map(d => d.sku),
      employeeId: Number(employeeId),
      departmentId: Number(departmentId),
      dueDate: dueDate || null,
      requestId: requestId ? Number(requestId) : null,
      conditionOut: conditionNotes,
      notes: '',
    })
  }

  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'auto' as any }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--rad-lg)', padding: '22px 24px',
        display: 'flex', flexDirection: 'column', gap: 18
      }}>
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Phiếu cấp phát lẻ</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Bàn giao nhanh thiết bị cho nhân viên, không qua phiếu đề nghị.
          </div>
        </div>

        {isLoading && (
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Đang tải…</div>
        )}

        {!isLoading && (
          <>
            {/* Thiết bị — combobox */}
            <Field label="Thiết bị" required>
              <DeviceCombobox
                available={data?.availableDevices ?? []}
                selected={selectedDevices}
                onAdd={addDevice}
                onRemove={removeDevice}
              />
            </Field>

            {/* 2-col: employee + department */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Nhân viên nhận" required>
                <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
                  style={selectStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
                  <option value="">— Chọn nhân viên —</option>
                  {(data?.employees ?? []).map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name}{e.departmentName ? ` · ${e.departmentName}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Phòng ban" required>
                <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}
                  style={selectStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
                  <option value="">— Chọn phòng ban —</option>
                  {(data?.departments ?? []).map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </Field>
            </div>

            {/* 2-col: due date + request */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Ngày hẹn trả">
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </Field>
              <Field label="Liên kết phiếu đề nghị">
                <select value={requestId} onChange={e => setRequestId(e.target.value)}
                  style={selectStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
                  <option value="">— Không liên kết —</option>
                  {(data?.requests ?? []).map(r => (
                    <option key={r.id} value={r.id}>{r.code}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Tình trạng / ghi chú bàn giao">
              <textarea
                value={conditionNotes}
                onChange={e => setConditionNotes(e.target.value)}
                rows={3}
                placeholder="VD: Máy mới, kèm sạc và túi chống sốc…"
                style={{ ...inputStyle, height: 84, padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit' }}
                onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </Field>
          </>
        )}

        {formError && (
          <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{formError}</div>
        )}

        {success && (
          <div style={{
            fontSize: 13, fontWeight: 600, color: '#16a34a',
            padding: '10px 14px', borderRadius: 'var(--rad-sm)',
            background: 'rgba(22,163,74,.1)', border: '1px solid rgba(22,163,74,.2)'
          }}>
            Cấp phát thành công!
          </div>
        )}

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          paddingTop: 8, borderTop: '1px solid var(--border)'
        }}>
          <button
            onClick={() => navigate('/')}
            style={{
              height: 40, padding: '0 18px', border: '1px solid var(--border)',
              borderRadius: 'var(--rad-sm)', background: 'none', color: 'var(--text)',
              fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hoverbg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >Hủy</button>
          <button
            onClick={submit}
            disabled={mutation.isPending || isLoading}
            style={{
              height: 40, padding: '0 20px', border: 'none',
              borderRadius: 'var(--rad-sm)', background: 'var(--primary)',
              color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: (mutation.isPending || isLoading) ? 'not-allowed' : 'pointer',
              opacity: (mutation.isPending || isLoading) ? 0.7 : 1,
              boxShadow: '0 4px 12px color-mix(in srgb, var(--primary) 30%, transparent)'
            }}
            onMouseEnter={e => { if (!mutation.isPending) (e.currentTarget.style.background = 'var(--primary-hover)') }}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
          >
            {mutation.isPending ? 'Đang xử lý…' : 'Xác nhận cấp phát'}
          </button>
        </div>
      </div>
    </div>
  )
}
