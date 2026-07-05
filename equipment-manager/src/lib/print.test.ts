import { describe, it, expect } from 'vitest'
import { buildPrintHTML } from './print'
import type { RequestDetail } from '@shared/ipc'

const mockRequest: RequestDetail = {
  id: 1,
  code: 'DX-302',
  department: 'IT',
  departmentId: null,
  createdAt: '22/06/2026',
  deviceCount: 2,
  status: 'allocated',
  allReturned: false,
  notes: null,
  lines: [
    {
      allocationId: 10,
      deviceSku: 'LT-001',
      deviceName: 'Laptop Dell XPS',
      category: 'Laptop',
      recipient: 'Nguyễn Văn A',
      issuedAt: '22/06/2026 09:00',
      isReturned: false,
    },
    {
      allocationId: 11,
      deviceSku: 'LT-002',
      deviceName: 'Laptop ThinkPad',
      category: 'Laptop',
      recipient: 'Trần Thị B',
      issuedAt: '22/06/2026 09:05',
      isReturned: true,
    },
  ],
}

describe('buildPrintHTML', () => {
  it('includes the request code in output', () => {
    const html = buildPrintHTML(mockRequest)
    expect(html).toContain('DX-302')
  })

  it('includes department name', () => {
    const html = buildPrintHTML(mockRequest)
    expect(html).toContain('IT')
  })

  it('includes all device rows', () => {
    const html = buildPrintHTML(mockRequest)
    expect(html).toContain('LT-001')
    expect(html).toContain('Laptop Dell XPS')
    expect(html).toContain('Nguyễn Văn A')
  })

  it('shows Đã trả for returned devices', () => {
    const html = buildPrintHTML(mockRequest)
    expect(html).toContain('Đã trả')
  })

  it('escapes HTML special characters', () => {
    const html = buildPrintHTML({
      ...mockRequest,
      code: '<script>alert(1)</script>',
      lines: [],
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
