# 📁 Nueva Estructura de Carpetas en Google Drive

## ✅ Cambios Implementados

### Antes (Estructura Antigua)
```
QR_Manager/
  └── Unica/
      └── Casa_1/
          └── Uber/
              ├── Juan_Frontal_1234567890.jpg
              └── Juan_Trasera_1234567890.jpg
```

**Problemas:**
- ❌ No se puede ver cuándo se registró el empleado
- ❌ Difícil generar resúmenes por fecha
- ❌ Nombre del archivo no incluye tipo de empleado

---

### Ahora (Nueva Estructura) ✅
```
QR_Manager/
  └── Unica/
      └── Casa_1/
          └── 2025/
              └── 12/
                  └── 09/
                      ├── Juan_Perez_Uber_Frontal_1234567890.jpg
                      └── Juan_Perez_Uber_Trasera_1234567890.jpg
```

**Ventajas:**
- ✅ Organizado por año, mes y día
- ✅ Fácil encontrar registros de una fecha específica
- ✅ Nombre del archivo incluye: Nombre completo + Tipo + Lado + Timestamp
- ✅ Perfecto para auditorías y resúmenes mensuales
- ✅ Compatible con reportes PDF automáticos

---

## 📂 Estructura Detallada

### Jerarquía de 5 Niveles

```
Nivel 1: Condominio
  └── Nivel 2: Casa
      └── Nivel 3: Año (YYYY)
          └── Nivel 4: Mes (MM)
              └── Nivel 5: Día (DD)
                  └── Archivos
```

### Ejemplo Real

**Registro:**
- Fecha: 9 de diciembre de 2025
- Condominio: Única
- Casa: 1
- Empleado: Juan Pérez
- Tipo: Uber

**Ubicación en Drive:**
```
Unica/Casa_1/2025/12/09/
```

**Archivos generados:**
```
Juan_Perez_Uber_Frontal_1734567890123.jpg
Juan_Perez_Uber_Trasera_1734567890123.jpg
```

---

## 📝 Formato de Nombre de Archivo

### Patrón
```
{Nombre}_{Apellido}_{TipoEmpleado}_{Lado}_{Timestamp}.jpg
```

### Componentes

| Componente | Descripción | Ejemplo |
|------------|-------------|---------|
| **Nombre** | Nombre del empleado (normalizado) | `Juan` |
| **Apellido** | Apellido del empleado (normalizado) | `Perez` |
| **TipoEmpleado** | Tipo de trabajador sin acentos | `Uber`, `Jardinero`, `Plomero` |
| **Lado** | Frontal o Trasera | `Frontal`, `Trasera` |
| **Timestamp** | Marca de tiempo única | `1734567890123` |

### Ejemplos de Nombres

```
Juan_Perez_Uber_Frontal_1734567890123.jpg
Maria_Lopez_Jardinero_Frontal_1734567891234.jpg
Pedro_Garcia_Plomero_Trasera_1734567892345.jpg
Carlos__Electricista_Frontal_1734567893456.jpg  (sin apellido)
Ana_Martinez_General_Frontal_1734567894567.jpg  (tipo por defecto)
```

---

## 📅 Navegación por Fecha

### Ver Registros de Hoy (9 dic 2025)

1. Ir a Google Drive
2. Navegar: `QR_Manager/Unica/Casa_1/2025/12/09/`
3. Ver todas las fotos del día

### Ver Registros del Mes (Diciembre 2025)

1. Navegar: `QR_Manager/Unica/Casa_1/2025/12/`
2. Ver subcarpetas por día: `01/`, `02/`, `03/`, ..., `31/`
3. Entrar a cada día para ver las fotos

### Ver Registros del Año (2025)

1. Navegar: `QR_Manager/Unica/Casa_1/2025/`
2. Ver subcarpetas por mes: `01/`, `02/`, ..., `12/`
3. Entrar a cada mes y luego a cada día

