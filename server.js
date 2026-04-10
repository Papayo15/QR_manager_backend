import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { Readable } from 'stream';
import PDFDocument from 'pdfkit';
import cron from 'node-cron';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Permitir fotos grandes en base64
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Variables globales
let db;
let mongoClient;

// ============================================
// CONFIGURACIÓN DE GOOGLE DRIVE Y SHEETS
// ============================================

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '1FVILaIjAVPPEtR080WFjjmIRQJtUcqfI';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1h_fEz5tDjNmdZ-57F2CoL5W6RjjAF7Yhw4ttJgypb7o';
const SHEET_NAME = 'QR Codes'; // Nombre de la pestaña donde se guardarán los QR

let driveService;
let sheetsService;

// Caché de carpetas de condominios (para evitar búsquedas repetidas)
const condominioFoldersCache = new Map();

// Función para normalizar nombres de condominios (quitar acentos y caracteres especiales)
function normalizeCondominioName(name) {
  if (!name) return '';

  return name
    .normalize('NFD') // Descomponer caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Eliminar marcas diacríticas (acentos)
    .replace(/[^a-zA-Z0-9_]/g, '_') // Reemplazar caracteres especiales con _
    .replace(/_+/g, '_') // Eliminar _ duplicados
    .replace(/^_|_$/g, ''); // Eliminar _ al inicio/final
}

// Variable global para oauth2Client
let oauth2Client = null;

async function initializeGoogleServices() {
  try {
    // Verificar si tenemos credenciales OAuth (RECOMENDADO para subir archivos)
    if (process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET && process.env.OAUTH_REFRESH_TOKEN) {
      console.log('🔐 Usando OAuth para Google Drive y Sheets');

      oauth2Client = new google.auth.OAuth2(
        process.env.OAUTH_CLIENT_ID,
        process.env.OAUTH_CLIENT_SECRET,
        'http://localhost:3000/oauth2callback' // Redirect URI (no se usa en servidor, pero es requerido)
      );

      // Configurar el refresh token
      oauth2Client.setCredentials({
        refresh_token: process.env.OAUTH_REFRESH_TOKEN
      });

      // Manejar renovación automática de tokens
      oauth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
          console.log('🔄 Nuevo refresh token recibido (esto es raro, guárdalo)');
          console.log('Nuevo refresh token:', tokens.refresh_token);
        }
        if (tokens.access_token) {
          console.log('✅ Access token renovado automáticamente');
        }
      });

      // Inicializar servicios con OAuth
      driveService = google.drive({ version: 'v3', auth: oauth2Client });
      sheetsService = google.sheets({ version: 'v4', auth: oauth2Client });

      console.log('✅ Google Drive inicializado con OAuth (auto-renovación habilitada)');
      console.log('✅ Google Sheets inicializado con OAuth (auto-renovación habilitada)');

      return { driveService, sheetsService };
    }
    // Service Account — sin expiración, recomendado para producción
    else {
      console.log('🔐 Usando Service Account para Google Drive y Sheets (sin expiración)');
      let credentials;

      // Intentar leer desde archivo primero (desarrollo local)
      try {
        credentials = JSON.parse(readFileSync('./google-credentials.json', 'utf8'));
        console.log('📁 Credenciales cargadas desde archivo');
      } catch {
        // Si no existe el archivo, usar variables de entorno (producción en Render)
        if (process.env.GOOGLE_CREDENTIALS) {
          credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
          console.log('🔐 Credenciales cargadas desde variable de entorno');
        } else {
          throw new Error('No se encontraron credenciales de Google (ni OAuth ni Service Account)');
        }
      }

      const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/spreadsheets'
        ],
      });

      // Inicializar Drive
      driveService = google.drive({ version: 'v3', auth });
      console.log('✅ Google Drive inicializado con Service Account (sin expiración)');

      // Inicializar Sheets
      sheetsService = google.sheets({ version: 'v4', auth });
      console.log('✅ Google Sheets inicializado');

      return { driveService, sheetsService };
    }
  } catch (error) {
    console.error('❌ Error inicializando servicios de Google:', error.message);
    return null;
  }
}

