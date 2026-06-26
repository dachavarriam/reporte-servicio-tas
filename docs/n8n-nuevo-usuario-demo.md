# n8n - Demo Webhook Nuevo Usuario RS

Actualizado: 2026-06-24

Webhook:

`POST https://n8n.wembla.com/webhook/nuevo-usuario-rs`

## Payload Que Envia La Plataforma

```json
{
  "tipo": "usuario_creado",
  "creadoPor": "Administrador TAS",
  "usuario": {
    "id": "8f6d7e4c-6d7a-4f4e-9f5c-000000000000",
    "usuario": "jmedina",
    "nombre": "Jose Medina",
    "correo": "jmedina@tas-seguridad.com",
    "telefono": "+504 9999-0000",
    "rol": "supervisor",
    "mustChangePassword": false
  },
  "app": {
    "nombre": "Reportes de Servicio TAS",
    "url": "https://rs.tashonduras.com",
    "loginUrl": "https://rs.tashonduras.com",
    "inviteUrl": "https://rs.tashonduras.com/invitar/TOKEN",
    "expiraEn": "2026-06-29T15:00:00.000Z"
  },
  "mensaje": {
    "asunto": "Active su acceso a Reportes de Servicio TAS",
    "soporte": "Administrador de la plataforma RS TAS"
  }
}
```

## Curl Para Probar El Webhook

Usar solo con un correo de prueba.

```bash
curl -X POST 'https://n8n.wembla.com/webhook/nuevo-usuario-rs' \
  -H 'content-type: application/json' \
  -d '{
    "tipo": "usuario_creado",
    "creadoPor": "Demo Admin",
    "usuario": {
      "id": "demo-user-id",
      "usuario": "demo.rs",
      "nombre": "Usuario Demo",
      "correo": "correo-demo@tas-seguridad.com",
      "telefono": "+504 9999-0000",
      "rol": "supervisor",
      "mustChangePassword": false
    },
    "app": {
      "nombre": "Reportes de Servicio TAS",
      "url": "https://rs.tashonduras.com",
      "loginUrl": "https://rs.tashonduras.com",
      "inviteUrl": "https://rs.tashonduras.com/invitar/TOKEN",
      "expiraEn": "2026-06-29T15:00:00.000Z"
    },
    "mensaje": {
      "asunto": "Active su acceso a Reportes de Servicio TAS",
      "soporte": "Administrador de la plataforma RS TAS"
    }
  }'
```

## Campos Para Usar En n8n

- Para: `{{$json.usuario.correo}}`
- Asunto: `{{$json.mensaje.asunto}}`
- Nombre: `{{$json.usuario.nombre}}`
- Usuario: `{{$json.usuario.usuario}}`
- URL login: `{{$json.app.loginUrl}}`
- Link de activación: `{{$json.app.inviteUrl}}`
- Expira: `{{$json.app.expiraEn}}`
- Rol: `{{$json.usuario.rol}}`

## Cuerpo De Correo Sugerido

```text
Hola {{$json.usuario.nombre}},

Se creó tu acceso a la plataforma de Reportes de Servicio TAS.

Para activar tu cuenta y definir tu contraseña, abre este enlace:
{{$json.app.inviteUrl}}

Usuario:
{{$json.usuario.usuario}}

Este enlace expira el:
{{$json.app.expiraEn}}

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
{{$json.mensaje.soporte}}
```

## Respuesta Esperada De n8n

La app considera exitosa la invitación si n8n responde con HTTP 2xx.

Respuesta sugerida:

```json
{
  "ok": true,
  "sent": true
}
```

Si n8n responde 4xx/5xx, la app mantiene el usuario creado pero marca la invitación como fallida.
