# Ejemplos de Uso - Sistema de Filtros de Contenido

Este directorio contiene ejemplos prácticos de cómo usar el sistema de filtros de contenido implementado en la aplicación.

## 📁 Archivos Disponibles

### `content-filtering-example.js`
Ejemplo completo que demuestra:
- Configuración de filtros de contenido
- Aplicación de filtros a una lista de canales
- Análisis de resultados y estadísticas
- Configuraciones personalizadas

### `debug-religious-filtering.js`
Script de depuración específico para:
- Probar filtros religiosos con datos reales de M3U
- Validar palabras clave religiosas
- Verificar excepciones de filtrado

## 🚀 Cómo Ejecutar los Ejemplos

### Prerrequisitos
```bash
# Instalar dependencias
bun install

# Configurar variables de entorno
cp .env.example .env
```

### Ejecutar Ejemplo Principal
```bash
# Ejecutar demostración completa
bun run examples/content-filtering-example.js

# O usando Node.js
node examples/content-filtering-example.js
```

### Ejecutar Debug de Filtros Religiosos
```bash
# Probar con datos reales de M3U
bun run debug-religious-filtering.js
```

## ⚙️ Configuración de Filtros

### Variables de Entorno
```env
# Habilitar/deshabilitar filtros
FILTER_RELIGIOUS_CONTENT=true
FILTER_ADULT_CONTENT=true
FILTER_POLITICAL_CONTENT=false

# Palabras clave personalizadas (separadas por comas)
RELIGIOUS_KEYWORDS=jesus,cristo,dios,iglesia,church,christian
ADULT_KEYWORDS=xxx,porn,adult,+18
POLITICAL_KEYWORDS=politica,political,gobierno,president

# Configuración avanzada
FILTER_SENSITIVITY=medium
FILTER_MATCH_MODE=partial
```

### Configuración Programática
```javascript
import { ContentFilterService } from '../src/domain/services/ContentFilterService.js';

const filterConfig = {
  filterReligiousContent: true,
  filterAdultContent: true,
  filterPoliticalContent: false,
  religiousKeywords: ['jesus', 'cristo', 'dios', 'iglesia'],
  adultKeywords: ['xxx', 'porn', 'adult', '+18'],
  politicalKeywords: ['politica', 'political']
};

const filterService = new ContentFilterService(filterConfig);
const filteredChannels = filterService.filterChannels(channels);
```

## 📊 Tipos de Filtros Disponibles

### 1. Filtro Religioso
**Propósito**: Filtrar contenido religioso y espiritual

**Palabras clave por defecto**:
- Español: jesus, cristo, dios, iglesia, cristian, catolica, evangelica, santo, santa, san
- Inglés: church, christian, catholic, evangelical, bible, faith, priest, pastor, gospel

**Excepciones**: Algunos canales educativos o culturales pueden estar exentos

### 2. Filtro de Contenido Adulto
**Propósito**: Filtrar contenido para adultos y explícito

**Palabras clave por defecto**:
- xxx, porn, adult, sexy, hot, erotic, nude, +18, adulto, erotico, sexual

**Aplicación**: Estricta, sin excepciones

### 3. Filtro Político
**Propósito**: Filtrar contenido político y gubernamental

**Palabras clave por defecto**:
- politica, political, gobierno, president, congreso, senado, elecciones

**Nota**: Deshabilitado por defecto para preservar canales de noticias

## 🔧 Casos de Uso Comunes

### Configuración Familiar
```javascript
const familyConfig = {
  filterReligiousContent: false,  // Permitir contenido religioso
  filterAdultContent: true,       // Bloquear contenido adulto
  filterPoliticalContent: false   // Permitir noticias políticas
};
```

### Configuración Estricta
```javascript
const strictConfig = {
  filterReligiousContent: true,   // Filtrar contenido religioso
  filterAdultContent: true,       // Filtrar contenido adulto
  filterPoliticalContent: true    // Filtrar contenido político
};
```

### Configuración Solo Entretenimiento
```javascript
const entertainmentConfig = {
  filterReligiousContent: true,   // Sin contenido religioso
  filterAdultContent: true,       // Sin contenido adulto
  filterPoliticalContent: true,   // Sin contenido político
  // Mantener solo entretenimiento general
};
```

## 📈 Monitoreo y Estadísticas

El sistema proporciona estadísticas detalladas:

```javascript
const stats = filterService.getFilterStats();
console.log({
  totalProcessed: stats.totalProcessed,
  religiousFiltered: stats.religiousFiltered,
  adultFiltered: stats.adultFiltered,
  politicalFiltered: stats.politicalFiltered,
  totalKept: stats.totalKept
});
```

## 🐛 Depuración y Troubleshooting

### Logs Detallados
```bash
# Habilitar logs de depuración
DEBUG=ContentFilter* bun run examples/content-filtering-example.js
```

### Verificar Configuración
```javascript
// Verificar que los filtros están activos
const isActive = filterService.isFilterActive('religious');
console.log('Filtro religioso activo:', isActive);
```

### Probar Palabras Clave
```javascript
// Probar si una palabra clave coincide
const matches = filterService.testKeyword('iglesia', 'religious');
console.log('Coincidencia encontrada:', matches);
```

## 🔄 Integración con Repositorios

Los filtros se aplican automáticamente en:
- `CSVChannelRepository`
- `RemoteM3URepository`
- `LocalM3URepository`
- `HybridChannelRepository`

```javascript
// Los filtros se aplican automáticamente
const channels = await channelRepository.getChannels();
// Los canales ya están filtrados según la configuración
```

## 📝 Notas Importantes

1. **Rendimiento**: Los filtros se aplican en memoria, optimizados para grandes listas
2. **Flexibilidad**: Palabras clave completamente configurables
3. **Idiomas**: Soporte para español e inglés por defecto
4. **Excepciones**: Sistema de excepciones para casos especiales
5. **Logging**: Registro detallado para auditoría y depuración

## 🤝 Contribuir

Para agregar nuevas palabras clave o mejorar los filtros:

1. Editar `src/domain/services/ContentFilterService.js`
2. Actualizar las palabras clave por defecto
3. Agregar tests en `tests/unit/services/ContentFilterService.test.js`
4. Ejecutar los ejemplos para validar cambios

---

**Nota**: Estos ejemplos están diseñados para ser educativos y demostrativos. En producción, ajusta la configuración según las necesidades específicas de tu aplicación.