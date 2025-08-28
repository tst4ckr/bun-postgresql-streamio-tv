import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria, ConflictResolutionStrategy } from '../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { StreamQuality } from '../src/domain/value-objects/StreamQuality.js';

/**
 * Debug específico para resolución de conflictos
 */

function createTestChannel(id, name, url = 'http://example.com/stream') {
  return new Channel({
    id,
    name,
    streamUrl: url,
    quality: 'SD',
    metadata: {}
  });
}

// Función para simular la detección de duplicados
function areChannelsDuplicate(channel1, channel2, threshold = 0.85) {
  // Verificación por ID exacto
  if (channel1.id === channel2.id) {
    return true;
  }

  // Verificación por URL exacta
  if (channel1.streamUrl && channel2.streamUrl && 
      channel1.streamUrl === channel2.streamUrl) {
    return true;
  }

  // Verificación por similitud de nombre
  const similarity = calculateStringSimilarity(
    normalizeChannelName(channel1.name),
    normalizeChannelName(channel2.name)
  );

  return similarity >= threshold;
}

// Función para normalizar nombres
function normalizeChannelName(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

// Función para detectar alta calidad
function isHighQuality(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  const lowerName = name.toLowerCase();
  
  const highQualityPatterns = [
    /_hd\b/,
    /\bhd\b/,
    /\b\d+hd\b/,
    /\buhd\b/,
    /\bfhd\b/,
    /\b4k\b/
  ];
  
  return highQualityPatterns.some(pattern => pattern.test(lowerName));
}

// Función para detectar baja calidad
function isLowQuality(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  const lowerName = name.toLowerCase();
  
  const lowQualityPatterns = [
    /\bsd\b/,
    /_sd\b/,
    /\bsd_\w+\b/,
    /\b\d+sd\b/
  ];
  
  return lowQualityPatterns.some(pattern => pattern.test(lowerName));
}

// Función para simular resolución de conflictos
function resolveByHdPriority(existingChannel, newChannel) {
  console.log('    🔧 Resolviendo conflicto por prioridad HD...');
  
  const existingIsHighQuality = isHighQuality(existingChannel.name);
  const newIsHighQuality = isHighQuality(newChannel.name);
  const existingIsLowQuality = isLowQuality(existingChannel.name);
  const newIsLowQuality = isLowQuality(newChannel.name);
  
  console.log(`    📊 Canal existente "${existingChannel.name}":`);
  console.log(`        - Es alta calidad: ${existingIsHighQuality}`);
  console.log(`        - Es baja calidad: ${existingIsLowQuality}`);
  
  console.log(`    📊 Canal nuevo "${newChannel.name}":`);
  console.log(`        - Es alta calidad: ${newIsHighQuality}`);
  console.log(`        - Es baja calidad: ${newIsLowQuality}`);
  
  // REGLA PRINCIPAL: Los canales HD nunca deben ser eliminados por canales SD
  if (existingIsHighQuality && newIsLowQuality) {
    console.log('    ✅ REGLA: Proteger HD existente de SD nuevo');
    return {
      shouldReplace: false,
      selectedChannel: existingChannel,
      strategy: 'protect_hd_from_sd'
    };
  }
  
  // REGLA PRINCIPAL: Los canales SD deben ser reemplazados por canales HD
  if (existingIsLowQuality && newIsHighQuality) {
    console.log('    ✅ REGLA: Actualizar SD existente a HD nuevo');
    return {
      shouldReplace: true,
      selectedChannel: newChannel,
      strategy: 'upgrade_sd_to_hd'
    };
  }
  
  // REGLA NUEVA: Canal sin patrones de calidad debe ser reemplazado por canal HD
  if (!existingIsHighQuality && !existingIsLowQuality && newIsHighQuality) {
    console.log('    ✅ REGLA: Actualizar canal genérico a HD nuevo');
    return {
      shouldReplace: true,
      selectedChannel: newChannel,
      strategy: 'upgrade_generic_to_hd'
    };
  }
  
  // REGLA NUEVA: Canal HD nunca debe ser reemplazado por canal sin patrones de calidad
  if (existingIsHighQuality && !newIsHighQuality && !newIsLowQuality) {
    console.log('    ✅ REGLA: Proteger HD existente de canal genérico');
    return {
      shouldReplace: false,
      selectedChannel: existingChannel,
      strategy: 'protect_hd_from_generic'
    };
  }
  
  // Si ninguno tiene patrones de calidad específicos, usar objeto quality
  if (!existingIsHighQuality && !existingIsLowQuality && !newIsHighQuality && !newIsLowQuality) {
    console.log('    ⚠️  Ningún canal tiene patrones de calidad específicos, usando objeto quality...');
    
    const existingQuality = existingChannel.quality?.value || 'SD';
    const newQuality = newChannel.quality?.value || 'SD';
    
    console.log(`    📊 Calidad por objeto - Existente: ${existingQuality}, Nuevo: ${newQuality}`);
    
    const existingIsHdByObject = existingQuality === 'HD' || existingQuality === 'FHD' || existingQuality === '4K';
    const newIsHdByObject = newQuality === 'HD' || newQuality === 'FHD' || newQuality === '4K';

    if (newIsHdByObject && !existingIsHdByObject) {
      console.log('    ✅ REGLA: Actualizar por objeto quality (SD → HD)');
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'hd_upgrade_by_object'
      };
    }
    
    if (existingIsHdByObject && !newIsHdByObject) {
      console.log('    ✅ REGLA: Proteger por objeto quality (HD existente)');
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'protect_hd_by_object'
      };
    }
  }
  
  console.log('    ⚠️  Mantener canal existente (sin reglas aplicables)');
  return {
    shouldReplace: false,
    selectedChannel: existingChannel,
    strategy: 'hd_keep_existing'
  };
}

