import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { RolUsuario } from '../src/domain/types';

type Env = { DB: D1Database; FILES: R2Bucket; BROWSER: BrowserRun; APP_ORIGIN: string; N8N_WEBHOOK_URL: string; N8N_CALLBACK_SECRET?: string; R2_PREFIX: string; ODOO_URL?: string; ODOO_DB?: string; ODOO_USER?: string; ODOO_API_KEY?: string; ODOO_PASSWORD?: string; ASSETS: Fetcher };
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

app.get('/api/odoo/clientes', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ items: [] });
  try {
    const rows = await odooExecute(c.env, 'res.partner', 'search_read', [[
      '|', '|',
      ['name', 'ilike', q],
      ['email', 'ilike', q],
      ['phone', 'ilike', q]
    ]], {
      fields: ['id', 'name', 'email', 'phone', 'street', 'street2', 'city', 'parent_id', 'company_type', 'is_company'],
      limit: 12,
      order: 'is_company desc, name asc'
    }) as Record<string, unknown>[];
    return c.json({ items: rows.map(row => {
      const parent = Array.isArray(row.parent_id) ? row.parent_id : null;
      const isCompany = Boolean(row.is_company) || row.company_type === 'company';
      return {
        id: row.id,
        nombre: isCompany ? cleanOdoo(row.name) : (parent ? String(parent[1]) : cleanOdoo(row.name)),
        contacto: isCompany ? '' : cleanOdoo(row.name),
        correo: cleanOdoo(row.email),
        telefono: cleanOdoo(row.phone),
        ubicacion: [cleanOdoo(row.street), cleanOdoo(row.street2), cleanOdoo(row.city)].filter(Boolean).join(', '),
        tipo: isCompany ? 'empresa' : 'contacto'
      };
    }) });
  } catch (error) {
    return c.json({ error: 'odoo_clientes_failed', detail: error instanceof Error ? error.message : String(error), items: [] }, 502);
  }
});

app.get('/api/odoo/personal', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ items: [] });
  const rows = await odooExecute(c.env, 'hr.employee', 'search_read', [[
    '&',
    '|',
    ['job_title', 'ilike', 'Tecnico'],
    ['job_title', 'ilike', 'Ingeniero'],
    '|', '|',
    ['name', 'ilike', q],
    ['work_email', 'ilike', q],
    ['job_title', 'ilike', q]
  ]], {
    fields: ['id', 'name', 'work_email', 'work_phone', 'mobile_phone', 'job_title', 'department_id'],
    limit: 12,
    order: 'name asc'
  }) as Record<string, unknown>[];
  return c.json({ items: rows.map(row => ({
    id: row.id,
    nombre: cleanOdoo(row.name),
    correo: cleanOdoo(row.work_email),
    telefono: cleanOdoo(row.work_phone) || cleanOdoo(row.mobile_phone),
    puesto: cleanOdoo(row.job_title),
    departamento: Array.isArray(row.department_id) ? cleanOdoo(row.department_id[1]) : ''
  })) });
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

