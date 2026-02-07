-- Migration: Add regimen_laboral field to empleados table
-- Date: 2026-02-05
-- Description: Adds an ENUM field to track whether an employee is "base" or "eventual"

-- Step 1: Create the ENUM type
CREATE TYPE regimen_laboral_enum AS ENUM ('base', 'eventual');

-- Step 2: Add the column to the empleados table with a default value
ALTER TABLE empleados 
ADD COLUMN regimen_laboral regimen_laboral_enum NOT NULL DEFAULT 'base';

-- Step 3: Add a comment to document the field
COMMENT ON COLUMN empleados.regimen_laboral IS 'Tipo de régimen laboral del empleado: base (planta) o eventual (temporal)';
