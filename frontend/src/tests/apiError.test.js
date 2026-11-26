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

describe('Rate limiting and service availability errors', () => {
  it.each(['1', '15', '60'])(
    'displays Retry-After seconds: %s',
    (seconds) => {
      const error = {
        response: {
          status: 429,
          headers: {
            'retry-after': seconds,
          },
          data: {
            detail: 'Too many requests.',
          },
        },
      }

      expect(getApiErrorMessage(error)).toBe(
        `Çok fazla işlem yaptınız. Lütfen ${seconds} saniye sonra tekrar deneyin.`
      )
    }
  )

  it.each([
    undefined,
    null,
    '',
    '0',
    '-10',
    '1.5',
    'invalid',
    'Infinity',
    '9007199254740992',
    60,
  ])('handles invalid Retry-After: %s', (value) => {
    const error = {
      response: {
        status: 429,
        headers: {
          'retry-after': value,
        },
      },
    }

    expect(getApiErrorMessage(error)).toBe(
      'Çok fazla istek gönderdiniz. Lütfen bir süre sonra tekrar deneyin.'
    )
  })

  it('handles Nginx rate limiting without headers', () => {
    const error = {
      response: {
        status: 429,
        data: {
          detail: 'Too many requests. Please try again later.',
        },
      },
    }

    expect(getApiErrorMessage(error)).toBe(
      'Çok fazla istek gönderdiniz. Lütfen bir süre sonra tekrar deneyin.'
    )
  })

  it('handles service unavailable errors', () => {
    const error = {
      response: {
        status: 503,
        data: {
          detail: 'Authentication service temporarily unavailable',
        },
      },
    }

    expect(getApiErrorMessage(error)).toBe(
      'Hizmet geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.'
    )
  })

  it('handles service unavailable without response data', () => {
    expect(
      getApiErrorMessage({
        response: { status: 503 },
      })
    ).toBe(
      'Hizmet geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.'
    )
  })
})
