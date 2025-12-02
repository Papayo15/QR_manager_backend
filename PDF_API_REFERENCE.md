# 📄 API de Reportes PDF - Referencia Rápida

## Endpoint

```
GET /api/monthly-report-pdf
```

---

## Parámetros

| Parámetro | Tipo | Requerido | Descripción | Ejemplo |
|-----------|------|-----------|-------------|---------|
| `month` | Number | ✅ Sí | Mes del reporte (1-12) | `12` |
| `year` | Number | ✅ Sí | Año del reporte | `2025` |
| `condominio` | String | ❌ No | Nombre del condominio (opcional) | `Única` |

---

## Ejemplos de Uso

### 1. Reporte de un Condominio Específico

```bash
GET https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=12&year=2025&condominio=Única
```

**Resultado:**
- Descarga: `Resumen_Unica_Diciembre_2025.pdf`
- Contenido: Solo datos del condominio "Única"

---

### 2. Reporte de Todos los Condominios

```bash
GET https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=11&year=2025
```

**Resultado:**
- Descarga: `Resumen_Todos_Noviembre_2025.pdf`
- Contenido: Datos agregados de todos los condominios

---

### 3. Reporte del Mes Actual

```bash
# Diciembre 2025
GET https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=12&year=2025&condominio=Única
```

---

## Respuesta HTTP

### Success (200 OK)

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename=Resumen_Unica_Diciembre_2025.pdf

[Binary PDF data]
```

El navegador descarga automáticamente el archivo PDF.

---

### Error (400 Bad Request)

```json
{
  "success": false,
  "error": "Parámetros 'month' y 'year' son requeridos"
}
```

**Causa:** Falta el parámetro `month` o `year`

---

### Error (500 Internal Server Error)

```json
{
  "success": false,
  "error": "Error generando el reporte PDF",
  "details": "Cannot read property 'collection' of undefined"
}
```

**Causa:** Error interno del servidor (MongoDB desconectado, etc.)

---

## Estructura del PDF

### Header
```
═══════════════════════════════════════════════════════════════
        REPORTE MENSUAL DE ACTIVIDAD
═══════════════════════════════════════════════════════════════

Mes: Diciembre 2025
Condominio: Unica
```

### Sección 1: QR Codes
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. CÓDIGOS QR GENERADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total de QR generados: 45
QR usados (escaneados): 30
QR expirados: 5
QR activos (sin usar): 10
```

### Sección 2: INEs
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

### Sección 3: Trabajadores
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. TRABAJADORES Y REPARTIDORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total de trabajadores registrados: 12

Desglose por tipo:
  • Repartidor: 10 registros
  • Mantenimiento: 2 registros
```

### Footer
```
═══════════════════════════════════════════════════════════════
Generado el: 2025-12-02 15:30:45
Sistema: QR Manager - VigilanciaApp
═══════════════════════════════════════════════════════════════
```

---

## Formato del Archivo

### Nombre del Archivo

**Patrón:**
```
Resumen_{Condominio}_{Mes}_{Año}.pdf
```

**Ejemplos:**
- `Resumen_Unica_Diciembre_2025.pdf`
- `Resumen_TorresSur_Noviembre_2025.pdf`
- `Resumen_Todos_Enero_2025.pdf`

### Propiedades del PDF
- **Tamaño de página:** Carta (Letter)
- **Márgenes:** 50 puntos
- **Fuente título:** Helvetica-Bold, 20pt
- **Fuente encabezados:** Helvetica-Bold, 16pt
- **Fuente contenido:** Helvetica, 12pt
- **Orientación:** Vertical (Portrait)

---

## Datos Incluidos

### QR Codes
- Total generados en el mes
- Usados (escaneados por vigilancia)
- Expirados (pasó la fecha de validez)
- Activos (sin usar aún)

### INEs
- Total registrados en el mes
- Desglose por tipo de trabajador/visitante:
  - Uber
  - Jardinero
  - Plomero
  - Electricista
  - Pintor
  - Etc.
- Ordenado por cantidad (más frecuente primero)

### Trabajadores
- Total registrados en el mes
- Desglose por tipo:
  - Repartidor
  - Mantenimiento
  - Mudanza
  - Etc.
- Ordenado por cantidad (más frecuente primero)

---

## Filtros Aplicados

### Rango de Fechas
El reporte incluye todos los registros donde:
```javascript
createdAt >= inicio del mes && createdAt < inicio del mes siguiente
```

**Ejemplo para Diciembre 2025:**
```
Desde: 2025-12-01 00:00:00 (México)
Hasta: 2026-01-01 00:00:00 (México)
```

### Condominio (Opcional)
Si se especifica `condominio`:
```javascript
condominio === "Única"
```

Si NO se especifica: incluye todos los condominios.

---

## Manejo de Casos Especiales

### Sin Datos

Si no hay datos para el mes/año/condominio solicitado, el PDF muestra:
```
Total de QR generados: 0
Total de INEs registrados: 0
Total de trabajadores registrados: 0