// Función auxiliar para crear/obtener una carpeta dentro de otra
async function getOrCreateSubfolder(parentFolderId, folderName, cacheKey = null) {
  if (!driveService) {
    return null;
  }

  try {
    // Verificar caché si existe cacheKey
    if (cacheKey && condominioFoldersCache.has(cacheKey)) {
      return condominioFoldersCache.get(cacheKey);
    }

    // Buscar si ya existe la carpeta
    const query = `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    const response = await driveService.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    // Si existe, retornar el ID
    if (response.data.files && response.data.files.length > 0) {
      const folderId = response.data.files[0].id;
      if (cacheKey) {
        condominioFoldersCache.set(cacheKey, folderId);
      }
      return folderId;
    }

    // Si no existe, crear la carpeta
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    };

    const folder = await driveService.files.create({
      requestBody: folderMetadata,
      fields: 'id'
    });

    const folderId = folder.data.id;
    if (cacheKey) {
      condominioFoldersCache.set(cacheKey, folderId);
    }
    console.log(`📁 Carpeta creada: ${folderName}`);

    return folderId;
  } catch (error) {
    console.error(`❌ Error con carpeta ${folderName}:`, error.message);

    // Detectar si es un error de OAuth y notificar
    await handleOAuthError(error, `Crear/obtener carpeta: ${folderName}`);

    return null;
  }
}

// Función para crear estructura jerárquica: Condominio > Casa > Año > Mes
// Retorna: { folderId, day } - el día se incluirá en el nombre del archivo
async function getOrCreateINEFolderStructure(condominioName, houseNumber, registrationDate = new Date()) {
  try {
    // Normalizar nombres
    const condominioNormalizado = normalizeCondominioName(condominioName);

    // Obtener fecha de registro (timezone México)
    const mexicoDate = new Date(registrationDate.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    const year = mexicoDate.getFullYear();
    const monthNumber = mexicoDate.getMonth() + 1; // 1-12
    const day = String(mexicoDate.getDate()).padStart(2, '0'); // 01-31

    // Nombres de meses en español (3 letras)
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthText = monthNames[monthNumber - 1]; // "Ene", "Feb", etc.

    // 1. Carpeta del condominio
    const condominioFolderId = await getOrCreateSubfolder(
      DRIVE_FOLDER_ID,
      condominioNormalizado,
      `condo_${condominioNormalizado}`
    );

    if (!condominioFolderId) return null;

    // 2. Carpeta del año
    const yearFolderId = await getOrCreateSubfolder(
      condominioFolderId,
      String(year),
      `${condominioNormalizado}_${year}`
    );

    if (!yearFolderId) return null;

    // 3. Carpeta del mes
    const monthFolderId = await getOrCreateSubfolder(
      yearFolderId,
      monthText,
      `${condominioNormalizado}_${year}_${monthText}`
    );

    if (!monthFolderId) return null;

    // 4. Carpeta del día
    const dayFolderId = await getOrCreateSubfolder(
      monthFolderId,
      day,
      `${condominioNormalizado}_${year}_${monthText}_${day}`
    );

    if (!dayFolderId) return null;

    // 5. Carpeta de la casa (última carpeta)
    const casaFolderId = await getOrCreateSubfolder(
      dayFolderId,
      `Casa_${houseNumber}`,
      `${condominioNormalizado}_${year}_${monthText}_${day}_casa_${houseNumber}`
    );

    console.log(`✅ Ruta: ${condominioNormalizado}/${year}/${monthText}/${day}/Casa_${houseNumber}`);

    // Retornar el folderId de la casa (ya no necesitamos incluir día en el nombre)
    return { folderId: casaFolderId, day };

  } catch (error) {
    console.error('❌ Error creando estructura INE:', error.message);
    return null;
  }
}

// Función para listar archivos dentro de una carpeta de Drive
async function listFilesInFolder(folderId) {
  if (!driveService) return [];

  try {
    const query = `'${folderId}' in parents and trashed=false`;
    const response = await driveService.files.list({
      q: query,
      fields: 'files(id, name, mimeType, createdTime)',
      spaces: 'drive'
    });

    return response.data.files || [];
  } catch (error) {
    console.error(`Error listando archivos en carpeta ${folderId}:`, error.message);

    // Detectar si es un error de OAuth y notificar
    await handleOAuthError(error, 'Listar archivos en Drive');

    return [];
  }
}

// Función para generar reporte mensual escaneando Drive
async function generateMonthlyReportFromDrive(month, year, condominioFilter = null) {
  if (!driveService) {
    return { total: 0, porTipo: {}, porCasa: {}, archivos: [] };
  }

  const monthNumber = parseInt(month);
  const yearStr = String(year);

  // Nombres de meses en español (3 letras)
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthText = monthNames[monthNumber - 1]; // "Ene", "Feb", etc.
  const monthStr = String(monthNumber).padStart(2, '0'); // "01", "02", etc. (para las fechas)

  console.log(`📊 Escaneando Drive para ${yearStr}/${monthText}...`);

  const report = {
    total: 0,
    porTipo: {},
    porCasa: {},
    archivos: []
  };

  try {
    // 1. Listar carpetas de condominios
    const condominiosFiles = await listFilesInFolder(DRIVE_FOLDER_ID);
    const condominioFolders = condominiosFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

    for (const condominioFolder of condominioFolders) {
      const condominioName = condominioFolder.name;

      // Si hay filtro de condominio, saltar si no coincide
      if (condominioFilter && condominioName.toLowerCase() !== normalizeCondominioName(condominioFilter).toLowerCase()) {
        continue;
      }

      console.log(`  📁 Condominio: ${condominioName}`);

      // 2. Buscar carpeta del año
      const yearsFiles = await listFilesInFolder(condominioFolder.id);
      const yearFolder = yearsFiles.find(f => f.name === yearStr && f.mimeType === 'application/vnd.google-apps.folder');

      if (!yearFolder) continue;

      // 3. Buscar carpeta del mes (ahora con texto: "Ene", "Feb", etc.)
      const monthsFiles = await listFilesInFolder(yearFolder.id);
      const monthFolder = monthsFiles.find(f => f.name === monthText && f.mimeType === 'application/vnd.google-apps.folder');

      if (!monthFolder) continue;

      // 4. Listar carpetas de días
      const daysFiles = await listFilesInFolder(monthFolder.id);
      const dayFolders = daysFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

      for (const dayFolder of dayFolders) {
        const diaDelMes = dayFolder.name; // "01", "02", ..., "31"

        // 5. Listar carpetas de casas dentro del día
        const casasFiles = await listFilesInFolder(dayFolder.id);
        const casaFolders = casasFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

        for (const casaFolder of casaFolders) {
          const casaNumber = casaFolder.name.replace('Casa_', '');

          console.log(`    🏠 Casa ${casaNumber} - ${diaDelMes}/${monthText}/${yearStr}`);

          // 6. Listar archivos en la carpeta de la casa
          const filesInCasa = await listFilesInFolder(casaFolder.id);
          const imageFiles = filesInCasa.filter(f => f.mimeType && f.mimeType.startsWith('image/'));

          for (const file of imageFiles) {
            // Extraer información del nombre del archivo
            // Formato nuevo: Nombre_Apellido_Tipo_19h30_Frontal_timestamp.jpg
            const parts = file.name.split('_');

            let tipoEmpleado = 'General';
            let nombreEmpleado = parts[0] || 'Desconocido';

            // El tipo está antes de la hora (formato XXhYY)
            // Buscar parte que contenga "h" (hora)
            for (let i = 0; i < parts.length; i++) {
              if (parts[i].includes('h') && /^\d{2}h\d{2}$/.test(parts[i])) {
                // El tipo está justo antes de la hora
                if (i > 0) {
                  tipoEmpleado = parts[i - 1];
                }
                break;
              }
            }

            // Solo contar fotos frontales para evitar duplicados
            if (file.name.includes('_Frontal_')) {
              report.total++;
              report.porTipo[tipoEmpleado] = (report.porTipo[tipoEmpleado] || 0) + 1;
              report.porCasa[casaNumber] = (report.porCasa[casaNumber] || 0) + 1;

              report.archivos.push({
                nombre: file.name,
                condominio: condominioName,
                casa: casaNumber,
                dia: diaDelMes,
                tipo: tipoEmpleado,
                fecha: `${yearStr}-${monthStr}-${diaDelMes}`
              });
            }
          }
        }
      }
    }

    console.log(`✅ Reporte generado desde Drive: ${report.total} registros`);
    return report;

  } catch (error) {
    console.error('❌ Error generando reporte desde Drive:', error.message);
    return report;
  }
}

// Función para subir foto a Google Drive (recibe folderId directamente)
async function uploadPhotoToDrive(photoBase64, fileName, targetFolderId, mimeType = 'image/jpeg') {
  if (!driveService) {
    console.warn('⚠️ Google Drive no está inicializado');
    return null;
  }

  try {
    // Convertir base64 a buffer
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Crear stream del buffer
    const stream = Readable.from(buffer);

    // Si no hay folderId, usar carpeta principal como fallback
    const finalFolderId = targetFolderId || DRIVE_FOLDER_ID;

    const fileMetadata = {
      name: fileName,
      parents: [finalFolderId]
    };

    const media = {
      mimeType: mimeType,
      body: stream
    };

    const file = await driveService.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink'
    });

    // Hacer el archivo público — no fatal: si falla, la foto igual queda guardada
    try {
      await driveService.permissions.create({
        fileId: file.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });
    } catch (permError) {
      console.warn(`⚠️ No se pudo hacer pública la foto (continuando de todas formas): ${permError.message}`);
    }

    // Obtener URL directa de visualización
    const directUrl = `https://drive.google.com/uc?export=view&id=${file.data.id}`;

    console.log(`📤 Foto subida: ${fileName}`);
    console.log(`🔓 URL pública: ${directUrl}`);

    return {
      fileId: file.data.id,
      webViewLink: file.data.webViewLink,
      webContentLink: file.data.webContentLink,
      directUrl: directUrl
    };
  } catch (error) {
    console.error('❌ Error subiendo foto a Drive:', error.message);
    return null;
  }
}

// Función para obtener o crear pestaña por condominio y casa (para QR codes)
async function getOrCreateCondominioSheet(condominioName, houseNumber = null) {
  if (!sheetsService) {
    console.warn('⚠️ Google Sheets no está inicializado');
    return null;
  }

  try {
    // Normalizar nombre del condominio
    const condominioNormalizado = normalizeCondominioName(condominioName);

    // Crear nombre de pestaña: {Condominio}_{Casa} o solo {Condominio} si no hay casa
    const sheetName = houseNumber
      ? `${condominioNormalizado}_${houseNumber}`
      : condominioNormalizado;

    // Obtener todas las pestañas existentes
    const spreadsheet = await sheetsService.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });

    // Buscar si ya existe la pestaña
    const existingSheet = spreadsheet.data.sheets.find(
      sheet => sheet.properties.title === sheetName
    );

    if (existingSheet) {
      console.log(`📄 Pestaña existente encontrada: ${sheetName}`);
      return sheetName;
    }

    // Si no existe, crear la pestaña
    await sheetsService.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: sheetName
            }
          }
        }]
      }
    });

    // Agregar encabezados a la nueva pestaña
    const headers = [
      ['Código', 'Casa', 'Condominio', 'Visitante', 'Residente', 'Creado', 'Expira', 'Estado', 'Usado', 'Fecha Uso']
    ];

    await sheetsService.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:J1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: headers
      }
    });

    console.log(`✨ Nueva pestaña creada: ${sheetName}`);
    return sheetName;
  } catch (error) {
    console.error('❌ Error creando/buscando pestaña:', error.message);
    return null;
  }
}

