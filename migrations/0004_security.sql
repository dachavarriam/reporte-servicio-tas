create table if not exists login_attempts (
  id text primary key,
  usuario text not null,
  ip text not null,
  ok integer not null default 0,
  creado_en text not null
) strict;

create index if not exists idx_login_attempts_scope on login_attempts(usuario, ip, creado_en);
