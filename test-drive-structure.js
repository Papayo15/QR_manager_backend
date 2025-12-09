// Script de prueba para verificar la estructura de Drive
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { readFileSync } from 'fs';

dotenv.config();

// Configurar OAuth
const oauth2Client = new google.auth.OAuth2(
  process.env.OAUTH_CLIENT_ID,
  process.env.OAUTH_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.OAUTH_REFRESH_TOKEN
});

const driveService = google.drive({ version: 'v3', auth: oauth2Client });
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '1FVILaIjAVPPEtR080WFjjmIRQJtUcqfI';

// Función para listar archivos dentro de una carpeta
async function listFilesInFolder(folderId) {
  try {
    const query = `'${folderId}' in parents and trashed=false`;
    const response = await driveService.files.list({
      q: query,
      fields: 'files(id, name, mimeType)',
      spaces: 'drive'
    });

    return response.data.files || [];
  } catch (error) {
    console.error(`Error listando archivos:`, error.message);
    return [];
  }
}

async function testDriveStructure() {
  console.log('🔍 Probando conexión a Drive...\n');

  try {
    // 1. Listar carpetas de condominios
    const condominios = await listFilesInFolder(DRIVE_FOLDER_ID);
    const condominioFolders = condominios.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

    console.log(`✅ Carpeta raíz: ${DRIVE_FOLDER_ID}`);
    console.log(`📁 Condominios encontrados: ${condominioFolders.length}\n`);

    for (const condominio of condominioFolders.slice(0, 2)) { // Solo primeros 2
      console.log(`\n📂 Condominio: ${condominio.name}`);

      // 2. Listar carpetas de casas
      const casas = await listFilesInFolder(condominio.id);
      const casaFolders = casas.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

      console.log(`   🏠 Casas encontradas: ${casaFolders.length}`);

      for (const casa of casaFolders.slice(0, 2)) { // Solo primeras 2 casas
        console.log(`\n   📁 ${casa.name}`);

        // 3. Listar carpetas de años
        const years = await listFilesInFolder(casa.id);
        const yearFolders = years.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

        if (yearFolders.length > 0) {
          console.log(`      📅 Años encontrados: ${yearFolders.map(y => y.name).join(', ')}`);

          // 4. Listar carpetas de meses del primer año
          const year = yearFolders[0];
          const months = await listFilesInFolder(year.id);
          const monthFolders = months.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

          if (monthFolders.length > 0) {
            console.log(`      📆 Meses en ${year.name}: ${monthFolders.map(m => m.name).join(', ')}`);

            // 5. Listar carpetas de días del primer mes
            const month = monthFolders[0];
            const days = await listFilesInFolder(month.id);
            const dayFolders = days.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

            if (dayFolders.length > 0) {
              console.log(`      📅 Días en ${month.name}: ${dayFolders.map(d => d.name).join(', ')}`);

              // 6. Listar archivos del primer día
              const day = dayFolders[0];
              const files = await listFilesInFolder(day.id);
              const imageFiles = files.filter(f => f.mimeType && f.mimeType.startsWith('image/'));

              console.log(`\n      ✅ Estructura completa: ${condominio.name}/${casa.name}/${year.name}/${month.name}/${day.name}`);
              console.log(`      📸 Archivos en día ${day.name}: ${imageFiles.length}`);

              if (imageFiles.length > 0) {
                console.log(`      📄 Ejemplos de archivos:`);
                imageFiles.slice(0, 3).forEach(f => {
                  console.log(`         - ${f.name}`);
                });
              }
            } else {
              console.log(`      ⚠️  No hay carpetas de días en ${month.name}`);
            }
          } else {
            console.log(`      ⚠️  No hay carpetas de meses en ${year.name}`);
          }
        } else {
          console.log(`      ⚠️  No hay carpetas de años en ${casa.name}`);
        }
      }
    }

    console.log('\n\n✅ Prueba completada exitosamente');

  } catch (error) {
    console.error('\n❌ Error en prueba:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Ejecutar prueba
testDriveStructure();
