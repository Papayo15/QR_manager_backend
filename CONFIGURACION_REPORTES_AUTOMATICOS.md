# 📊 Configuración de Reportes Automáticos

## ✅ Cambios Implementados

### 1. Hora en Nombre de Archivo
Los archivos ahora incluyen la hora de registro:

**Formato:**
```
Pedro_Uber_Dia09_19h30_Frontal_timestamp.jpg
```

**Componentes:**
- **Nombre:** Pedro
- **Tipo:** Uber
- **Día:** Dia09 (día 9)
- **Hora:** 19h30 (7:30 PM en formato 24hrs)
- **Lado:** Frontal/Trasera
- **Timestamp:** Único

**Ejemplo real:**
```
Unica/Casa_100/2025/Dic/Pedro_Uber_Dia09_19h30_Frontal_1734567890.jpg
```

---

### 2. Sistema de Reportes Automáticos

El sistema genera y envía reportes automáticamente **cada día 1 del mes a las 2:00 AM** (hora de México).

**Qué hace:**
1. Escanea todos los condominios en Drive
2. Genera reporte del mes anterior
3. Crea PDF profesional
4. Envía por email a administradores

---

## 🔧 Configuración en Render

### Variables de Entorno Necesarias

Ve a: **Render Dashboard → qr-manager-3z8x → Environment**

Agrega estas 3 nuevas variables:

#### 1. EMAIL_USER
**Tu email de Gmail:**
```
ejemplo@gmail.com
```

#### 2. EMAIL_PASSWORD
**App Password de Gmail** (NO tu contraseña normal)

**¿Cómo obtenerlo?**

1. Ve a: https://myaccount.google.com/security
2. Activa "Verificación en 2 pasos" (si no está activa)
3. Ve a: https://myaccount.google.com/apppasswords
4. Selecciona:
   - App: "Mail"
   - Device: "Other" → escribe "QR Manager"
5. Click "Generate"
6. **Copia el código de 16 caracteres** (sin espacios)

**Ejemplo:**
```
abcd efgh ijkl mnop  ← Como aparece
abcdefghijklmnop     ← Como lo pegas en Render
```

#### 3. EMAIL_RECIPIENTS
**Emails separados por comas:**
```
admin1@gmail.com,admin2@gmail.com,admin3@gmail.com
```

---

## 📅 Programación Automática

### Cuándo se ejecuta:
**Cada día 1 del mes a las 2:00 AM** (hora de México)

### Qué mes reporta:
**El mes anterior**

**Ejemplos:**
- 1 de enero 2025 → Reporta diciembre 2024
- 1 de febrero 2025 → Reporta enero 2025
- 1 de marzo 2025 → Reporta febrero 2025

### Cron Expression:
```
0 2 1 * *
```
- `0` = minuto 0
- `2` = hora 2 AM
- `1` = día 1 del mes
- `*` = cualquier mes
- `*` = cualquier día de semana

---

## 📧 Email que se Envía

### Asunto:
```
Reporte Mensual - Única - Diciembre 2024
```

### Contenido:
```
Reporte Mensual de Actividad

Estimado administrador,

Adjunto encontrarás el reporte mensual de actividad para:

• Condominio: Única
• Período: Diciembre 2024

Este reporte incluye:
• Total de trabajadores/servicios registrados
• Desglose por tipo de trabajador
• Desglose por casa

[PDF adjunto]
```

### Archivos Adjuntos:
```
Resumen_Unica_Diciembre_2024.pdf
```

---

## 🧪 Probar Manualmente (sin esperar al día 1)

### Endpoint para Prueba Manual:
```
POST https://qr-manager-3z8x.onrender.com/api/generate-monthly-reports
```

### Usando curl:
```bash
curl -X POST https://qr-manager-3z8x.onrender.com/api/generate-monthly-reports
```

### Usando Postman:
1. Método: **POST**
2. URL: `https://qr-manager-3z8x.onrender.com/api/generate-monthly-reports`
3. Click "Send"

**Resultado:**
```json
{
  "success": true,
  "message": "Generación de reportes iniciada. Los reportes se enviarán por email cuando estén listos."
}
```

