import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ChangePassword } from './pages/ChangePassword';
import { AcceptInvite } from './pages/AcceptInvite';
import { ClientsPage } from './pages/Clients';
import { Detail } from './pages/Detail';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { MetricsPage } from './pages/Metrics';
import { Pending } from './pages/Pending';
import { Profile } from './pages/Profile';
import { ReportForm } from './pages/ReportForm';
import { SacFollowupsPage } from './pages/SacFollowups';
import { SacReviewPage } from './pages/SacReview';
import { UsersPage } from './pages/Users';
import { useApp } from './store/app';

export function App() { const user = useApp(s => s.user); const path = window.location.pathname; if (!user && path.startsWith('/invitar/')) return <Routes><Route path="invitar/:token" element={<AcceptInvite />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>; if (!user) return <Login />; if (user.mustChangePassword) return <ChangePassword />; const canSeeInternal = user.rol === 'admin' || user.rol === 'sac'; return <Routes><Route element={<Layout />}><Route index element={<Home />} /><Route path="clientes" element={<ClientsPage />} /><Route path="pendientes" element={<Pending />} /><Route path="sac" element={canSeeInternal ? <SacReviewPage /> : <Navigate to="/" replace />} /><Route path="seguimientos" element={canSeeInternal ? <SacFollowupsPage /> : <Navigate to="/" replace />} /><Route path="metricas" element={canSeeInternal ? <MetricsPage /> : <Navigate to="/" replace />} /><Route path="usuarios" element={<UsersPage />} /><Route path="perfil" element={<Profile />} /><Route path="nuevo" element={user.rol === 'sac' ? <Navigate to="/sac" replace /> : <ReportForm />} /><Route path="editar/:id" element={user.rol === 'sac' ? <Navigate to="/sac" replace /> : <ReportForm />} /><Route path="rs/:id" element={<Detail />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes>; }
