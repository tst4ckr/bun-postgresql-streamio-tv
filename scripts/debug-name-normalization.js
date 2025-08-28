import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria, ConflictResolutionStrategy } from '../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { StreamQuality } from '../src/domain/value-objects/StreamQuality.js';

/**
 * Debug específico para normalización de nombres
 */

function createTestChannel(id, name, url = 'http://example.com/stream') {
  return new Channel({
    id: `ch_${id}`,
    name,
    streamUrl: url,
    quality: 'SD',
    metadata: {}
  });
}

// Función para acceder al método privado de normalización
function testNormalization() {
  const config = new DeduplicationConfig({
    criteria: DeduplicationCriteria.SIMILARITY_BASED,
    conflictResolution: ConflictResolutionStrategy.PRIORITIZE_HD,
    nameSimilarityThreshold: 0.85
  });
  
  const service = new ChannelDeduplicationService(config);
  
  // Casos de prueba con prefijos numéricos
  const testCases = [
    '38-FMH Kids',
    '105-CNN',
    '22 - Discovery Channel',
    '1-Canal Uno',
    '15 ESPN',
    'FMH Kids', // Sin prefijo para comparar
    'CNN',      // Sin prefijo para comparar
    'Discovery Channel', // Sin prefijo para comparar
    '38-FMH Kids HD',
    '105-CNN SD',
    '22 - Discovery Channel 4K'
  ];
  
  console.log('=== PRUEBA DE NORMALIZACIÓN DE NOMBRES ===\n');
  
  testCases.forEach(name => {
    // Acceder al método privado usando reflexión
    const normalizedName = service.constructor.prototype._normalizeChannelName?.call(service, name) || 
                           normalizeChannelNameManual(name);
    
    console.log(`Original: "${name}"`);
    console.log(`Normalizado: "${normalizedName}"`);
    console.log('---');
  });
  
  // Probar similitud entre canales con y sin prefijos
  console.log('\n=== PRUEBA DE SIMILITUD ===\n');
  
  const testPairs = [
    ['38-FMH Kids', 'FMH Kids'],
    ['105-CNN', 'CNN'],
    ['22 - Discovery Channel', 'Discovery Channel'],
    ['38-FMH Kids HD', 'FMH Kids HD'],
    ['105-CNN SD', 'CNN SD']
  ];
  
  testPairs.forEach(([name1, name2]) => {
    const channel1 = createTestChannel('test1', name1);
    const channel2 = createTestChannel('test2', name2);
    
    const norm1 = normalizeChannelNameManual(name1);
    const norm2 = normalizeChannelNameManual(name2);
    const similarity = calculateStringSimilarity(norm1, norm2);
    
    console.log(`Comparando: "${name1}" vs "${name2}"`);
    console.log(`Normalizados: "${norm1}" vs "${norm2}"`);
    console.log(`Similitud: ${similarity.toFixed(4)} (${similarity >= 0.85 ? '✅ DUPLICADOS' : '❌ NO DUPLICADOS'})`);
    console.log('---');
  });
}

// Función manual de normalización para pruebas
function normalizeChannelNameManual(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  let normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
    .replace(/\s+/g, ' ')        // Normalizar espacios
    .trim();
  
  // Remover prefijos numéricos comunes (ej: "105-CNN" -> "CNN")
  normalized = normalized.replace(/^\d+\s*-?\s*/, '');
  
  // Remover sufijos de calidad comunes
  normalized = normalized
    .replace(/\s+(hd|sd|fhd|uhd|4k)$/g, '')
    .replace(/\s+\d+hd$/g, '') // Remover variantes como "6hd"
    .replace(/_hd$/g, '');     // Remover "_hd"
  
  return normalized.trim();
}

// Función para calcular similitud
function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

// Función para calcular distancia de Levenshtein
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Ejecutar las pruebas
testNormalization();