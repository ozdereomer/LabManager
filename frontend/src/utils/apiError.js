export function getApiErrorMessage(
  error,
  fallback = 'Bir hata oluştu. Tekrar deneyin.'
) {
  const status = error?.response?.status
  const detail = error?.response?.data?.detail

  if (status === 429) {
    const retryAfter = error.response.headers?.['retry-after']

    if (
      typeof retryAfter === 'string' &&
      /^\d+$/.test(retryAfter)
    ) {
      const seconds = Number(retryAfter)

      if (Number.isSafeInteger(seconds) && seconds > 0) {
        return `Çok fazla işlem yaptınız. Lütfen ${seconds} saniye sonra tekrar deneyin.`
      }
    }

    return 'Çok fazla istek gönderdiniz. Lütfen bir süre sonra tekrar deneyin.'
  }

  if (status === 503) {
    return 'Hizmet geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.'
  }

  if (Array.isArray(detail)) {
    return 'Girdiğiniz bilgileri kontrol edin.'
  }

  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  return fallback
}
