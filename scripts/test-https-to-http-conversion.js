#!/usr/bin/env node

/**
 * @fileoverview Script de prueba para conversión HTTPS a HTTP
 * Verifica que el sistema de conversión automática funcione correctamente
 */

console.log('=== INICIANDO PRUEBA DE CONVERSIÓN HTTPS A HTTP ===');

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

/**
 * Función principal de prueba
 */
async function testHttpsToHttpConversion() {
  const logger = createLogger('test-https-conversion');
  
  try {
    console.log('\n1. Configurando variables de entorno...');
    
    // Configuración temporal para pruebas
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
    
    console.log('2. Creando configuración...');
    const config = new TVAddonConfig();
    
    console.log('3. Verificando configuración de conversión:');
    console.log(`- Conversión habilitada: ${config.validation.convertHttpsToHttp}`);
    console.log(`- Validación habilitada: ${config.validation.validateHttpConversion}`);
    console.log(`- Timeout: ${config.validation.httpConversionTimeout}s`);
    console.log(`- Max reintentos: ${config.validation.httpConversionMaxRetries}`);
    
    console.log('4. Creando repositorio híbrido...');
    const csvPath = config.dataSources.channelsFile;
    
    // Construir array de fuentes M3U desde la configuración
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
    
    console.log(`- CSV: ${csvPath}`);
    console.log(`- M3U fuentes: ${m3uSources.length} configuradas`);
    if (m3uSources.length > 0) {
      console.log(`- Fuentes M3U: ${m3uSources.join(', ')}`);
    }
    
    const repository = new HybridChannelRepository(csvPath, m3uSources, config, logger);
    
    console.log('5. Inicializando repositorio...');
    await repository.initialize();
    
    console.log('6. Obteniendo estadísticas iniciales...');
    const statsBefore = await repository.getRepositoryStats();
    console.log(`- Total canales: ${statsBefore.totalChannels}`);
    console.log(`- CSV: ${statsBefore.csvChannels}`);
    console.log(`- M3U remotas: ${statsBefore.remoteM3uChannels}`);
    
    console.log('7. Analizando URLs antes de conversión...');
    const allChannelsUnfiltered = await repository.getAllChannelsUnfiltered();
    const httpsChannels = allChannelsUnfiltered.filter(ch => ch.streamUrl.startsWith('https://'));
    const httpChannels = allChannelsUnfiltered.filter(ch => ch.streamUrl.startsWith('http://'));
    
    console.log(`- Total canales: ${allChannelsUnfiltered.length}`);
    console.log(`- Canales HTTPS: ${httpsChannels.length}`);
    console.log(`- Canales HTTP: ${httpChannels.length}`);
    
    if (httpsChannels.length > 0) {
      console.log('\nEjemplos de URLs HTTPS encontradas:');
      httpsChannels.slice(0, 3).forEach((ch, i) => {
        console.log(`  ${i + 1}. ${ch.name}: ${ch.streamUrl}`);
      });
    }
    
    console.log('\n8. Aplicando conversión HTTPS a HTTP...');
    const startTime = Date.now();
    
    const convertedChannels = await repository.getAllChannels();
    
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;
    
    console.log('\n9. Analizando resultados...');
    console.log(`- Tiempo de procesamiento: ${processingTime.toFixed(2)}s`);
    console.log(`- Canales finales: ${convertedChannels.length}`);
    
    const finalHttpsChannels = convertedChannels.filter(ch => ch.streamUrl.startsWith('https://'));
    const finalHttpChannels = convertedChannels.filter(ch => ch.streamUrl.startsWith('http://'));
    
    console.log(`- URLs finales HTTPS: ${finalHttpsChannels.length}`);
    console.log(`- URLs finales HTTP: ${finalHttpChannels.length}`);
    
    if (finalHttpChannels.length > 0) {
      console.log('\nEjemplos de conversiones exitosas:');
      finalHttpChannels.slice(0, 3).forEach((ch, i) => {
        console.log(`  ${i + 1}. ${ch.name}: ${ch.streamUrl}`);
      });
    }
    
    // Calcular estadísticas
    const conversionRate = httpsChannels.length > 0 
      ? ((httpsChannels.length - finalHttpsChannels.length) / httpsChannels.length * 100).toFixed(2)
      : 0;
    
    const retentionRate = allChannelsUnfiltered.length > 0
      ? (convertedChannels.length / allChannelsUnfiltered.length * 100).toFixed(2)
      : 0;
    
    console.log('\n=== ESTADÍSTICAS FINALES ===');
    console.log(`Tasa de conversión: ${conversionRate}% (${httpsChannels.length - finalHttpsChannels.length}/${httpsChannels.length})`);
    console.log(`Tasa de retención: ${retentionRate}% (${convertedChannels.length}/${allChannelsUnfiltered.length})`);
    
    // Verificar funcionalidad
    if (config.validation.convertHttpsToHttp && httpsChannels.length > 0) {
      if (finalHttpChannels.length > 0) {
        console.log('\n✅ CONVERSIÓN HTTPS A HTTP FUNCIONANDO CORRECTAMENTE');
      } else {
        console.log('\n⚠️  CONVERSIÓN HABILITADA PERO NO SE ENCONTRARON CONVERSIONES EXITOSAS');
      }
    } else if (!config.validation.convertHttpsToHttp) {
      console.log('\nℹ️  CONVERSIÓN HTTPS A HTTP DESHABILITADA');
    } else {
      console.log('\nℹ️  NO SE ENCONTRARON CANALES HTTPS PARA CONVERTIR');
    }
    
    console.log('\n=== PRUEBA COMPLETADA EXITOSAMENTE ===');
    
  } catch (error) {
    console.error('\n❌ Error durante la prueba:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Ejecutar prueba
testHttpsToHttpConversion()
  .then(() => {
    console.log('\n✅ Prueba de conversión HTTPS a HTTP completada');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error en la prueba:', error);
    process.exit(1);
  });