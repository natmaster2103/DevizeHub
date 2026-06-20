import { describe, it, expect } from 'vitest'
import { STATUS_LABELS, badgeStyle } from './status'

describe('status map', () => {
  it('maps English enums to Vietnamese labels', () => {
    expect(STATUS_LABELS.available).toBe('Trong kho')
    expect(STATUS_LABELS.allocated).toBe('Đang trang bị')
    expect(STATUS_LABELS.maintenance).toBe('Đang bảo trì')
    expect(STATUS_LABELS.broken).toBe('Hỏng')
    expect(STATUS_LABELS.decommissioned).toBe('Thanh lý')
  })
  it('gives green for available and primary blue for allocated', () => {
    expect(badgeStyle('available').fg).toBe('#16a34a')
    expect(badgeStyle('allocated').fg).toBe('#2563eb')
  })
})
