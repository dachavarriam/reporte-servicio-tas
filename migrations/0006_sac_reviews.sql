create table if not exists usuarios_new (
  id text primary key,
  usuario text not null unique,
  nombre text not null,
  correo text not null unique,
  telefono text,
  rol text not null check (rol in ('admin','supervisor','sac','tecnico')),
  activo integer not null default 1,
  password_hash text not null,
  must_change_password integer not null default 1,
  creado_en text not null
) strict;

create table if not exists sesiones_new (
  token text primary key,
  usuario_id text not null references usuarios_new(id),
  creado_en text not null,
  expira_en text not null
) strict;

create table if not exists invitaciones_new (
  id text primary key,
  usuario_id text not null references usuarios_new(id),
  token_hash text not null unique,
  estado text not null check (estado in ('pendiente','usada','revocada')),
  creado_por text not null,
  creado_en text not null,
  expira_en text not null,
  usado_en text
) strict;

insert into usuarios_new (id, usuario, nombre, correo, telefono, rol, activo, password_hash, must_change_password, creado_en)
select id, usuario, nombre, correo, telefono, rol, activo, password_hash, must_change_password, creado_en
from usuarios;

insert into sesiones_new (token, usuario_id, creado_en, expira_en)
select token, usuario_id, creado_en, expira_en
from sesiones;

insert into invitaciones_new (id, usuario_id, token_hash, estado, creado_por, creado_en, expira_en, usado_en)
select id, usuario_id, token_hash, estado, creado_por, creado_en, expira_en, usado_en
from invitaciones;

drop table invitaciones;
drop table sesiones;
drop table usuarios;

alter table usuarios_new rename to usuarios;
alter table sesiones_new rename to sesiones;
alter table invitaciones_new rename to invitaciones;

create index if not exists idx_sesiones_usuario on sesiones(usuario_id);
create index if not exists idx_invitaciones_usuario on invitaciones(usuario_id, estado, expira_en);
create index if not exists idx_invitaciones_token on invitaciones(token_hash);

create table if not exists revisiones_sac (
  reporte_id text primary key references reportes(id),
  estado text not null check (estado in ('pendiente','revisado')) default 'pendiente',
  es_retrabajo integer,
  horas_extra_aprobadas integer not null default 0,
  requiere_seguimiento integer not null default 0,
  comentario text,
  horas_totales real not null default 0,
  horas_fuera_horario real not null default 0,
  horas_retrabajo real not null default 0,
  horas_extra real not null default 0,
  horas_normales real not null default 0,
  revisado_por text,
  revisado_en text,
  actualizado_en text not null
) strict;

create index if not exists idx_revisiones_sac_estado on revisiones_sac(estado, actualizado_en desc);
