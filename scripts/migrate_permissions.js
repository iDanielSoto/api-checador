import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const MAPPING = {
    0: 0,   // USUARIO_VER
    1: 1,   // USUARIO_CREAR
    2: 2,   // USUARIO_MODIFICAR -> USUARIO_EDITAR (2)
    3: 3,   // USUARIO_SOFTDELETE -> USUARIO_ELIMINAR (3)
    4: 4,   // ROL_VER
    5: 5,   // ROL_CREAR
    6: 6,   // ROL_MODIFICAR -> ROL_EDITAR (6)
    7: 8,   // ROL_ASIGNAR (Old 7 -> New 8)
    8: 7,   // ROL_SOFTDELETE -> ROL_ELIMINAR (Old 8 -> New 7)
    9: 9,   // HORARIO_VER
    10: 10, // HORARIO_CREAR
    11: 11, // HORARIO_MODIFICAR -> HORARIO_EDITAR (11)
    12: 13, // HORARIO_ASIGNAR (Old 12 -> New 13)
    13: 12, // HORARIO_SOFTDELETE -> HORARIO_ELIMINAR (Old 13 -> New 12)
    14: 20, // DISPOSITIVO_VER (Old 14 -> New 20)
    15: 21, // DISPOSITIVO_CREAR (Old 15 -> New 21)
    16: 22, // DISPOSITIVO_MODIFICAR -> DISPOSITIVO_EDITAR (Old 16 -> New 22)
    17: 24, // DISPOSITIVO_ACEPTAR_SOLICITUD -> DISPOSITIVO_GESTIONAR (Old 17 -> New 24)
    18: 15, // DEPARTAMENTO_VER (Old 18 -> New 15)
    19: 16, // DEPARTAMENTO_CREAR (Old 19 -> New 16)
    20: 17, // DEPARTAMENTO_MODIFICAR -> DEPARTAMENTO_EDITAR (Old 20 -> New 17)
    21: 19, // DEPARTAMENTO_ASIGNAR (Old 21 -> New 19)
    22: 18, // DEPARTAMENTO_SOFTDELETE -> DEPARTAMENTO_ELIMINAR (Old 22 -> New 18)
    23: 31, // REGISTRO_VER (Old 23 -> New 31)
    24: 32, // CONFIGURACION_VER -> CONFIG_VER (Old 24 -> New 32)
    25: 33, // CONFIGURACION_MODIFICAR -> CONFIG_GENERAL (Old 25 -> New 33)
    26: 30  // REPORTE_EXPORTAR (Old 26 -> New 30)
};

async function migrate() {
    try {
        console.log('--- Iniciando migración de permisos bitwise ---');
        const roles = await pool.query('SELECT id, nombre, permisos_bitwise, es_admin FROM roles');
        
        for (const rol of roles.rows) {
            const oldBitwise = BigInt(rol.permisos_bitwise || 0);
            let newBitwise = BigInt(0);
            let upgradedToAdmin = false;

            // Procesar cada bit
            for (let i = 0; i <= 63; i++) {
                const mask = BigInt(1) << BigInt(i);
                if ((oldBitwise & mask) !== BigInt(0)) {
                    if (i === 63) {
                        // El antiguo SUPER_ADMIN ahora se maneja por flag
                        upgradedToAdmin = true;
                    } else if (MAPPING[i] !== undefined) {
                        newBitwise |= (BigInt(1) << BigInt(MAPPING[i]));
                    }
                }
            }

            // Si tenía el bit de SUPER_ADMIN, nos aseguramos de que es_admin sea true
            const finalEsAdmin = rol.es_admin || upgradedToAdmin;

            console.log(`Migrando rol: ${rol.nombre} (${rol.id})`);
            console.log(`  Old: ${oldBitwise.toString()} -> New: ${newBitwise.toString()}${upgradedToAdmin ? ' (Elevado a Admin)' : ''}`);

            await pool.query(
                'UPDATE roles SET permisos_bitwise = $1, es_admin = $2 WHERE id = $3',
                [newBitwise.toString(), finalEsAdmin, rol.id]
            );
        }

        console.log('--- Migración completada con éxito ---');
    } catch (err) {
        console.error('Error durante la migración:', err);
    } finally {
        await pool.end();
    }
}

migrate();
