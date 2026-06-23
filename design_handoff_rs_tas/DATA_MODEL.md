# Modelo de datos — RS TAS

Tipos en TypeScript. Sirven tanto para el estado local (IndexedDB) como para el contrato de API futuro.

```ts
type EstadoRS =
  | 'Borrador'
  | 'En revisión'
  | 'Finalizado sin firma'
  | 'Pendiente de firma'
  | 'Firmado'
  | 'Rechazado';

type TipoVisita =
  | 'Instalación' | 'Soporte' | 'Mantenimiento' | 'Reparación'
  | 'Capacitación' | 'Estudio técnico' | 'Inspección' | 'Otro';

type RolPersonal = 'Técnico' | 'Ingeniero' | 'Supervisor' | 'Ayudante';

type UsoMaterial = 'Instalado' | 'Utilizado' | 'Entregado';

type CategoriaFoto = 'Antes' | 'Durante' | 'Después';

interface Equipo {
  id: string;
  nombre: string;
  marca: string;
  modelo: string;
  serie: string;
  ubicacion: string;
  estadoInicial: string;
  estadoFinal: string;
  trabajoRealizado: string;
  recomendacion: string;
}

interface Material {
  id: string;
  producto: string;
  cantidad: string;       // numérico; string en el form
  unidad: string;         // Unidad, ml, m, etc.
  serieLote?: string;
  uso: UsoMaterial;
}

interface Personal {
  id: string;
  nombre: string;
  rol: RolPersonal;
  horaEntrada: string;    // 'HH:mm'
  horaSalida: string;     // 'HH:mm'
  horas: string;          // calculado o manual
}

interface Evidencia {
  id: string;
  categoria: CategoriaFoto;
  descripcion: string;
  // En la PWA: referencia al blob guardado en IndexedDB
  blobKey?: string;
  orden: number;
}

interface Cliente {
  id: string;
  nombre: string;
  contacto: string;
  correo: string;
  telefono: string;
  ubicacionDefault?: string;
}

interface ReporteServicio {
  id: string;                 // 'RS-2026-00124'
  estado: EstadoRS;
  // Paso 1
  fecha: string;              // ISO 'YYYY-MM-DD'
  clienteId?: string;
  cliente: string;            // denormalizado para mostrar
  contacto: string;
  correo: string;
  telefono: string;
  ubicacion: string;
  ordenTrabajo?: string;      // 'OT-4587'
  solicitadoPor: string;
  tipoVisita: TipoVisita;
  horaLlegada: string;        // 'HH:mm'
  horaSalida: string;         // 'HH:mm'
  // Paso 2
  trabajoRealizado: string;
  observaciones: string;
  estadoActual: string;
  recomendaciones: string;
  accionesPendientes: string;
  proximaVisita: boolean;
  fechaSeguimiento?: string;
  // Pasos 3–6
  equipos: Equipo[];
  materiales: Material[];
  personal: Personal[];
  evidencias: Evidencia[];
  // Metadatos
  supervisor: string;         // técnico/supervisor responsable
  creadoEn: string;           // ISO datetime
  actualizadoEn: string;      // ISO datetime
  // Para display rápido en listas
  resumenEquipo?: string;     // p.ej. 'Impresora Zebra ZT411'
}

interface TimelineEvento {
  id: string;
  rsId: string;
  tipo: 'creado' | 'enviado_revision' | 'aprobado' | 'rechazado'
       | 'finalizado' | 'firma_solicitada' | 'firmado' | 'correccion';
  actor: string;
  fecha: string;              // ISO datetime
  nota?: string;
}
```

## Catálogos (seed)
- **Tipos de visita:** los 8 de `TipoVisita`.
- **Roles:** los 4 de `RolPersonal`.
- **Unidades:** Unidad, Caja, m, cm, ml, L, kg, g, hora.
- **Usos de material:** Instalado, Utilizado, Entregado.

## Resumen para la pantalla principal (contadores)
En el prototipo son: Borradores **3**, Pendientes de revisión **2**, Pendientes de firma **4**, Completados **12**. Derivarlos de los reportes reales (contar por estado) en la PWA.

## Reportes de ejemplo (sembrar en el primer arranque)

| id | cliente | ubicacion | tipoVisita | fecha | supervisor | estado | ordenTrabajo | resumenEquipo |
|---|---|---|---|---|---|---|---|---|
| RS-2026-00124 | Empresa ABC Honduras | Tegucigalpa | Mantenimiento | 2026-06-22 | Carlos Hernández | Pendiente de firma | OT-4587 | Impresora Zebra ZT411 |
| RS-2026-00123 | Banco Atlántida | San Pedro Sula | Soporte | 2026-06-21 | Carlos Hernández | Firmado | OT-4571 | UPS APC Smart 3000 |
| RS-2026-00122 | Hospital del Valle | San Pedro Sula | Reparación | 2026-06-20 | José Medina | En revisión | OT-4566 | Sistema de acceso biométrico |
| RS-2026-00121 | Supermercados La Colonia | Tegucigalpa | Instalación | 2026-06-19 | Carlos Hernández | Borrador | — | Cámaras Hikvision (x6) |
| RS-2026-00120 | Cervecería Hondureña | San Pedro Sula | Inspección | 2026-06-18 | Luis Fonseca | Finalizado sin firma | OT-4559 | Lectores de código de barras |
| RS-2026-00119 | Aeropuerto Toncontín | Tegucigalpa | Mantenimiento | 2026-06-17 | Carlos Hernández | Rechazado | OT-4540 | Torniquetes de control |
| RS-2026-00118 | Farmacias Kielsa | Tegucigalpa | Capacitación | 2026-06-16 | Ana Cruz | Firmado | OT-4533 | POS y software de inventario |
| RS-2026-00117 | Grupo Karim's | San Pedro Sula | Estudio técnico | 2026-06-14 | Carlos Hernández | Firmado | OT-4520 | Red de CCTV perimetral |

### Detalle completo sembrado para RS-2026-00124
- **Contacto:** María López · mlopez@empresaabc.hn · +504 9988-7766 · llegada 09:00 / salida 12:30 · solicitado por María López.
- **Equipos:** Impresora de etiquetas — Zebra ZT411 — serie ZT411-8842-HN — Bodega central — "Operativo con fallas" → "Operativo" — trabajo: limpieza de cabezal y recalibración de sensores — recomendación: reemplazar rodillo en próxima visita.
- **Materiales:** Rodillo de impresión ×1 Unidad (serie RD-ZT411, Instalado); Alcohol isopropílico ×250 ml (Utilizado).
- **Personal:** Carlos Hernández — Técnico — 09:00–12:30 — 3.5 h.
- **Evidencias:** Antes ("Estado inicial del cabezal"), Durante ("Calibración de sensores"), Después ("Prueba de impresión final").
- **Timeline:** Creado (Carlos Hernández, 22 Jun 08:15) → Enviado para revisión (22 Jun 14:02) → Aprobado por supervisor (José Medina, 22 Jun 16:30) → Pendiente de firma del cliente (en espera).

## Usuario actual (demo)
Carlos Hernández — Supervisor de Servicio Técnico — chernandez@tashn.com — +504 9912-3344 — Región Centro · Tegucigalpa. Iniciales avatar "CH".
