import { describe, it, expect } from 'vitest'
import { minutesSinceMidnight, parseTimeToMinutes, dateKey, shouldTriggerLogout } from './autoLogout'

describe('minutesSinceMidnight', () => {
  it('converts a time to minutes since midnight', () => {
    expect(minutesSinceMidnight(new Date(2026, 6, 4, 7, 30))).toBe(450)
  })
  it('handles midnight', () => {
    expect(minutesSinceMidnight(new Date(2026, 6, 4, 0, 0))).toBe(0)
  })
})

describe('parseTimeToMinutes', () => {
  it('parses an HH:mm string to minutes since midnight', () => {
    expect(parseTimeToMinutes('07:30')).toBe(450)
  })
  it('parses midnight and end-of-day', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0)
    expect(parseTimeToMinutes('23:59')).toBe(1439)
  })
})

describe('dateKey', () => {
  it('is stable within the same calendar day', () => {
    expect(dateKey(new Date(2026, 6, 4, 0, 0))).toBe(dateKey(new Date(2026, 6, 4, 23, 59)))
  })
  it('differs across a day boundary', () => {
    expect(dateKey(new Date(2026, 6, 4, 23, 59))).not.toBe(dateKey(new Date(2026, 6, 5, 0, 0)))
  })
})

describe('shouldTriggerLogout', () => {
  it('fires once the clock reaches the target and it has not fired yet today', () => {
    expect(shouldTriggerLogout(450, 450, false)).toBe(true)
    expect(shouldTriggerLogout(451, 450, false)).toBe(true)
  })
  it('does not fire before the target time', () => {
    expect(shouldTriggerLogout(449, 450, false)).toBe(false)
  })
  it('does not fire again once already handled today', () => {
    expect(shouldTriggerLogout(500, 450, true)).toBe(false)
  })
})
