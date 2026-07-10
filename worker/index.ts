import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { RolUsuario } from '../src/domain/types';

type Env = { DB: D1Database; FILES: R2Bucket; BROWSER: BrowserRun; APP_ORIGIN: string; N8N_WEBHOOK_URL: string; N8N_USER_WEBHOOK_URL?: string; N8N_SAC_WEBHOOK_URL?: string; N8N_CALLBACK_SECRET?: string; R2_PREFIX: string; ODOO_URL?: string; ODOO_DB?: string; ODOO_USER?: string; ODOO_API_KEY?: string; ODOO_PASSWORD?: string; ASSETS: Fetcher };
const app = new Hono<{ Bindings: Env }>();
app.use('/api/*', async (c, next) => cors({ origin: c.env.APP_ORIGIN, credentials: true })(c, next));

app.get('/api/health', c => c.json({ ok: true, service: 'rs-tas', time: new Date().toISOString() }));

app.post('/api/auth/login', async c => {
  const body = await c.req.json<{ usuario: string; password: string }>();
  const usuario = body.usuario.trim().toLowerCase();
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  if (await isLoginLocked(c.env.DB, usuario, ip)) return c.json({ error: 'too_many_attempts' }, 429);
  const row = await c.env.DB.prepare('select id, usuario, nombre, correo, telefono, rol, activo, password_hash, must_change_password from usuarios where lower(usuario) = lower(?) and activo = 1')
    .bind(usuario).first<Record<string, unknown>>();
  if (!row) { await recordLoginAttempt(c.env.DB, usuario, ip, false); return c.json({ error: 'invalid_credentials' }, 401); }
  const verification = await verifyPassword(body.password, String(row.password_hash));
  if (!verification.ok) { await recordLoginAttempt(c.env.DB, usuario, ip, false); return c.json({ error: 'invalid_credentials' }, 401); }
  if (verification.needsUpgrade) await c.env.DB.prepare('update usuarios set password_hash = ? where id = ?').bind(await hashPassword(body.password), row.id).run();
  await recordLoginAttempt(c.env.DB, usuario, ip, true);
  await c.env.DB.prepare('delete from login_attempts where usuario = ? and ip = ?').bind(usuario, ip).run();
  const token = crypto.randomUUID(); const now = new Date(); const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14);
  await c.env.DB.prepare('insert into sesiones (token, usuario_id, creado_en, expira_en) values (?, ?, ?, ?)').bind(token, row.id, now.toISOString(), expires.toISOString()).run();
  return c.json({ user: rowToUser(row), token });
});

app.post('/api/auth/change-password', async c => {
  const header = c.req.header('authorization') ?? ''; const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ currentPassword: string; newPassword: string }>();
  if (!body.newPassword || body.newPassword.length < 10) return c.json({ error: 'weak_password' }, 400);
  const row = await c.env.DB.prepare(`select u.id, u.password_hash from sesiones s join usuarios u on u.id = s.usuario_id where s.token = ? and s.expira_en > ? and u.activo = 1`)
    .bind(token, new Date().toISOString()).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'unauthorized' }, 401);
  const verification = await verifyPassword(body.currentPassword, String(row.password_hash));
  if (!verification.ok) return c.json({ error: 'invalid_current_password' }, 401);
  await c.env.DB.prepare('update usuarios set password_hash = ?, must_change_password = 0 where id = ?').bind(await hashPassword(body.newPassword), row.id).run();
  await c.env.DB.prepare('delete from sesiones where usuario_id = ? and token <> ?').bind(row.id, token).run();
  return c.json({ ok: true });
});

app.get('/api/invitaciones/:token', async c => {
  const invite = await findInvite(c.env.DB, c.req.param('token'));
  if (!invite) return c.json({ error: 'invalid_invitation' }, 404);
  return c.json({ usuario: invite.usuario, nombre: invite.nombre, correo: invite.correo, rol: invite.rol, expiraEn: invite.expira_en });
});

app.post('/api/invitaciones/:token/aceptar', async c => {
  const invite = await findInvite(c.env.DB, c.req.param('token'));
  if (!invite) return c.json({ error: 'invalid_invitation' }, 404);
  const body = await c.req.json<{ password: string }>();
  if (!body.password || body.password.length < 10) return c.json({ error: 'weak_password' }, 400);
  const now = new Date().toISOString();
  await c.env.DB.prepare('update usuarios set password_hash = ?, must_change_password = 0, activo = 1 where id = ?').bind(await hashPassword(body.password), invite.usuario_id).run();
  await c.env.DB.prepare('update invitaciones set estado = ?, usado_en = ? where id = ?').bind('usada', now, invite.id).run();
  await c.env.DB.prepare('delete from sesiones where usuario_id = ?').bind(invite.usuario_id).run();
  return c.json({ ok: true, usuario: invite.usuario });
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
  const body = await c.req.json<{ usuario: string; nombre: string; correo: string; telefono?: string; rol: RolUsuario; password?: string; enviarInvitacion?: boolean }>();
  if (!body.usuario || !body.nombre || !body.correo || !body.rol) return c.json({ error: 'missing_fields' }, 400);
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const password = body.password?.trim() || generateTempPassword(); const hash = await hashPassword(password);
  const created = { id, usuario: body.usuario.trim().toLowerCase(), nombre: body.nombre.trim(), correo: body.correo.trim().toLowerCase(), telefono: body.telefono ?? '', rol: body.rol, activo: true };
  await c.env.DB.prepare('insert into usuarios (id, usuario, nombre, correo, telefono, rol, activo, password_hash, must_change_password, creado_en) values (?, ?, ?, ?, ?, ?, 1, ?, 1, ?)')
    .bind(created.id, created.usuario, created.nombre, created.correo, created.telefono, created.rol, hash, now).run();
  const invite = body.enviarInvitacion === false ? { sent: false, skipped: true } : await createAndSendInvite(c.env, created, user.nombre);
  return c.json({ ok: true, user: created, invite }, 201);
});

app.post('/api/usuarios/bulk', async c => {
  const admin = await requireUser(c, 'admin'); if (!admin) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ users: Array<{ usuario: string; nombre: string; correo: string; telefono?: string; rol?: RolUsuario; password?: string }>; enviarInvitacion?: boolean }>();
  if (!Array.isArray(body.users) || body.users.length === 0) return c.json({ error: 'missing_users' }, 400);
  if (body.users.length > 100) return c.json({ error: 'too_many_users', limit: 100 }, 400);
  const results = [];
  for (const input of body.users) {
    try {
      const usuario = input.usuario?.trim().toLowerCase();
      const nombre = input.nombre?.trim();
      const correo = input.correo?.trim().toLowerCase();
      const rol = input.rol || 'supervisor';
      if (!usuario || !nombre || !correo || !['admin', 'supervisor', 'sac'].includes(rol)) throw new Error('missing_or_invalid_fields');
      const id = crypto.randomUUID(); const now = new Date().toISOString(); const password = input.password?.trim() || generateTempPassword();
      const created = { id, usuario, nombre, correo, telefono: input.telefono?.trim() || '', rol: rol as RolUsuario, activo: true };
      await c.env.DB.prepare('insert into usuarios (id, usuario, nombre, correo, telefono, rol, activo, password_hash, must_change_password, creado_en) values (?, ?, ?, ?, ?, ?, 1, ?, 1, ?)')
        .bind(created.id, created.usuario, created.nombre, created.correo, created.telefono, created.rol, await hashPassword(password), now).run();
      const invite = body.enviarInvitacion === false ? { sent: false, skipped: true } : await createAndSendInvite(c.env, created, admin.nombre);
      results.push({ ok: true, usuario, correo, invite });
    } catch (error) {
      results.push({ ok: false, usuario: input.usuario ?? '', correo: input.correo ?? '', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return c.json({ ok: true, created: results.filter(x => x.ok).length, failed: results.filter(x => !x.ok).length, results });
});

app.put('/api/usuarios/:id', async c => {
  const user = await requireUser(c, 'admin'); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ nombre: string; correo: string; telefono?: string; rol: RolUsuario; activo: boolean; password?: string }>();
  if (body.password) {
    await c.env.DB.prepare('update usuarios set nombre = ?, correo = ?, telefono = ?, rol = ?, activo = ?, password_hash = ?, must_change_password = 1 where id = ?')
      .bind(body.nombre, body.correo, body.telefono ?? '', body.rol, body.activo ? 1 : 0, await hashPassword(body.password), c.req.param('id')).run();
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
  try {
    await c.env.DB.prepare('delete from sesiones where usuario_id = ?').bind(id).run();
    await c.env.DB.prepare('delete from invitaciones where usuario_id = ?').bind(id).run();
    const result = await c.env.DB.prepare('delete from usuarios where id = ?').bind(id).run();
    if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: 'delete_user_failed', detail: error instanceof Error ? error.message : String(error) }, 409);
  }
});

app.get('/api/reportes', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const estado = c.req.query('estado'); const texto = `%${(c.req.query('texto') ?? '').toLowerCase()}%`;
  const requestedLimit = Number(c.req.query('limit') ?? 100);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100) : 100;
  const where: string[] = []; const params: unknown[] = [];
  if (estado && estado !== 'Todos') { where.push('estado = ?'); params.push(estado); }
  if (texto !== '%%') { where.push('(lower(id) like ? or lower(cliente) like ? or lower(ubicacion) like ?)'); params.push(texto, texto, texto); }
  if (user.rol !== 'admin' && user.rol !== 'sac') { where.push('(supervisor = ? or creado_por = ?)'); params.push(user.nombre, user.nombre); }
  const sql = `select * from reportes ${where.length ? `where ${where.join(' and ')}` : ''} order by fecha desc limit ?`;
  const rows = await c.env.DB.prepare(sql).bind(...params, limit).all();
  return c.json({ items: rows.results.map(rowToReport), total: rows.results.length });
});

app.get('/api/clientes/resumen', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const texto = (c.req.query('q') ?? '').trim().toLowerCase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (texto) { where.push('lower(cliente) like ?'); params.push(`%${texto}%`); }
  if (user.rol !== 'admin' && user.rol !== 'sac') { where.push('(supervisor = ? or creado_por = ?)'); params.push(user.nombre, user.nombre); }
  const rows = await c.env.DB.prepare(`select * from reportes ${where.length ? `where ${where.join(' and ')}` : ''} order by fecha desc limit 500`).bind(...params).all<Record<string, unknown>>();
  const map = new Map<string, ReturnType<typeof buildClientSummary>>();
  for (const row of rows.results) {
    const rs = rowToReport(row) as Record<string, any>;
    const key = String(rs.cliente || 'Sin cliente').trim().toLowerCase();
    const current = map.get(key) ?? buildClientSummary(rs);
    appendClientReport(current, rs);
    map.set(key, current);
  }
  return c.json({ items: [...map.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo)) });
});

