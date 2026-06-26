# n8n - Ruteo De RS Por Ciudad

Actualizado: 2026-06-26

La plataforma manda la ciudad del RS al webhook de envio de PDF.

Webhook existente:

`POST https://n8n.wembla.com/webhook/rs-pdf`

## Campos Nuevos

```json
{
  "ciudad": "San Pedro Sula",
  "canal": "san-pedro-sula",
  "cliente": {
    "ciudad": "San Pedro Sula"
  },
  "reporte": {
    "ciudad": "San Pedro Sula"
  }
}
```

Valores esperados:

- `ciudad`: `Tegucigalpa` o `San Pedro Sula`.
- `canal`: `tegucigalpa`, `san-pedro-sula` o `general`.

## Uso En n8n

Agregar un nodo `Switch` después del webhook:

- Si `{{$json.canal}}` es `tegucigalpa`, enviar al canal Slack de Tegucigalpa.
- Si `{{$json.canal}}` es `san-pedro-sula`, enviar al canal Slack de San Pedro Sula.
- Si llega `general`, enviar a un canal interno de revisión o fallback.

## Recomendación

No depender de la ciudad de Odoo para este ruteo en V1.

Motivo:

- El supervisor puede estar asignado a una ciudad, pero el servicio puede ocurrir en otra.
- Los datos de Odoo pueden estar incompletos o no seguir el mismo criterio operativo.
- El campo manual obligatorio en el RS deja trazabilidad clara de por qué se envió a un canal.

