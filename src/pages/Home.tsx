import { CalendarDays, ChevronRight, MapPin, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Empty, StatusBadge } from '../components/ui';
import { reports } from '../data/repository';
import type { EstadoRS } from '../domain/types';
import type { ReporteServicio } from '../domain/types';
import { useApp } from '../store/app';

const filters: (EstadoRS | 'Todos')[] = ['Todos', 'Borrador', 'En revisión', 'Finalizado sin firma', 'Pendiente de firma', 'Firmado', 'Rechazado'];
const PAGE_SIZE = 15;
export function Home() {
  const { metrics, load, user } = useApp(); const [filter, setFilter] = useState<EstadoRS | 'Todos'>('Todos'); const [query, setQuery] = useState(''); const [page, setPage] = useState(0); const [items, setItems] = useState<ReporteServicio[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const nav = useNavigate();
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(0); }, [filter, query]);
  useEffect(() => { let active = true; setLoading(true); void reports.list({ estado: filter, texto: query.trim(), limit: PAGE_SIZE, offset: page * PAGE_SIZE }).then(data => { if (!active) return; setItems(data.items); setTotal(data.total); }).catch(() => { if (!active) return; setItems([]); setTotal(0); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [filter, query, page]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstItem = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastItem = Math.min(total, (page + 1) * PAGE_SIZE);
  const shown = useMemo(() => items, [items]);
  return <div className="page"><section className="welcome"><p>Buenos días,</p><h1>{user?.nombre}</h1></section>{user?.rol !== 'sac' && <Button className="mobile-create" onClick={() => nav(`/nuevo?draft=${Date.now()}`)}><Plus /> Crear nuevo reporte</Button>}
    <div className="metrics-grid">{[
      ['Borradores', metrics?.borradores ?? 0, 'Borrador', '#5B6470'], ['En revisión', metrics?.revision ?? 0, 'En revisión', '#A66400'], ['Pendientes de firma', metrics?.pendientesFirma ?? 0, 'Pendiente de firma', '#BE4708'], ['Completados', metrics?.completados ?? 0, 'Firmado', '#117A3B']
    ].map(([label, n, state, color]) => <button className="metric" key={String(label)} onClick={() => setFilter(state as EstadoRS)}><strong style={{ color: String(color) }}>{n}</strong><span>{label}</span></button>)}</div>
    <div className="toolbar"><div className="search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por RS, cliente o ubicación" /></div><div className="chips">{filters.map(x => <button className={filter === x ? 'active' : ''} key={x} onClick={() => setFilter(x)}>{x}</button>)}</div></div>
    <div className="section-title"><h2>Reportes recientes</h2><span>{total === 0 ? '0 resultados' : `${firstItem}-${lastItem} de ${total}`}</span></div>
    {loading ? <div className="loading">Cargando reportes…</div> : shown.length === 0 ? <Empty>No hay reportes con estos filtros.</Empty> : <div className="report-list">{shown.map(r => <button className="report-card" key={r.id} onClick={() => nav(`/rs/${r.id}`)}><div className="report-head"><strong>{r.id}</strong><StatusBadge estado={r.estado} /></div><h3>{r.cliente}</h3><div className="meta"><span><MapPin />{r.ubicacion}</span><span><CalendarDays />{new Date(`${r.fecha}T12:00`).toLocaleDateString('es-HN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div><div className="report-bottom"><span>{r.tipoVisita}</span><ChevronRight /></div></button>)}</div>}
    {total > PAGE_SIZE && <div className="pager"><Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage(value => Math.max(0, value - 1))}>Anterior</Button><span>Página {page + 1} de {pageCount}</span><Button variant="outline" disabled={page + 1 >= pageCount || loading} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))}>Siguiente</Button></div>}
  </div>;
}
