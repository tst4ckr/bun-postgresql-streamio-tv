import path from 'path';
import HybridChannelRepository from './src/infrastructure/repositories/HybridChannelRepository.js';
import StreamValidationService from './src/infrastructure/services/StreamValidationService.js';
import Channel from './src/domain/entities/Channel.js';
import TVAddonConfig from './src/infrastructure/config/TVAddonConfig.js';

// Configuración de prueba
const baseConfig = TVAddonConfig.getInstance().getConfig();
const config = {
  ...baseConfig,
  validation: {
    ...baseConfig.validation,
    enableEarlyValidation: true,
    earlyValidationTimeout: 5,
    earlyValidationConcurrency: 10,
    streamValidationMaxRetries: 2,
    streamValidationRetryDelay: 1000
  },
  filters: {
    ...baseConfig.filters,
    religiousKeywords: ['religioso', 'iglesia', 'pastor', 'dios'],
    adultKeywords: ['adult', 'xxx', 'porn'],
    politicalKeywords: ['politico', 'gobierno', 'presidente']
  }
};

// Logger simple para pruebas
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

async function testStreamValidationService() {
  console.log('\n=== Prueba StreamValidationService ===');
  
  const validationService = new StreamValidationService(config, logger);
  
  // Crear canales de prueba usando la clase Channel
  const testChannels = [
    new Channel({
      id: 'tv_test_http_001',
      name: 'Test HTTP Channel',
      streamUrl: 'http://example.com/stream1.m3u8',
      country: 'test',
      language: 'es',
      genre: 'General'
    }),
    new Channel({
      id: 'tv_test_https_002',
      name: 'Test HTTPS Channel', 
      streamUrl: 'https://example.com/stream2.m3u8',
      country: 'test',
      language: 'en',
      genre: 'News'
    }),
    new Channel({
      id: 'tv_test_invalid_003',
      name: 'Test Invalid Channel',
      streamUrl: 'http://invalid-url.com/stream.m3u8',
      country: 'test',
      language: 'fr',
      genre: 'Sports'
    })
  ];
  
  try {
    console.log(`Validando ${testChannels.length} canales...`);
    const validationResult = await validationService.validateChannelsBatch(testChannels);
    
    if (validationResult && validationResult.validChannels && validationResult.invalidChannels) {
      const totalProcessed = validationResult.validChannels.length + validationResult.invalidChannels.length;
      console.log(`Resultados: ${totalProcessed} canales procesados`);
      console.log(`  Válidos: ${validationResult.validChannels.length}`);
      console.log(`  Inválidos: ${validationResult.invalidChannels.length}`);
      
      // Mostrar algunos ejemplos
      validationResult.validChannels.slice(0, 3).forEach((channel, index) => {
        console.log(`  Canal válido ${index + 1}: ${channel.id}`);
      });
      validationResult.invalidChannels.slice(0, 3).forEach((channel, index) => {
        console.log(`  Canal inválido ${index + 1}: ${channel.id}`);
      });
    } else {
      console.log('No se obtuvieron resultados de validación (posiblemente deshabilitada)');
    }
    
    const stats = validationService.getValidationStats();
    console.log('Estadísticas:', stats);
    
  } catch (error) {
    console.error('Error en validación:', error.message);
  }
}

async function testHybridChannelRepository() {
  console.log('\n=== Prueba HybridChannelRepository (Flujo Completo) ===');
  
  const csvPath = './data/channels.csv';
  const m3uSources = ['./data/playlist.m3u'];
  
  try {
    const repository = new HybridChannelRepository(csvPath, m3uSources, config, logger);
    
    console.log('Cargando canales con validación temprana...');
    const channels = await repository.getAllChannels();
    
    console.log(`Total de canales cargados: ${channels.length}`);
    
    // Mostrar algunos ejemplos
    const validChannels = channels.filter(ch => ch.isActive !== false);
    const invalidChannels = channels.filter(ch => ch.isActive === false);
    
    console.log(`Canales válidos: ${validChannels.length}`);
    console.log(`Canales inválidos: ${invalidChannels.length}`);
    
    if (validChannels.length > 0) {
      console.log('Ejemplos de canales válidos:');
      validChannels.slice(0, 3).forEach(ch => {
        console.log(`  - ${ch.id}: ${ch.name} (${ch.streamUrl})`);
      });
    }
    
    if (invalidChannels.length > 0) {
      console.log('Ejemplos de canales inválidos:');
      invalidChannels.slice(0, 3).forEach(ch => {
        console.log(`  - ${ch.id}: ${ch.name} (${ch.streamUrl})`);
      });
    }
    
  } catch (error) {
    console.error('Error en repositorio:', error.message);
  }
}

async function runTests() {
  console.log('Iniciando pruebas de validación temprana...');
  
  try {
    await testStreamValidationService();
    await testHybridChannelRepository();
    
    console.log('\n✅ Pruebas completadas');
  } catch (error) {
    console.error('\n❌ Error en pruebas:', error.message);
    process.exit(1);
  }
}

// Ejecutar pruebas
runTests();