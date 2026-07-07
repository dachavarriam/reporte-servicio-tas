create table if not exists seguimientos_sac (
  id text primary key,
  reporte_id text not null references reportes(id),
  tipo text not null,
  estado text not null check (estado in ('activo','hecho','archivado')) default 'activo',
  nota text,
  actualizado_por text not null,
  actualizado_en text not null
) strict;

create index if not exists idx_seguimientos_sac_estado on seguimientos_sac(estado, actualizado_en desc);
create index if not exists idx_seguimientos_sac_reporte on seguimientos_sac(reporte_id, tipo);
