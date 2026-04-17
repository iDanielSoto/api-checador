-- Limpieza de tablas estáticas ahora controladas por código
DROP TABLE IF EXISTS permisos_catalogo CASCADE;
DROP TABLE IF EXISTS modulos CASCADE;

-- Nota: No se eliminan las tablas de unión (usuarios_roles) ni la tabla de roles, 
-- solo los catálogos que ahora son constantes en el backend.
