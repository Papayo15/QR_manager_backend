// Script para regenerar OAuth Refresh Token para Google Drive y Sheets
import { google } from 'googleapis';
import http from 'http';
import { parse } from 'url';
import open from 'open';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets'
];

console.log('\n🔐 REGENERACIÓN DE OAuth REFRESH TOKEN\n');
console.log('📋 Este script te ayudará a obtener un nuevo refresh token.\n');

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Generar URL de autorización
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent' // Forzar solicitud de permiso para obtener refresh token
});

console.log('📝 Paso 1: Autorizar la aplicación');
console.log('Se abrirá tu navegador con Google OAuth...\n');
console.log('Si no se abre automáticamente, copia esta URL:');
console.log(`\n${authUrl}\n`);

// Crear servidor temporal para recibir el código
const server = http.createServer(async (req, res) => {
  try {
    const { query } = parse(req.url, true);

    if (req.url.startsWith('/oauth2callback')) {
      if (query.error) {
        res.end(`❌ Error: ${query.error}`);
        console.error(`\n❌ Error en autorización: ${query.error}`);
        process.exit(1);
      }

      const code = query.code;

      if (!code) {
        res.end('❌ No se recibió código de autorización');
        console.error('\n❌ No se recibió código de autorización');
        process.exit(1);
      }

      console.log('\n✅ Código de autorización recibido');
      console.log('🔄 Intercambiando código por tokens...\n');

      // Intercambiar código por tokens
      const { tokens } = await oauth2Client.getToken(code);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>OAuth Exitoso</title></head>
          <body style="font-family: Arial, sans-serif; padding: 50px; text-align: center;">
            <h1 style="color: green;">✅ Autorización Exitosa</h1>
            <p>Ya puedes cerrar esta ventana y regresar a la terminal.</p>
          </body>
        </html>
      `);

      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ TOKENS OBTENIDOS EXITOSAMENTE');
      console.log('═══════════════════════════════════════════════════════════\n');

      console.log('📋 COPIA ESTOS VALORES A TU .env Y A RENDER:\n');

      if (tokens.refresh_token) {
        console.log('OAUTH_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('\n✅ Refresh Token obtenido (este es el importante)\n');
      } else {
        console.log('⚠️  No se obtenió refresh_token');
        console.log('   Esto puede pasar si ya autorizaste antes.');
        console.log('   Revoca acceso en: https://myaccount.google.com/permissions');
        console.log('   Y vuelve a ejecutar este script.\n');
      }

      console.log('Access Token (temporal):');
      console.log(tokens.access_token);
      console.log('\nExpira en:', tokens.expiry_date ? new Date(tokens.expiry_date).toLocaleString('es-MX') : 'Desconocido');

      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('📝 SIGUIENTE PASO:');
      console.log('═══════════════════════════════════════════════════════════\n');

      console.log('1. Copia el OAUTH_REFRESH_TOKEN de arriba');
      console.log('2. Ve a Render Dashboard: https://dashboard.render.com');
      console.log('3. Selecciona tu servicio: qr-manager-3z8x');
      console.log('4. Ve a "Environment"');
      console.log('5. Busca la variable OAUTH_REFRESH_TOKEN');
      console.log('6. Pega el nuevo valor');
      console.log('7. Guarda cambios');
      console.log('8. Render hará redeploy automáticamente\n');

      server.close();
      setTimeout(() => process.exit(0), 1000);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    res.end('❌ Error: ' + error.message);
    server.close();
    process.exit(1);
  }
});

server.listen(3000, () => {
  console.log('🌐 Servidor temporal corriendo en http://localhost:3000');
  console.log('⏳ Esperando autorización...\n');

  // Abrir navegador automáticamente
  open(authUrl).catch(err => {
    console.warn('⚠️  No se pudo abrir el navegador automáticamente');
    console.warn('   Abre manualmente la URL mostrada arriba');
  });
});