async function debugConflictResolution() {
  console.log('=== DEBUG RESOLUCIÓN DE CONFLICTOS ===\n');
  
  // Crear canales de prueba
  const channels = [
    createTestChannel('tv_discovery_1', 'DISCOVERY KIDS'),
    createTestChannel('tv_discovery_2', 'DISCOVERY KIDS HD')
  ];
  
  console.log('Canales de entrada:');
  channels.forEach(ch => {
    console.log(`  - ${ch.name} (ID: ${ch.id})`);
  });
  console.log();
  
  const ch1 = channels[0];
  const ch2 = channels[1];
  
  // Paso 1: Verificar si son duplicados
  console.log('🔍 Paso 1: Verificación de duplicados');
  
  const norm1 = normalizeChannelName(ch1.name);
  const norm2 = normalizeChannelName(ch2.name);
  const similarity = calculateStringSimilarity(norm1, norm2);
  const threshold = 0.85;
  
  console.log(`  Nombre 1 normalizado: "${norm1}"`);
  console.log(`  Nombre 2 normalizado: "${norm2}"`);
  console.log(`  Similitud calculada: ${similarity.toFixed(4)}`);
  console.log(`  Umbral requerido: ${threshold}`);
  
  const areDuplicates = areChannelsDuplicate(ch1, ch2, threshold);
  console.log(`  ¿Son duplicados? ${areDuplicates ? '✅ SÍ' : '❌ NO'}`);
  console.log();
  
  if (!areDuplicates) {
    console.log('❌ Los canales no son considerados duplicados. Fin del debug.');
    return;
  }
  
  // Paso 2: Resolver conflicto
  console.log('⚔️  Paso 2: Resolución de conflicto');
  const resolution = resolveByHdPriority(ch1, ch2);
  
  console.log();
  console.log('📋 Resultado de la resolución:');
  console.log(`  ¿Debe reemplazar? ${resolution.shouldReplace ? '✅ SÍ' : '❌ NO'}`);
  console.log(`  Canal seleccionado: "${resolution.selectedChannel.name}"`);
  console.log(`  Estrategia: ${resolution.strategy}`);
  console.log();
  
  // Paso 3: Simular el resultado final
  console.log('🎯 Paso 3: Resultado final simulado');
  if (resolution.shouldReplace) {
    console.log(`  ✅ "${ch2.name}" reemplaza a "${ch1.name}"`);
    console.log(`  🗑️  "${ch1.name}" es eliminado`);
  } else {
    console.log(`  ✅ "${ch1.name}" se mantiene`);
    console.log(`  🗑️  "${ch2.name}" es eliminado`);
  }
}

// Ejecutar debug
try {
  await debugConflictResolution();
} catch (error) {
  console.error('Error durante el debug:', error.message);
  console.error(error.stack);
}