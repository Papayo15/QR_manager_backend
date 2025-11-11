# QR Manager Backend

Backend para las aplicaciones ResidenteApp y VigilanciaApp.

## 🚀 Características

- ✅ Gestión de códigos QR (crear, validar, historial)
- ✅ Sistema de notificaciones push (Expo)
- ✅ Keep-alive automático (evita cold start en Render)
- ✅ Registro de tokens de dispositivos
- ✅ Contadores y estadísticas

## 📡 Endpoints

### Health & Keep-Alive
- `GET /health` - Estado del servidor
- `GET /api/keep-alive` - Mantener servidor despierto

### Notificaciones
- `POST /api/register-push-token` - Registrar token de notificaciones

### Códigos QR
- `POST /api/register-code` - Generar nuevo código QR
- `POST /api/validate-qr` - Validar código QR (envía notificación)
- `GET /api/get-history` - Obtener historial de códigos

### Estadísticas
- `POST /api/counters` - Contadores del día (generados, validados, rechazados)

### Otros
- `POST /api/register-worker` - Registrar trabajador

## 🛠️ Instalación Local

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Iniciar servidor
npm start

# Desarrollo (auto-reload)
npm run dev
```

## 📦 Deploy en Render

### 1. Conectar Repositorio
1. Ir a [Render Dashboard](https://dashboard.render.com)
2. Click en "New +" → "Web Service"
3. Conectar este repositorio de GitHub
4. Configurar:
   - **Name:** qr-manager-backend
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Branch:** main

### 2. Variables de Entorno
Agregar en Render Dashboard → Environment:

```
PORT=3000
SERVER_URL=https://tu-app.onrender.com
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/qr_manager
NODE_ENV=production
```

### 3. Auto-Deploy
Una vez conectado, cada `git push` a main hará deploy automático.

## 🗄️ Base de Datos

### MongoDB Collections

**pushTokens:**
```javascript
{
  houseNumber: "101",
  condominio: "Las Palmas",
  pushToken: "ExponentPushToken[xxxxxx]",
  platform: "ios" | "android",
  createdAt: Date,
  updatedAt: Date
}
```

**qrCodes:**
```javascript
{
  code: "QR-1234567890-101-abc123",
  houseNumber: "101",
  condominio: "Las Palmas",
  visitante: "Juan Pérez",
  residente: "María García",
  createdAt: "2025-11-10T12:00:00.000Z",
  expiresAt: "2025-11-11T12:00:00.000Z",
  isUsed: false,
  estado: "activo" | "usado" | "expirado"
}
```

## 🔧 Configuración MongoDB

### Crear Base de Datos en MongoDB Atlas

1. Ir a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Crear cuenta gratuita (si no tienes)
3. Crear nuevo cluster (M0 Free tier)
4. Crear usuario de base de datos
5. Whitelist IP: `0.0.0.0/0` (permitir todas las IPs)
6. Obtener connection string
7. Agregar a variable `MONGODB_URI` en Render

## 📱 Apps que Usan este Backend

- **ResidenteApp:** Genera códigos QR, recibe notificaciones
- **VigilanciaApp:** Valida códigos QR, ve estadísticas

## 🔄 Keep-Alive

El servidor hace auto-ping cada 10 minutos para evitar que Render lo duerma:
- Inicia automáticamente 2 minutos después del arranque
- Hace ping a `/api/keep-alive` cada 10 minutos
- Logs: `🏓 Self-ping OK - Uptime: XXXs`

## 📝 Logs

El servidor muestra logs detallados:
- `✅` - Operación exitosa
- `❌` - Error
- `⚠️` - Advertencia
- `📬` - Notificación enviada
- `🏓` - Keep-alive ping

## 🐛 Troubleshooting

### Base de datos no conecta
- Verificar `MONGODB_URI` en variables de entorno
- Verificar whitelist de IPs en MongoDB Atlas
- El servidor funciona sin DB pero con funcionalidad limitada

### Notificaciones no llegan
- Verificar que el token está registrado: revisar colección `pushTokens`
- Verificar que el token es válido (empieza con `ExponentPushToken[`)
- Verificar logs: debe mostrar `📬 Notificación enviada`

### Servidor se duerme
- Verificar que keep-alive está activo (ver logs de ping)
- Considerar usar [UptimeRobot](https://uptimerobot.com) como respaldo

## 📄 Licencia

MIT

## 👤 Autor

Papayo15
