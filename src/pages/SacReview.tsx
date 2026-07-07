import { CheckCircle2, Clock3, Download, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Field, Input, Select, StatusBadge, Textarea } from '../components/ui';
import { authHeaders, jsonHeaders } from '../data/api';
import type { ReporteServicio, RevisionSac } from '../domain/types';
import { useApp } from '../store/app';

type SacItem = { reporte: ReporteServicio; revision: RevisionSac };
type EmployeeHours = { empleado: string; rol: string; reportes: number; horasTotales: number; horasNormales: number; horasExtra: number; horasRetrabajo: number; horasFueraHorario: number; ultimaFecha: string };
type EmployeeHourRow = { reporteId: string; empleado: string; rol: string; fecha: string; cliente: string; ciudad: string; supervisor: string; horaEntrada: string; horaSalida: string; horasTotales: number; horasFueraHorario: number; horasNormales: number; horasExtra: number; horasRetrabajo: number; actualizadoEn: string };
type SacFilters = { empleado: string; cliente: string; supervisor: string; ciudad: string; desde: string; hasta: string; tipo: 'todos' | 'extra' | 'retrabajo' };

export function SacReviewPage() {
  const current = useApp(s => s.user); const notify = useApp(s => s.notify);
  const [items, setItems] = useState<SacItem[]>([]); const [estado, setEstado] = useState<'todos' | 'pendiente' | 'revisado'>('pendiente'); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState<EmployeeHours[]>([]);
  const [hourRows, setHourRows] = useState<EmployeeHourRow[]>([]);
  const [filters, setFilters] = useState<SacFilters>({ empleado: '', cliente: '', supervisor: '', ciudad: '', desde: '', hasta: '', tipo: 'todos' });
  const canReview = current?.rol === 'admin' || current?.rol === 'sac';

  async function load() {
    if (!canReview) return;
    setLoading(true);
    const qs = estado === 'todos' ? '' : `?estado=${estado}`;
    const res = await fetch(`/api/sac/revisiones${qs}`, { headers: authHeaders() });
    if (res.ok) { const data = await res.json() as { items: SacItem[] }; setItems(data.items); }
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value && value !== 'todos') params.set(key, value); });
    const hoursRes = await fetch(`/api/sac/horas?${params}`, { headers: authHeaders() });
    if (hoursRes.ok) { const data = await hoursRes.json() as { items: EmployeeHours[]; rows: EmployeeHourRow[] }; setHours(data.items); setHourRows(data.rows ?? []); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [estado, canReview, filters]);
  const shown = useMemo(() => items.filter(x => {
    const haystack = `${x.reporte.id} ${x.reporte.cliente} ${x.reporte.supervisor}`.toLowerCase();
    if (!haystack.includes(query.toLowerCase())) return false;
    if (filters.cliente && !x.reporte.cliente.toLowerCase().includes(filters.cliente.toLowerCase())) return false;
    if (filters.supervisor && !x.reporte.supervisor.toLowerCase().includes(filters.supervisor.toLowerCase())) return false;
    if (filters.ciudad && !(x.reporte.ciudad || '').toLowerCase().includes(filters.ciudad.toLowerCase())) return false;
    if (filters.desde && x.reporte.fecha < filters.desde) return false;
    if (filters.hasta && x.reporte.fecha > filters.hasta) return false;
    if (filters.tipo === 'extra' && x.revision.horasExtra <= 0) return false;
    if (filters.tipo === 'retrabajo' && x.revision.horasRetrabajo <= 0) return false;
    return true;
  }), [items, query, filters]);

  async function save(item: SacItem, form: HTMLFormElement) {
    const fd = new FormData(form);
    const payload = {
      empleados: (item.revision.empleados ?? []).map((person, index) => ({
        nombre: person.nombre,
        horasExtra: Number(fd.get(`extra-${index}`) ?? 0),
        horasRetrabajo: Number(fd.get(`retrabajo-${index}`) ?? 0)
      })),
      comentario: String(fd.get('comentario') ?? '').trim()
    };
    const res = await fetch(`/api/sac/revisiones/${encodeURIComponent(item.reporte.id)}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(payload) });
    if (!res.ok) { notify('No se pudo guardar revisión SAC'); return; }
    notify('Revisión SAC guardada');
    await load();
  }

  if (!canReview) return <div className="page"><div className="alert warning">Solo SAC o admin puede revisar retrabajos y horas.</div></div>;

  return <div className="page">
    <div className="page-heading"><h1>Revisión SAC</h1><p>Validación interna de horas extra y retrabajo por empleado. Esta información no aparece en el PDF del cliente.</p></div>
    <section className="detail-section sac-filters">
      <div className="section-title"><h2>Filtros de horas</h2><Button type="button" variant="outline" onClick={() => exportSacCsv(hourRows)}><Download /> Exportar CSV</Button></div>
      <div className="form-grid">
        <Field label="Empleado"><Input value={filters.empleado} onChange={e => setFilters({ ...filters, empleado: e.target.value })} placeholder="Nombre del empleado" /></Field>
        <Field label="Cliente"><Input value={filters.cliente} onChange={e => setFilters({ ...filters, cliente: e.target.value })} placeholder="Cliente" /></Field>
        <Field label="Supervisor"><Input value={filters.supervisor} onChange={e => setFilters({ ...filters, supervisor: e.target.value })} placeholder="Supervisor" /></Field>
        <Field label="Ciudad"><Input value={filters.ciudad} onChange={e => setFilters({ ...filters, ciudad: e.target.value })} placeholder="SPS / TGU" /></Field>
        <Field label="Desde"><Input type="date" value={filters.desde} onChange={e => setFilters({ ...filters, desde: e.target.value })} /></Field>
        <Field label="Hasta"><Input type="date" value={filters.hasta} onChange={e => setFilters({ ...filters, hasta: e.target.value })} /></Field>
        <Field label="Tipo"><Select value={filters.tipo} onChange={e => setFilters({ ...filters, tipo: e.target.value as SacFilters['tipo'] })}><option value="todos">Todos</option><option value="extra">Solo HE</option><option value="retrabajo">Solo retrabajo</option></Select></Field>
        <div className="field"><span>&nbsp;</span><Button type="button" variant="ghost" onClick={() => setFilters({ empleado: '', cliente: '', supervisor: '', ciudad: '', desde: '', hasta: '', tipo: 'todos' })}>Limpiar filtros</Button></div>
      </div>
    </section>
    <section className="detail-section">
      <div className="section-title"><h2>Resumen por empleado</h2><span>{hours.length} empleados</span></div>
      {hours.length === 0 ? <p>Sin horas revisadas todavía. Al guardar revisiones SAC se llenará este resumen.</p> : <div className="sac-table">
        <div className="sac-table-head"><span>Empleado</span><span>RS</span><span>Normal</span><span>HE</span><span>Retrabajo</span><span>Total</span></div>
        {hours.map(row => <div className="sac-table-row" key={`${row.empleado}-${row.rol}`}><strong>{row.empleado}<small>{row.rol}</small></strong><span>{row.reportes}</span><span>{row.horasNormales}</span><span>{row.horasExtra}</span><span>{row.horasRetrabajo}</span><span>{row.horasTotales}</span></div>)}
      </div>}
    </section>
    <div className="toolbar"><div className="search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por RS, cliente o supervisor" /></div><div className="chips"><button className={estado === 'pendiente' ? 'active' : ''} onClick={() => setEstado('pendiente')}>Pendientes</button><button className={estado === 'revisado' ? 'active' : ''} onClick={() => setEstado('revisado')}>Revisados</button><button className={estado === 'todos' ? 'active' : ''} onClick={() => setEstado('todos')}>Todos</button></div></div>
    {loading ? <div className="loading">Cargando revisión SAC...</div> : shown.length === 0 ? <Empty>No hay RS para esta vista.</Empty> : <div className="report-list">{shown.map(item => <SacCard key={item.reporte.id} item={item} onSave={save} />)}</div>}
  </div>;
}

function exportSacCsv(rows: EmployeeHourRow[]) {
  const headers = ['Fecha', 'RS', 'Empleado', 'Rol', 'Cliente', 'Ciudad', 'Supervisor', 'Entrada', 'Salida', 'Horas normales', 'HE aprobadas', 'Horas retrabajo', 'Total trabajado', 'Ref fuera horario', 'Actualizado'];
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = [headers.map(escape).join(','), ...rows.map(row => [row.fecha, row.reporteId, row.empleado, row.rol, row.cliente, row.ciudad, row.supervisor, row.horaEntrada, row.horaSalida, row.horasNormales, row.horasExtra, row.horasRetrabajo, row.horasTotales, row.horasFueraHorario, row.actualizadoEn].map(escape).join(','))];
  const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `horas-sac-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function SacCard({ item, onSave }: { item: SacItem; onSave: (item: SacItem, form: HTMLFormElement) => Promise<void> }) {
  const { reporte: rs, revision } = item;
  return <article className="report-card sac-card">
    <div className="report-head"><strong>{rs.id}</strong><StatusBadge estado={rs.estado} /></div>
    <h3>{rs.cliente}</h3>
    <div className="meta"><span>{rs.fecha} · {rs.ciudad}</span><span>Supervisor: {rs.supervisor}</span></div>
    <div className="sac-hours">
      <div><strong>{revision.horasTotales}</strong><span>Horas total</span></div>
      <div><strong>{revision.horasFueraHorario}</strong><span>Referencia fuera horario</span></div>
      <div><strong>{revision.horasRetrabajo}</strong><span>Retrabajo</span></div>
      <div><strong>{revision.horasExtra}</strong><span>Extra aprobada</span></div>
      <div><strong>{revision.horasNormales}</strong><span>Normal</span></div>
    </div>
    {revision.estado === 'revisado' && <div className="signed"><CheckCircle2 /> Revisado por {revision.revisadoPor} {revision.revisadoEn ? `· ${new Date(revision.revisadoEn).toLocaleString('es-HN')}` : ''}</div>}
    <form className="form-grid sac-form" onSubmit={e => { e.preventDefault(); void onSave(item, e.currentTarget); }}>
      <div className="span-2 sac-employee-review">
        <div className="sac-employee-head"><span>Empleado</span><span>Total</span><span>Ref. fuera horario</span><span>HE aprobadas</span><span>Retrabajo</span></div>
        {(revision.empleados ?? []).map((person, index) => <div className="sac-employee-row" key={`${person.nombre}-${index}`}>
          <strong>{person.nombre}<small>{person.rol} · {person.horaEntrada} - {person.horaSalida}</small></strong>
          <span>{person.horasTotales}</span>
          <span>{person.horasFueraHorario}</span>
          <Input name={`extra-${index}`} type="number" min="0" step="0.01" defaultValue={person.horasExtra} />
          <Input name={`retrabajo-${index}`} type="number" min="0" step="0.01" defaultValue={person.horasRetrabajo} />
        </div>)}
      </div>
      <Field label="Comentario interno SAC"><Textarea name="comentario" defaultValue={revision.comentario} placeholder="Motivo de HE, retrabajo parcial o notas para planilla." /></Field>
      <div className="span-2"><Button type="submit"><Clock3 /> Guardar revisión SAC</Button></div>
    </form>
  </article>;
}
