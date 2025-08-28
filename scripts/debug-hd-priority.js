import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria, ConflictResolutionStrategy } from '../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { StreamQuality } from '../src/domain/value-objects/StreamQuality.js';

/**
 * Script para debuggear el sistema de prioridad HD paso a paso
 */

function createTestChannel(id, name, url = 'http://example.com/stream') {
  // Asegurar que el ID tenga el formato correcto
  const validId = id.startsWith('tv_') || id.startsWith('ch_') ? id : `tv_${id}`;
  return new Channel({
    id: validId,
    name,
    streamUrl: url,
    quality: StreamQuality.QUALITIES.SD,
    metadata: {}
  });
}

function testQualityDetection() {
  console.log('=== PRUEBA DE DETECCIÓN DE CALIDAD ===\n');
  
  const service = new ChannelDeduplicationService(new DeduplicationConfig());
  
  const testNames = [
    'CARACOL TV',
    'CARACOL TV HD',
    'CARACOL TV SD_IN',
    'DISCOVERY KIDS',
    'DISCOVERY KIDS HD',
    'ESPN 1',
    'ESPN 1 HD',
    'CANAL TEST',
    'CANAL TEST SD',
    'CANAL TEST HD',
    'CANAL TEST 4K',
    'CANAL TEST UHD'
  ];
  
  testNames.forEach(name => {
    // Acceder a métodos privados usando reflexión para debugging
    const isHighQuality = service.constructor.prototype._isHighQuality || 
                         (() => { console.log('No se puede acceder a #isHighQuality'); return false; });
    const isLowQuality = service.constructor.prototype._isLowQuality || 
                        (() => { console.log('No se puede acceder a #isLowQuality'); return false; });
    const getQualityPatternType = service.constructor.prototype._getQualityPatternType || 
                                 (() => { console.log('No se puede acceder a #getQualityPatternType'); return 'none'; });
    
    console.log(`Canal: "${name}"`);
    console.log(`  - Es alta calidad: ${name.toLowerCase().includes('hd') || name.toLowerCase().includes('4k') || name.toLowerCase().includes('uhd')}`);
    console.log(`  - Es baja calidad: ${name.toLowerCase().includes('sd') && !name.toLowerCase().includes('hd')}`);
    console.log(`  - Patrón detectado: ${getQualityPatternType.call(service, name) || 'manual_detection'}`);
    console.log();
  });
}

async function testConflictResolution() {
  console.log('=== PRUEBA DE RESOLUCIÓN DE CONFLICTOS ===\n');
  
  const config = new DeduplicationConfig({
    criteria: DeduplicationCriteria.NAME_SIMILARITY,
    strategy: ConflictResolutionStrategy.PRIORITIZE_HD,
    nameSimilarityThreshold: 85,
    enableHdUpgrade: true
  });
  
  const service = new ChannelDeduplicationService(config);
  
  // Caso específico: CARACOL TV vs CARACOL TV HD
  console.log('--- Caso: CARACOL TV vs CARACOL TV HD ---');
  const caracolSD = createTestChannel('tv_caracol_1', 'CARACOL TV');
  const caracolHD = createTestChannel('tv_caracol_2', 'CARACOL TV HD');
  
  console.log('Canal 1 (SD):', caracolSD.name);
  console.log('Canal 2 (HD):', caracolHD.name);
  
  // Probar deduplicación con orden SD primero
  console.log('\n--- Orden: SD primero, luego HD ---');
  const result1 = await service.deduplicateChannels([caracolSD, caracolHD]);
  console.log('Resultado:');
  result1.channels.forEach(ch => console.log(`  - ${ch.name} (ID: ${ch.id})`));
  console.log(`Duplicados removidos: ${result1.metrics.duplicatesRemoved}`);
  
  // Probar deduplicación con orden HD primero
  console.log('\n--- Orden: HD primero, luego SD ---');
  const result2 = await service.deduplicateChannels([caracolHD, caracolSD]);
  console.log('Resultado:');
  result2.channels.forEach(ch => console.log(`  - ${ch.name} (ID: ${ch.id})`));
  console.log(`Duplicados removidos: ${result2.metrics.duplicatesRemoved}`);
  
  console.log('\n--- Caso: DISCOVERY KIDS vs DISCOVERY KIDS HD ---');
  const discoverySD = createTestChannel('tv_discovery_1', 'DISCOVERY KIDS');
  const discoveryHD = createTestChannel('tv_discovery_2', 'DISCOVERY KIDS HD');
  
  const result3 = await service.deduplicateChannels([discoverySD, discoveryHD]);
  console.log('Resultado:');
  result3.channels.forEach(ch => console.log(`  - ${ch.name} (ID: ${ch.id})`));
  console.log(`Duplicados removidos: ${result3.metrics.duplicatesRemoved}`);
  
  console.log('\n--- Caso: ESPN 1 vs ESPN 1 HD ---');
  const espnSD = createTestChannel('tv_espn_1', 'ESPN 1');
  const espnHD = createTestChannel('tv_espn_2', 'ESPN 1 HD');
  
  const result4 = await service.deduplicateChannels([espnSD, espnHD]);
  console.log('Resultado:');
  result4.channels.forEach(ch => console.log(`  - ${ch.name} (ID: ${ch.id})`));
  console.log(`Duplicados removidos: ${result4.metrics.duplicatesRemoved}`);
}

async function testSimilarityCalculation() {
  console.log('\n=== PRUEBA DE CÁLCULO DE SIMILITUD ===\n');
  
  const config = new DeduplicationConfig({
    criteria: DeduplicationCriteria.NAME_SIMILARITY,
    strategy: ConflictResolutionStrategy.PRIORITIZE_HD,
    nameSimilarityThreshold: 85,
    enableHdUpgrade: true
  });
  
  const service = new ChannelDeduplicationService(config);
  
  const testPairs = [
    ['CARACOL TV', 'CARACOL TV HD'],
    ['DISCOVERY KIDS', 'DISCOVERY KIDS HD'],
    ['ESPN 1', 'ESPN 1 HD'],
    ['CANAL TEST', 'CANAL TEST SD'],
    ['CANAL TEST', 'CANAL TEST 4K']
  ];
  
  testPairs.forEach(([name1, name2]) => {
    console.log(`Comparando: "${name1}" vs "${name2}"`);
    
    // Crear canales temporales para probar similitud
    const ch1 = createTestChannel('tv_test1', name1);
    const ch2 = createTestChannel('tv_test2', name2);
    
    // Simular la lógica de normalización y similitud
    const normalized1 = name1.toLowerCase().replace(/\b(hd|sd|4k|uhd|fhd)\b/g, '').replace(/\s+/g, ' ').trim();
    const normalized2 = name2.toLowerCase().replace(/\b(hd|sd|4k|uhd|fhd)\b/g, '').replace(/\s+/g, ' ').trim();
    
    console.log(`  - Normalizado 1: "${normalized1}"`);
    console.log(`  - Normalizado 2: "${normalized2}"`);
    console.log(`  - Son iguales después de normalizar: ${normalized1 === normalized2}`);
    console.log(`  - Umbral de similitud: 85%`);
    console.log();
  });
}

// Ejecutar todas las pruebas
async function runAllTests() {
  try {
    testQualityDetection();
    await testSimilarityCalculation();
    await testConflictResolution();
  } catch (error) {
    console.error('Error durante las pruebas:', error.message);
    console.error(error.stack);
  }
}

runAllTests();