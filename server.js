import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Variables globales
let db;
let mongoClient;

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
    const workerData = {
      houseNumber: houseNumber.toString(),
      condominio: condominio,
      nombre: workerName,
      tipo: workerType || 'general',
      photo: photoBase64 || '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: 'activo'
    };

    // Guardar en la base de datos
    const result = await db.collection('workers').insertOne(workerData);

    console.log(`✅ Trabajador/INE registrado - Casa: ${houseNumber}, Nombre: ${workerName}, Tipo: ${workerType}, Condominio: ${condominio}`);

    res.json({
      success: true,
      message: 'Trabajador registrado correctamente',
      data: {
        id: result.insertedId,
        ...workerData
      }
    });

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
    const ineData = {
      houseNumber: houseNumber.toString(),
      condominio: condominio,
      nombre: nombre,
      apellido: apellido || '',
      numeroINE: numeroINE || '',
      curp: curp || '',
      photoFrontal: photoFrontal || '',
      photoTrasera: photoTrasera || '',
      observaciones: observaciones || '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: 'activo'
    };

    // Guardar INE en la base de datos
    const result = await db.collection('ines').insertOne(ineData);

    console.log(`✅ INE registrado - Casa: ${houseNumber}, Nombre: ${nombre} ${apellido}, Condominio: ${condominio}`);

    res.json({
      success: true,
      message: 'INE registrado correctamente',
      data: {
        id: result.insertedId,
        ...ineData
      }
    });

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
