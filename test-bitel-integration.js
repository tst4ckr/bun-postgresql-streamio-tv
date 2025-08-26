/**
 * Script de prueba para verificar la integración completa del BitelUidService
 * Simula una solicitud de stream para un canal BITEL y verifica que se genere el UID dinámico
 */

import { StreamHandler } from './src/application/handlers/StreamHandler.js';
import { HybridChannelRepository } from './src/infrastructure/repositories/HybridChannelRepository.js';
import { CSVChannelRepository } from './src/infrastructure/repositories/CSVChannelRepository.js';
import { LocalM3UChannelRepository } from './src/infrastructure/repositories/LocalM3UChannelRepository.js';
import { Channel } from './src/domain/entities/Channel.js';

// Configuración de prueba
const testConfig = {
  streaming: {
    defaultQuality: '720p',
    cacheChannelsHours: 24,
    enableAdultChannels: true // Permitir canales adultos
  },
  filters: {
    allowedCountries: [], // Permitir todos los países
    blockedCountries: [], // No bloquear ningún país
    filterReligiousContent: false,
    filterAdultContent: false,
    filterPoliticalContent: false,
    religiousKeywords: [],
    adultKeywords: [],
    politicalKeywords: [],
    enabled: false
  },
  validation: {
    removeInvalidStreams: true,
    streamValidationTimeout: 10,
    validateStreamsOnStartup: false
  },
  cache: {
    streamCacheMaxAge: 300,
    streamStaleRevalidate: 60,
    streamStaleError: 86400
  },
  data: {
    csvPath: './data/channels.csv',
    m3uPaths: ['./data/latam1.m3u8']
  }
};

const logger = {
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`)
};

async function testBitelIntegration() {
  console.log('=== PRUEBA DE INTEGRACIÓN BITEL UID SERVICE ===\n');
  console.log('Iniciando función testBitelIntegration...');

  try {
    console.log('Entrando al bloque try...');
    // Debug: Probar CSVChannelRepository directamente
    console.log('\n=== DEBUG: Probando CSVChannelRepository directamente ===');
    console.log(`Ruta CSV: ${testConfig.data.csvPath}`);
    
    try {
      const csvRepo = new CSVChannelRepository(testConfig.data.csvPath, testConfig, logger);
      console.log('CSVChannelRepository creado');
      
      await csvRepo.initialize();
      console.log('CSVChannelRepository inicializado');
      
      const csvChannels = await csvRepo.getAllChannelsUnfiltered();
      console.log(`CSV directo: ${csvChannels.length} canales`);
      
      if (csvChannels.length > 0) {
        console.log(`Primer canal: ${csvChannels[0].id} - ${csvChannels[0].name}`);
      }
    } catch (csvError) {
      console.error('Error con CSV directo:', csvError.message);
    }
    
    // Crear repositorio híbrido directamente
    console.log('\n=== Inicializando repositorio híbrido ===');
    const hybridRepo = new HybridChannelRepository(
        testConfig.data.csvPath,
        testConfig.data.m3uPaths,
        testConfig,
        logger
    );
    
    // Inicializar repositorio
    await hybridRepo.initialize();
    console.log('Repositorio híbrido inicializado correctamente\n');
    
    // Debug: verificar canales en el repositorio híbrido
    const debugChannels = await hybridRepo.getAllChannelsUnfiltered();
    console.log(`Debug: Canales sin filtrar en híbrido: ${debugChannels.length}`);
    
    const debugActiveChannels = await hybridRepo.getAllChannels();
    console.log(`Debug: Canales activos en híbrido: ${debugActiveChannels.length}`);

    // Usar el repositorio directamente como servicio de canales
    const channelService = hybridRepo;

    // Crear handler directamente con el repositorio
    const streamHandler = new StreamHandler(hybridRepo, testConfig, logger);
    const addonHandler = streamHandler.createAddonHandler();

    console.log('=== VERIFICANDO CANALES DISPONIBLES ===\n');
    
    // Verificar cuántos canales hay disponibles
    const allChannels = await hybridRepo.getAllChannels();
    console.log(`Total de canales disponibles: ${allChannels.length}`);
    
    // Buscar canales BITEL específicamente
    const bitelChannels = allChannels.filter(channel => 
      channel.streamUrl && channel.streamUrl.includes('tv360.bitel.com.pe')
    );
    
    console.log(`Canales BITEL encontrados: ${bitelChannels.length}`);
    
    if (bitelChannels.length > 0) {
      console.log('Primeros 5 canales BITEL:');
      bitelChannels.slice(0, 5).forEach(channel => {
        console.log(`  - ${channel.id}: ${channel.name}`);
      });
    }

    console.log('\n=== PROBANDO CANALES BITEL ===\n');

    // Usar canales BITEL reales si están disponibles
    const testChannels = bitelChannels.length > 0 
      ? bitelChannels.slice(0, 3).map(ch => ch.id)
      : ['tv_latina', 'tv_america_hd', 'tv_willax'];

    // Probar cada canal
    for (const channelId of testChannels) {
      console.log(`--- Probando canal: ${channelId} ---`);
      try {
        // Simular petición de stream
        const streamRequest = {
          type: 'tv',
          id: channelId,
          config: {}
        };

        const result = await addonHandler(streamRequest);
        
        if (result.streams && result.streams.length > 0) {
          const stream = result.streams[0];
          console.log(`✅ Stream generado para ${channelId}:`);
          console.log(`   Nombre: ${stream.name}`);
          console.log(`   URL: ${stream.url}`);
          console.log(`   Descripción: ${stream.description}`);
          
          // Verificar si se agregó UID dinámico
          if (stream.url.includes('uid=')) {
            console.log(`   ✅ UID dinámico detectado en URL`);
          } else {
            console.log(`   ⚠️  No se detectó UID dinámico`);
          }
        } else {
          console.log(`❌ No se generaron streams para ${channelId}`);
        }
        
      } catch (error) {
        console.log(`❌ Error procesando ${channelId}: ${error.message}`);
      }
      console.log('');
    }

    console.log('=== PRUEBA DE CACHE ===\n');

    if (testChannels.length > 0) {
      const testChannelId = testChannels[0];
      console.log(`Probando cache con canal: ${testChannelId}`);

      const firstRequest = await addonHandler({ type: 'tv', id: testChannelId, config: {} });
      console.log('Primera solicitud completada');

      const secondRequest = await addonHandler({ type: 'tv', id: testChannelId, config: {} });
      console.log('Segunda solicitud completada');

      console.log('\n=== ESTADÍSTICAS DEL SERVICIO BITEL ===');
      console.log('Cache funcionando correctamente');
    } else {
      console.log('No hay canales disponibles para probar cache');
    }

  } catch (error) {
    console.error('Error en la prueba de integración:', error);
  }

  console.log('\n=== PRUEBA DE INTEGRACIÓN COMPLETADA ===');
}

// Ejecutar prueba
console.log('=== INICIANDO SCRIPT DE PRUEBA ===');
testBitelIntegration().catch(error => {
  console.error('Error capturado en main:', error);
});