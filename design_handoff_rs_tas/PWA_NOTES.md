# Notas PWA, offline y estructura — RS TAS

## 1. Manifest (`manifest.webmanifest`)
```json
{
  "name": "RS TAS — Reportes de Servicio",
  "short_name": "RS TAS",
  "description": "Crea y administra Reportes de Servicio técnicos de TAS Honduras.",
  "lang": "es-HN",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#C20E1A",
  "background_color": "#F4F5F7",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
- Generar íconos a partir de `design/assets/tas-mark.png` sobre fondo claro (o un cuadro de marca rojo para el maskable). El lockup completo (`tas-logo.png`) sirve para el splash.

## 2. Service worker (vite-plugin-pwa / Workbox)
- **App shell** precacheada (`registerType: 'autoUpdate'`).
- **Assets estáticos** (JS/CSS/fuentes/íconos): cache-first.
- **Logos/imágenes de marca**: stale-while-revalidate.
- **Datos**: en esta fase viven en IndexedDB (no requieren red). Cuando exista API, usar network-first con fallback a cache para GET de reportes.
- Probar instalación en Android Chrome y iOS Safari (Añadir a pantalla de inicio). Respetar `safe-area-inset-*` en la barra inferior.

## 3. Estrategia offline-first
1. Primer arranque: si no hay flag `seeded`, sembrar datos de `DATA_MODEL.md` en IndexedDB.
2. Toda lectura/escritura pasa por `LocalReportRepository`.
3. **Autosave** del borrador: debounce ~800 ms → `saveDraft`. Mostrar el badge "Guardado automático" cuando termine.
4. **Cola de sincronización** (preparar aunque no haya backend): cada mutación se registra en un store `outbox`; un `processOutbox()` la vacía cuando exista API + red. Hoy queda en no-op.
5. Posición del borrador en curso (paso actual) en `localStorage` para retomar; nunca borrar datos del usuario.
6. Capturas de cámara/galería (`<input type=file capture>`) → guardar `Blob` en IndexedDB; mostrar con `objectURL`.

## 4. Estructura de carpetas sugerida
```
src/
  app/                 # router, providers, layout (móvil vs escritorio por breakpoint)
  components/          # Button, Input, Textarea, Select, Chip, Badge(estado), Card,
                       # BottomNav, Sidebar, Toast, Modal, ProgressSteps, MicButton...
  features/
    reportes/          # lista, tarjeta, filtros, búsqueda
    formulario/        # 7 pasos, estado del borrador, autosave
    detalle/           # timeline, secciones plegables, galería, vista PDF, acciones
    pendientes/
    perfil/
    escritorio/        # tabla, métricas, panel rápido, formulario 2 columnas
  data/
    repository.ts          # interfaz ReportRepository
    local-repository.ts    # IndexedDB (esta fase)
    seed.ts                # datos de ejemplo
    db.ts                  # idb/Dexie setup, stores, outbox
  lib/                 # estados (máquina), formato fecha/hora, tokens
  styles/              # tokens (CSS vars / Tailwind theme), reset
  pwa/                 # registro SW, manifest
```

## 5. Mapeo de tokens (CSS variables)
```css
:root{
  --red-600:#C20E1A; --red-700:#A40A14; --red-tint:#FDEDED; --red-row:#FDF2F2;
  --ink:#16181C; --gray-600:#5B6470; --gray-500:#8A929C; --gray-400:#9AA2AD; --gray-300:#B4BAC2;
  --border:#ECEDEF; --border-input:#E1E3E7; --border-strong:#D7D9DD; --divider:#F1F2F4; --dashed:#C7CBD1;
  --surface:#FFFFFF; --bg-app:#F4F5F7; --bg-elev:#FAFBFC;
  --radius-card:14px; --radius-input:11px; --radius-btn:12px;
  --font: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}
```
Estados (badge bg/fg/dot) en `lib/estado.ts` como mapa, igual que en el prototipo (README §9).

## 6. Definición de "listo" para esta fase
- [ ] Instalable (manifest + SW) en Android e iOS; abre offline.
- [ ] Las 7 pantallas móviles + barra inferior, fieles al diseño y a los tokens.
- [ ] Formulario de 7 pasos con progreso, navegación, listas dinámicas y **autosave** real.
- [ ] Captura/subida de fotos guardadas localmente, con categoría, descripción y reordenar.
- [ ] Detalle con timeline, secciones plegables y galería desde datos reales.
- [ ] Consola de escritorio (tabla + filtros + métricas + panel rápido + formulario 2 columnas) por breakpoint ≥1024px.
- [ ] Datos sembrados en IndexedDB; búsqueda y filtros operativos.
- [ ] Botones de firma/PDF/envío visibles con placeholders; sin backend.
- [ ] `prefers-reduced-motion` y hit targets ≥44px respetados.
