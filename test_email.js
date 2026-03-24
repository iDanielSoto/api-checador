import { validarCorreoReal } from './src/utils/emailValidator.js';

async function test() {
    console.log("Testeando correo falso: test@dominioinventado999xyz.com");
    const fake = await validarCorreoReal("test@dominioinventado999xyz.com");
    console.log("Resultado falso:", fake);

    console.log("Testeando correo real: prueba@gmail.com");
    const real = await validarCorreoReal("prueba@gmail.com");
    console.log("Resultado real:", real);
}

test();
