import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Configuramos Nodemailer para Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Tu correo de Gmail, ej: tu_correo@gmail.com
        pass: process.env.EMAIL_PASS  // Tu App Password de Gmail (contraseña de aplicación)
    }
});

/**
 * Envía un correo notificando al usuario que ha sido designado como Administrador.
 * 
 * @param {string} nombre - Nombre del usuario
 * @param {string} correo - Correo electrónico del usuario
 * @param {string} empresa_nombre - Nombre de la empresa
 * @param {string} empresa_identificador - Identificador único (clave) de la empresa
 * @returns {Promise<any>}
 */
export async function enviarCorreoNuevoAdmin(nombre, correo, empresa_nombre, empresa_identificador) {
    if (!correo) return;

    try {
        const mailOptions = {
            from: `"FASITLAC" <${process.env.EMAIL_USER}>`,
            to: correo,
            subject: `Acceso Administrador: ${empresa_nombre || 'FASITLAC'}`,
            html: `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
    </style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Outfit','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;-webkit-font-smoothing:antialiased;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:48px 20px;">
        <tr>
            <td align="center">
                <table width="100%" maxWidth="600" style="max-width:600px;background-color:#ffffff;border-radius:24px;border:1px solid #e2e8f0;box-shadow:0 20px 25px -5px rgba(0,0,0,0.04),0 8px 10px -6px rgba(0,0,0,0.04);overflow:hidden;">
                    
                    <!-- TOP DECORATOR -->
                    <tr>
                        <td style="height:8px;background-color:#2563eb;"></td>
                    </tr>

                    <!-- HEADER -->
                    <tr>
                        <td style="padding:48px 48px 32px;text-align:center;">
                            <h1 style="margin:0;font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.5px;text-transform:uppercase;">FASITLAC</h1>
                            <div style="height:1px;width:40px;background-color:#e2e8f0;margin:16px auto;"></div>
                            <p style="margin:0;font-size:14px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Acceso Administrativo</p>
                        </td>
                    </tr>

                    <!-- CONTENT -->
                    <tr>
                        <td style="padding:0 48px 40px;">
                            <h2 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#1e293b;">Hola, ${nombre}</h2>
                            <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">
                                Has sido designado como <strong>Administrador</strong> para la empresa <span style="color:#0f172a;font-weight:600;">${empresa_nombre || 'FASITLAC'}</span>. A partir de este momento tienes acceso a las herramientas de gestión del sistema.
                            </p>
                        </td>
                    </tr>

                    <!-- IDENTIFIER CARD -->
                    <tr>
                        <td style="padding:0 48px 40px;">
                            <div style="background-color:#f1f5f9;border-radius:16px;padding:24px;border:1px dashed #cbd5e1;">
                                <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Llave de empresa</p>
                                <p style="margin:0;font-size:22px;font-weight:700;color:#0f172a;font-family:monospace;letter-spacing:2px;">${empresa_identificador || 'S/N'}</p>
                                <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;">Utiliza este identificador para vincular nuevos nodos, terminales y configurar dispositivos en la red local.</p>
                            </div>
                        </td>
                    </tr>

                    <!-- CAPABILITIES -->
                    <tr>
                        <td style="padding:0 48px 48px;">
                            <h3 style="margin:0 0 20px;font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;">Capacidades de tu perfil:</h3>
                            
                            <table width="100%" cellpadding="0" cellspacing="0">
                                ${[
                                    { t: 'Afiliación de Nodos', d: 'Registro y vinculación de terminales físicas mediante el identificador.' },
                                    { t: 'Control de Dispositivos', d: 'Gestión de accesos móviles y herramientas de sincronización.' },
                                    { t: 'Gestión de Talento', d: 'Administración de empleados, usuarios y asignación de roles.' },
                                    { t: 'Inteligencia de Datos', d: 'Acceso a reportes automáticos y exportación de incidencias.' }
                                ].map(item => `
                                <tr>
                                    <td style="padding:10px 0;border-top:1px solid #f1f5f9;">
                                        <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">${item.t}</p>
                                        <p style="margin:2px 0 0;font-size:13px;color:#64748b;">${item.d}</p>
                                    </td>
                                </tr>
                                `).join('')}
                            </table>
                        </td>
                    </tr>

                    <!-- FOOTER BAR -->
                    <tr>
                        <td style="padding:32px 48px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
                            <p style="margin:0;font-size:12px;color:#94a3b8;">
                                FASITLAC &bull; Sistema de Gestión de Asistencia Profesional<br>
                                <span style="font-size:11px;margin-top:8px;display:block;">Este es un envío automático, favor de no responder.</span>
                            </p>
                        </td>
                    </tr>
                </table>
                
                <table width="100%" style="max-width:600px;margin-top:24px;">
                    <tr>
                        <td style="text-align:center;">
                            <p style="margin:0;font-size:11px;color:#cbd5e1;text-transform:uppercase;letter-spacing:0.5px;">Powered by FASITLAC Core</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            `
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`Correo enviado a ${correo}: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error('Error al enviar correo de notificación:', error);
    }
}