// Función para obtener o crear pestaña de INE por condominio
async function getOrCreateINESheet(condominioName) {
  if (!sheetsService) {
    console.warn('⚠️ Google Sheets no está inicializado');
    return null;
  }

  try {
    // Normalizar nombre del condominio
    const condominioNormalizado = normalizeCondominioName(condominioName);
    const sheetName = `${condominioNormalizado}_INE`;

    // Obtener todas las pestañas existentes
    const spreadsheet = await sheetsService.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });

    // Buscar si ya existe la pestaña de INE del condominio
    const existingSheet = spreadsheet.data.sheets.find(
      sheet => sheet.properties.title === sheetName
    );

    if (existingSheet) {
      console.log(`📄 Pestaña INE existente encontrada: ${sheetName}`);
      return sheetName;
    }

    // Si no existe, crear la pestaña
    await sheetsService.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: sheetName
            }
          }
        }]
      }
    });

    // Agregar encabezados a la nueva pestaña
    const headers = [
      ['Fecha Registro', 'Casa', 'Condominio', 'Nombre', 'Apellido', 'Número INE', 'CURP', 'Observaciones', 'Foto Frontal', 'Foto Trasera']
    ];

    await sheetsService.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:J1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: headers
      }
    });

    console.log(`✨ Nueva pestaña INE creada: ${sheetName}`);
    return sheetName;
  } catch (error) {
    console.error('❌ Error creando/buscando pestaña INE:', error.message);
    return null;
  }
}

// Función para registrar INE en Google Sheets
async function registerINEInSheet(ineData) {
  if (!sheetsService) {
    console.warn('⚠️ Google Sheets no está inicializado');
    return null;
  }

  try {
    // Obtener o crear la pestaña del condominio
    const sheetName = await getOrCreateINESheet(ineData.condominio);

    if (!sheetName) {
      console.warn('⚠️ No se pudo obtener/crear pestaña INE');
      return null;
    }

    // Formatear fecha en hora de México
    const fechaRegistro = formatDateForMexico(ineData.createdAt);

    // Preparar los datos para la fila
    const rowData = [
      fechaRegistro,
      ineData.houseNumber,
      ineData.condominio,
      ineData.nombre,
      ineData.apellido || '',
      ineData.numeroINE || '',
      ineData.curp || '',
      ineData.observaciones || '',
      ineData.photoFrontalUrl || 'Procesando...',
      ineData.photoTraseraUrl || 'Procesando...'
    ];

    // Agregar fila al final de la pestaña
    const appendResult = await sheetsService.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:J`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData]
      }
    });

    console.log(`📊 INE registrado en Google Sheets: ${sheetName} - ${ineData.nombre} ${ineData.apellido}`);

    // Retornar info de la fila creada para poder actualizarla después
    return {
      sheetName: sheetName,
      range: appendResult.data.updates.updatedRange
    };
  } catch (error) {
    console.error('❌ Error registrando INE en Sheets:', error.message);
    return null;
  }
}

// Función para actualizar URLs de fotos en Google Sheets
async function updateINEPhotosInSheet(ineData, sheetInfo) {
  if (!sheetsService || !sheetInfo) {
    return null;
  }

  try {
    const sheetName = sheetInfo.sheetName;

    // Buscar la fila que contiene este INE (por nombre, casa y condominio)
    const response = await sheetsService.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:J`
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      return null; // Solo hay encabezados
    }

    // Buscar la fila (empezando desde índice 1 para saltar encabezados)
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // Comparar casa, condominio y nombre
      if (row[1] === ineData.houseNumber &&
          row[2] === ineData.condominio &&
          row[3] === ineData.nombre &&
          row[4] === (ineData.apellido || '')) {
        rowIndex = i + 1; // +1 porque Sheets usa índices 1-based
        break;
      }
    }

    if (rowIndex === -1) {
      console.warn('⚠️ No se encontró la fila del INE en Sheets para actualizar fotos');
      return null;
    }

    // Actualizar solo las columnas I y J (fotos)
    await sheetsService.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!I${rowIndex}:J${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          ineData.photoFrontalUrl || '',
          ineData.photoTraseraUrl || ''
        ]]
      }
    });

    console.log(`📊 URLs de fotos actualizadas en Google Sheets: ${sheetName} fila ${rowIndex}`);
    return true;
  } catch (error) {
    console.error('❌ Error actualizando fotos en Sheets:', error.message);
    return null;
  }
}

// Función para convertir fecha UTC a hora local de México
function formatDateForMexico(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);

  // Convertir a hora de México (CST/CDT - America/Mexico_City)
  const mexicoTime = date.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return mexicoTime;
}

