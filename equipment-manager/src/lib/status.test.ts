import { describe, it, expect } from 'vitest'
import { STATUS_LABELS, badgeStyle } from './status'
import { REQUEST_STATUS_LABELS, requestBadgeStyle } from './status'

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

describe('request status', () => {
  it('maps pending to Chưa cấp phát with grey color', () => {
    expect(REQUEST_STATUS_LABELS.pending).toBe('Chưa cấp phát')
    expect(requestBadgeStyle('pending').fg).toBe('#64748b')
  })
  it('maps allocated to Đang cho mượn with blue', () => {
    expect(REQUEST_STATUS_LABELS.allocated).toBe('Đang cho mượn')
    expect(requestBadgeStyle('allocated').fg).toBe('#2563eb')
  })
  it('maps completed to Hoàn tất with green', () => {
    expect(REQUEST_STATUS_LABELS.completed).toBe('Hoàn tất')
    expect(requestBadgeStyle('completed').fg).toBe('#16a34a')
  })
})
