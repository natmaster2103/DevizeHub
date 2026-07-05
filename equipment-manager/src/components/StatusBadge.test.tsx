// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it('renders the Vietnamese label for a status', () => {
    render(<StatusBadge status="available" />)
    expect(screen.getByText('Trong kho')).toBeTruthy()
  })
})
