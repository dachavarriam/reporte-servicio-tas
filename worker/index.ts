import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { RolUsuario } from '../src/domain/types';

type Env = { DB: D1Database; FILES: R2Bucket; BROWSER: Fetcher; APP_ORIGIN: string; N8N_WEBHOOK_URL: string; R2_PREFIX: string; ASSETS: Fetcher };
const app = new Hono<{ Bindings: Env }>();
app.use('/api/*', async (c, next) => cors({ origin: c.env.APP_ORIGIN, credentials: true })(c, next));

app.get('/api/health', c => c.json({ ok: true, service: 'rs-tas', time: new Date().toISOString() }));

app.post('/api/auth/login', async c => {
  const body = await c.req.json<{ usuario: string; password: string }>();
  const row = await c.env.DB.prepare('select id, usuario, nombre, correo, telefono, rol, activo, password_hash from usuarios where lower(usuario) = lower(?) and activo = 1')
    .bind(body.usuario).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'invalid_credentials' }, 401);
  const hash = await sha256(body.password);
  if (hash !== row.password_hash) return c.json({ error: 'invalid_credentials' }, 401);
  const token = crypto.randomUUID(); const now = new Date(); const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14);
  await c.env.DB.prepare('insert into sesiones (token, usuario_id, creado_en, expira_en) values (?, ?, ?, ?)').bind(token, row.id, now.toISOString(), expires.toISOString()).run();
  return c.json({ user: rowToUser(row), token });
});

app.get('/api/usuarios', async c => {
  const user = await requireUser(c, 'admin'); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const rows = await c.env.DB.prepare('select id, usuario, nombre, correo, telefono, rol, activo from usuarios order by nombre asc').all<Record<string, unknown>>();
  return c.json({ items: rows.results.map(rowToUser) });
});

app.post('/api/usuarios', async c => {
  const user = await requireUser(c, 'admin'); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ usuario: string; nombre: string; correo: string; telefono?: string; rol: RolUsuario; password: string }>();
  if (!body.usuario || !body.nombre || !body.correo || !body.rol || !body.password) return c.json({ error: 'missing_fields' }, 400);
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const hash = await sha256(body.password);
  await c.env.DB.prepare('insert into usuarios (id, usuario, nombre, correo, telefono, rol, activo, password_hash, must_change_password, creado_en) values (?, ?, ?, ?, ?, ?, 1, ?, 1, ?)')
    .bind(id, body.usuario.trim().toLowerCase(), body.nombre.trim(), body.correo.trim().toLowerCase(), body.telefono ?? '', body.rol, hash, now).run();
  return c.json({ ok: true, user: { id, usuario: body.usuario.trim().toLowerCase(), nombre: body.nombre.trim(), correo: body.correo.trim().toLowerCase(), telefono: body.telefono ?? '', rol: body.rol, activo: true } }, 201);
});

app.put('/api/usuarios/:id', async c => {
  const user = await requireUser(c, 'admin'); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ nombre: string; correo: string; telefono?: string; rol: RolUsuario; activo: boolean; password?: string }>();
  if (body.password) {
    await c.env.DB.prepare('update usuarios set nombre = ?, correo = ?, telefono = ?, rol = ?, activo = ?, password_hash = ?, must_change_password = 1 where id = ?')
      .bind(body.nombre, body.correo, body.telefono ?? '', body.rol, body.activo ? 1 : 0, await sha256(body.password), c.req.param('id')).run();
  } else {
    await c.env.DB.prepare('update usuarios set nombre = ?, correo = ?, telefono = ?, rol = ?, activo = ? where id = ?')
      .bind(body.nombre, body.correo, body.telefono ?? '', body.rol, body.activo ? 1 : 0, c.req.param('id')).run();
  }
  return c.json({ ok: true });
});