// Función para guardar QR code en Google Sheets
async function saveQRToSheet(qrData) {
  if (!sheetsService) {
    console.warn('⚠️ Google Sheets no está inicializado');
    return false;
  }

  try {
    // Obtener o crear pestaña por condominio y casa
    const houseNumber = qrData.houseNumber || qrData.casa;
    const sheetName = await getOrCreateCondominioSheet(qrData.condominio, houseNumber);

    if (!sheetName) {
      console.error('❌ No se pudo obtener pestaña del condominio');
      return false;
    }

    const row = [
      qrData.code || '',
      qrData.houseNumber || qrData.casa || '',
      qrData.condominio || '',
      qrData.visitante || '',
      qrData.residente || '',
      formatDateForMexico(qrData.createdAt || new Date().toISOString()),
      formatDateForMexico(qrData.expiresAt || ''),
      qrData.estado || 'activo',
      qrData.isUsed ? 'Sí' : 'No',
      formatDateForMexico(qrData.usedAt || '')
    ];

    await sheetsService.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:J`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row]
      }
    });

    console.log(`📊 QR guardado en Sheet: ${qrData.code} (${sheetName})`);
    return true;
  } catch (error) {
    console.error('❌ Error guardando en Sheet:', error.message);
    return false;
  }
}

// ============================================
// CONEXIÓN A MONGODB
// ============================================

async function connectToDatabase() {
  try {
    if (!MONGODB_URI) {
      console.warn('⚠️ MONGODB_URI no configurado. Usando modo sin base de datos.');
      return null;
    }

    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db();

    console.log('✅ Conectado a MongoDB');

    // Crear índices
    await db.collection('pushTokens').createIndex(
      { houseNumber: 1, condominio: 1 },
      { unique: true }
    );
    await db.collection('qrCodes').createIndex({ code: 1 });
    await db.collection('ines').createIndex(
      { houseNumber: 1, condominio: 1 }
    );
    await db.collection('workers').createIndex(
      { houseNumber: 1, condominio: 1 }
    );

    return db;
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    return null;
  }
}

// ============================================
// FUNCIÓN: Enviar Notificación Push
// ============================================

async function sendPushNotification(expoPushToken, title, body, data = {}) {
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken[')) {
    console.error('❌ Token de notificación inválido:', expoPushToken);
    return null;
  }

  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
    priority: 'high',
    channelId: 'default',
    badge: 1
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();

    if (result.data && result.data.status === 'ok') {
      console.log('✅ Notificación enviada exitosamente a:', expoPushToken.substring(0, 30) + '...');
      return result;
    } else if (result.data && result.data.status === 'error') {
      console.error('❌ Error enviando notificación:', result.data.message);
      return null;
    }

    return result;
  } catch (error) {
    console.error('❌ Error en sendPushNotification:', error.message);
    return null;
  }
}

// ============================================
// ENDPOINT: Health Check
// ============================================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database: db ? 'connected' : 'disconnected'
  });
});

// ============================================
// ENDPOINT: Keep-Alive
// ============================================

app.get('/api/keep-alive', (req, res) => {
  res.json({
    success: true,
    message: 'Server is alive',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024) // MB
  });
});

// ============================================
// ENDPOINT: Registrar Push Token
// ============================================

app.post('/api/register-push-token', async (req, res) => {
  try {
    const { houseNumber, condominio, pushToken, platform } = req.body;

    // Validar datos
    if (!houseNumber || !condominio || !pushToken || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos requeridos: houseNumber, condominio, pushToken, platform'
      });
    }

    // Validar formato del token
    if (!pushToken.startsWith('ExponentPushToken[')) {
      return res.status(400).json({
        success: false,
        error: 'Token inválido. Debe ser un Expo Push Token válido'
      });
    }

    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Base de datos no disponible'
      });
    }

    // Guardar o actualizar token
    const result = await db.collection('pushTokens').updateOne(
      {
        houseNumber: houseNumber.toString(),
        condominio: condominio
      },
      {
        $set: {
          pushToken: pushToken,
          platform: platform,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    console.log(`✅ Token registrado - Casa: ${houseNumber}, Condominio: ${condominio}, Plataforma: ${platform}`);

    res.json({
      success: true,
      message: 'Token registrado correctamente',
      upserted: result.upsertedCount > 0,
      modified: result.modifiedCount > 0
    });

  } catch (error) {
    console.error('❌ Error registrando token:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ============================================
// ENDPOINT: Registrar Código QR
// ============================================

app.post('/api/register-code', async (req, res) => {
  try {
    const { houseNumber, condominio, visitante, residente } = req.body;

    if (!houseNumber || !condominio) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos requeridos: houseNumber, condominio'
      });
    }

    // Generar código QR único
    const code = `QR-${Date.now()}-${houseNumber}-${Math.random().toString(36).substring(7)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 horas

    const qrData = {
      code: code,
      codigo: code,
      houseNumber: houseNumber.toString(),
      casa: houseNumber.toString(),
      condominio: condominio,
      visitante: visitante || '',
      residente: residente || '',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      timestamp: now.toISOString(),
      isUsed: false,
      estado: 'activo'
    };

    if (db) {
      await db.collection('qrCodes').insertOne(qrData);
    }

    // Guardar en Google Sheets
    await saveQRToSheet(qrData);

    console.log(`✅ Código QR generado para casa ${houseNumber}`);

    res.json({
      success: true,
      data: qrData
    });

  } catch (error) {
    console.error('❌ Error registrando código:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ============================================
// ENDPOINT: Validar Código QR
// ============================================

app.post('/api/validate-qr', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Código QR requerido'
      });
    }

    let qrData = null;

    if (db) {
      qrData = await db.collection('qrCodes').findOne({ code: code });
    }

    if (!qrData) {
      return res.json({
        success: true,
        data: {
          valid: false,
          estado: 'invalido',
          message: 'Código QR no encontrado o inválido'
        }
      });
    }

    // Verificar expiración
    const now = new Date();
    const expiresAt = new Date(qrData.expiresAt);
    const isExpired = now > expiresAt;

    // Verificar si ya fue usado
    const isUsed = qrData.isUsed || qrData.estado === 'usado';

    let valid = !isExpired && !isUsed;
    let message = '';
    let estado = '';

    if (isUsed) {
      message = 'Código QR ya fue utilizado';
      estado = 'usado';
      valid = false;
    } else if (isExpired) {
      message = 'Código QR expirado';
      estado = 'expirado';
      valid = false;
    } else {
      message = 'Código QR válido';
      estado = 'valido';

      // Marcar como usado
      if (db) {
        await db.collection('qrCodes').updateOne(
          { code: code },
          {
            $set: {
              isUsed: true,
              estado: 'usado',
              usedAt: now.toISOString()
            }
          }
        );
      }
    }

    const validationResult = {
      valid: valid,
      estado: estado,
      message: message,
      houseNumber: qrData.houseNumber || qrData.casa,
      casa: qrData.casa || qrData.houseNumber,
      condominio: qrData.condominio,
      expiresAt: qrData.expiresAt,
      timestamp: qrData.timestamp || qrData.createdAt
    };

    // ========================================
    // ENVIAR NOTIFICACIÓN SI ES VÁLIDO
    // ========================================

    if (valid && db) {
      try {
        const tokenData = await db.collection('pushTokens').findOne({
          houseNumber: qrData.houseNumber.toString(),
          condominio: qrData.condominio
        });

        if (tokenData && tokenData.pushToken) {
          const notificationTitle = '✅ Código QR Validado';
          const notificationBody = `Tu código QR fue validado exitosamente. Válido hasta: ${qrData.expiresAt}`;
          const notificationData = {
            type: 'qr_validated',
            houseNumber: qrData.houseNumber,
            condominio: qrData.condominio,
            timestamp: now.toISOString(),
            code: code
          };

          await sendPushNotification(
            tokenData.pushToken,
            notificationTitle,
            notificationBody,
            notificationData
          );

          console.log(`📬 Notificación enviada a Casa ${qrData.houseNumber}, Condominio ${qrData.condominio}`);
        } else {
          console.log(`⚠️ No hay token para Casa ${qrData.houseNumber}, Condominio ${qrData.condominio}`);
        }
      } catch (notifError) {
        console.error('❌ Error enviando notificación (no crítico):', notifError.message);
      }
    }

    res.json({
      success: true,
      data: validationResult
    });

  } catch (error) {
    console.error('❌ Error validando QR:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ============================================
// ENDPOINT: Obtener Historial
// ============================================

app.get('/api/get-history', async (req, res) => {
  try {
    const { houseNumber, condominio } = req.query;

    if (!houseNumber || !condominio) {
      return res.status(400).json({
        success: false,
        error: 'Parámetros requeridos: houseNumber, condominio'
      });
    }

    if (!db) {
      return res.json({
        success: true,
        data: []
      });
    }

    const history = await db.collection('qrCodes')
      .find({
        $or: [
          { houseNumber: houseNumber.toString() },
          { casa: houseNumber.toString() }
        ],
        condominio: condominio
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.json({
      success: true,
      data: history
    });

  } catch (error) {
    console.error('❌ Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ============================================
// ENDPOINT: Contadores (para Vigilancia)
// ============================================

// GET para compatibilidad con apps antiguas
app.get('/api/counters', async (req, res) => {
  try {
    if (!db) {
      return res.json({
        success: true,
        data: {
          generados: 0,
          avalados: 0,
          negados: 0,
          generated: 0,
          validated: 0,
          denied: 0
        }
      });
    }

    // Obtener fecha de inicio del día en UTC
    const now = new Date();
    const today = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0, 0, 0, 0
    ));
    const todayISO = today.toISOString();

    console.log(`📊 Obteniendo contadores desde: ${todayISO}`);

    const total = await db.collection('qrCodes').countDocuments({
      createdAt: { $gte: todayISO }
    });

    const validated = await db.collection('qrCodes').countDocuments({
      createdAt: { $gte: todayISO },
      $or: [
        { estado: 'usado' },
        { isUsed: true }
      ]
    });

    const denied = await db.collection('qrCodes').countDocuments({
      createdAt: { $gte: todayISO },
      estado: 'expirado'
    });

    console.log(`📊 Resultados - Generados: ${total}, Avalados: ${validated}, Negados: ${denied}`);

    res.json({
      success: true,
      data: {
        generados: total,
        avalados: validated,
        negados: denied,
        generated: total,
        validated: validated,
        denied: denied,
        date: todayISO
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo contadores:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// POST también soportado
app.post('/api/counters', async (req, res) => {
  try {
    if (!db) {
      return res.json({
        success: true,
        data: {
          generados: 0,
          avalados: 0,
          negados: 0,
          generated: 0,
          validated: 0,
          denied: 0
        }
      });
    }

    // Obtener fecha de inicio del día en UTC
    const now = new Date();
    const today = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0, 0, 0, 0
    ));
    const todayISO = today.toISOString();

    console.log(`📊 Obteniendo contadores desde: ${todayISO}`);

    const total = await db.collection('qrCodes').countDocuments({
      createdAt: { $gte: todayISO }
    });

    const validated = await db.collection('qrCodes').countDocuments({
      createdAt: { $gte: todayISO },
      $or: [
        { estado: 'usado' },
        { isUsed: true }
      ]
    });

    const denied = await db.collection('qrCodes').countDocuments({
      createdAt: { $gte: todayISO },
      estado: 'expirado'
    });

    console.log(`📊 Resultados - Generados: ${total}, Avalados: ${validated}, Negados: ${denied}`);

    res.json({
      success: true,
      data: {
        generados: total,
        avalados: validated,
        negados: denied,
        generated: total,
        validated: validated,
        denied: denied,
        date: todayISO
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo contadores:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// ============================================
// ENDPOINT: Registrar Trabajador/INE
// ============================================

app.post('/api/register-worker', async (req, res) => {
  try {
    const { houseNumber, workerName, workerType, photoBase64, condominio } = req.body;

    // Validar datos requeridos
    if (!houseNumber || !condominio || !workerName) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos requeridos: houseNumber, condominio, workerName'
      });
    }

    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Base de datos no disponible'
      });
    }

    const now = new Date();
    const timestamp = now.getTime();

    // Crear datos iniciales sin foto (se actualizará después)
    const workerData = {
      houseNumber: houseNumber.toString(),
      condominio: condominio,
      nombre: workerName,
      tipo: workerType || 'general',
      photoUrl: null,
      photoDirectUrl: null,
      driveFileId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: 'procesando' // Cambiará a 'activo' cuando la foto esté lista
    };

    // Guardar INMEDIATAMENTE en la base de datos (sin esperar Drive)
    const result = await db.collection('workers').insertOne(workerData);
    const workerId = result.insertedId;

    console.log(`✅ Trabajador/INE registrado - Casa: ${houseNumber}, Nombre: ${workerName}, Tipo: ${workerType}, Condominio: ${condominio}`);

    // RESPONDER INMEDIATAMENTE al cliente (no esperar la subida a Drive)
    res.json({
      success: true,
      message: 'Trabajador registrado correctamente',
      data: {
        id: workerId,
        ...workerData,
        uploadStatus: 'processing' // Indica que la foto se está subiendo en background
      }
    });

    // PROCESAR FOTO EN BACKGROUND (después de responder al cliente)
    if (photoBase64 && photoBase64.trim() !== '') {
      const workerTypeNormalized = normalizeCondominioName(workerType || 'General');

      // Crear estructura de carpetas jerárquica con fechas
      const currentDate = new Date();
      getOrCreateINEFolderStructure(condominio, houseNumber, currentDate)
        .then(folderResult => {
          if (folderResult) {
            // Obtener hora en formato 24hrs (México timezone)
            const mexicoDate = new Date(currentDate.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
            const hours = String(mexicoDate.getHours()).padStart(2, '0');
            const minutes = String(mexicoDate.getMinutes()).padStart(2, '0');
            const timeStr = `${hours}h${minutes}`; // Formato: 19h30 (7:30 PM)

            // Nombre del archivo: Nombre_Tipo_19h30_timestamp.jpg
            const fileName = `${workerName}_${workerTypeNormalized}_${timeStr}_${timestamp}.jpg`;
            return uploadPhotoToDrive(photoBase64, fileName, folderResult.folderId);
          }
          return null;
        })
        .then(async (driveResult) => {
          if (driveResult) {
            // Actualizar el documento con la información de la foto
            await db.collection('workers').updateOne(
              { _id: workerId },
              {
                $set: {
                  photoUrl: driveResult.webViewLink,
                  photoDirectUrl: driveResult.directUrl,
                  driveFileId: driveResult.fileId,
                  status: 'activo',
                  updatedAt: new Date().toISOString()
                }
              }
            );
            console.log(`📁 Foto subida a Drive y actualizada en DB: ${driveResult.webViewLink}`);
          } else {
            // Si falla, marcar como activo de todas formas (pero sin foto)
            await db.collection('workers').updateOne(
              { _id: workerId },
              {
                $set: {
                  status: 'activo',
                  updatedAt: new Date().toISOString()
                }
              }
            );
            console.warn('⚠️ No se pudo subir foto a Drive, trabajador registrado sin foto');
          }
        })
        .catch(async (error) => {
          console.error('❌ Error en background upload:', error.message);
          // Marcar como activo aunque falle
          await db.collection('workers').updateOne(
            { _id: workerId },
            {
              $set: {
                status: 'activo',
                updatedAt: new Date().toISOString()
              }
            }
          );
        });
    } else {
      // Sin foto, marcar como activo inmediatamente
      await db.collection('workers').updateOne(
        { _id: workerId },
        { $set: { status: 'activo' } }
      );
    }

  } catch (error) {
    console.error('❌ Error registrando trabajador:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// ============================================
// ENDPOINT: Registrar INE
// ============================================

app.post('/api/register-ine', async (req, res) => {
  try {
    const {
      houseNumber,
      condominio,
      nombre,
      apellido,
      numeroINE,
      curp,
      photoFrontal,
      photoTrasera,
      observaciones
    } = req.body;

    // Validar datos requeridos
    if (!houseNumber || !condominio || !nombre) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos requeridos: houseNumber, condominio, nombre'
      });
    }

    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Base de datos no disponible'
      });
    }

    const now = new Date();
    const timestamp = now.getTime();

    // Crear datos iniciales sin fotos (se actualizarán después)
    const ineData = {
      houseNumber: houseNumber.toString(),
      condominio: condominio,
      nombre: nombre,
      apellido: apellido || '',
      numeroINE: numeroINE || '',
      curp: curp || '',
      photoFrontalUrl: null,
      photoFrontalDirectUrl: null,
      photoFrontalId: null,
      photoTraseraUrl: null,
      photoTraseraDirectUrl: null,
      photoTraseraId: null,
      observaciones: observaciones || '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: 'procesando' // Cambiará a 'activo' cuando las fotos estén listas
    };

    // Guardar INMEDIATAMENTE en la base de datos (sin esperar Drive)
    const result = await db.collection('ines').insertOne(ineData);
    const ineId = result.insertedId;

    console.log(`✅ INE registrado - Casa: ${houseNumber}, Nombre: ${nombre} ${apellido}, Condominio: ${condominio}`);

    // RESPONDER INMEDIATAMENTE al cliente
    res.json({
      success: true,
      message: 'INE registrado correctamente',
      data: {
        id: ineId,
        ...ineData,
        uploadStatus: 'processing'
      }
    });

    // REGISTRAR EN GOOGLE SHEETS (hacerlo ANTES de las fotos para asegurar que se guarde)
    let sheetInfo = null;
    try {
      console.log(`📝 Intentando registrar INE en Sheets: ${condominio}_INE`);
      sheetInfo = await registerINEInSheet(ineData);
      if (sheetInfo) {
        console.log(`✅ INE registrado en Google Sheets: ${sheetInfo.sheetName}`);
      } else {
        console.warn('⚠️ No se pudo registrar en Sheets (función retornó null)');
      }
    } catch (err) {
      console.error('❌ Error registrando INE en Sheets:', err.message);
      console.error('   Stack:', err.stack);
    }

    // PROCESAR FOTOS EN BACKGROUND (PARALELO - ambas al mismo tiempo)
    const uploadPromises = [];

    // Determinar el tipo de trabajador (usar observaciones o "General")
    const tipoTrabajador = (observaciones && observaciones.trim()) || 'General';
    const tipoNormalizado = normalizeCondominioName(tipoTrabajador);

    // Crear estructura de carpetas: Condominio > Casa > Año > Mes
    const currentDate = new Date();
    const folderResult = await getOrCreateINEFolderStructure(condominio, houseNumber, currentDate);

    // Obtener hora en formato 24hrs (México timezone)
    const mexicoDate = new Date(currentDate.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    const hours = String(mexicoDate.getHours()).padStart(2, '0');
    const minutes = String(mexicoDate.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}h${minutes}`; // Formato: 19h30 (7:30 PM)

    if (photoFrontal && photoFrontal.trim() !== '' && folderResult) {
      // Nombre del archivo: Nombre_Apellido_Tipo_19h30_Frontal_timestamp.jpg
      const nombreCompleto = `${nombre}_${apellido || ''}`.replace(/\s+/g, '_');
      const fileNameFrontal = `${nombreCompleto}_${tipoNormalizado}_${timeStr}_Frontal_${timestamp}.jpg`;
      uploadPromises.push(
        uploadPhotoToDrive(photoFrontal, fileNameFrontal, folderResult.folderId)
          .then(result => ({ type: 'frontal', result }))
          .catch(error => ({ type: 'frontal', error: error.message }))
      );
    }

    if (photoTrasera && photoTrasera.trim() !== '' && folderResult) {
      // Nombre del archivo: Nombre_Apellido_Tipo_19h30_Trasera_timestamp.jpg
      const nombreCompleto = `${nombre}_${apellido || ''}`.replace(/\s+/g, '_');
      const fileNameTrasera = `${nombreCompleto}_${tipoNormalizado}_${timeStr}_Trasera_${timestamp}.jpg`;
      uploadPromises.push(
        uploadPhotoToDrive(photoTrasera, fileNameTrasera, folderResult.folderId)
          .then(result => ({ type: 'trasera', result }))
          .catch(error => ({ type: 'trasera', error: error.message }))
      );
    }

    // Subir ambas fotos EN PARALELO
    if (uploadPromises.length > 0) {
      Promise.all(uploadPromises)
        .then(async (results) => {
          const updateData = {
            status: 'activo',
            updatedAt: new Date().toISOString()
          };

          // Procesar resultados de las subidas
          results.forEach(item => {
            if (item.result && !item.error) {
              if (item.type === 'frontal') {
                updateData.photoFrontalUrl = item.result.webViewLink;
                updateData.photoFrontalDirectUrl = item.result.directUrl;
                updateData.photoFrontalId = item.result.fileId;
                console.log(`📁 Foto frontal subida a Drive: ${item.result.webViewLink}`);
              } else if (item.type === 'trasera') {
                updateData.photoTraseraUrl = item.result.webViewLink;
                updateData.photoTraseraDirectUrl = item.result.directUrl;
                updateData.photoTraseraId = item.result.fileId;
                console.log(`📁 Foto trasera subida a Drive: ${item.result.webViewLink}`);
              }
            } else {
              console.warn(`⚠️ No se pudo subir foto ${item.type}: ${item.error || 'error desconocido'}`);
            }
          });

          // Actualizar documento con las fotos que se subieron exitosamente
          await db.collection('ines').updateOne(
            { _id: ineId },
            { $set: updateData }
          );

          console.log(`✅ INE actualizado con fotos en Drive`);

          // Actualizar URLs de fotos en Google Sheets
          if (sheetInfo && (updateData.photoFrontalUrl || updateData.photoTraseraUrl)) {
            const updatedIneData = {
              ...ineData,
              ...updateData
            };
            updateINEPhotosInSheet(updatedIneData, sheetInfo).catch(err => {
              console.error('❌ Error actualizando fotos en Sheets (no crítico):', err.message);
            });
          }
        })
        .catch(async (error) => {
          console.error('❌ Error en background upload de INE:', error.message);
          // Marcar como activo aunque fallen las fotos
          await db.collection('ines').updateOne(
            { _id: ineId },
            {
              $set: {
                status: 'activo',
                updatedAt: new Date().toISOString()
              }
            }
          );
        });
    } else {
      // Sin fotos, marcar como activo inmediatamente
      await db.collection('ines').updateOne(
        { _id: ineId },
        { $set: { status: 'activo' } }
      );
    }

  } catch (error) {
    console.error('❌ Error registrando INE:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// ============================================
// ENDPOINT: Obtener INEs por Casa
// ============================================

app.get('/api/get-ines', async (req, res) => {
  try {
    const { houseNumber, condominio } = req.query;

    if (!houseNumber || !condominio) {
      return res.status(400).json({
        success: false,
        error: 'Parámetros requeridos: houseNumber, condominio'
      });
    }

    if (!db) {
      return res.json({
        success: true,
        data: []
      });
    }

    const ines = await db.collection('ines')
      .find({
        houseNumber: houseNumber.toString(),
        condominio: condominio,
        status: 'activo'
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      data: ines
    });

  } catch (error) {
    console.error('❌ Error obteniendo INEs:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ============================================
// ENDPOINT: Generar Resumen Mensual
// ============================================

app.get('/api/monthly-report', async (req, res) => {
  try {
    const { month, year, condominio } = req.query;

    // Validar parámetros
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Parámetros requeridos: month (1-12), year (2025)'
      });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        error: 'Mes debe estar entre 1 y 12'
      });
    }

    console.log(`📊 Generando resumen desde Drive para ${monthNum}/${yearNum} - Condominio: ${condominio || 'TODOS'}`);

    // Generar reporte desde Drive
    const driveReport = await generateMonthlyReportFromDrive(monthNum, yearNum, condominio);

    const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0, 0));

    const report = {
      mes: monthNum,
      año: yearNum,
      condominio: condominio || 'TODOS',
      periodo: `${startDate.toLocaleDateString('es-MX')} - ${new Date(endDate.getTime() - 1).toLocaleDateString('es-MX')}`,
      registros: {
        total: driveReport.total,
        porTipo: driveReport.porTipo,
        porCasa: driveReport.porCasa
      },
      detalles: driveReport.archivos
    };

    console.log(`✅ Resumen generado desde Drive: ${driveReport.total} registros`);

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('❌ Error generando resumen mensual:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// ============================================
// ENDPOINT: Generar Resumen Mensual en PDF
// ============================================

app.get('/api/monthly-report-pdf', async (req, res) => {
  try {
    const { month, year, condominio } = req.query;

    // Validar parámetros
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Parámetros requeridos: month (1-12), year (2025)'
      });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        error: 'Mes debe estar entre 1 y 12'
      });
    }

    // Calcular rango de fechas del mes
    const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0, 0));
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    console.log(`📄 Generando PDF desde Drive para ${monthNum}/${yearNum} - Condominio: ${condominio || 'TODOS'}`);

    // Generar reporte desde Drive
    const driveReport = await generateMonthlyReportFromDrive(monthNum, yearNum, condominio);

    // Calcular estadísticas
    const stats = {
      registros: {
        total: driveReport.total,
        porTipo: driveReport.porTipo,
        porCasa: driveReport.porCasa
      }
    };

    // Crear PDF
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Resumen_${condominio || 'TODOS'}_${monthNames[monthNum-1]}_${yearNum}.pdf`);

    // Pipe PDF a la respuesta
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('REPORTE MENSUAL DE ACTIVIDAD', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica').text(`${monthNames[monthNum - 1]} ${yearNum}`, { align: 'center' });
    doc.fontSize(12).text(`Condominio: ${condominio || 'TODOS'}`, { align: 'center' });
    doc.moveDown(1);

    // Línea separadora
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    // Sección Registros
    doc.fontSize(16).font('Helvetica-Bold').text('TRABAJADORES/SERVICIOS REGISTRADOS', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica');
    doc.text(`Total de registros del mes: ${stats.registros.total}`, { indent: 20 });
    doc.moveDown(1);

    // Desglose por tipo de trabajador
    if (Object.keys(stats.registros.porTipo).length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Desglose por tipo de trabajador:', { indent: 20 });
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica');
      Object.entries(stats.registros.porTipo)
        .sort((a, b) => b[1] - a[1]) // Ordenar de mayor a menor
        .forEach(([tipo, count]) => {
          doc.text(`• ${tipo}: ${count} registro${count > 1 ? 's' : ''}`, { indent: 40 });
        });
      doc.moveDown(1);
    } else {
      doc.fontSize(11).font('Helvetica-Oblique').text('No hay registros en este periodo', { indent: 40 });
      doc.moveDown(1);
    }

    // Desglose por casa
    if (Object.keys(stats.registros.porCasa).length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Desglose por casa:', { indent: 20 });
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica');
      Object.entries(stats.registros.porCasa)
        .sort((a, b) => {
          // Ordenar numéricamente por número de casa
          const numA = parseInt(a[0]) || 0;
          const numB = parseInt(b[0]) || 0;
          return numA - numB;
        })
        .forEach(([casa, count]) => {
          doc.text(`• Casa ${casa}: ${count} registro${count > 1 ? 's' : ''}`, { indent: 40 });
        });
      doc.moveDown(1.5);
    }

    // Footer
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text(
      'Todas las credenciales INE están resguardadas digitalmente en Google Drive para consulta y verificación.',
      { align: 'center' }
    );
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(
      `Generado el ${new Date().toLocaleDateString('es-MX')} a las ${new Date().toLocaleTimeString('es-MX')}`,
      { align: 'center' }
    );
    doc.fontSize(9).font('Helvetica-Oblique').text('Sistema de Gestión QR - Administración', { align: 'center' });

    // Finalizar PDF
    doc.end();

    console.log(`✅ PDF generado exitosamente`);

  } catch (error) {
    console.error('❌ Error generando PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// ============================================
// ENDPOINT: Reset Sistema (Admin)
// ============================================

app.post('/api/admin/reset-all', async (req, res) => {
  try {
    console.log('⚠️ Iniciando reset completo del sistema...');

    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Base de datos no conectada'
      });
    }

    // Borrar todas las colecciones
    const collections = ['qrCodes', 'ines', 'workers', 'pushTokens'];
    const results = {};

    for (const collectionName of collections) {
      const result = await db.collection(collectionName).deleteMany({});
      results[collectionName] = result.deletedCount;
      console.log(`🗑️ ${collectionName}: ${result.deletedCount} documentos eliminados`);
    }

    console.log('✅ Reset completo del sistema exitoso');

    res.json({
      success: true,
      message: 'Sistema reseteado exitosamente',
      deleted: results,
      note: 'Google Drive y Sheets deben limpiarse manualmente si es necesario'
    });

  } catch (error) {
    console.error('❌ Error en reset del sistema:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// ============================================
// FUNCIÓN: Keep-Alive Auto-Ping
// ============================================

function startKeepAlive() {
  const PING_INTERVAL = 5 * 60 * 1000; // 5 minutos

  console.log(`🔄 Keep-alive iniciado - Ping cada 10 minutos a ${SERVER_URL}`);

  setInterval(async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/keep-alive`);
      const text = await response.text();
      if (text.trim().startsWith('<')) throw new Error(`Servidor devolvió HTML (HTTP ${response.status})`);
      const data = JSON.parse(text);
      console.log(`🏓 Self-ping OK - Uptime: ${data.uptime}s - Memoria: ${data.memory}MB`);
    } catch (error) {
      console.error(`❌ Self-ping falló: ${error.message}`);
    }
  }, PING_INTERVAL);
}

// ============================================
// MANEJO DE ERRORES
// ============================================

app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

async function startServer() {
  try {
    // Conectar a base de datos
    await connectToDatabase();

    // Inicializar Google Drive y Sheets
    await initializeGoogleServices();

    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`✅ Servidor corriendo en puerto ${PORT}`);
      console.log(`🔗 URL: ${SERVER_URL}`);
      console.log(`📅 ${new Date().toISOString()}`);

      // Iniciar keep-alive después de 2 minutos
      setTimeout(() => {
        startKeepAlive();
      }, 2 * 60 * 1000);
    });
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
}

// ============================================
// SISTEMA DE REPORTES AUTOMÁTICOS FIN DE MES
// ============================================

// Configurar transporter de nodemailer (Gmail)
let emailTransporter = null;

function setupEmailTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.log('⚠️ Email no configurado (falta EMAIL_USER o EMAIL_PASSWORD)');
    return null;
  }

  try {
    emailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD // App Password de Gmail
      }
    });
    console.log('✅ Email transporter configurado');
    return emailTransporter;
  } catch (error) {
    console.error('❌ Error configurando email:', error.message);
    return null;
  }
}

// Función para enviar alerta de OAuth expirado
async function sendOAuthExpirationAlert(errorDetails) {
  try {
    if (!emailTransporter) {
      emailTransporter = setupEmailTransporter();
    }

    if (!emailTransporter) {
      console.warn('⚠️ No se pudo enviar alerta: email no configurado');
      return;
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Enviar a ti mismo
      subject: '🚨 URGENTE: OAuth Token Expirado - QR Manager',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #fff3cd; border: 2px solid #ffc107; border-radius: 10px;">
          <h1 style="color: #856404;">🚨 OAuth Token Expirado</h1>
          <p style="font-size: 16px;">El token de Google Drive/Sheets ha expirado y debe ser regenerado.</p>

          <h2 style="color: #856404;">Detalles del Error:</h2>
          <pre style="background: #f8f9fa; padding: 10px; border-radius: 5px; overflow-x: auto;">${errorDetails}</pre>

          <h2 style="color: #856404;">Solución Rápida:</h2>
          <ol style="font-size: 14px; line-height: 1.8;">
            <li>Abre tu terminal local</li>
            <li>Ve a: <code>cd /Users/papayo/Desktop/QR_Backend</code></li>
            <li>Ejecuta: <code>node get-new-oauth-token.js</code></li>
            <li>Autoriza en el navegador</li>
            <li>Copia el nuevo OAUTH_REFRESH_TOKEN</li>
            <li>Ve a Render Dashboard: <a href="https://dashboard.render.com/web/srv-cuinbubv2p9s73fnpdv0">https://dashboard.render.com/web/srv-cuinbubv2p9s73fnpdv0</a></li>
            <li>Actualiza la variable OAUTH_REFRESH_TOKEN</li>
            <li>Guarda cambios (Render hará redeploy automático)</li>
          </ol>

          <p style="font-size: 14px; color: #856404; margin-top: 20px;">
            <strong>Nota:</strong> Mientras tanto, el sistema seguirá funcionando pero <strong>las fotos NO se subirán a Drive</strong>.
          </p>

          <hr style="margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            Fecha/Hora: ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}<br>
            Servidor: ${SERVER_URL}
          </p>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    console.log('📧 Alerta de OAuth expirado enviada por email');

  } catch (error) {
    console.error('❌ Error enviando alerta de OAuth:', error.message);
  }
}

// Función para detectar y manejar errores de OAuth
async function handleOAuthError(error, context = 'Operación desconocida') {
  const errorMessage = error?.message || error?.toString() || 'Error desconocido';

  if (errorMessage.includes('invalid_grant') ||
      errorMessage.includes('Token has been expired') ||
      errorMessage.includes('invalid_token')) {

    console.error(`\n🚨 ===== ERROR DE OAUTH DETECTADO =====`);
    console.error(`Contexto: ${context}`);
    console.error(`Error: ${errorMessage}`);
    console.error(`Fecha: ${new Date().toISOString()}`);
    console.error(`=====================================\n`);

    // Enviar alerta por email (solo una vez cada 6 horas)
    const now = Date.now();
    if (!global.lastOAuthAlert || (now - global.lastOAuthAlert) > 6 * 60 * 60 * 1000) {
      global.lastOAuthAlert = now;
      await sendOAuthExpirationAlert(`Contexto: ${context}\n\nError: ${errorMessage}\n\nStack: ${error.stack || 'N/A'}`);
    }

    return true; // Es un error de OAuth
  }

  return false; // No es un error de OAuth
}

// Función para generar y enviar reporte mensual automáticamente
async function generateAndSendMonthlyReport() {
  try {
    console.log('\n📊 ===== GENERANDO REPORTE MENSUAL AUTOMÁTICO =====');

    // Obtener mes y año anterior
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = lastMonth.getMonth() + 1;
    const year = lastMonth.getFullYear();

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthName = monthNames[month - 1];

    console.log(`📅 Generando reporte de ${monthName} ${year}`);

    // Obtener lista de condominios desde Drive
    if (!driveService) {
      console.error('❌ Drive no está inicializado');
      return;
    }

    const condominiosFiles = await listFilesInFolder(DRIVE_FOLDER_ID);
    const condominioFolders = condominiosFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

    if (condominioFolders.length === 0) {
      console.log('⚠️ No hay condominios para generar reportes');
      return;
    }

    console.log(`📁 Encontrados ${condominioFolders.length} condominios`);

    // Generar y enviar reporte para cada condominio
    for (const condominioFolder of condominioFolders) {
      const condominioName = condominioFolder.name;

      try {
        console.log(`\n  📊 Generando reporte para: ${condominioName}`);

        // Generar reporte desde Drive
        const driveReport = await generateMonthlyReportFromDrive(month, year, condominioName);

        if (driveReport.total === 0) {
          console.log(`  ⚠️ No hay datos para ${condominioName} en ${monthName}`);
          continue;
        }

        console.log(`  ✅ Datos encontrados: ${driveReport.total} registros`);

        // Generar PDF
        const pdfBuffer = await generatePDFBuffer(month, year, condominioName, driveReport);

        // Guardar PDF en Drive → Condominio/Año/Mes/Reporte_Mensual_Mes_Año.pdf
        try {
          const condominioNorm = condominioName.replace(/\s+/g, '_');
          const condFolderId = await getOrCreateSubfolder(DRIVE_FOLDER_ID, condominioName);
          const yearFolderId = await getOrCreateSubfolder(condFolderId, String(year));
          const monthFolderId = await getOrCreateSubfolder(yearFolderId, monthName);

          const pdfStream = Readable.from(pdfBuffer);
          const pdfFileName = `Reporte_${monthName}_${year}_${condominioNorm}.pdf`;

          await driveService.files.create({
            requestBody: { name: pdfFileName, parents: [monthFolderId] },
            media: { mimeType: 'application/pdf', body: pdfStream },
            fields: 'id'
          });

          console.log(`  📁 PDF guardado en Drive: ${condominioName}/${year}/${monthName}/${pdfFileName}`);
        } catch (driveErr) {
          console.error(`  ⚠️ No se pudo guardar PDF en Drive: ${driveErr.message}`);
        }

        // Enviar por email si está configurado
        if (emailTransporter && process.env.EMAIL_RECIPIENTS) {
          await sendReportEmail(condominioName, monthName, year, pdfBuffer);
        }

        console.log(`  ✅ Reporte completado para ${condominioName}`);

      } catch (error) {
        console.error(`  ❌ Error con ${condominioName}:`, error.message);
      }
    }

    console.log('\n✅ ===== REPORTES MENSUALES COMPLETADOS =====\n');

  } catch (error) {
    console.error('❌ Error en generación automática de reportes:', error);
  }
}

// Función auxiliar para generar PDF como Buffer
async function generatePDFBuffer(month, year, condominio, driveReport) {
  return new Promise((resolve, reject) => {
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('REPORTE MENSUAL DE ACTIVIDAD', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica').text(`${monthNames[month - 1]} ${year}`, { align: 'center' });
    doc.fontSize(12).text(`Condominio: ${condominio}`, { align: 'center' });
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    // Sección Registros
    doc.fontSize(16).font('Helvetica-Bold').text('TRABAJADORES/SERVICIOS REGISTRADOS', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica');
    doc.text(`Total de registros del mes: ${driveReport.total}`, { indent: 20 });
    doc.moveDown(1);

    // Desglose por tipo
    if (Object.keys(driveReport.porTipo).length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Desglose por tipo de trabajador:', { indent: 20 });
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica');
      Object.entries(driveReport.porTipo)
        .sort((a, b) => b[1] - a[1])
        .forEach(([tipo, count]) => {
          doc.text(`• ${tipo}: ${count} registro${count > 1 ? 's' : ''}`, { indent: 40 });
        });
      doc.moveDown(1);
    }

    // Desglose por casa
    if (Object.keys(driveReport.porCasa).length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Desglose por casa:', { indent: 20 });
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica');
      Object.entries(driveReport.porCasa)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .forEach(([casa, count]) => {
          doc.text(`• Casa ${casa}: ${count} registro${count > 1 ? 's' : ''}`, { indent: 40 });
        });
      doc.moveDown(1.5);
    }

    // Footer
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text(
      'Todas las credenciales INE están resguardadas digitalmente en Google Drive.',
      { align: 'center' }
    );
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(
      `Generado automáticamente el ${new Date().toLocaleDateString('es-MX')}`,
      { align: 'center' }
    );

    doc.end();
  });
}

// Función para enviar email con el reporte
async function sendReportEmail(condominio, monthName, year, pdfBuffer) {
  if (!emailTransporter) return;

  const recipients = process.env.EMAIL_RECIPIENTS.split(',').map(e => e.trim());

  const mailOptions = {
    from: `"QR Manager" <${process.env.EMAIL_USER}>`,
    to: recipients,
    subject: `Reporte Mensual - ${condominio} - ${monthName} ${year}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Reporte Mensual de Actividad</h2>
        <p>Estimado administrador,</p>
        <p>Adjunto encontrarás el reporte mensual de actividad para:</p>
        <ul>
          <li><strong>Condominio:</strong> ${condominio}</li>
          <li><strong>Período:</strong> ${monthName} ${year}</li>
        </ul>
        <p>Este reporte incluye:</p>
        <ul>
          <li>Total de trabajadores/servicios registrados</li>
          <li>Desglose por tipo de trabajador</li>
          <li>Desglose por casa</li>
        </ul>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Este es un email automático generado por el sistema QR Manager.
        </p>
      </div>
    `,
    attachments: [
      {
        filename: `Resumen_${condominio}_${monthName}_${year}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`  ✅ Email enviado a: ${recipients.join(', ')}`);
  } catch (error) {
    console.error(`  ❌ Error enviando email:`, error.message);
  }
}

// Programar tarea automática: Cada día 1 a las 2:00 AM (hora de México)
// Cron: '0 2 1 * *' = minuto 0, hora 2, día 1, cualquier mes, cualquier día de semana
cron.schedule('0 2 1 * *', () => {
  console.log('\n⏰ Tarea programada activada: Generación de reportes mensuales');
  generateAndSendMonthlyReport();
}, {
  scheduled: true,
  timezone: "America/Mexico_City"
});

console.log('📅 Cron job configurado: Reportes automáticos cada día 1 a las 2:00 AM (México)');

// Endpoint manual para probar/forzar generación de reportes
app.post('/api/generate-monthly-reports', async (req, res) => {
  try {
    console.log('📊 Generación manual de reportes solicitada');

    // Ejecutar en background
    generateAndSendMonthlyReport().catch(err => {
      console.error('Error en generación manual:', err);
    });

    res.json({
      success: true,
      message: 'Generación de reportes iniciada. Los reportes se enviarán por email cuando estén listos.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manejo de cierre graceful
process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM recibido, cerrando servidor...');
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('⚠️ SIGINT recibido, cerrando servidor...');
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

// Configurar email al iniciar
setupEmailTransporter();

// Iniciar
startServer();