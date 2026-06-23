export type EstadoRS = 'Borrador' | 'En revisión' | 'Finalizado sin firma' | 'Pendiente de firma' | 'Firmado' | 'Rechazado';
export type TipoVisita = 'Instalación' | 'Soporte' | 'Mantenimiento' | 'Reparación' | 'Capacitación' | 'Estudio técnico' | 'Inspección' | 'Otro';
export type RolUsuario = 'admin' | 'supervisor' | 'tecnico';
export type CategoriaFoto = 'Antes' | 'Durante' | 'Después';

export interface Equipo { id: string; nombre: string; marca: string; modelo: string; serie: string; ubicacion: string; estadoInicial: string; estadoFinal: string; trabajoRealizado: string; recomendacion: string }
export interface Material { id: string; producto: string; cantidad: string; unidad: string; serieLote?: string; uso: 'Instalado' | 'Utilizado' | 'Entregado' }
export interface Personal { id: string; nombre: string; rol: 'Técnico' | 'Ingeniero' | 'Supervisor' | 'Ayudante'; horaEntrada: string; horaSalida: string; horas: string }
export interface Evidencia { id: string; categoria: CategoriaFoto; descripcion: string; blobKey?: string; orden: number }
export interface Firma { nombre: string; cargo: string; trazo: string; aceptada: boolean; firmadaEn: string }
export interface TimelineEvento { id: string; rsId: string; tipo: string; actor: string; fecha: string; nota?: string }

export interface ReporteServicio {
  id: string; estado: EstadoRS; version: number; fecha: string; clienteId?: string; cliente: string;
  contacto: string; correo: string; telefono: string; ubicacion: string; ordenTrabajo?: string;
  solicitadoPor: string; tipoVisita: TipoVisita; horaLlegada: string; horaSalida: string;
  trabajoRealizado: string; observaciones: string; estadoActual: string; recomendaciones: string;
  accionesPendientes: string; proximaVisita: boolean; fechaSeguimiento?: string;
  equipos: Equipo[]; materiales: Material[]; personal: Personal[]; evidencias: Evidencia[];
  firma?: Firma; supervisor: string; creadoPor: string; creadoEn: string; actualizadoEn: string; resumenEquipo?: string;
}

export interface Usuario { id: string; usuario: string; nombre: string; correo: string; telefono: string; rol: RolUsuario; activo: boolean }
export interface Cliente { id: string; nombre: string; contacto: string; correo: string; telefono: string; ubicacionDefault?: string }
export interface Metrics { total: number; borradores: number; revision: number; pendientesFirma: number; completados: number; tiempoPromedioDias: number }

export const ESTADO_META: Record<EstadoRS, { bg: string; fg: string; dot: string }> = {
  'Borrador': { bg: '#F1F2F4', fg: '#5B6470', dot: '#9AA2AD' },
  'En revisión': { bg: '#FFF4E5', fg: '#A66400', dot: '#F59E0B' },
  'Finalizado sin firma': { bg: '#EEF2F7', fg: '#475569', dot: '#64748B' },
  'Pendiente de firma': { bg: '#FDEDE3', fg: '#BE4708', dot: '#EA580C' },
  'Firmado': { bg: '#E7F6EC', fg: '#117A3B', dot: '#16A34A' },
  'Rechazado': { bg: '#FCEBEC', fg: '#B4232C', dot: '#DC2626' }
};

export const TIPOS_VISITA: TipoVisita[] = ['Instalación', 'Soporte', 'Mantenimiento', 'Reparación', 'Capacitación', 'Estudio técnico', 'Inspección', 'Otro'];
export const uid = () => crypto.randomUUID();