Los reportes llegarán por email en 1-2 minutos.

---

## 📊 Logs del Sistema

### Ver logs en Render:
1. Ve a: https://dashboard.render.com/web/srv-ctgqnhq3esus73a4pne0/logs

### Al iniciar el servidor verás:
```
✅ Email transporter configurado
📅 Cron job configurado: Reportes automáticos cada día 1 a las 2:00 AM (México)
```

### Cuando se ejecuta el cron job:
```
⏰ Tarea programada activada: Generación de reportes mensuales

📊 ===== GENERANDO REPORTE MENSUAL AUTOMÁTICO =====
📅 Generando reporte de Diciembre 2024
📁 Encontrados 3 condominios

  📊 Generando reporte para: Unica
  ✅ Datos encontrados: 45 registros
  ✅ Email enviado a: admin1@gmail.com, admin2@gmail.com
  ✅ Reporte completado para Unica

✅ ===== REPORTES MENSUALES COMPLETADOS =====
```

---

## ⚠️ Troubleshooting

### Problema 1: No llegan los emails

**Causa:** Variables de entorno no configuradas

**Solución:**
1. Ve a Render → Environment
2. Verifica que existan:
   - `EMAIL_USER`
   - `EMAIL_PASSWORD` (App Password)
   - `EMAIL_RECIPIENTS`
3. Redeploy el servicio

---

### Problema 2: Error "Invalid login"

**Causa:** App Password incorrecto

**Solución:**
1. Genera nuevo App Password en: https://myaccount.google.com/apppasswords
2. Copia el código de 16 caracteres (sin espacios)
3. Actualiza `EMAIL_PASSWORD` en Render
4. Redeploy

---

### Problema 3: Quiero cambiar la hora

**Para cambiar a las 3:00 AM:**
```javascript
cron.schedule('0 3 1 * *', () => {
  // ...
});
```

**Para cambiar al día 5:**
```javascript
cron.schedule('0 2 5 * *', () => {
  // ...
});
```

---

### Problema 4: Quiero probar con datos de otro mes

**Modificar temporalmente:**
```javascript
// En lugar de:
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

// Cambiar a mes específico (ej: noviembre = 11):
const lastMonth = new Date(2024, 10, 1); // noviembre 2024
```

---

## 📝 Ejemplo Completo de Configuración

### En Render Dashboard:

```
EMAIL_USER=administrador@gmail.com
EMAIL_PASSWORD=abcdefghijklmnop
EMAIL_RECIPIENTS=admin1@condominio.com,admin2@condominio.com
```

### Resultado:
- ✅ Sistema configurado
- ✅ Cada día 1 a las 2 AM se generan reportes
- ✅ Se envían a admin1 y admin2
- ✅ Un PDF por cada condominio

---

## 🎯 Resumen

**Archivos ahora incluyen:**
```
Pedro_Uber_Dia09_19h30_Frontal_xxx.jpg
```
- ✅ Nombre
- ✅ Tipo de trabajador
- ✅ Día del mes
- ✅ Hora (formato 24hrs)

**Reportes automáticos:**
- ✅ Cada día 1 del mes
- ✅ A las 2:00 AM (México)
- ✅ Envío por email
- ✅ Un PDF por condominio

**Para activar:**
1. Agrega variables de entorno en Render
2. Deploy
3. Espera al día 1 (o prueba manualmente)

---

## 🚀 Pasos Finales

### 1. Configurar Gmail App Password
- https://myaccount.google.com/apppasswords

### 2. Agregar Variables en Render
```
EMAIL_USER=tu-email@gmail.com
EMAIL_PASSWORD=tu-app-password
EMAIL_RECIPIENTS=admin1@gmail.com,admin2@gmail.com
```

### 3. Deploy en Render
- Manual Deploy → Deploy latest commit

### 4. Probar
```bash
curl -X POST https://qr-manager-3z8x.onrender.com/api/generate-monthly-reports
```

### 5. Verificar Email
- Revisa inbox de los destinatarios
- Busca: "Reporte Mensual - ..."

---

**Última actualización:** 2025-12-09
**Versión:** 3.0.0 - Sistema automático
