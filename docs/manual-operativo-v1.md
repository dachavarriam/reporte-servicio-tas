# Manual Operativo V1 - Reportes de Servicio TAS

Actualizado: 2026-06-24

## Objetivo

La plataforma `rs.tashonduras.com` permite crear, firmar, almacenar y enviar reportes de servicio de campo de TAS Honduras.

El objetivo principal es reemplazar reportes manuales o dispersos por un flujo digital con:

- Registro estructurado del servicio.
- Evidencia fotográfica.
- Firma del supervisor de campo.
- Firma del cliente.
- PDF oficial del RS.
- Envío a Slack/correo por medio de n8n.
- Historial básico del cliente y auditoría del reporte.

## Roles

### Admin

Puede:

- Ver todos los reportes.
- Crear usuarios.
- Activar/desactivar usuarios.
- Eliminar usuarios.
- Eliminar RS.
- Revisar métricas y operación general.

### Supervisor

Puede:

- Crear reportes de servicio.
- Ver sus propios reportes.
- Guardar borradores.
- Subir evidencias.
- Firmar como supervisor.
- Capturar la firma del cliente.
- Finalizar el RS.
- Enviar el PDF.

## Flujo Para Crear Un RS

1. Ingresar a `https://rs.tashonduras.com`.
2. Entrar con usuario y contraseña temporal.
3. Si el sistema lo pide, cambiar la contraseña.
4. Tocar `Nuevo RS`.
5. Completar el paso 1: cliente y visita.
6. Completar el paso 2: trabajo realizado.
7. Registrar equipos intervenidos si aplica.
8. Registrar materiales o repuestos si aplica.
9. Registrar personal participante.
10. Subir fotografías de evidencia, clasificadas como `Antes`, `Durante` o `Después`.
11. Revisar el resumen.
12. Firmar como supervisor.
13. Entregar el dispositivo al cliente para que revise y firme.
14. Finalizar el reporte.
15. Descargar o enviar el PDF.

## Campos Obligatorios Antes De Finalizar

El sistema permite guardar borradores incompletos, pero no permite finalizar si falta información crítica.

Campos obligatorios:

- Fecha.
- Cliente.
- Correo del cliente.
- Ciudad: Tegucigalpa o San Pedro Sula.
- Tipo de visita.
- Hora de llegada.
- Hora de salida.
- Trabajo realizado.
- Observaciones.
- Estado actual.
- Recomendaciones.
- Acciones pendientes.
- Personal participante:
  - Nombre.
  - Rol.
  - Hora de entrada.
  - Hora de salida.
- Firma del supervisor.
- Firma del cliente.

## Firmas

La firma del supervisor y la firma del cliente guardan:

- Nombre.
- Cargo.
- Firma dibujada.
- Fecha y hora.
- IP registrada por Cloudflare.
- Navegador/dispositivo.
- Ubicación GPS si el usuario permite acceso a ubicación.

La ubicación depende del permiso del navegador. Si el usuario rechaza el permiso o el dispositivo no permite GPS, el RS se guarda sin ubicación.

## Evidencias

Las fotos se guardan en R2 bajo el bucket `tashub`, prefijo `reportes`.

Categorías:

- Antes.
- Durante.
- Después.

Las fotos se comprimen antes de subir para reducir consumo de almacenamiento sin perder demasiada calidad.

## PDF

El PDF se genera en el servidor y se guarda en R2.

Incluye:

- Datos generales.
- Resumen del reporte.
- Equipos intervenidos.
- Materiales.
- Personal participante.
- Evidencias fotográficas.
- Firma del supervisor.
- Firma del cliente.
- Metadata de firma.

## Envío

El botón `Enviar` genera el PDF y manda la información a n8n.

n8n debe encargarse de:

- Descargar el PDF desde R2.
- Enviar a Slack.
- Enviar correo al cliente si aplica.
- Llamar el callback de la app con estado:
  - `enviado`.
  - `fallido`.
  - `pendiente`.

## Recomendaciones De Uso En Campo

- Guardar el borrador antes de subir muchas fotos.
- Confirmar que el correo del cliente esté correcto.
- Tomar fotos claras y clasificarlas correctamente.
- Revisar el PDF antes de enviarlo cuando sea un cliente nuevo o un servicio especial.
- Si falla el envío, volver a tocar `Enviar`.
- Si no hay buena señal, guardar el RS y terminar el envío cuando haya conexión estable.
- Seleccionar correctamente la ciudad porque define el canal de envío en n8n.
