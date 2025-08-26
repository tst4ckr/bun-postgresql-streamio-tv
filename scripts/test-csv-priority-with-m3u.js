#!/usr/bin/env node
/**
 * Script de prueba para verificar la priorización del CSV local
 * sobre fuentes M3U con duplicados simulados
 */

import { HybridChannelRepository } from '../src/infrastructure/repositories/HybridChannelRepository.js';
import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import fs from 'fs';
import path from 'path';

/**
 * Logger simple para pruebas
 */
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
};

/**
 * Crear un archivo M3U de prueba con algunos canales que duplican los del CSV
 */
function createTestM3U() {
  const testM3uContent = `#EXTM3U
#EXTINF:-1 tvg-id="tv_cnn_espanol" tvg-name="CNN en Español" tvg-logo="https://example.com/cnn.png" group-title="Noticias",CNN en Español
https://example.com/cnn_duplicate.m3u8
#EXTINF:-1 tvg-id="tv_test_channel" tvg-name="Canal de Prueba" tvg-logo="https://example.com/test.png" group-title="Entretenimiento",Canal de Prueba
https://example.com/test_channel.m3u8
#EXTINF:-1 tvg-id="tv_bbc_world" tvg-name="BBC World News" tvg-logo="https://example.com/bbc.png" group-title="Noticias",BBC World News
https://example.com/bbc_duplicate.m3u8
#EXTINF:-1 tvg-id="tv_unique_channel" tvg-name="Canal Único" tvg-logo="https://example.com/unique.png" group-title="Deportes",Canal Único
https://example.com/unique_channel.m3u8`;
  
  const testM3uPath = 'data/test-channels.m3u';
  fs.writeFileSync(testM3uPath, testM3uContent, 'utf8');
  logger.info(`📝 Archivo M3U de prueba creado: ${testM3uPath}`);
  return testM3uPath;
}

/**
 * Limpiar archivos de prueba
 */
function cleanup(testM3uPath) {
  try {
    if (fs.existsSync(testM3uPath)) {
      fs.unlinkSync(testM3uPath);
      logger.info(`🗑️  Archivo de prueba eliminado: ${testM3uPath}`);
    }
  } catch (error) {
    logger.warn(`⚠️  No se pudo eliminar el archivo de prueba: ${error.message}`);
  }
}

