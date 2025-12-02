import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { Readable } from 'stream';

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

async function initializeGoogleServices() {
  try {
    // Verificar si tenemos credenciales OAuth (RECOMENDADO para subir archivos)
    if (process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET && process.env.OAUTH_REFRESH_TOKEN) {
      console.log('🔐 Usando OAuth para Google Drive y Sheets');

      const oauth2Client = new google.auth.OAuth2(
        process.env.OAUTH_CLIENT_ID,
        process.env.OAUTH_CLIENT_SECRET,
        'http://localhost:3000/oauth2callback' // Redirect URI (no se usa en servidor, pero es requerido)
      );

      // Configurar el refresh token
      oauth2Client.setCredentials({
        refresh_token: process.env.OAUTH_REFRESH_TOKEN
      });

      // Inicializar servicios con OAuth
      driveService = google.drive({ version: 'v3', auth: oauth2Client });
      sheetsService = google.sheets({ version: 'v4', auth: oauth2Client });

      console.log('✅ Google Drive inicializado con OAuth');
      console.log('✅ Google Sheets inicializado con OAuth');

      return { driveService, sheetsService };
    }
    // Fallback a Service Account (solo para Sheets, NO para subir archivos)
    else {
      console.log('⚠️ OAuth no configurado, usando Service Account (limitado)');
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
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/spreadsheets'
        ],
      });

      // Inicializar Drive
      driveService = google.drive({ version: 'v3', auth });
      console.log('⚠️ Google Drive inicializado con Service Account (NO puede subir archivos)');

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

