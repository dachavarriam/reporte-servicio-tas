import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ChangePassword } from './pages/ChangePassword';
import { ClientsPage } from './pages/Clients';
import { Detail } from './pages/Detail';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { MetricsPage } from './pages/Metrics';
import { Pending } from './pages/Pending';
import { Profile } from './pages/Profile';
import { ReportForm } from './pages/ReportForm';
import { UsersPage } from './pages/Users';
import { useApp } from './store/app';

export function App() { const user = useApp(s => s.user); if (!user) return <Login />; if (user.mustChangePassword) return <ChangePassword />; return <Routes><Route element={<Layout />}><Route index element={<Home />} /><Route path="clientes" element={<ClientsPage />} /><Route path="pendientes" element={<Pending />} /><Route path="metricas" element={<MetricsPage />} /><Route path="usuarios" element={<UsersPage />} /><Route path="perfil" element={<Profile />} /><Route path="nuevo" element={<ReportForm />} /><Route path="editar/:id" element={<ReportForm />} /><Route path="rs/:id" element={<Detail />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes>; }