app.delete('/api/usuarios/:id', async c => {
  const user = await requireUser(c, 'admin'); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  if (id === user.id) return c.json({ error: 'cannot_delete_self' }, 400);
  await c.env.DB.prepare('delete from sesiones where usuario_id = ?').bind(id).run();
  await c.env.DB.prepare('delete from usuarios where id = ?').bind(id).run();
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
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const now = new Date().toISOString(); const year = new Date().getFullYear();
  const last = await c.env.DB.prepare('select id from reportes where id like ? order by id desc limit 1').bind(`RS-${year}-%`).first<{ id: string }>();
  const next = Number(last?.id?.match(/(\d{5})$/)?.[1] ?? 0) + 1;
  const rs = { id: `RS-${year}-${String(next).padStart(5, '0')}`, estado: 'Borrador', version: 1, fecha: now.slice(0, 10), cliente: '', contacto: '', correo: '', telefono: '', ubicacion: '', solicitadoPor: '', tipoVisita: 'Mantenimiento', horaLlegada: '', horaSalida: '', trabajoRealizado: '', observaciones: '', estadoActual: 'Operativo', recomendaciones: '', accionesPendientes: '', proximaVisita: false, equipos: [], materiales: [], personal: [], evidencias: [], supervisor: user.nombre, creadoPor: user.nombre, creadoEn: now, actualizadoEn: now, ...body };
  rs.id = `RS-${year}-${String(next).padStart(5, '0')}`;
  rs.estado = 'Borrador';
  rs.version = 1;
  rs.supervisor = user.nombre;
  rs.creadoPor = user.nombre;
  rs.creadoEn = now;
  rs.actualizadoEn = now;
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

app.delete('/api/reportes/:id', async c => {
  const user = await requireUser(c, 'admin'); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  const prefix = `${c.env.R2_PREFIX || 'reportes'}/${id}/`;
  let cursor: string | undefined;
  do {
    const listed = await c.env.FILES.list({ prefix, cursor });
    for (const obj of listed.objects) await c.env.FILES.delete(obj.key);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  await c.env.DB.prepare('delete from entregas where reporte_id = ?').bind(id).run();
  await c.env.DB.prepare('delete from archivos where reporte_id = ?').bind(id).run();
  await c.env.DB.prepare('delete from timeline where reporte_id = ?').bind(id).run();
  await c.env.DB.prepare('delete from reportes where id = ?').bind(id).run();
  return c.json({ ok: true });
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
  const pdf = await c.env.BROWSER.quickAction('pdf', { html, cacheTTL: 0, pdfOptions: { format: 'letter', printBackground: true, margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' } } });
  if (!pdf.ok) return c.json({ error: 'pdf_failed', detail: await pdf.text() }, 502);
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

app.get('/api/reportes/:id/entregas', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const rows = await c.env.DB.prepare('select id, reporte_id, destinatario, estado, respuesta, creado_en, actualizado_en from entregas where reporte_id = ? order by creado_en desc limit 20').bind(c.req.param('id')).all<Record<string, unknown>>();
  return c.json({ items: rows.results.map(row => ({
    id: String(row.id),
    reporteId: String(row.reporte_id),
    destinatario: String(row.destinatario ?? ''),
    estado: String(row.estado ?? 'pendiente'),
    respuesta: row.respuesta ? JSON.parse(String(row.respuesta)) : null,
    creadoEn: String(row.creado_en),
    actualizadoEn: row.actualizado_en ? String(row.actualizado_en) : ''
  })) });
});

app.post('/api/entregas/:id/estado', async c => {
  if (!c.env.N8N_CALLBACK_SECRET) return c.json({ error: 'callback_secret_not_configured' }, 503);
  if (!(await safeEqual(c.req.header('x-rs-callback-secret') ?? '', c.env.N8N_CALLBACK_SECRET))) return c.json({ error: 'unauthorized' }, 401);
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
async function odooExecute(env: Env, model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}) {
  if (!env.ODOO_URL || !env.ODOO_DB || !env.ODOO_USER || !(env.ODOO_API_KEY || env.ODOO_PASSWORD)) throw new Error('odoo_not_configured');
  const password = env.ODOO_API_KEY || env.ODOO_PASSWORD;
  const url = env.ODOO_URL.replace(/\/$/, '');
  const uid = await odooRpc<number>(url, 'common', 'authenticate', [env.ODOO_DB, env.ODOO_USER, password, {}]);
  if (!uid) throw new Error('odoo_auth_failed');
  return odooRpc(url, 'object', 'execute_kw', [env.ODOO_DB, uid, password, model, method, args, kwargs]);
}
async function odooRpc<T>(baseUrl: string, service: string, method: string, args: unknown[]): Promise<T> {
  const res = await fetch(`${baseUrl}/jsonrpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: crypto.randomUUID() })
  });
  const data = await res.json() as { result?: T; error?: { message?: string; data?: { message?: string } } };
  if (!res.ok || data.error) throw new Error(data.error?.data?.message || data.error?.message || `odoo_${res.status}`);
  return data.result as T;
}
function cleanOdoo(value: unknown) { return value && value !== false ? String(value) : ''; }
async function sha256(value: string) { const data = new TextEncoder().encode(value); const digest = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function safeEqual(a: string, b: string) {
  const [left, right] = await Promise.all([crypto.subtle.digest('SHA-256', new TextEncoder().encode(a)), crypto.subtle.digest('SHA-256', new TextEncoder().encode(b))]);
  const x = new Uint8Array(left); const y = new Uint8Array(right);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
function rowToUser(row: Record<string, unknown>) { return { id: String(row.id), usuario: String(row.usuario), nombre: String(row.nombre), correo: String(row.correo), telefono: String(row.telefono ?? ''), rol: row.rol as RolUsuario, activo: Boolean(row.activo) }; }
function rowToReport(row: Record<string, unknown>) { const payload = row.payload_json ? JSON.parse(String(row.payload_json)) : {}; return { ...payload, id: row.id, estado: row.estado, version: row.version, fecha: row.fecha, cliente: row.cliente, contacto: row.contacto, correo: row.correo, telefono: row.telefono, ubicacion: row.ubicacion, ordenTrabajo: row.orden_trabajo, solicitadoPor: row.solicitado_por, tipoVisita: row.tipo_visita, horaLlegada: row.hora_llegada, horaSalida: row.hora_salida, trabajoRealizado: row.trabajo_realizado, observaciones: row.observaciones, estadoActual: row.estado_actual, recomendaciones: row.recomendaciones, accionesPendientes: row.acciones_pendientes, proximaVisita: Boolean(row.proxima_visita), fechaSeguimiento: row.fecha_seguimiento, supervisor: row.supervisor, creadoPor: row.creado_por, creadoEn: row.creado_en, actualizadoEn: row.actualizado_en, resumenEquipo: row.resumen_equipo }; }
async function saveReport(db: D1Database, rs: Record<string, any>, now: string) {
  await db.prepare(`insert into reportes (id, estado, version, fecha, cliente, contacto, correo, telefono, ubicacion, orden_trabajo, solicitado_por, tipo_visita, hora_llegada, hora_salida, trabajo_realizado, observaciones, estado_actual, recomendaciones, acciones_pendientes, proxima_visita, fecha_seguimiento, supervisor, creado_por, creado_en, actualizado_en, resumen_equipo, payload_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set estado=excluded.estado, version=reportes.version+1, fecha=excluded.fecha, cliente=excluded.cliente, contacto=excluded.contacto, correo=excluded.correo, telefono=excluded.telefono, ubicacion=excluded.ubicacion, orden_trabajo=excluded.orden_trabajo, solicitado_por=excluded.solicitado_por, tipo_visita=excluded.tipo_visita, hora_llegada=excluded.hora_llegada, hora_salida=excluded.hora_salida, trabajo_realizado=excluded.trabajo_realizado, observaciones=excluded.observaciones, estado_actual=excluded.estado_actual, recomendaciones=excluded.recomendaciones, acciones_pendientes=excluded.acciones_pendientes, proxima_visita=excluded.proxima_visita, fecha_seguimiento=excluded.fecha_seguimiento, supervisor=excluded.supervisor, actualizado_en=excluded.actualizado_en, resumen_equipo=excluded.resumen_equipo, payload_json=excluded.payload_json`)
    .bind(rs.id, rs.estado, rs.version ?? 1, rs.fecha, rs.cliente ?? '', rs.contacto ?? '', rs.correo ?? '', rs.telefono ?? '', rs.ubicacion ?? '', rs.ordenTrabajo ?? '', rs.solicitadoPor ?? '', rs.tipoVisita ?? '', rs.horaLlegada ?? '', rs.horaSalida ?? '', rs.trabajoRealizado ?? '', rs.observaciones ?? '', rs.estadoActual ?? '', rs.recomendaciones ?? '', rs.accionesPendientes ?? '', rs.proximaVisita ? 1 : 0, rs.fechaSeguimiento ?? '', rs.supervisor ?? '', rs.creadoPor ?? '', rs.creadoEn ?? now, now, rs.resumenEquipo ?? '', JSON.stringify(rs)).run();
}
function renderPdfHtml(rs: ReturnType<typeof rowToReport>) {
  const equipos = Array.isArray(rs.equipos) ? rs.equipos : [];
  const materiales = Array.isArray(rs.materiales) ? rs.materiales : [];
  const personal = Array.isArray(rs.personal) ? rs.personal : [];
  const evidencias = Array.isArray(rs.evidencias) ? rs.evidencias : [];
  const row = (label: string, value: unknown) => `<div><span>${esc(label)}</span><strong>${esc(value || 'No registrado')}</strong></div>`;
  const empty = '<p class="muted">No registrado.</p>';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: letter; margin: 0.48in; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #16181C; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.4; }
    header { display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: start; border-bottom: 4px solid #C20E1A; padding-bottom: 14px; margin-bottom: 16px; }
    .brand { color: #C20E1A; font-weight: 900; font-size: 24px; letter-spacing: .04em; }
    .title { margin-top: 6px; font-size: 18px; font-weight: 900; }
    .rs { text-align: right; }
    .rs strong { display: block; font-size: 20px; color: #C20E1A; }
    .rs span, .muted, .meta span, th { color: #5B6470; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
    .grid div, section { border: 1px solid #E1E3E7; border-radius: 10px; padding: 10px; background: #fff; }
    .grid span { display: block; color: #5B6470; font-size: 9px; text-transform: uppercase; font-weight: 800; letter-spacing: .03em; }
    .grid strong { display: block; margin-top: 3px; font-size: 11px; }
    section { margin: 10px 0; break-inside: avoid; }
    h2 { margin: 0 0 8px; font-size: 13px; color: #C20E1A; text-transform: uppercase; letter-spacing: .04em; }
    h3 { margin: 8px 0 4px; font-size: 11px; }
    p { margin: 0 0 6px; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 9px; text-transform: uppercase; border-bottom: 1px solid #E1E3E7; padding: 6px 4px; }
    td { border-bottom: 1px solid #F1F2F4; padding: 7px 4px; vertical-align: top; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .badge { display: inline-block; border-radius: 999px; background: #FDEDED; color: #C20E1A; padding: 3px 8px; font-weight: 800; margin: 0 4px 4px 0; }
    .signature { height: 96px; object-fit: contain; max-width: 100%; border: 1px solid #E1E3E7; border-radius: 8px; padding: 6px; }
    footer { margin-top: 14px; border-top: 1px solid #E1E3E7; padding-top: 8px; color: #5B6470; font-size: 9px; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <header>
    <div><div class="brand">TAS HONDURAS</div><div class="title">REPORTE DE SERVICIO</div><p class="muted">Documento generado desde RS TAS.</p></div>
    <div class="rs"><strong>${esc(rs.id)}</strong><span>${esc(rs.estado)} · Versión ${esc(rs.version)}</span></div>
  </header>
  <div class="grid">
    ${row('Fecha', rs.fecha)}
    ${row('Tipo de visita', rs.tipoVisita)}
    ${row('Supervisor de campo', rs.supervisor)}
    ${row('Orden de trabajo', rs.ordenTrabajo)}
    ${row('Cliente', rs.cliente)}
    ${row('Contacto', rs.contacto)}
    ${row('Correo', rs.correo)}
    ${row('Teléfono', rs.telefono)}
    ${row('Ubicación', rs.ubicacion)}
    ${row('Solicitado por', rs.solicitadoPor)}
    ${row('Llegada', rs.horaLlegada)}
    ${row('Salida', rs.horaSalida)}
  </div>
  <section><h2>Trabajo realizado</h2><p>${esc(rs.trabajoRealizado || 'No registrado.')}</p><h3>Observaciones</h3><p>${esc(rs.observaciones || 'No registrado.')}</p><h3>Estado actual</h3><p>${esc(rs.estadoActual || 'No registrado.')}</p></section>
  <section><h2>Recomendaciones y pendientes</h2><div class="two"><div><h3>Recomendaciones</h3><p>${esc(rs.recomendaciones || 'No registrado.')}</p></div><div><h3>Acciones pendientes</h3><p>${esc(rs.accionesPendientes || 'No registrado.')}</p></div></div></section>
  <section><h2>Equipos intervenidos</h2>${equipos.length ? `<table><thead><tr><th>Equipo</th><th>Serie</th><th>Ubicación</th><th>Trabajo</th></tr></thead><tbody>${equipos.map((e: Record<string, unknown>) => `<tr><td><strong>${esc(e.nombre)}</strong><br>${esc([e.marca, e.modelo].filter(Boolean).join(' '))}</td><td>${esc(e.serie)}</td><td>${esc(e.ubicacion)}</td><td>${esc(e.trabajoRealizado)}</td></tr>`).join('')}</tbody></table>` : empty}</section>
  <section><h2>Materiales y repuestos</h2>${materiales.length ? `<table><thead><tr><th>Producto</th><th>Cantidad</th><th>Unidad</th><th>Uso</th></tr></thead><tbody>${materiales.map((m: Record<string, unknown>) => `<tr><td>${esc(m.producto)}</td><td>${esc(m.cantidad)}</td><td>${esc(m.unidad)}</td><td>${esc(m.uso)}</td></tr>`).join('')}</tbody></table>` : empty}</section>
  <section><h2>Personal participante</h2>${personal.length ? `<table><thead><tr><th>Nombre</th><th>Rol</th><th>Entrada</th><th>Salida</th></tr></thead><tbody>${personal.map((p: Record<string, unknown>) => `<tr><td>${esc(p.nombre)}</td><td>${esc(p.rol)}</td><td>${esc(p.horaEntrada)}</td><td>${esc(p.horaSalida)}</td></tr>`).join('')}</tbody></table>` : empty}</section>
  <section><h2>Evidencias fotográficas</h2>${evidencias.length ? evidencias.map((e: Record<string, unknown>) => `<span class="badge">${esc(e.categoria)}</span> ${esc(e.descripcion)}<br>`).join('') : empty}</section>
  <section><h2>Firma del cliente</h2>${rs.firma ? `<img class="signature" src="${esc(rs.firma.trazo)}"><p><strong>${esc(rs.firma.nombre)}</strong><br>${esc(rs.firma.cargo || '')}<br>${esc(new Date(rs.firma.firmadaEn).toLocaleString('es-HN'))}</p>` : '<p class="muted">Pendiente de firma.</p>'}</section>
  <footer><span>Generado por ${esc(rs.creadoPor || rs.supervisor)}</span><span>${esc(new Date().toLocaleString('es-HN'))}</span></footer>
</body>
</html>`;
}
function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

export default app;
