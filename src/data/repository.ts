import { db, seedDatabase } from './db';
import type { CategoriaFoto, Cliente, EstadoRS, Metrics, ReporteServicio, TimelineEvento } from '../domain/types';
import { uid } from '../domain/types';

export interface ReportRepository {
  list(query?: { estado?: EstadoRS | 'Todos'; texto?: string }): Promise<{ items: ReporteServicio[]; total: number }>;
  get(id: string): Promise<ReporteServicio | null>;
  timeline(id: string): Promise<TimelineEvento[]>;
  createDraft(partial?: Partial<ReporteServicio>): Promise<ReporteServicio>;
  saveDraft(rs: ReporteServicio): Promise<void>;
  transition(id: string, to: EstadoRS, nota?: string): Promise<ReporteServicio>;
  putEvidencia(rsId: string, file: Blob, meta: { categoria: CategoriaFoto; descripcion: string }): Promise<void>;
  removeEvidencia(rsId: string, evidenciaId: string): Promise<void>;
  searchClientes(texto: string): Promise<Cliente[]>;
  metrics(): Promise<Metrics>;
}

const allowed: Record<EstadoRS, EstadoRS[]> = {
  'Borrador': ['En revisión', 'Finalizado sin firma', 'Pendiente de firma'],
  'En revisión': ['Pendiente de firma', 'Rechazado'],
  'Rechazado': ['Borrador', 'En revisión'],
  'Finalizado sin firma': ['Pendiente de firma', 'Firmado'],
  'Pendiente de firma': ['Firmado'], 'Firmado': []
};

export class LocalReportRepository implements ReportRepository {
  async ready() { await seedDatabase(); }
  async list(query: { estado?: EstadoRS | 'Todos'; texto?: string } = {}) {
    await this.ready();
    let items = await db.reportes.orderBy('fecha').reverse().toArray();
    if (query.estado && query.estado !== 'Todos') items = items.filter(x => x.estado === query.estado);
    if (query.texto) { const q = query.texto.toLocaleLowerCase(); items = items.filter(x => `${x.id} ${x.cliente} ${x.ubicacion}`.toLocaleLowerCase().includes(q)); }
    return { items, total: items.length };
  }
  async get(id: string) { await this.ready(); return (await db.reportes.get(id)) ?? null; }
  async timeline(id: string) { return db.timeline.where('rsId').equals(id).sortBy('fecha'); }
  async createDraft(partial: Partial<ReporteServicio> = {}) {
    await this.ready(); const all = await db.reportes.toArray(); const year = new Date().getFullYear();
    const next = Math.max(0, ...all.map(r => Number(r.id.match(/(\d{5})/)?.[1] ?? 0))) + 1; const now = new Date().toISOString();
    const rs: ReporteServicio = { id: `RS-${year}-${String(next).padStart(5, '0')}`, estado: 'Borrador', version: 1, fecha: now.slice(0, 10), cliente: '', contacto: '', correo: '', telefono: '', ubicacion: '', solicitadoPor: '', tipoVisita: 'Mantenimiento', horaLlegada: '', horaSalida: '', trabajoRealizado: '', observaciones: '', estadoActual: 'Operativo', recomendaciones: '', accionesPendientes: '', proximaVisita: false, equipos: [], materiales: [], personal: [], evidencias: [], supervisor: 'Carlos Hernández', creadoPor: 'Carlos Hernández', creadoEn: now, actualizadoEn: now, ...partial };
    await db.reportes.put(rs); await db.timeline.put({ id: uid(), rsId: rs.id, tipo: 'creado', actor: rs.creadoPor, fecha: now }); return rs;
  }
  async saveDraft(rs: ReporteServicio) { const saved = { ...rs, version: rs.version + 1, actualizadoEn: new Date().toISOString() }; await db.reportes.put(saved); await db.outbox.put({ id: uid(), type: 'save', rsId: rs.id, payload: saved, createdAt: saved.actualizadoEn, attempts: 0 }); }
  async transition(id: string, to: EstadoRS, nota?: string) { const rs = await this.get(id); if (!rs) throw new Error('Reporte no encontrado'); if (!allowed[rs.estado].includes(to)) throw new Error(`Transición no permitida: ${rs.estado} → ${to}`); const saved = { ...rs, estado: to, version: rs.version + 1, actualizadoEn: new Date().toISOString() }; await db.reportes.put(saved); await db.timeline.put({ id: uid(), rsId: id, tipo: to.toLowerCase().replaceAll(' ', '_'), actor: rs.supervisor, fecha: saved.actualizadoEn, nota }); return saved; }
  async putEvidencia(rsId: string, file: Blob, meta: { categoria: CategoriaFoto; descripcion: string }) { const rs = await this.get(rsId); if (!rs) throw new Error('Reporte no encontrado'); const id = uid(); await db.evidencias.put({ id, rsId, blob: file }); rs.evidencias.push({ id, blobKey: id, categoria: meta.categoria, descripcion: meta.descripcion, orden: rs.evidencias.length }); await this.saveDraft(rs); }
  async removeEvidencia(rsId: string, evidenciaId: string) { const rs = await this.get(rsId); if (!rs) return; rs.evidencias = rs.evidencias.filter(x => x.id !== evidenciaId); await db.evidencias.delete(evidenciaId); await this.saveDraft(rs); }
  async searchClientes(texto: string) { await this.ready(); return db.clientes.filter(x => x.nombre.toLowerCase().includes(texto.toLowerCase())).limit(5).toArray(); }
  async metrics() { const all = (await this.list()).items; return { total: all.length, borradores: all.filter(x => x.estado === 'Borrador').length, revision: all.filter(x => x.estado === 'En revisión').length, pendientesFirma: all.filter(x => x.estado === 'Pendiente de firma').length, completados: all.filter(x => x.estado === 'Firmado').length, tiempoPromedioDias: 1.8 }; }
}

export const reports = new LocalReportRepository();
