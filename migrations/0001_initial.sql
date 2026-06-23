create table if not exists usuarios (
  id text primary key, usuario text not null unique, nombre text not null, correo text not null unique,
  telefono text, rol text not null check (rol in ('admin','supervisor','tecnico')), activo integer not null default 1,
  password_hash text not null, must_change_password integer not null default 1, creado_en text not null
) strict;

create table if not exists reportes (
  id text primary key, estado text not null, version integer not null default 1, fecha text not null,
  cliente text not null, contacto text, correo text, telefono text, ubicacion text, orden_trabajo text,
  solicitado_por text, tipo_visita text, hora_llegada text, hora_salida text, trabajo_realizado text,
  observaciones text, estado_actual text, recomendaciones text, acciones_pendientes text,
  proxima_visita integer not null default 0, fecha_seguimiento text, supervisor text, creado_por text,
  creado_en text not null, actualizado_en text not null, resumen_equipo text, payload_json text not null
) strict;

create table if not exists timeline (
  id text primary key, reporte_id text not null references reportes(id), tipo text not null,
  actor text not null, nota text, creado_en text not null
) strict;

create table if not exists archivos (
  id text primary key, reporte_id text not null references reportes(id), tipo text not null,
  r2_key text not null, creado_en text not null
) strict;

create table if not exists entregas (
  id text primary key, reporte_id text not null references reportes(id), destinatario text not null,
  estado text not null, respuesta text, creado_en text not null, actualizado_en text
) strict;

create index if not exists idx_reportes_estado on reportes(estado);
create index if not exists idx_reportes_fecha on reportes(fecha desc);
create index if not exists idx_timeline_reporte on timeline(reporte_id, creado_en);
