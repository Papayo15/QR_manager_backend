# ✅ Instrucciones de Deployment - Google Drive Integration

## 📋 Resumen de Cambios Implementados

Se implementó la funcionalidad completa de guardado de fotos de trabajadores en Google Drive.

### ✨ Características Implementadas:

1. **Subida de fotos a Google Drive** - Las fotos se guardan FÍSICAMENTE como archivos JPEG
2. **Fotos visibles en Drive** - Puedes ver, descargar y compartir desde Google Drive
3. **Fallback a MongoDB** - Si Drive falla, las fotos se guardan en MongoDB
4. **Metadatos completos** - Se guarda información del trabajador, casa, tipo, etc.
5. **Logging detallado** - Logs claros de todo el proceso

## 🔄 Archivos Modificados:

- ✅ `server.js` - Backend completo actualizado
- ✅ `.env.example` - Nuevas variables documentadas
- ✅ `package.json` - Ya tiene googleapis instalado

## 🚀 Pasos para Desplegar en Render:

### 1. Verificar Variables de Entorno

Ya tienes configuradas en Render:
- ✅ `OAUTH_CLIENT_ID`
- ✅ `OAUTH_CLIENT_SECRET`  
- ✅ `OAUTH_REFRESH_TOKEN`
- ✅ `DRIVE_FOLDER_ID`
- ✅ `MONGODB_URI`
- ✅ `SERVER_URL`

### 2. Hacer Push a GitHub

```bash
cd /Users/papayo/Desktop/QR_Backend

# Ver cambios
git status

# Agregar cambios
git add server.js .env.example

# Commit
git commit -m "Implementar guardado de fotos en Google Drive

- Agregar integración completa con Google Drive API
- Subir fotos de trabajadores como archivos JPEG
- Fallback a MongoDB si Drive falla
- Logging mejorado y validaciones
- Límite de 50mb para fotos base64"

# Push
git push origin main
```

### 3. Render Desplegará Automáticamente

Render detectará el push y desplegará automáticamente. Espera 2-3 minutos.

### 4. Verificar Deployment

```bash
# Check health endpoint
curl https://qr-manager-3z8x.onrender.com/health
```

Deberías ver:
```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2025-11-18T...",
  "uptime": 123,
  "database": "connected",
  "googleDrive": "configured"  ← DEBE DECIR "configured"
}
```

### 5. Verificar Logs en Render

En el dashboard de Render, revisa los logs y busca:

```
✅ Cliente de Google Drive inicializado
✅ Conectado a MongoDB
✅ Servidor corriendo en puerto 3000
📂 Google Drive: ✅ Configurado
💾 MongoDB: ✅ Conectado
```

## 🧪 Probar el Registro de Trabajadores

Usa la app de Vigilancia para registrar un trabajador:

1. Abre VigilanciaApp
2. Ve a "Registrar Trabajador"
3. Llena los datos y toma una foto
4. Presiona "Registrar"

### ✅ Si todo funciona correctamente:

1. **En la app**: Verás "Trabajador registrado correctamente"
2. **En Drive**: Aparecerá un archivo JPEG en tu carpeta configurada
3. **En MongoDB**: Se guardará el registro con el link a Drive
4. **En Logs de Render**: Verás:
   ```
   📤 Foto subida a Drive - ID: xxx - Nombre: trabajador_xxx.jpg
   ✅ Registro guardado en MongoDB - ID: xxx
   ```

### ⚠️ Si Drive falla (por configuración incorrecta):

1. **La foto se guardará en MongoDB** como backup
2. **En Logs**: Verás "⚠️ Foto guardada en MongoDB como fallback"
3. **La app seguirá funcionando** - no se pierde el registro

## 📸 Cómo Acceder a las Fotos en Drive

1. Ve a https://drive.google.com
2. Busca la carpeta con el ID: `1FVILaIjAVPPEtR080WFjjmIRQJtUcqfI`
3. Verás archivos con formato: `trabajador_CONDOMINIO_casaXX_TIPO_timestamp.jpg`
4. Puedes:
   - Ver las fotos directamente
   - Descargarlas
   - Compartir los links
   - Organizarlas en subcarpetas

## 🔍 Troubleshooting

### Problema: "googleDrive": "not configured"

**Solución**: Verifica en Render que las variables estén correctas:
- OAUTH_CLIENT_ID debe empezar con números
- OAUTH_CLIENT_SECRET debe ser alfanumérico
- OAUTH_REFRESH_TOKEN debe empezar con "1//"
- DRIVE_FOLDER_ID debe ser solo lettersyNumbers (sin espacios)

### Problema: Error subiendo a Drive

**Logs**: `❌ Error subiendo foto a Drive: ...`

**Posibles causas**:
1. Token expirado - Regenera el OAUTH_REFRESH_TOKEN
2. Permisos de carpeta - Verifica que la cuenta tenga acceso
3. Cuota de Drive excedida - Revisa espacio disponible

**Solución temporal**: Las fotos se guardan en MongoDB como fallback

### Problema: Fotos muy grandes

El límite es 50MB por foto. Si ves errores de tamaño:
- Verifica la compresión en la app móvil
- Revisa que las fotos no excedan 50MB

## ✅ Checklist Final

- [ ] Variables de entorno configuradas en Render
- [ ] Código pusheado a GitHub
- [ ] Deployment exitoso en Render
- [ ] Health check muestra "googleDrive": "configured"
- [ ] Logs muestran "✅ Cliente de Google Drive inicializado"
- [ ] Prueba con un trabajador real
- [ ] Foto aparece en Google Drive
- [ ] Registro aparece en MongoDB

## 📊 Estructura de Datos en MongoDB

```javascript
{
  _id: ObjectId("..."),
  houseNumber: "123",
  workerName: "Juan Pérez",
  workerType: "Jardinero",
  condominio: "Villa del Sol",
  createdAt: "2025-11-18T13:30:00.000Z",
  registeredAt: "2025-11-18T13:30:00.000Z",
  status: "active",
  photo: {
    driveFileId: "xxxxxxxxxxxxx",
    fileName: "trabajador_VillaDelSol_casa123_Jardinero_1731936600000.jpg",
    webViewLink: "https://drive.google.com/file/d/xxxxx/view",
    webContentLink: "https://drive.google.com/uc?id=xxxxx&export=download",
    uploadedAt: "2025-11-18T13:30:00.000Z"
  }
}
```

## 🎉 ¡Listo!

Ahora las fotos de trabajadores se guardan FÍSICAMENTE en Google Drive y puedes verlas en tu carpeta.
