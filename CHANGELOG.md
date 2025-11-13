# Changelog - Backend QR Manager

## [13 Nov 2025] - Correcciones Críticas

### Problemas Resueltos

#### 1. ✅ Error al Registrar INEs
**Problema**: Al intentar registrar un INE desde la app de Vigilancia, se generaba un "Error interno de servidor".

**Causa**: El endpoint `/api/register-ine` no existía en el backend.

**Solución**:
- Agregado endpoint `POST /api/register-ine` (línea 529)
- Agregado endpoint `GET /api/get-ines` para consultar INEs registrados (línea 602)
- Agregado índice en MongoDB para optimizar consultas de INEs

**Campos del endpoint**:
```json
{
  "houseNumber": "123",
  "condominio": "Nombre del condominio",
  "nombre": "Juan",
  "apellido": "Pérez",
  "numeroINE": "1234567890123",
  "curp": "JUAP900101HDFRNN01",
  "photoFrontal": "base64_string_opcional",
  "photoTrasera": "base64_string_opcional",
  "observaciones": "Texto opcional"
}
```

#### 2. ✅ Estadísticas de QR No Se Muestran
**Problema**: Los 3 cuadros de estadísticas del día (Generados, Avalados, Negados) no mostraban datos.

**Causa**: Problema de zona horaria en el endpoint `/api/counters`. El cálculo de "hoy" usaba hora local pero los timestamps estaban en UTC, causando que las consultas no coincidieran.

**Solución**:
- Corregida la lógica para usar UTC consistentemente (líneas 463-469)
- Agregada consulta adicional para detectar QRs validados usando `isUsed: true` además de `estado: 'usado'` (líneas 477-483)
- Agregados logs para debugging de contadores (líneas 471, 490)
- Agregado campo `details` en respuesta de error para mejor debugging

### Cambios Técnicos

#### Archivo: `server.js`

**Nuevos Endpoints**:
- `POST /api/register-ine` - Registrar INE de residente/visitante
- `GET /api/get-ines?houseNumber=X&condominio=Y` - Obtener INEs registrados

**Mejoras en Endpoints Existentes**:
- `POST /api/counters` - Corregido cálculo de fecha para UTC

**Base de Datos**:
- Nueva colección: `ines`
- Nuevo índice: `{ houseNumber: 1, condominio: 1 }` en colección `ines`

### Testing

Para probar los cambios:

```bash
# 1. Registrar un INE
curl -X POST http://localhost:3000/api/register-ine \
  -H "Content-Type: application/json" \
  -d '{
    "houseNumber": "123",
    "condominio": "Mi Condominio",
    "nombre": "Juan",
    "apellido": "Pérez"
  }'

# 2. Obtener INEs
curl "http://localhost:3000/api/get-ines?houseNumber=123&condominio=Mi%20Condominio"

# 3. Obtener estadísticas
curl -X POST http://localhost:3000/api/counters
```

### Notas de Despliegue

Después de hacer push, el servidor en Render se reiniciará automáticamente y aplicará los cambios.

**Monitoreo Post-Despliegue**:
1. Verificar que los logs no muestren errores al conectar a MongoDB
2. Verificar que se cree el índice para la colección `ines`
3. Probar registro de INE desde la app
4. Verificar que las estadísticas se muestren correctamente

### Compatibilidad

✅ Compatible con versiones anteriores
✅ No requiere cambios en las apps (iOS/Android)
✅ La app debe enviar solicitudes a `/api/register-ine` en lugar de otro endpoint
