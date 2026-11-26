const laboratories = [
  { id: 1, name: 'Yazılım Laboratuvarı', location: 'A Blok / 101', equipment: 24, status: 'Aktif' },
  { id: 2, name: 'Elektronik Laboratuvarı', location: 'B Blok / 205', equipment: 18, status: 'Aktif' },
  { id: 3, name: 'Robotik Laboratuvarı', location: 'C Blok / 110', equipment: 12, status: 'Bakımda' },
  { id: 4, name: 'Bilgisayar Laboratuvarı', location: 'A Blok / 204', equipment: 32, status: 'Aktif' },
]

const activities = [
  { title: 'Yeni ekipman eklendi: Arduino Uno', time: 'Bugün, 14:32' },
  { title: 'Yazılım Laboratuvarı oluşturuldu', time: 'Bugün, 11:15' },
  { title: 'Osiloskop bakım durumuna alındı', time: 'Dün, 16:40' },
  { title: 'Yeni ekipman kaydı güncellendi', time: 'Dün, 10:20' },
]

const stats = [
  { label: 'Toplam Laboratuvar', value: '12', icon: '⌂', description: 'Kayıtlı laboratuvar sayısı' },
  { label: 'Toplam Ekipman', value: '86', icon: '▣', description: 'Kayıtlı ekipman sayısı' },
  { label: 'Aktif Ekipman', value: '78', icon: '✓', description: 'Kullanıma hazır ekipman' },
  { label: 'Bakımda', value: '8', icon: '⚙', description: 'Bakım bekleyen ekipman' },
]

function Dashboard() {
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
          <div className="avatar">A</div>
          <div>
            <div className="profile-name">Admin</div>
            <div className="profile-role">Yönetici</div>
          </div>
        </div>
      </header>

      <section>
        <h2 className="section-heading">Genel Bakış</h2>

        <div className="stats-grid">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <div className="stat-top">
                <span className="stat-label">{stat.label}</span>
                <span className="stat-icon">{stat.icon}</span>
              </div>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-description">{stat.description}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Laboratuvarlar</h2>
            <a href="/laboratories" className="panel-link">Tümünü Gör →</a>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>LABORATUVAR</th>
                  <th>KONUM</th>
                  <th>EKİPMAN</th>
                  <th>DURUM</th>
                </tr>
              </thead>
              <tbody>
                {laboratories.map((lab) => (
                  <tr key={lab.id}>
                    <td>{lab.name}</td>
                    <td>{lab.location}</td>
                    <td>{lab.equipment}</td>
                    <td>
                      <span className={`status ${
                        lab.status === 'Aktif'
                          ? 'status-active'
                          : 'status-maintenance'
                      }`}>
                        {lab.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Son Aktiviteler</h2>
          </div>

          {activities.map((activity, index) => (
            <div className="activity-item" key={index}>
              <div className="activity-dot"></div>
              <div>
                <div className="activity-title">{activity.title}</div>
                <div className="activity-time">{activity.time}</div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  )
}

export default Dashboard
