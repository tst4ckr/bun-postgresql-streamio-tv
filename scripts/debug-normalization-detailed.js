import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria, ConflictResolutionStrategy } from '../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { StreamQuality } from '../src/domain/value-objects/StreamQuality.js';

// Función para replicar la normalización interna
function normalizeChannelName(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  let normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
    .replace(/\s+/g, ' ')        // Normalizar espacios
    .trim();
  
  console.log(`Paso 1 - Limpieza inicial: "${name}" -> "${normalized}"`);
  
  // Remover SOLO prefijos numéricos que están claramente separados por guión
  const beforePrefixRemoval = normalized;
  normalized = normalized.replace(/^\d+\s*-\s*/, '');
  if (beforePrefixRemoval !== normalized) {
    console.log(`Paso 2 - Remover prefijos: "${beforePrefixRemoval}" -> "${normalized}"`);
  }
  
  // Remover sufijos de calidad comunes
  const beforeQualityRemoval = normalized;
  normalized = normalized
    .replace(/\s+(hd|sd|fhd|uhd|4k)$/g, '')
    .replace(/\s+\d+hd$/g, '') // Remover variantes como "6hd"
    .replace(/_hd$/g, '');     // Remover "_hd"
  
  if (beforeQualityRemoval !== normalized) {
    console.log(`Paso 3 - Remover calidad: "${beforeQualityRemoval}" -> "${normalized}"`);
  }
  
  // Normalizar números romanos a arábigos para mejor comparación
  const romanToArabic = {
    'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
    'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'
  };
  
  const beforeRomanNormalization = normalized;
  normalized = normalized.replace(/\s+(i{1,3}|iv|v|vi{1,3}|ix|x)$/g, (match, roman) => {
    return ' ' + (romanToArabic[roman] || roman);
  });
  
  if (beforeRomanNormalization !== normalized) {
    console.log(`Paso 4 - Números romanos: "${beforeRomanNormalization}" -> "${normalized}"`);
  }
  
  // Normalizar variaciones de "canal"
  const numberWords = {
    'uno': '1', 'dos': '2', 'tres': '3', 'cuatro': '4', 'cinco': '5',
    'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9', 'diez': '10',
    'once': '11', 'doce': '12', 'trece': '13', 'catorce': '14', 'quince': '15'
  };
  
  const beforeNumberWords = normalized;
  Object.entries(numberWords).forEach(([word, number]) => {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    normalized = normalized.replace(regex, number);
  });
  
  if (beforeNumberWords !== normalized) {
    console.log(`Paso 5 - Palabras numéricas: "${beforeNumberWords}" -> "${normalized}"`);
  }
  
  const final = normalized.trim();
  console.log(`Resultado final: "${name}" -> "${final}"`);
  console.log('---');
  
  return final;
}

function debugNormalizationDetailed() {
  console.log('=== DEBUG DETALLADO DE NORMALIZACIÓN ===\n');
  
  const testNames = [
    'Fox Sports',
    'Fox Sports HD', 
    'Fox Sports 2',
    '105-Fox Sports 2',
    'Fox Sports 2 HD',
    'Fox Sports 3',
    'Fox Sports 3 HD',
    '22-Fox Sports 3 HD'
  ];
  
  testNames.forEach(name => {
    console.log(`\n=== Normalizando: "${name}" ===`);
    const normalized = normalizeChannelName(name);
  });
  
  console.log('\n=== ANÁLISIS DE DUPLICADOS ===');
  
  // Crear canales de prueba
  const channels = [
    new Channel({
      id: 'tv_fox_sports2_1',
      name: 'Fox Sports 2',
      streamUrl: 'http://stream.example.com/fox-sports-2',
      quality: new StreamQuality('SD')
    }),
    new Channel({
      id: 'tv_fox_sports2_2', 
      name: '105-Fox Sports 2',
      streamUrl: 'http://stream.example.com/fox-sports-2-alt',
      quality: new StreamQuality('HD')
    }),
    new Channel({
      id: 'tv_fox_sports3_1',
      name: 'Fox Sports 3',
      streamUrl: 'http://stream.example.com/fox-sports-3',
      quality: new StreamQuality('HD')
    })
  ];
  
  console.log('\nCanales de prueba:');
  channels.forEach((channel, index) => {
    const normalized = normalizeChannelName(channel.name);
    console.log(`${index + 1}. "${channel.name}" -> "${normalized}"`);
  });
  
  // Verificar si se consideran duplicados
  const config = new DeduplicationConfig({
    criteria: DeduplicationCriteria.NAME_SIMILARITY,
    conflictResolution: ConflictResolutionStrategy.PRIORITIZE_HD,
    nameSimilarityThreshold: 0.85,
    urlSimilarityThreshold: 0.90
  });
  
  const service = new ChannelDeduplicationService(config);
  
  console.log('\n=== COMPARACIONES DE SIMILITUD ===');
  
  for (let i = 0; i < channels.length; i++) {
    for (let j = i + 1; j < channels.length; j++) {
      const ch1 = channels[i];
      const ch2 = channels[j];
      
      console.log(`\nComparando:`);
      console.log(`  Canal 1: "${ch1.name}"`);
      console.log(`  Canal 2: "${ch2.name}"`);
      
      const norm1 = normalizeChannelName(ch1.name);
      const norm2 = normalizeChannelName(ch2.name);
      
      console.log(`  Normalizados: "${norm1}" vs "${norm2}"`);
      console.log(`  ¿Son iguales?: ${norm1 === norm2}`);
    }
  }
}

debugNormalizationDetailed();