import { Building2, CalendarDays, ChevronRight, FileText, ListChecks, MapPin, Search, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty, StatusBadge } from '../components/ui';
import { authHeaders } from '../data/api';
import type { EstadoRS } from '../domain/types';

type ClientReport = { id: string; fecha: string; estado: string; tipoVisita: string; supervisor: string; ciudad: string; trabajoRealizado: string; observaciones: string; recomendaciones: string; accionesPendientes: string; proximaVisita: boolean; fechaSeguimiento: string };
type ClientEquipment = { rsId: string; fecha: string; nombre: string; marca: string; modelo: string; serie: string; ubicacion: string; trabajoRealizado: string; recomendacion: string };
type ClientRecommendation = { rsId: string; fecha: string; recomendaciones: string; accionesPendientes: string; proximaVisita: boolean; fechaSeguimiento: string; observaciones: string };
type ClientSummary = { nombre: string; contacto: string; correo: string; telefono: string; ciudad: string; ubicacion: string; total: number; ultimo: string; pendientes: number; proximaVisita: number; reportes: ClientReport[]; equipos: ClientEquipment[]; recomendaciones: ClientRecommendation[] };

export function ClientsPage() {
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState('');
  const [tab, setTab] = useState<'timeline' | 'reportes' | 'equipos' | 'pendientes'>('timeline');
  const nav = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/clientes/resumen${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`, { headers: authHeaders() })
        .then(res => res.ok ? res.json() : { items: [] })
        .then((data: { items: ClientSummary[] }) => { setClients(data.items ?? []); setOpen(current => current || data.items?.[0]?.nombre || ''); })
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const selected = useMemo(() => clients.find(c => c.nombre === open) ?? clients[0], [clients, open]);
  const timeline = useMemo(() => selected ? buildClientTimeline(selected) : [], [selected]);

  return <div className="page clients-page">
    <div className="page-heading"><h1>Clientes</h1><p>Expediente de trabajos, equipos, recomendaciones y pendientes por cliente.</p></div>
    <div className="toolbar"><div className="search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar cliente" /></div></div>
    {loading ? <div className="loading">Cargando clientes...</div> : clients.length === 0 ? <Empty>No hay clientes con reportes.</Empty> : <div className="client-workspace">
      <aside className="client-list">{clients.map(client => <button className={selected?.nombre === client.nombre ? 'active' : ''} key={client.nombre} onClick={() => setOpen(client.nombre)}><strong>{client.nombre}</strong><span>{client.total} RS · {client.pendientes} pendientes</span></button>)}</aside>
      {selected && <section className="client-file">
        <div className="client-file-header"><div><h2><Building2 /> {selected.nombre}</h2><p>{[selected.contacto, selected.correo, selected.telefono].filter(Boolean).join(' · ') || 'Sin contacto registrado'}</p></div><span>{selected.total} RS</span></div>
        <div className="client-metrics"><div><strong>{selected.ultimo}</strong><span>Última visita</span></div><div><strong>{selected.equipos.length}</strong><span>Equipos intervenidos</span></div><div><strong>{selected.pendientes}</strong><span>Recomendaciones/pendientes</span></div><div><strong>{selected.proximaVisita}</strong><span>Próximas visitas</span></div></div>
        <div className="client-tabs"><button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}><ListChecks size={16} /> Timeline</button><button className={tab === 'reportes' ? 'active' : ''} onClick={() => setTab('reportes')}><FileText size={16} /> RS</button><button className={tab === 'equipos' ? 'active' : ''} onClick={() => setTab('equipos')}><Wrench size={16} /> Equipos</button><button className={tab === 'pendientes' ? 'active' : ''} onClick={() => setTab('pendientes')}><MapPin size={16} /> Pendientes</button></div>
        {tab === 'timeline' && <section className="detail-section"><h2>Timeline del cliente</h2>{timeline.length === 0 ? <p>Sin actividad registrada.</p> : <ol className="client-timeline">{timeline.map(item => <li key={item.id}><i/><div><strong>{item.title}</strong><span>{item.date} · {item.rsId}</span><p>{item.text}</p></div></li>)}</ol>}</section>}
        {tab === 'reportes' && <section className="detail-section"><h2>Historial de RS</h2>{selected.reportes.map(rs => <button className="line-item client-history-row" key={rs.id} onClick={() => nav(`/rs/${rs.id}`)}><div><strong>{rs.id}</strong><span>{rs.fecha} · {rs.tipoVisita} · {rs.supervisor}</span>{rs.trabajoRealizado && <p>{rs.trabajoRealizado}</p>}</div><StatusBadge estado={rs.estado as EstadoRS} /><ChevronRight /></button>)}</section>}
        {tab === 'equipos' && <section className="detail-section"><h2><Wrench size={18} /> Equipos intervenidos</h2>{selected.equipos.length === 0 ? <p>No hay equipos registrados.</p> : selected.equipos.slice(0, 40).map(eq => <div className="line-item client-equipment" key={`${eq.rsId}-${eq.serie}-${eq.nombre}`}><strong>{eq.nombre || 'Equipo sin nombre'}<small>{eq.marca} {eq.modelo} · Serie: {eq.serie || '-'}</small></strong><span><CalendarDays size={14} /> {eq.fecha} · {eq.rsId}</span><p>{eq.trabajoRealizado || 'Sin detalle de trabajo.'}</p>{eq.recomendacion && <p><b>Recomendación:</b> {eq.recomendacion}</p>}</div>)}</section>}
        {tab === 'pendientes' && <section className="detail-section"><h2><FileText size={18} /> Recomendaciones y pendientes</h2>{selected.recomendaciones.length === 0 ? <p>Sin recomendaciones o pendientes registrados.</p> : selected.recomendaciones.map(item => <div className="line-item client-followup" key={`${item.rsId}-${item.fecha}`}><strong>{item.rsId}<small>{item.fecha}</small></strong>{item.recomendaciones && <p><b>Recomendación:</b> {item.recomendaciones}</p>}{item.accionesPendientes && <p><b>Acciones pendientes:</b> {item.accionesPendientes}</p>}{item.observaciones && <p><b>Observación:</b> {item.observaciones}</p>}{item.proximaVisita && <span><MapPin size={14} /> Próxima visita {item.fechaSeguimiento || 'sin fecha definida'}</span>}</div>)}</section>}
      </section>}
    </div>}
  </div>;
}

function buildClientTimeline(client: ClientSummary) {
  const events = [
    ...client.reportes.map(rs => ({ id: `${rs.id}-rs`, date: rs.fecha, rsId: rs.id, title: `${rs.tipoVisita} · ${rs.estado}`, text: rs.trabajoRealizado || rs.observaciones || 'RS registrado.' })),
    ...client.recomendaciones.flatMap(item => [
      item.accionesPendientes ? { id: `${item.rsId}-acciones`, date: item.fecha, rsId: item.rsId, title: 'Acción pendiente', text: item.accionesPendientes } : null,
      item.recomendaciones ? { id: `${item.rsId}-recomendacion`, date: item.fecha, rsId: item.rsId, title: 'Recomendación', text: item.recomendaciones } : null,
      item.proximaVisita ? { id: `${item.rsId}-proxima`, date: item.fechaSeguimiento || item.fecha, rsId: item.rsId, title: 'Próxima visita', text: item.fechaSeguimiento ? `Fecha sugerida: ${item.fechaSeguimiento}` : 'Sin fecha definida.' } : null
    ].filter(Boolean) as Array<{ id: string; date: string; rsId: string; title: string; text: string }>)
  ];
  return events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80);
}