---

## 🎯 Casos de Uso

### Caso 1: Verificar Quién Entró Hoy

**Pregunta:** "¿Quién entró hoy a la Casa 1 de Única?"

**Pasos:**
1. Ir a: `Unica/Casa_1/2025/12/09/`
2. Ver archivos del día
3. Los nombres de archivo muestran:
   - `Juan_Perez_Uber_...` → Juan Pérez, Uber
   - `Maria_Lopez_Jardinero_...` → María López, Jardinero

---

### Caso 2: Resumen Mensual Visual

**Pregunta:** "¿Cuántos empleados se registraron en diciembre?"

**Pasos:**
1. Ir a: `Unica/Casa_1/2025/12/`
2. Ver cuántas carpetas de días hay (ej: 15 días)
3. Entrar a cada día y contar fotos
4. O usar el endpoint `/api/monthly-report-pdf` automáticamente

---

### Caso 3: Auditoría de Tipo de Empleado

**Pregunta:** "¿Cuántos Uber entraron en diciembre?"

**Pasos:**
1. Ir a: `Unica/Casa_1/2025/12/`
2. Navegar por cada día
3. Buscar archivos que contengan `_Uber_`
4. O usar el reporte PDF que agrupa por tipo automáticamente

---

## 🔄 Compatibilidad con Reportes

### Reporte JSON
```
GET /api/monthly-report?month=12&year=2025&condominio=Única
```

**Resultado:**
```json
{
  "ines": {
    "total": 45,
    "porTipo": {
      "Uber": 20,
      "Jardinero": 15,
      "Plomero": 10
    }
  }
}
```

**Fuente de datos:** MongoDB (no afectado por cambio en Drive)

---

### Reporte PDF
```
GET /api/monthly-report-pdf?month=12&year=2025&condominio=Única
```

**Resultado:** PDF con secciones:
- ✅ QR Codes generados
- ✅ INEs registrados (desglose por tipo)
- ✅ Trabajadores (desglose por tipo)

**Fuente de datos:** MongoDB (compatible)

---

## 📊 Ejemplo de Mes Completo

### Diciembre 2025 en Casa 1 de Única

```
Unica/Casa_1/2025/12/
  ├── 01/
  │   ├── Pedro_Garcia_Plomero_Frontal_xxx.jpg
  │   └── Pedro_Garcia_Plomero_Trasera_xxx.jpg
  ├── 03/
  │   ├── Juan_Perez_Uber_Frontal_xxx.jpg
  │   ├── Juan_Perez_Uber_Trasera_xxx.jpg
  │   ├── Maria_Lopez_Jardinero_Frontal_xxx.jpg
  │   └── Maria_Lopez_Jardinero_Trasera_xxx.jpg
  ├── 05/
  │   ├── Carlos_Martinez_Electricista_Frontal_xxx.jpg
  │   └── Carlos_Martinez_Electricista_Trasera_xxx.jpg
  ├── 09/
  │   ├── Ana_Rodriguez_Uber_Frontal_xxx.jpg
  │   └── Ana_Rodriguez_Uber_Trasera_xxx.jpg
  └── ...
```

**Total en diciembre:**
- 4 días con registros
- 4 empleados diferentes
- 2 Uber, 1 Jardinero, 1 Plomero, 1 Electricista

---

## 🚀 Cómo Funciona Técnicamente

### Al Registrar un INE

1. **Usuario registra en VigilanciaApp:**
   - Casa: 1
   - Condominio: Única
   - Nombre: Juan
   - Apellido: Pérez
   - Tipo: Uber (campo "Observaciones")
   - Fotos: Frontal y Trasera

