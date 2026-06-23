import type { Cliente, ReporteServicio, Usuario } from '../domain/types';

export const DEMO_USER: Usuario = { id: 'usr-carlos', usuario: 'carlos', nombre: 'Carlos Hernández', correo: 'chernandez@tashn.com', telefono: '+504 9912-3344', rol: 'supervisor', activo: true };
export const DEMO_PASSWORD = 'TAS2026!';

export const clientes: Cliente[] = [
  { id: 'cli-abc', nombre: 'Empresa ABC Honduras', contacto: 'María López', correo: 'mlopez@empresaabc.hn', telefono: '+504 9988-7766', ubicacionDefault: 'Tegucigalpa, Col. Palmira' },
  { id: 'cli-atlantida', nombre: 'Banco Atlántida', contacto: 'Roberto Paz', correo: 'rpaz@bancatlan.hn', telefono: '+504 2232-0000', ubicacionDefault: 'San Pedro Sula' },
  { id: 'cli-hospital', nombre: 'Hospital del Valle', contacto: 'Laura Díaz', correo: 'ldiaz@hospitaldelvalle.hn', telefono: '+504 2516-2273', ubicacionDefault: 'San Pedro Sula' }
];

const now = '2026-06-22T16:30:00.000Z';
const base = (id: string, cliente: string, ubicacion: string, tipoVisita: ReporteServicio['tipoVisita'], fecha: string, supervisor: string, estado: ReporteServicio['estado'], ordenTrabajo: string, resumenEquipo: string): ReporteServicio => ({
  id, cliente, ubicacion, tipoVisita, fecha, supervisor, estado, ordenTrabajo, resumenEquipo, version: 1,
  contacto: '', correo: '', telefono: '', solicitadoPor: '', horaLlegada: '09:00', horaSalida: '12:30',
  trabajoRealizado: '', observaciones: '', estadoActual: 'Operativo', recomendaciones: '', accionesPendientes: '',
  proximaVisita: false, equipos: [], materiales: [], personal: [], evidencias: [], creadoPor: supervisor, creadoEn: now, actualizadoEn: now
});

export const reportes: ReporteServicio[] = [
  { ...base('RS-2026-00124', 'Empresa ABC Honduras', 'Tegucigalpa', 'Mantenimiento', '2026-06-22', 'Carlos Hernández', 'Pendiente de firma', 'OT-4587', 'Impresora Zebra ZT411'), contacto: 'María López', correo: 'mlopez@empresaabc.hn', telefono: '+504 9988-7766', solicitadoPor: 'María López', trabajoRealizado: 'Limpieza de cabezal y recalibración de sensores.', observaciones: 'Desgaste visible en rodillo.', estadoActual: 'Operativo', recomendaciones: 'Reemplazar rodillo en próxima visita.', equipos: [{ id: 'eq-1', nombre: 'Impresora de etiquetas', marca: 'Zebra', modelo: 'ZT411', serie: 'ZT411-8842-HN', ubicacion: 'Bodega central', estadoInicial: 'Operativo con fallas', estadoFinal: 'Operativo', trabajoRealizado: 'Limpieza de cabezal y recalibración de sensores', recomendacion: 'Reemplazar rodillo en próxima visita' }], materiales: [{ id: 'mat-1', producto: 'Rodillo de impresión', cantidad: '1', unidad: 'Unidad', serieLote: 'RD-ZT411', uso: 'Instalado' }, { id: 'mat-2', producto: 'Alcohol isopropílico', cantidad: '250', unidad: 'ml', uso: 'Utilizado' }], personal: [{ id: 'per-1', nombre: 'Carlos Hernández', rol: 'Técnico', horaEntrada: '09:00', horaSalida: '12:30', horas: '3.5' }] },
  base('RS-2026-00123', 'Banco Atlántida', 'San Pedro Sula', 'Soporte', '2026-06-21', 'Carlos Hernández', 'Firmado', 'OT-4571', 'UPS APC Smart 3000'),
  base('RS-2026-00122', 'Hospital del Valle', 'San Pedro Sula', 'Reparación', '2026-06-20', 'José Medina', 'En revisión', 'OT-4566', 'Sistema de acceso biométrico'),
  base('RS-2026-00121', 'Supermercados La Colonia', 'Tegucigalpa', 'Instalación', '2026-06-19', 'Carlos Hernández', 'Borrador', '', 'Cámaras Hikvision (x6)'),
  base('RS-2026-00120', 'Cervecería Hondureña', 'San Pedro Sula', 'Inspección', '2026-06-18', 'Luis Fonseca', 'Finalizado sin firma', 'OT-4559', 'Lectores de código de barras'),
  base('RS-2026-00119', 'Aeropuerto Toncontín', 'Tegucigalpa', 'Mantenimiento', '2026-06-17', 'Carlos Hernández', 'Rechazado', 'OT-4540', 'Torniquetes de control'),
  base('RS-2026-00118', 'Farmacias Kielsa', 'Tegucigalpa', 'Capacitación', '2026-06-16', 'Ana Cruz', 'Firmado', 'OT-4533', 'POS y software de inventario'),
  base('RS-2026-00117', "Grupo Karim's", 'San Pedro Sula', 'Estudio técnico', '2026-06-14', 'Carlos Hernández', 'Firmado', 'OT-4520', 'Red de CCTV perimetral')
];
