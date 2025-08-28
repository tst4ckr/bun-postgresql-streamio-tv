/**
 * Script de prueba para validar la preservación de canales CSV
 * durante el proceso de auto-actualización con validación HTTP
 */

import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import { ChannelRepositoryFactory } from './src/infrastructure/factories/ChannelRepositoryFactory.js';

// Logger simple para el script de prueba
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.debug(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
};

async function testCSVPreservation() {
  try {
    logger.info('🧪 Iniciando prueba de preservación de canales CSV...');
    
    // Cargar configuración
    const config = TVAddonConfig.getInstance();
    logger.info(`📋 Configuración cargada - Fuente: ${config.dataSources.channelsSource}`);
    logger.info(`🔧 HTTPS→HTTP habilitado: ${config.validation?.convertHttpsToHttp}`);
    logger.info(`✅ Validación HTTP habilitada: ${config.validation?.validateHttpConversion}`);
    
    // Crear repositorio híbrido
    const channelRepository = await ChannelRepositoryFactory.createRepository(config, logger);
    
    if (channelRepository.constructor.name !== 'HybridChannelRepository') {
      logger.warn('⚠️  El repositorio no es híbrido, la prueba puede no ser relevante');
    }
    
    // Inicializar repositorio
    logger.info('🔄 Inicializando repositorio...');
    await channelRepository.initialize();
    
    // Obtener estado inicial
    const initialChannels = await channelRepository.getAllChannelsUnfiltered();
    const initialCSVChannels = initialChannels.filter(ch => ch.source === 'csv');
    const initialM3UChannels = initialChannels.filter(ch => ch.source !== 'csv');
    
    logger.info(`📊 Estado inicial:`);
    logger.info(`   📄 Canales CSV: ${initialCSVChannels.length}`);
    logger.info(`   📡 Canales M3U: ${initialM3UChannels.length}`);
    logger.info(`   📋 Total: ${initialChannels.length}`);
    
    // Simular auto-actualización
    logger.info('🔄 Simulando auto-actualización (refreshFromRemote)...');
    await channelRepository.refreshFromRemote();
    
    // Verificar estado después del refresh
    const afterRefreshChannels = await channelRepository.getAllChannelsUnfiltered();
    const afterRefreshCSVChannels = afterRefreshChannels.filter(ch => ch.source === 'csv');
    const afterRefreshM3UChannels = afterRefreshChannels.filter(ch => ch.source !== 'csv');
    
    logger.info(`📊 Estado después del refresh:`);
    logger.info(`   📄 Canales CSV: ${afterRefreshCSVChannels.length}`);
    logger.info(`   📡 Canales M3U: ${afterRefreshM3UChannels.length}`);
    logger.info(`   📋 Total: ${afterRefreshChannels.length}`);
    
    // Verificar preservación de CSV
    const csvPreserved = afterRefreshCSVChannels.length === initialCSVChannels.length;
    
    if (csvPreserved) {
      logger.info('✅ ÉXITO: Los canales CSV se preservaron correctamente');
    } else {
      logger.error('❌ FALLO: Se perdieron canales CSV durante el refresh');
      logger.error(`   Perdidos: ${initialCSVChannels.length - afterRefreshCSVChannels.length} canales`);
    }
    
    // Probar getAllChannels() con validación HTTP
    logger.info('🔍 Probando getAllChannels() con validación HTTP...');
    const validatedChannels = await channelRepository.getAllChannels();
    const validatedCSVChannels = validatedChannels.filter(ch => ch.source === 'csv');
    const validatedM3UChannels = validatedChannels.filter(ch => ch.source !== 'csv');
    
    logger.info(`📊 Estado después de validación HTTP:`);
    logger.info(`   📄 Canales CSV: ${validatedCSVChannels.length}`);
    logger.info(`   📡 Canales M3U: ${validatedM3UChannels.length}`);
    logger.info(`   📋 Total: ${validatedChannels.length}`);
    
    // Verificar preservación de CSV en validación
    const csvPreservedInValidation = validatedCSVChannels.length === initialCSVChannels.length;
    
    if (csvPreservedInValidation) {
      logger.info('✅ ÉXITO: Los canales CSV se preservaron durante la validación HTTP');
    } else {
      logger.error('❌ FALLO: Se perdieron canales CSV durante la validación HTTP');
      logger.error(`   Perdidos: ${initialCSVChannels.length - validatedCSVChannels.length} canales`);
    }
    
    // Resumen final
    logger.info('\n📋 RESUMEN DE LA PRUEBA:');
    logger.info(`✅ Preservación en refresh: ${csvPreserved ? 'ÉXITO' : 'FALLO'}`);
    logger.info(`✅ Preservación en validación: ${csvPreservedInValidation ? 'ÉXITO' : 'FALLO'}`);
    
    if (csvPreserved && csvPreservedInValidation) {
      logger.info('🎉 TODAS LAS PRUEBAS PASARON - Los canales CSV están protegidos');
      return true;
    } else {
      logger.error('💥 ALGUNAS PRUEBAS FALLARON - Revisar implementación');
      return false;
    }
    
  } catch (error) {
    logger.error('💥 Error durante la prueba:', error);
    return false;
  }
}

// Ejecutar prueba
testCSVPreservation()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    logger.error('💥 Error fatal:', error);
    process.exit(1);
  });