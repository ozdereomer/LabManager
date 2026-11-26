import { NavLink } from 'react-router-dom'

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">L</div>
        <span className="brand-name">LabManager</span>
      </div>

      <div className="menu-label">ANA MENÜ</div>

      <nav className="nav-menu">
        <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">▦</span>
          <span className="nav-text">Dashboard</span>
        </NavLink>

        <NavLink to="/laboratories" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">⌂</span>
          <span className="nav-text">Laboratuvarlar</span>
        </NavLink>

        <NavLink to="/equipment" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">▣</span>
          <span className="nav-text">Ekipmanlar</span>
        </NavLink>

        <NavLink to="/maintenance" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">⚙</span>
          <span className="nav-text">Bakım Takibi</span>
        </NavLink>
      </nav>

      <div className="sidebar-bottom">
        <div className="nav-menu">
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">⚙</span>
            <span className="nav-text">Ayarlar</span>
          </NavLink>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
