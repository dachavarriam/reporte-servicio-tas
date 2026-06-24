# Backlog Priorizado RS TAS

Actualizado: 2026-06-24

## Estado Actual

La plataforma ya está funcional para piloto operativo:

- Login con roles.
- Admin y supervisor.
- Crear RS.
- Guardar borrador manualmente.
- Validar campos obligatorios antes de finalizar.
- Fotos en R2.
- PDF generado desde Worker con Browser Rendering.
- Firma real de supervisor.
- Firma real de cliente.
- Metadata de firma: fecha/hora, IP, user agent y ubicación si el navegador lo permite.
- Envío a n8n con callback.
- Dominio `rs.tashonduras.com`.
- D1 `rs-tas`.
- R2 `tashub/reportes`.

## Prioridad 1 - Antes De Uso Amplio

1. Onboarding de usuarios por correo.
   - Definir proveedor de correo.
   - Crear webhook o integración directa.
   - Enviar URL, usuario y contraseña temporal.
   - Forzar cambio de contraseña, ya implementado.

2. Backups.
   - Export programado de D1.
   - Copia programada o manual de R2 `reportes/`.
   - Documentar recuperación.

3. Historial avanzado de cliente.
   - Vista tipo timeline.
   - RS anteriores.
   - Equipos intervenidos.
   - Recomendaciones anteriores.
   - Acciones pendientes por fecha.
   - Acceso a PDF histórico.

4. Auditoría extendida.
   - Registrar cambios críticos.
   - Registrar quién editó y cuándo.
   - Registrar eventos de firma, PDF y envío.

## Prioridad 2 - Mejoras Operativas

5. Gestión de fotos.
   - Cambiar categoría después de subir.
   - Editar descripción.
   - Reordenar fotos.
   - Marcar foto principal.

6. Usuarios.
   - Reset de contraseña desde UI.
   - Reenviar invitación.
   - Ver último acceso.
   - Evitar borrar usuarios con historial; preferir desactivar.

7. Reportes y exportación.
   - Exportar RS por rango de fechas.
   - Exportar historial de cliente.
   - CSV/Excel para auditoría interna.

8. Observabilidad.
   - Alertas por errores de PDF.
   - Alertas por fallos de n8n.
   - Logs consultables de integración Odoo.

## Prioridad 3 - Segunda Fase

9. Odoo.
   - Crear nota o actividad en cliente Odoo cuando se finaliza RS.
   - Adjuntar PDF del RS al cliente.
   - Relacionar equipos intervenidos con historial del cliente.

10. Videos con QR.
    - No guardar videos en D1.
    - Evitar R2 si el espacio será un problema.
    - Usar proveedor externo: Cloudflare Stream, Vimeo privado, Bunny Stream, Mux, SharePoint/OneDrive o YouTube no listado.
    - Guardar en D1 solo metadata:
      - RS.
      - Proveedor.
      - URL.
      - Título.
      - Token privado.
      - Fecha.
    - El QR del PDF debe apuntar a una página segura de la app, no directo al archivo de video.

11. Offline real.
    - IndexedDB para borradores y fotos.
    - Cola de sincronización.
    - Estado `Pendiente de sincronizar`.
    - Resolución de conflictos al volver internet.

## Recomendación De V1.0

Para declarar V1.0 lista:

1. Probar 5 a 10 RS reales.
2. Validar PDF con clientes reales.
3. Confirmar que n8n marque entregas correctamente.
4. Definir backup mínimo.
5. Definir onboarding de usuarios.
6. Documentar soporte interno.

Con eso se puede usar formalmente, dejando historial avanzado, Odoo y videos como siguientes fases.

