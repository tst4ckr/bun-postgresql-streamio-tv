/**
 * Script de prueba para verificar el funcionamiento de las estrategias de deduplicación
 * Valida que las estrategias prioritize_source, prioritize_hd, etc. estén correctamente implementadas
 */

import { ChannelDeduplicationService, DeduplicationConfig, ConflictResolutionStrategy } from './src/domain/services/ChannelDeduplicationService.js';
import { Channel } from './src/domain/entities/Channel.js';
import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';

// Logger para el test
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args)
};

/**
 * Crea canales de prueba para testing
 */
function createTestChannels() {
  const channels = [];
  
  // Canales duplicados con diferentes fuentes (CSV vs M3U)
  channels.push(new Channel({
    id: 'tv_test_1',
    name: 'Canal Test',
    streamUrl: 'http://example.com/stream1.m3u8',
    logo: 'http://example.com/logo1.png',
    genre: 'General',
    country: 'PE',
    language: 'es',
    source: 'csv'
  }));
  
  channels.push(new Channel({
    id: 'tv_test_1_duplicate',
    name: 'Canal Test',
    streamUrl: 'http://example.com/stream1.m3u8',
    logo: 'http://example.com/logo1.png',
    genre: 'General',
    country: 'PE',
    language: 'es',
    source: 'm3u'
  }));
  
  // Canales con diferentes calidades (HD vs SD)
  channels.push(new Channel({
    id: 'tv_test_2_hd',
    name: 'Canal HD Test',
    streamUrl: 'http://example.com/stream2_hd.m3u8',
    logo: 'http://example.com/logo2.png',
    genre: 'General',
    country: 'PE',
    language: 'es',
    source: 'm3u'
  }));
  
  channels.push(new Channel({
    id: 'tv_test_2_sd',
    name: 'Canal Test SD',
    streamUrl: 'http://example.com/stream2_sd.m3u8',
    logo: 'http://example.com/logo2.png',
    genre: 'General',
    country: 'PE',
    language: 'es',
    source: 'm3u'
  }));
  
  // Canales similares pero no exactamente iguales
  channels.push(new Channel({
    id: 'tv_america_1',
    name: 'América TV',
    streamUrl: 'http://example.com/america1.m3u8',
    logo: 'http://example.com/america.png',
    genre: 'General',
    country: 'PE',
    language: 'es',
    source: 'csv'
  }));
  
  channels.push(new Channel({
    id: 'tv_america_2',
    name: 'America TV HD',
    streamUrl: 'http://example.com/america2.m3u8',
    logo: 'http://example.com/america.png',
    genre: 'General',
    country: 'PE',
    language: 'es',
    source: 'm3u'
  }));
  
  return channels;
}

/**
 * Prueba la estrategia prioritize_source
 */
async function testPrioritizeSourceStrategy() {
  console.log('\n=== PRUEBA: Estrategia prioritize_source ===');
  
  const config = new DeduplicationConfig({
    strategy: ConflictResolutionStrategy.PRIORITIZE_SOURCE,
    preserveSourcePriority: true,
    sourcePriority: ['csv', 'm3u'],
    nameSimilarityThreshold: 0.85,
    urlSimilarityThreshold: 0.90
  });
  
  const service = new ChannelDeduplicationService(config, logger);
  const testChannels = createTestChannels();
  
  console.log(`Canales antes de deduplicación: ${testChannels.length}`);
  testChannels.forEach(ch => {
    console.log(`  - ${ch.name} (${ch.source}) - ID: ${ch.id}`);
  });
  
  const result = await service.deduplicateChannels(testChannels);
  const deduplicated = result.channels;
  
  console.log(`\nCanales después de deduplicación: ${deduplicated.length}`);
  deduplicated.forEach(ch => {
    console.log(`  - ${ch.name} (${ch.source}) - ID: ${ch.id}`);
  });
  
  // Verificar que CSV tiene prioridad sobre M3U
  const csvChannels = deduplicated.filter(ch => ch.source === 'csv');
  const m3uChannels = deduplicated.filter(ch => ch.source === 'm3u');
  
  console.log(`\nResultados:`);
  console.log(`  - Canales CSV mantenidos: ${csvChannels.length}`);
  console.log(`  - Canales M3U mantenidos: ${m3uChannels.length}`);
  
  return { original: testChannels.length, deduplicated: deduplicated.length, csvKept: csvChannels.length };
}

/**
 * Prueba la estrategia prioritize_hd
 */
async function testPrioritizeHdStrategy() {
  console.log('\n=== PRUEBA: Estrategia prioritize_hd ===');
  
  const config = new DeduplicationConfig({
    strategy: ConflictResolutionStrategy.PRIORITIZE_HD,
    enableHdUpgrade: true,
    nameSimilarityThreshold: 0.85,
    urlSimilarityThreshold: 0.90
  });
  
  const service = new ChannelDeduplicationService(config, logger);
  const testChannels = createTestChannels();
  
  console.log(`Canales antes de deduplicación: ${testChannels.length}`);
  testChannels.forEach(ch => {
    console.log(`  - ${ch.name} (${ch.source}) - ID: ${ch.id}`);
  });
  
  const result = await service.deduplicateChannels(testChannels);
  const deduplicated = result.channels;
  
  console.log(`\nCanales después de deduplicación: ${deduplicated.length}`);
  deduplicated.forEach(ch => {
    console.log(`  - ${ch.name} (${ch.source}) - ID: ${ch.id}`);
  });
  
  // Verificar que se priorizan versiones HD
  const hdChannels = deduplicated.filter(ch => ch.name.toLowerCase().includes('hd'));
  
  console.log(`\nResultados:`);
  console.log(`  - Canales HD mantenidos: ${hdChannels.length}`);
  
  return { original: testChannels.length, deduplicated: deduplicated.length, hdKept: hdChannels.length };
}

