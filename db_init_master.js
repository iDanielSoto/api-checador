
import { pool } from './src/config/db.js';
import { generateId, ID_PREFIXES } from './src/utils/idGenerator.js';

async function init() {
    try {
        const res = await pool.query("SELECT id FROM empresas WHERE id = 'MASTER'");
        if (res.rows.length === 0) {
            const configId = await generateId(ID_PREFIXES.CONFIGURACION);
            await pool.query("INSERT INTO configuraciones (id, idioma) VALUES ($1, 'es')", [configId]);
            await pool.query("INSERT INTO empresas (id, nombre, identificador, configuracion_id) VALUES ('MASTER', 'Administración SaaS', 'master', $1)", [configId]);
            console.log('Empresa MASTER creada');
        } else {
            console.log('Empresa MASTER ya existe');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

init();
