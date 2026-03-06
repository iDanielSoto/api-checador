import { pool } from './src/config/db.js';

async function main() {
    try {
        const query = `
      ALTER TABLE empresas
      ADD COLUMN IF NOT EXISTS configuracion_reportes JSONB DEFAULT '{
        "encabezado": {
          "mostrar_logo": true,
          "texto_izquierdo": "",
          "texto_derecho": "",
          "color_fondo": "#ffffff",
          "color_texto": "#000000"
        },
        "pie_pagina": {
          "texto_central": "",
          "mostrar_numeracion": true,
          "color_texto": "#666666"
        },
        "fuente": "Helvetica"
      }'::jsonb;
    `;

        await pool.query(query);
        console.log("Columna configuracion_reportes agregada exitosamente a la tabla empresas.");
    } catch (err) {
        console.error("Error al alterar la tabla:", err);
    } finally {
        pool.end();
    }
}

main();
