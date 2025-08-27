#!/usr/bin/env bun

/**
 * @fileoverview Script de prueba para validación temprana
 * Prueba el nuevo flujo de validación antes de deduplicación
 */

import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { HybridChannelRepository } from '../src/infrastructure/repositories/HybridChannelRepository.js';
import { StreamValidationService } from '../src/infrastructure/services/StreamValidationService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { performance } from 'perf_hooks';

/**
 * Configuración de prueba para validación temprana
 */
function setupTestEnvironment() {
  // Habilitar validación temprana
  process.env.ENABLE_EARLY_VALIDATION = 'true';
  process.env.EARLY_VALIDATION_TIMEOUT = '5';
  process.env.EARLY_VALIDATION_CONCURRENCY = '8';
  process.env.EARLY_VALIDATION_BATCH_SIZE = '50';
  
  // Habilitar conversión HTTPS a HTTP
  process.env.CONVERT_HTTPS_TO_HTTP = 'true';
  process.env.VALIDATE_HTTP_CONVERSION = 'true';
  process.env.HTTP_CONVERSION_TIMEOUT = '3';
  
  // Habilitar deduplicación inteligente
  process.env.ENABLE_INTELLIGENT_DEDUPLICATION = 'true';
  process.env.DEDUPLICATION_STRATEGY = 'prioritize_working';
  
  // Configurar logging para pruebas
  process.env.LOG_LEVEL = 'info';
  
  console.log('🔧 Entorno de prueba configurado para validación temprana');
}

/**
 * Prueba el flujo completo de validación temprana
 */
