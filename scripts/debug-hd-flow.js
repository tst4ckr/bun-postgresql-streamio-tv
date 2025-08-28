import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria, ConflictResolutionStrategy } from '../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../src/domain/entities/Channel.js';

// Función para crear canales de prueba
function createTestChannel(id, name, url = 'http://test.com', source = 'test') {
  if (!id.startsWith('tv_') && !id.startsWith('ch_')) {
    id = `tv_${id}`;
  }
  
  return new Channel({
    id,
    name,
    streamUrl: url,
    quality: 'SD',
    metadata: { source }
  });
}

// Configuración de debug
const config = new DeduplicationConfig({
  criteria: DeduplicationCriteria.NAME_SIMILARITY,
  strategy: ConflictResolutionStrategy.PRIORITIZE_HD,
  enableHdUpgrade: true,
  nameSimilarityThreshold: 0.85,
  enableMetrics: true
});

const service = new ChannelDeduplicationService(config);

async function debugHDFlow() {
  console.log('🔍 DEBUG: Flujo completo de deduplicación HD\n');
  
  // Caso de prueba: CARACOL TV (SD primero, luego HD)
  const channels = [
    createTestChannel('caracol_sd', 'CARACOL TV SD_IN', 'http://caracol-sd.com'),
    createTestChannel('caracol_hd', 'CARACOL TV HD', 'http://caracol-hd.com')
  ];
  
  console.log('📋 Canales de entrada:');
  channels.forEach((ch, i) => {
    console.log(`  ${i + 1}. ${ch.name} (${ch.id})`);
  });
  console.log();
  
  // Simular el proceso paso a paso
  console.log('🔄 Iniciando proceso de deduplicación...');
  
  // Paso 1: Verificar si son duplicados
  console.log('\n📊 Paso 1: Verificación de duplicados');
  const channel1 = channels[0];
  const channel2 = channels[1];
  
  // Acceder a métodos privados usando reflexión
  const areChannelsDuplicate = service.constructor.prototype._areChannelsDuplicate || 
    function(ch1, ch2) {
      // Simulación de la lógica de duplicados
      const name1 = ch1.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const name2 = ch2.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Remover sufijos de calidad para comparación
      const cleanName1 = name1.replace(/(hd|sd|4k|uhd|fhd|sdin|sdout)$/g, '');
      const cleanName2 = name2.replace(/(hd|sd|4k|uhd|fhd|sdin|sdout)$/g, '');
      
      const similarity = calculateSimilarity(cleanName1, cleanName2);
      console.log(`    Similitud entre "${cleanName1}" y "${cleanName2}": ${(similarity * 100).toFixed(1)}%`);
      
      return similarity >= 0.85;
    };
  
  function calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }
  
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
  
  const areDuplicates = areChannelsDuplicate.call(service, channel1, channel2);
  console.log(`    ¿Son duplicados? ${areDuplicates ? '✅ SÍ' : '❌ NO'}`);
  
  if (!areDuplicates) {
    console.log('\n❌ Los canales no son considerados duplicados. Fin del debug.');
    return;
  }
  
  // Paso 2: Detectar calidad
  console.log('\n🎯 Paso 2: Detección de calidad');
  
  function isHighQuality(name) {
    const hdPatterns = [
      /\b(4K|UHD|ULTRA\s*HD)\b/i,
      /\b(FHD|FULL\s*HD)\b/i,
      /\b\d+HD\b/i,
      /_HD\b/i,
      /\bHD\b/i
    ];
    return hdPatterns.some(pattern => pattern.test(name));
  }
  
  function isLowQuality(name) {
    const sdPatterns = [
      /\bSD_(IN|OUT|HD)\b/i,
      /_SD\b/i,
      /\b\d+SD\b/i,
      /\bSD\b/i
    ];
    return sdPatterns.some(pattern => pattern.test(name));
  }
  
  const ch1IsHD = isHighQuality(channel1.name);
  const ch1IsSD = isLowQuality(channel1.name);
  const ch2IsHD = isHighQuality(channel2.name);
  const ch2IsSD = isLowQuality(channel2.name);
  
  console.log(`    ${channel1.name}: HD=${ch1IsHD}, SD=${ch1IsSD}`);
  console.log(`    ${channel2.name}: HD=${ch2IsHD}, SD=${ch2IsSD}`);
  
  // Paso 3: Resolución de conflicto
  console.log('\n⚖️ Paso 3: Resolución de conflicto HD');
  
  let resolution;
  
  if (ch1IsHD && ch2IsSD) {
    resolution = {
      shouldReplace: false,
      selectedChannel: channel1,
      strategy: 'protect_hd_from_sd'
    };
    console.log('    🛡️ Protegiendo canal HD del canal SD');
  } else if (ch1IsSD && ch2IsHD) {
    resolution = {
      shouldReplace: true,
      selectedChannel: channel2,
      strategy: 'upgrade_sd_to_hd'
    };
    console.log('    ⬆️ Actualizando canal SD a HD');
  } else {
    resolution = {
      shouldReplace: false,
      selectedChannel: channel1,
      strategy: 'keep_first'
    };
    console.log('    📌 Manteniendo primer canal (sin diferencia de calidad clara)');
  }
  
  console.log(`    Estrategia: ${resolution.strategy}`);
  console.log(`    ¿Reemplazar? ${resolution.shouldReplace ? '✅ SÍ' : '❌ NO'}`);
  console.log(`    Canal seleccionado: ${resolution.selectedChannel.name}`);
  
  // Paso 4: Ejecutar deduplicación real
  console.log('\n🚀 Paso 4: Deduplicación real');
  
  try {
    const result = await service.deduplicateChannels(channels);
    
    console.log('\n📊 Resultado final:');
    console.log(`    Canales únicos: ${result.channels.length}`);
    console.log(`    Duplicados encontrados: ${result.metrics.duplicatesFound}`);
    console.log(`    Duplicados removidos: ${result.metrics.duplicatesRemoved}`);
    
    console.log('\n📋 Canales resultantes:');
    result.channels.forEach((ch, i) => {
      console.log(`    ${i + 1}. ${ch.name} (${ch.id})`);
    });
    
    // Verificar si el resultado coincide con la expectativa
    const expectedChannel = resolution.selectedChannel;
    const actualChannel = result.channels.find(ch => ch.id === expectedChannel.id);
    
    if (actualChannel) {
      console.log(`\n✅ ÉXITO: El canal esperado (${expectedChannel.name}) está en el resultado`);
    } else {
      console.log(`\n❌ ERROR: El canal esperado (${expectedChannel.name}) NO está en el resultado`);
      console.log('    Esto indica un problema en la lógica de deduplicación');
    }
    
  } catch (error) {
    console.error('\n❌ Error durante la deduplicación:', error.message);
  }
}

// Ejecutar debug
debugHDFlow().catch(console.error);