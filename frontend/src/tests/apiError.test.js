import { describe, it, expect } from 'vitest'
import { getApiErrorMessage } from '../utils/apiError'

describe('API error message helper', () => {
  const fallback = 'Bir hata oluştu.'

  it('returns a backend string error', () => {
    const error = {
      response: {
        data: {
          detail: 'Laboratory not found',
        },
      },
    }

    expect(getApiErrorMessage(error, fallback))
      .toBe('Laboratory not found')
  })

  it('handles validation error arrays', () => {
    const error = {
      response: {
        status: 422,
        data: {
          detail: [
            {
              type: 'string_too_short',
              loc: ['body', 'name'],
              msg: 'Invalid input',
            },
          ],
        },
      },
    }

    expect(getApiErrorMessage(error, fallback))
      .toBe('Girdiğiniz bilgileri kontrol edin.')
  })

  it('handles unexpected error objects', () => {
    const error = {
      response: {
        data: {
          detail: { message: 'Unexpected error' },
        },
      },
    }

    expect(getApiErrorMessage(error, fallback))
      .toBe(fallback)
  })

  it('handles network errors', () => {
    expect(
      getApiErrorMessage(
        new Error('Network Error'),
        fallback
      )
    ).toBe(fallback)
  })

  it.each(['', '   ', null, undefined, 123])(
    'handles invalid detail values: %s',
    (detail) => {
      const error = {
        response: {
          data: { detail },
        },
      }

      expect(getApiErrorMessage(error, fallback))
        .toBe(fallback)
    }
  )

  it('handles a missing error object', () => {
    expect(getApiErrorMessage(null, fallback))
      .toBe(fallback)
  })

  it('provides a default fallback message', () => {
    expect(getApiErrorMessage(new Error()))
      .toBe('Bir hata oluştu. Tekrar deneyin.')
  })
})
