# Topbar Live Clock — Design

## Goal

Show the current device date and time in the Topbar, updating live, placed at the right side before the theme toggle button.

## Context

- `Topbar.tsx` (`src/components/Topbar.tsx`) renders a right-aligned controls row: theme toggle → divider → avatar/name/role block → logout button.
- No existing global timer/interval infrastructure exists in the app (`UiContext` only manages `dark`/`collapsed` state; no `setInterval`/`useInterval` usage found anywhere in `src/` or `electron/`). So "sync with timer of application" means: tick live, once per second, matching the actual clock — not hooking into a pre-existing shared timer.
- Vietnamese-locale date conventions are already used elsewhere in the codebase (e.g. `dd/mm/yyyy` construction in `Settings.tsx`, `dashboard.ts`, `devices.ts`).

## Decisions

- **Date format:** `dd/mm/yyyy`.
- **Time format:** `hh:mm:ss`, 24-hour, device local time (`new Date()`).
- **Time source:** device local clock — no timezone override, no main-process/server sync.

## Component

New file: `src/components/Timer.tsx`

- Self-contained function component, no props.
- `useState<Date>(() => new Date())`, updated via `setInterval(..., 1000)` inside a `useEffect`, cleared on unmount.
- Renders two stacked lines (mirrors the existing avatar/name/role block's `lineHeight`/stacking pattern):
  - Top: `hh:mm:ss`, bold, `fontVariantNumeric: 'tabular-nums'` to avoid digit-width jitter as seconds tick.
  - Bottom: `dd/mm/yyyy`, small, `var(--text-muted)` color — matches the role-label styling under the avatar.
- Manual, dependency-free formatting (pad with `padStart(2, '0')`), consistent with the existing date-formatting style used elsewhere in the codebase (no new date library).

## Integration

In `Topbar.tsx`, inside the right-hand controls `<div>`:

- Render `<Timer />` first (leftmost of the right-side controls).
- Follow it with a `Divider` (reuse the same divider `<div>` markup already used before the avatar block) to visually separate the clock from the theme toggle.
- Theme toggle, avatar block, divider, logout button remain unchanged and keep their current order after the new Timer + divider.

## Testing

- No existing test coverage for `Topbar.tsx`; this change does not add new test infra. Manual verification: run the app, confirm the clock ticks once per second and date is correct.

## Out of scope

- No timezone selection, no 12-hour format toggle, no server-time sync, no persistence of any timer state.
