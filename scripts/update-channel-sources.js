#!/usr/bin/env node
/**
 * Script para actualizar fuentes de canales con URLs HTTP validadas
 * Convierte HTTPS a HTTP y persiste los cambios en el archivo CSV
 */

import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { HybridChannelRepository } from '../src/infrastructure/repositories/HybridChannelRepository.js';
import { ChannelPersistenceService } from '../src/domain/services/ChannelPersistenceService.js';
import path from 'path';

/**
 * Logger simple para el script
 */
const createLogger = (prefix = 'UPDATE-SOURCES') => ({
  info: (msg, ...args) => console.log(`[${prefix}] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[${prefix}] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[${prefix}] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[${prefix}] ${new Date().toISOString()} - ${msg}`, ...args)
});

/**
 * Configuración de variables de entorno para testing
 */
function setupEnvironment() {
  // Configurar variables de entorno para conversión HTTPS a HTTP
  process.env.CONVERT_HTTPS_TO_HTTP = 'true';
  process.env.VALIDATE_HTTP_CONVERSION = 'true';
  process.env.HTTP_VALIDATION_TIMEOUT = '10000';
  process.env.HTTP_VALIDATION_CONCURRENT_LIMIT = '10';
  process.env.ONLY_WORKING_HTTP = 'true';
}

/**
 * Función principal para actualizar fuentes de canales
 */