app.get('/api/metricas/resumen', async c => {
  const user = await requireUser(c); if (!user || !canReviewSac(user)) return c.json({ error: 'unauthorized' }, 401);
  const range = metricsDateRange(c.req.query('periodo'), c.req.query('desde'), c.req.query('hasta'));
  const filters = {
    ciudad: (c.req.query('ciudad') ?? '').trim(),
    supervisor: (c.req.query('supervisor') ?? '').trim(),
    cliente: (c.req.query('cliente') ?? '').trim()
  };

  const optionRows = await c.env.DB.prepare('select cliente, supervisor from reportes where fecha >= ? and fecha <= ? order by fecha desc limit 20000').bind(range.desde, range.hasta).all<Record<string, unknown>>();
  const optionClientes = uniqueOptions(optionRows.results.map(row => String(row.cliente ?? '')));
  const optionSupervisores = uniqueOptions(optionRows.results.map(row => String(row.supervisor ?? '')));
  const reportWhere = ['fecha >= ?', 'fecha <= ?']; const reportParams: unknown[] = [range.desde, range.hasta];
  if (filters.supervisor) { reportWhere.push('lower(supervisor) like ?'); reportParams.push(`%${filters.supervisor.toLowerCase()}%`); }
  if (filters.cliente) { reportWhere.push('lower(cliente) like ?'); reportParams.push(`%${filters.cliente.toLowerCase()}%`); }
  const reportRows = await c.env.DB.prepare(`select * from reportes where ${reportWhere.join(' and ')} order by fecha desc limit 20000`).bind(...reportParams).all<Record<string, unknown>>();
  let reports = reportRows.results.map(row => rowToReport(row) as Record<string, any>);
  if (filters.ciudad) {
    const city = filters.ciudad.toLowerCase();
    reports = reports.filter(rs => String(rs.ciudad ?? '').toLowerCase().includes(city));
  }

  const hoursWhere = ['fecha >= ?', 'fecha <= ?']; const hoursParams: unknown[] = [range.desde, range.hasta];
  if (filters.supervisor) { hoursWhere.push('lower(supervisor) like ?'); hoursParams.push(`%${filters.supervisor.toLowerCase()}%`); }
  if (filters.cliente) { hoursWhere.push('lower(cliente) like ?'); hoursParams.push(`%${filters.cliente.toLowerCase()}%`); }
  if (filters.ciudad) { hoursWhere.push('lower(ciudad) like ?'); hoursParams.push(`%${filters.ciudad.toLowerCase()}%`); }
  let hoursWarning = '';
  let hourRows: { results: Record<string, unknown>[] } = { results: [] };
  try {
    hourRows = await c.env.DB.prepare(`select * from horas_personal_sac where ${hoursWhere.join(' and ')} order by fecha desc limit 20000`).bind(...hoursParams).all<Record<string, unknown>>();
  } catch (error) {
    hoursWarning = error instanceof Error ? error.message : String(error);
  }
  const hours = hourRows.results;

  const estado = new Map<string, number>(); const ciudad = new Map<string, number>(); const supervisor = new Map<string, number>(); const tipoVisita = new Map<string, number>();
  const pendingClients = new Map<string, number>(); const retrabajoClient = new Map<string, number>(); const retrabajoSupervisor = new Map<string, number>();
  for (const rs of reports) {
    addMetric(estado, rs.estado || 'Sin estado');
    addMetric(ciudad, rs.ciudad || 'Sin ciudad');
    addMetric(supervisor, rs.supervisor || 'Sin supervisor');
    addMetric(tipoVisita, rs.tipoVisita || 'Sin tipo');
    if (rs.accionesPendientes || rs.proximaVisita || rs.recomendaciones) addMetric(pendingClients, rs.cliente || 'Sin cliente');
  }
  const employeeMap = new Map<string, { empleado: string; rol: string; reportes: Set<string>; horasTotales: number; horasNormales: number; horasExtra: number; horasRetrabajo: number; horasFueraHorario: number }>();
  const retrabajoReports = new Set<string>();
  let horasTotales = 0; let horasNormales = 0; let horasExtra = 0; let horasRetrabajo = 0; let horasFueraHorario = 0;
  for (const row of hours) {
    const empleado = String(row.empleado_nombre ?? 'Sin empleado');
    const current = employeeMap.get(empleado) ?? { empleado, rol: String(row.rol ?? ''), reportes: new Set<string>(), horasTotales: 0, horasNormales: 0, horasExtra: 0, horasRetrabajo: 0, horasFueraHorario: 0 };
    const total = Number(row.horas_totales ?? 0); const normal = Number(row.horas_normales ?? 0); const extra = Number(row.horas_extra ?? 0); const retrabajo = Number(row.horas_retrabajo ?? 0); const fuera = Number(row.horas_fuera_horario ?? 0);
    current.reportes.add(String(row.reporte_id ?? ''));
    current.horasTotales += total; current.horasNormales += normal; current.horasExtra += extra; current.horasRetrabajo += retrabajo; current.horasFueraHorario += fuera;
    employeeMap.set(empleado, current);
    horasTotales += total; horasNormales += normal; horasExtra += extra; horasRetrabajo += retrabajo; horasFueraHorario += fuera;
    if (retrabajo > 0) {
      retrabajoReports.add(String(row.reporte_id ?? ''));
      addMetric(retrabajoClient, String(row.cliente ?? 'Sin cliente'), retrabajo);
      addMetric(retrabajoSupervisor, String(row.supervisor ?? 'Sin supervisor'), retrabajo);
    }
  }
  const empleados = [...employeeMap.values()].map(row => ({
    empleado: row.empleado,
    rol: row.rol,
    reportes: row.reportes.size,
    horasTotales: roundMetric(row.horasTotales),
    horasNormales: roundMetric(row.horasNormales),
    horasExtra: roundMetric(row.horasExtra),
    horasRetrabajo: roundMetric(row.horasRetrabajo),
    horasFueraHorario: roundMetric(row.horasFueraHorario)
  }));
  const clientes = new Set(reports.map(rs => String(rs.cliente || '').trim().toLowerCase()).filter(Boolean));
  const pendientes = reports.filter(rs => rs.accionesPendientes || rs.proximaVisita || rs.recomendaciones);

  return c.json({
    periodo: range,
    filtros: filters,
    opciones: { clientes: optionClientes, supervisores: optionSupervisores },
    warnings: hoursWarning ? [`No se pudieron leer horas SAC: ${hoursWarning}`] : [],
    operacion: {
      totalRs: reports.length,
      firmados: reports.filter(rs => rs.estado === 'Firmado').length,
      borradores: reports.filter(rs => rs.estado === 'Borrador').length,
      pendientesFirma: reports.filter(rs => rs.estado === 'Pendiente de firma').length,
      enRevision: reports.filter(rs => rs.estado === 'En revisión').length,
      promedioHorasPorRs: roundMetric(horasTotales / Math.max(1, new Set(hours.map(row => String(row.reporte_id ?? ''))).size || reports.length || 1)),
      porEstado: metricRows(estado),
      porCiudad: metricRows(ciudad),
      porSupervisor: metricRows(supervisor),
      porTipoVisita: metricRows(tipoVisita)
    },
    sac: {
      horasTotales: roundMetric(horasTotales),
      horasNormales: roundMetric(horasNormales),
      horasExtra: roundMetric(horasExtra),
      horasRetrabajo: roundMetric(horasRetrabajo),
      horasFueraHorario: roundMetric(horasFueraHorario),
      empleados: empleados.length,
      topHorasExtra: employeesBy(empleados, 'horasExtra'),
      topRetrabajo: employeesBy(empleados, 'horasRetrabajo'),
      topHorasTotales: employeesBy(empleados, 'horasTotales')
    },
    calidad: {
      rsConRetrabajo: retrabajoReports.size,
      porcentajeRetrabajo: roundMetric((retrabajoReports.size / Math.max(1, reports.length)) * 100),
      retrabajosPorCliente: metricRows(retrabajoClient),
      retrabajosPorSupervisor: metricRows(retrabajoSupervisor)
    },
    clientes: {
      clientesAtendidos: clientes.size,
      clientesConPendientes: pendingClients.size,
      pendientes: pendientes.length,
      proximasVisitas: reports.filter(rs => rs.proximaVisita).length,
      topClientesPendientes: metricRows(pendingClients)
    },
    recientes: reports.slice(0, 10).map(rs => ({ id: rs.id, fecha: rs.fecha, cliente: rs.cliente, estado: rs.estado, ciudad: rs.ciudad || '', supervisor: rs.supervisor || '' }))
  });
});

app.get('/api/sac/revisiones', async c => {
  const user = await requireUser(c); if (!user || !canReviewSac(user)) return c.json({ error: 'unauthorized' }, 401);
  const estado = c.req.query('estado');
  const where = estado === 'pendiente' ? "where p.estado = 'Firmado' and coalesce(r.estado, 'pendiente') = 'pendiente'" : estado === 'revisado' ? "where p.estado = 'Firmado' and r.estado = 'revisado'" : "where p.estado = 'Firmado'";
  const rows = await c.env.DB.prepare(`select p.*, r.estado as sac_estado, r.es_retrabajo, r.horas_extra_aprobadas, r.requiere_seguimiento, r.comentario, r.horas_totales, r.horas_fuera_horario, r.horas_retrabajo, r.horas_extra, r.horas_normales, r.revisado_por, r.revisado_en, r.actualizado_en as sac_actualizado_en from reportes p left join revisiones_sac r on r.reporte_id = p.id ${where} order by p.fecha desc limit 100`).all<Record<string, unknown>>();
  const items = await Promise.all(rows.results.map(async row => {
    const rs = rowToReport(row);
    const calculated = calculateHours(rs as Record<string, any>, null);
    const revision = rowToSacReview(row, calculated);
    return { reporte: rs, revision: { ...revision, empleados: await loadSacEmployeeHours(c.env.DB, rs as Record<string, any>) } };
  }));
  return c.json({ items });
});

