import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria, ConflictResolutionStrategy } from '../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { StreamQuality } from '../src/domain/value-objects/StreamQuality.js';

/**
 * Script para probar el sistema de prioridad HD
 * Valida que los canales HD no sean eliminados como duplicados
 */

function createTestChannel(id, name, url = 'http://example.com/stream') {
  return new Channel({
    id,
    name,
    streamUrl: url,
    quality: StreamQuality.QUALITIES.SD,
    metadata: {}
  });
}

async function testHDPriority() {
  console.log('=== PRUEBA DE PRIORIDAD HD ===\n');
  
  // Configuración con prioridad HD habilitada
  const config = new DeduplicationConfig({
    criteria: DeduplicationCriteria.NAME_SIMILARITY,
    strategy: ConflictResolutionStrategy.PRIORITIZE_HD,
    nameSimilarityThreshold: 0.85,
    enableHdUpgrade: true
  });
  
  const service = new ChannelDeduplicationService(config);
  
  // Caso 1: CARACOL TV vs CARACOL TV HD vs CARACOL TV SD_IN (SD primero para probar upgrade)
  console.log('--- Caso 1: CARACOL TV variants ---');
  const caracolChannels = [
    createTestChannel('tv_caracol_1', 'CARACOL TV SD_IN'),
    createTestChannel('tv_caracol_2', 'CARACOL TV'),
    createTestChannel('tv_caracol_3', 'CARACOL TV HD')
  ];
  
  const caracolResult = await service.deduplicateChannels(caracolChannels);
  console.log('Canales originales:', caracolChannels.length);
  console.log('Canales después de deduplicación:', caracolResult.channels.length);
  console.log('Canales mantenidos:');
  caracolResult.channels.forEach(ch => console.log(`  - ${ch.name} (ID: ${ch.id})`));
  console.log('Duplicados removidos:', caracolResult.metrics.duplicatesRemoved);
  console.log();
  
  // Caso 2: DISCOVERY KIDS vs DISCOVERY KIDS HD (SD primero para probar upgrade)
  console.log('--- Caso 2: DISCOVERY KIDS variants ---');
  const discoveryChannels = [
    createTestChannel('tv_discovery_1', 'DISCOVERY KIDS'),
    createTestChannel('tv_discovery_2', 'DISCOVERY KIDS HD')
  ];
  
  const discoveryResult = await service.deduplicateChannels(discoveryChannels);
  console.log('Canales originales:', discoveryChannels.length);
  console.log('Canales después de deduplicación:', discoveryResult.channels.length);
  console.log('Canales mantenidos:');
  discoveryResult.channels.forEach(ch => console.log(`  - ${ch.name} (ID: ${ch.id})`));
  console.log('Duplicados removidos:', discoveryResult.metrics.duplicatesRemoved);
  console.log();
  
  // Caso 3: ESPN 1 vs ESPN 1 HD (SD primero para probar upgrade)
  console.log('--- Caso 3: ESPN 1 variants ---');
  const espnChannels = [
    createTestChannel('tv_espn_1', 'ESPN 1'),
    createTestChannel('tv_espn_2', 'ESPN 1 HD')
  ];
  
  const espnResult = await service.deduplicateChannels(espnChannels);
  console.log('Canales originales:', espnChannels.length);
  console.log('Canales después de deduplicación:', espnResult.channels.length);
  console.log('Canales mantenidos:');
  espnResult.channels.forEach(ch => console.log(`  - ${ch.name} (ID: ${ch.id})`));
  console.log('Duplicados removidos:', espnResult.metrics.duplicatesRemoved);
  console.log();
  
  // Caso 4: Múltiples variantes de calidad (orden: SD → HD → 4K/UHD)
  console.log('--- Caso 4: Múltiples variantes de calidad ---');
  const multiQualityChannels = [
    createTestChannel('tv_test_1', 'CANAL TEST SD'),
    createTestChannel('tv_test_2', 'CANAL TEST SD_IN'),
    createTestChannel('tv_test_3', 'CANAL TEST'),
    createTestChannel('tv_test_4', 'CANAL TEST HD'),
    createTestChannel('tv_test_5', 'CANAL TEST 4K'),
    createTestChannel('tv_test_6', 'CANAL TEST UHD')
  ];
  
  const multiResult = await service.deduplicateChannels(multiQualityChannels);
  console.log('Canales originales:', multiQualityChannels.length);
  console.log('Canales después de deduplicación:', multiResult.channels.length);
  console.log('Canales mantenidos:');
  multiResult.channels.forEach(ch => console.log(`  - ${ch.name} (ID: ${ch.id})`));
  console.log('Duplicados removidos:', multiResult.metrics.duplicatesRemoved);
  console.log();
  
  // Validaciones
  console.log('=== VALIDACIONES ===');
  
  // Validar que CARACOL TV HD se mantiene
  const caracolHD = caracolResult.channels.find(ch => ch.name === 'CARACOL TV HD');
  console.log('✓ CARACOL TV HD mantenido:', caracolHD ? 'SÍ' : 'NO');
  
  // Validar que DISCOVERY KIDS HD se mantiene
  const discoveryHD = discoveryResult.channels.find(ch => ch.name === 'DISCOVERY KIDS HD');
  console.log('✓ DISCOVERY KIDS HD mantenido:', discoveryHD ? 'SÍ' : 'NO');
  
  // Validar que ESPN 1 HD se mantiene
  const espnHD = espnResult.channels.find(ch => ch.name === 'ESPN 1 HD');
  console.log('✓ ESPN 1 HD mantenido:', espnHD ? 'SÍ' : 'NO');
  
  // Validar que en el caso múltiple, las versiones de mayor calidad se mantienen
  const has4K = multiResult.channels.find(ch => ch.name.includes('4K'));
  const hasUHD = multiResult.channels.find(ch => ch.name.includes('UHD'));
  const hasHD = multiResult.channels.find(ch => ch.name.includes('HD') && !ch.name.includes('UHD'));
  
  console.log('✓ Versión 4K mantenida:', has4K ? 'SÍ' : 'NO');
  console.log('✓ Versión UHD mantenida:', hasUHD ? 'SÍ' : 'NO');
  console.log('✓ Versión HD mantenida:', hasHD ? 'SÍ' : 'NO');
  
  console.log('\n=== RESUMEN ===');
  console.log('El sistema de prioridad HD está funcionando correctamente si:');
  console.log('- Los canales HD no son eliminados como duplicados');
  console.log('- Las versiones de mayor calidad tienen prioridad sobre las de menor calidad');
  console.log('- Se mantiene al menos una versión de cada canal único');
}

// Ejecutar las pruebas
try {
  await testHDPriority();
} catch (error) {
  console.error('Error durante las pruebas:', error.message);
  console.error(error.stack);
}