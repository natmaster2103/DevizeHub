import { useMemo, useState } from 'react'
import { useReports } from '@/hooks/useReports'
import { resolvePeriod, dayRangeToBounds, type Preset } from '@/lib/period'
import { IconRequests, IconBox } from '@/lib/icons'
import type { ReportGroupRow, ReportDeptRow } from '@shared/ipc'

function fmtVn(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--rad-lg)', padding: 18,
}

function PresetButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 'var(--rad-sm)', cursor: 'pointer',
        fontSize: 13, fontWeight: 600,
        border: '1px solid var(--border)',
        background: active ? 'var(--primary)' : 'none',
        color: active ? '#fff' : 'var(--text)',
      }}
    >
      {children}
    </button>
  )
}

function BarRow({ label, count, share }: { label: string; count: number; share?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
      <div style={{ width: 170, fontSize: 13, color: 'var(--text)', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${share ?? 0}%`, height: '100%', background: 'var(--primary)' }} />
      </div>
      <div style={{ width: 64, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>
        {count} lượt{share != null ? ` · ${share}%` : ''}
      </div>
    </div>
  )
}

export default function Reports() {
  const today = useMemo(() => new Date(), [])
  const [preset, setPreset] = useState<Preset>('month')
  const initial = useMemo(() => resolvePeriod('month', today), [today])
  const [startYmd, setStartYmd] = useState(initial.startYmd)
  const [endYmd, setEndYmd] = useState(initial.endYmd)

  function selectPreset(p: Preset) {
    if (p === 'custom') { setPreset('custom'); return }
    const r = resolvePeriod(p, today)
    setStartYmd(r.startYmd)
    setEndYmd(r.endYmd)
    setPreset(p)
  }

  const active = useMemo(() => {
    if (preset === 'custom') return { ...dayRangeToBounds(startYmd, endYmd), startYmd, endYmd }
    return resolvePeriod(preset, today)
  }, [preset, startYmd, endYmd, today])

  const { data, isLoading, isError } = useReports({ from: active.from, to: active.to })

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto' }}>
      {/* Bộ chọn kỳ */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Kỳ:</span>
          <PresetButton active={preset === 'week'} onClick={() => selectPreset('week')}>Tuần này</PresetButton>
          <PresetButton active={preset === 'month'} onClick={() => selectPreset('month')}>Tháng này</PresetButton>
          <PresetButton active={preset === 'custom'} onClick={() => selectPreset('custom')}>Tùy chọn</PresetButton>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <input
              type="date" value={active.startYmd} disabled={preset !== 'custom'}
              onChange={(e) => setStartYmd(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 'var(--rad-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
            <span style={{ color: 'var(--text-muted)' }}>—</span>
            <input
              type="date" value={active.endYmd} disabled={preset !== 'custom'}
              onChange={(e) => setEndYmd(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 'var(--rad-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
          Đang xem: {fmtVn(active.startYmd)} – {fmtVn(active.endYmd)}
        </div>
      </div>

      {isLoading && <div style={{ ...card, color: 'var(--text-muted)' }}>Đang tải…</div>}
      {isError && <div style={{ ...card, color: '#dc2626' }}>Không tải được báo cáo.</div>}

      {data && (
        <>
          {/* Hàng trên: phiếu đề nghị + tổng lượt */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--rad-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary-tint)', color: 'var(--primary)' }}>
                  <IconRequests size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Số phiếu đề nghị</div>
                  <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{data.requestCount}</div>
                </div>
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {data.requests.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Không có phiếu trong kỳ.</div>
                )}
                {data.requests.map((r) => (
                  <div key={r.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span>{r.code} – {r.deptName}</span>
                    <span style={{ fontWeight: 600 }}>{r.allocationCount} lượt</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Tổng lượt cấp phát</div>
                  <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6, lineHeight: 1 }}>{data.totalAllocations}</div>
                </div>
                <div style={{ width: 42, height: 42, borderRadius: 'var(--rad-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary-tint)', color: 'var(--primary)' }}>
                  <IconBox size={20} />
                </div>
              </div>
            </div>
          </div>

          {/* Hàng dưới: theo nhóm + theo phòng ban */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Lượt cấp phát theo nhóm thiết bị</div>
              {data.byGroup.length === 0
                ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Không có dữ liệu trong kỳ.</div>
                : data.byGroup.map((g: ReportGroupRow) => (
                    <BarRow key={g.groupId != null ? String(g.groupId) : 'ungrouped'} label={g.groupName} count={g.count} share={g.share} />
                  ))}
            </div>
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Lượt cấp phát theo phòng ban</div>
              {data.byDepartment.length === 0
                ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Không có dữ liệu trong kỳ.</div>
                : data.byDepartment.map((d: ReportDeptRow) => (
                    <BarRow key={d.deptId != null ? String(d.deptId) : 'no-dept'} label={d.deptName} count={d.count} share={d.share} />
                  ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
