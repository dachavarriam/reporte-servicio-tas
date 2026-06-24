import { Building2, CalendarDays, ChevronRight, FileText, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty, StatusBadge } from '../components/ui';
import { useApp } from '../store/app';

export function ClientsPage() {
  const { items, load, loading } = useApp();
  const [query, setQuery] = useState('');
  const nav = useNavigate();
  useEffect(() => { void load(); }, [load]);
  const clients = useMemo(() => {
    const map = new Map<string, { nombre: string; total: number; ultimo: string; pendientes: number; reportes: typeof items }>();
    for (const rs of items) {
      const key = rs.cliente.trim().toLowerCase() || 'sin cliente';
      const current = map.get(key) ?? { nombre: rs.cliente || 'Sin cliente', total: 0, ultimo: rs.fecha, pendientes: 0, reportes: [] };
      current.total += 1;
      current.reportes.push(rs);
      if (rs.fecha > current.ultimo) current.ultimo = rs.fecha;
      if (rs.accionesPendientes || rs.proximaVisita) current.pendientes += 1;
      map.set(key, current);
    }
    return [...map.values()].filter(x => x.nombre.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.ultimo.localeCompare(a.ultimo));
  }, [items, query]);

  return <div className="page"><div className="page-heading"><h1>Clientes</h1><p>Historial de reportes por cliente dentro de la plataforma.</p></div><div className="toolbar"><div className="search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar cliente" /></div></div>{loading ? <div className="loading">Cargando clientes...</div> : clients.length === 0 ? <Empty>No hay clientes con reportes.</Empty> : <div className="report-list">{clients.map(client => <article className="report-card" key={client.nombre}><div className="report-head"><strong><Building2 size={16} /> {client.nombre}</strong><span>{client.total} RS</span></div><div className="meta"><span><CalendarDays />Último: {new Date(`${client.ultimo}T12:00`).toLocaleDateString('es-HN')}</span><span><FileText />Pendientes: {client.pendientes}</span></div>{client.reportes.slice(0, 5).map(rs => <button className="line-item client-history-row" key={rs.id} onClick={() => nav(`/rs/${rs.id}`)}><div><strong>{rs.id}</strong><span>{rs.fecha} · {rs.tipoVisita}</span></div><StatusBadge estado={rs.estado} /><ChevronRight /></button>)}</article>)}</div>}</div>;
}
