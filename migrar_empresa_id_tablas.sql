-- ============================================================
--  MIGRACIÓN: Añadir empresa_id a tablas que aún no la tienen
--  Ejecutar UNA SOLA VEZ contra la base de datos de producción.
-- ============================================================

DO $$
DECLARE
    empresa_principal_id VARCHAR(255);
BEGIN
    -- Obtener la empresa más antigua para asignarle los registros históricos
    SELECT id INTO empresa_principal_id
    FROM empresas
    ORDER BY fecha_registro ASC
    LIMIT 1;

    IF empresa_principal_id IS NULL THEN
        RAISE EXCEPTION 'No hay empresas en la base de datos. Crea al menos una empresa antes de migrar.';
    END IF;

    RAISE NOTICE 'Empresa principal para migración: %', empresa_principal_id;

    -- ───────────────────────────────────────────────
    --  TABLA: eventos
    -- ───────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'eventos' AND column_name = 'empresa_id'
    ) THEN
        ALTER TABLE eventos ADD COLUMN empresa_id VARCHAR(255);
        UPDATE eventos SET empresa_id = empresa_principal_id WHERE empresa_id IS NULL;
        ALTER TABLE eventos ADD CONSTRAINT fk_eventos_empresa
            FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
        RAISE NOTICE 'empresa_id añadida a: eventos';
    ELSE
        RAISE NOTICE 'eventos ya tiene empresa_id';
    END IF;

    -- ───────────────────────────────────────────────
    --  TABLA: incidencias
    -- ───────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'incidencias' AND column_name = 'empresa_id'
    ) THEN
        ALTER TABLE incidencias ADD COLUMN empresa_id VARCHAR(255);
        UPDATE incidencias SET empresa_id = empresa_principal_id WHERE empresa_id IS NULL;
        ALTER TABLE incidencias ADD CONSTRAINT fk_incidencias_empresa
            FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
        RAISE NOTICE 'empresa_id añadida a: incidencias';
    ELSE
        RAISE NOTICE 'incidencias ya tiene empresa_id';
    END IF;

    -- ───────────────────────────────────────────────
    --  TABLA: movil (dispositivos móviles)
    -- ───────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'movil' AND column_name = 'empresa_id'
    ) THEN
        ALTER TABLE movil ADD COLUMN empresa_id VARCHAR(255);
        -- Intentar derivar empresa_id desde el empleado → usuario
        UPDATE movil m
        SET empresa_id = u.empresa_id
        FROM empleados e
        INNER JOIN usuarios u ON u.id = e.usuario_id
        WHERE e.id = m.empleado_id AND m.empresa_id IS NULL;
        -- Fallback: asignar a empresa principal si no se pudo derivar
        UPDATE movil SET empresa_id = empresa_principal_id WHERE empresa_id IS NULL;
        ALTER TABLE movil ADD CONSTRAINT fk_movil_empresa
            FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
        RAISE NOTICE 'empresa_id añadida a: movil';
    ELSE
        RAISE NOTICE 'movil ya tiene empresa_id';
    END IF;

    -- ───────────────────────────────────────────────
    --  TABLA: escritorio (dispositivos de escritorio)
    -- ───────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'escritorio' AND column_name = 'empresa_id'
    ) THEN
        ALTER TABLE escritorio ADD COLUMN empresa_id VARCHAR(255);
        UPDATE escritorio SET empresa_id = empresa_principal_id WHERE empresa_id IS NULL;
        ALTER TABLE escritorio ADD CONSTRAINT fk_escritorio_empresa
            FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
        RAISE NOTICE 'empresa_id añadida a: escritorio';
    ELSE
        RAISE NOTICE 'escritorio ya tiene empresa_id';
    END IF;

    -- ───────────────────────────────────────────────
    --  TABLA: asistencias (si la migración anterior no lo hizo)
    -- ───────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'asistencias' AND column_name = 'empresa_id'
    ) THEN
        ALTER TABLE asistencias ADD COLUMN empresa_id VARCHAR(255);
        UPDATE asistencias a
        SET empresa_id = u.empresa_id
        FROM empleados e
        INNER JOIN usuarios u ON u.id = e.usuario_id
        WHERE e.id = a.empleado_id AND a.empresa_id IS NULL;
        UPDATE asistencias SET empresa_id = empresa_principal_id WHERE empresa_id IS NULL;
        ALTER TABLE asistencias ADD CONSTRAINT fk_asistencias_empresa
            FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
        RAISE NOTICE 'empresa_id añadida a: asistencias';
    ELSE
        RAISE NOTICE 'asistencias ya tiene empresa_id';
    END IF;

END $$;

-- Verificación final: listar columnas empresa_id en tablas relevantes
SELECT table_name, column_name
FROM information_schema.columns
WHERE column_name = 'empresa_id'
  AND table_name IN ('eventos','incidencias','movil','escritorio','asistencias',
                     'empleados','roles','horarios','tolerancias','departamentos',
                     'avisos','usuarios')
ORDER BY table_name;