// Función para obtener o crear carpeta por condominio (CON CACHÉ)
async function getOrCreateCondominioFolder(condominioName) {
  if (!driveService) {
    console.warn('⚠️ Google Drive no está inicializado');
    return null;
  }

  try {
    // Verificar caché primero (ULTRA RÁPIDO)
    if (condominioFoldersCache.has(condominioName)) {
      const cachedId = condominioFoldersCache.get(condominioName);
      console.log(`⚡ Carpeta en caché: ${condominioName} (${cachedId})`);
      return cachedId;
    }

    // Buscar si ya existe la carpeta del condominio
    const query = `name='${condominioName}' and '${DRIVE_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    const response = await driveService.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    // Si existe, guardarlo en caché y retornar el ID
    if (response.data.files && response.data.files.length > 0) {
      const folderId = response.data.files[0].id;
      condominioFoldersCache.set(condominioName, folderId); // Guardar en caché
      console.log(`📁 Carpeta existente encontrada: ${condominioName} (${folderId})`);
      return folderId;
    }

    // Si no existe, crear la carpeta
    const folderMetadata = {
      name: condominioName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [DRIVE_FOLDER_ID]
    };

    const folder = await driveService.files.create({
      requestBody: folderMetadata,
      fields: 'id'
    });

    const folderId = folder.data.id;
    condominioFoldersCache.set(condominioName, folderId); // Guardar en caché
    console.log(`✨ Nueva carpeta creada: ${condominioName} (${folderId})`);

    // Hacer la carpeta pública (no bloquear si falla)
    driveService.permissions.create({
      fileId: folderId,
      requestBody: {
        role: 'writer',
        type: 'anyone'
      },
      fields: 'id'
    }).then(() => {
      console.log(`🔓 Carpeta ${condominioName} configurada con permisos de escritura`);
    }).catch(permError => {
      console.warn(`⚠️ No se pudieron establecer permisos en la carpeta: ${permError.message}`);
    });

    return folderId;
  } catch (error) {
    console.error('❌ Error creando/buscando carpeta:', error.message);
    return null;
  }
}

// Función para subir foto a Google Drive
async function uploadPhotoToDrive(photoBase64, fileName, condominio, mimeType = 'image/jpeg') {
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

    // Obtener o crear la carpeta del condominio
    const condominioFolderId = await getOrCreateCondominioFolder(condominio);

    // Si no se pudo obtener/crear la carpeta, subir a la carpeta principal como fallback
    const targetFolderId = condominioFolderId || DRIVE_FOLDER_ID;
    const finalFileName = condominioFolderId ? fileName : `${condominio}_${fileName}`;

    if (!condominioFolderId) {
      console.warn(`⚠️ No se pudo crear carpeta para ${condominio}, subiendo a carpeta principal`);
    }

    const fileMetadata = {
      name: finalFileName,
      parents: [targetFolderId]
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

    // Hacer el archivo público para que se pueda visualizar
    await driveService.permissions.create({
      fileId: file.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    // Obtener URL directa de visualización
    const directUrl = `https://drive.google.com/uc?export=view&id=${file.data.id}`;

    const folderInfo = condominioFolderId ? `en carpeta ${condominio}` : 'en carpeta principal';
    console.log(`📤 Foto subida a Drive: ${file.data.id} (${finalFileName}) ${folderInfo}`);
    console.log(`🔓 Foto pública: ${directUrl}`);

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

// Función para obtener o crear pestaña por condominio (para QR codes)
async function getOrCreateCondominioSheet(condominioName) {
  if (!sheetsService) {
    console.warn('⚠️ Google Sheets no está inicializado');
    return null;
  }

  try {
    // Obtener todas las pestañas existentes
    const spreadsheet = await sheetsService.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });

    // Buscar si ya existe la pestaña del condominio
    const existingSheet = spreadsheet.data.sheets.find(
      sheet => sheet.properties.title === condominioName
    );

    if (existingSheet) {
      console.log(`📄 Pestaña existente encontrada: ${condominioName}`);
      return condominioName;
    }

    // Si no existe, crear la pestaña
    await sheetsService.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: condominioName
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
      range: `${condominioName}!A1:J1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: headers
      }
    });

    console.log(`✨ Nueva pestaña creada: ${condominioName}`);
    return condominioName;
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
    const sheetName = `${condominioName}_INE`;

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
    // Obtener o crear pestaña del condominio
    const sheetName = await getOrCreateCondominioSheet(qrData.condominio);

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
      // No usar await aquí - permitir que se ejecute en background
      const fileName = `${condominio}_Casa${houseNumber}_${workerName}_${timestamp}.jpg`;

      uploadPhotoToDrive(photoBase64, fileName, condominio)
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

    if (photoFrontal && photoFrontal.trim() !== '') {
      const fileNameFrontal = `${condominio}_Casa${houseNumber}_${nombre}_Frontal_${timestamp}.jpg`;
      uploadPromises.push(
        uploadPhotoToDrive(photoFrontal, fileNameFrontal, condominio)
          .then(result => ({ type: 'frontal', result }))
          .catch(error => ({ type: 'frontal', error: error.message }))
      );
    }

    if (photoTrasera && photoTrasera.trim() !== '') {
      const fileNameTrasera = `${condominio}_Casa${houseNumber}_${nombre}_Trasera_${timestamp}.jpg`;
      uploadPromises.push(
        uploadPhotoToDrive(photoTrasera, fileNameTrasera, condominio)
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

    // Calcular rango de fechas del mes
    const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0, 0));
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    console.log(`📊 Generando resumen para ${monthNum}/${yearNum} - Condominio: ${condominio || 'TODOS'}`);

    const report = {
      mes: monthNum,
      año: yearNum,
      condominio: condominio || 'TODOS',
      periodo: `${startDate.toLocaleDateString('es-MX')} - ${new Date(endDate.getTime() - 1).toLocaleDateString('es-MX')}`,
      qrCodes: { total: 0, usados: 0, expirados: 0, activos: 0 },
      ines: { total: 0, porTipo: {} },
      trabajadores: { total: 0, porTipo: {} }
    };

    if (!db) {
      return res.json({
        success: true,
        data: report,
        note: 'Base de datos no disponible, reporte vacío'
      });
    }

    // Query base para filtrar por fecha y condominio
    const baseQuery = {
      createdAt: { $gte: startISO, $lt: endISO }
    };
    if (condominio) {
      baseQuery.condominio = condominio;
    }

    // Resumen de QR Codes
    const qrCodes = await db.collection('qrCodes').find(baseQuery).toArray();
    report.qrCodes.total = qrCodes.length;
    report.qrCodes.usados = qrCodes.filter(qr => qr.estado === 'usado' || qr.isUsed).length;
    report.qrCodes.expirados = qrCodes.filter(qr => qr.estado === 'expirado').length;
    report.qrCodes.activos = qrCodes.filter(qr => qr.estado === 'activo' || (!qr.estado && !qr.isUsed)).length;

    // Resumen de INEs
    const ines = await db.collection('ines').find(baseQuery).toArray();
    report.ines.total = ines.length;

    // Agrupar INEs por observaciones (tipo)
    const inesPorTipo = {};
    ines.forEach(ine => {
      const tipo = ine.observaciones || 'Sin especificar';
      inesPorTipo[tipo] = (inesPorTipo[tipo] || 0) + 1;
    });
    report.ines.porTipo = inesPorTipo;

    // Resumen de Trabajadores
    const trabajadores = await db.collection('workers').find(baseQuery).toArray();
    report.trabajadores.total = trabajadores.length;

    // Agrupar trabajadores por tipo
    const trabajadoresPorTipo = {};
    trabajadores.forEach(trabajador => {
      const tipo = trabajador.tipo || 'general';
      trabajadoresPorTipo[tipo] = (trabajadoresPorTipo[tipo] || 0) + 1;
    });
    report.trabajadores.porTipo = trabajadoresPorTipo;

    console.log(`✅ Resumen generado: ${report.qrCodes.total} QRs, ${report.ines.total} INEs, ${report.trabajadores.total} trabajadores`);

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
  const PING_INTERVAL = 10 * 60 * 1000; // 10 minutos

  console.log(`🔄 Keep-alive iniciado - Ping cada 10 minutos a ${SERVER_URL}`);

  setInterval(async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/keep-alive`);
      const data = await response.json();
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

// Iniciar
startServer();