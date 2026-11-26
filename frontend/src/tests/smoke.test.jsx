import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

function TestCounter() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <p>Sayaç: {count}</p>

      <button onClick={() => setCount(count + 1)}>
        Artır
      </button>
    </div>
  )
}

describe('Frontend test environment', () => {
  it('renders a React component', () => {
    render(<TestCounter />)

    expect(screen.getByText('Sayaç: 0')).toBeInTheDocument()
  })

  it('handles user interactions', async () => {
    const user = userEvent.setup()

    render(<TestCounter />)

    await user.click(
      screen.getByRole('button', { name: 'Artır' })
    )

    expect(screen.getByText('Sayaç: 1')).toBeInTheDocument()
  })
})
