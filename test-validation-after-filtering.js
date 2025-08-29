/**
 * Script de prueba para demostrar la funcionalidad de validación de conectividad
 * antes, durante y después del filtrado de canales
 */

// Configuración de prueba para validación completa
process.env.VALIDATE_BEFORE_FILTERING = 'true';
process.env.VALIDATE_FILTERED_CHANNELS = 'true';
process.env.VALIDATE_AFTER_FILTERING = 'true';

// Configuración de canal automático para pruebas
process.env.CHANNELS_SOURCE = 'automatic';
process.env.M3U_URL = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_spain.m3u8';

// Configuración de validación para pruebas
process.env.STREAM_VALIDATION_TIMEOUT = '5000';
process.env.MAX_VALIDATION_CONCURRENCY = '10';
process.env.VALIDATION_BATCH_SIZE = '50';

// Configuración de logs para ver el proceso
process.env.LOG_LEVEL = 'info';
process.env.NODE_ENV = 'development';

const { AutomaticChannelRepository } = require('./src/infrastructure/repositories/AutomaticChannelRepository');
const { TVAddonConfig } = require('./src/infrastructure/config/TVAddonConfig');
const { Logger } = require('./src/infrastructure/logging/Logger');

async function testValidationFlow() {
  const logger = new Logger('TestValidation');
  const config = new TVAddonConfig();
  
  logger.info('🧪 Iniciando prueba de validación completa de canales');
  logger.info('📋 Configuración de validación:');
  logger.info(`   - Validar antes del filtrado: ${config.get('validation.validateBeforeFiltering')}`);
  logger.info(`   - Validar canales removidos: ${config.get('validation.validateFilteredChannels')}`);
  logger.info(`   - Validar después del filtrado: ${config.get('validation.validateAfterFiltering')}`);
  
  try {
    // Crear repositorio y cargar canales
    const repository = new AutomaticChannelRepository(config);
    
    logger.info('🔄 Cargando canales automáticamente...');
    await repository.loadChannels();
    
    const channels = repository.getChannels();
    logger.info(`✅ Proceso completado. Canales finales válidos: ${channels.length}`);
    
    // Mostrar algunos ejemplos de canales finales
    if (channels.length > 0) {
      logger.info('📺 Ejemplos de canales finales:');
      channels.slice(0, 5).forEach((channel, index) => {
        logger.info(`   ${index + 1}. ${channel.name || channel.title || 'Sin nombre'}`);
      });
    }
    
  } catch (error) {
    logger.error('❌ Error durante la prueba:', error.message);
    logger.error(error.stack);
  }
}

// Ejecutar la prueba
if (require.main === module) {
  testValidationFlow()
    .then(() => {
      console.log('\n🎉 Prueba de validación completada');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Error en la prueba:', error);
      process.exit(1);
    });
}

module.exports = { testValidationFlow };