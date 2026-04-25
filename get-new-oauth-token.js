// Script simple para regenerar OAuth Refresh Token
import { google } from 'googleapis';
import http from 'http';
import { parse } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets'
];

console.log('\n🔐 REGENERAR OAuth REFRESH TOKEN\n');
console.log('════════════════════════════════════════════════════════════\n');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Error: Faltan OAUTH_CLIENT_ID o OAUTH_CLIENT_SECRET en .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Generar URL de autorización
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent' // Importante: forzar para obtener refresh token
});

console.log('📝 PASO 1: Abre esta URL en tu navegador:\n');
console.log(authUrl);
console.log('\n════════════════════════════════════════════════════════════\n');
console.log('⏳ Esperando autorización en http://localhost:3000...\n');

// Crear servidor para recibir el callback
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/oauth2callback')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  try {
    const { query } = parse(req.url, true);

    if (query.error) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<html><body><h1>❌ Error: ${query.error}</h1></body></html>`);
      console.error(`\n❌ Error: ${query.error}`);
      server.close();
      process.exit(1);
      return;
    }

    const code = query.code;
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>❌ No se recibió código</h1></body></html>');
      console.error('\n❌ No se recibió código de autorización');
      server.close();
      process.exit(1);
      return;
    }

    console.log('✅ Código recibido, intercambiando por tokens...\n');

    // Obtener tokens
    const { tokens } = await oauth2Client.getToken(code);

    // Responder al navegador
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <head>
          <meta charset="utf-8">
          <title>✅ OAuth Exitoso</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 10px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              text-align: center;
            }
            h1 { color: #4CAF50; margin: 0 0 20px 0; }
            p { color: #666; font-size: 18px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Autorización Exitosa</h1>
            <p>Ya puedes cerrar esta ventana y regresar a la terminal.</p>
          </div>
        </body>
      </html>
    `);

    // Mostrar resultados en consola
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('✅ TOKENS OBTENIDOS EXITOSAMENTE');
    console.log('════════════════════════════════════════════════════════════\n');

    if (tokens.refresh_token) {
      console.log('🔑 NUEVO REFRESH TOKEN:\n');
      console.log(tokens.refresh_token);
      console.log('\n════════════════════════════════════════════════════════════');
      console.log('📋 CÓMO ACTUALIZAR EN RENDER:');
      console.log('════════════════════════════════════════════════════════════\n');
      console.log('1. Ve a: https://dashboard.render.com');
      console.log('2. Selecciona tu servicio: qr-manager-3z8x');
      console.log('3. Click en "Environment" en el menú izquierdo');
      console.log('4. Busca la variable: OAUTH_REFRESH_TOKEN');
      console.log('5. Click en "Edit" (lápiz)');
      console.log('6. Pega el nuevo token de arriba');
      console.log('7. Click "Save Changes"');
      console.log('8. Render hará redeploy automático en 1-2 min\n');
      console.log('════════════════════════════════════════════════════════════\n');
    } else {
      console.log('\n⚠️  WARNING: No se obtenió refresh_token');
      console.log('\nEsto pasa cuando ya autorizaste la app antes.');
      console.log('Para solucionarlo:\n');
      console.log('1. Ve a: https://myaccount.google.com/permissions');
      console.log('2. Busca tu aplicación OAuth');
      console.log('3. Click "Quitar acceso"');
      console.log('4. Ejecuta este script nuevamente\n');
      console.log('════════════════════════════════════════════════════════════\n');
    }

    // Cerrar servidor
    setTimeout(() => {
      console.log('👋 Cerrando servidor...\n');
      server.close();
      process.exit(0);
    }, 2000);

  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<html><body><h1>❌ Error: ${error.message}</h1></body></html>`);
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    server.close();
    process.exit(1);
  }
});

server.listen(3000, () => {
  console.log('🌐 Servidor iniciado en http://localhost:3000');
  console.log('📌 Asegúrate de que este puerto no esté en uso\n');
});

// Manejar cierre
process.on('SIGINT', () => {
  console.log('\n\n👋 Cancelado por usuario');
  server.close();
  process.exit(0);
});
