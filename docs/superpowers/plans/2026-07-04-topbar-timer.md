# Topbar Live Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live-updating clock (device local `hh:mm:ss` + `dd/mm/yyyy`) to the right side of the Topbar, before the theme toggle button.

**Architecture:** A single self-contained `Timer` component (`src/components/Timer.tsx`) holds its own `Date` state, ticking via `setInterval(1000)` inside a `useEffect`, cleaned up on unmount. It exports two pure formatting helpers (`formatTime`, `formatDate`) for direct unit testing. `Topbar.tsx` renders `<Timer />` followed by a divider, ahead of the existing theme-toggle button.

**Tech Stack:** React 18, Vitest + `@testing-library/react` (jsdom environment, already configured in `vitest.config.ts`), no new dependencies.

## Global Constraints

- Date format: `dd/mm/yyyy` (spec decision).
- Time format: `hh:mm:ss`, 24-hour, device local time via `new Date()` (spec decision — no timezone override, no server/main-process sync).
- No new date-formatting library — use manual `padStart(2, '0')` construction, consistent with existing codebase style (e.g. `src/pages/Settings.tsx:429`).
- Styling: inline styles + CSS custom properties only (`var(--text-muted)`, etc.) — no CSS modules, per `equipment-manager/CLAUDE.md`.
- All user-facing text in the app is Vietnamese; this component has no user-facing text/labels (only numerals), so no translation needed.

---

### Task 1: Timer component with formatting helpers

**Files:**
- Create: `src/components/Timer.tsx`
- Test: `src/components/Timer.test.tsx`

**Interfaces:**
- Produces: `formatTime(d: Date): string` — returns `"hh:mm:ss"`, 24-hour, zero-padded.
- Produces: `formatDate(d: Date): string` — returns `"dd/mm/yyyy"`, zero-padded.
- Produces: `Timer(): JSX.Element` — no props, renders current device time/date, updates every second while mounted.

- [ ] **Step 1: Write the failing test file**

Create `src/components/Timer.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/Timer.test.tsx`
Expected: FAIL — `Timer.tsx` does not exist (module not found / cannot resolve `./Timer`).

- [ ] **Step 3: Implement the minimal component**

Create `src/components/Timer.tsx`:

```tsx
import { useEffect, useState } from 'react'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function formatTime(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatDate(d: Date) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function Timer() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ lineHeight: 1.2, whiteSpace: 'nowrap', textAlign: 'right' }}>
      <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {formatTime(now)}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {formatDate(now)}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/Timer.test.tsx`
Expected: PASS — all 6 tests green (2 `formatTime`, 2 `formatDate`, 3 `Timer`... actually 7 total: recount — 2 + 2 + 3 = 7).

- [ ] **Step 5: Commit**

```bash
git add src/components/Timer.tsx src/components/Timer.test.tsx
git commit -m "feat(topbar): add live clock Timer component"
```

---

### Task 2: Wire Timer into Topbar

**Files:**
- Modify: `src/components/Topbar.tsx:1-3` (imports), `src/components/Topbar.tsx:36-40` (right-controls block)

**Interfaces:**
- Consumes: `Timer` from `./Timer` (as produced in Task 1) — no props.

- [ ] **Step 1: Add the import**

In `src/components/Topbar.tsx`, change line 3 from:

```tsx
import { IconSun, IconMoon, IconLogout } from '@/lib/icons'
```

to:

```tsx
import { IconSun, IconMoon, IconLogout } from '@/lib/icons'
import { Timer } from './Timer'
```

- [ ] **Step 2: Render Timer + divider before the theme toggle**

In `src/components/Topbar.tsx`, the right-controls block currently reads (lines 36-40):

```tsx
      {/* Right: controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>


        {/* Theme toggle */}
```

Replace it with:

```tsx
      {/* Right: controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

        {/* Live clock */}
        <Timer />

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 2px' }} />

        {/* Theme toggle */}
```

(The rest of the file — theme toggle button, existing divider, avatar block, logout button — is unchanged.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 4: Run the full component test suite**

Run: `npx vitest run src/components/Timer.test.tsx src/components/StatusBadge.test.tsx`
Expected: PASS (confirms the Timer test still passes and Topbar's existing sibling component tests are undisturbed).

- [ ] **Step 5: Manual verification**

Run: `npm run dev`
Expected: app launches; Topbar shows a ticking `hh:mm:ss` / `dd/mm/yyyy` clock at the far right, immediately left of a divider and the theme-toggle sun/moon icon. Watch it for a few seconds to confirm the seconds digit increments and no layout jitter occurs (tabular-nums keeps width stable).

- [ ] **Step 6: Commit**

```bash
git add src/components/Topbar.tsx
git commit -m "feat(topbar): wire live clock into topbar layout"
```
