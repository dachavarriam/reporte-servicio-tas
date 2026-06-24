import { useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Button, Field, Input } from '../components/ui';
import { useApp } from '../store/app';

export function ChangePassword() {
  const changePassword = useApp(s => s.changePassword);
  const logout = useApp(s => s.logout);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const currentPassword = String(fd.get('currentPassword') ?? '');
    const newPassword = String(fd.get('newPassword') ?? '');
    const confirmPassword = String(fd.get('confirmPassword') ?? '');
    if (newPassword.length < 10) return setError('La nueva contraseña debe tener al menos 10 caracteres.');
    if (newPassword !== confirmPassword) return setError('La confirmación no coincide.');
    setLoading(true);
    const ok = await changePassword(currentPassword, newPassword);
    setLoading(false);
    if (!ok) setError('No se pudo cambiar la contraseña. Revise la contraseña actual.');
  };

  return <div className="login-page"><form className="login-card" onSubmit={submit}><img src="/tas-logo.png" alt="TAS Honduras" /><h1>Cambiar contraseña</h1><p>Por seguridad, debe definir una contraseña nueva antes de usar la plataforma.</p>{error && <div className="alert error">{error}</div>}<Field label="Contraseña actual"><div className="input-icon"><LockKeyhole /><Input name="currentPassword" type="password" autoComplete="current-password" required /></div></Field><Field label="Nueva contraseña"><div className="input-icon"><LockKeyhole /><Input name="newPassword" type="password" autoComplete="new-password" required /></div></Field><Field label="Confirmar nueva contraseña"><div className="input-icon"><LockKeyhole /><Input name="confirmPassword" type="password" autoComplete="new-password" required /></div></Field><Button type="submit" disabled={loading}>{loading ? 'Guardando...' : 'Cambiar contraseña'}</Button><Button type="button" variant="ghost" onClick={logout}>Cerrar sesión</Button></form></div>;
}