app.get('/api/reportes', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const estado = c.req.query('estado'); const texto = `%${(c.req.query('texto') ?? '').toLowerCase()}%`;
  const where: string[] = []; const params: unknown[] = [];
  if (estado && estado !== 'Todos') { where.push('estado = ?'); params.push(estado); }
  if (texto !== '%%') { where.push('(lower(id) like ? or lower(cliente) like ? or lower(ubicacion) like ?)'); params.push(texto, texto, texto); }
  const sql = `select * from reportes ${where.length ? `where ${where.join(' and ')}` : ''} order by fecha desc limit 100`;
  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ items: rows.results.map(rowToReport), total: rows.results.length });
});

app.post('/api/reportes', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const now = new Date().toISOString(); const year = new Date().getFullYear();
  const last = await c.env.DB.prepare('select id from reportes where id like ? order by id desc limit 1').bind(`RS-${year}-%`).first<{ id: string }>();
  const next = Number(last?.id?.match(/(\d{5})$/)?.[1] ?? 0) + 1;
  const rs = { id: `RS-${year}-${String(next).padStart(5, '0')}`, estado: 'Borrador', version: 1, fecha: now.slice(0, 10), cliente: '', contacto: '', correo: '', telefono: '', ubicacion: '', solicitadoPor: '', tipoVisita: 'Mantenimiento', horaLlegada: '', horaSalida: '', trabajoRealizado: '', observaciones: '', estadoActual: 'Operativo', recomendaciones: '', accionesPendientes: '', proximaVisita: false, equipos: [], materiales: [], personal: [], evidencias: [], supervisor: user.nombre, creadoPor: user.nombre, creadoEn: now, actualizadoEn: now };
  await saveReport(c.env.DB, rs, now);
  await c.env.DB.prepare('insert into timeline (id, reporte_id, tipo, actor, creado_en) values (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), rs.id, 'creado', user.nombre, now).run();
  return c.json(rs, 201);
});

app.get('/api/reportes/:id', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const row = await c.env.DB.prepare('select * from reportes where id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(rowToReport(row));
});

app.put('/api/reportes/:id', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const rs = await c.req.json(); const now = new Date().toISOString();
  if (!rs.creadoPor) rs.creadoPor = user.nombre;
  if (!rs.supervisor || rs.supervisor === 'Carlos Hernández') rs.supervisor = user.nombre;
  await saveReport(c.env.DB, rs, now);
  return c.json({ ok: true, actualizadoEn: now });
});

app.post('/api/reportes/:id/evidencias', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const row = await c.env.DB.prepare('select * from reportes where id = ?').bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const form = await c.req.formData(); const file = form.get('file') as File | string | null;
  if (!file || typeof file === 'string') return c.json({ error: 'missing_file' }, 400);
  const categoria = String(form.get('categoria') ?? 'Durante'); const descripcion = String(form.get('descripcion') ?? file.name);
  const id = crypto.randomUUID(); const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const prefix = c.env.R2_PREFIX || 'reportes'; const key = `${prefix}/${c.req.param('id')}/evidencias/${id}.${ext}`;
  await c.env.FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  await c.env.DB.prepare('insert into archivos (id, reporte_id, tipo, r2_key, creado_en) values (?, ?, ?, ?, ?)')
    .bind(id, c.req.param('id'), `foto:${categoria}`, key, new Date().toISOString()).run();
  const rs = rowToReport(row) as Record<string, any>; const evidencias = Array.isArray(rs.evidencias) ? rs.evidencias : [];
  rs.evidencias = [...evidencias, { id, categoria, descripcion, blobKey: key, orden: evidencias.length }];
  rs.actualizadoEn = new Date().toISOString();
  await saveReport(c.env.DB, rs, rs.actualizadoEn);
  await c.env.DB.prepare('insert into timeline (id, reporte_id, tipo, actor, nota, creado_en) values (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), c.req.param('id'), 'evidencia_agregada', user.nombre, descripcion, rs.actualizadoEn).run();
  return c.json({ ok: true, evidencia: rs.evidencias.at(-1) });
});

