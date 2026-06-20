import React from 'react'

type IconProps = { size?: number }

const svg = (size: number, children: React.ReactNode, sw = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)

export const IconDashboard = ({ size = 18 }: IconProps) =>
  svg(size, <>
    <rect x="3" y="3" width="7" height="9" rx="1"/>
    <rect x="14" y="3" width="7" height="5" rx="1"/>
    <rect x="14" y="12" width="7" height="9" rx="1"/>
    <rect x="3" y="16" width="7" height="5" rx="1"/>
  </>)

export const IconDevices = ({ size = 18 }: IconProps) =>
  svg(size, <>
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </>)

export const IconRequests = ({ size = 18 }: IconProps) =>
  svg(size, <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="9" y1="13" x2="15" y2="13"/>
    <line x1="9" y1="17" x2="13" y2="17"/>
  </>)

export const IconAllocate = ({ size = 18 }: IconProps) =>
  svg(size, <>
    <path d="M16 16v-3a4 4 0 0 0-4-4H4"/>
    <polyline points="9 4 4 9 9 14"/>
    <circle cx="18" cy="18" r="3"/>
  </>)

export const IconReports = ({ size = 18 }: IconProps) =>
  svg(size, <>
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
  </>)

export const IconCatalog = ({ size = 18 }: IconProps) =>
  svg(size, <>
    <line x1="8" y1="6" x2="21" y2="6"/>
    <line x1="8" y1="12" x2="21" y2="12"/>
    <line x1="8" y1="18" x2="21" y2="18"/>
    <circle cx="3.5" cy="6" r="1.2"/>
    <circle cx="3.5" cy="12" r="1.2"/>
    <circle cx="3.5" cy="18" r="1.2"/>
  </>)

export const IconSettings = ({ size = 18 }: IconProps) =>
  svg(size, <>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </>)

export const IconBox = ({ size = 20 }: IconProps) =>
  svg(size, <>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </>)

export const IconSearch = ({ size = 16 }: IconProps) =>
  svg(size, <>
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </>)

export const IconScan = ({ size = 16 }: IconProps) =>
  svg(size, <>
    <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
    <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
    <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
    <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
    <line x1="7" y1="12" x2="17" y2="12"/>
  </>)

export const IconView = ({ size = 15 }: IconProps) =>
  svg(size, <>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </>)

export const IconEdit = ({ size = 15 }: IconProps) =>
  svg(size, <>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </>)

export const IconSwap = ({ size = 15 }: IconProps) =>
  svg(size, <>
    <polyline points="17 1 21 5 17 9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </>)

export const IconPlus = ({ size = 16 }: IconProps) =>
  svg(size, <>
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </>, 2.2)

export const IconBack = ({ size = 16 }: IconProps) =>
  svg(size, <>
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </>)

export const IconReturn = ({ size = 14 }: IconProps) =>
  svg(size, <>
    <polyline points="9 14 4 9 9 4"/>
    <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
  </>)

export const IconBell = ({ size = 17 }: IconProps) =>
  svg(size, <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
  </>)

export const IconLogout = ({ size = 17 }: IconProps) =>
  svg(size, <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </>)

export const IconSun = ({ size = 17 }: IconProps) =>
  svg(size, <>
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/>
    <line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/>
    <line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/>
  </>)

export const IconMoon = ({ size = 17 }: IconProps) =>
  svg(size, <>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </>)

export const IconChevronsLeft = ({ size = 18 }: IconProps) =>
  svg(size, <>
    <polyline points="11 17 6 12 11 7"/>
    <polyline points="18 17 13 12 18 7"/>
  </>)

export const IconChevronsRight = ({ size = 18 }: IconProps) =>
  svg(size, <>
    <polyline points="13 17 18 12 13 7"/>
    <polyline points="6 17 11 12 6 7"/>
  </>)

export const IconBuilding = ({ size = 20 }: IconProps) =>
  svg(size, <>
    <path d="M3 21h18"/>
    <path d="M5 21V7l8-4v18"/>
    <path d="M19 21V11l-6-4"/>
    <line x1="9" y1="9" x2="9" y2="9.01"/>
    <line x1="9" y1="12" x2="9" y2="12.01"/>
    <line x1="9" y1="15" x2="9" y2="15.01"/>
  </>)

export const IconWrench = ({ size = 20 }: IconProps) =>
  svg(size, <>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </>)

export const IconCheck = ({ size = 20 }: IconProps) =>
  svg(size, <>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </>)

export const IconClock = ({ size = 20 }: IconProps) =>
  svg(size, <>
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </>)

export const IconAlert = ({ size = 20 }: IconProps) =>
  svg(size, <>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </>)

export const IconDown = ({ size = 18 }: IconProps) =>
  svg(size, <>
    <line x1="12" y1="20" x2="12" y2="10"/>
    <polyline points="6 14 12 20 18 14"/>
  </>)