2. **Backend procesa:**
   ```javascript
   // Normalizar nombre del condominio
   condominio = "Unica" (sin acento)

   // Obtener fecha actual (México timezone)
   fecha = 2025-12-09

   // Crear estructura de carpetas
   carpetaCondominio = "Unica"
   carpetaCasa = "Casa_1"
   carpetaYear = "2025"
   carpetaMes = "12"
   carpetaDia = "09"

   // Generar nombre de archivo
   nombreArchivo = "Juan_Perez_Uber_Frontal_1734567890123.jpg"
   ```

3. **Drive guarda:**
   ```
   Unica/Casa_1/2025/12/09/Juan_Perez_Uber_Frontal_1734567890123.jpg
   ```

4. **MongoDB guarda:**
   ```json
   {
     "nombre": "Juan",
     "apellido": "Pérez",
     "condominio": "Única",
     "houseNumber": "1",
     "observaciones": "Uber",
     "createdAt": "2025-12-09T14:30:00.000Z",
     "photoFrontalUrl": "https://drive.google.com/..."
   }
   ```

5. **Sheets guarda:**
   En pestaña `Unica_INE`:
   | Fecha | Casa | Nombre | Tipo | Link Frontal | Link Trasera |
   |-------|------|--------|------|--------------|--------------|
   | 2025-12-09 | 1 | Juan Pérez | Uber | [Ver](https://...) | [Ver](https://...) |

---

## ✅ Ventajas de la Nueva Estructura

### Para Administradores
- ✅ Fácil navegar por fecha
- ✅ Auditorías rápidas ("¿quién entró el día 5?")
- ✅ Nombres de archivo autodescriptivos
- ✅ Organización profesional

### Para Reportes
- ✅ Resúmenes mensuales automáticos
- ✅ PDFs generados al instante
- ✅ Estadísticas por tipo de empleado
- ✅ Compatible con sistemas existentes

### Para Vigilancia
- ✅ Verificar entradas del día actual
- ✅ Buscar por nombre en archivos
- ✅ Identificar tipo de empleado visualmente
- ✅ Histórico completo por casa

---

## 🔧 Cambios Técnicos

### Función Modificada: `getOrCreateINEFolderStructure()`

**Antes (3 niveles):**
```javascript
Condominio → Casa → Tipo
```

**Ahora (5 niveles):**
```javascript
Condominio → Casa → Año → Mes → Día
```

### Nombre de Archivo Modificado

**Antes:**
```javascript
const fileName = `${nombre}_Frontal_${timestamp}.jpg`;
// Resultado: Juan_Frontal_1234567890.jpg
```

**Ahora:**
```javascript
const nombreCompleto = `${nombre}_${apellido}`.replace(/\s+/g, '_');
const tipoNormalizado = normalizeCondominioName(tipoTrabajador);
const fileName = `${nombreCompleto}_${tipoNormalizado}_Frontal_${timestamp}.jpg`;
// Resultado: Juan_Perez_Uber_Frontal_1234567890.jpg
```

---

## 📋 Checklist de Verificación

Después de desplegar, verifica:

- [ ] Nuevo registro crea carpeta de año (ej: `2025`)
- [ ] Dentro de año, crea carpeta de mes (ej: `12`)
- [ ] Dentro de mes, crea carpeta de día (ej: `09`)
- [ ] Nombre de archivo incluye nombre completo
- [ ] Nombre de archivo incluye tipo de empleado
- [ ] Reportes mensuales siguen funcionando
- [ ] PDF se genera correctamente

---

## 🎉 Resumen

**Nueva estructura:**
```
Condominio/Casa/YYYY/MM/DD/Nombre_Apellido_Tipo_Lado_Timestamp.jpg
```

**Ejemplo real:**
```
Unica/Casa_1/2025/12/09/Juan_Perez_Uber_Frontal_1734567890123.jpg
```

**Beneficios:**
- 📅 Organizado por fecha
- 🏷️ Nombres autodescriptivos
- 📊 Compatible con reportes
- 🔍 Fácil de auditar

---

**Última actualización:** 2025-12-09
**Versión:** 2.0.0
**Estado:** ✅ IMPLEMENTADO
