import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Field, Input, Select } from '../components/ui';
import { authHeaders } from '../data/api';
import { CIUDADES_RS } from '../domain/types';

type Bucket = { label: string; value: number };
type EmployeeMetric = { empleado: string; rol: string; reportes: number; horasTotales: number; horasNormales: number; horasExtra: number; horasRetrabajo: number; horasFueraHorario: number };
type RecentMetric = { id: string; fecha: string; cliente: string; estado: string; ciudad: string; supervisor: string };
type MetricsResponse = {
  periodo: { periodo: string; desde: string; hasta: string };
  opciones?: { clientes: string[]; supervisores: string[] };
  warnings?: string[];
  operacion: {
    totalRs: number; firmados: number; borradores: number; pendientesFirma: number; enRevision: number; promedioHorasPorRs: number;
    porEstado: Bucket[]; porCiudad: Bucket[]; porSupervisor: Bucket[]; porTipoVisita: Bucket[];
  };
  sac: {
    horasTotales: number; horasNormales: number; horasExtra: number; horasRetrabajo: number; horasFueraHorario: number; empleados: number;
    topHorasExtra: EmployeeMetric[]; topRetrabajo: EmployeeMetric[]; topHorasTotales: EmployeeMetric[];
  };
  calidad: { rsConRetrabajo: number; porcentajeRetrabajo: number; retrabajosPorCliente: Bucket[]; retrabajosPorSupervisor: Bucket[] };
  clientes: { clientesAtendidos: number; clientesConPendientes: number; pendientes: number; proximasVisitas: number; topClientesPendientes: Bucket[] };
  recientes: RecentMetric[];
};

const periodos = [
  ['30d', 'Últimos 30 días'],
  ['90d', 'Últimos 90 días'],
  ['180d', 'Últimos 6 meses'],
  ['365d', 'Últimos 12 meses'],
  ['mes_actual', 'Mes actual'],
  ['custom', 'Personalizado']
] as const;

