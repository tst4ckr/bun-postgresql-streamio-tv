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

async function debugHDReverseFlow() {
  console.log('🔍 DEBUG: Flujo HD → SD (orden inverso)\n');
  
  // Caso de prueba: CARACOL TV (HD primero, luego SD)
  const channels = [
    createTestChannel('caracol_hd', 'CARACOL TV HD', 'http://caracol-hd.com'),
    createTestChannel('caracol_sd', 'CARACOL TV SD_IN', 'http://caracol-sd.com')
  ];
  
  console.log('📋 Canales de entrada (HD primero):');
  channels.forEach((ch, i) => {
    console.log(`  ${i + 1}. ${ch.name} (${ch.id})`);
  });
  console.log();
  
  // Ejecutar deduplicación
  console.log('🚀 Ejecutando deduplicación...');
  
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
    
    // Verificar que el canal HD se mantiene
    const hdChannel = result.channels.find(ch => ch.name.includes('HD'));
    const sdChannel = result.channels.find(ch => ch.name.includes('SD'));
    
    if (hdChannel && !sdChannel) {
      console.log('\n✅ ÉXITO: Canal HD mantenido, canal SD eliminado');
    } else if (sdChannel && !hdChannel) {
      console.log('\n❌ ERROR: Canal SD mantenido, canal HD eliminado');
    } else {
      console.log('\n⚠️ INESPERADO: Ambos canales presentes o ninguno');
    }
    
  } catch (error) {
    console.error('\n❌ Error durante la deduplicación:', error.message);
  }
}

// Ejecutar debug
debugHDReverseFlow().catch(console.error);