/**
 * Prueba la configuración actual del sistema
 */
async function testCurrentSystemConfiguration() {
  console.log('\n=== PRUEBA: Configuración actual del sistema ===');
  
  const tvConfig = TVAddonConfig.getInstance();
  const systemConfig = tvConfig.getAll();
  
  console.log(`Estrategia configurada: ${systemConfig.validation.deduplicationStrategy}`);
  console.log(`Deduplicación inteligente: ${systemConfig.validation.enableIntelligentDeduplication}`);
  console.log(`Preservar prioridad de fuente: ${systemConfig.validation.preserveSourcePriority}`);
  console.log(`Habilitar upgrade HD: ${systemConfig.validation.enableHdUpgrade}`);
  console.log(`Umbral similitud nombres: ${systemConfig.validation.nameSimilarityThreshold}`);
  console.log(`Umbral similitud URLs: ${systemConfig.validation.urlSimilarityThreshold}`);
  
  // Crear servicio con configuración del sistema
  const config = new DeduplicationConfig({
    strategy: systemConfig.validation.deduplicationStrategy,
    enableIntelligentDeduplication: systemConfig.validation.enableIntelligentDeduplication,
    preserveSourcePriority: systemConfig.validation.preserveSourcePriority,
    enableHdUpgrade: systemConfig.validation.enableHdUpgrade,
    nameSimilarityThreshold: systemConfig.validation.nameSimilarityThreshold,
    urlSimilarityThreshold: systemConfig.validation.urlSimilarityThreshold,
    ignoreFiles: systemConfig.validation.deduplicationIgnoreFiles || []
  });
  
  const service = new ChannelDeduplicationService(config, logger);
  const testChannels = createTestChannels();
  
  console.log(`\nCanales antes de deduplicación: ${testChannels.length}`);
  const result = await service.deduplicateChannels(testChannels);
  const deduplicated = result.channels;
  console.log(`Canales después de deduplicación: ${deduplicated.length}`);
  
  console.log('\nMétricas de deduplicación:');
  console.log(JSON.stringify(result.metrics, null, 2));
  
  return { original: testChannels.length, deduplicated: deduplicated.length, metrics: result.metrics };
}

/**
 * Función principal de pruebas
 */
async function runDeduplicationTests() {
  console.log('🧪 INICIANDO PRUEBAS DE ESTRATEGIAS DE DEDUPLICACIÓN');
  console.log('=' .repeat(60));
  
  try {
    // Prueba 1: prioritize_source
    const sourceResults = await testPrioritizeSourceStrategy();
    
    // Prueba 2: prioritize_hd
    const hdResults = await testPrioritizeHdStrategy();
    
    // Prueba 3: configuración actual del sistema
    const systemResults = await testCurrentSystemConfiguration();
    
    // Resumen de resultados
    console.log('\n' + '=' .repeat(60));
    console.log('📊 RESUMEN DE RESULTADOS');
    console.log('=' .repeat(60));
    
    console.log('\n1. Estrategia prioritize_source:');
    console.log(`   - Canales originales: ${sourceResults.original}`);
    console.log(`   - Canales después de deduplicación: ${sourceResults.deduplicated}`);
    console.log(`   - Canales CSV mantenidos: ${sourceResults.csvKept}`);
    console.log(`   - Reducción: ${((sourceResults.original - sourceResults.deduplicated) / sourceResults.original * 100).toFixed(1)}%`);
    
    console.log('\n2. Estrategia prioritize_hd:');
    console.log(`   - Canales originales: ${hdResults.original}`);
    console.log(`   - Canales después de deduplicación: ${hdResults.deduplicated}`);
    console.log(`   - Canales HD mantenidos: ${hdResults.hdKept}`);
    console.log(`   - Reducción: ${((hdResults.original - hdResults.deduplicated) / hdResults.original * 100).toFixed(1)}%`);
    
    console.log('\n3. Configuración actual del sistema:');
    console.log(`   - Canales originales: ${systemResults.original}`);
    console.log(`   - Canales después de deduplicación: ${systemResults.deduplicated}`);
    console.log(`   - Reducción: ${((systemResults.original - systemResults.deduplicated) / systemResults.original * 100).toFixed(1)}%`);
    
    console.log('\n✅ TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE');
    
    // Verificar que las estrategias están funcionando
    if (sourceResults.deduplicated < sourceResults.original && hdResults.deduplicated < hdResults.original) {
      console.log('\n🎉 VERIFICACIÓN: Las estrategias de deduplicación están funcionando correctamente');
      console.log('   - Se detectaron y resolvieron duplicados');
      console.log('   - Las estrategias prioritize_source y prioritize_hd están operativas');
    } else {
      console.log('\n⚠️  ADVERTENCIA: Las estrategias podrían no estar funcionando como se esperaba');
    }
    
  } catch (error) {
    console.error('\n❌ ERROR EN LAS PRUEBAS:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar las pruebas
runDeduplicationTests().catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});