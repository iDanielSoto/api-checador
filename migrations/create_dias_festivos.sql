-- Migration: Create dias_festivos table
-- Date: 2026-02-05
-- Description: Creates table to store Mexican holidays and custom company holidays

-- Step 1: Create sequence
CREATE SEQUENCE seq_dias_festivos START 1;

-- Step 2: Create table
CREATE TABLE dias_festivos (
    id VARCHAR(20) PRIMARY KEY DEFAULT 'FES' || LPAD(nextval('seq_dias_festivos')::TEXT, 6, '0'),
    nombre VARCHAR(100) NOT NULL,
    fecha DATE NOT NULL UNIQUE,
    es_obligatorio BOOLEAN DEFAULT true,
    tipo VARCHAR(20) DEFAULT 'oficial',
    pais VARCHAR(3) DEFAULT 'MEX',
    estado VARCHAR(50),
    descripcion TEXT,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    es_activo BOOLEAN DEFAULT true
);

-- Step 3: Create indexes
CREATE INDEX idx_dias_festivos_fecha ON dias_festivos(fecha);
CREATE INDEX idx_dias_festivos_tipo ON dias_festivos(tipo);
CREATE INDEX idx_dias_festivos_activo ON dias_festivos(es_activo);

-- Step 4: Add comments
COMMENT ON TABLE dias_festivos IS 'Almacena días festivos oficiales y personalizados de la empresa';
COMMENT ON COLUMN dias_festivos.es_obligatorio IS 'Si es true, no se permite registrar asistencia en este día';
COMMENT ON COLUMN dias_festivos.tipo IS 'Tipos: oficial (nacional), local (estatal), empresa (personalizado)';