app.get('/api/sac/horas', async c => {
  const user = await requireUser(c); if (!user || !canReviewSac(user)) return c.json({ error: 'unauthorized' }, 401);
  const where: string[] = []; const params: unknown[] = [];
  const like = (field: string, value: string | undefined) => { if (value?.trim()) { where.push(`lower(${field}) like ?`); params.push(`%${value.trim().toLowerCase()}%`); } };
  like('empleado_nombre', c.req.query('empleado'));
  like('cliente', c.req.query('cliente'));
  like('supervisor', c.req.query('supervisor'));
  like('ciudad', c.req.query('ciudad'));
  if (c.req.query('desde')) { where.push('fecha >= ?'); params.push(c.req.query('desde')); }
  if (c.req.query('hasta')) { where.push('fecha <= ?'); params.push(c.req.query('hasta')); }
  if (c.req.query('tipo') === 'extra') where.push('horas_extra > 0');
  if (c.req.query('tipo') === 'retrabajo') where.push('horas_retrabajo > 0');
  const clause = where.length ? `where ${where.join(' and ')}` : '';
  const summary = await c.env.DB.prepare(`select empleado_nombre, rol, count(distinct reporte_id) as reportes, sum(horas_totales) as horas_totales, sum(horas_normales) as horas_normales, sum(horas_extra) as horas_extra, sum(horas_retrabajo) as horas_retrabajo, sum(horas_fuera_horario) as horas_fuera_horario, max(fecha) as ultima_fecha from horas_personal_sac ${clause} group by empleado_nombre, rol order by empleado_nombre asc`).bind(...params).all<Record<string, unknown>>();
  const detail = await c.env.DB.prepare(`select reporte_id, empleado_nombre, rol, fecha, cliente, ciudad, supervisor, hora_entrada, hora_salida, horas_totales, horas_fuera_horario, horas_normales, horas_extra, horas_retrabajo, es_retrabajo, horas_extra_aprobadas, actualizado_en from horas_personal_sac ${clause} order by fecha desc, empleado_nombre asc limit 1000`).bind(...params).all<Record<string, unknown>>();
  return c.json({
    items: summary.results.map(row => ({ empleado: String(row.empleado_nombre), rol: String(row.rol ?? ''), reportes: Number(row.reportes ?? 0), horasTotales: Number(row.horas_totales ?? 0), horasNormales: Number(row.horas_normales ?? 0), horasExtra: Number(row.horas_extra ?? 0), horasRetrabajo: Number(row.horas_retrabajo ?? 0), horasFueraHorario: Number(row.horas_fuera_horario ?? 0), ultimaFecha: String(row.ultima_fecha ?? '') })),
    rows: detail.results.map(row => ({ reporteId: String(row.reporte_id), empleado: String(row.empleado_nombre), rol: String(row.rol ?? ''), fecha: String(row.fecha ?? ''), cliente: String(row.cliente ?? ''), ciudad: String(row.ciudad ?? ''), supervisor: String(row.supervisor ?? ''), horaEntrada: String(row.hora_entrada ?? ''), horaSalida: String(row.hora_salida ?? ''), horasTotales: Number(row.horas_totales ?? 0), horasFueraHorario: Number(row.horas_fuera_horario ?? 0), horasNormales: Number(row.horas_normales ?? 0), horasExtra: Number(row.horas_extra ?? 0), horasRetrabajo: Number(row.horas_retrabajo ?? 0), esRetrabajo: Boolean(row.es_retrabajo), horasExtraAprobadas: Boolean(row.horas_extra_aprobadas), actualizadoEn: String(row.actualizado_en ?? '') }))
  });
});

app.get('/api/sac/seguimientos', async c => {
  const user = await requireUser(c); if (!user || !canReviewSac(user)) return c.json({ error: 'unauthorized' }, 401);
  const tipo = (c.req.query('tipo') ?? 'todos').trim();
  const estado = (c.req.query('estado') ?? 'activo').trim();
  const ciudad = (c.req.query('ciudad') ?? '').trim().toLowerCase();
  const cliente = (c.req.query('cliente') ?? '').trim().toLowerCase();
  const desde = c.req.query('desde');
  const hasta = c.req.query('hasta');
  const where: string[] = []; const params: unknown[] = [];
  if (desde) { where.push('fecha >= ?'); params.push(desde); }
  if (hasta) { where.push('fecha <= ?'); params.push(hasta); }
  if (cliente) { where.push('lower(cliente) like ?'); params.push(`%${cliente}%`); }
  const rows = await c.env.DB.prepare(`select * from reportes ${where.length ? `where ${where.join(' and ')}` : ''} order by fecha desc limit 1000`).bind(...params).all<Record<string, unknown>>();
  const retrabajos = await c.env.DB.prepare('select reporte_id, horas_retrabajo, horas_extra, comentario, revisado_por, revisado_en from revisiones_sac where es_retrabajo = 1 or horas_retrabajo > 0 order by revisado_en desc limit 1000').all<Record<string, unknown>>();
  const retrabajoMap = new Map(retrabajos.results.map(row => [String(row.reporte_id), row]));
  const stateRows = await c.env.DB.prepare('select id, estado, nota, actualizado_por, actualizado_en from seguimientos_sac').all<Record<string, unknown>>();
  const stateMap = new Map(stateRows.results.map(row => [String(row.id), row]));
  const items: Array<Record<string, unknown>> = [];
  const addFollowup = (item: Record<string, unknown>) => {
    const saved = stateMap.get(String(item.id));
    const estadoSeguimiento = String(saved?.estado ?? 'activo');
    if (estado !== 'todos' && estadoSeguimiento !== estado) return;
    items.push({ ...item, estadoSeguimiento, notaSeguimiento: saved?.nota ?? '', actualizadoPor: saved?.actualizado_por ?? '', actualizadoEn: saved?.actualizado_en ?? '' });
  };
  for (const row of rows.results) {
    const rs = rowToReport(row) as Record<string, any>;
    if (ciudad && !String(rs.ciudad ?? '').toLowerCase().includes(ciudad)) continue;
    const base = { reporteId: rs.id, fecha: rs.fecha, cliente: rs.cliente, ciudad: rs.ciudad || '', supervisor: rs.supervisor || '', estado: rs.estado };
    if (meaningfulFollowupText(rs.accionesPendientes)) addFollowup({ ...base, id: `${rs.id}:acciones`, tipo: 'acciones', prioridad: 'alta', titulo: 'Acciones pendientes', detalle: rs.accionesPendientes, fechaCompromiso: rs.fechaSeguimiento || '' });
    if (meaningfulFollowupText(rs.recomendaciones)) addFollowup({ ...base, id: `${rs.id}:recomendaciones`, tipo: 'recomendaciones', prioridad: 'media', titulo: 'Recomendación registrada', detalle: rs.recomendaciones, fechaCompromiso: rs.fechaSeguimiento || '' });
    if (rs.proximaVisita) addFollowup({ ...base, id: `${rs.id}:proxima`, tipo: 'proxima_visita', prioridad: 'alta', titulo: 'Próxima visita requerida', detalle: rs.fechaSeguimiento ? `Fecha sugerida: ${rs.fechaSeguimiento}` : 'Sin fecha definida', fechaCompromiso: rs.fechaSeguimiento || '' });
    const retrabajo = retrabajoMap.get(String(rs.id));
    if (retrabajo) addFollowup({ ...base, id: `${rs.id}:retrabajo`, tipo: 'retrabajo', prioridad: 'alta', titulo: 'RS marcado con retrabajo', detalle: `${Number(retrabajo.horas_retrabajo ?? 0)} h retrabajo · ${String(retrabajo.comentario ?? '')}`.trim(), fechaCompromiso: '', revisadoPor: retrabajo.revisado_por ?? '', revisadoEn: retrabajo.revisado_en ?? '' });
  }
  const filtered = tipo === 'todos' ? items : items.filter(item => item.tipo === tipo);
  const clientes = uniqueOptions(rows.results.map(row => String(row.cliente ?? '')));
  return c.json({ items: filtered.slice(0, 500), opciones: { clientes }, total: filtered.length });
});

app.put('/api/sac/seguimientos/:id', async c => {
  const user = await requireUser(c); if (!user || !canReviewSac(user)) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ estado: 'activo' | 'hecho' | 'archivado'; nota?: string; reporteId?: string; tipo?: string }>();
  if (!['activo', 'hecho', 'archivado'].includes(body.estado)) return c.json({ error: 'invalid_estado' }, 400);
  const id = c.req.param('id');
  const reporteId = body.reporteId || id.split(':')[0];
  const tipo = body.tipo || id.split(':')[1] || 'seguimiento';
  const now = new Date().toISOString();
  await c.env.DB.prepare(`insert into seguimientos_sac (id, reporte_id, tipo, estado, nota, actualizado_por, actualizado_en)
    values (?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set estado=excluded.estado, nota=excluded.nota, actualizado_por=excluded.actualizado_por, actualizado_en=excluded.actualizado_en`)
    .bind(id, reporteId, tipo, body.estado, body.nota ?? '', user.nombre, now).run();
  await c.env.DB.prepare('insert into timeline (id, reporte_id, tipo, actor, nota, creado_en) values (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), reporteId, `seguimiento_${body.estado}`, user.nombre, `${tipo}: ${body.nota ?? ''}`.trim(), now).run();
  return c.json({ ok: true, id, estado: body.estado, actualizadoPor: user.nombre, actualizadoEn: now });
});