async function updateChannelSources() {
  const logger = createLogger();
  
  try {
    logger.info('🚀 Iniciando actualización de fuentes de canales...');
    
    // Configurar entorno
    setupEnvironment();
    logger.info('✅ Variables de entorno configuradas');
    
    // Cargar configuración
    const config = TVAddonConfig.getInstance();
    logger.info('✅ Configuración cargada');
    
    // Verificar que la conversión HTTPS a HTTP esté habilitada
    if (!config.validation?.convertHttpsToHttp) {
      logger.error('❌ La conversión HTTPS a HTTP no está habilitada en la configuración');
      logger.info('💡 Asegúrate de que CONVERT_HTTPS_TO_HTTP=true en tu .env');
      process.exit(1);
    }
    
    logger.info('✅ Conversión HTTPS a HTTP habilitada');
    
    // Obtener ruta del archivo CSV
    const csvPath = config.channels?.csvFile || 'data/channels.csv';
    const absoluteCsvPath = path.resolve(csvPath);
    logger.info(`📁 Archivo CSV: ${absoluteCsvPath}`);
    
    // Crear repositorio híbrido
    const repository = new HybridChannelRepository(csvPath, [], config, logger);
    logger.info('✅ Repositorio híbrido creado');
    
    // Inicializar repositorio
    logger.info('📊 Inicializando repositorio...');
    await repository.initialize();
    logger.info('✅ Repositorio inicializado');
    
    // Obtener canales originales (sin conversión)
    logger.info('📺 Obteniendo canales originales...');
    const originalChannels = await repository.getAllChannelsUnfiltered();
    logger.info(`📊 Canales originales cargados: ${originalChannels.length}`);
    
    // Obtener canales convertidos y validados
    logger.info('🔄 Obteniendo canales convertidos a HTTP...');
    const convertedChannels = await repository.getAllChannels();
    logger.info(`📊 Canales convertidos obtenidos: ${convertedChannels.length}`);
    
    // Verificar si hay canales para actualizar
    if (convertedChannels.length === 0) {
      logger.warn('⚠️  No hay canales HTTP funcionales para persistir');
      logger.info('💡 Verifica que la validación de streams esté funcionando correctamente');
      return;
    }
    
    // Mostrar estadísticas de conversión
    const conversionStats = {
      original: originalChannels.length,
      converted: convertedChannels.length,
      conversionRate: ((convertedChannels.length / originalChannels.length) * 100).toFixed(2)
    };
    
    logger.info('📈 Estadísticas de conversión:');
    logger.info(`  📺 Canales originales: ${conversionStats.original}`);
    logger.info(`  ✅ Canales HTTP funcionales: ${conversionStats.converted}`);
    logger.info(`  📊 Tasa de conversión: ${conversionStats.conversionRate}%`);
    
    // Crear servicio de persistencia
    const persistenceService = new ChannelPersistenceService(config, logger);
    logger.info('✅ Servicio de persistencia creado');
    
    // Validar canales para persistencia
    logger.info('🔍 Validando canales para persistencia...');
    const validChannels = persistenceService.validateChannelsForPersistence(convertedChannels);
    logger.info(`✅ ${validChannels.length} canales válidos para persistir`);
    
    // Obtener estadísticas detalladas
    const channelStats = persistenceService.getChannelStatistics(validChannels);
    logger.info('📊 Estadísticas de canales a persistir:');
    logger.info(`  🌐 HTTP: ${channelStats.byProtocol.http}`);
    logger.info(`  🔒 HTTPS: ${channelStats.byProtocol.https}`);
    logger.info(`  ❓ Otros: ${channelStats.byProtocol.other}`);
    logger.info(`  ✅ Activos: ${channelStats.active}`);
    logger.info(`  ❌ Inactivos: ${channelStats.inactive}`);
    
    // Mostrar distribución por país (top 5)
    const topCountries = Object.entries(channelStats.byCountry)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    if (topCountries.length > 0) {
      logger.info('🌍 Top países:');
      topCountries.forEach(([country, count]) => {
        logger.info(`  ${country}: ${count} canales`);
      });
    }
    
    // Confirmar antes de persistir
    logger.info('💾 Preparando persistencia de canales...');
    
    // Persistir canales con respaldo
    logger.info('📋 Creando respaldo y persistiendo canales...');
    const result = await persistenceService.persistChannelsWithBackup(
      validChannels,
      absoluteCsvPath,
      true // Crear respaldo
    );
    
    // Mostrar resultados
    logger.info('🎉 Actualización de fuentes completada exitosamente!');
    logger.info(`📊 Resultados:`);
    logger.info(`  💾 Canales persistidos: ${result.channelsPersisted}`);
    if (result.backupPath) {
      logger.info(`  📋 Respaldo creado: ${result.backupPath}`);
    }
    logger.info(`  📁 Archivo actualizado: ${absoluteCsvPath}`);
    
    // Verificar el archivo actualizado
    logger.info('🔍 Verificando archivo actualizado...');
    const fs = await import('fs');
    const stats = await fs.promises.stat(absoluteCsvPath);
    logger.info(`  📏 Tamaño del archivo: ${(stats.size / 1024).toFixed(2)} KB`);
    logger.info(`  🕒 Última modificación: ${stats.mtime.toISOString()}`);
    
    logger.info('✅ Proceso completado exitosamente');
    logger.info('💡 Los canales ahora usan URLs HTTP validadas');
    
  } catch (error) {
    logger.error('❌ Error durante la actualización de fuentes:', error);
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

/**
 * Función para mostrar ayuda
 */
function showHelp() {
  console.log(`
🔧 Script de Actualización de Fuentes de Canales
`);
  console.log('Este script:');
  console.log('  1. 🔄 Convierte URLs de canales de HTTPS a HTTP');
  console.log('  2. ✅ Valida que los streams HTTP funcionen');
  console.log('  3. 💾 Persiste solo los canales HTTP funcionales al CSV');
  console.log('  4. 📋 Crea respaldo automático del archivo original');
  console.log('');
  console.log('Uso:');
  console.log('  node scripts/update-channel-sources.js');
  console.log('');
  console.log('Variables de entorno requeridas:');
  console.log('  ENABLE_HTTPS_TO_HTTP_CONVERSION=true');
  console.log('  VALIDATE_HTTP_STREAMS=true');
  console.log('');
  console.log('Opciones:');
  console.log('  --help    Muestra esta ayuda');
  console.log('');
}

// Verificar argumentos de línea de comandos
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Ejecutar el script
console.log('🚀 Iniciando script de actualización de fuentes...');
updateChannelSources().then(() => {
  console.log('✅ Script completado exitosamente');
}).catch(error => {
  console.error('❌ Error en el script:', error);
  process.exit(1);
});

export { updateChannelSources };