# 📊 Tracking de INEs en Google Sheets

## Descripción

El backend ahora registra automáticamente todos los INEs (trabajadores/visitantes) en Google Sheets para facilitar reportes mensuales.

---

## ¿Cómo Funciona?

Cuando un vigilante registra un INE desde **VigilanciaApp**:

1. ✅ Se guarda en MongoDB (base de datos)
2. 📤 Se suben fotos a Google Drive
3. 📊 **NUEVO:** Se registra en Google Sheets automáticamente

---

## Estructura del Sheet

### Pestañas Creadas Automáticamente

El sistema crea una pestaña por condominio con el formato:

```
{NombreCondominio}_INE
```

**Ejemplos:**
- `Unica_INE` - Registro de INEs del Condominio Unica
- `TorresSur_INE` - Registro de INEs del Condominio TorresSur
- `LasCañadas_INE` - Registro de INEs del Condominio LasCañadas

---

## Columnas del Sheet

| Columna | Descripción | Ejemplo |
|---------|-------------|---------|
| **A - Fecha Registro** | Fecha y hora de registro (hora de México) | `2025-01-18 15:30:45` |
| **B - Casa** | Número de casa | `15` |
| **C - Condominio** | Nombre del condominio | `Unica` |
| **D - Nombre** | Nombre del trabajador/visitante | `Juan` |
| **E - Apellido** | Apellido | `Pérez García` |
| **F - Número INE** | Número de credencial INE (opcional) | `1234567890123` |
| **G - CURP** | CURP (opcional) | `PEGJ850315HDFRRN09` |
| **H - Observaciones** | Notas adicionales (opcional) | `Jardinero` |
| **I - Foto Frontal** | URL de la foto frontal del INE | Link de Drive |
| **J - Foto Trasera** | URL de la foto trasera del INE | Link de Drive |

---

## Ejemplo de Uso

### Antes (Sin Sheets)

```
Vigilante registra INE → Solo se guarda en MongoDB
```

❌ No hay forma fácil de generar reportes mensuales
❌ Hay que exportar datos de MongoDB manualmente

---

### Ahora (Con Sheets)

```
Vigilante registra INE → MongoDB + Drive + Google Sheets
```

✅ Reportes mensuales automáticos en Sheets
✅ Fácil de filtrar, ordenar y contar
✅ Se puede compartir con administración
✅ Exportar a Excel en 1 click

---

## Reportes Mensuales

### Conteo de Trabajadores por Mes

1. Abre el Google Sheet: https://docs.google.com/spreadsheets/d/1h_fEz5tDjNmdZ-57F2CoL5W6RjjAF7Yhw4ttJgypb7o
2. Ve a la pestaña del condominio (ej: `Unica_INE`)
3. Filtra por fecha (columna A)
4. Cuenta filas

**Ejemplo con fórmula:**
```
=COUNTIFS(A:A, ">=2025-01-01", A:A, "<=2025-01-31")
```
Esto te da el total de INEs registrados en enero 2025.

---

### Trabajadores por Casa

Para ver cuántos trabajadores/visitantes tuvo una casa específica:

```
=COUNTIF(B:B, "15")
```
Esto cuenta cuántos INEs se registraron para la Casa 15.

---

### Exportar a Excel

1. Ve a la pestaña del condominio
2. Click en **Archivo → Descargar → Microsoft Excel (.xlsx)**
3. Listo, tienes tu reporte en Excel

---

## Verificación

### ¿Cómo saber si está funcionando?

Después de desplegar los cambios en Render:

1. **Registra un INE desde VigilanciaApp**
2. **Ve al Google Sheet**: https://docs.google.com/spreadsheets/d/1h_fEz5tDjNmdZ-57F2CoL5W6RjjAF7Yhw4ttJgypb7o
3. **Busca la pestaña**: `{TuCondominio}_INE`
4. **Deberías ver una nueva fila** con:
   - Fecha de hoy
   - Número de casa
   - Nombre del trabajador
   - "Procesando..." en las columnas de fotos (se actualizarán en unos segundos)

---

### En los Logs de Render

Cuando funciona correctamente verás:

