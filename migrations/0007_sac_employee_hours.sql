create table if not exists horas_personal_sac (
  id text primary key,
  reporte_id text not null references reportes(id),
  empleado_nombre text not null,
  rol text,
  fecha text not null,
  cliente text not null,
  ciudad text,
  supervisor text,
  hora_entrada text,
  hora_salida text,
  horas_totales real not null default 0,
  horas_fuera_horario real not null default 0,
  horas_normales real not null default 0,
  horas_extra real not null default 0,
  horas_retrabajo real not null default 0,
  es_retrabajo integer,
  horas_extra_aprobadas integer not null default 0,
  requiere_seguimiento integer not null default 0,
  actualizado_en text not null
) strict;

create index if not exists idx_horas_personal_empleado on horas_personal_sac(empleado_nombre, fecha desc);
create index if not exists idx_horas_personal_reporte on horas_personal_sac(reporte_id);
create index if not exists idx_horas_personal_fecha on horas_personal_sac(fecha desc);
