create table if not exists sesiones (
  token text primary key,
  usuario_id text not null references usuarios(id),
  creado_en text not null,
  expira_en text not null
) strict;

create index if not exists idx_sesiones_usuario on sesiones(usuario_id);