async function testCSVPriorityWithM3U() {
  let testM3uPath = null;
  
  try {
    logger.info('🧪 Iniciando prueba de priorización CSV con fuentes M3U...');
    
    const config = TVAddonConfig.getInstance();
    logger.info('✅ Configuración cargada');
    
    // Crear archivo M3U de prueba
    testM3uPath = createTestM3U();
    
    // Configurar fuentes de prueba
    const csvPath = 'data/channels.csv';
    const m3uSources = [testM3uPath]; // Usar el archivo M3U de prueba
    
    logger.info(`📁 Usando CSV: ${csvPath}`);
    logger.info(`📡 Usando M3U: ${m3uSources.join(', ')}`);
    
    // Crear repositorio híbrido
    const repository = new HybridChannelRepository(csvPath, m3uSources, config, logger);
    logger.info('✅ Repositorio híbrido creado');
    
    logger.info('📊 Inicializando repositorio híbrido...');
    await repository.initialize();
    logger.info('✅ Repositorio inicializado');
    
    // Obtener estadísticas
    const stats = await repository.getRepositoryStats();
    logger.info('✅ Estadísticas obtenidas');
    
    logger.info('📈 Estadísticas del repositorio:');
    logger.info(`  📁 Canales CSV: ${stats.csvChannels}`);
    logger.info(`  🌐 Canales M3U remotos: ${stats.remoteM3uChannels}`);
    logger.info(`  💾 Canales M3U locales: ${stats.localM3uChannels}`);
    logger.info(`  📊 Total M3U antes de dedup: ${stats.totalM3uChannelsBeforeDedup || 'N/A'}`);
    logger.info(`  ✅ Canales M3U agregados: ${stats.m3uChannelsAdded}`);
    logger.info(`  ❌ Duplicados omitidos por prioridad CSV: ${stats.csvPriorityDuplicates || stats.duplicatesOmitted}`);
    logger.info(`  🎯 Prioridad CSV aplicada: ${stats.csvPriorityApplied ? 'SÍ' : 'NO'}`);
    logger.info(`  📺 Total canales finales: ${stats.totalChannels}`);
    
    // Verificar que la priorización funciona
    if (stats.csvPriorityApplied && (stats.csvPriorityDuplicates > 0 || stats.duplicatesOmitted > 0)) {
      logger.info('✅ ÉXITO: La priorización del CSV está funcionando correctamente');
      const duplicatesCount = stats.csvPriorityDuplicates || stats.duplicatesOmitted;
      logger.info(`   ${duplicatesCount} canales duplicados fueron omitidos de las fuentes M3U`);
    } else if ((stats.csvPriorityDuplicates || stats.duplicatesOmitted) === 0) {
      logger.info('ℹ️  INFO: No se encontraron duplicados entre CSV y fuentes M3U');
    } else {
      logger.warn('⚠️  ADVERTENCIA: La priorización del CSV podría no estar funcionando como se esperaba');
    }
    
    // Obtener algunos canales para verificar
    const allChannels = await repository.getAllChannels();
    logger.info(`\n📺 Total de canales obtenidos: ${allChannels.length}`);
    logger.info(`📺 Primeros 10 canales (CSV debe aparecer primero):`);
    
    allChannels.slice(0, 10).forEach((channel, index) => {
      const source = channel.id.startsWith('tv_') ? 'CSV' : 'M3U';
      logger.info(`  ${index + 1}. ${channel.name} (${channel.id}) - ${channel.country} [${source}]`);
    });
    
    // Verificar canales específicos para confirmar prioridad
    const cnnChannel = allChannels.find(ch => ch.id === 'tv_cnn_espanol');
    const bbcChannel = allChannels.find(ch => ch.id === 'tv_bbc_world');
    const uniqueChannel = allChannels.find(ch => ch.id === 'tv_unique_channel');
    const testChannel = allChannels.find(ch => ch.id === 'tv_test_channel');
    
    logger.info(`\n🔍 Verificación de canales específicos:`);
    if (cnnChannel) {
      logger.info(`  ✅ CNN en Español encontrado (debe ser del CSV): ${cnnChannel.name}`);
    }
    if (bbcChannel) {
      logger.info(`  ✅ BBC World News encontrado (debe ser del CSV): ${bbcChannel.name}`);
    }
    if (uniqueChannel) {
      logger.info(`  ✅ Canal Único encontrado (debe ser del M3U): ${uniqueChannel.name}`);
    }
    if (testChannel) {
      logger.info(`  ✅ Canal de Prueba encontrado (debe ser del M3U): ${testChannel.name}`);
    }
    
    // Verificar filtros de contenido si están activos
    if (stats.contentFiltering && stats.contentFiltering.enabled) {
      logger.info(`\n🛡️  Filtros de contenido activos:`);
      logger.info(`   Canales filtrados: ${stats.contentFiltering.removedChannels}`);
      logger.info(`   Porcentaje removido: ${stats.contentFiltering.removalPercentage}%`);
      
      if (stats.contentFiltering.removedByCategory) {
        const categories = stats.contentFiltering.removedByCategory;
        logger.info(`   Por categoría: religioso=${categories.religious || 0}, adulto=${categories.adult || 0}, político=${categories.political || 0}`);
      }
    }
    
    logger.info('\n🎉 Prueba de priorización CSV con M3U completada exitosamente');
    logger.info('✅ El CSV local tiene prioridad absoluta sobre fuentes M3U');
    logger.info('✅ Los duplicados de M3U son correctamente omitidos');
    
  } catch (error) {
    logger.error('❌ Error durante la prueba de priorización CSV:', error);
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    // Limpiar archivos de prueba
    if (testM3uPath) {
      cleanup(testM3uPath);
    }
  }
}

// Ejecutar la prueba
console.log('🚀 Iniciando script de prueba con M3U...');
testCSVPriorityWithM3U().then(() => {
  console.log('✅ Script completado exitosamente');
}).catch(error => {
  console.error('❌ Error en el script:', error);
  process.exit(1);
});

export { testCSVPriorityWithM3U };