async function testEarlyValidationFlow() {
  console.log('\n🚀 Iniciando prueba de validación temprana...');
  
  const startTime = performance.now();
  
  try {
    // Inicializar configuración
    const config = TVAddonConfig.getInstance();
    console.log('✅ Configuración cargada');
    
    // Verificar configuración de validación temprana
    const validationConfig = config.validation;
    console.log('📋 Configuración de validación:', {
      earlyValidation: validationConfig.enableEarlyValidation,
      timeout: validationConfig.earlyValidationTimeout,
      concurrency: validationConfig.earlyValidationConcurrency,
      batchSize: validationConfig.earlyValidationBatchSize,
      intelligentDedup: validationConfig.enableIntelligentDeduplication,
      strategy: validationConfig.deduplicationStrategy
    });
    
    // Inicializar repositorio híbrido con parámetros correctos
    const csvPath = config.dataSources.channelsFile || 'data/channels.csv';
    const m3uSources = [
      config.dataSources.m3uUrl,
      config.dataSources.m3uUrl1,
      config.dataSources.m3uUrl2,
      config.dataSources.m3uUrl3
    ].filter(url => url && url.trim() !== '');
    
    const logger = {
      info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
      debug: (msg, ...args) => console.debug(`[DEBUG] ${msg}`, ...args)
    };
    
    const repository = new HybridChannelRepository(csvPath, m3uSources, config, logger);
    console.log('✅ Repositorio híbrido inicializado');
    
    // Medir tiempo de inicialización con validación temprana
    const initStartTime = performance.now();
    await repository.initialize();
    const initEndTime = performance.now();
    
    console.log(`⏱️  Tiempo de inicialización: ${(initEndTime - initStartTime).toFixed(2)}ms`);
    
    // Obtener estadísticas del repositorio
    const stats = repository.getRepositoryStats();
    console.log('📊 Estadísticas del repositorio:', {
      totalChannels: stats.totalChannels,
      csvChannels: stats.csvChannels,
      remoteM3uChannels: stats.remoteM3uChannels,
      localM3uChannels: stats.localM3uChannels,
      duplicatesRemoved: stats.duplicatesRemoved,
      activeChannels: stats.activeChannels,
      inactiveChannels: stats.inactiveChannels
    });
    
    // Obtener canales y verificar calidad
    const channels = await repository.getAllChannels();
    console.log(`📺 Total de canales obtenidos: ${channels.length}`);
    
    // Analizar canales por estado
    const activeChannels = channels.filter(ch => ch.isActive);
    const inactiveChannels = channels.filter(ch => !ch.isActive);
    
    console.log('📈 Análisis de canales:', {
      activos: activeChannels.length,
      inactivos: inactiveChannels.length,
      porcentajeActivos: ((activeChannels.length / channels.length) * 100).toFixed(2) + '%'
    });
    
    // Mostrar muestra de canales activos
    if (activeChannels.length > 0) {
      console.log('\n🎯 Muestra de canales activos:');
      activeChannels.slice(0, 5).forEach((channel, index) => {
        console.log(`  ${index + 1}. ${channel.name} (${channel.country}) - ${channel.streamUrl}`);
      });
    }
    
    // Mostrar muestra de canales inactivos si los hay
    if (inactiveChannels.length > 0) {
      console.log('\n❌ Muestra de canales inactivos:');
      inactiveChannels.slice(0, 3).forEach((channel, index) => {
        console.log(`  ${index + 1}. ${channel.name} (${channel.country}) - ${channel.streamUrl}`);
      });
    }
    
    const endTime = performance.now();
    console.log(`\n✅ Prueba completada en ${(endTime - startTime).toFixed(2)}ms`);
    
    return {
      success: true,
      totalTime: endTime - startTime,
      initTime: initEndTime - initStartTime,
      totalChannels: channels.length,
      activeChannels: activeChannels.length,
      inactiveChannels: inactiveChannels.length,
      stats
    };
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    console.error('Stack trace:', error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Prueba específica del StreamValidationService
 */
async function testStreamValidationService() {
  console.log('\n🔍 Probando StreamValidationService directamente...');
  
  try {
    const config = TVAddonConfig.getInstance();
    const validationService = new StreamValidationService(config);
    
    // Canales de prueba usando la clase Channel con IDs válidos
    const testChannels = [
      new Channel({
        id: 'tv_test_http_001',
        name: 'Canal Test HTTP',
        streamUrl: 'http://example.com/stream1.m3u8',
        country: 'ES',
        language: 'es',
        category: 'General',
        isActive: true
      }),
      new Channel({
        id: 'tv_test_https_002', 
        name: 'Canal Test HTTPS',
        streamUrl: 'https://example.com/stream2.m3u8',
        country: 'ES',
        language: 'es',
        category: 'General',
        isActive: true
      })
    ];
    
    console.log(`🧪 Validando ${testChannels.length} canales de prueba...`);
    
    const startTime = performance.now();
    const validatedChannels = await validationService.validateChannelsBatch(testChannels);
    const endTime = performance.now();
    
    console.log(`⏱️  Validación completada en ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`📊 Canales validados: ${validatedChannels.length}/${testChannels.length}`);
    
    // Mostrar estadísticas del servicio
    const stats = validationService.getValidationStats();
    console.log('📈 Estadísticas de validación:', stats);
    
    // Mostrar información del cache
    const cacheInfo = validationService.getCacheInfo();
    console.log('💾 Información del cache:', cacheInfo);
    
    return {
      success: true,
      validatedChannels: validatedChannels.length,
      totalChannels: testChannels.length,
      validationTime: endTime - startTime,
      stats,
      cacheInfo
    };
    
  } catch (error) {
    console.error('❌ Error en prueba de StreamValidationService:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🎬 Script de Prueba - Validación Temprana de Streams');
  console.log('=' .repeat(60));
  
  // Configurar entorno de prueba
  setupTestEnvironment();
  
  // Ejecutar pruebas
  const results = {
    validationService: await testStreamValidationService(),
    fullFlow: await testEarlyValidationFlow()
  };
  
  // Resumen final
  console.log('\n📋 RESUMEN DE PRUEBAS');
  console.log('=' .repeat(60));
  
  if (results.validationService.success) {
    console.log('✅ StreamValidationService: EXITOSO');
    console.log(`   - Tiempo: ${results.validationService.validationTime?.toFixed(2)}ms`);
    console.log(`   - Canales: ${results.validationService.validatedChannels}/${results.validationService.totalChannels}`);
  } else {
    console.log('❌ StreamValidationService: FALLÓ');
    console.log(`   - Error: ${results.validationService.error}`);
  }
  
  if (results.fullFlow.success) {
    console.log('✅ Flujo completo: EXITOSO');
    console.log(`   - Tiempo total: ${results.fullFlow.totalTime?.toFixed(2)}ms`);
    console.log(`   - Tiempo inicialización: ${results.fullFlow.initTime?.toFixed(2)}ms`);
    console.log(`   - Canales activos: ${results.fullFlow.activeChannels}/${results.fullFlow.totalChannels}`);
    console.log(`   - Eficiencia: ${((results.fullFlow.activeChannels / results.fullFlow.totalChannels) * 100).toFixed(2)}%`);
  } else {
    console.log('❌ Flujo completo: FALLÓ');
    console.log(`   - Error: ${results.fullFlow.error}`);
  }
  
  console.log('\n🏁 Pruebas completadas');
  
  // Salir con código apropiado
  const allSuccess = results.validationService.success && results.fullFlow.success;
  process.exit(allSuccess ? 0 : 1);
}

// Ejecutar si es llamado directamente
if (import.meta.main) {
  main().catch(error => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  });
}

export { testEarlyValidationFlow, testStreamValidationService };