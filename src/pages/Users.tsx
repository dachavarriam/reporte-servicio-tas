import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { Button, Field, Input, Select } from '../components/ui';
import { jsonHeaders, authHeaders } from '../data/api';
import type { RolUsuario, Usuario } from '../domain/types';
import { useApp } from '../store/app';

const roles: RolUsuario[] = ['admin', 'supervisor', 'tecnico'];

export function UsersPage() {
  const current = useApp(s => s.user); const notify = useApp(s => s.notify);
  const [items, setItems] = useState<Usuario[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try { const res = await fetch('/api/usuarios', { headers: authHeaders() }); if (!res.ok) throw new Error('No se pudieron cargar usuarios'); const data = await res.json() as { items: Usuario[] }; setItems(data.items); }
    catch (err) { setError(err instanceof Error ? err.message : 'Error cargando usuarios'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const fd = new FormData(form);
    const payload = {
      usuario: String(fd.get('usuario')).trim(),
      nombre: String(fd.get('nombre')).trim(),
      correo: String(fd.get('correo')).trim(),
      telefono: String(fd.get('telefono')).trim(),
      rol: String(fd.get('rol')) as RolUsuario,
      password: String(fd.get('password'))
    };
    const res = await fetch('/api/usuarios', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(payload) });
    if (!res.ok) { notify('No se pudo crear el usuario'); return; }
    form.reset(); notify('Usuario creado'); await load();
  }

  async function toggleUser(user: Usuario) {
    const res = await fetch(`/api/usuarios/${user.id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ ...user, activo: !user.activo }) });
    if (!res.ok) { notify('No se pudo actualizar el usuario'); return; }
    notify(user.activo ? 'Usuario desactivado' : 'Usuario activado'); await load();
  }

  if (current?.rol !== 'admin') return <div className="page"><div className="alert warning"><ShieldCheck /> Solo un administrador puede gestionar usuarios.</div></div>;

  return <div className="page">
    <div className="page-heading"><h1>Usuarios</h1><p>Alta inicial de técnicos, supervisores y administradores.</p></div>
    <section className="detail-section">
      <div className="section-title"><h2>Crear usuario</h2><UserPlus /></div>
      <form className="form-grid" onSubmit={createUser}>
        <Field label="Usuario" required><Input name="usuario" placeholder="jmedina" required /></Field>
        <Field label="Nombre" required><Input name="nombre" placeholder="José Medina" required /></Field>
        <Field label="Correo" required><Input name="correo" type="email" placeholder="jmedina@tashonduras.com" required /></Field>
        <Field label="Teléfono"><Input name="telefono" placeholder="+504 ..." /></Field>
        <Field label="Rol" required><Select name="rol" required>{roles.map(role => <option key={role} value={role}>{role}</option>)}</Select></Field>
        <Field label="Contraseña temporal" required><Input name="password" type="password" minLength={8} placeholder="Mínimo 8 caracteres" required /></Field>
        <div className="span-2"><Button type="submit">Crear usuario</Button></div>
      </form>
    </section>
    <section className="detail-section">
      <div className="section-title"><h2>Usuarios activos</h2><span>{items.length}</span></div>
      {error && <div className="alert error">{error}</div>}
      {loading ? <div className="loading">Cargando usuarios...</div> : items.map(user => <div className="line-item" key={user.id}>
        <strong>{user.nombre}</strong>
        <span>{user.usuario} · {user.correo} · {user.rol} · {user.activo ? 'Activo' : 'Inactivo'}</span>
        <Button type="button" variant="outline" onClick={() => void toggleUser(user)}>{user.activo ? 'Desactivar' : 'Activar'}</Button>
      </div>)}
    </section>
  </div>;
}