export function MetricsPage() {
  const [filters, setFilters] = useState({ periodo: '30d', desde: '', hasta: '', ciudad: '', supervisor: '', cliente: '' });
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    const res = await fetch(`/api/metricas/resumen?${params}`, { headers: authHeaders() });
    if (!res.ok) {
      const detail = await res.json().catch(() => null) as { error?: string; detail?: string } | null;
      setError(detail?.detail || detail?.error || 'No se pudieron cargar las métricas.');
      setLoading(false);
      return;
    }
    setData(await res.json() as MetricsResponse);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  return <div className="page">
    <div className="page-heading">
      <h1>Métricas</h1>
    </div>
    <section className="detail-section metric-filters">
      <div className="section-title"><h2>Filtros</h2><Button type="button" onClick={load} disabled={loading}><RefreshCw /> Actualizar</Button></div>
      <div className="form-grid">
        <Field label="Periodo"><Select value={filters.periodo} onChange={e => setFilters({ ...filters, periodo: e.target.value })}>{periodos.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
        <Field label="Desde"><Input type="date" value={filters.desde} onChange={e => setFilters({ ...filters, desde: e.target.value, periodo: e.target.value ? 'custom' : filters.periodo })} /></Field>
        <Field label="Hasta"><Input type="date" value={filters.hasta} onChange={e => setFilters({ ...filters, hasta: e.target.value, periodo: e.target.value ? 'custom' : filters.periodo })} /></Field>
        <Field label="Ciudad"><Select value={filters.ciudad} onChange={e => setFilters({ ...filters, ciudad: e.target.value })}><option value="">General</option>{CIUDADES_RS.map(ciudad => <option key={ciudad} value={ciudad}>{ciudad}</option>)}</Select></Field>
        <Field label="Supervisor"><Select value={filters.supervisor} onChange={e => setFilters({ ...filters, supervisor: e.target.value })}><option value="">Todos los supervisores</option>{(data?.opciones?.supervisores ?? []).map(supervisor => <option key={supervisor} value={supervisor}>{supervisor}</option>)}</Select></Field>
        <Field label="Cliente"><Select value={filters.cliente} onChange={e => setFilters({ ...filters, cliente: e.target.value })}><option value="">Todos los clientes</option>{(data?.opciones?.clientes ?? []).map(cliente => <option key={cliente} value={cliente}>{cliente}</option>)}</Select></Field>
      </div>
    </section>

    {error && <div className="alert error">{error}</div>}
    {loading && <div className="loading">Calculando métricas...</div>}
    {!loading && data && <>
      {data.warnings?.map(warning => <div className="alert warning" key={warning}>{warning}</div>)}
      <p className="metric-period">Periodo: <strong>{data.periodo.desde}</strong> a <strong>{data.periodo.hasta}</strong></p>
      <div className="metrics-grid">
        <Metric label="RS en periodo" value={data.operacion.totalRs} />
        <Metric label="Firmados" value={data.operacion.firmados} />
        <Metric label="Clientes atendidos" value={data.clientes.clientesAtendidos} />
        <Metric label="Prom. horas por RS" value={`${data.operacion.promedioHorasPorRs} h`} />
        <Metric label="Horas normales" value={`${data.sac.horasNormales} h`} />
        <Metric label="Horas extra" value={`${data.sac.horasExtra} h`} />
        <Metric label="Horas retrabajo" value={`${data.sac.horasRetrabajo} h`} />
        <Metric label="% RS con retrabajo" value={`${data.calidad.porcentajeRetrabajo}%`} />
      </div>
      <div className="metrics-layout">
        <section className="detail-section"><h2>Operación</h2><MetricList rows={data.operacion.porEstado} empty="Sin estados." /><h3>Por ciudad</h3><MetricList rows={data.operacion.porCiudad} empty="Sin ciudades." /><h3>Por tipo de visita</h3><MetricList rows={data.operacion.porTipoVisita} empty="Sin tipos." /></section>
        <section className="detail-section"><h2>SAC / planilla</h2><p className="metric-note">Horas basadas en revisiones SAC guardadas.</p><EmployeeTable rows={data.sac.topHorasTotales} valueKey="horasTotales" label="Horas totales" /><h3>Top HE</h3><EmployeeTable rows={data.sac.topHorasExtra} valueKey="horasExtra" label="HE" /></section>
        <section className="detail-section"><h2>Calidad</h2><Metric label="RS con retrabajo" value={data.calidad.rsConRetrabajo} /><h3>Retrabajo por cliente</h3><MetricList rows={data.calidad.retrabajosPorCliente} empty="Sin retrabajo registrado." /><h3>Retrabajo por supervisor</h3><MetricList rows={data.calidad.retrabajosPorSupervisor} empty="Sin retrabajo registrado." /></section>
        <section className="detail-section"><h2>Clientes y seguimiento</h2><Metric label="Clientes con pendientes" value={data.clientes.clientesConPendientes} /><Metric label="RS con recomendación/pendiente" value={data.clientes.pendientes} /><Metric label="Próximas visitas" value={data.clientes.proximasVisitas} /><h3>Clientes con más pendientes</h3><MetricList rows={data.clientes.topClientesPendientes} empty="Sin pendientes." /></section>
      </div>
      <section className="detail-section">
        <h2>Actividad reciente del periodo</h2>
        {data.recientes.length === 0 ? <p>Sin RS en este periodo.</p> : data.recientes.map(rs => <div className="line-item" key={rs.id}><strong>{rs.id}</strong><span>{rs.fecha} · {rs.cliente} · {rs.estado}</span><span>{rs.ciudad} · {rs.supervisor}</span></div>)}
      </section>
    </>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}
function MetricList({ rows, empty }: { rows: Bucket[]; empty: string }) {
  if (!rows.length) return <p>{empty}</p>;
  return <div className="metric-list">{rows.map(row => <div key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}</div>;
}
function EmployeeTable({ rows, valueKey, label }: { rows: EmployeeMetric[]; valueKey: keyof EmployeeMetric; label: string }) {
  if (!rows.length) return <p>Sin horas revisadas.</p>;
  return <div className="sac-table compact">
    <div className="sac-table-head"><span>Empleado</span><span>RS</span><span>{label}</span><span>HE</span><span>Retrabajo</span><span>Normal</span></div>
    {rows.map(row => <div className="sac-table-row" key={`${row.empleado}-${label}`}><strong>{row.empleado}<small>{row.rol}</small></strong><span>{row.reportes}</span><span>{String(row[valueKey])}</span><span>{row.horasExtra}</span><span>{row.horasRetrabajo}</span><span>{row.horasNormales}</span></div>)}
  </div>;
}
