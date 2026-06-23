import { ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '../components/ui';
import { DEMO_USER } from '../data/seed';
export function UsersPage(){ return <div className="page"><div className="page-heading"><h1>Usuarios</h1><p>Administración inicial para el piloto. La persistencia remota queda en D1.</p></div><section className="detail-section"><div className="section-title"><h2>Usuarios activos</h2><Button><UserPlus/> Crear usuario</Button></div><div className="line-item"><strong>{DEMO_USER.nombre}</strong><span>{DEMO_USER.correo} · {DEMO_USER.rol}</span></div><div className="alert warning"><ShieldCheck/> En producción, las contraseñas se guardan con hash y restablecimiento administrado. Esta pantalla ya reserva el flujo y permisos.</div></section></div> }
