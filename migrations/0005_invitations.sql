create table if not exists invitaciones (
  id text primary key,
  usuario_id text not null references usuarios(id),
  token_hash text not null unique,
  estado text not null check (estado in ('pendiente','usada','revocada')),
  creado_por text not null,
  creado_en text not null,
  expira_en text not null,
  usado_en text
) strict;

create index if not exists idx_invitaciones_usuario on invitaciones(usuario_id, estado, expira_en);
create index if not exists idx_invitaciones_token on invitaciones(token_hash);
