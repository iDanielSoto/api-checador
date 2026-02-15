import { z } from 'zod';

export const updateEmpleadoSchema = z.object({
    body: z.object({
        rfc: z.string().length(13, 'El RFC debe tener 13 caracteres').optional(),
        nss: z.string().length(11, 'El NSS debe tener 11 caracteres').optional(),
        horario_id: z.string().optional(),
        regimen_laboral: z.string().optional(),
    }),
    params: z.object({
        id: z.string().min(1, 'ID es requerido'),
    }),
});

export const asignarDepartamentoSchema = z.object({
    body: z.object({
        departamento_id: z.string().min(1, 'Departamento ID es requerido'),
    }),
    params: z.object({
        id: z.string().min(1, 'Empleado ID es requerido'),
    }),
});
