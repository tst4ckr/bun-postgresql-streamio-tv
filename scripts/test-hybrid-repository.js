#!/usr/bin/env node
/**
 * @fileoverview Script de prueba para el repositorio híbrido
 * Verifica que los canales se cargan correctamente desde CSV + M3U URLs
 */

import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { ChannelRepositoryFactory } from '../src/infrastructure/factories/ChannelRepositoryFactory.js';

/**
 * Prueba el repositorio híbrido
 */
async function testHybridRepository() {
  const logger = console;
  
  try {
    logger.info('=== INICIANDO PRUEBA DEL REPOSITORIO HÍBRIDO ===');
    
    // Obtener configuración
    const config = TVAddonConfig.getInstance();
    const { dataSources } = config.getAll();
    
    logger.info('Configuración de fuentes de datos:');
    logger.info(`- Fuente: ${dataSources.channelsSource}`);
    logger.info(`- Archivo CSV: ${dataSources.channelsFile}`);
    logger.info(`- URL M3U: ${dataSources.m3uUrl || 'No configurada'}`);
    logger.info(`- URL M3U Backup: ${dataSources.backupM3uUrl || 'No configurada'}`);
    
    // Verificar si está configurado como híbrido
    if (dataSources.channelsSource !== 'hybrid') {
      logger.warn(`Fuente configurada como '${dataSources.channelsSource}', no como 'hybrid'`);
      logger.info('Para probar el repositorio híbrido, configure CHANNELS_SOURCE=hybrid en .env');
      return;
    }
    
    // Crear repositorio híbrido
    logger.info('\nCreando repositorio híbrido...');
    const repository = await ChannelRepositoryFactory.createRepository(config, logger);
    
    // Obtener estadísticas del repositorio
    logger.info('\nObteniendo estadísticas del repositorio...');
    const stats = await repository.getRepositoryStats();
    
    logger.info('=== ESTADÍSTICAS DEL REPOSITORIO HÍBRIDO ===');
    logger.info(`Total de canales: ${stats.totalChannels}`);
    logger.info(`Canales activos: ${stats.activeChannels}`);
    logger.info(`Canales desactivados: ${stats.deactivatedChannels}`);
    logger.info(`Canales desde CSV: ${stats.csvChannels}`);
    logger.info(`Canales desde M3U: ${stats.m3uChannelsTotal}`);
    logger.info(`Duplicados omitidos: ${stats.duplicatesOmitted}`);
    logger.info(`Fuentes CSV: ${stats.sources.csv}`);
    logger.info(`Fuentes M3U: ${stats.sources.m3u}`);
    logger.info(`Último refresco: ${stats.lastRefresh}`);
    
    // Probar métodos de acceso
    logger.info('\n=== PROBANDO MÉTODOS DE ACCESO ===');
    
    // Obtener todos los canales (filtrados)
    const allChannels = await repository.getAllChannels();
    logger.info(`getAllChannels(): ${allChannels.length} canales`);
    
    // Obtener todos los canales (sin filtrar)
    const allChannelsUnfiltered = await repository.getAllChannelsUnfiltered();
    logger.info(`getAllChannelsUnfiltered(): ${allChannelsUnfiltered.length} canales`);
    
    // Obtener canales paginados
    const paginatedChannels = await repository.getChannelsPaginated(0, 10);
    logger.info(`getChannelsPaginated(0, 10): ${paginatedChannels.length} canales`);
    
    // Obtener canales paginados sin filtrar
    const paginatedUnfiltered = await repository.getChannelsPaginatedUnfiltered(0, 10);
    logger.info(`getChannelsPaginatedUnfiltered(0, 10): ${paginatedUnfiltered.length} canales`);
    
    // Mostrar muestra de canales
    if (allChannels.length > 0) {
      logger.info('\n=== MUESTRA DE CANALES ===');
      const sample = allChannels.slice(0, 5);
      sample.forEach((channel, index) => {
        logger.info(`${index + 1}. ${channel.name} (${channel.country}) - ${channel.genre}`);
        logger.info(`   URL: ${channel.url}`);
        logger.info(`   ID: ${channel.id}`);
      });
    }
    
    // Probar búsqueda
    logger.info('\n=== PROBANDO BÚSQUEDA ===');
    const searchResults = await repository.searchChannels('news');
    logger.info(`Búsqueda 'news': ${searchResults.length} resultados`);
    
    // Probar filtros por país
    const mexicanChannels = await repository.getChannelsByCountry('Mexico');
    logger.info(`Canales de México: ${mexicanChannels.length}`);
    
    const peruvianChannels = await repository.getChannelsByCountry('Peru');
    logger.info(`Canales de Perú: ${peruvianChannels.length}`);
    
    // Probar filtros por género
    const newsChannels = await repository.getChannelsByGenre('News');
    logger.info(`Canales de noticias: ${newsChannels.length}`);
    
    // Verificar integridad de datos
    logger.info('\n=== VERIFICACIÓN DE INTEGRIDAD ===');
    const channelIds = new Set();
    let duplicateIds = 0;
    
    allChannelsUnfiltered.forEach(channel => {
      if (channelIds.has(channel.id)) {
        duplicateIds++;
        logger.warn(`ID duplicado encontrado: ${channel.id} - ${channel.name}`);
      } else {
        channelIds.add(channel.id);
      }
    });
    
    if (duplicateIds === 0) {
      logger.info('✅ No se encontraron IDs duplicados');
    } else {
      logger.error(`❌ Se encontraron ${duplicateIds} IDs duplicados`);
    }
    
    // Verificar URLs válidas
    let invalidUrls = 0;
    allChannelsUnfiltered.forEach(channel => {
      if (!channel.url || (!channel.url.startsWith('http') && !channel.url.startsWith('rtmp'))) {
        invalidUrls++;
        logger.warn(`URL inválida: ${channel.name} - ${channel.url}`);
      }
    });
    
    if (invalidUrls === 0) {
      logger.info('✅ Todas las URLs son válidas');
    } else {
      logger.warn(`⚠️ Se encontraron ${invalidUrls} URLs inválidas`);
    }
    
    logger.info('\n=== PRUEBA COMPLETADA EXITOSAMENTE ===');
    
  } catch (error) {
    logger.error('Error durante la prueba del repositorio híbrido:', error);
    process.exit(1);
  }
}

// Ejecutar la prueba
testHybridRepository().catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});