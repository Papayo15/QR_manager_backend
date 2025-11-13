# 📦 INSTRUCCIONES DE DEPLOY EN RENDER

## Paso 1: Crear Repositorio en GitHub

### Opción A: Desde GitHub Web (RECOMENDADO)

1. Ve a https://github.com/new
2. Configura el repositorio:
   - **Repository name:** `QR_manager_backend`
   - **Description:** Backend para ResidenteApp y VigilanciaApp con notificaciones
   - **Visibility:** Private (recomendado) o Public
   - **NO marques** "Initialize this repository with a README"
3. Click en "Create repository"

4. En tu terminal, ejecuta estos comandos:

```bash
cd /Users/papayo/Desktop/QR_Backend
git remote add origin https://github.com/Papayo15/QR_manager_backend.git
git branch -M main
git push -u origin main
```

### Opción B: Crear Repositorio con CURL (Rápido)

Ejecuta esto en la terminal (necesitas un token de GitHub):

```bash
# Primero crea un token en: https://github.com/settings/tokens
# Permisos necesarios: repo (full control)

cd /Users/papayo/Desktop/QR_Backend

# Reemplaza TU_TOKEN_AQUI con tu token
curl -H "Authorization: token TU_TOKEN_AQUI" \
     -d '{"name":"QR_manager_backend","description":"Backend para QR Manager","private":false}' \
     https://api.github.com/user/repos

# Luego hacer push
git remote add origin https://github.com/Papayo15/QR_manager_backend.git
git branch -M main
git push -u origin main
```

---

## Paso 2: Crear MongoDB Atlas (Base de Datos)

1. Ve a https://www.mongodb.com/cloud/atlas/register
2. Crea cuenta gratuita (si no tienes)
3. Crea nuevo proyecto: "QR Manager"
4. Crea cluster gratuito (M0):
   - Provider: AWS
   - Region: La más cercana (ej: us-east-1)
   - Cluster Name: QRManager

5. Espera 3-5 minutos a que se cree el cluster

6. Configura acceso:
   - **Database Access:**
     - Click en "Add New Database User"
     - Username: `qr_admin`
     - Password: Generar automática (guardar bien!)
     - Database User Privileges: "Read and write to any database"
     - Click "Add User"

   - **Network Access:**
     - Click en "Add IP Address"
     - Click en "Allow Access from Anywhere"
     - IP Address: `0.0.0.0/0`
     - Click "Confirm"

7. Obtener Connection String:
   - Click en "Connect" en tu cluster
   - Click en "Connect your application"
   - Driver: Node.js
   - Copiar el connection string (parecido a):
     ```
     mongodb+srv://qr_admin:<password>@qrmanager.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
   - Reemplaza `<password>` con tu password

---

## Paso 3: Deploy en Render

### A. Crear Web Service

1. Ve a https://dashboard.render.com
2. Login con GitHub (si no tienes cuenta, créala)
3. Click en "New +" → "Web Service"
4. Click en "Connect account" si es primera vez
5. Busca y selecciona el repositorio: `QR_manager_backend`
6. Click en "Connect"

### B. Configurar Web Service

**Configuración básica:**
- **Name:** `qr-manager-backend` (o el que prefieras)
- **Region:** Oregon (US West) o el más cercano
- **Branch:** `main`
- **Root Directory:** (dejar vacío)
- **Runtime:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `npm start`

**Plan:**
- Selecciona: **Free** (gratis, suficiente para empezar)
- Nota: Free tier duerme después de 15 minutos sin uso (por eso tenemos keep-alive)

### C. Variables de Entorno

Scroll down hasta "Environment Variables" y agrega:

```
PORT = 3000

SERVER_URL = https://qr-manager-backend.onrender.com
(Cambia "qr-manager-backend" por el nombre que elegiste en el paso B)

MONGODB_URI = mongodb+srv://qr_admin:TU_PASSWORD@qrmanager.xxxxx.mongodb.net/qr_manager?retryWrites=true&w=majority
(Pega tu connection string del Paso 2.7, reemplazando <password>)

