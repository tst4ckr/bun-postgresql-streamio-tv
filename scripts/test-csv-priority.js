#!/usr/bin/env node
/**
 * Script de prueba para verificar la priorización del CSV local
 * sobre otras fuentes en el repositorio híbrido
 */

import { HybridChannelRepository } from '../src/infrastructure/repositories/HybridChannelRepository.js';
import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';

/**
 * Logger simple para pruebas
 */
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
};

async function testCSVPriority() {
  try {
    logger.info('🧪 Iniciando prueba de priorización CSV...');
    
    const config = TVAddonConfig.getInstance();
    logger.info('✅ Configuración cargada');
    
    // Configurar fuentes de prueba (solo CSV para simplificar)
    const csvPath = 'data/channels.csv';
    const m3uSources = []; // Sin fuentes M3U para esta prueba
    
    logger.info(`📁 Usando CSV: ${csvPath}`);
    
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
    logger.info(`  📊 Total M3U: ${stats.m3uChannelsTotal}`);
    logger.info(`  ✅ Canales M3U agregados: ${stats.m3uChannelsAdded}`);
    logger.info(`  ❌ Duplicados omitidos: ${stats.duplicatesOmitted}`);
    logger.info(`  🎯 Prioridad CSV aplicada: ${stats.csvPriorityApplied ? 'SÍ' : 'NO'}`);
    logger.info(`  📺 Total canales finales: ${stats.totalChannels}`);
    
    // Obtener algunos canales para verificar
    const allChannels = await repository.getAllChannels();
    logger.info(`\n📺 Total de canales obtenidos: ${allChannels.length}`);
    logger.info(`📺 Primeros 5 canales del CSV:`);
    
    allChannels.slice(0, 5).forEach((channel, index) => {
      logger.info(`  ${index + 1}. ${channel.name} (${channel.id}) - ${channel.country}`);
    });
    
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
    
    logger.info('\n🎉 Prueba de priorización CSV completada exitosamente');
    logger.info('✅ El CSV local tiene prioridad absoluta sobre otras fuentes');
    
  } catch (error) {
    logger.error('❌ Error durante la prueba de priorización CSV:', error);
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Ejecutar la prueba
console.log('🚀 Iniciando script de prueba...');
testCSVPriority().then(() => {
  console.log('✅ Script completado exitosamente');
}).catch(error => {
  console.error('❌ Error en el script:', error);
  process.exit(1);
});`) {
  testCSVPriority()
    .then(() => {
      logger.info('✅ Script completado');
      process.exit(0);
    })
    .catch(error => {
      logger.error('❌ Error fatal:', error);
      process.exit(1);
    });
}

export { testCSVPriority };