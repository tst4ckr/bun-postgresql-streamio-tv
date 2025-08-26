# 📺 TV IPTV Addon para Stremio - Documentación Técnica

## 📋 Índice

1. [Visión General](#visión-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Flujo de Datos](#flujo-de-datos)
4. [Componentes Principales](#componentes-principales)
5. [Configuración](#configuración)
6. [Manejo de Errores](#manejo-de-errores)
7. [Seguridad](#seguridad)
8. [Despliegue](#despliegue)

## 🎯 Visión General

El **TV IPTV Addon** es una extensión para Stremio que proporciona acceso a canales de televisión en vivo desde fuentes IPTV (archivos M3U/M3U8 y CSV). Está diseñado siguiendo principios de Clean Architecture y Domain-Driven Design (DDD) para mantener una base de código escalable y mantenible.

### Características Principales
- ✅ Soporte para múltiples fuentes de datos (CSV, M3U local/remoto)
- ✅ Validación automática de streams
- ✅ Filtrado por país, idioma y género
- ✅ Sistema avanzado de filtros de contenido (religioso, adulto, político)
- ✅ Cache optimizado para rendimiento
- ✅ Manejo robusto de errores
- ✅ Configuración centralizada via variables de entorno

## 🏗️ Arquitectura del Sistema

### Patrones de Diseño Implementados

```
┌─────────────────────────────────────────────┐
│              Capa de Presentación            │
│            (Handlers de Stremio)            │
├─────────────────────────────────────────────┤
│              Capa de Aplicación            │
│         (Servicios y Casos de Uso)         │
├─────────────────────────────────────────────┤
│              Capa de Dominio                 │
│        (Entidades y Value Objects)         │
├─────────────────────────────────────────────┤
│            Capa de Infraestructura          │
│   (Repositorios, Parsers, Configuración)    │
└─────────────────────────────────────────────┘
```

### Principios SOLID Aplicados
- **S**ingle Responsibility: Cada clase tiene una única responsabilidad
- **O**pen/Closed: Extensible sin modificar código existente
- **L**iskov Substitution: Interfaces bien definidas
- **I**nterface Segregation: Interfaces específicas y cohesivas
- **D**ependency Inversion: Dependencias en abstracciones, no concreciones

## 🔄 Flujo de Datos

### 1. Inicialización del Addon
```
index.js → TVAddonConfig → ChannelRepositoryFactory → Repositorio Activo
```

### 2. Petición de Catálogo
```
Stremio Client → Catalog Handler → ChannelService → Repositorio → Canales → Meta Preview
```

### 3. Petición de Stream
```
Stremio Client → Stream Handler → ChannelService → Stream Validation → Respuesta Stream
```

## 🧩 Componentes Principales

### 1. Entidades del Dominio (`/src/domain/`)

#### Channel Entity (`Channel.js`)
Representa un canal de televisión con:
- Identidad única (`tv_nombre-canal`)
- Propiedades inmutables (nombre, URL, país, idioma)
- Value Objects para calidad y tipo
- Métodos de conversión para Stremio

```javascript
const canal = new Channel({
  id: 'tv_televisa',
  name: 'Televisa',
  streamUrl: 'https://example.com/stream.m3u8',
  genre: 'Entertainment',
  country: 'México',
  language: 'es'
});
```

#### StreamQuality Value Object (`StreamQuality.js`)
- Encapsula la lógica de calidad de stream
- Valores válidos: Auto, SD, HD, Full HD, 4K
- Detección automática desde URLs
- Comparación y normalización

### 2. Repositorios (`/src/infrastructure/repositories/`)

#### ChannelRepository (Interfaz Abstracta)
Define el contrato para todas las implementaciones:
- `getAllChannels()` - Obtener todos los canales
- `getChannelById(id)` - Buscar por ID
- `searchChannels(term)` - Búsqueda por nombre
- `getChannelsByGenre/country/language()` - Filtrado

#### CSVChannelRepository
- Lee canales desde archivos CSV locales
- Cache con refresco automático
- Validación de filas CSV
- Filtros de configuración aplicados

#### HybridChannelRepository

Repositorio que combina múltiples fuentes de canales con **priorización estricta**:

##### Priorización de Fuentes
- **CSV local**: Prioridad ABSOLUTA, nunca se sobrescribe
- **URLs M3U remotas/locales**: Solo agregan canales NO presentes en CSV
- **Deduplicación**: Automática por ID de canal, CSV siempre gana
- **Orden de carga**: CSV → M3U remotas → M3U locales

##### Características Técnicas
- Gestión unificada de múltiples repositorios
- Estadísticas detalladas de duplicados omitidos
- Logging específico para priorización CSV
- Mantenimiento de prioridad durante refrescos
- Integración completa con filtros de contenido

#### RemoteM3UChannelRepository
- Descarga y parsea listas M3U remotas
- Manejo de errores y failover
- Actualización periódica
- Soporte para URLs de respaldo

### 3. Parsers (`/src/infrastructure/parsers/`)

#### M3UParserService
- Parsea archivos M3U/M3U8 con validación robusta
- Extrae metadatos (logo, grupo, país)
- Detección automática de calidad
- Normalización de géneros y países

### 4. Handlers de Stremio (`/src/application/handlers/`)

#### StreamHandler
Convierte canales al formato requerido por Stremio:
- Genera nombres descriptivos con calidad
- Añade behavior hints para streams especiales
- Maneja configuración de usuario

### 5. Servicios de Soporte

#### StreamHealthService
- Verifica disponibilidad de streams
- Validación no intrusiva (HEAD requests)
- Reportes de salud por lotes
- Timeout configurable

#### ContentFilterService
- Sistema avanzado de filtrado de contenido
- Detección por palabras clave y patrones
- Filtros configurables (religioso, adulto, político)
- Múltiples modos de coincidencia (exacto, parcial, difuso)
- Estadísticas detalladas de filtrado
- Configuración de sensibilidad ajustable

#### SecurityMiddleware
- Configura CORS para dominios de Stremio
- Rate limiting para protección DDoS
- Headers de seguridad con Helmet

#### ErrorHandler
- Manejo centralizado de errores
- Logging estructurado
- Respuestas seguras para Stremio
- Graceful shutdown

## ⚙️ Configuración

### Variables de Entorno Principales

```bash
# Fuente de datos
CHANNELS_SOURCE=remote_m3u          # csv, m3u, remote_m3u, hybrid
M3U_URL=https://iptv-org.github.io/iptv/countries/es.m3u
BACKUP_M3U_URL=https://iptv-org.github.io/iptv/countries/mx.m3u

# Filtros básicos
ALLOWED_COUNTRIES=MX,ES,AR,CO,US
BLOCKED_COUNTRIES=
ENABLE_ADULT_CHANNELS=false

# Filtros de contenido avanzados
ENABLE_CONTENT_FILTERS=true
FILTER_RELIGIOUS_CONTENT=true
FILTER_ADULT_CONTENT=true
FILTER_POLITICAL_CONTENT=false
FILTER_SENSITIVITY=medium           # low, medium, high
FILTER_MATCH_MODE=partial           # exact, partial, fuzzy

# Cache (segundos)
STREAM_CACHE_MAX_AGE=300
CATALOG_CACHE_MAX_AGE=1800

# Validación
VALIDATE_STREAMS_ON_STARTUP=true
VALIDATE_STREAMS_INTERVAL_HOURS=6
```

### Configuración por Usuario
El addon soporta configuración personalizada:
- URL M3U personalizada
- Calidad preferida (HD/SD/Auto)
- Idioma preferido
- Filtros de contenido personalizados

## 🛡️ Sistema de Filtros de Contenido

### Arquitectura del Sistema de Filtros

El `ContentFilterService` implementa un sistema robusto de filtrado que opera a nivel de repositorio, aplicándose automáticamente a todos los métodos de recuperación de canales.

#### Componentes Principales

```javascript
// Estructura del ContentFilterService
class ContentFilterService {
  constructor(filterConfig)     // Inicialización con configuración
  isActive()                   // Verifica si hay filtros activos
  filterChannels(channels)     // Aplica filtros a lista de canales
  getActiveFilters()          // Obtiene lista de filtros activos
  getFilterConfiguration()    // Obtiene configuración actual
}
```

#### Tipos de Filtros Implementados

1. **Filtro Religioso** (`FILTER_RELIGIOUS_CONTENT`)
   - Detecta contenido religioso, evangélico, católico
   - Palabras clave: iglesia, pastor, dios, jesus, cristo, biblia, gospel
   - Aplicable a canales de predicación, misas, programas espirituales

2. **Filtro de Contenido Adulto** (`FILTER_ADULT_CONTENT`)
   - Bloquea contenido explícito o para adultos
   - Palabras clave: xxx, adult, porn, sexy, hot, +18, adulto, erótico
   - Protección para entornos familiares

3. **Filtro Político** (`FILTER_POLITICAL_CONTENT`)
   - Oculta contenido político y gubernamental
   - Palabras clave: política, gobierno, presidente, elecciones, congreso
   - Útil para evitar contenido polarizante

#### Configuración de Sensibilidad

```bash
# Niveles de sensibilidad
FILTER_SENSITIVITY=low      # Solo coincidencias exactas obvias
FILTER_SENSITIVITY=medium   # Balance entre precisión y cobertura
FILTER_SENSITIVITY=high     # Máxima detección, puede tener falsos positivos
```

#### Modos de Coincidencia

```bash
# Modos de detección
FILTER_MATCH_MODE=exact     # Solo palabras completas exactas
FILTER_MATCH_MODE=partial   # Coincidencias parciales en texto
FILTER_MATCH_MODE=fuzzy     # Detección difusa con tolerancia a errores
```

#### Integración en Repositorios

Todos los repositorios (`HybridChannelRepository`, `CSVChannelRepository`, `RemoteM3UChannelRepository`, `LocalM3UChannelRepository`) integran automáticamente el filtrado:

```javascript
// Ejemplo de integración en método getAllChannels
async getAllChannels() {
  let channels = await this.getBaseChannels();
  
  // Aplicar filtros de contenido si están activos
  if (this.#contentFilter.isActive()) {
    const filterResult = this.#contentFilter.filterChannels(channels);
    channels = filterResult.filteredChannels;
    
    // Logging de estadísticas
    this.#logger.info(`Filtros aplicados: ${filterResult.removedChannels.length} canales removidos`);
  }
  
  return channels;
}
```

#### Estadísticas de Filtrado

El sistema proporciona estadísticas detalladas:

```javascript
// Ejemplo de estadísticas retornadas
{
  enabled: true,
  removedChannels: 15,
  removalPercentage: "12.50",
  removedByCategory: {
    religious: 8,
    adult: 5,
    political: 2
  },
  activeFilters: ["religious", "adult"],
  totalChannelsProcessed: 120
}
```

### Ejemplos de Configuración de Filtros

#### Configuración Familiar Estricta
```bash
# Máxima protección para entornos familiares
ENABLE_CONTENT_FILTERS=true
FILTER_RELIGIOUS_CONTENT=true
FILTER_ADULT_CONTENT=true
FILTER_POLITICAL_CONTENT=true
FILTER_SENSITIVITY=high
FILTER_MATCH_MODE=fuzzy

# Palabras clave personalizadas adicionales
CUSTOM_RELIGIOUS_KEYWORDS=evangelio,misa,oración,santo,bendición
CUSTOM_ADULT_KEYWORDS=sensual,provocativo,nocturno,+21
CUSTOM_POLITICAL_KEYWORDS=campaña,partido,senado,diputado
```

#### Configuración Moderada
```bash
# Solo filtrado de contenido adulto
ENABLE_CONTENT_FILTERS=true
FILTER_RELIGIOUS_CONTENT=false
FILTER_ADULT_CONTENT=true
FILTER_POLITICAL_CONTENT=false
FILTER_SENSITIVITY=medium
FILTER_MATCH_MODE=partial
```

#### Configuración Permisiva
```bash
# Filtrado mínimo, solo contenido explícito obvio
ENABLE_CONTENT_FILTERS=true
FILTER_RELIGIOUS_CONTENT=false
FILTER_ADULT_CONTENT=true
FILTER_POLITICAL_CONTENT=false
FILTER_SENSITIVITY=low
FILTER_MATCH_MODE=exact
```

#### Sin Filtros
```bash
# Contenido completo sin restricciones
ENABLE_CONTENT_FILTERS=false
```

### Verificación de Filtros

Para verificar que los filtros funcionan correctamente:

```bash
# Ejecutar prueba básica de filtros
node scripts/test-csv-priority.js

# Ejecutar prueba completa con estadísticas
node scripts/test-csv-priority-with-m3u.js
```

### Personalización Avanzada

#### Palabras Clave por Categoría

```bash
# Religioso - Detecta contenido religioso/espiritual
CUSTOM_RELIGIOUS_KEYWORDS=iglesia,pastor,dios,jesus,cristo,biblia,gospel,evangelio,misa,oración,santo,bendición,católico,protestante,cristiano

# Adulto - Detecta contenido para adultos
CUSTOM_ADULT_KEYWORDS=xxx,adult,porn,sexy,hot,+18,adulto,erótico,sensual,provocativo,nocturno,+21,desnudo,íntimo

# Político - Detecta contenido político/gubernamental
CUSTOM_POLITICAL_KEYWORDS=política,gobierno,presidente,elecciones,congreso,senado,diputado,campaña,partido,ministerio,alcalde,gobernador
```

#### Configuración de Logging

```bash
# Habilitar logging detallado de filtros
FILTER_DETAILED_LOGGING=true
FILTER_LOG_REMOVED_CHANNELS=true
FILTER_LOG_STATISTICS=true
```

Esto generará logs como:
```
[INFO] Filtros de contenido aplicados: 12 canales removidos (8.33%)
[INFO] Por categoría: religioso=5, adulto=4, político=3
[INFO] Canales removidos: Canal Religioso TV, Contenido Adulto Plus, Noticias Políticas
```
  activeFilters: ["religious", "adult"],
  filterConfiguration: {
    sensitivity: "medium",
    matchMode: "partial"
  }
}
```

#### Personalización de Palabras Clave

```bash
# Personalizar listas de palabras clave
RELIGIOUS_KEYWORDS=iglesia,pastor,dios,jesus,cristo,biblia,gospel,cristiano
ADULT_KEYWORDS=xxx,adult,porn,sexy,hot,+18,adulto,erotico,sexual
POLITICAL_KEYWORDS=politica,gobierno,presidente,elecciones,congreso,senado
```

#### Consideraciones de Rendimiento

- **Filtrado Eficiente**: O(n) donde n es el número de canales
- **Cache de Patrones**: Las expresiones regulares se compilan una vez
- **Filtrado Lazy**: Solo se aplica cuando hay filtros activos
- **Impacto Mínimo**: < 5ms adicionales en listas de 1000+ canales

## 🔐 Seguridad

### Medidas Implementadas
- **CORS**: Solo permite dominios de Stremio y localhost
- **Rate Limiting**: 100 requests/minuto por IP
- **Helmet**: Headers de seguridad HTTP
- **Input Validation**: Validación de todas las entradas
- **Error Masking**: No expone detalles internos

### Ejemplo de Configuración CORS
```javascript
const allowedOrigins = [
  'https://app.strem.io',
  'https://web.strem.io',
  'http://localhost:3000'
];
```

## 🚨 Manejo de Errores

### Jerarquía de Errores
```
AddonError (base)
├── ConfigurationError
├── StreamError
├── ValidationError
└── RepositoryError
    ├── ChannelNotFoundError
    └── RepositoryValidationError
```

### Respuestas de Error para Stremio
- Catálogo vacío en lugar de errores 500
- Cache corto para errores (60s)
- Logging detallado en servidor

## 🚀 Despliegue

### Desarrollo Local
```bash
# Instalar dependencias
bun install

# Configurar variables de entorno
cp config.env.example .env
# Editar .env con tu configuración

# Ejecutar en desarrollo
bun run dev
```

### Producción
```bash
# Build optimizado
bun run build

# Ejecutar con PM2
pm2 start src/index.js --name tv-iptv-addon
```

### Docker
```bash
# Construir imagen
docker build -t tv-iptv-addon .

# Ejecutar
docker run -p 7000:7000 --env-file .env tv-iptv-addon
```

## 📊 Monitoreo y Debugging

### Logs
- Niveles: debug, info, warn, error
- Estructura: timestamp, nivel, mensaje, metadata
- Archivo: `logs/addon.log`

### Métricas
- Contador de canales por fuente
- Tasa de éxito de validación
- Tiempo de respuesta de handlers
- Errores por tipo

### Endpoints de Debug
- `GET /manifest.json` - Información del addon
- Logs incluyen URLs de instalación

## 🔧 Solución de Problemas

### Problemas Comunes

1. **No aparecen canales**
   - Verificar `CHANNELS_SOURCE` y URLs
   - Revisar logs de inicialización
   - Validar formato de archivo CSV/M3U

2. **Streams no funcionan**
   - Ejecutar validación manual
   - Verificar URLs en navegador
   - Revisar configuración de CORS

3. **Error de CORS**
   - Verificar `CORS_ORIGIN` en configuración
   - Asegurar HTTPS en producción

4. **Error: directory to serve does not exist**
   - El directorio `static/` debe existir para servir archivos estáticos
   - Solución: Crear directorio `static/` con archivo `.gitkeep`
   - El sistema ahora detecta automáticamente si el directorio existe

5. **Alto uso de memoria**
   - Ajustar `CACHE_CHANNELS_HOURS`
   - Limitar `MAX_CONCURRENT_STREAMS`
   - Revisar fuga de memoria en validaciones

### Comandos de Debug
```bash
# Validar configuración
bun run validate-config

# Verificar streams manualmente
bun run validate-channels

# Logs detallados
LOG_LEVEL=debug bun run dev
```

## 🔄 Flujo de Actualización de Datos

1. **Auto-actualización**: Repositorios remotos se actualizan cada `UPDATE_INTERVAL_HOURS`
2. **Validación periódica**: Streams se validan cada `VALIDATE_STREAMS_INTERVAL_HOURS`
3. **Cache refresh**: Datos se recargan según `CACHE_CHANNELS_HOURS`
4. **Failover automático**: Si falla M3U principal, usa backup

## 📋 Checklist de Despliegue

- [ ] Variables de entorno configuradas
- [ ] URLs de M3U válidas y accesibles
- [ ] Puerto disponible (por defecto 7000)
- [ ] HTTPS configurado en producción
- [ ] Logs configurados
- [ ] Monitoreo activado
- [ ] Rate limiting apropiado
- [ ] CORS configurado correctamente

## 📞 Soporte

Para reportar problemas o solicitar features:
1. Verificar logs en `logs/addon.log`
2. Revisar configuración en `.env`
3. Ejecutar validación manual
4. Consultar documentación de troubleshooting

---

*Documentación generada automáticamente basada en el código fuente del TV IPTV Addon*