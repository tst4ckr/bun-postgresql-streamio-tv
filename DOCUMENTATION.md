# 📺 TV IPTV Addon para Stremio - Documentación Técnica

## 📋 Índice

1. [Visión General](#visión-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Flujo de Datos](#flujo-de-datos)
4. [Componentes Principales](#componentes-principales)
5. [Sistema de Validación de Streams](#sistema-de-validación-de-streams)
6. [Servicios de Infraestructura](#servicios-de-infraestructura)
7. [Configuración](#configuración)
8. [Manejo de Errores](#manejo-de-errores)
9. [Seguridad](#seguridad)
10. [Despliegue](#despliegue)

## 🎯 Visión General

El **TV IPTV Addon** es una extensión para Stremio que proporciona acceso a canales de televisión en vivo desde fuentes IPTV. Implementa arquitectura limpia con validación robusta de streams.

### Características Principales
- ✅ Validación multi-etapa de streams HTTP/HTTPS
- ✅ Conversión automática HTTPS→HTTP
- ✅ Cache de validación con TTL configurable
- ✅ Procesamiento por lotes concurrente
- ✅ Sistema de filtros de contenido avanzado
- ✅ Manejo robusto de errores y reintentos

## 🏗️ Arquitectura del Sistema

### Diagrama de Arquitectura Completa

```
┌─────────────────────────────────────────────────────────────┐
│                    STREMIO CLIENT                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP/HTTPS
┌─────────────────────────┴───────────────────────────────────┐
│                    API LAYER                                │
│  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Catalog Handler │  │ Stream Handler  │                 │
│  └────────┬────────┘  └────────┬────────┘                 │
└───────────┼───────────────────┼───────────────────────────┘
            │                   │
┌───────────┴───────────────────┴───────────────────────────┐
│                 APPLICATION LAYER                          │
│  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ ChannelService  │  │ ValidationSvc   │                 │
│  └────────┬────────┘  └────────┬────────┘                 │
└───────────┼───────────────────┼───────────────────────────┘
            │                   │
┌───────────┴───────────────────┴───────────────────────────┐
│                  DOMAIN LAYER                              │
│  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Channel Entity  │  │ StreamQuality   │                 │
│  └─────────────────┘  └─────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                INFRASTRUCTURE LAYER                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────┐│
│  │ HybridRepo      │  │ StreamValidation  │  │ HealthSvc ││
│  │ CSVRepo         │  │ HTTPS→HTTP Conv   │  │ BitelUID  ││
│  │ RemoteM3URepo   │  │ Cache Manager     │  │ Parser    ││
│  └─────────────────┘  └─────────────────┘  └───────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Principios SOLID
- **S**: Cada servicio tiene responsabilidad única
- **O**: Extensible mediante nuevos repositorios/filtros
- **L**: Interfaces bien definidas para todos los componentes
- **I**: APIs específicas para cada caso de uso
- **D**: Inyección de dependencias en constructores

## 🔄 Flujo de Datos Detallado

### 1. Inicialización del Sistema
```
index.js
    ↓
TVAddonConfig (env vars)
    ↓
ChannelRepositoryFactory
    ↓
HybridChannelRepository
    ↓
ContentFilterService
    ↓
StreamValidationService
```

### 2. Flujo de Validación de Streams
```
Channel → StreamValidationService → HttpsToHttpConversionService → StreamHealthService
   ↓              ↓                        ↓                         ↓
Cache Check → Quick HEAD → HTTPS/HTTP Test → Final Validation → Result Cache
```

### 3. Procesamiento por Lotes
```
Batch Input → Concurrent Workers → Individual Validation → Statistics → Cache Update
```

## 🧩 Componentes Principales

### 1. Entidades del Dominio

#### Channel Entity (`/src/domain/entities/Channel.js`)
**Propósito**: Representar un canal de TV con identidad única
**Dependencias**: Ninguna (entidad pura)
**API expuesta**:
```javascript
const channel = new Channel({
  id: 'tv_televisa_hd',
  name: 'Televisa HD',
  streamUrl: 'https://example.com/stream.m3u8',
  country: 'MX',
  language: 'es',
  quality: 'HD'
});

channel.getId();           // "tv_televisa_hd"
channel.getStreamUrl();    // URL del stream
channel.toStremioFormat(); // Formato para Stremio
```
**Limitaciones**: Inmutable después de creación

#### StreamQuality VO (`/src/domain/value-objects/StreamQuality.js`)
**Propósito**: Encapsular lógica de calidad
**Valores**: Auto, SD, HD, FullHD, 4K
**Detección**: Automática desde URL patterns

### 2. Repositorios

#### HybridChannelRepository (`/src/infrastructure/repositories/HybridChannelRepository.js`)
**Propósito**: Combinar múltiples fuentes con priorización
**Dependencias**: ContentFilterService, otros repositorios
**Orden de prioridad**:
1. CSV local (prioridad absoluta)
2. M3U remoto (solo nuevos)
3. M3U local (solo nuevos)

**API principal**:
```javascript
const repo = new HybridChannelRepository(config, contentFilter);
const channels = await repo.getAllChannels();
const filtered = await repo.getChannelsByCountry('MX');
```

#### CSVChannelRepository (`/src/infrastructure/repositories/CSVChannelRepository.js`)
**Propósito**: Leer canales desde CSV local
**Formato esperado**:
```csv
name,url,country,language,genre
televisa,https://...,MX,es,Entertainment
```

#### RemoteM3UChannelRepository (`/src/infrastructure/repositories/RemoteM3UChannelRepository.js`)
**Propósito**: Descargar y parsear M3U remotos
**Features**: Cache, retry, backup URLs

### 3. Servicios de Validación

#### StreamValidationService (`/src/infrastructure/services/StreamValidationService.js`)
**Propósito**: Validación temprana y exhaustiva de streams
**Dependencias**: HttpsToHttpConversionService, StreamHealthService
**Características**:
- ✅ Cache TTL configurable (default: 5 min)
- ✅ Validación concurrente (default: 10 workers)
- ✅ Batch processing
- ✅ Métricas detalladas

**API principal**:
```javascript
const validator = new StreamValidationService(config);
await validator.enableValidation();

// Validar individual
const result = await validator.validateChannel(channel);

// Validar por lotes
const results = await validator.validateChannelsBatch(channels, {
  concurrency: 5,
  showProgress: true
});

// Estadísticas
const stats = validator.getStats();
// { total: 100, valid: 85, invalid: 15, cacheHits: 23 }
```

**Flujo interno**:
1. Check cache
2. Quick HEAD request
3. HTTPS→HTTP conversion (si falla)
4. Full validation
5. Cache result

#### HttpsToHttpConversionService (`/src/infrastructure/services/HttpsToHttpConversionService.js`)
**Propósito**: Convertir HTTPS→HTTP cuando HTTPS falla
**Dependencias**: StreamHealthService
**Lógica**:
- Prueba HTTPS primero
- Si falla, prueba HTTP equivalente
- Solo retorna HTTP si funciona
- Mantiene estadísticas de conversión

**API**:
```javascript
const converter = new HttpsToHttpConversionService();
const result = await converter.processChannel(channel);
// { originalWorks: true/false, httpWorks: true/false, finalUrl: '...' }
```

#### StreamHealthService (`/src/infrastructure/services/StreamHealthService.js`)
**Propósito**: Verificar salud de streams individualmente
**Métodos**:
- `checkStream(url)`: HEAD request con timeout
- `checkChannel(channel)`: Wrapper con retry
- `checkChannels(channels)`: Batch processing

**Configuración**:
```javascript
{
  timeout: 5000,        // 5s timeout
  retries: 3,           // 3 intentos
  backoff: 'exponential' // Backoff exponencial
}
```

### 4. Servicios de Soporte

#### BitelUidService (`/src/infrastructure/services/BitelUidService.js`)
**Propósito**: Procesar URLs con formato Bitel
**Función**: Extraer UID de URLs Bitel para validación

#### M3UParserService (`/src/infrastructure/parsers/M3UParserService.js`)
**Propósito**: Parsear archivos M3U/M3U8
**Features**:
- Extracción de metadatos (#EXTINF)
- Detección de logos
- Normalización de grupos
- Validación de URLs

## 🔄 Sistema de Validación de Streams

### Diagrama de Flujo de Validación

```
┌─────────────────────────────────────────────────────────────┐
│                   STREAM VALIDATION FLOW                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Input Channel                                              │
│       ↓                                                     │
│  [Cache Lookup] ──Si──→ [Return Cached]                   │
│       │No                                                  │
│       ↓                                                     │
│  [Quick HEAD Test] ──Fallo──→ [HTTPS→HTTP Conversion]      │
│       │Éxito                    ↓                           │
│       │                    [HTTP Test]                      │
│       │                        │                           │
│       │                        ↓                           │
│       └────────────────→ [Final Validation]               │
│                                │                           │
│                                ↓                           │
│                           [Cache Result]                    │
│                                │                           │
│                                ↓                           │
│                           [Return Status]                   │
└─────────────────────────────────────────────────────────────┘
```

### Estados de Validación

| Estado | Descripción | Acción |
|--------|-------------|---------|
| `VALID` | Stream funcional | Incluir en catálogo |
| `INVALID` | Stream roto | Excluir/marcar |
| `TIMEOUT` | Timeout excedido | Reintentar luego |
| `CONVERTED` | HTTPS→HTTP exitoso | Usar HTTP |

### Configuración de Validación

```bash
# Variables de entorno
VALIDATE_STREAMS_ON_STARTUP=true
VALIDATE_STREAMS_INTERVAL_HOURS=6
STREAM_VALIDATION_TIMEOUT=5000
STREAM_VALIDATION_CONCURRENCY=10
STREAM_CACHE_TTL_MINUTES=5
```

## 🛠️ Servicios de Infraestructura

### 1. ContentFilterService (`/src/domain/services/ContentFilterService.js`)
**Propósito**: Filtrar contenido por categorías
**Categorías**:
- Religioso: iglesia, pastor, dios, jesus
- Adulto: xxx, adult, porn, +18
- Político: política, gobierno, presidente

**Configuración**:
```bash
ENABLE_CONTENT_FILTERS=true
FILTER_RELIGIOUS_CONTENT=true
FILTER_ADULT_CONTENT=true
FILTER_POLITICAL_CONTENT=false
FILTER_SENSITIVITY=medium
FILTER_MATCH_MODE=partial
```

### 2. ChannelDeduplicationService (`/src/domain/services/ChannelDeduplicationService.js`)
**Propósito**: Eliminar duplicados manteniendo prioridad
**Algoritmo**: Hash por ID (nombre-canal), CSV siempre gana

### 3. ErrorHandler (`/src/infrastructure/error/ErrorHandler.js`)
**Propósito**: Manejo centralizado de errores
**Features**: Logging estructurado, respuestas seguras, graceful shutdown

## ⚙️ Configuración del Sistema

### Variables de Entorno Críticas

```bash
# Core
PORT=7000
NODE_ENV=production

# Fuentes de Datos
CHANNELS_SOURCE=hybrid
M3U_URL=https://iptv-org.github.io/iptv/countries/es.m3u
CSV_FILE_PATH=./data/channels.csv

# Validación
VALIDATE_STREAMS_ON_STARTUP=true
STREAM_VALIDATION_TIMEOUT=5000
STREAM_VALIDATION_CONCURRENCY=10

# Cache
STREAM_CACHE_TTL_MINUTES=5
CATALOG_CACHE_MAX_AGE=1800

# Filtros
ENABLE_CONTENT_FILTERS=true
FILTER_SENSITIVITY=medium
ALLOWED_COUNTRIES=MX,ES,AR,CO,US
```

### Requisitos del Sistema

- **Runtime**: Bun.js (versión 1.0+)
- **Memoria**: 512MB mínimo (recomendado 1GB)
- **Red**: Acceso HTTP/HTTPS a URLs IPTV
- **Almacenamiento**: 100MB para cache y logs

## 🔐 Seguridad y Protocolos

### Protocolos Implementados
- **HTTP/1.1**: Para validación de streams
- **HTTPS**: Para repositorios remotos
- **CORS**: Restringido a dominios Stremio
- **Rate Limiting**: 100 req/min por IP

### Headers de Seguridad
```javascript
{
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000'
}
```

## 🚀 Despliegue y Operación

### Docker Compose (Producción)
```yaml
version: '3.8'
services:
  tv-addon:
    build: .
    ports:
      - "7000:7000"
    environment:
      - NODE_ENV=production
      - CHANNELS_SOURCE=hybrid
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
```

### Monitoreo

**Endpoints de salud**:
- `GET /health` - Estado del servicio
- `GET /metrics` - Métricas de validación
- `GET /manifest.json` - Configuración Stremio

**Logs estructurados**:
```json
{
  "timestamp": "2024-01-01T00:00:00Z",
  "level": "info",
  "service": "StreamValidationService",
  "message": "Validation completed",
  "metadata": { "valid": 85, "invalid": 15, "cacheHits": 23 }
}
```

## 📊 Ejemplos de Uso

### Validar Streams Manualmente
```bash
# Validar todos los streams
node scripts/validate-channels.js

# Validar con configuración personalizada
VALIDATE_STREAMS_CONCURRENCY=20 node scripts/test-validation-flow.js

# Ver estadísticas de validación
curl http://localhost:7000/metrics
```

### Integración con CI/CD
```yaml
# GitHub Actions
- name: Validate Streams
  run: |
    npm run validate-streams
    npm run test-validation-flow
```

---

*Documentación de arquitectura v2.0 - Incluye sistema completo de validación de streams*