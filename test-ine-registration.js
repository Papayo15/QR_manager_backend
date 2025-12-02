import fetch from 'node-fetch';
import { readFileSync } from 'fs';

const API_URL = 'https://qr-manager-3z8x.onrender.com';

console.log('\n🧪 PRUEBA DE REGISTRO DE INE\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function testINERegistration() {
  try {
    // Crear una imagen de prueba simple en base64 (un pixel rojo 1x1)
    const testImageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

    console.log('📤 Enviando solicitud de registro de INE...\n');

    const requestData = {
      houseNumber: '99',
      condominio: 'Única',
      nombre: 'Prueba',
      apellido: 'Test',
      numeroINE: '1234567890123',
      curp: 'TEST123456HDFRRS09',
      photoFrontal: testImageBase64,
      photoTrasera: testImageBase64,
      observaciones: 'Registro de prueba - Claude Code'
    };

    const response = await fetch(`${API_URL}/api/register-ine`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    const result = await response.json();

    console.log('📥 Respuesta del servidor:\n');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (result.success) {
      console.log('✅ REGISTRO EXITOSO\n');
      console.log(`   ID: ${result.data.id}`);
      console.log(`   Casa: ${result.data.houseNumber}`);
      console.log(`   Nombre: ${result.data.nombre} ${result.data.apellido}`);
      console.log(`   Condominio: ${result.data.condominio}`);
      console.log(`   Status: ${result.data.status}`);
      console.log(`   Upload Status: ${result.data.uploadStatus}\n`);

      console.log('🔍 VERIFICACIONES:\n');
      console.log('1. ✅ MongoDB: Registro guardado');
      console.log('2. ⏳ Google Drive: Fotos subiendo en background');
      console.log('3. ⏳ Google Sheets: Registro creando en background\n');

      console.log('📋 SIGUIENTE PASOS:\n');
      console.log('1. Espera 10-15 segundos para que suban las fotos');
      console.log('2. Verifica Google Drive:');
      console.log('   https://drive.google.com/drive/folders/1FVILaIjAVPPEfR080WFjjmIRQJtUcqfI');
      console.log('   Busca la carpeta "Única" y dentro las fotos\n');
      console.log('3. Verifica Google Sheets:');
      console.log('   https://docs.google.com/spreadsheets/d/1h_fEz5tDjNmdZ-57F2CoL5W6RjjAF7Yhw4ttJgypb7o');
      console.log('   Busca la pestaña "Única_INE"\n');
      console.log('4. Revisa los logs de Render para ver el progreso:');
      console.log('   https://dashboard.render.com/web/srv-ctgqnhq3esus73a4pne0/logs\n');

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('🎉 ¡Prueba completada! Verifica los resultados arriba.\n');
    } else {
      console.log('❌ ERROR EN EL REGISTRO\n');
      console.log(`   Error: ${result.error}`);
      console.log(`   Detalles: ${result.details || 'N/A'}\n`);
    }

  } catch (error) {
    console.log('❌ ERROR EN LA PRUEBA\n');
    console.log(`   ${error.message}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

// Ejecutar prueba
testINERegistration();
