export function getApiErrorMessage(
  error,
  fallback = 'Bir hata oluştu. Tekrar deneyin.'
) {
  const detail = error?.response?.data?.detail

  if (Array.isArray(detail)) {
    return 'Girdiğiniz bilgileri kontrol edin.'
  }

  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  return fallback
}
