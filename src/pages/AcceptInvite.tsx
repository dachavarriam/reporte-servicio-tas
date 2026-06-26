import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import { Button, Field, Input } from '../components/ui';

type InviteInfo = { usuario: string; nombre: string; correo: string; rol: string; expiraEn: string };

export function AcceptInvite() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch(`/api/invitaciones/${encodeURIComponent(token)}`)
      .then(async res => {
        if (!res.ok) throw new Error('invalid');
        const data = await res.json() as InviteInfo;
        setInfo(data);
      })
      .catch(() => setError('La invitación no existe, ya fue usada o expiró.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') ?? '');
    const confirmPassword = String(fd.get('confirmPassword') ?? '');
    if (password.length < 10) return setError('La contraseña debe tener al menos 10 caracteres.');
    if (password !== confirmPassword) return setError('La confirmación no coincide.');
    const res = await fetch(`/api/invitaciones/${encodeURIComponent(token)}/aceptar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    if (!res.ok) return setError('No se pudo activar la cuenta. Solicite una nueva invitación.');
    setDone(true);
    window.setTimeout(() => nav('/'), 1400);
  }

  if (loading) return <div className="login-page"><div className="login-card"><p>Cargando invitación...</p></div></div>;
  if (done) return <div className="login-page"><div className="login-card"><img src="/tas-logo.png" alt="TAS Honduras" /><h1>Cuenta activada</h1><p>Ya puede ingresar con su usuario y contraseña nueva.</p><Button type="button" onClick={() => nav('/')}>Ir al login</Button></div></div>;

  return <div className="login-page"><form className="login-card" onSubmit={submit}>
    <img src="/tas-logo.png" alt="TAS Honduras" />
    <h1>Activar cuenta</h1>
    {info ? <p>Cuenta para {info.nombre} ({info.usuario}). Defina su contraseña para ingresar a Reportes de Servicio TAS.</p> : <p>Invitación no disponible.</p>}
    {error && <div className="alert error">{error}</div>}
    {info && <>
      <Field label="Nueva contraseña"><div className="input-icon"><LockKeyhole /><Input name="password" type="password" autoComplete="new-password" required /></div></Field>
      <Field label="Confirmar contraseña"><div className="input-icon"><LockKeyhole /><Input name="confirmPassword" type="password" autoComplete="new-password" required /></div></Field>
      <Button type="submit">Activar cuenta</Button>
    </>}
    <Link to="/">Volver al login</Link>
  </form></div>;
}
