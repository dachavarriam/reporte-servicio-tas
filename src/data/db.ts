import Dexie, { type EntityTable } from 'dexie';
import type { Cliente, ReporteServicio, TimelineEvento } from '../domain/types';
import { clientes, reportes } from './seed';

export interface EvidenciaBlob { id: string; rsId: string; blob: Blob }
export interface OutboxItem { id: string; type: string; rsId: string; payload: unknown; createdAt: string; attempts: number }
export interface MetaItem { key: string; value: string }

class RSTasDB extends Dexie {
  reportes!: EntityTable<ReporteServicio, 'id'>;
  timeline!: EntityTable<TimelineEvento, 'id'>;
  evidencias!: EntityTable<EvidenciaBlob, 'id'>;
  clientes!: EntityTable<Cliente, 'id'>;
  outbox!: EntityTable<OutboxItem, 'id'>;
  meta!: EntityTable<MetaItem, 'key'>;
  constructor() {
    super('rs-tas');
    this.version(1).stores({ reportes: 'id, estado, fecha, actualizadoEn', timeline: 'id, rsId, fecha', evidencias: 'id, rsId', clientes: 'id, nombre', outbox: 'id, rsId, createdAt', meta: 'key' });
  }
}

export const db = new RSTasDB();

export async function seedDatabase() {
  if (await db.meta.get('seeded')) return;
  await db.transaction('rw', db.reportes, db.clientes, db.timeline, db.meta, async () => {
    await db.reportes.bulkPut(reportes);
    await db.clientes.bulkPut(clientes);
    await db.timeline.bulkPut([
      { id: 'tl-1', rsId: 'RS-2026-00124', tipo: 'creado', actor: 'Carlos Hernández', fecha: '2026-06-22T08:15:00-06:00' },
      { id: 'tl-2', rsId: 'RS-2026-00124', tipo: 'enviado_revision', actor: 'Carlos Hernández', fecha: '2026-06-22T14:02:00-06:00' },
      { id: 'tl-3', rsId: 'RS-2026-00124', tipo: 'aprobado', actor: 'José Medina', fecha: '2026-06-22T16:30:00-06:00' },
      { id: 'tl-4', rsId: 'RS-2026-00124', tipo: 'firma_solicitada', actor: 'José Medina', fecha: '2026-06-22T16:31:00-06:00' }
    ]);
    await db.meta.put({ key: 'seeded', value: '1' });
  });
}
