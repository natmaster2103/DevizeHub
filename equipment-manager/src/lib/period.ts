export type Preset = 'week' | 'month' | 'custom'

export interface ResolvedPeriod {
  from: string      // ISO inclusive start
  to: string        // ISO exclusive end
  startYmd: string  // YYYY-MM-DD, inclusive (hiển thị)
  endYmd: string    // YYYY-MM-DD, inclusive (hiển thị)
}

function toYmd(d: Date): string {
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// from = ngày bắt đầu 00:00:00Z; to = (ngày kết thúc + 1) 00:00:00Z (loại trừ)
export function dayRangeToBounds(startYmd: string, endYmd: string): { from: string; to: string } {
  const endNext = new Date(`${endYmd}T00:00:00.000Z`)
  endNext.setUTCDate(endNext.getUTCDate() + 1)
  return { from: `${startYmd}T00:00:00.000Z`, to: `${toYmd(endNext)}T00:00:00.000Z` }
}

function build(startDate: Date, endDate: Date): ResolvedPeriod {
  const startYmd = toYmd(startDate)
  const endYmd = toYmd(endDate)
  return { ...dayRangeToBounds(startYmd, endYmd), startYmd, endYmd }
}

function resolveMonth(today: Date): ResolvedPeriod {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth()
  const day = today.getUTCDate()
  // Ngày 14 làm mốc kết thúc kỳ. Chỉ dùng ngày 14 tháng hiện tại khi nó < hôm nay (day > 14).
  let endY = y
  let endM = m
  if (day <= 14) {
    endM = m - 1
    if (endM < 0) { endM = 11; endY -= 1 }
  }
  const endDate = new Date(Date.UTC(endY, endM, 14))
  // Bắt đầu = ngày 15 của tháng liền trước tháng kết thúc.
  let startY = endY
  let startM = endM - 1
  if (startM < 0) { startM = 11; startY -= 1 }
  const startDate = new Date(Date.UTC(startY, startM, 15))
  return build(startDate, endDate)
}

function resolveWeek(today: Date): ResolvedPeriod {
  // Thứ 4 (getUTCDay === 3) gần nhất, strict trước hôm nay, làm mốc kết thúc.
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  do {
    end.setUTCDate(end.getUTCDate() - 1)
  } while (end.getUTCDay() !== 3)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 6) // thứ 5 đầu kỳ
  return build(start, end)
}

export function resolvePeriod(preset: 'week' | 'month', today: Date): ResolvedPeriod {
  return preset === 'week' ? resolveWeek(today) : resolveMonth(today)
}
