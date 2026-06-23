insert or ignore into usuarios (id, usuario, nombre, correo, telefono, rol, activo, password_hash, must_change_password, creado_en)
values
  ('usr-admin', 'admin', 'Administrador TAS', 'admin@tashonduras.com', '', 'admin', 1, '8731767511409f90d5e22ded92c9d1081f0daa5058b4d9a320ece169f1970497', 1, '2026-06-23T00:00:00.000Z'),
  ('usr-carlos', 'carlos', 'Carlos Hernández', 'chernandez@tashn.com', '+504 9912-3344', 'supervisor', 1, '8731767511409f90d5e22ded92c9d1081f0daa5058b4d9a320ece169f1970497', 0, '2026-06-23T00:00:00.000Z');