app.put('/api/sac/revisiones/:id', async c => {
  const user = await requireUser(c); if (!user || !canReviewSac(user)) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('select * from reportes where id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const rs = rowToReport(row) as Record<string, any>;
  const body = await c.req.json<{ empleados?: Array<{ nombre: string; horasExtra?: number; horasRetrabajo?: number }>; comentario?: string }>();
  const employeeHours = calculateEmployeeHours(rs, body.empleados ?? []);
  const hours = aggregateEmployeeHours(employeeHours);
  const esRetrabajo = hours.horasRetrabajo > 0;
  const horasExtraAprobadas = hours.horasExtra > 0;
  const now = new Date().toISOString();
  await c.env.DB.prepare(`insert into revisiones_sac (reporte_id, estado, es_retrabajo, horas_extra_aprobadas, requiere_seguimiento, comentario, horas_totales, horas_fuera_horario, horas_retrabajo, horas_extra, horas_normales, revisado_por, revisado_en, actualizado_en)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(reporte_id) do update set estado=excluded.estado, es_retrabajo=excluded.es_retrabajo, horas_extra_aprobadas=excluded.horas_extra_aprobadas, requiere_seguimiento=excluded.requiere_seguimiento, comentario=excluded.comentario, horas_totales=excluded.horas_totales, horas_fuera_horario=excluded.horas_fuera_horario, horas_retrabajo=excluded.horas_retrabajo, horas_extra=excluded.horas_extra, horas_normales=excluded.horas_normales, revisado_por=excluded.revisado_por, revisado_en=excluded.revisado_en, actualizado_en=excluded.actualizado_en`)
    .bind(id, 'revisado', esRetrabajo ? 1 : 0, horasExtraAprobadas ? 1 : 0, 0, body.comentario ?? '', hours.horasTotales, hours.horasFueraHorario, hours.horasRetrabajo, hours.horasExtra, hours.horasNormales, user.nombre, now, now).run();
  await saveSacEmployeeHours(c.env.DB, rs, employeeHours, esRetrabajo, horasExtraAprobadas, false, now);
  await c.env.DB.prepare('insert into timeline (id, reporte_id, tipo, actor, nota, creado_en) values (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), id, 'revision_sac', user.nombre, esRetrabajo ? 'Revisión SAC con horas de retrabajo' : 'Revisión SAC completada', now).run();
  if (c.env.N8N_SAC_WEBHOOK_URL) {
    await fetch(c.env.N8N_SAC_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'revision_sac', reporteId: id, cliente: rs.cliente, fecha: rs.fecha, ciudad: rs.ciudad || '', supervisor: rs.supervisor, esRetrabajo, horasExtraAprobadas, requiereSeguimiento: false, comentario: body.comentario ?? '', horas: hours, empleados: employeeHours, revisadoPor: user.nombre, revisadoEn: now }) });
  }
  return c.json({ ok: true, revision: { reporteId: id, estado: 'revisado', esRetrabajo, horasExtraAprobadas, requiereSeguimiento: false, comentario: body.comentario ?? '', ...hours, empleados: employeeHours, revisadoPor: user.nombre, revisadoEn: now, actualizadoEn: now } });
});

app.post('/api/reportes', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  if (user.rol === 'sac') return c.json({ error: 'forbidden' }, 403);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const now = new Date().toISOString(); const year = new Date().getFullYear();
  const last = await c.env.DB.prepare('select id from reportes where id like ? order by id desc limit 1').bind(`RS-${year}-%`).first<{ id: string }>();
  const next = Number(last?.id?.match(/(\d{5})$/)?.[1] ?? 0) + 1;
  const rs = { id: `RS-${year}-${String(next).padStart(5, '0')}`, estado: 'Borrador', version: 1, fecha: now.slice(0, 10), cliente: '', contacto: '', correo: '', telefono: '', ciudad: 'San Pedro Sula', ubicacion: '', solicitadoPor: '', tipoVisita: 'Mantenimiento', horaLlegada: '', horaSalida: '', trabajoRealizado: '', observaciones: '', estadoActual: 'Operativo', recomendaciones: '', accionesPendientes: '', proximaVisita: false, equipos: [], materiales: [], personal: [], evidencias: [], supervisor: user.nombre, creadoPor: user.nombre, creadoEn: now, actualizadoEn: now, ...body };
  rs.id = `RS-${year}-${String(next).padStart(5, '0')}`;
  rs.estado = 'Borrador';
  rs.version = 1;
  rs.supervisor = user.nombre;
  rs.creadoPor = user.nombre;
  rs.creadoEn = now;
  rs.actualizadoEn = now;
  stampSignature(c, rs, now);
  syncSignedStatus(rs);
  await saveReport(c.env.DB, rs, now);
  await c.env.DB.prepare('insert into timeline (id, reporte_id, tipo, actor, creado_en) values (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), rs.id, 'creado', user.nombre, now).run();
  return c.json(rs, 201);
});

app.get('/api/reportes/:id', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const row = await c.env.DB.prepare('select * from reportes where id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (!canAccessReport(user, row)) return c.json({ error: 'forbidden' }, 403);
  return c.json(rowToReport(row));
});

app.put('/api/reportes/:id', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  if (user.rol === 'sac') return c.json({ error: 'forbidden' }, 403);
  const rs = await c.req.json(); const now = new Date().toISOString();
  const previous = await c.env.DB.prepare('select * from reportes where id = ?').bind(c.req.param('id')).first<Record<string, unknown>>();
  const previousReport = previous ? rowToReport(previous) as Record<string, any> : null;
  if (previous && !canAccessReport(user, previous)) return c.json({ error: 'forbidden' }, 403);
  if (!rs.creadoPor) rs.creadoPor = user.nombre;
  if (!rs.supervisor || rs.supervisor === 'Carlos Hernández') rs.supervisor = user.nombre;
  stampSignature(c, rs, now);
  syncSignedStatus(rs);
  if (previousReport && isLockedReportEdit(previousReport, rs)) return c.json({ error: 'report_locked_by_signature' }, 409);
  await saveReport(c.env.DB, rs, now);
  if (previous?.estado && previous.estado !== rs.estado) {
    await c.env.DB.prepare('insert into timeline (id, reporte_id, tipo, actor, nota, creado_en) values (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), rs.id, rs.estado.toLowerCase().replaceAll(' ', '_'), user.nombre, `Estado cambiado de ${previous.estado} a ${rs.estado}`, now).run();
  }
  return c.json({ ok: true, actualizadoEn: now });
});

app.get('/api/reportes/:id/timeline', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const report = await c.env.DB.prepare('select supervisor, creado_por from reportes where id = ?').bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!report) return c.json({ error: 'not_found' }, 404);
  if (!canAccessReport(user, report)) return c.json({ error: 'forbidden' }, 403);
  const rows = await c.env.DB.prepare('select id, reporte_id, tipo, actor, nota, creado_en from timeline where reporte_id = ? order by creado_en asc').bind(c.req.param('id')).all<Record<string, unknown>>();
  return c.json({ items: rows.results.map(row => ({ id: String(row.id), rsId: String(row.reporte_id), tipo: String(row.tipo), actor: String(row.actor), nota: row.nota ? String(row.nota) : undefined, fecha: String(row.creado_en) })) });
});

