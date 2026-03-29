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
<body style="margin:0;padding:0;background-color:#ffffff;font-family:'Outfit','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;-webkit-font-smoothing:antialiased;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:60px 20px;">
        <tr>
            <td align="center">
                <table width="100%" maxWidth="600" style="max-width:600px;background-color:#ffffff;border:1px solid #000000;border-collapse:collapse;">
                    
                    <!-- HIGH-PRIORITY HEADER BAR -->
                    <tr>
                        <td style="height:4px;background-color:#000000;"></td>
                    </tr>
                    <tr>
                        <td style="height:12px;background-color:#2563eb;"></td>
                    </tr>
                    
                    <!-- BRANDING -->
                    <tr>
                        <td style="padding:40px 40px 20px;text-align:left;border-bottom:1px solid #f1f5f9;">
                            <h1 style="margin:0;font-size:18px;font-weight:800;color:#000000;letter-spacing:1px;text-transform:uppercase;">FASITLAC</h1>
                            <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:2px;">Gestión de Asistencia Profesional</p>
                        </td>
                    </tr>

                    <!-- MAIN MESSAGE -->
                    <tr>
                        <td style="padding:40px 40px 30px;">
                            <p style="margin:0 0 16px;font-size:12px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:1px;">Acceso Administrativo Designado</p>
                            <h2 style="margin:0 0 20px;font-size:28px;font-weight:700;color:#000000;letter-spacing:-0.5px;line-height:1.1;">Hola, ${nombre}</h2>
                            <p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">
                                Se han habilitado sus credenciales de <strong>Administrador</strong> para la instancia <span style="color:#000000;font-weight:700;border-bottom:2px solid #2563eb;">${empresa_nombre || 'FASITLAC'}</span>.
                            </p>
                        </td>
                    </tr>

                    <!-- IDENTIFIER CARD (FLAT) -->
                    <tr>
                        <td style="padding:0 40px 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;background-color:#f8fafc;">
                                <tr>
                                    <td style="padding:24px;">
                                        <p style="margin:0 0 12px;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Llave de Configuración de Empresa</p>
                                        <p style="margin:0;font-size:24px;font-weight:700;color:#000000;font-family:monospace;letter-spacing:3px;">${empresa_identificador || 'S/N'}</p>
                                        <div style="height:1px;width:30px;background-color:#cbd5e1;margin:16px 0;"></div>
                                        <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;max-width:400px;">Utilice esta clave para vincular dispositivos, terminales biométricas y configurar nodos en la red local de la empresa.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- PERMISSIONS LIST -->
                    <tr>
                        <td style="padding:0 40px 40px;">
                            <h3 style="margin:0 0 20px;font-size:11px;font-weight:800;color:#000000;text-transform:uppercase;letter-spacing:1.5px;border-bottom:1px solid #000000;display:inline-block;padding-bottom:4px;">Privilegios del Perfil</h3>
                            
                            <table width="100%" cellpadding="0" cellspacing="0">
                                ${[
                                    { t: 'AFILIACIÓN', d: 'Gestión de nodos y terminales físicas.' },
                                    { t: 'DISPOSITIVOS', d: 'Control de accesos móviles y sincronización.' },
                                    { t: 'TALENTO', d: 'Administración de personal y roles.' },
                                    { t: 'REPORTES', d: 'Inteligencia de datos e incidencias.' }
                                ].map(item => `
                                <tr>
                                    <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td width="100">
                                                    <p style="margin:0;font-size:10px;font-weight:800;color:#2563eb;letter-spacing:0.5px;">${item.t}</p>
                                                </td>
                                                <td>
                                                    <p style="margin:0;font-size:13px;color:#475569;font-weight:500;">${item.d}</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                `).join('')}
                            </table>
                        </td>
                    </tr>

                    <!-- TECHNICAL FOOTER -->
                    <tr>
                        <td style="padding:40px;background-color:#000000;text-align:left;">
                            <p style="margin:0;font-size:11px;color:#ffffff;font-weight:400;letter-spacing:0.5px;line-height:1.8;">
                                <strong style="color:#2563eb;font-weight:800;">FASITLAC CORE SYSTEM</strong><br>
                                Sistema de Gestión de Asistencia Profesional<br>
                                Propiedad de ${empresa_nombre || 'FASITLAC'}<br>
                                <span style="color:#64748b;margin-top:10px;display:block;font-size:10px;">Este es un mensaje institucional generado automáticamente por el servidor de seguridad.</span>
                            </p>
                        </td>
                    </tr>
                </table>
                
                <table width="100%" style="max-width:600px;margin-top:20px;">
                    <tr>
                        <td style="text-align:right;">
                            <p style="margin:0;font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Powered by FASITLAC v3.2.0</p>
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