app.delete('/api/reportes/:id/evidencias/:evidenciaId', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const row = await c.env.DB.prepare('select * from reportes where id = ?').bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const rs = rowToReport(row) as Record<string, any>; const evidencias = Array.isArray(rs.evidencias) ? rs.evidencias : [];
  const evidencia = evidencias.find((x: { id: string; blobKey?: string }) => x.id === c.req.param('evidenciaId'));
  if (evidencia?.blobKey) await c.env.FILES.delete(evidencia.blobKey);
  rs.evidencias = evidencias.filter((x: { id: string }) => x.id !== c.req.param('evidenciaId'));
  rs.actualizadoEn = new Date().toISOString();
  await c.env.DB.prepare('delete from archivos where id = ?').bind(c.req.param('evidenciaId')).run();
  await saveReport(c.env.DB, rs, rs.actualizadoEn);
  return c.json({ ok: true });
});

app.post('/api/reportes/:id/pdf', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
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
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ destinatario: string; pdfKey: string }>(); const id = crypto.randomUUID();
  await c.env.DB.prepare('insert into entregas (id, reporte_id, destinatario, estado, creado_en) values (?, ?, ?, ?, ?)').bind(id, c.req.param('id'), body.destinatario, 'pendiente', new Date().toISOString()).run();
  if (c.env.N8N_WEBHOOK_URL) await fetch(c.env.N8N_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deliveryId: id, reporteId: c.req.param('id'), destinatario: body.destinatario, pdfKey: body.pdfKey }) });
  return c.json({ ok: true, deliveryId: id });
});

app.post('/api/entregas/:id/estado', async c => {
  const body = await c.req.json<{ estado: 'enviado' | 'fallido'; provider?: string; providerMessageId?: string; detalle?: string }>();
  if (!['enviado', 'fallido'].includes(body.estado)) return c.json({ error: 'invalid_estado' }, 400);
  await c.env.DB.prepare('update entregas set estado = ?, respuesta = ?, actualizado_en = ? where id = ?')
    .bind(body.estado, JSON.stringify({ provider: body.provider ?? 'slack', providerMessageId: body.providerMessageId ?? '', detalle: body.detalle ?? '' }), new Date().toISOString(), c.req.param('id')).run();
  return c.json({ ok: true });
});

