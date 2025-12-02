# 🚀 Guía de Despliegue - Sistema Completo

## ✅ Estado Actual

Todo el código está listo y subido a GitHub:
- ✅ Registro de INEs en Sheets (FIJO - ahora usa `await`)
- ✅ Estructura jerárquica de carpetas en Drive (`Condominio/Casa_X/Tipo/`)
- ✅ Normalización de nombres (sin acentos: `Única` → `Unica`)
- ✅ Organización de Sheets por casa (`Unica_1`, `Unica_96`)
- ✅ Generación de reportes PDF mensuales

**Commit más reciente:**
```
5499956 - Add PDF report generation endpoint for monthly summaries
```

---

## 📦 Despliegue en Render

### Paso 1: Acceder a Render Dashboard

1. Ve a: https://dashboard.render.com
2. Busca tu servicio: `qr-manager-3z8x`
3. Click en el servicio

### Paso 2: Iniciar Deploy Manual

1. En la esquina superior derecha, click en **"Manual Deploy"**
2. Selecciona **"Deploy latest commit"**
3. Espera 2-3 minutos mientras se despliega

### Paso 3: Verificar en Logs

Mientras se despliega, ve a la pestaña **"Logs"** y busca:

```
✅ Conectado a MongoDB
✅ Google Drive Service inicializado correctamente
✅ Google Sheets Service inicializado correctamente
🚀 Servidor corriendo en puerto 10000
```

**IMPORTANTE:** Asegúrate de ver que está usando **OAuth** para Drive (NO Service Account):

```
ℹ️ Usando OAuth2 para Google Drive
```

---

## 🧪 Pruebas Post-Despliegue

### Prueba 1: Registro de INE con Estructura Jerárquica

Registra un INE desde **VigilanciaApp** con estos datos:
- **Casa:** 1
- **Condominio:** Única
- **Nombre:** Prueba
- **Apellido:** Test
- **Observaciones:** Uber

**Verificar:**

1. **Google Drive** - https://drive.google.com/drive/folders/1FVILaIjAVPPEfR080WFjjmIRQJtUcqfI
   - Debe existir carpeta: `Unica/Casa_1/Uber/`
   - Dentro debe haber 2 fotos: `Prueba_Frontal_XXX.jpg` y `Prueba_Trasera_XXX.jpg`

2. **Google Sheets** - https://docs.google.com/spreadsheets/d/1h_fEz5tDjNmdZ-57F2CoL5W6RjjAF7Yhw4ttJgypb7o
   - Debe existir pestaña: `Unica_INE`
   - Debe aparecer nueva fila con:
     - Fecha de hoy
     - Casa: 1
     - Condominio: Unica (sin acento)
     - Nombre: Prueba Test
     - Observaciones: Uber
     - Links clicables a las fotos en Drive

3. **Logs de Render** - https://dashboard.render.com/web/srv-ctgqnhq3esus73a4pne0/logs
   ```
   ✅ INE registrado - Casa: 1, Nombre: Prueba Test, Condominio: Única
   📝 Intentando registrar INE en Sheets: Unica_INE
   ✅ INE registrado en Google Sheets: Unica_INE
   ✅ Ruta: Unica/Casa_1/Uber
   📁 Foto frontal subida a Drive: https://drive.google.com/...
   📁 Foto trasera subida a Drive: https://drive.google.com/...
   📊 URLs de fotos actualizadas en Google Sheets: Unica_INE fila 2
   ```

---

### Prueba 2: Generación de Reporte PDF

#### Opción A: Desde el Navegador

Abre en tu navegador:
```
https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=12&year=2025&condominio=Única
```

**Resultado esperado:**
- Se descarga automáticamente un archivo PDF: `Resumen_Unica_Diciembre_2025.pdf`
- El PDF contiene:
  - Título: "REPORTE MENSUAL DE ACTIVIDAD"
  - Mes/Año: "Diciembre 2025"
  - Condominio: "Unica" (sin acento)
  - Sección de QR Codes (total, usados, expirados, activos)
  - Sección de INEs registrados (desglose por tipo)
  - Sección de Trabajadores/Repartidores

#### Opción B: Usando curl (desde terminal)

```bash
curl -O "https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=12&year=2025&condominio=Única"
```

Esto descarga el PDF en la carpeta actual.

#### Opción C: Desde Postman/Insomnia

1. Crea request GET
2. URL: `https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf`
3. Params:
   - `month`: 12
   - `year`: 2025
   - `condominio`: Única
4. Click "Send and Download"

---

### Prueba 3: Reporte de Todos los Condominios

Para generar reporte de **TODOS** los condominios (sin filtrar):

```
https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=12&year=2025
```

Esto descarga: `Resumen_Todos_Diciembre_2025.pdf`

