import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { getApiErrorMessage } from '../utils/apiError'

function Auth({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isRegister) {
        await api.post('/register', {
          email,
          password,
        })

        setIsRegister(false)
      }

      const formData = new URLSearchParams()
      formData.append('username', email)
      formData.append('password', password)

      const response = await api.post('/login', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      localStorage.setItem('access_token', response.data.access_token)
      onLogin()
      navigate('/')
    } catch (err) {
  setError(getApiErrorMessage(err))
} finally {
  setLoading(false)
}
  }

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="brand auth-brand">
          <div className="brand-icon">L</div>
          <span className="brand-name">LabManager</span>
        </div>

        <h1>{isRegister ? 'Hesap Oluştur' : 'Hoş Geldiniz'}</h1>

        <p className="page-subtitle">
          {isRegister
            ? 'Yeni bir hesap oluşturun.'
            : 'Devam etmek için hesabınıza giriş yapın.'}
        </p>

        <label htmlFor="email">E-posta</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ornek@email.com"
          required
        />

        <label htmlFor="password">Şifre</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Şifrenizi girin"
          minLength={8}
          required
        />

        {error && <div className="auth-error">{error}</div>}

        <button className="auth-submit" type="submit" disabled={loading}>
          {loading
            ? 'İşleniyor...'
            : isRegister
              ? 'Kayıt Ol'
              : 'Giriş Yap'}
        </button>

        <p className="auth-switch">
          {isRegister ? 'Zaten hesabınız var mı?' : 'Henüz hesabınız yok mu?'}
          {' '}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister)
              setError('')
            }}
          >
            {isRegister ? 'Giriş Yap' : 'Kayıt Ol'}
          </button>
        </p>
      </form>
    </div>
  )
}

export default Auth
