import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

// Script de prueba para verificar que OAuth funciona correctamente

async function testOAuth() {
  console.log('\n🔍 VERIFICANDO CONFIGURACIÓN OAUTH\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Verificar variables de entorno
  const requiredVars = {
    'OAUTH_CLIENT_ID': process.env.OAUTH_CLIENT_ID,
    'OAUTH_CLIENT_SECRET': process.env.OAUTH_CLIENT_SECRET,
    'OAUTH_REFRESH_TOKEN': process.env.OAUTH_REFRESH_TOKEN,
    'DRIVE_FOLDER_ID': process.env.DRIVE_FOLDER_ID,
    'SPREADSHEET_ID': process.env.SPREADSHEET_ID
  };

  console.log('📋 Variables de entorno:\n');
  let allVarsPresent = true;
  for (const [key, value] of Object.entries(requiredVars)) {
    if (value) {
      const displayValue = value.length > 50 ? value.substring(0, 30) + '...' : value;
      console.log(`   ✅ ${key}: ${displayValue}`);
    } else {
      console.log(`   ❌ ${key}: NO CONFIGURADA`);
      allVarsPresent = false;
    }
  }

  if (!allVarsPresent) {
    console.log('\n❌ Faltan variables de entorno. Configúralas y ejecuta de nuevo.\n');
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔐 Probando autenticación OAuth...\n');

  try {
    // Crear cliente OAuth
    const oauth2Client = new google.auth.OAuth2(
      process.env.OAUTH_CLIENT_ID,
      process.env.OAUTH_CLIENT_SECRET,
      'http://localhost:3000/oauth2callback'
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.OAUTH_REFRESH_TOKEN
    });

    // Probar Google Drive
    const driveService = google.drive({ version: 'v3', auth: oauth2Client });

    console.log('📁 Probando acceso a Google Drive...');
    const driveResponse = await driveService.files.get({
      fileId: process.env.DRIVE_FOLDER_ID,
      fields: 'id, name, mimeType'
    });

    console.log(`   ✅ Carpeta encontrada: "${driveResponse.data.name}"`);
    console.log(`   📂 ID: ${driveResponse.data.id}`);

    // Listar archivos en la carpeta
    console.log('\n📂 Listando contenido de la carpeta...');
    const filesList = await driveService.files.list({
      q: `'${process.env.DRIVE_FOLDER_ID}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 5
    });

    if (filesList.data.files.length > 0) {
      console.log(`   📄 Archivos recientes (${filesList.data.files.length}):`);
      filesList.data.files.forEach(file => {
        const icon = file.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
        console.log(`      ${icon} ${file.name}`);
      });
    } else {
      console.log('   📭 La carpeta está vacía');
    }

    // Probar Google Sheets
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 Probando acceso a Google Sheets...\n');

    const sheetsService = google.sheets({ version: 'v4', auth: oauth2Client });
    const sheetResponse = await sheetsService.spreadsheets.get({
      spreadsheetId: process.env.SPREADSHEET_ID
    });

    console.log(`   ✅ Spreadsheet encontrado: "${sheetResponse.data.properties.title}"`);
    console.log(`   📊 ID: ${process.env.SPREADSHEET_ID}`);
    console.log(`   📑 Pestañas (${sheetResponse.data.sheets.length}):`);
    sheetResponse.data.sheets.forEach(sheet => {
      console.log(`      • ${sheet.properties.title}`);
    });

    // Probar escritura en Drive (crear archivo de prueba)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✍️  Probando escritura en Drive...\n');

    const testContent = `Prueba de OAuth - ${new Date().toISOString()}`;
    const testFile = await driveService.files.create({
      requestBody: {
        name: `test_oauth_${Date.now()}.txt`,
        parents: [process.env.DRIVE_FOLDER_ID],
        mimeType: 'text/plain'
      },
      media: {
        mimeType: 'text/plain',
        body: testContent
      },
      fields: 'id, name, webViewLink'
    });

    console.log(`   ✅ Archivo de prueba creado: "${testFile.data.name}"`);
    console.log(`   🔗 URL: ${testFile.data.webViewLink}`);

    // Hacer el archivo público
    await driveService.permissions.create({
      fileId: testFile.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    console.log(`   🔓 Archivo configurado como público`);

    // Eliminar archivo de prueba
    await driveService.files.delete({
      fileId: testFile.data.id
    });

    console.log(`   🗑️  Archivo de prueba eliminado`);

    // Resultado final
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✨ ¡TODAS LAS PRUEBAS PASARON!\n');
    console.log('✅ OAuth está configurado correctamente');
    console.log('✅ Google Drive: lectura y escritura funcionan');
    console.log('✅ Google Sheets: acceso confirmado');
    console.log('\n🚀 El backend está listo para subir fotos\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('❌ ERROR EN LA CONFIGURACIÓN\n');
    console.log(`Error: ${error.message}\n`);

    if (error.message.includes('invalid_grant')) {
      console.log('💡 Solución: El refresh token expiró o es inválido.');
      console.log('   Genera uno nuevo ejecutando: node generate-oauth-token.cjs\n');
    } else if (error.message.includes('File not found')) {
      console.log('💡 Solución: Verifica que DRIVE_FOLDER_ID sea correcto.');
      console.log(`   ID actual: ${process.env.DRIVE_FOLDER_ID}\n`);
    } else if (error.message.includes('storage quota')) {
      console.log('💡 Solución: Service Account no tiene almacenamiento.');
      console.log('   Asegúrate de que OAuth esté configurado correctamente.\n');
    } else {
      console.log('💡 Verifica los logs completos arriba para más detalles.\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(1);
  }
}

// Ejecutar pruebas
testOAuth();
