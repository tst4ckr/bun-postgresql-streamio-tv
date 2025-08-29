#!/usr/bin/env node

/**
 * Script de prueba para validación antes del filtrado inteligente
 * 
 * Este script demuestra la nueva funcionalidad que:
 * 1. Valida conectividad de canales antes de aplicar filtros de contenido
 * 2. Analiza canales removidos por filtro para detectar falsos positivos
 * 
 * Uso:
 *   node scripts/test-validation-before-filtering.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { Logger } from '../src/infrastructure/logging/Logger.js';
import { AutomaticChannelRepository } from '../src/infrastructure/repositories/AutomaticChannelRepository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Configuración de prueba
const testConfig = {
  // Habilitar validación antes del filtrado
  VALIDATE_BEFORE_FILTERING: 'true',
  VALIDATE_FILTERED_CHANNELS: 'true',
  
  // Configuración de fuente automática
  CHANNELS_SOURCE: 'automatic',
  AUTO_M3U_URL: 'https://iptv-org.github.io/iptv/countries/mx.m3u',
  
  // Configuración de validación optimizada para pruebas
  STREAM_VALIDATION_TIMEOUT: '5',
  MAX_VALIDATION_CONCURRENCY: '8',
  VALIDATION_BATCH_SIZE: '20',
  
  // Configuración de logs
  LOG_LEVEL: 'info',
  
  // Configuración de filtros (para generar canales removidos)
  FILTER_RELIGIOUS_CONTENT: 'true',
  FILTER_ADULT_CONTENT: 'true',
  FILTER_POLITICAL_CONTENT: 'true',
  
  // Configuración de conversión HTTPS
  CONVERT_HTTPS_TO_HTTP: 'true',
  VALIDATE_HTTP_CONVERSION: 'true',
  HTTP_CONVERSION_TIMEOUT: '3'
};

/**
 * Función principal de prueba
 */
async function testValidationBeforeFiltering() {
  console.log('🧪 Iniciando prueba de validación antes del filtrado\n');
  
  try {
    // Aplicar configuración de prueba
    Object.assign(process.env, testConfig);
    
    // Inicializar servicios
    const config = new TVAddonConfig();
    const logger = new Logger(config);
    
    logger.info('📋 Configuración de prueba aplicada:');
    logger.info(`   • Validación antes del filtrado: ${config.get('validation.validateBeforeFiltering')}`);
    logger.info(`   • Validación de canales removidos: ${config.get('validation.validateFilteredChannels')}`);
    logger.info(`   • Timeout de validación: ${config.get('validation.streamValidationTimeout')}s`);
    logger.info(`   • Concurrencia máxima: ${config.get('validation.maxValidationConcurrency')}`);
    logger.info('');
    
    // Crear repositorio automático
    const repository = new AutomaticChannelRepository(config, logger);
    
    logger.info('🚀 Iniciando carga y procesamiento de canales...');
    const startTime = Date.now();
    
    // Inicializar repositorio (esto activará la validación)
    await repository.initialize();
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const channels = await repository.getAllChannels();
    
    logger.info('');
    logger.info('✅ Prueba completada exitosamente');
    logger.info(`📊 Resultados finales:`);
    logger.info(`   • Canales finales: ${channels.length}`);
    logger.info(`   • Tiempo total: ${totalTime}s`);
    logger.info('');
    
    // Mostrar algunos canales de ejemplo
    if (channels.length > 0) {
      logger.info('📺 Ejemplos de canales finales:');
      channels.slice(0, 5).forEach((channel, index) => {
        logger.info(`   ${index + 1}. ${channel.name || channel.title || 'Sin nombre'} - ${channel.streamUrl}`);
      });
      if (channels.length > 5) {
        logger.info(`   ... y ${channels.length - 5} canales más`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error durante la prueba:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

/**
 * Función de ayuda
 */
function showHelp() {
  console.log(`
🧪 Test de Validación Antes del Filtrado
`);
  console.log('Este script prueba la nueva funcionalidad que:');
  console.log('• Valida conectividad antes de aplicar filtros de contenido');
  console.log('• Analiza canales removidos para detectar falsos positivos');
  console.log('• Proporciona estadísticas detalladas del proceso\n');
  
  console.log('📋 Configuración aplicada:');
  Object.entries(testConfig).forEach(([key, value]) => {
    console.log(`   ${key}=${value}`);
  });
  
  console.log('\n🚀 Ejecutando prueba...\n');
}

// Verificar argumentos de línea de comandos
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Mostrar información y ejecutar prueba
showHelp();
testValidationBeforeFiltering()
  .then(() => {
    console.log('\n🎉 Prueba finalizada exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Error fatal:', error.message);
    process.exit(1);
  });