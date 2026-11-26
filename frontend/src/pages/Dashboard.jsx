import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'

function Dashboard() {
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function fetchDashboard() {
      try {
        const response = await api.get('/dashboard')

        if (active) {
          setDashboard(response.data)
        }
      } catch {
        if (active) {
          setError('Dashboard verileri yüklenemedi.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    fetchDashboard()

    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <p>Dashboard yükleniyor...</p>
  }

  if (error) {
    return <div className="auth-error">{error}</div>
  }

  if (!dashboard) {
    return <p>Dashboard verisi bulunamadı.</p>
  }

  const { stats, laboratories, recent_maintenance, user_email } = dashboard

  const cards = [
    {
      label: 'Toplam Laboratuvar',
      value: stats.total_laboratories,
      icon: '⌂',
      description: 'Kayıtlı laboratuvar sayısı'
    },
    {
      label: 'Toplam Ekipman',
      value: stats.total_equipment,
      icon: '▣',
      description: 'Kayıtlı ekipman sayısı'
    },
    {
      label: 'Aktif Ekipman',
      value: stats.available_equipment,
      icon: '✓',
      description: 'Kullanıma hazır ekipman'
    },
    {
      label: 'Bakımda',
      value: stats.maintenance_equipment,
      icon: '⚙',
      description: 'Bakım durumundaki ekipman'
    },
    {
      label: 'Arızalı Ekipman',
      value: stats.broken_equipment,
      icon: '!',
      description: 'Arızalı ekipman sayısı'
    },
    {
      label: 'Bakım Kayıtları',
      value: stats.total_maintenance_records,
      icon: '▤',
      description: 'Toplam bakım kaydı'
    },
    {
      label: 'Toplam Bakım Maliyeti',
      value: Number(stats.total_maintenance_cost).toLocaleString(
        'tr-TR',
        {
          style: 'currency',
          currency: 'TRY'
        }
      ),
      icon: '₺',
      description: 'Kayıtlı bakım maliyetleri'
    }
  ]

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Laboratuvar yönetim sistemine hoş geldiniz.
          </p>
        </div>

        <div className="profile">
          <div className="avatar">
            {user_email.charAt(0).toUpperCase()}
          </div>

          <div>
            <div className="profile-name">{user_email}</div>
            <div className="profile-role">Kullanıcı</div>
          </div>
        </div>
      </header>

      <section>
        <h2 className="section-heading">Genel Bakış</h2>

        <div className="stats-grid">
          {cards.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <div className="stat-top">
                <span className="stat-label">{stat.label}</span>
                <span className="stat-icon">{stat.icon}</span>
              </div>

              <div className="stat-value">{stat.value}</div>

              <div className="stat-description">
                {stat.description}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Laboratuvarlar</h2>

            <Link to="/laboratories" className="panel-link">
              Tümünü Gör →
            </Link>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>LABORATUVAR</th>
                  <th>KONUM</th>
                  <th>EKİPMAN</th>
                </tr>
              </thead>

              <tbody>
                {laboratories.length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      Henüz kayıtlı laboratuvar bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  laboratories.map((lab) => (
                    <tr key={lab.id}>
                      <td>{lab.name}</td>
                      <td>{lab.location || '—'}</td>
                      <td>{lab.equipment_count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Son Bakım İşlemleri</h2>

            <Link to="/maintenance" className="panel-link">
              Tümünü Gör →
            </Link>
          </div>

          {recent_maintenance.length === 0 ? (
            <p>Henüz bakım kaydı bulunmuyor.</p>
          ) : (
            recent_maintenance.map((record) => (
              <div className="activity-item" key={record.id}>
                <div className="activity-dot"></div>

                <div>
                  <div className="activity-title">
                    {record.equipment_name}
                  </div>

                  <div className="activity-time">
                    {record.description}
                  </div>

                  <div className="activity-time">
                    {record.maintenance_date
                      .split('-')
                      .reverse()
                      .join('.')}
                  </div>

                  {record.cost !== null && (
                    <div className="activity-time">
                      {Number(record.cost).toLocaleString('tr-TR', {
                        style: 'currency',
                        currency: 'TRY'
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  )
}

export default Dashboard
