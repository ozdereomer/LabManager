import { useEffect, useState } from 'react'
import api from '../services/api'
import { getApiErrorMessage } from '../utils/apiError'

function Settings({ onLogout }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailError, setEmailError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true

    async function fetchProfile() {
      try {
        const response = await api.get('/users/me')

        if (active) {
          setProfile(response.data)
        }
      } catch (err) {
        if (!active) return

        if (err.response?.status === 401) {
          return
        }

        const status = err.response?.status

        setError(
          status === 429 || status === 503
            ? getApiErrorMessage(err)
            : 'Hesap bilgileri yüklenemedi.'
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    fetchProfile()

    return () => {
      active = false
    }
  }, [onLogout])

  function getErrorMessage(err) {
    const status = err.response?.status

    if (status === 429 || status === 503) {
      return getApiErrorMessage(err)
    }

    const detail = err.response?.data?.detail

    const messages = {
      'Incorrect current password': 'Mevcut şifreniz yanlış.',
      'Email already registered': 'Bu e-posta adresi zaten kayıtlı.',
      'New email must be different': 'Yeni e-posta adresiniz farklı olmalıdır.',
      'New password must be different': 'Yeni şifreniz mevcut şifrenizden farklı olmalıdır.',
    }

    if (err.response?.status === 422) {
      return 'Lütfen girdiğiniz bilgileri kontrol edin.'
    }

    if (typeof detail === 'string' && Object.hasOwn(messages, detail)) {
      return messages[detail]
    }

    return 'İşlem gerçekleştirilemedi.'
  }

  async function handleEmailUpdate(event) {
    event.preventDefault()
    setEmailError('')
    setSaving(true)

    try {
      await api.put('/users/me/email', {
        new_email: newEmail.trim(),
        current_password: emailPassword,
      })

      setEmailPassword('')
      alert('E-posta adresiniz güncellendi. Lütfen tekrar giriş yapın.')
      onLogout()
    } catch (err) {
      if (err.response?.status === 401) {
        return
      }

      setEmailError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault()
    setPasswordError('')

    if (newPassword.length < 8) {
      setPasswordError('Yeni şifre en az 8 karakter olmalıdır.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Yeni şifreler eşleşmiyor.')
      return
    }

    if (currentPassword === newPassword) {
      setPasswordError('Yeni şifreniz mevcut şifrenizden farklı olmalıdır.')
      return
    }

    setSaving(true)

    try {
      await api.put('/users/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      })

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')

      alert('Şifreniz güncellendi. Lütfen tekrar giriş yapın.')
      onLogout()
    } catch (err) {
      if (err.response?.status === 401) {
        return
      }

      setPasswordError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Ayarlar</h1>
          <p className="page-subtitle">
            Hesap ve güvenlik ayarlarınızı yönetin.
          </p>
        </div>
      </header>

      {loading && <p>Hesap bilgileri yükleniyor...</p>}

      {error && <p className="auth-error">{error}</p>}

      {profile && (
        <>
          <section className="panel settings-panel">
            <div className="panel-header">
              <h2 className="panel-title">Hesap Bilgileri</h2>
            </div>

            <div className="settings-profile">
              <div className="settings-info">
                <span>Kullanıcı ID</span>
                <strong>#{profile.id}</strong>
              </div>

              <div className="settings-info">
                <span>E-posta adresi</span>
                <strong>{profile.email}</strong>
              </div>

              <div className="settings-info">
                <span>Hesap durumu</span>
                <strong>
                  {profile.is_active ? 'Aktif' : 'Pasif'}
                </strong>
              </div>

              <div className="settings-info">
                <span>Kayıt tarihi</span>
                <strong>
                  {new Date(profile.created_at).toLocaleDateString('tr-TR')}
                </strong>
              </div>
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="panel-header">
              <h2 className="panel-title">E-posta Değiştir</h2>
            </div>

            <form
              className="settings-form"
              onSubmit={handleEmailUpdate}
            >
              <label htmlFor="new-email">
                Yeni e-posta adresi
              </label>

              <input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="ornek@example.com"
                autoComplete="email"
                maxLength={255}
                required
              />

              <label htmlFor="email-password">
                Mevcut şifre
              </label>

              <input
                id="email-password"
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                autoComplete="current-password"
                maxLength={128}
                required
              />

              {emailError && (
                <p className="auth-error">{emailError}</p>
              )}

              <button
                type="submit"
                className="add-button"
                disabled={saving}
              >
                {saving ? 'İşleniyor...' : 'E-postayı Güncelle'}
              </button>
            </form>
          </section>

          <section className="panel settings-panel">
            <div className="panel-header">
              <h2 className="panel-title">Şifre Değiştir</h2>
            </div>

            <form
              className="settings-form"
              onSubmit={handlePasswordUpdate}
            >
              <label htmlFor="current-password">
                Mevcut şifre
              </label>

              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                maxLength={128}
                required
              />

              <label htmlFor="new-password">
                Yeni şifre
              </label>

              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />

              <label htmlFor="confirm-password">
                Yeni şifre tekrar
              </label>

              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />

              {passwordError && (
                <p className="auth-error">{passwordError}</p>
              )}

              <button
                type="submit"
                className="add-button"
                disabled={saving}
              >
                {saving ? 'İşleniyor...' : 'Şifreyi Güncelle'}
              </button>

              <p className="settings-note">
                E-posta veya şifre değişikliğinde tüm
                mevcut oturumlarınız sonlandırılır.
              </p>
            </form>
          </section>

          <section className="panel settings-panel">
            <div className="panel-header">
              <h2 className="panel-title">Oturum Yönetimi</h2>
            </div>

            <button
              type="button"
              className="add-button"
              onClick={onLogout}
              disabled={saving}
            >
              Çıkış Yap
            </button>
          </section>
        </>
      )}
    </>
  )
}

export default Settings