No hay registros en este período.
```

### Sin Desglose

Si no hay tipos específicos (todos tienen `observaciones` vacío):
```
Desglose por tipo:
  • General: 15 registros
```

### Múltiples Condominios

Si NO se especifica condominio, el PDF dice:
```
Condominio: Todos
```

Y los datos son la suma de todos los condominios.

---

## Integración con Código JavaScript

### Opción 1: Descarga Directa (Navegador)

```javascript
const month = 12;
const year = 2025;
const condominio = 'Única';

const url = `https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=${month}&year=${year}&condominio=${encodeURIComponent(condominio)}`;

// Abrir en nueva pestaña (se descarga automáticamente)
window.open(url, '_blank');
```

---

### Opción 2: Descarga con Fetch

```javascript
async function downloadMonthlyReport(month, year, condominio) {
  try {
    const params = new URLSearchParams({ month, year });
    if (condominio) params.append('condominio', condominio);

    const response = await fetch(`https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?${params}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Resumen_${condominio || 'Todos'}_${getMonthName(month)}_${year}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    console.log('✅ PDF descargado exitosamente');
  } catch (error) {
    console.error('❌ Error descargando PDF:', error);
  }
}

function getMonthName(month) {
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return months[month - 1];
}

// Uso:
downloadMonthlyReport(12, 2025, 'Única');
```

---

### Opción 3: React Native (Expo)

```javascript
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

async function downloadMonthlyReport(month, year, condominio) {
  try {
    const params = new URLSearchParams({ month, year });
    if (condominio) params.append('condominio', condominio);

    const url = `https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?${params}`;
    const fileName = `Resumen_${condominio || 'Todos'}_${getMonthName(month)}_${year}.pdf`;
    const fileUri = FileSystem.documentDirectory + fileName;

    console.log('📥 Descargando reporte PDF...');
    const { uri } = await FileSystem.downloadAsync(url, fileUri);

    console.log('✅ PDF descargado:', uri);

    // Compartir el PDF
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
    } else {
      alert('Descarga completa: ' + fileName);
    }
  } catch (error) {
    console.error('❌ Error descargando PDF:', error);
    alert('Error descargando el reporte');
  }
}

// Uso:
downloadMonthlyReport(12, 2025, 'Única');
```

---

## Performance

### Tiempo de Generación

| Registros | Tiempo Aprox. |
|-----------|---------------|
| 0-100 | < 1 segundo |
| 100-500 | 1-2 segundos |
| 500-1000 | 2-3 segundos |
| 1000+ | 3-5 segundos |

### Tamaño del Archivo

| Secciones | Tamaño Aprox. |
|-----------|---------------|
| Sin datos | ~5 KB |
| Datos básicos | ~10-15 KB |
| Datos completos | ~20-30 KB |

**Nota:** El tamaño es muy pequeño porque solo contiene texto (no imágenes).

---

## Límites

### Parámetros
- `month`: 1-12 (fuera de rango = error)
- `year`: Cualquier año válido (2020-2030 recomendado)
- `condominio`: Cualquier string (se normaliza internamente)

### Datos
- No hay límite en la cantidad de registros
- El PDF crece verticalmente según los datos
- Máximo ~50 tipos diferentes por sección antes de que se vea comprimido

---

## Troubleshooting

### Problema: "Error generando el reporte PDF"

**Causa:** MongoDB desconectado o error en query

**Solución:** Verifica conexión a MongoDB y logs del servidor

---

### Problema: El PDF está en blanco

**Causa:** No hay datos para el período solicitado

**Solución:** Verifica que existan registros en MongoDB para esa fecha

---

### Problema: El navegador no descarga

**Causa:** URL incorrecta o falta parámetros

**Solución:** Verifica que la URL tenga `month` y `year`

---

### Problema: Caracteres extraños en el PDF

**Causa:** Nombre del condominio con caracteres especiales

**Solución:** El sistema normaliza automáticamente (Única → Unica)

---

## Ejemplos de URLs Completas

### Diciembre 2025 - Única
```
https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=12&year=2025&condominio=%C3%9Anica
```

### Noviembre 2025 - Todos
```
https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=11&year=2025
```

### Enero 2025 - Torres Sur
```
https://qr-manager-3z8x.onrender.com/api/monthly-report-pdf?month=1&year=2025&condominio=Torres%20Sur
```

---

## Resumen

✅ **Endpoint:** `/api/monthly-report-pdf`
✅ **Método:** GET
✅ **Parámetros:** `month`, `year`, `condominio` (opcional)
✅ **Respuesta:** Archivo PDF descargable
✅ **Formato:** Profesional, listo para imprimir/compartir
✅ **Uso:** Email, WhatsApp, impresión

---

**API Version:** 1.0.0
**Última actualización:** 2025-12-02