app.delete('/api/reportes/:id', async c => {
  const user = await requireUser(c, 'admin'); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('select * from reportes where id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const rs = rowToReport(row) as Record<string, any>;
  if (rs.estado !== 'Borrador' || hasAnySignature(rs)) return c.json({ error: 'report_delete_locked' }, 409);
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
  if (user.rol === 'sac') return c.json({ error: 'forbidden' }, 403);
  const row = await c.env.DB.prepare('select * from reportes where id = ?').bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (!canAccessReport(user, row)) return c.json({ error: 'forbidden' }, 403);
  const rs = rowToReport(row) as Record<string, any>;
  if (hasAnySignature(rs)) return c.json({ error: 'report_locked_by_signature' }, 409);
  const form = await c.req.formData(); const file = form.get('file') as File | string | null;
  if (!file || typeof file === 'string') return c.json({ error: 'missing_file' }, 400);
  const categoria = String(form.get('categoria') ?? 'Durante'); const descripcion = String(form.get('descripcion') ?? file.name);
  const id = crypto.randomUUID(); const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const prefix = c.env.R2_PREFIX || 'reportes'; const key = `${prefix}/${c.req.param('id')}/evidencias/${id}.${ext}`;
  await c.env.FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  await c.env.DB.prepare('insert into archivos (id, reporte_id, tipo, r2_key, creado_en) values (?, ?, ?, ?, ?)')
    .bind(id, c.req.param('id'), `foto:${categoria}`, key, new Date().toISOString()).run();
  const evidencias = Array.isArray(rs.evidencias) ? rs.evidencias : [];
  rs.evidencias = [...evidencias, { id, categoria, descripcion, blobKey: key, orden: evidencias.length }];
  rs.actualizadoEn = new Date().toISOString();
  await saveReport(c.env.DB, rs, rs.actualizadoEn);
  await c.env.DB.prepare('insert into timeline (id, reporte_id, tipo, actor, nota, creado_en) values (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), c.req.param('id'), 'evidencia_agregada', user.nombre, descripcion, rs.actualizadoEn).run();
  return c.json({ ok: true, evidencia: rs.evidencias.at(-1) });
});

app.delete('/api/reportes/:id/evidencias/:evidenciaId', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  if (user.rol === 'sac') return c.json({ error: 'forbidden' }, 403);
  const row = await c.env.DB.prepare('select * from reportes where id = ?').bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (!canAccessReport(user, row)) return c.json({ error: 'forbidden' }, 403);
  const rs = rowToReport(row) as Record<string, any>; const evidencias = Array.isArray(rs.evidencias) ? rs.evidencias : [];
  if (hasAnySignature(rs)) return c.json({ error: 'report_locked_by_signature' }, 409);
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
  if (!canAccessReport(user, row)) return c.json({ error: 'forbidden' }, 403);
  const rs = rowToReport(row); const html = await renderPdfHtml(rs, c.env);
  const pdf = await c.env.BROWSER.quickAction('pdf', { html, cacheTTL: 0, pdfOptions: { format: 'letter', printBackground: true, margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' } } });
  if (!pdf.ok) return c.json({ error: 'pdf_failed', detail: await pdf.text() }, 502);
  const prefix = c.env.R2_PREFIX || 'reportes';
  const bytes = await pdf.arrayBuffer();
  const key = `${prefix}/${rs.id}/pdf/${Date.now()}.pdf`; await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
  await c.env.DB.prepare('insert into archivos (id, reporte_id, tipo, r2_key, creado_en) values (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), rs.id, 'pdf', key, new Date().toISOString()).run();
  await c.env.DB.prepare('insert into timeline (id, reporte_id, tipo, actor, nota, creado_en) values (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), rs.id, 'pdf_generado', user.nombre, key, new Date().toISOString()).run();
  if (c.req.query('download') === '1') return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${rs.id}.pdf"` } });
  return c.json({ ok: true, key });
});

app.post('/api/reportes/:id/enviar', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  if (user.rol === 'sac') return c.json({ error: 'forbidden' }, 403);
  const reportRow = await c.env.DB.prepare('select * from reportes where id = ?').bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!reportRow) return c.json({ error: 'not_found' }, 404);
  if (!canAccessReport(user, reportRow)) return c.json({ error: 'forbidden' }, 403);
  const rs = rowToReport(reportRow);
  const body = await c.req.json<{ destinatario: string; pdfKey: string }>(); const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare('insert into entregas (id, reporte_id, destinatario, estado, creado_en) values (?, ?, ?, ?, ?)').bind(id, c.req.param('id'), body.destinatario, 'pendiente', now).run();
  await c.env.DB.prepare('insert into timeline (id, reporte_id, tipo, actor, nota, creado_en) values (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), c.req.param('id'), 'envio_pendiente', user.nombre, body.destinatario, now).run();
  if (c.env.N8N_WEBHOOK_URL) await fetch(c.env.N8N_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deliveryId: id, reporteId: c.req.param('id'), destinatario: body.destinatario, pdfKey: body.pdfKey, callbackUrl: `${new URL(c.req.url).origin}/api/entregas/${id}/estado`, ciudad: rs.ciudad || '', canal: cityChannel(rs.ciudad), ordenTrabajo: rs.ordenTrabajo || '', cliente: { nombre: rs.cliente, contacto: rs.contacto, correo: rs.correo, telefono: rs.telefono, ciudad: rs.ciudad || '', ubicacion: rs.ubicacion }, reporte: { id: rs.id, fecha: rs.fecha, ordenTrabajo: rs.ordenTrabajo || '', tipoVisita: rs.tipoVisita, supervisor: rs.supervisor, ciudad: rs.ciudad || '', trabajoRealizado: rs.trabajoRealizado, observaciones: rs.observaciones } }) });
  return c.json({ ok: true, deliveryId: id });
});

app.get('/api/reportes/:id/entregas', async c => {
  const user = await requireUser(c); if (!user) return c.json({ error: 'unauthorized' }, 401);
  const report = await c.env.DB.prepare('select supervisor, creado_por from reportes where id = ?').bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!report) return c.json({ error: 'not_found' }, 404);
  if (!canAccessReport(user, report)) return c.json({ error: 'forbidden' }, 403);
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
  const body = await c.req.json<{ estado: 'pendiente' | 'enviado' | 'fallido'; provider?: string; providerMessageId?: string; detalle?: string }>();
  if (!['pendiente', 'enviado', 'fallido'].includes(body.estado)) return c.json({ error: 'invalid_estado' }, 400);
  const entrega = await c.env.DB.prepare('select reporte_id, destinatario from entregas where id = ?').bind(c.req.param('id')).first<{ reporte_id: string; destinatario: string }>();
  if (!entrega) return c.json({ error: 'not_found' }, 404);
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare('update entregas set estado = ?, respuesta = ?, actualizado_en = ? where id = ?')
    .bind(body.estado, JSON.stringify({ provider: body.provider ?? 'slack', providerMessageId: body.providerMessageId ?? '', detalle: body.detalle ?? '' }), now, c.req.param('id')).run();
  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.prepare('insert into timeline (id, reporte_id, tipo, actor, nota, creado_en) values (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), entrega.reporte_id, `envio_${body.estado}`, body.provider ?? 'Sistema de entregas', body.detalle ?? entrega.destinatario, now).run();
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
function canAccessReport(user: ReturnType<typeof rowToUser>, row: Record<string, unknown>) {
  return user.rol === 'admin' || user.rol === 'sac' || String(row.supervisor ?? '') === user.nombre || String(row.creado_por ?? row.creadoPor ?? '') === user.nombre;
}
function canReviewSac(user: ReturnType<typeof rowToUser>) {
  return user.rol === 'admin' || user.rol === 'sac';
}
function metricsDateRange(periodo?: string, desde?: string, hasta?: string) {
  const today = new Date();
  const end = validDate(hasta) || today.toISOString().slice(0, 10);
  const customStart = validDate(desde);
  if (customStart) return { periodo: periodo || 'custom', desde: customStart, hasta: end };
  if (periodo === 'mes_actual') return { periodo, desde: `${end.slice(0, 7)}-01`, hasta: end };
  const days = periodo === '90d' ? 90 : periodo === '180d' ? 180 : periodo === '365d' ? 365 : 30;
  const start = new Date(`${end}T12:00:00`);
  start.setDate(start.getDate() - days + 1);
  return { periodo: periodo || '30d', desde: start.toISOString().slice(0, 10), hasta: end };
}
function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : value;
}
function addMetric(map: Map<string, number>, key: string, amount = 1) {
  const label = key?.trim() || 'Sin dato';
  map.set(label, (map.get(label) ?? 0) + amount);
}
function roundMetric(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
function metricRows(map: Map<string, number>, limit = 10) {
  return [...map.entries()].map(([label, value]) => ({ label, value: roundMetric(value) })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, limit);
}
function uniqueOptions(values: string[], limit = 300) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)).slice(0, limit);
}
function meaningfulFollowupText(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.\s]/g, '');
  return !['no', 'n/a', 'na', 'ninguna', 'ninguno', 'sinrecomendaciones', 'sinpendientes', 'noaplica', 'none'].includes(normalized);
}
function employeesBy<T extends { reportes: number } & Record<string, string | number>>(rows: T[], field: keyof T, limit = 10) {
  return [...rows].filter(row => Number(row[field] ?? 0) > 0).sort((a, b) => Number(b[field] ?? 0) - Number(a[field] ?? 0)).slice(0, limit);
}
function buildClientSummary(rs: Record<string, any>) {
  return { nombre: String(rs.cliente || 'Sin cliente'), contacto: rs.contacto || '', correo: rs.correo || '', telefono: rs.telefono || '', ciudad: rs.ciudad || '', ubicacion: rs.ubicacion || '', total: 0, ultimo: rs.fecha || '', pendientes: 0, proximaVisita: 0, reportes: [] as unknown[], equipos: [] as unknown[], recomendaciones: [] as unknown[] };
}
function appendClientReport(client: ReturnType<typeof buildClientSummary>, rs: Record<string, any>) {
  client.total += 1;
  if (rs.fecha && String(rs.fecha) > client.ultimo) {
    client.ultimo = String(rs.fecha);
    client.contacto = rs.contacto || client.contacto;
    client.correo = rs.correo || client.correo;
    client.telefono = rs.telefono || client.telefono;
    client.ciudad = rs.ciudad || client.ciudad;
    client.ubicacion = rs.ubicacion || client.ubicacion;
  }
  if (rs.accionesPendientes || rs.proximaVisita || rs.recomendaciones) client.pendientes += 1;
  if (rs.proximaVisita) client.proximaVisita += 1;
  client.reportes.push({ id: rs.id, fecha: rs.fecha, estado: rs.estado, tipoVisita: rs.tipoVisita, supervisor: rs.supervisor, ciudad: rs.ciudad || '', trabajoRealizado: rs.trabajoRealizado || '', observaciones: rs.observaciones || '', recomendaciones: rs.recomendaciones || '', accionesPendientes: rs.accionesPendientes || '', proximaVisita: Boolean(rs.proximaVisita), fechaSeguimiento: rs.fechaSeguimiento || '' });
  for (const equipo of Array.isArray(rs.equipos) ? rs.equipos : []) {
    client.equipos.push({ rsId: rs.id, fecha: rs.fecha, nombre: equipo.nombre || '', marca: equipo.marca || '', modelo: equipo.modelo || '', serie: equipo.serie || '', ubicacion: equipo.ubicacion || '', trabajoRealizado: equipo.trabajoRealizado || '', recomendacion: equipo.recomendacion || '' });
  }
  if (rs.recomendaciones || rs.accionesPendientes || rs.proximaVisita) {
    client.recomendaciones.push({ rsId: rs.id, fecha: rs.fecha, recomendaciones: rs.recomendaciones || '', accionesPendientes: rs.accionesPendientes || '', proximaVisita: Boolean(rs.proximaVisita), fechaSeguimiento: rs.fechaSeguimiento || '', observaciones: rs.observaciones || '' });
  }
}
function minutesFromTime(value: unknown) {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
function durationMinutes(start: unknown, end: unknown) {
  const a = minutesFromTime(start); const b = minutesFromTime(end);
  if (a === null || b === null) return 0;
  return b >= a ? b - a : b + 24 * 60 - a;
}
function outsideBusinessMinutes(start: unknown, end: unknown, date?: unknown) {
  const a = minutesFromTime(start); const b = minutesFromTime(end);
  if (a === null || b === null) return 0;
  const ranges = b >= a ? [[a, b]] : [[a, 24 * 60], [0, b]];
  const day = date ? new Date(`${String(date)}T12:00:00`).getDay() : 1;
  if (day === 0) return ranges.reduce((sum, [from, to]) => sum + Math.max(0, to - from), 0);
  const businessStart = 8 * 60; const businessEnd = day === 6 ? 13 * 60 : 17 * 60;
  return ranges.reduce((sum, [from, to]) => {
    const before = Math.max(0, Math.min(to, businessStart) - from);
    const after = Math.max(0, to - Math.max(from, businessEnd));
    return sum + before + after;
  }, 0);
}
function roundHours(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}
function calculateHours(rs: Record<string, any>, mode: 'retrabajo' | 'extra' | 'normal' | null) {
  const people = Array.isArray(rs.personal) ? rs.personal : [];
  const totalMinutes = people.reduce((sum: number, p: Record<string, unknown>) => sum + durationMinutes(p.horaEntrada, p.horaSalida), 0);
  const outsideMinutes = people.reduce((sum: number, p: Record<string, unknown>) => sum + outsideBusinessMinutes(p.horaEntrada, p.horaSalida, rs.fecha), 0);
  const retrabajoMinutes = mode === 'retrabajo' ? totalMinutes : 0;
  const extraMinutes = mode === 'extra' ? outsideMinutes : 0;
  const normalMinutes = Math.max(0, totalMinutes - retrabajoMinutes - extraMinutes);
  return { horasTotales: roundHours(totalMinutes), horasFueraHorario: roundHours(outsideMinutes), horasRetrabajo: roundHours(retrabajoMinutes), horasExtra: roundHours(extraMinutes), horasNormales: roundHours(normalMinutes) };
}
function clampHours(value: unknown, max: number) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.round(parsed * 100) / 100, max);
}
function calculatePersonHours(person: Record<string, unknown>, date: unknown, manual?: { horasExtra?: unknown; horasRetrabajo?: unknown }) {
  const totalMinutes = durationMinutes(person.horaEntrada, person.horaSalida);
  const outsideMinutes = outsideBusinessMinutes(person.horaEntrada, person.horaSalida, date);
  const totalHours = roundHours(totalMinutes);
  const horasRetrabajo = clampHours(manual?.horasRetrabajo, totalHours);
  const horasExtra = clampHours(manual?.horasExtra, Math.max(0, totalHours - horasRetrabajo));
  return { horasTotales: totalHours, horasFueraHorario: roundHours(outsideMinutes), horasRetrabajo, horasExtra, horasNormales: Math.max(0, Math.round((totalHours - horasRetrabajo - horasExtra) * 100) / 100) };
}
function calculateEmployeeHours(rs: Record<string, any>, manual: Array<{ nombre: string; horasExtra?: number; horasRetrabajo?: number }> = []) {
  const people = Array.isArray(rs.personal) ? rs.personal : [];
  return people.filter((person: Record<string, unknown>) => person?.nombre).map((person: Record<string, unknown>) => ({
    nombre: String(person.nombre),
    rol: String(person.rol ?? ''),
    horaEntrada: String(person.horaEntrada ?? ''),
    horaSalida: String(person.horaSalida ?? ''),
    ...calculatePersonHours(person, rs.fecha, manual.find(item => item.nombre === String(person.nombre)))
  }));
}
function aggregateEmployeeHours(employeeHours: ReturnType<typeof calculateEmployeeHours>) {
  const sum = employeeHours.reduce((acc, person) => ({
    horasTotales: acc.horasTotales + person.horasTotales,
    horasFueraHorario: acc.horasFueraHorario + person.horasFueraHorario,
    horasRetrabajo: acc.horasRetrabajo + person.horasRetrabajo,
    horasExtra: acc.horasExtra + person.horasExtra,
    horasNormales: acc.horasNormales + person.horasNormales
  }), { horasTotales: 0, horasFueraHorario: 0, horasRetrabajo: 0, horasExtra: 0, horasNormales: 0 });
  return Object.fromEntries(Object.entries(sum).map(([key, value]) => [key, Math.round(value * 100) / 100])) as typeof sum;
}
async function saveSacEmployeeHours(db: D1Database, rs: Record<string, any>, employeeHours: ReturnType<typeof calculateEmployeeHours>, esRetrabajo: boolean, horasExtraAprobadas: boolean, requiereSeguimiento: boolean, now: string) {
  await db.prepare('delete from horas_personal_sac where reporte_id = ?').bind(rs.id).run();
  for (const person of employeeHours) {
    await db.prepare(`insert into horas_personal_sac (id, reporte_id, empleado_nombre, rol, fecha, cliente, ciudad, supervisor, hora_entrada, hora_salida, horas_totales, horas_fuera_horario, horas_normales, horas_extra, horas_retrabajo, es_retrabajo, horas_extra_aprobadas, requiere_seguimiento, actualizado_en)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), rs.id, person.nombre, person.rol, rs.fecha ?? '', rs.cliente ?? '', rs.ciudad ?? '', rs.supervisor ?? '', person.horaEntrada, person.horaSalida, person.horasTotales, person.horasFueraHorario, person.horasNormales, person.horasExtra, person.horasRetrabajo, esRetrabajo === null ? null : esRetrabajo ? 1 : 0, horasExtraAprobadas ? 1 : 0, requiereSeguimiento ? 1 : 0, now).run();
  }
}
async function loadSacEmployeeHours(db: D1Database, rs: Record<string, any>) {
  const saved = await db.prepare('select empleado_nombre, rol, hora_entrada, hora_salida, horas_totales, horas_fuera_horario, horas_normales, horas_extra, horas_retrabajo from horas_personal_sac where reporte_id = ? order by empleado_nombre asc').bind(rs.id).all<Record<string, unknown>>();
  if (saved.results.length) return saved.results.map(row => ({ nombre: String(row.empleado_nombre), rol: String(row.rol ?? ''), horaEntrada: String(row.hora_entrada ?? ''), horaSalida: String(row.hora_salida ?? ''), horasTotales: Number(row.horas_totales ?? 0), horasFueraHorario: Number(row.horas_fuera_horario ?? 0), horasNormales: Number(row.horas_normales ?? 0), horasExtra: Number(row.horas_extra ?? 0), horasRetrabajo: Number(row.horas_retrabajo ?? 0) }));
  return calculateEmployeeHours(rs);
}
function rowToSacReview(row: Record<string, unknown>, calculated: ReturnType<typeof calculateHours>) {
  const esRetrabajo = row.es_retrabajo === null || row.es_retrabajo === undefined ? null : Boolean(row.es_retrabajo);
  const mode = esRetrabajo ? 'retrabajo' : row.horas_extra_aprobadas ? 'extra' : 'normal';
  const fallback = calculateHours(rowToReport(row) as Record<string, any>, mode);
  return {
    reporteId: String(row.id),
    estado: String(row.sac_estado ?? 'pendiente'),
    esRetrabajo,
    horasExtraAprobadas: Boolean(row.horas_extra_aprobadas),
    requiereSeguimiento: Boolean(row.requiere_seguimiento),
    comentario: String(row.comentario ?? ''),
    horasTotales: Number(row.horas_totales ?? calculated.horasTotales ?? fallback.horasTotales),
    horasFueraHorario: Number(row.horas_fuera_horario ?? calculated.horasFueraHorario ?? fallback.horasFueraHorario),
    horasRetrabajo: Number(row.horas_retrabajo ?? fallback.horasRetrabajo),
    horasExtra: Number(row.horas_extra ?? fallback.horasExtra),
    horasNormales: Number(row.horas_normales ?? fallback.horasNormales),
    revisadoPor: row.revisado_por ? String(row.revisado_por) : undefined,
    revisadoEn: row.revisado_en ? String(row.revisado_en) : undefined,
    actualizadoEn: row.sac_actualizado_en ? String(row.sac_actualizado_en) : undefined
  };
}
async function createAndSendInvite(env: Env, usuario: { id: string; usuario: string; nombre: string; correo: string; telefono: string; rol: RolUsuario }, creadoPor: string) {
  const token = generateInviteToken();
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 72);
  await env.DB.prepare('update invitaciones set estado = ? where usuario_id = ? and estado = ?').bind('revocada', usuario.id, 'pendiente').run();
  await env.DB.prepare('insert into invitaciones (id, usuario_id, token_hash, estado, creado_por, creado_en, expira_en) values (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), usuario.id, await sha256(token), 'pendiente', creadoPor, now.toISOString(), expires.toISOString()).run();
  const inviteUrl = `${env.APP_ORIGIN || 'https://rs.tashonduras.com'}/invitar/${encodeURIComponent(token)}`;
  const sent = await sendUserInvite(env, usuario, inviteUrl, expires.toISOString(), creadoPor);
  return { ...sent, inviteUrl, expiraEn: expires.toISOString() };
}
async function sendUserInvite(env: Env, usuario: { id: string; usuario: string; nombre: string; correo: string; telefono: string; rol: RolUsuario }, inviteUrl: string, expiraEn: string, creadoPor: string) {
  if (!env.N8N_USER_WEBHOOK_URL) return { sent: false, skipped: true };
  try {
    const res = await fetch(env.N8N_USER_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tipo: 'usuario_creado',
        creadoPor,
        usuario: {
          id: usuario.id,
          usuario: usuario.usuario,
          nombre: usuario.nombre,
          correo: usuario.correo,
          telefono: usuario.telefono,
          rol: usuario.rol,
          mustChangePassword: false
        },
        app: {
          nombre: 'Reportes de Servicio TAS',
          url: env.APP_ORIGIN || 'https://rs.tashonduras.com',
          loginUrl: env.APP_ORIGIN || 'https://rs.tashonduras.com',
          inviteUrl,
          expiraEn
        },
        mensaje: {
          asunto: 'Active su acceso a Reportes de Servicio TAS',
          soporte: 'Administrador de la plataforma RS TAS'
        }
      })
    });
    return { sent: res.ok, status: res.status };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}
async function findInvite(db: D1Database, token: string) {
  if (!token || token.length < 20) return null;
  return db.prepare(`select i.id, i.usuario_id, i.expira_en, u.usuario, u.nombre, u.correo, u.rol
    from invitaciones i join usuarios u on u.id = i.usuario_id
    where i.token_hash = ? and i.estado = ? and i.expira_en > ? and u.activo = 1`)
    .bind(await sha256(token), 'pendiente', new Date().toISOString()).first<Record<string, string>>();
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
function cityChannel(ciudad: unknown) {
  const value = String(ciudad ?? '').toLowerCase();
  if (value.includes('tegucigalpa')) return 'tegucigalpa';
  if (value.includes('san pedro')) return 'san-pedro-sula';
  return 'general';
}
async function sha256(value: string) { const data = new TextEncoder().encode(value); const digest = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$sha256$${iterations}$${base64(salt)}$${base64(new Uint8Array(bits))}`;
}
function generateTempPassword() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `RS-${[...bytes].map(x => x.toString(36).padStart(2, '0')).join('').slice(0, 14)}`;
}
function generateInviteToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}
function base64url(bytes: Uint8Array) {
  return base64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function verifyPassword(password: string, stored: string) {
  if (/^[a-f0-9]{64}$/i.test(stored)) return { ok: await safeEqual(await sha256(password), stored), needsUpgrade: true };
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return { ok: false, needsUpgrade: false };
  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations < 100000) return { ok: false, needsUpgrade: false };
  const salt = fromBase64(parts[3]);
  const expected = parts[4];
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return { ok: await safeEqual(base64(new Uint8Array(bits)), expected), needsUpgrade: iterations < 100000 };
}
async function isLoginLocked(db: D1Database, usuario: string, ip: string) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const row = await db.prepare('select count(*) as total from login_attempts where usuario = ? and ip = ? and ok = 0 and creado_en > ?').bind(usuario, ip, since).first<{ total: number }>();
  return Number(row?.total ?? 0) >= 5;
}
async function recordLoginAttempt(db: D1Database, usuario: string, ip: string, ok: boolean) {
  const now = new Date().toISOString();
  await db.prepare('insert into login_attempts (id, usuario, ip, ok, creado_en) values (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), usuario, ip, ok ? 1 : 0, now).run();
  await db.prepare('delete from login_attempts where creado_en < ?').bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).run();
}
async function safeEqual(a: string, b: string) {
  const [left, right] = await Promise.all([crypto.subtle.digest('SHA-256', new TextEncoder().encode(a)), crypto.subtle.digest('SHA-256', new TextEncoder().encode(b))]);
  const x = new Uint8Array(left); const y = new Uint8Array(right);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
function base64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function rowToUser(row: Record<string, unknown>) { return { id: String(row.id), usuario: String(row.usuario), nombre: String(row.nombre), correo: String(row.correo), telefono: String(row.telefono ?? ''), rol: row.rol as RolUsuario, activo: Boolean(row.activo), mustChangePassword: Boolean(row.must_change_password) }; }
function rowToReport(row: Record<string, unknown>): Record<string, any> {
  let payload: Record<string, any> = {};
  if (row.payload_json) {
    try { payload = JSON.parse(String(row.payload_json)); } catch { payload = {}; }
  }
  return { ...payload, id: row.id, estado: row.estado, version: row.version, fecha: row.fecha, cliente: row.cliente, contacto: row.contacto, correo: row.correo, telefono: row.telefono, ciudad: payload.ciudad ?? '', ubicacion: row.ubicacion, ordenTrabajo: row.orden_trabajo, solicitadoPor: row.solicitado_por, tipoVisita: row.tipo_visita, horaLlegada: row.hora_llegada, horaSalida: row.hora_salida, trabajoRealizado: row.trabajo_realizado, observaciones: row.observaciones, estadoActual: row.estado_actual, recomendaciones: row.recomendaciones, accionesPendientes: row.acciones_pendientes, proximaVisita: Boolean(row.proxima_visita), fechaSeguimiento: row.fecha_seguimiento, supervisor: row.supervisor, creadoPor: row.creado_por, creadoEn: row.creado_en, actualizadoEn: row.actualizado_en, resumenEquipo: row.resumen_equipo };
}
function hasAnySignature(rs: Record<string, any> | null | undefined) {
  return Boolean(rs?.firma?.trazo || rs?.firmaSupervisor?.trazo);
}
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map(key => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
function comparableReportContent(value: Record<string, any>) {
  const clone = JSON.parse(JSON.stringify(value ?? {})) as Record<string, any>;
  for (const key of ['firma', 'firmaSupervisor', 'estado', 'version', 'actualizadoEn']) delete clone[key];
  return stableStringify(clone);
}
function isLockedReportEdit(previous: Record<string, any>, next: Record<string, any>) {
  return hasAnySignature(previous) && comparableReportContent(previous) !== comparableReportContent(next);
}
async function saveReport(db: D1Database, rs: Record<string, any>, now: string) {
  await db.prepare(`insert into reportes (id, estado, version, fecha, cliente, contacto, correo, telefono, ubicacion, orden_trabajo, solicitado_por, tipo_visita, hora_llegada, hora_salida, trabajo_realizado, observaciones, estado_actual, recomendaciones, acciones_pendientes, proxima_visita, fecha_seguimiento, supervisor, creado_por, creado_en, actualizado_en, resumen_equipo, payload_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set estado=excluded.estado, version=reportes.version+1, fecha=excluded.fecha, cliente=excluded.cliente, contacto=excluded.contacto, correo=excluded.correo, telefono=excluded.telefono, ubicacion=excluded.ubicacion, orden_trabajo=excluded.orden_trabajo, solicitado_por=excluded.solicitado_por, tipo_visita=excluded.tipo_visita, hora_llegada=excluded.hora_llegada, hora_salida=excluded.hora_salida, trabajo_realizado=excluded.trabajo_realizado, observaciones=excluded.observaciones, estado_actual=excluded.estado_actual, recomendaciones=excluded.recomendaciones, acciones_pendientes=excluded.acciones_pendientes, proxima_visita=excluded.proxima_visita, fecha_seguimiento=excluded.fecha_seguimiento, supervisor=excluded.supervisor, actualizado_en=excluded.actualizado_en, resumen_equipo=excluded.resumen_equipo, payload_json=excluded.payload_json`)
    .bind(rs.id, rs.estado, rs.version ?? 1, rs.fecha, rs.cliente ?? '', rs.contacto ?? '', rs.correo ?? '', rs.telefono ?? '', rs.ubicacion ?? '', rs.ordenTrabajo ?? '', rs.solicitadoPor ?? '', rs.tipoVisita ?? '', rs.horaLlegada ?? '', rs.horaSalida ?? '', rs.trabajoRealizado ?? '', rs.observaciones ?? '', rs.estadoActual ?? '', rs.recomendaciones ?? '', rs.accionesPendientes ?? '', rs.proximaVisita ? 1 : 0, rs.fechaSeguimiento ?? '', rs.supervisor ?? '', rs.creadoPor ?? '', rs.creadoEn ?? now, now, rs.resumenEquipo ?? '', JSON.stringify(rs)).run();
}
function stampSignature(c: { req: { header(name: string): string | undefined } }, rs: Record<string, any>, now: string) {
  for (const key of ['firma', 'firmaSupervisor']) {
    if (!rs[key] || typeof rs[key] !== 'object') continue;
    rs[key].firmadaEn = rs[key].firmadaEn || now;
    rs[key].ip = rs[key].ip || c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '';
    rs[key].userAgent = rs[key].userAgent || c.req.header('user-agent') || '';
  }
}
function syncSignedStatus(rs: Record<string, any>) {
  if (rs.firma?.trazo && rs.firmaSupervisor?.trazo) rs.estado = 'Firmado';
}
async function renderPdfHtml(rs: ReturnType<typeof rowToReport>, env: Env) {
  const equipos = Array.isArray(rs.equipos) ? rs.equipos : [];
  const materiales = Array.isArray(rs.materiales) ? rs.materiales : [];
  const personal = Array.isArray(rs.personal) ? rs.personal : [];
  const evidencias = Array.isArray(rs.evidencias) ? rs.evidencias : [];
  const fotos = await Promise.all(evidencias.map(async (e: Record<string, unknown>) => ({ ...e, dataUrl: e.blobKey ? await r2ImageDataUrl(env.FILES, String(e.blobKey)) : '' })));
  const empty = '<p class="text-muted-small">No registrado.</p>';
  const infoCell = (label: string, value: unknown) => `<td><strong>${esc(label)}:</strong><p>${esc(value || '-')}</p></td>`;
  const yesNo = (value: unknown) => value ? '<span class="status-pill status-yes">Sí</span>' : '<span class="status-pill status-no">No</span>';
  const textBlock = (title: string, value: unknown) => `<div class="text-box"><strong>${esc(title)}</strong><p>${esc(value || 'No registrado.')}</p></div>`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: letter; margin: 0.20in 0.42in 0.72in; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #222222; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.3; }
    .manual-header { width: 100%; border-bottom: 1px solid #dddddd; padding-bottom: 6px; margin-bottom: 10px; }
    .manual-header-table { width: 100%; border-collapse: collapse; }
    .manual-header-table td { border: none; vertical-align: middle; padding: 0; }
    .manual-logo-cell { width: 34%; }
    .manual-info-cell { width: 66%; text-align: right; }
    .manual-logo { display: block; width: 185px; height: auto; object-fit: contain; }
    .manual-slogan { margin: 4px 0 0; color: #C20E1A; font-size: 11px; line-height: 1.1; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; }
    .manual-company-name { font-size: 15.5px; font-weight: 700; margin: 0; line-height: 1.18; }
    .manual-company-info { font-size: 10.2px; color: #555555; margin: 1px 0 0; line-height: 1.18; }
    .report-title { margin-bottom: 10px; }
    .report-title h2 { margin: 0; font-size: 21px; font-weight: 700; line-height: 1.15; }
    .info-box, .summary-box { border: 1px solid #dddddd; background-color: #fafafa; page-break-inside: avoid; }
    .info-box { width: 100%; padding: 7px 10px; margin: 8px 0 12px; }
    .info-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .info-table td { width: 25%; vertical-align: top; padding: 3px 8px 5px 3px; border: none; font-size: 11px; }
    .info-table strong { display: block; font-size: 10.2px; color: #555555; margin-bottom: 1px; }
    .info-table p { margin: 0; font-size: 11px; line-height: 1.22; white-space: pre-wrap; }
    .status-pill { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; }
    .status-yes { background-color: #e8f5e9; color: #2e7d32; }
    .status-no { background-color: #fff3e0; color: #ef6c00; }
    .section-title-row td { background-color: #e9ecef; border-top: 1px solid #cccccc; border-bottom: 1px solid #cccccc; font-weight: 700; color: #333333; padding: 7px 6px; text-transform: uppercase; letter-spacing: 0.3px; }
    .o_main_table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 16px; page-break-inside: auto; }
    .o_main_table th, .o_main_table td { font-size: 10.8px; line-height: 1.25; vertical-align: top; padding: 6px 4px; border: none; word-wrap: break-word; overflow-wrap: break-word; text-align: left; }
    .o_main_table th { white-space: normal; background-color: #f2f2f2; border-bottom: 1px solid #cccccc; font-weight: 700; }
    .o_main_table .item-row td { background-color: #ffffff; border-bottom: 1px solid #eeeeee; }
    .o_main_table .item-row-alt td { background-color: #f7f7f7; border-bottom: 1px solid #eeeeee; }
    .text-center { text-align: center; }
    .text-start { text-align: left; }
    .text-end { text-align: right; }
    .summary-box { margin-top: 12px; padding: 7px 10px; }
    .summary-box strong { font-size: 11.5px; }
    .summary-box table { width: 100%; margin-top: 3px; border-collapse: collapse; table-layout: fixed; }
    .summary-box td { font-size: 10.8px; padding: 2px 8px 2px 0; border: none; vertical-align: top; }
    .text-muted-small { color: #666666; font-size: 11.5px; margin-top: 10px; }
    .text-box { border: 1px solid #dddddd; background: #ffffff; padding: 10px 12px; margin-top: 10px; page-break-inside: avoid; }
    .text-box strong { display: block; color: #555555; margin-bottom: 4px; font-size: 11.5px; }
    .text-box p { margin: 0; white-space: pre-wrap; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .evidence-section { break-before: page; page-break-before: always; }
    .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 16px; }
    .photo { border: 1px solid #dddddd; background: #ffffff; padding: 7px; page-break-inside: avoid; }
    .photo img { display: block; width: 100%; height: 205px; object-fit: cover; background: #f2f2f2; }
    .photo strong { display: inline-block; margin-top: 6px; font-size: 11.5px; color: #555555; }
    .photo span { display: block; color: #666666; font-size: 11px; }
    .signature-table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 16px; page-break-inside: avoid; }
    .signature-table td { width: 50%; vertical-align: top; padding: 8px 18px; border: none; text-align: center; }
    .signature-card { min-height: 166px; page-break-inside: avoid; }
    .signature-slot { height: 92px; display: flex; align-items: flex-end; justify-content: center; }
    .signature { height: 82px; max-width: 240px; object-fit: contain; display: block; }
    .signature-line { min-height: 74px; border-top: 1px solid #555555; padding-top: 5px; font-size: 11.5px; }
    .signature-meta { display: block; color: #666666; font-size: 9.5px; line-height: 1.15; margin-top: 2px; }
    .manual-footer { position: fixed; left: 0; right: 0; bottom: 0; height: 0.34in; border-top: 1px solid #dddddd; padding-top: 5px; color: #666666; font-size: 9.2px; line-height: 1.18; text-align: center; background: #ffffff; }
  </style>
</head>
<body>
  <div class="manual-header">
    <table class="manual-header-table">
      <tr>
        <td class="manual-logo-cell"><img class="manual-logo" src="https://r2.tashonduras.com/Logo%20TAS%20HNx.png" alt="TAS"><p class="manual-slogan">INTEGRANDO UN MUNDO DE<br>SOLUCIONES</p></td>
        <td class="manual-info-cell">
          <p class="manual-company-name">Tecnología Acceso y Seguridad S.A. de C.V.</p>
          <p class="manual-company-info">19 Ave, 9 calle "A", Casa #94, Barrio Río de Piedras</p>
          <p class="manual-company-info">Frente parque República de Perú</p>
          <p class="manual-company-info">San Pedro Sula - Honduras</p>
        </td>
      </tr>
    </table>
  </div>

  <div class="report-title">
    <h2>Reporte de Servicio # ${esc(rs.id)}</h2>
  </div>

  <div class="info-box">
    <table class="info-table">
      <tr>${infoCell('Cliente', rs.cliente)}${infoCell('Contacto', rs.contacto)}${infoCell('Fecha', rs.fecha)}${infoCell('Tipo', rs.tipoVisita)}</tr>
      <tr>${infoCell('Ciudad', rs.ciudad || '-')}${infoCell('Ubicación', rs.ubicacion)}${infoCell('Correo', rs.correo)}${infoCell('Supervisor', rs.supervisor)}</tr>
      <tr>${infoCell('OT', rs.ordenTrabajo)}${infoCell('Llegada', rs.horaLlegada)}${infoCell('Salida', rs.horaSalida)}${infoCell('Canal', cityChannel(rs.ciudad))}</tr>
      <tr>${infoCell('Teléfono', rs.telefono)}${infoCell('Solicitado por', rs.solicitadoPor)}${infoCell('Seguimiento', rs.fechaSeguimiento || '-') }<td><strong>Próxima visita:</strong><p>${yesNo(rs.proximaVisita)}</p></td></tr>
    </table>
  </div>

  <table class="o_main_table">
    <tbody>
      <tr class="section-title-row"><td colspan="2">Detalle del servicio</td></tr>
    </tbody>
  </table>
  ${textBlock('Trabajo realizado', rs.trabajoRealizado)}
  <div class="two">
    ${textBlock('Observaciones', rs.observaciones)}
    ${textBlock('Estado actual', rs.estadoActual)}
  </div>
  <div class="two">
    ${textBlock('Recomendaciones', rs.recomendaciones)}
    ${textBlock('Acciones pendientes', rs.accionesPendientes)}
  </div>

  <table class="o_main_table">
    <thead><tr><th class="text-start" style="width:24%">Equipo</th><th class="text-start" style="width:16%">Serie</th><th class="text-start" style="width:20%">Ubicación</th><th class="text-start" style="width:40%">Trabajo realizado</th></tr></thead>
    <tbody>${equipos.length ? equipos.map((e: Record<string, unknown>, i: number) => `<tr class="${i % 2 ? 'item-row item-row-alt' : 'item-row'}"><td class="text-start"><strong>${esc(e.nombre)}</strong><br>${esc([e.marca, e.modelo].filter(Boolean).join(' '))}</td><td class="text-start">${esc(e.serie || '-')}</td><td class="text-start">${esc(e.ubicacion || '-')}</td><td class="text-start">${esc(e.trabajoRealizado || '-')}</td></tr>`).join('') : `<tr><td colspan="4" class="text-center">No hay equipos registrados.</td></tr>`}</tbody>
  </table>

  <table class="o_main_table">
    <thead><tr><th class="text-start" style="width:45%">Material / repuesto</th><th class="text-center" style="width:15%">Cantidad</th><th class="text-center" style="width:20%">Unidad</th><th class="text-center" style="width:20%">Uso</th></tr></thead>
    <tbody>${materiales.length ? materiales.map((m: Record<string, unknown>, i: number) => `<tr class="${i % 2 ? 'item-row item-row-alt' : 'item-row'}"><td class="text-start">${esc(m.producto)}</td><td class="text-center">${esc(m.cantidad)}</td><td class="text-center">${esc(m.unidad)}</td><td class="text-center">${esc(m.uso)}</td></tr>`).join('') : `<tr><td colspan="4" class="text-center">No hay materiales registrados.</td></tr>`}</tbody>
  </table>

  <table class="o_main_table">
    <thead><tr><th class="text-start" style="width:40%">Personal participante</th><th class="text-center" style="width:20%">Rol</th><th class="text-center" style="width:20%">Entrada</th><th class="text-center" style="width:20%">Salida</th></tr></thead>
    <tbody>${personal.length ? personal.map((p: Record<string, unknown>, i: number) => `<tr class="${i % 2 ? 'item-row item-row-alt' : 'item-row'}"><td class="text-start">${esc(p.nombre)}</td><td class="text-center">${esc(p.rol)}</td><td class="text-center">${esc(p.horaEntrada || '-')}</td><td class="text-center">${esc(p.horaSalida || '-')}</td></tr>`).join('') : `<tr><td colspan="4" class="text-center">No hay personal registrado.</td></tr>`}</tbody>
  </table>

  <div class="summary-box">
    <strong>Resumen del reporte:</strong>
    <table>
      <tr><td>Equipos: <strong>${equipos.length}</strong></td><td>Materiales: <strong>${materiales.length}</strong></td><td>Evidencias: <strong>${fotos.length}</strong></td><td>Estado: <strong>${esc(rs.estado)}</strong></td></tr>
    </table>
  </div>

  <section class="evidence-section">
    <table class="o_main_table">
      <tbody><tr class="section-title-row"><td>Evidencias fotográficas</td></tr></tbody>
    </table>
    ${fotos.length ? `<div class="photos">${fotos.map((e: Record<string, unknown>) => `<div class="photo">${e.dataUrl ? `<img src="${esc(e.dataUrl)}" alt="${esc(e.descripcion)}">` : ''}<strong>${esc(e.categoria)}</strong><span>${esc(e.descripcion)}</span></div>`).join('')}</div>` : empty}
  </section>

  <table class="signature-table">
    <tr>
      <td><div class="signature-card"><div class="signature-slot">${rs.firmaSupervisor ? `<img class="signature" src="${esc(rs.firmaSupervisor.trazo)}">` : ''}</div><div class="signature-line"><strong>${esc(rs.firmaSupervisor?.nombre || rs.supervisor || 'Supervisor de campo')}</strong><br>${esc(rs.firmaSupervisor?.cargo || 'Supervisor de campo')}<span class="signature-meta">Firmado: ${esc(formatDateTime(rs.firmaSupervisor?.firmadaEn))}${rs.firmaSupervisor?.ip ? ` · IP: ${esc(rs.firmaSupervisor.ip)}` : ''}${rs.firmaSupervisor?.ubicacion ? ` · Ubicación: ${esc(formatLocation(rs.firmaSupervisor.ubicacion))}` : ''}</span></div></div></td>
      <td><div class="signature-card"><div class="signature-slot">${rs.firma ? `<img class="signature" src="${esc(rs.firma.trazo)}">` : ''}</div><div class="signature-line"><strong>${esc(rs.firma?.nombre || 'Cliente')}</strong><br><strong>Nombre y firma de cliente</strong><br>${esc(rs.firma?.cargo || 'Cliente')}<span class="signature-meta">Firmado: ${esc(formatDateTime(rs.firma?.firmadaEn))}${rs.firma?.ip ? ` · IP: ${esc(rs.firma.ip)}` : ''}${rs.firma?.ubicacion ? ` · Ubicación: ${esc(formatLocation(rs.firma.ubicacion))}` : ''}</span></div></div></td>
    </tr>
  </table>

  <p class="text-muted-small">Este documento registra el servicio realizado y la aceptación de los trabajos descritos.</p>
  <div class="manual-footer">+504 9463-3724 | infohns@tas-seguridad.com; servicioalclientehn@tas-seguridad.com | www.tas-seguridad.com | 05019006484414</div>
</body>
</html>`;
}
function cdnAsset(env: Env, path: string) {
  return `${env.APP_ORIGIN.replace(/\/$/, '')}${path}`;
}
function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}
function formatDateTime(value: unknown) {
  if (!value) return 'No registrado';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function formatLocation(value: { lat?: number; lng?: number; accuracy?: number }) {
  if (typeof value.lat !== 'number' || typeof value.lng !== 'number') return 'No registrada';
  return `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}${typeof value.accuracy === 'number' ? ` ±${Math.round(value.accuracy)}m` : ''}`;
}
async function r2ImageDataUrl(bucket: R2Bucket, key: string) {
  const object = await bucket.get(key);
  if (!object) return '';
  const contentType = object.httpMetadata?.contentType || 'image/jpeg';
  if (!contentType.startsWith('image/')) return '';
  const bytes = new Uint8Array(await object.arrayBuffer());
  return `data:${contentType};base64,${base64(bytes)}`;
}

export default app;
