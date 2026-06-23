# RS TAS — PWA de Reportes de Servicio

Implementación inicial del piloto real para `rs.tashonduras.com`.

## Stack

- React + TypeScript + Vite
- PWA con `vite-plugin-pwa`
- IndexedDB local vía Dexie para modo offline
- Cloudflare Workers Static Assets para hosting/API
- Cloudflare D1 para datos centrales
- Cloudflare R2 para archivos/PDF/fotos
- Cloudflare Browser Rendering para PDF
- Webhook n8n para envío del PDF

## Comandos

Este proyecto usa pnpm. En este equipo quedó más estable usando store local del proyecto:

```bash
pnpm --config.store-dir=.pnpm-store install
pnpm --config.store-dir=.pnpm-store run typecheck
pnpm --config.store-dir=.pnpm-store run build
```

Para desarrollo:

```bash
pnpm --config.store-dir=.pnpm-store run dev
```

Credenciales demo locales:

- Usuario: `carlos`
- Contraseña: `TAS2026!`

## Cloudflare

Antes de desplegar:

1. Usar D1 `rs-tas`.
2. Usar el bucket R2 existente `tashub` con prefijo `reportes/`.
3. Usar webhook n8n `POST https://n8n.wembla.com/webhook/rs-pdf`.
4. Asociar el Worker al custom domain `rs.tashonduras.com`.
5. Aplicar migraciones:

```bash
pnpm --config.store-dir=.pnpm-store wrangler d1 migrations apply rs-tas --remote
```

Despliegue:

```bash
pnpm --config.store-dir=.pnpm-store run deploy
```

## Estado actual

- App PWA compilable con login demo, reportes, filtros, pendientes, perfil, métricas y usuarios.
- Formulario multipaso con autosave local, listas dinámicas, fotos en IndexedDB y firma en canvas.
- Detalle de reporte con timeline, firma, compartir e impresión/PDF local.
- Worker con endpoints base para salud, reportes, guardado, generación PDF y envío por n8n.
- Migración inicial D1 incluida.

Pendiente para producción: conectar `RemoteReportRepository`, auth real con hash/restablecimiento, seed remoto, permisos completos y flujo n8n real.
