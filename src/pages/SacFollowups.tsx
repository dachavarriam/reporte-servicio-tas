import { AlertTriangle, Archive, CalendarDays, CheckCircle2, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Select } from '../components/ui';
import { authHeaders, jsonHeaders } from '../data/api';
import { CIUDADES_RS } from '../domain/types';

type FollowupItem = { id: string; reporteId: string; tipo: string; prioridad: string; titulo: string; detalle: string; fecha: string; fechaCompromiso: string; cliente: string; ciudad: string; supervisor: string; estado: string; estadoSeguimiento: 'activo' | 'hecho' | 'archivado'; actualizadoPor?: string; actualizadoEn?: string };
type FollowupResponse = { items: FollowupItem[]; opciones: { clientes: string[] }; total: number };

const tipoLabels: Record<string, string> = {
  todos: 'Todos',
  acciones: 'Acciones pendientes',
  recomendaciones: 'Recomendaciones',
  proxima_visita: 'Próxima visita',
  retrabajo: 'Retrabajo'
};

export function SacFollowupsPage() {
  const nav = useNavigate();
  const [filters, setFilters] = useState({ tipo: 'todos', estado: 'activo', ciudad: '', cliente: '', desde: '', hasta: '' });
  const [items, setItems] = useState<FollowupItem[]>([]);
  const [clientes, setClientes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value && value !== 'todos') params.set(key, value); });
    const res = await fetch(`/api/sac/seguimientos?${params}`, { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json() as FollowupResponse;
      setItems(data.items ?? []);
      setClientes(data.opciones?.clientes ?? []);
    }
    setLoading(false);
  }

  async function updateItem(item: FollowupItem, estado: 'activo' | 'hecho' | 'archivado') {
    const res = await fetch(`/api/sac/seguimientos/${encodeURIComponent(item.id)}`, {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify({ estado, reporteId: item.reporteId, tipo: item.tipo })
    });
    if (res.ok) await load();
  }

  useEffect(() => { void load(); }, []);
  const shown = items.filter(item => `${item.reporteId} ${item.cliente} ${item.detalle} ${item.supervisor}`.toLowerCase().includes(query.toLowerCase()));
  const counts = items.reduce((acc, item) => ({ ...acc, [item.tipo]: (acc[item.tipo] ?? 0) + 1 }), {} as Record<string, number>);

  return <div className="page">
    <div className="page-heading"><h1>Seguimientos SAC</h1><p>Bandeja interna para recomendaciones, acciones pendientes, próximas visitas y retrabajos detectados desde los RS.</p></div>
    <div className="metrics-grid">
      <Metric label={filters.estado === 'activo' ? 'Activos visibles' : 'Registros visibles'} value={shown.length} />
      <Metric label="Acciones" value={counts.acciones ?? 0} />
      <Metric label="Próximas visitas" value={counts.proxima_visita ?? 0} />
      <Metric label="Retrabajos" value={counts.retrabajo ?? 0} />
    </div>
    <section className="detail-section">
      <div className="section-title"><h2>Filtros</h2><Button onClick={load}>Actualizar</Button></div>
      <div className="form-grid">
        <Field label="Tipo"><Select value={filters.tipo} onChange={e => setFilters({ ...filters, tipo: e.target.value })}>{Object.entries(tipoLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
        <Field label="Estado"><Select value={filters.estado} onChange={e => setFilters({ ...filters, estado: e.target.value })}><option value="activo">Activos</option><option value="hecho">Hechos</option><option value="archivado">Archivados</option><option value="todos">Todos</option></Select></Field>
        <Field label="Ciudad"><Select value={filters.ciudad} onChange={e => setFilters({ ...filters, ciudad: e.target.value })}><option value="">General</option>{CIUDADES_RS.map(city => <option key={city} value={city}>{city}</option>)}</Select></Field>
        <Field label="Cliente"><Select value={filters.cliente} onChange={e => setFilters({ ...filters, cliente: e.target.value })}><option value="">Todos los clientes</option>{clientes.map(cliente => <option key={cliente} value={cliente}>{cliente}</option>)}</Select></Field>
        <Field label="Desde"><Input type="date" value={filters.desde} onChange={e => setFilters({ ...filters, desde: e.target.value })} /></Field>
        <Field label="Hasta"><Input type="date" value={filters.hasta} onChange={e => setFilters({ ...filters, hasta: e.target.value })} /></Field>
        <Field label="Buscar"><div className="search compact"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="RS, cliente, supervisor..." /></div></Field>
      </div>
    </section>
    <section className="detail-section">
      <div className="section-title"><h2>Bandeja</h2><span>{shown.length} registros</span></div>
      {loading ? <div className="loading">Cargando seguimientos...</div> : shown.length === 0 ? <p>No hay seguimientos para estos filtros.</p> : <div className="followup-list">{shown.map(item => <article className={`followup-item ${item.prioridad}`} key={item.id}>
        <button className="followup-main" onClick={() => nav(`/rs/${item.reporteId}`)}><AlertTriangle /></button>
        <div><strong>{item.titulo}</strong><span>{item.reporteId} · {item.cliente} · {item.fecha}</span><p>{item.detalle}</p>{item.fechaCompromiso && <small><CalendarDays size={13} /> Compromiso: {item.fechaCompromiso}</small>}</div>
        <div className="followup-actions">
          {item.estadoSeguimiento !== 'activo' ? <Button type="button" variant="outline" onClick={() => updateItem(item, 'activo')}><RotateCcw size={15} /> Reabrir</Button> : <>
            <Button type="button" variant="outline" onClick={() => updateItem(item, 'hecho')}><CheckCircle2 size={15} /> Hecho</Button>
            <Button type="button" variant="ghost" onClick={() => updateItem(item, 'archivado')}><Archive size={15} /> Archivar</Button>
          </>}
          <button className="followup-open" onClick={() => nav(`/rs/${item.reporteId}`)} aria-label="Abrir RS"><ChevronRight /></button>
        </div>
      </article>)}</div>}
    </section>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}
