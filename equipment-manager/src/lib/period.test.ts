import { describe, it, expect } from 'vitest'
import { resolvePeriod, dayRangeToBounds } from './period'

describe('resolvePeriod — month', () => {
  it('hôm nay 30/06/2026 → kỳ tháng 15/05 – 14/06', () => {
    const r = resolvePeriod('month', new Date(Date.UTC(2026, 5, 30)))
    expect(r.startYmd).toBe('2026-05-15')
    expect(r.endYmd).toBe('2026-06-14')
    expect(r.from).toBe('2026-05-15T00:00:00.000Z')
    expect(r.to).toBe('2026-06-15T00:00:00.000Z') // exclusive: 14/06 + 1 ngày
  })

  it('đúng ngày 14 (14/06/2026): kỳ chứa hôm nay chưa đóng → kỳ trước (15/04 – 14/05)', () => {
    const r = resolvePeriod('month', new Date(Date.UTC(2026, 5, 14)))
    expect(r.startYmd).toBe('2026-04-15')
    expect(r.endYmd).toBe('2026-05-14')
  })

  it('ngày 15 (15/06/2026): 14/06 đã < hôm nay → 15/05 – 14/06', () => {
    const r = resolvePeriod('month', new Date(Date.UTC(2026, 5, 15)))
    expect(r.startYmd).toBe('2026-05-15')
    expect(r.endYmd).toBe('2026-06-14')
  })

  it('đầu năm 05/01/2026 → kỳ giao năm 15/11/2025 – 14/12/2025', () => {
    const r = resolvePeriod('month', new Date(Date.UTC(2026, 0, 5)))
    expect(r.startYmd).toBe('2025-11-15')
    expect(r.endYmd).toBe('2025-12-14')
  })
})

describe('resolvePeriod — week', () => {
  it('thứ 3 30/06/2026 → kỳ tuần thứ 5 18/06 – thứ 4 24/06', () => {
    const r = resolvePeriod('week', new Date(Date.UTC(2026, 5, 30)))
    expect(r.startYmd).toBe('2026-06-18')
    expect(r.endYmd).toBe('2026-06-24')
    expect(r.from).toBe('2026-06-18T00:00:00.000Z')
    expect(r.to).toBe('2026-06-25T00:00:00.000Z')
  })

  it('đúng thứ 4 01/07/2026: kỳ chứa hôm nay chưa đóng → 18/06 – 24/06', () => {
    const r = resolvePeriod('week', new Date(Date.UTC(2026, 6, 1)))
    expect(r.startYmd).toBe('2026-06-18')
    expect(r.endYmd).toBe('2026-06-24')
  })

  it('thứ 5 02/07/2026 → kỳ mới giao tháng 25/06 – 01/07', () => {
    const r = resolvePeriod('week', new Date(Date.UTC(2026, 6, 2)))
    expect(r.startYmd).toBe('2026-06-25')
    expect(r.endYmd).toBe('2026-07-01')
  })
})

describe('dayRangeToBounds', () => {
  it('biên nửa mở: to = ngày kết thúc + 1', () => {
    expect(dayRangeToBounds('2026-06-01', '2026-06-30')).toEqual({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-07-01T00:00:00.000Z',
    })
  })
})
