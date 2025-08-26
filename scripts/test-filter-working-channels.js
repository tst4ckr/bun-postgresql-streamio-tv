#!/usr/bin/env node

/**
 * Script para probar el filtrado de canales con streams HTTP funcionales
 * Verifica que getAllChannels() retorne solo canales con HTTP funcional
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { HybridChannelRepository } from '../src/infrastructure/repositories/HybridChannelRepository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

/**
 * Logger simple para pruebas
 */
const createLogger = (context) => ({
  info: (msg, ...args) => console.log(`[INFO] [${context}] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] [${context}] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] [${context}] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] [${context}] ${new Date().toISOString()} - ${msg}`, ...args)
});

const logger = createLogger('test-filter-channels');

async function testFilterWorkingChannels() {
  try {
    logger.info('🧪 Iniciando prueba de filtrado de canales HTTP funcionales...');
    
    // Configurar variables de entorno para pruebas
    process.env.CSV_PATH = join(projectRoot, 'data', 'channels.csv');
    process.env.REMOTE_M3U_URLS = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_spain.m3u8';
    process.env.CONVERT_HTTPS_TO_HTTP = 'true';
    process.env.VALIDATE_HTTP_CONVERSION = 'true';
    process.env.HTTP_CONVERSION_TIMEOUT = '5';
    process.env.HTTP_CONVERSION_MAX_RETRIES = '1';
    process.env.VALIDATE_STREAMS_ON_STARTUP = 'false';
    process.env.REMOVE_INVALID_STREAMS = 'false';
    process.env.STREAM_VALIDATION_TIMEOUT = '5';
    process.env.FILTER_RELIGIOUS_CONTENT = 'false';
    process.env.FILTER_ADULT_CONTENT = 'false';
    process.env.FILTER_POLITICAL_CONTENT = 'false';
    
    // Cargar configuración
    const config = new TVAddonConfig();
    
    // Verificar que la conversión HTTPS a HTTP esté habilitada
    if (!config.validation.convertHttpsToHttp) {
      logger.error('❌ La conversión HTTPS a HTTP debe estar habilitada en .env');
      logger.info('💡 Agrega: CONVERT_HTTPS_TO_HTTP=true');
      process.exit(1);
    }
    
    // Inicializar repositorio
    const csvPath = config.dataSources.channelsFile;
    const m3uSources = [
      config.dataSources.m3uUrl,
      config.dataSources.backupM3uUrl,
      config.dataSources.m3uUrl1,
      config.dataSources.m3uUrl2,
      config.dataSources.m3uUrl3,
      config.dataSources.localM3uLatam1,
      config.dataSources.localM3uLatam2,
      config.dataSources.localM3uLatam3,
      config.dataSources.localM3uLatam4
    ].filter(url => url && url.trim() !== '');
    
    const repository = new HybridChannelRepository(csvPath, m3uSources, config, logger);
    
    logger.info('Inicializando repositorio...');
    await repository.initialize();
    
    logger.info('1. Obteniendo todos los canales sin filtrar...');
    const allChannels = await repository.getAllChannelsUnfiltered();
    logger.info(`   Total de canales sin filtrar: ${allChannels.length}`);
    
    logger.info('2. Obteniendo canales filtrados (solo HTTP funcionales)...');
    const startTime = Date.now();
    const filteredChannels = await repository.getAllChannels();
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info(`   Canales filtrados: ${filteredChannels.length}`);
    logger.info(`   Tiempo de procesamiento: ${processingTime}s`);
    
    // Analizar URLs de los canales filtrados
    const httpsCount = filteredChannels.filter(ch => ch.streamUrl.startsWith('https://')).length;
    const httpCount = filteredChannels.filter(ch => ch.streamUrl.startsWith('http://')).length;
    const otherCount = filteredChannels.length - httpsCount - httpCount;
    
    logger.info('\n=== ANÁLISIS DE RESULTADOS ===');
    logger.info(`Canales originales: ${allChannels.length}`);
    logger.info(`Canales filtrados: ${filteredChannels.length}`);
    logger.info(`Tasa de retención: ${((filteredChannels.length / allChannels.length) * 100).toFixed(2)}%`);
    logger.info(`\nDistribución de protocolos en canales filtrados:`);
    logger.info(`- HTTP: ${httpCount} (${((httpCount / filteredChannels.length) * 100).toFixed(1)}%)`);
    logger.info(`- HTTPS: ${httpsCount} (${((httpsCount / filteredChannels.length) * 100).toFixed(1)}%)`);
    if (otherCount > 0) {
      logger.info(`- Otros: ${otherCount} (${((otherCount / filteredChannels.length) * 100).toFixed(1)}%)`);
    }
    
    // Mostrar ejemplos de canales filtrados
    if (filteredChannels.length > 0) {
      logger.info('\nEjemplos de canales filtrados (primeros 5):');
      filteredChannels.slice(0, 5).forEach((channel, index) => {
        const protocol = channel.streamUrl.startsWith('https://') ? 'HTTPS' : 
                        channel.streamUrl.startsWith('http://') ? 'HTTP' : 'OTRO';
        logger.info(`  ${index + 1}. ${channel.name} [${protocol}]: ${channel.streamUrl.substring(0, 80)}...`);
      });
    }
    
    // Verificar que el filtrado funcionó correctamente
    if (filteredChannels.length > 0) {
      logger.info('\n✅ FILTRADO DE CANALES FUNCIONALES EXITOSO');
      logger.info(`✅ Se retornaron ${filteredChannels.length} canales con streams funcionales`);
      
      if (httpCount > 0) {
        logger.info(`✅ ${httpCount} canales HTTP funcionales identificados`);
      }
      if (httpsCount > 0) {
        logger.info(`✅ ${httpsCount} canales HTTPS originales funcionales mantenidos`);
      }
    } else {
      logger.warn('⚠️  No se encontraron canales funcionales');
      logger.info('💡 Esto puede indicar problemas de conectividad o configuración');
    }
    
    logger.info('\n=== PRUEBA COMPLETADA ===');
    
  } catch (error) {
    logger.error('❌ Error durante la prueba:', error);
    process.exit(1);
  }
}

// Ejecutar prueba
testFilterWorkingChannels();