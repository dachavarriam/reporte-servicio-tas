# Onboarding De Usuarios - Reportes de Servicio TAS

Actualizado: 2026-06-24

## Qué Recibe Un Usuario Nuevo

Cuando el admin crea un usuario, el usuario debe recibir:

- Link de activación.
- Usuario.
- Instrucción para definir su contraseña.
- Resumen del flujo de trabajo.
- Reglas básicas de seguridad.
- Contacto de soporte interno.

## Recomendación Para El Envío De Correo

### Opción Recomendada Para Arrancar: n8n

La forma más rápida es usar n8n para enviar el correo de bienvenida cuando se crea un usuario.

Flujo recomendado:

1. Admin crea usuario en `rs.tashonduras.com`.
2. La app genera un token de invitación con expiración.
3. La app dispara un webhook a n8n con los datos del usuario y el link de activación.
4. n8n envía el correo usando Gmail, SMTP, Microsoft 365 o el proveedor que ya usen.
4. n8n responde a la app si el correo fue enviado o falló.

Ventaja:

- Más rápido de implementar.
- Más fácil de ajustar el diseño del correo.
- No obliga a configurar todavía Cloudflare Email Sending.

Dato importante:

- No se envía contraseña por correo.
- El usuario define su contraseña desde el link de activación.

### Opción Directa En Cloudflare

También se puede enviar directamente desde el Worker usando Cloudflare Email Sending.

Requisitos:

- Activar Email Sending para el dominio.
- Configurar el binding `send_email` en `wrangler.jsonc`.
- Definir remitente, por ejemplo `reportes@tas-seguridad.com`.
- Confirmar SPF/DKIM/DMARC para buena entregabilidad.

Esta opción es más limpia a largo plazo, pero requiere configuración del dominio y pruebas de entregabilidad.

## Payload Sugerido Para n8n

Endpoint implementado para carga masiva:

`POST /api/usuarios/bulk`

Webhook n8n configurado:

`POST https://n8n.wembla.com/webhook/nuevo-usuario-rs`

Endpoint futuro sugerido para reenvio manual:

`POST /api/usuarios/:id/invitar`

Payload hacia n8n:

```json
{
  "tipo": "usuario_creado",
  "usuario": {
    "id": "uuid",
    "usuario": "jmedina",
    "nombre": "Jose Medina",
    "correo": "jmedina@tas-seguridad.com",
    "telefono": "+504 ...",
    "rol": "supervisor"
  },
  "app": {
    "url": "https://rs.tashonduras.com",
    "nombre": "Reportes de Servicio TAS"
  },
  "seguridad": {
    "mustChangePassword": true,
    "nota": "La contrasena temporal debe cambiarse en el primer ingreso."
  }
}
```

## Plantilla De Correo Para Usuario Nuevo

Asunto:

`Acceso a Reportes de Servicio TAS`

Cuerpo:

```text
Hola {{nombre}},

Se creó tu acceso a la plataforma de Reportes de Servicio TAS.

URL:
https://rs.tashonduras.com

Usuario:
{{usuario}}

Contraseña temporal:
{{password_temporal}}

Por seguridad, al ingresar por primera vez el sistema te pedirá cambiar la contraseña.

Qué puedes hacer en la plataforma:
- Crear reportes de servicio.
- Guardar borradores.
- Subir fotos de evidencia.
- Firmar como supervisor de campo.
- Presentar el reporte al cliente para revisión y firma.
- Generar y enviar el PDF del reporte.
- Consultar tus reportes anteriores.

Reglas básicas:
- No compartas tu usuario ni contraseña.
- Revisa los datos del cliente antes de finalizar.
- Confirma que el correo del cliente esté correcto.
- Captura fotos claras y clasifícalas como Antes, Durante o Después.
- Si el envío falla, puedes volver a tocar Enviar.

Soporte interno:
Contactar al administrador de la plataforma.
```

## Texto Corto Para WhatsApp O Slack Interno

```text
Ya tienes acceso a Reportes de Servicio TAS:

https://rs.tashonduras.com

Usuario: {{usuario}}
Contraseña temporal: {{password_temporal}}

Al entrar por primera vez debes cambiar la contraseña.
```

## Decisión Pendiente

Antes de automatizar el correo, definir:

- Remitente oficial.
- Proveedor: n8n/SMTP o Cloudflare Email Sending.
- Si la contraseña temporal se envía en el mismo correo o por canal separado.
- Si se agregará botón `Enviar invitación` para reenvío manual.
