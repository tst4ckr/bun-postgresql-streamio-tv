import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria, ConflictResolutionStrategy } from '../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { StreamQuality } from '../src/domain/value-objects/StreamQuality.js';

/**
 * Debug específico para DISCOVERY KIDS
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

async function debugDiscoveryFlow() {
  console.log('=== DEBUG DISCOVERY KIDS FLOW ===\n');
  
  const config = new DeduplicationConfig({
    criteria: DeduplicationCriteria.NAME_SIMILARITY,
    strategy: ConflictResolutionStrategy.PRIORITIZE_HD,
    nameSimilarityThreshold: 0.85,
    enableHdUpgrade: true
  });
  
  const service = new ChannelDeduplicationService(config);
  
  // Crear canales de prueba
  const channels = [
    createTestChannel('tv_discovery_1', 'DISCOVERY KIDS'),
    createTestChannel('tv_discovery_2', 'DISCOVERY KIDS HD')
  ];
  
  console.log('Canales de entrada:');
  channels.forEach(ch => {
    console.log(`  - ${ch.name} (ID: ${ch.id}, Quality: ${ch.quality})`);
  });
  console.log();
  
  // Verificar si son duplicados
  console.log('=== VERIFICACIÓN DE DUPLICADOS ===');
  const ch1 = channels[0];
  const ch2 = channels[1];
  
  // Simular la verificación de duplicados
  const similarity = service.calculateSimilarity ? service.calculateSimilarity(ch1.name, ch2.name) : 'N/A';
  console.log(`Similitud entre "${ch1.name}" y "${ch2.name}": ${similarity}`);
  console.log(`Umbral de similitud: ${config.nameSimilarityThreshold}`);
  console.log();
  
  // Detectar calidad de cada canal
  console.log('=== DETECCIÓN DE CALIDAD ===');
  console.log(`"${ch1.name}" -> Calidad detectada: ${service.detectQuality ? service.detectQuality(ch1.name) : 'N/A'}`);
  console.log(`"${ch2.name}" -> Calidad detectada: ${service.detectQuality ? service.detectQuality(ch2.name) : 'N/A'}`);
  console.log();
  
  // Ejecutar deduplicación
  console.log('=== DEDUPLICACIÓN ===');
  const result = await service.deduplicateChannels(channels);
  
  console.log('Resultado:');
  console.log(`Canales originales: ${channels.length}`);
  console.log(`Canales después de deduplicación: ${result.channels.length}`);
  console.log('Canales mantenidos:');
  result.channels.forEach(ch => console.log(`  - ${ch.name} (ID: ${ch.id})`));
  console.log(`Duplicados removidos: ${result.metrics.duplicatesRemoved}`);
  console.log(`Actualizaciones HD: ${result.metrics.hdUpgrades}`);
  console.log();
  
  // Verificar si HD se mantiene
  const hdMaintained = result.channels.find(ch => ch.name === 'DISCOVERY KIDS HD');
  console.log('✓ DISCOVERY KIDS HD mantenido:', hdMaintained ? 'SÍ' : 'NO');
}

// Ejecutar debug
try {
  await debugDiscoveryFlow();
} catch (error) {
  console.error('Error durante el debug:', error.message);
  console.error(error.stack);
}