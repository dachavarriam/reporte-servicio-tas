import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../components/ui';
import { useApp } from '../store/app';

export function Pending() { const { items, load } = useApp(); const nav = useNavigate(); useEffect(() => { void load(); }, [load]); const groups = [{ title: 'Pendientes de firma', states: ['Pendiente de firma', 'Finalizado sin firma'] }, { title: 'En revisión / rechazados', states: ['En revisión', 'Rechazado'] }, { title: 'Borradores', states: ['Borrador'] }]; return <div className="page"><div className="page-heading"><h1>Pendientes</h1><p>Reportes que requieren atención o seguimiento.</p></div>{groups.map(g => <section className="pending-group" key={g.title}><h2>{g.title}</h2>{items.filter(x => g.states.includes(x.estado)).map(r => <button key={r.id} onClick={() => nav(`/rs/${r.id}`)}><div><strong>{r.id}</strong><span>{r.cliente}</span><small>{r.tipoVisita} · {r.fecha}</small></div><StatusBadge estado={r.estado} /></button>)}</section>)}</div> }
