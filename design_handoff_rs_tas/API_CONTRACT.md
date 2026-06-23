# Contrato de datos / API — RS TAS

> **Fase actual (PWA funcional):** implementar SOLO la versión **local** (`LocalReportRepository` sobre IndexedDB). El contrato REST y las integraciones (backend, firma, PDF, Odoo, Slack) se documentan aquí para que la UI ya quede preparada, pero **no se implementan todavía**.

## 1. Capa de datos abstracta

Toda la UI consume esta interfaz — nunca llama directo a IndexedDB ni a `fetch`. Así se puede cambiar la implementación local por una remota sin tocar pantallas.

```ts
interface ReportRepository {
  list(query?: {
    estado?: EstadoRS | 'Todos';
    texto?: string;            // matchea id + cliente + ubicación
    page?: number;
    pageSize?: number;
  }): Promise<{ items: ReporteServicio[]; total: number }>;

  get(id: string): Promise<ReporteServicio | null>;
  timeline(id: string): Promise<TimelineEvento[]>;

  createDraft(partial?: Partial<ReporteServicio>): Promise<ReporteServicio>;
  saveDraft(rs: ReporteServicio): Promise<void>;   // autosave (debounced)

  transition(id: string, to: EstadoRS, nota?: string): Promise<ReporteServicio>;

  // Evidencias (blobs en IndexedDB hoy; subida a storage mañana)
  putEvidencia(rsId: string, file: Blob, meta: { categoria: CategoriaFoto; descripcion: string }): Promise<Evidencia>;
  getEvidenciaUrl(blobKey: string): Promise<string>; // objectURL local
  removeEvidencia(rsId: string, evidenciaId: string): Promise<void>;
  reorderEvidencias(rsId: string, ids: string[]): Promise<void>;

  // Catálogos / autocompletado
  searchClientes(texto: string): Promise<Cliente[]>;

  // Métricas para dashboards
  metrics(): Promise<{
    total: number; borradores: number; revision: number;
    pendientesFirma: number; completados: number; tiempoPromedioDias: number;
  }>;
}
```

### Resumen para la pantalla principal y métricas
Derivar los contadores de `list()`/`metrics()` (no hardcodear). Mapeo de las 4 tarjetas del home:
- Borradores → `estado = 'Borrador'`
- Pendientes de revisión → `estado = 'En revisión'`
- Pendientes de firma → `estado = 'Pendiente de firma'`
- Completados → `estado = 'Firmado'`

## 2. Implementación local (esta fase)

`LocalReportRepository`:
- Stores IndexedDB: `reportes`, `timeline`, `evidencias` (blobs), `clientes`, `meta` (seed flag, prefs).
- `createDraft`: genera `id` siguiente (`RS-2026-#####`), estado `Borrador`, timestamps, y un evento timeline `creado`.
- `saveDraft`: upsert + `actualizadoEn = now`. Llamado con **debounce ~800 ms** desde el formulario → refleja el badge "Guardado automático".
- `transition`: valida la transición permitida (ver máquina de estados en README §6), actualiza estado y agrega evento al timeline.
- Evidencias: guardar `Blob` con `blobKey`; `getEvidenciaUrl` devuelve `URL.createObjectURL`.
- Seed: en el primer arranque, sembrar los 8 reportes + detalle de RS-2026-00124 (ver `DATA_MODEL.md`).

## 3. Contrato REST objetivo (fase futura — NO implementar aún)

Cuando exista backend, `RemoteReportRepository` mapeará a:

```
GET    /api/reportes?estado=&texto=&page=&pageSize=
GET    /api/reportes/:id
GET    /api/reportes/:id/timeline
POST   /api/reportes                      # crear borrador
PUT    /api/reportes/:id                   # guardar
POST   /api/reportes/:id/transition        # { to, nota }
POST   /api/reportes/:id/evidencias        # multipart (file + meta)
DELETE /api/reportes/:id/evidencias/:eid
PUT    /api/reportes/:id/evidencias/orden  # { ids: [] }
GET    /api/clientes?texto=
GET    /api/metrics
```

- **Auth:** JWT / sesión; roles `tecnico` y `supervisor` (el supervisor puede aprobar/rechazar). ~20 usuarios.
- **Sync offline → online:** cola de mutaciones en IndexedDB; reintento con backoff al recuperar red; resolución por `actualizadoEn` (last-write-wins simple, o por campo si se requiere).

## 4. Integraciones diferidas (placeholders en la UI, sin implementación)

| Función | UI hoy | Implementación futura |
|---|---|---|
| **Firma electrónica** | Botón "Solicitar firma" → modal "Próximamente"; estado `Pendiente de firma` | Proveedor de firma (a definir); webhook → estado `Firmado` |
| **Generar PDF** | Botón "Finalizar y generar PDF" → toast; estado `Finalizado sin firma`; vista previa simulada | Render server-side del RS a PDF; almacenar y servir URL |
| **Enviar al cliente** | Botón → toast | Email/WhatsApp con enlace al PDF |
| **Odoo** | Autocompletado de cliente con datos mock; campo OT libre | Sincronizar clientes, órdenes de trabajo y materiales desde Odoo |
| **Slack** | — | Notificar a supervisores en transiciones (enviado a revisión, rechazado, firmado) |

Mantener todas estas tras la capa `ReportRepository`/servicios para que su activación no afecte la UI.