---

## 📧 Compartir Reportes

### Por Email

1. Descarga el PDF desde el navegador
2. Abre tu cliente de email
3. Adjunta el archivo PDF
4. Envía a los administradores del condominio

### Por WhatsApp (Desktop)

1. Descarga el PDF desde el navegador
2. Abre WhatsApp Web
3. Click en el chat del administrador
4. Click en el icono de adjuntar (📎)
5. Selecciona "Documento"
6. Elige el PDF descargado
7. Enviar

### Por WhatsApp (Móvil)

1. Descarga el PDF (se guarda en Descargas)
2. Abre WhatsApp
3. Ve al chat del administrador
4. Toca el icono de adjuntar (+)
5. Selecciona "Documento"
6. Busca en "Descargas" el PDF
7. Enviar

---

## 📊 Endpoints Disponibles

### 1. Registro de INE (VigilanciaApp)
```
POST /api/register-ine
```

**Body:**
```json
{
  "houseNumber": "1",
  "condominio": "Única",
  "nombre": "Juan",
  "apellido": "Pérez",
  "numeroINE": "1234567890123",
  "curp": "PEPJ850315HDFRRN09",
  "photoFrontal": "data:image/jpeg;base64,...",
  "photoTrasera": "data:image/jpeg;base64,...",
  "observaciones": "Uber"
}
```

**Resultado:**
- ✅ Guardado en MongoDB
- 📁 Fotos en Drive: `Unica/Casa_1/Uber/`
- 📊 Registro en Sheets: pestaña `Unica_INE`

---

### 2. Reporte Mensual (JSON)
```
GET /api/monthly-report?month=12&year=2025&condominio=Única
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "month": 12,
    "year": 2025,
    "condominio": "Única",
    "qrCodes": {
      "total": 45,
      "usados": 30,
      "expirados": 5,
      "activos": 10
    },
    "ines": {
      "total": 28,
      "porTipo": {
        "Uber": 15,
        "Jardinero": 8,
        "Plomero": 5
      }
    },
    "trabajadores": {
      "total": 12,
      "porTipo": {
        "Repartidor": 10,
        "Mantenimiento": 2
      }
    }
  }
}
```

**Uso:** Para integrar con otras aplicaciones o dashboards.

---

### 3. Reporte Mensual (PDF) ⭐ NUEVO
```
GET /api/monthly-report-pdf?month=12&year=2025&condominio=Única
```

**Parámetros:**
- `month` (1-12): Mes del reporte
- `year` (2024, 2025, etc.): Año del reporte
- `condominio` (opcional): Nombre del condominio
  - Si se omite: genera reporte de **todos** los condominios

**Respuesta:**
- Content-Type: `application/pdf`
- Descarga automática del archivo PDF
- Nombre del archivo: `Resumen_{Condominio}_{Mes}_{Año}.pdf`

**Ejemplo:**
- URL: `/api/monthly-report-pdf?month=11&year=2025&condominio=Única`
- Archivo: `Resumen_Unica_Noviembre_2025.pdf`

---

## 🎨 Formato del PDF

El PDF generado incluye:

### 1. Encabezado
```
═══════════════════════════════════════════════════════════════
        REPORTE MENSUAL DE ACTIVIDAD
═══════════════════════════════════════════════════════════════

Mes: Diciembre 2025
Condominio: Unica
```

### 2. Sección QR Codes
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. CÓDIGOS QR GENERADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total de QR generados: 45
QR usados (escaneados): 30
QR expirados: 5
QR activos (sin usar): 10
```

### 3. Sección INEs
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. REGISTROS DE INE (Trabajadores/Visitantes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total de INEs registrados: 28

Desglose por tipo:
  • Uber: 15 registros
  • Jardinero: 8 registros
  • Plomero: 5 registros
```

### 4. Sección Trabajadores
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. TRABAJADORES Y REPARTIDORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total de trabajadores registrados: 12

Desglose por tipo:
  • Repartidor: 10 registros
  • Mantenimiento: 2 registros
