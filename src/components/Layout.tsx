import { BarChart3, Bell, Building2, Clock3, FileText, Home, LogOut, Menu, Plus, UserRound, Users, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApp } from '../store/app';

const nav = [
  { to: '/', label: 'Reportes', icon: Home }, { to: '/clientes', label: 'Clientes', icon: Building2 }, { to: '/pendientes', label: 'Pendientes', icon: Clock3 },
  { to: '/metricas', label: 'Métricas', icon: BarChart3 }, { to: '/usuarios', label: 'Usuarios', icon: Users, adminOnly: true }, { to: '/perfil', label: 'Perfil', icon: UserRound }
];

export function Layout() {
  const [menu, setMenu] = useState(false); const user = useApp(s => s.user); const logout = useApp(s => s.logout); const toast = useApp(s => s.toast); const navTo = useNavigate();
  return <div className="shell">
    <aside className={`sidebar ${menu ? 'open' : ''}`}>
      <button className="close-menu" onClick={() => setMenu(false)} aria-label="Cerrar menú"><X /></button>
      <img src="/tas-mark.png" className="brand" alt="TAS Honduras" />
      <button className="btn btn-primary create-sidebar" onClick={() => { navTo(`/nuevo?draft=${Date.now()}`); setMenu(false); }}><Plus size={18} /> Crear nuevo reporte</button>
      <nav>{nav.filter(item => !item.adminOnly || user?.rol === 'admin').map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenu(false)}><Icon size={20} />{label}</NavLink>)}</nav>
      <div className="sidebar-user"><div className="avatar">{user?.nombre.split(' ').map(x => x[0]).slice(0, 2).join('')}</div><div><strong>{user?.nombre}</strong><small>{user?.rol}</small></div><button onClick={logout} aria-label="Cerrar sesión"><LogOut size={17} /></button></div>
    </aside>
    <div className="app-area">
      <header className="topbar"><button className="menu-button" onClick={() => setMenu(true)}><Menu /></button><img src="/tas-mark.png" alt="TAS" /><span className="top-title"><FileText size={20} /> Reportes de servicio</span><Bell size={20} /><div className="avatar small">CH</div></header>
      <main><Outlet /></main>
      <nav className="bottom-nav"><NavLink to="/" end><Home /><span>Reportes</span></NavLink><NavLink to="/clientes"><Building2 /><span>Clientes</span></NavLink><button onClick={() => navTo(`/nuevo?draft=${Date.now()}`)}><Plus /></button><NavLink to="/perfil"><UserRound /><span>Perfil</span></NavLink></nav>
    </div>
    {menu && <button className="scrim" onClick={() => setMenu(false)} aria-label="Cerrar menú" />}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
