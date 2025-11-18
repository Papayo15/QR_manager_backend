import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { google } from 'googleapis';
import { Readable } from 'stream';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const MONGODB_URI = process.env.MONGODB_URI;

// Google Drive Configuration
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const OAUTH_REFRESH_TOKEN = process.env.OAUTH_REFRESH_TOKEN;
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Variables globales
let db;
let mongoClient;
let driveClient;

// ============================================
// CONFIGURACIÓN DE GOOGLE DRIVE
// ============================================

function initializeDriveClient() {
  try {
    if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN) {
      console.warn('⚠️ Credenciales de Google Drive no configuradas');
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      OAUTH_CLIENT_ID,
      OAUTH_CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
    );

    oauth2Client.setCredentials({
      refresh_token: OAUTH_REFRESH_TOKEN
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    console.log('✅ Cliente de Google Drive inicializado');
    return drive;
  } catch (error) {
    console.error('❌ Error inicializando Google Drive:', error.message);
    return null;
  }
}

// ============================================
// FUNCIÓN: Subir foto a Google Drive
// ============================================

async function uploadPhotoToDrive(photoBase64, fileName, metadata = {}) {
  if (!driveClient) {
    throw new Error('Cliente de Google Drive no disponible');
  }

  if (!DRIVE_FOLDER_ID) {
    throw new Error('DRIVE_FOLDER_ID no configurado');
  }

  try {
    const buffer = Buffer.from(photoBase64, 'base64');
    const stream = Readable.from(buffer);

    const fileMetadata = {
      name: fileName,
      parents: [DRIVE_FOLDER_ID],
      description: JSON.stringify(metadata)
    };

    const media = {
      mimeType: 'image/jpeg',
      body: stream
    };

    const response = await driveClient.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink, webContentLink'
    });

    console.log(`📤 Foto subida a Drive - ID: ${response.data.id} - Nombre: ${fileName}`);

    return {
      fileId: response.data.id,
      fileName: response.data.name,
      webViewLink: response.data.webViewLink,
      webContentLink: response.data.webContentLink
    };
  } catch (error) {
    console.error('❌ Error subiendo foto a Drive:', error.message);
    throw error;
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
    await db.collection('workers').createIndex({ houseNumber: 1, condominio: 1, createdAt: -1 });

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
    database: db ? 'connected' : 'disconnected',
    googleDrive: driveClient ? 'configured' : 'not configured'
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const total = await db.collection('qrCodes').countDocuments({
      createdAt: { $gte: today.toISOString() }
    });

    const validated = await db.collection('qrCodes').countDocuments({
      createdAt: { $gte: today.toISOString() },
      estado: 'usado'
    });

    const denied = await db.collection('qrCodes').countDocuments({
      createdAt: { $gte: today.toISOString() },
      estado: 'expirado'
    });

    res.json({
      success: true,
      data: {
        generados: total,
        avalados: validated,
        negados: denied,
        generated: total,
        validated: validated,
        denied: denied,
        date: today.toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo contadores:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ============================================
// ENDPOINT: Registrar Trabajador
// ============================================

app.post('/api/register-worker', async (req, res) => {
  try {
    const { houseNumber, workerName, workerType, photoBase64, condominio } = req.body;

    // Validar datos requeridos
    if (!houseNumber || !workerName || !workerType || !condominio) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos requeridos: houseNumber, workerName, workerType, condominio'
      });
    }

    if (!photoBase64) {
      return res.status(400).json({
        success: false,
        error: 'La foto es requerida'
      });
    }

    const now = new Date();
    const timestamp = now.toISOString();

    // Generar nombre de archivo único
    const fileName = `trabajador_${condominio}_casa${houseNumber}_${workerType}_${Date.now()}.jpg`;

    let driveFileData = null;
    let workerData = {
      houseNumber: houseNumber.toString(),
      workerName: workerName.trim(),
      workerType: workerType,
      condominio: condominio,
      createdAt: timestamp,
      registeredAt: timestamp,
      status: 'active'
    };

    // Intentar subir a Google Drive
    if (driveClient && DRIVE_FOLDER_ID) {
      try {
        const metadata = {
          houseNumber: houseNumber,
          workerName: workerName,
          workerType: workerType,
          condominio: condominio,
          registeredAt: timestamp
        };

        driveFileData = await uploadPhotoToDrive(photoBase64, fileName, metadata);

        // Agregar información de Drive al documento
        workerData.photo = {
          driveFileId: driveFileData.fileId,
          fileName: driveFileData.fileName,
          webViewLink: driveFileData.webViewLink,
          webContentLink: driveFileData.webContentLink,
          uploadedAt: timestamp
        };

        console.log(`✅ Foto subida a Google Drive - Trabajador: ${workerName} - Casa: ${houseNumber}`);
      } catch (driveError) {
        console.error('❌ Error subiendo a Drive:', driveError.message);

        // Si falla Drive, guardar en MongoDB como fallback
        if (db) {
          workerData.photoBase64 = photoBase64;
          workerData.photoStoredInDB = true;
          console.log('⚠️ Foto guardada en MongoDB como fallback');
        } else {
          throw new Error('No se pudo guardar la foto: Drive falló y MongoDB no disponible');
        }
      }
    } else {
      // Si Drive no está configurado, guardar en MongoDB
      if (db) {
        workerData.photoBase64 = photoBase64;
        workerData.photoStoredInDB = true;
        console.log('⚠️ Drive no configurado, guardando foto en MongoDB');
      } else {
        return res.status(503).json({
          success: false,
          error: 'Ni Google Drive ni MongoDB están disponibles para guardar la foto'
        });
      }
    }

    // Guardar registro en MongoDB (opcional pero recomendado)
    let dbResult = null;
    if (db) {
      try {
        dbResult = await db.collection('workers').insertOne(workerData);
        console.log(`✅ Registro guardado en MongoDB - ID: ${dbResult.insertedId}`);
      } catch (dbError) {
        console.error('⚠️ Error guardando en MongoDB (no crítico):', dbError.message);
      }
    }

    // Respuesta exitosa
    res.json({
      success: true,
      message: 'Trabajador registrado correctamente',
      data: {
        id: dbResult?.insertedId || null,
        workerName: workerName,
        houseNumber: houseNumber,
        workerType: workerType,
        condominio: condominio,
        createdAt: timestamp,
        photo: workerData.photo || { storedInDB: true }
      }
    });

  } catch (error) {
    console.error('❌ Error registrando trabajador:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error interno del servidor'
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
    // Inicializar Google Drive
    driveClient = initializeDriveClient();

    // Conectar a base de datos
    await connectToDatabase();

    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`✅ Servidor corriendo en puerto ${PORT}`);
      console.log(`🔗 URL: ${SERVER_URL}`);
      console.log(`📅 ${new Date().toISOString()}`);
      console.log(`📂 Google Drive: ${driveClient ? '✅ Configurado' : '⚠️ No configurado'}`);
      console.log(`💾 MongoDB: ${db ? '✅ Conectado' : '⚠️ No conectado'}`);

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
