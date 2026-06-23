import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import { Button, Field, Input } from '../components/ui';
import { useApp } from '../store/app';

export function Login() {
  const login = useApp(s => s.login); const [error, setError] = useState(''); const [show, setShow] = useState(false);
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (!login(String(fd.get('usuario')), String(fd.get('password')))) setError('Usuario o contraseña incorrectos.'); };
  return <div className="login-page"><form className="login-card" onSubmit={submit}><img src="/tas-logo.png" alt="TAS Honduras" /><h1>Reportes de servicio</h1><p>Ingresa con tu cuenta asignada por el administrador.</p>{error && <div className="alert error">{error}</div>}<Field label="Usuario"><div className="input-icon"><UserRound /><Input name="usuario" defaultValue="carlos" autoComplete="username" required /></div></Field><Field label="Contraseña"><div className="input-icon"><LockKeyhole /><Input name="password" defaultValue="TAS2026!" type={show ? 'text' : 'password'} autoComplete="current-password" required /><button type="button" onClick={() => setShow(x => !x)}>{show ? <EyeOff /> : <Eye />}</button></div></Field><Button type="submit">Ingresar</Button><small>Acceso demo: carlos / TAS2026!</small></form></div>;
}
