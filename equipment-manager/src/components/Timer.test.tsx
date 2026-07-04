// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Timer, formatTime, formatDate } from './Timer'

describe('formatTime', () => {
  it('pads hours, minutes, seconds to two digits', () => {
    const d = new Date(2026, 6, 4, 9, 5, 3)
    expect(formatTime(d)).toBe('09:05:03')
  })

  it('does not pad already-two-digit values', () => {
    const d = new Date(2026, 6, 4, 23, 59, 58)
    expect(formatTime(d)).toBe('23:59:58')
  })
})

describe('formatDate', () => {
  it('formats as dd/mm/yyyy with zero-padding', () => {
    const d = new Date(2026, 6, 4)
    expect(formatDate(d)).toBe('04/07/2026')
  })

  it('does not pad already-two-digit day/month', () => {
    const d = new Date(2026, 11, 25)
    expect(formatDate(d)).toBe('25/12/2026')
  })
})

describe('Timer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 4, 9, 5, 3))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the initial time and date', () => {
    render(<Timer />)
    expect(screen.getByText('09:05:03')).toBeTruthy()
    expect(screen.getByText('04/07/2026')).toBeTruthy()
  })

  it('updates the displayed time every second', () => {
    render(<Timer />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('09:05:04')).toBeTruthy()
  })

  it('rolls over to the next date at midnight', () => {
    vi.setSystemTime(new Date(2026, 6, 4, 23, 59, 59))
    render(<Timer />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('00:00:00')).toBeTruthy()
    expect(screen.getByText('05/07/2026')).toBeTruthy()
  })
})
