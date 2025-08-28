import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria, ConflictResolutionStrategy } from '../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { StreamQuality } from '../src/domain/value-objects/StreamQuality.js';

/**
 * Prueba específica para deduplicación de canales con prefijos numéricos
 */

function createTestChannel(id, name, url = 'http://example.com/stream', quality = 'SD') {
  return new Channel({
    id: `ch_${id}`,
    name,
    streamUrl: url,
    quality,
    metadata: {}
  });
}

async function testPrefixDeduplication() {
  const config = new DeduplicationConfig({
    criteria: DeduplicationCriteria.SIMILARITY_BASED,
    conflictResolution: ConflictResolutionStrategy.PRIORITIZE_HD,
    nameSimilarityThreshold: 0.85
  });
  
  const service = new ChannelDeduplicationService(config);
  
  // Crear canales de prueba con prefijos numéricos
  const channels = [
    createTestChannel('001', '38-FMH Kids', 'http://stream1.com', 'SD'),
    createTestChannel('002', 'FMH Kids', 'http://stream2.com', 'SD'),
    createTestChannel('003', '38-FMH Kids HD', 'http://stream3.com', 'HD'),
    createTestChannel('004', '105-CNN', 'http://stream4.com', 'SD'),
    createTestChannel('005', 'CNN', 'http://stream5.com', 'SD'),
    createTestChannel('006', '105-CNN HD', 'http://stream6.com', 'HD'),
    createTestChannel('007', '22 - Discovery Channel', 'http://stream7.com', 'SD'),
    createTestChannel('008', 'Discovery Channel', 'http://stream8.com', 'SD'),
    createTestChannel('009', 'Discovery Channel 4K', 'http://stream9.com', '4K'),
    createTestChannel('010', '1-Canal Uno', 'http://stream10.com', 'SD'),
    createTestChannel('011', 'Canal Uno HD', 'http://stream11.com', 'HD')
  ];
  
  console.log('=== CANALES ORIGINALES ===\n');
  channels.forEach((channel, index) => {
    console.log(`${index + 1}. ${channel.name} (${channel.quality}) - ID: ${channel.id}`);
  });
  
  console.log('\n=== EJECUTANDO DEDUPLICACIÓN ===\n');
  
  const result = await service.deduplicateChannels(channels);
  const deduplicatedChannels = result.channels;
  
  console.log('=== CANALES DESPUÉS DE DEDUPLICACIÓN ===\n');
  deduplicatedChannels.forEach((channel, index) => {
    console.log(`${index + 1}. ${channel.name} (${channel.quality}) - ID: ${channel.id}`);
  });
  
  console.log('\n=== ANÁLISIS DE RESULTADOS ===\n');
  
  const originalCount = channels.length;
  const finalCount = deduplicatedChannels.length;
  const removedCount = originalCount - finalCount;
  
  console.log(`Canales originales: ${originalCount}`);
  console.log(`Canales finales: ${finalCount}`);
  console.log(`Canales eliminados: ${removedCount}`);
  
  // Verificar que se mantuvieron las versiones de mayor calidad
  const expectedResults = [
    { name: 'FMH Kids', expectedQuality: 'HD', reason: 'Debe mantener la versión HD entre 38-FMH Kids, FMH Kids y 38-FMH Kids HD' },
    { name: 'CNN', expectedQuality: 'HD', reason: 'Debe mantener la versión HD entre 105-CNN, CNN y 105-CNN HD' },
    { name: 'Discovery Channel', expectedQuality: '4K', reason: 'Debe mantener la versión 4K entre 22 - Discovery Channel, Discovery Channel y Discovery Channel 4K' },
    { name: 'Canal Uno', expectedQuality: 'HD', reason: 'Debe mantener la versión HD entre 1-Canal Uno y Canal Uno HD' }
  ];
  
  console.log('\n=== VERIFICACIÓN DE EXPECTATIVAS ===\n');
  
  expectedResults.forEach(expected => {
    const found = deduplicatedChannels.find(ch => {
      const normalizedName = ch.name.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/^\d+\s*-?\s*/, '')
        .replace(/\s+(hd|sd|fhd|uhd|4k)$/g, '')
        .trim();
      
      const expectedNormalized = expected.name.toLowerCase();
      
      return normalizedName === expectedNormalized;
    });
    
    if (found) {
      const qualityMatch = found.quality === expected.expectedQuality;
      console.log(`✅ ${expected.name}: Encontrado con calidad ${found.quality} ${qualityMatch ? '(✅ CORRECTO)' : `(❌ ESPERADO: ${expected.expectedQuality})`}`);
      console.log(`   Razón: ${expected.reason}`);
    } else {
      console.log(`❌ ${expected.name}: NO ENCONTRADO`);
      console.log(`   Razón: ${expected.reason}`);
    }
    console.log('');
  });
}

// Ejecutar la prueba
testPrefixDeduplication();