async function requireUser(c: { req: { header(name: string): string | undefined }; env: Env }, role?: RolUsuario) {
  const header = c.req.header('authorization') ?? ''; const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const row = await c.env.DB.prepare(`select u.id, u.usuario, u.nombre, u.correo, u.telefono, u.rol, u.activo from sesiones s join usuarios u on u.id = s.usuario_id where s.token = ? and s.expira_en > ? and u.activo = 1`)
    .bind(token, new Date().toISOString()).first<Record<string, unknown>>();
  if (!row) return null;
  const user = rowToUser(row);
  if (role && user.rol !== role) return null;
  return user;
}
async function sha256(value: string) { const data = new TextEncoder().encode(value); const digest = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function rowToUser(row: Record<string, unknown>) { return { id: String(row.id), usuario: String(row.usuario), nombre: String(row.nombre), correo: String(row.correo), telefono: String(row.telefono ?? ''), rol: row.rol as RolUsuario, activo: Boolean(row.activo) }; }
function rowToReport(row: Record<string, unknown>) { const payload = row.payload_json ? JSON.parse(String(row.payload_json)) : {}; return { ...payload, id: row.id, estado: row.estado, version: row.version, fecha: row.fecha, cliente: row.cliente, contacto: row.contacto, correo: row.correo, telefono: row.telefono, ubicacion: row.ubicacion, ordenTrabajo: row.orden_trabajo, solicitadoPor: row.solicitado_por, tipoVisita: row.tipo_visita, horaLlegada: row.hora_llegada, horaSalida: row.hora_salida, trabajoRealizado: row.trabajo_realizado, observaciones: row.observaciones, estadoActual: row.estado_actual, recomendaciones: row.recomendaciones, accionesPendientes: row.acciones_pendientes, proximaVisita: Boolean(row.proxima_visita), fechaSeguimiento: row.fecha_seguimiento, supervisor: row.supervisor, creadoPor: row.creado_por, creadoEn: row.creado_en, actualizadoEn: row.actualizado_en, resumenEquipo: row.resumen_equipo }; }
async function saveReport(db: D1Database, rs: Record<string, any>, now: string) {
  await db.prepare(`insert into reportes (id, estado, version, fecha, cliente, contacto, correo, telefono, ubicacion, orden_trabajo, solicitado_por, tipo_visita, hora_llegada, hora_salida, trabajo_realizado, observaciones, estado_actual, recomendaciones, acciones_pendientes, proxima_visita, fecha_seguimiento, supervisor, creado_por, creado_en, actualizado_en, resumen_equipo, payload_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set estado=excluded.estado, version=reportes.version+1, fecha=excluded.fecha, cliente=excluded.cliente, contacto=excluded.contacto, correo=excluded.correo, telefono=excluded.telefono, ubicacion=excluded.ubicacion, orden_trabajo=excluded.orden_trabajo, solicitado_por=excluded.solicitado_por, tipo_visita=excluded.tipo_visita, hora_llegada=excluded.hora_llegada, hora_salida=excluded.hora_salida, trabajo_realizado=excluded.trabajo_realizado, observaciones=excluded.observaciones, estado_actual=excluded.estado_actual, recomendaciones=excluded.recomendaciones, acciones_pendientes=excluded.acciones_pendientes, proxima_visita=excluded.proxima_visita, fecha_seguimiento=excluded.fecha_seguimiento, supervisor=excluded.supervisor, actualizado_en=excluded.actualizado_en, resumen_equipo=excluded.resumen_equipo, payload_json=excluded.payload_json`)
    .bind(rs.id, rs.estado, rs.version ?? 1, rs.fecha, rs.cliente ?? '', rs.contacto ?? '', rs.correo ?? '', rs.telefono ?? '', rs.ubicacion ?? '', rs.ordenTrabajo ?? '', rs.solicitadoPor ?? '', rs.tipoVisita ?? '', rs.horaLlegada ?? '', rs.horaSalida ?? '', rs.trabajoRealizado ?? '', rs.observaciones ?? '', rs.estadoActual ?? '', rs.recomendaciones ?? '', rs.accionesPendientes ?? '', rs.proximaVisita ? 1 : 0, rs.fechaSeguimiento ?? '', rs.supervisor ?? '', rs.creadoPor ?? '', rs.creadoEn ?? now, now, rs.resumenEquipo ?? '', JSON.stringify(rs)).run();
}
function renderPdfHtml(rs: ReturnType<typeof rowToReport>) { return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#16181C;padding:32px}header{display:flex;justify-content:space-between;border-bottom:3px solid #C20E1A;padding-bottom:16px}h1{color:#C20E1A}.box{border:1px solid #ddd;border-radius:10px;padding:14px;margin:12px 0}.sig{height:90px;object-fit:contain}</style></head><body><header><div><h1>REPORTE DE SERVICIO</h1><strong>${rs.id}</strong></div><div>TAS Honduras</div></header><section class="box"><h2>${rs.cliente}</h2><p>${rs.ubicacion} · ${rs.fecha} · ${rs.tipoVisita}</p></section><section class="box"><h3>Trabajo realizado</h3><p>${rs.trabajoRealizado || ''}</p><h3>Observaciones</h3><p>${rs.observaciones || ''}</p></section>${rs.firma ? `<section class="box"><h3>Firma del cliente</h3><img class="sig" src="${rs.firma.trazo}"><p>${rs.firma.nombre} · ${rs.firma.cargo || ''}</p></section>` : ''}</body></html>`; }

export default app;
