# Pendientes RS TAS

Actualizado: 2026-06-24

## Estado Implementado

- PWA en Cloudflare Worker: `rs.tashonduras.com`.
- D1 para reportes, usuarios, sesiones, entregas y timeline.
- R2 `tashub/reportes` para fotos y PDFs.
- Login con PBKDF2, rate limit y cambio obligatorio de contraseña.
- Roles operativos: `admin` y `supervisor`.
- Supervisor ve solo RS propios; admin ve todo y administra usuarios.
- Fotos se comprimen moderadamente antes de subir.
- PDF generado con Browser Rendering incluye fotos desde R2.
- n8n recibe `deliveryId`, `callbackUrl`, `pdfKey`, datos de cliente y datos básicos del RS.
- Callback n8n marca entrega como `pendiente`, `enviado` o `fallido`.
- Timeline del RS se lee desde D1.
- Historial básico por cliente dentro de la plataforma.

## Pendiente Prioridad Alta

1. Validaciones antes de finalizar RS:
   - Cliente requerido.
   - Contacto o correo requerido.
   - Trabajo realizado requerido.
   - Firma del cliente requerida.
   - Definir con el equipo si fotos son obligatorias.

2. Mejorar PDF final:
   - Layout oficial TAS.
   - Mejor portada/encabezado.
   - Tabla de evidencias mejor paginada.
   - Firma del supervisor de campo si se decide usar.
   - Pie legal y datos fiscales si aplica.

3. Historial por cliente:
   - Agregar búsqueda y filtros por fecha/tipo/estado.
   - Exportar historial del cliente.
   - Ver PDFs anteriores desde el cliente.

4. Admin:
   - Reset de contraseña desde UI.
   - Mejor edición de usuario.
   - Confirmar que solo admin pueda borrar RS.

## Pendiente Prioridad Media

5. Fotos:
   - Editar descripción después de subir.
   - Cambiar categoría antes/durante/después después de subir.
   - Reordenar fotos.
   - Marcar foto de portada.

6. Auditoría:
   - Timeline ya funciona como auditoría básica.
   - Falta registrar cambios de campos importantes, no solo eventos.
   - Falta mostrar `antes/después` para cambios críticos.

7. Export/backups:
   - Exportar CSV/Excel de RS por rango de fechas.
   - Exportar historial por cliente.
   - Definir estrategia de respaldo D1/R2.

8. Observabilidad:
   - Timeline no reemplaza logs operativos.
   - Agregar alertas/logs para errores de PDF, errores de n8n y fallos Odoo.
   - Revisar `wrangler tail`/Cloudflare Logs para monitoreo.

## Segunda Fase

9. Odoo:
   - Crear historial del RS en Odoo como actividad/nota del cliente.
   - Adjuntar PDF al contacto/empresa en Odoo.
   - Explorar layout de documentos Odoo para replicar estilo del PDF.
   - Posible flujo: tomar un PDF/documento Odoo existente, extraer estructura visual y convertirlo a plantilla HTML del Worker.

10. Offline real:
   - Hoy la PWA puede cargar la app offline, pero no tiene sincronización completa.
   - Propuesta: guardar borradores/fotos en IndexedDB local cuando no hay internet.
   - Mostrar estado `Pendiente de sincronizar`.
   - Al volver internet, subir RS/fotos y resolver conflictos.
   - Esto requiere cola local robusta y pruebas en campo.

11. n8n/correo:
   - El envío por correo puede quedarse en n8n.
   - La app ya manda cliente/contacto/correo en el payload.
   - n8n debe reportar `enviado` solo cuando Slack/correo hayan terminado correctamente, o `fallido` con detalle.