```

### 5. Pie de Página
```
═══════════════════════════════════════════════════════════════
Generado el: 2025-12-02 15:30:45
Sistema: QR Manager - VigilanciaApp
═══════════════════════════════════════════════════════════════
```

---

## 🔧 Variables de Entorno en Render

Asegúrate de que estas variables estén configuradas en Render Dashboard:

### MongoDB
```
MONGODB_URI=mongodb+srv://papayo15:...@cluster0.mongodb.net/qr-manager
```

### Google Drive
```
DRIVE_FOLDER_ID=1FVILaIjAVPPEtR080WFjjmIRQJtUcqfI
```

### Google Sheets
```
SPREADSHEET_ID=1h_fEz5tDjNmdZ-57F2CoL5W6RjjAF7Yhw4ttJgypb7o
```

### OAuth Credentials (REQUERIDO - NO Service Account)
```
OAUTH_CLIENT_ID=tu_client_id.apps.googleusercontent.com
OAUTH_CLIENT_SECRET=tu_client_secret
OAUTH_REFRESH_TOKEN=tu_refresh_token
```

✅ **Estas ya están configuradas correctamente en tu Render.**

---

## ❓ Troubleshooting

### Problema 1: No aparece el INE en Sheets

**Síntomas:**
- La foto se sube a Drive correctamente
- Pero no hay fila nueva en el Sheet

**Solución:**
1. Ve a Render Logs
2. Busca: `❌ Error registrando INE en Sheets`
3. El error te dirá qué está mal (usualmente permisos OAuth)

**Si ves:**
```
⚠️ No se pudo registrar en Sheets (función retornó null)
```
Revisa que la pestaña `{Condominio}_INE` exista en el Sheet.

---

### Problema 2: Las fotos no se organizan en carpetas jerárquicas

**Síntomas:**
- Las fotos se suben pero no están en `Condominio/Casa_X/Tipo/`

**Solución:**
1. Verifica en los logs de Render que aparezca:
   ```
   ✅ Ruta: Unica/Casa_1/Uber
   ```
2. Si no aparece, verifica que el campo `observaciones` tenga el tipo de trabajador
3. Si `observaciones` está vacío, se usa la carpeta "General" por defecto

---

### Problema 3: El PDF no se descarga

**Síntomas:**
- El endpoint responde pero el navegador no descarga nada

**Solución:**
1. Verifica que la URL esté correcta y tenga los parámetros `month` y `year`
2. Abre la URL directamente en el navegador (no desde fetch/axios)
3. Si persiste, revisa los logs de Render para ver errores de generación

**Ejemplo de URL correcta:**
```
https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=12&year=2025
```

---

### Problema 4: El PDF está vacío o sin datos

**Síntomas:**
- El PDF se descarga pero dice "0 registros" en todas las secciones

**Causa:**
- No hay datos para ese mes/año/condominio en MongoDB

**Solución:**
1. Verifica que los registros existan en MongoDB para esa fecha
2. Recuerda que el sistema usa la zona horaria de México (America/Mexico_City)
3. Prueba con un mes donde sepas que hay datos registrados

---

## 📅 Casos de Uso Comunes

### Caso 1: Reporte Mensual para Administración

**Objetivo:** Enviar reporte de todo lo que pasó en Diciembre 2025 en el condominio "Única"

**Pasos:**
1. Abre: `https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=12&year=2025&condominio=Única`
2. Se descarga: `Resumen_Unica_Diciembre_2025.pdf`
3. Envía el PDF por email al administrador

---

### Caso 2: Auditoría de Todos los Condominios

**Objetivo:** Ver actividad de todos los condominios en Noviembre 2025

**Pasos:**
1. Abre: `https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=11&year=2025`
2. Se descarga: `Resumen_Todos_Noviembre_2025.pdf`
3. El PDF incluye datos agregados de todos los condominios

---

### Caso 3: Compartir por WhatsApp a Grupo de Vigilantes

**Objetivo:** Mandar el reporte mensual al grupo de WhatsApp

**Pasos:**
1. Descarga el PDF del mes actual
2. Abre WhatsApp
3. Ve al grupo "Vigilancia - Única"
4. Adjunta el documento PDF
5. Agrega mensaje: "Reporte de actividad de este mes ✅"
6. Enviar

---

## ✅ Checklist Final

Antes de considerar el despliegue completo:

- [ ] Deploy en Render completado
- [ ] Logs muestran OAuth activo (no Service Account)
- [ ] Registro de INE desde VigilanciaApp funciona
- [ ] Fotos aparecen en Drive con estructura: `Condominio/Casa_X/Tipo/`
- [ ] INE aparece en Google Sheets pestaña `{Condominio}_INE`
- [ ] Nombres normalizados sin acentos (Única → Unica)
- [ ] PDF se descarga correctamente desde navegador
- [ ] PDF contiene datos correctos del mes solicitado
- [ ] PDF se puede compartir por WhatsApp/Email

---

## 🎉 ¡Listo!

Una vez completado el checklist, el sistema está 100% funcional:

✅ **Registro de INEs** → MongoDB + Drive + Sheets
✅ **Organización jerárquica** → `Condominio/Casa/Tipo`
✅ **Normalización de nombres** → Sin acentos
✅ **Reportes PDF** → Descargables y compartibles

**Siguiente:** Despliega en Render y prueba con datos reales.

---

**Generado:** 2025-12-02
**Sistema:** QR Manager Backend
**Versión:** 1.0.0
