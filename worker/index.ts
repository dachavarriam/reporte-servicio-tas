import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Env = { DB: D1Database; FILES: R2Bucket; BROWSER: Fetcher; APP_ORIGIN: string; N8N_WEBHOOK_URL: string; R2_PREFIX: string; ASSETS: Fetcher };
const app = new Hono<{ Bindings: Env }>();
app.use('/api/*', async (c, next) => cors({ origin: c.env.APP_ORIGIN, credentials: true })(c, next));

app.get('/api/health', c => c.json({ ok: true, service: 'rs-tas', time: new Date().toISOString() }));

app.get('/api/reportes', async c => {
  const estado = c.req.query('estado'); const texto = `%${(c.req.query('texto') ?? '').toLowerCase()}%`;
  const where: string[] = []; const params: unknown[] = [];
  if (estado && estado !== 'Todos') { where.push('estado = ?'); params.push(estado); }
  if (texto !== '%%') { where.push('(lower(id) like ? or lower(cliente) like ? or lower(ubicacion) like ?)'); params.push(texto, texto, texto); }
  const sql = `select * from reportes ${where.length ? `where ${where.join(' and ')}` : ''} order by fecha desc limit 100`;
  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ items: rows.results.map(rowToReport), total: rows.results.length });
});

app.get('/api/reportes/:id', async c => {
  const row = await c.env.DB.prepare('select * from reportes where id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(rowToReport(row));
});

app.put('/api/reportes/:id', async c => {
  const rs = await c.req.json(); const now = new Date().toISOString();
  await c.env.DB.prepare(`insert into reportes (id, estado, version, fecha, cliente, contacto, correo, telefono, ubicacion, orden_trabajo, solicitado_por, tipo_visita, hora_llegada, hora_salida, trabajo_realizado, observaciones, estado_actual, recomendaciones, acciones_pendientes, proxima_visita, fecha_seguimiento, supervisor, creado_por, creado_en, actualizado_en, resumen_equipo, payload_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set estado=excluded.estado, version=reportes.version+1, fecha=excluded.fecha, cliente=excluded.cliente, contacto=excluded.contacto, correo=excluded.correo, telefono=excluded.telefono, ubicacion=excluded.ubicacion, orden_trabajo=excluded.orden_trabajo, solicitado_por=excluded.solicitado_por, tipo_visita=excluded.tipo_visita, hora_llegada=excluded.hora_llegada, hora_salida=excluded.hora_salida, trabajo_realizado=excluded.trabajo_realizado, observaciones=excluded.observaciones, estado_actual=excluded.estado_actual, recomendaciones=excluded.recomendaciones, acciones_pendientes=excluded.acciones_pendientes, proxima_visita=excluded.proxima_visita, fecha_seguimiento=excluded.fecha_seguimiento, supervisor=excluded.supervisor, actualizado_en=excluded.actualizado_en, resumen_equipo=excluded.resumen_equipo, payload_json=excluded.payload_json`)
    .bind(rs.id, rs.estado, rs.version ?? 1, rs.fecha, rs.cliente, rs.contacto, rs.correo, rs.telefono, rs.ubicacion, rs.ordenTrabajo ?? '', rs.solicitadoPor, rs.tipoVisita, rs.horaLlegada, rs.horaSalida, rs.trabajoRealizado, rs.observaciones, rs.estadoActual, rs.recomendaciones, rs.accionesPendientes, rs.proximaVisita ? 1 : 0, rs.fechaSeguimiento ?? '', rs.supervisor, rs.creadoPor, rs.creadoEn ?? now, now, rs.resumenEquipo ?? '', JSON.stringify(rs)).run();
  return c.json({ ok: true, actualizadoEn: now });
});

app.post('/api/reportes/:id/pdf', async c => {
  const row = await c.env.DB.prepare('select * from reportes where id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const rs = rowToReport(row); const html = renderPdfHtml(rs);
  const pdf = await c.env.BROWSER.fetch('https://api.cloudflare.com/client/v4/browser-rendering/pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html }) });
  if (!pdf.ok) return c.json({ error: 'pdf_failed' }, 502);
  const prefix = c.env.R2_PREFIX || 'reportes';
  const key = `${prefix}/${rs.id}/pdf/${Date.now()}.pdf`; await c.env.FILES.put(key, await pdf.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf' } });
  await c.env.DB.prepare('insert into archivos (id, reporte_id, tipo, r2_key, creado_en) values (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), rs.id, 'pdf', key, new Date().toISOString()).run();
  return c.json({ ok: true, key });
});

app.post('/api/reportes/:id/enviar', async c => {
  const body = await c.req.json<{ destinatario: string; pdfKey: string }>(); const id = crypto.randomUUID();
  await c.env.DB.prepare('insert into entregas (id, reporte_id, destinatario, estado, creado_en) values (?, ?, ?, ?, ?)').bind(id, c.req.param('id'), body.destinatario, 'pendiente', new Date().toISOString()).run();
  if (c.env.N8N_WEBHOOK_URL) await fetch(c.env.N8N_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deliveryId: id, reporteId: c.req.param('id'), destinatario: body.destinatario, pdfKey: body.pdfKey }) });
  return c.json({ ok: true, deliveryId: id });
});

function rowToReport(row: Record<string, unknown>) { const payload = row.payload_json ? JSON.parse(String(row.payload_json)) : {}; return { ...payload, id: row.id, estado: row.estado, version: row.version, fecha: row.fecha, cliente: row.cliente, contacto: row.contacto, correo: row.correo, telefono: row.telefono, ubicacion: row.ubicacion, ordenTrabajo: row.orden_trabajo, solicitadoPor: row.solicitado_por, tipoVisita: row.tipo_visita, horaLlegada: row.hora_llegada, horaSalida: row.hora_salida, trabajoRealizado: row.trabajo_realizado, observaciones: row.observaciones, estadoActual: row.estado_actual, recomendaciones: row.recomendaciones, accionesPendientes: row.acciones_pendientes, proximaVisita: Boolean(row.proxima_visita), fechaSeguimiento: row.fecha_seguimiento, supervisor: row.supervisor, creadoPor: row.creado_por, creadoEn: row.creado_en, actualizadoEn: row.actualizado_en, resumenEquipo: row.resumen_equipo }; }
function renderPdfHtml(rs: ReturnType<typeof rowToReport>) { return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#16181C;padding:32px}header{display:flex;justify-content:space-between;border-bottom:3px solid #C20E1A;padding-bottom:16px}h1{color:#C20E1A}.box{border:1px solid #ddd;border-radius:10px;padding:14px;margin:12px 0}.sig{height:90px;object-fit:contain}</style></head><body><header><div><h1>REPORTE DE SERVICIO</h1><strong>${rs.id}</strong></div><div>TAS Honduras</div></header><section class="box"><h2>${rs.cliente}</h2><p>${rs.ubicacion} · ${rs.fecha} · ${rs.tipoVisita}</p></section><section class="box"><h3>Trabajo realizado</h3><p>${rs.trabajoRealizado || ''}</p><h3>Observaciones</h3><p>${rs.observaciones || ''}</p></section>${rs.firma ? `<section class="box"><h3>Firma del cliente</h3><img class="sig" src="${rs.firma.trazo}"><p>${rs.firma.nombre} · ${rs.firma.cargo || ''}</p></section>` : ''}</body></html>`; }

export default app;
