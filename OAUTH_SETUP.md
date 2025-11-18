# 🔐 Configuración de OAuth para Google Drive

## ⚠️ IMPORTANTE

**Service Accounts NO pueden subir archivos a Google Drive** porque no tienen cuota de almacenamiento propia.

Para que el backend pueda subir fotos a Google Drive, **DEBES usar OAuth** con un refresh token.

---

## Paso 1: Crear OAuth Client ID en Google Cloud Console

1. Ve a https://console.cloud.google.com/apis/credentials
2. Selecciona tu proyecto (o crea uno nuevo)
3. Click en **"Create Credentials"** → **"OAuth client ID"**
4. **Application type:** Web application
5. **Name:** QR Manager Backend
6. **Authorized redirect URIs:** Agrega:
   ```
   http://localhost:3000/oauth2callback
   ```
7. Click **"Create"**
8. **GUARDA BIEN:**
   - **Client ID** (parecido a: `123456.apps.googleusercontent.com`)
   - **Client Secret** (parecido a: `GOCSPX-abc123...`)

---

## Paso 2: Habilitar APIs necesarias

En Google Cloud Console, habilita estas APIs:

1. **Google Drive API**: https://console.cloud.google.com/apis/library/drive.googleapis.com
2. **Google Sheets API**: https://console.cloud.google.com/apis/library/sheets.googleapis.com

---

## Paso 3: Generar Refresh Token (EN TU COMPUTADORA)

### A. Configurar variables de entorno localmente

En tu terminal:

```bash
cd /Users/papayo/Desktop/QR_Backend

# Reemplaza con tus valores reales
export OAUTH_CLIENT_ID="TU_CLIENT_ID.apps.googleusercontent.com"
export OAUTH_CLIENT_SECRET="TU_CLIENT_SECRET"
```

### B. Ejecutar el generador de tokens

```bash
node generate-oauth-token.cjs
```

### C. Seguir el flujo OAuth

1. El script mostrará una URL larga que empieza con `https://accounts.google.com/o/oauth2/v2/auth...`
2. **Copia la URL completa** y ábrela en tu navegador
3. **Inicia sesión con la cuenta de Google que tiene el Drive donde quieres guardar las fotos**
4. Click en **"Permitir"** para darle permisos al backend
5. Serás redirigido a `http://localhost:3000/oauth2callback?code=...`
6. **En la terminal** verás:
   ```
   ✨ ¡REFRESH TOKEN GENERADO!
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Copia este token y pégalo en Render como OAUTH_REFRESH_TOKEN:

   1//abc123def456...xyz789
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```
7. **GUARDA ESE TOKEN** - es tu refresh token

---

## Paso 4: Configurar Variables en Render

1. Ve a https://dashboard.render.com
2. Selecciona tu Web Service: `qr-manager-backend`
3. Click en **"Environment"** en el menú izquierdo
4. **Agrega estas 3 variables:**

```
OAUTH_CLIENT_ID = TU_CLIENT_ID.apps.googleusercontent.com
OAUTH_CLIENT_SECRET = TU_CLIENT_SECRET
OAUTH_REFRESH_TOKEN = 1//abc123def456...xyz789
```

5. Click **"Save Changes"**
6. Render reiniciará automáticamente el servidor

---

## Paso 5: Verificar que Funciona

### A. Ver los logs de Render

En los logs de Render deberías ver:

```
🔐 Usando OAuth para Google Drive y Sheets
✅ Google Drive inicializado con OAuth
✅ Google Sheets inicializado con OAuth
```

**Si ves:**
```
⚠️ OAuth no configurado, usando Service Account (limitado)
```
→ Significa que falta alguna variable OAuth en Render.

### B. Probar subir una foto desde la app

1. Abre **VigilanciaApp**
2. Escanea un QR de una casa
3. Click en **"Registrar Trabajador/INE"**
4. Toma una foto de prueba
5. Click en **"Registrar"**

### C. Verificar en Drive

1. Abre tu Google Drive: https://drive.google.com/drive/folders/1FVILaIjAVPPEtR080WFjjmIRQJtUcqfI
2. Deberías ver una carpeta con el nombre del condominio (ej: "Unica")
3. Dentro de esa carpeta deberías ver la foto con nombre: `trabajador_Casa1_20251118_223456.jpg`

---

## 🎉 ¡Listo!

Ahora el backend puede:
- ✅ Crear carpetas por condominio en Drive
- ✅ Subir fotos a Drive usando OAuth
- ✅ Guardar metadatos en MongoDB
- ✅ Registrar QR codes en Google Sheets

---

## ⚠️ Problemas Comunes

### "Service Accounts do not have storage quota"

→ Significa que todavía está usando Service Account en lugar de OAuth.
→ Verifica que las 3 variables OAuth estén configuradas en Render.

### "invalid_grant" al generar el token

→ El código de autorización expiró (dura solo 10 minutos).
→ Ejecuta `node generate-oauth-token.cjs` de nuevo y completa el flujo más rápido.

### "redirect_uri_mismatch"

→ Verifica que en Google Cloud Console tengas **exactamente**:
   `http://localhost:3000/oauth2callback`
→ NO debe tener barra al final, ni HTTPS, ni puerto diferente.

### Las fotos no se guardan

1. Verifica los logs de Render
2. Busca el mensaje: `📤 Foto subida a Drive: ...`
3. Si no aparece, busca: `❌ Error subiendo foto a Drive: ...`
4. El error te dirá qué está mal

---

## 📞 Siguiente Paso

Después de configurar OAuth:

1. ✅ Generar refresh token con `node generate-oauth-token.cjs`
2. ✅ Configurar las 3 variables OAuth en Render
3. ✅ Esperar a que Render redeploy (2-3 minutos)
4. ✅ Verificar logs que digan "Usando OAuth"
5. ✅ Probar registrar trabajador desde VigilanciaApp
6. ✅ Verificar que la foto aparezca en Drive

¡Todo listo! 🚀
