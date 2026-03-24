import { enviarCorreoNuevoAdmin } from './src/utils/mailer.js';

async function testMailer() {
    console.log("Probando mailer...");
    try {
        await enviarCorreoNuevoAdmin("Administrador de Prueba", "prueba_destino@example.com", "Empresa Test SA de CV");
        console.log("El intentó de envío se ejecutó (verifica posible error de auth si no hay .env)");
    } catch(e) {
        console.error("Error en test:", e);
    }
}

testMailer();
