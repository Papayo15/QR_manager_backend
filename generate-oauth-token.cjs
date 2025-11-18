const { google } = require('googleapis');
const http = require('http');
const url = require('url');

// Configuración
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || 'TU_CLIENT_ID_AQUI';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || 'TU_CLIENT_SECRET_AQUI';
const OAUTH_REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const oauth2Client = new google.auth.OAuth2(
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_REDIRECT_URI
);

const scopes = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets'
];

console.log('\n🔐 Generador de OAuth Refresh Token\n');
console.log('📋 Client ID:', OAUTH_CLIENT_ID.substring(0, 20) + '...');
console.log('📋 Redirect URI:', OAUTH_REDIRECT_URI);
console.log('\n');

// Generar URL de autorización
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent'
});

console.log('🌐 PASO 1: Abre esta URL en tu navegador:\n');
console.log(authUrl);
console.log('\n');

// Crear servidor temporal
const server = http.createServer(async (req, res) => {
  try {
    if (req.url.indexOf('/oauth2callback') > -1) {
      const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
      const code = qs.get('code');

      console.log('\n✅ Código de autorización recibido');

      res.end('✅ Autorización exitosa! Puedes cerrar esta ventana y volver a la terminal.');

      const { tokens } = await oauth2Client.getToken(code);

      console.log('\n✨ ¡REFRESH TOKEN GENERADO!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Copia este token y pégalo en Render como OAUTH_REFRESH_TOKEN:\n');
      console.log(tokens.refresh_token);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      server.close();
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.end('❌ Error en la autorización. Revisa la terminal.');
    server.close();
    process.exit(1);
  }
});

server.listen(3000, () => {
  console.log('🚀 Servidor local iniciado en http://localhost:3000');
  console.log('⏳ Esperando autorización...\n');
});

setTimeout(() => {
  console.log('\n⏰ Tiempo de espera agotado. Ejecuta el script de nuevo.');
  server.close();
  process.exit(0);
}, 5 * 60 * 1000);