```
✅ INE registrado - Casa: 15, Nombre: Juan Pérez, Condominio: Unica
📊 INE registrado en Google Sheets: Unica_INE - Juan Pérez
✨ Nueva pestaña INE creada: Unica_INE  (solo la primera vez)
📁 Foto frontal subida a Drive: https://drive.google.com/...
📁 Foto trasera subida a Drive: https://drive.google.com/...
📊 URLs de fotos actualizadas en Google Sheets: Unica_INE fila 2
```

---

## Ventajas

### Para Vigilancia
✅ No cambia nada en su flujo de trabajo
✅ Sigue registrando igual que antes
✅ Todo es automático

### Para Administración
✅ Reporte mensual listo automáticamente
✅ Puede ver en tiempo real quién entró
✅ Fácil de auditar y revisar
✅ Las fotos de INE son clicables (van a Drive)

### Para Contabilidad
✅ Exportar a Excel para facturación
✅ Contar trabajadores por mes/condominio
✅ Historial completo y organizado

---

## Configuración

### Variables de Entorno Requeridas

Ya están configuradas en Render:

```bash
SPREADSHEET_ID=tu_spreadsheet_id
OAUTH_CLIENT_ID=tu_client_id.apps.googleusercontent.com
OAUTH_CLIENT_SECRET=tu_client_secret
OAUTH_REFRESH_TOKEN=tu_refresh_token
```

✅ Estas variables ya están configuradas correctamente en tu instancia de Render.

No necesitas hacer nada adicional. ✅

---

## Troubleshooting

### No se crea la pestaña del condominio

**Causa:** Error de permisos en Google Sheets.

**Solución:**
1. Verifica que el OAuth esté configurado correctamente
2. Revisa los logs de Render: busca `❌ Error creando/buscando pestaña INE`
3. El error específico te dirá qué está mal

---

### Las fotos aparecen como "Procesando..." permanentemente

**Causa:** La subida de fotos a Drive falló.

**Solución:**
1. Revisa los logs de Render para ver el error de subida
2. Las fotos se actualizan en background, dale 10-15 segundos
3. Si persiste, verifica que el OAuth tenga acceso a Drive

---

### No aparecen los INEs en el Sheet

**Causa:** El registro en Sheets falló silenciosamente.

**Solución:**
1. Revisa los logs: busca `❌ Error registrando INE en Sheets`
2. Verifica que `SPREADSHEET_ID` esté correcto en Render
3. Verifica que la cuenta de OAuth tenga acceso de escritura al Sheet

---

### Aparecen filas duplicadas

**Causa:** El usuario registró el mismo INE dos veces.

**Esto es normal:** Cada registro es una entrada nueva (puede haber visitantes recurrentes).

Si quieres evitar duplicados, puedes usar **Datos → Quitar duplicados** en Google Sheets.

---

## Código Relevante

### Funciones Principales

1. **`getOrCreateINESheet(condominioName)`** - [server.js:313-371](../server.js#L313-L371)
   - Busca o crea la pestaña `{Condominio}_INE`
   - Agrega encabezados si es nueva

2. **`registerINEInSheet(ineData)`** - [server.js:373-427](../server.js#L373-L427)
   - Registra el INE en la pestaña correspondiente
   - Formato de fecha en hora de México

3. **`updateINEPhotosInSheet(ineData, sheetInfo)`** - [server.js:429-487](../server.js#L429-L487)
   - Actualiza las URLs de fotos cuando la subida termina
   - Busca la fila por casa, condominio y nombre

### Endpoint Modificado

**`POST /api/register-ine`** - [server.js:1187-1428](../server.js#L1187-L1428)
- Línea 1323-1329: Registro en Sheets (background, no bloquea)
- Línea 1389-1397: Actualización de fotos en Sheets

---

## Próximas Mejoras Posibles

1. **Dashboard en Sheets**: Pestaña con resumen automático por mes
2. **Gráficas**: Visualización de tendencias de trabajadores
3. **Alertas**: Notificación cuando un trabajador excede X visitas
4. **Integración con nómina**: Exportar directamente a sistema de pagos

---

## Resumen

✅ **Automático**: No requiere acción del vigilante
✅ **Rápido**: No afecta el tiempo de respuesta
✅ **Confiable**: Maneja errores sin romper el flujo
✅ **Útil**: Reportes mensuales listos sin esfuerzo

🎉 **Listo para producción**