NODE_ENV = production
```

**IMPORTANTE:** Asegúrate de que:
- `SERVER_URL` termine con `.onrender.com` (sin barra al final)
- `MONGODB_URI` tenga tu password real (no `<password>`)
- `MONGODB_URI` incluya el nombre de la base de datos: `/qr_manager?`

### D. Deploy

1. Click en "Create Web Service"
2. Render empezará a hacer deploy automáticamente
3. Verás los logs en tiempo real
4. Espera 3-5 minutos
5. Cuando veas "✅ Servidor corriendo en puerto 3000" = éxito!

---

## Paso 4: Verificar que Funciona

### A. Probar Health Check

Abre en tu navegador o curl:
```bash
curl https://qr-manager-backend.onrender.com/health
```

Deberías ver:
```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2025-11-10...",
  "uptime": 123,
  "database": "connected"
}
```

### B. Probar Keep-Alive

```bash
curl https://qr-manager-backend.onrender.com/api/keep-alive
```

Deberías ver:
```json
{
  "success": true,
  "message": "Server is alive",
  "timestamp": "2025-11-10...",
  "uptime": 123,
  "memory": 45
}
```

### C. Ver Logs en Render

1. En Render Dashboard, click en tu web service
2. Click en la pestaña "Logs"
3. Deberías ver:
   - `✅ Conectado a MongoDB`
   - `✅ Servidor corriendo en puerto 3000`
   - Después de 2 minutos: `🔄 Keep-alive iniciado`
   - Cada 10 minutos: `🏓 Self-ping OK`

---

## Paso 5: Actualizar URL en las Apps

Ahora que el backend está funcionando, verifica que las apps usen la URL correcta:

### ResidenteApp

Archivo: `/iOS/ResidenteApp/src/services/api.ts`
```javascript
const API_BASE_URL = 'https://qr-manager-backend.onrender.com';
```

### VigilanciaApp

Archivo: `/iOS/VigilanciaApp/src/services/api.ts`
```javascript
const API_BASE_URL = 'https://qr-manager-backend.onrender.com';
```

Si la URL es diferente, necesitarás:
1. Cambiar la URL en ambos archivos
2. Hacer commit: `git add . && git commit -m "Update backend URL"`
3. Hacer push: `git push origin main`
4. Recompilar las apps

---

## Paso 6: Futuras Actualizaciones

Cada vez que hagas cambios al backend:

```bash
cd /Users/papayo/Desktop/QR_Backend

# Hacer cambios en server.js o cualquier archivo...

git add .
git commit -m "Descripción de los cambios"
git push origin main
```

Render detectará el push y hará auto-deploy automáticamente (tarda ~2-3 minutos).

---

## 🎉 ¡Listo!

Ahora tienes:
- ✅ Backend funcionando en Render
- ✅ MongoDB conectado
- ✅ Keep-alive activo (no se duerme fácilmente)
- ✅ Notificaciones listas (cuando recompiles ResidenteApp)
- ✅ Auto-deploy desde GitHub

---

## ⚠️ Problemas Comunes

### "Database disconnected" en logs
- Verifica `MONGODB_URI` en variables de entorno
- Verifica que la IP `0.0.0.0/0` esté whitelisted en MongoDB Atlas

### "Cannot read property 'collection' of null"
- La base de datos no conectó
- Verifica los logs de conexión en Render

### Apps no pueden conectar al backend
- Verifica que la URL en las apps sea correcta
- Verifica que el backend responda: `curl https://tu-url/health`
- Verifica que no haya typos en la URL

### Backend se sigue durmiendo
- El keep-alive ayuda pero no es perfecto en free tier
- Considera usar [UptimeRobot](https://uptimerobot.com) gratis
- O upgradearlo al plan Starter ($7/mes, no se duerme)

---

## 📞 Siguiente Paso

Después de que el backend esté funcionando:

1. ✅ Prueba los endpoints con curl
2. ✅ Abre las apps y verifica que conecten
3. ✅ Para activar notificaciones: recompila ResidenteApp
4. ✅ Prueba validar un QR y verifica que llegue notificación

¡Todo listo! 🚀
