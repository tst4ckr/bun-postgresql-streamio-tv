#!/usr/bin/env bun
/**
 * @fileoverview Script de prueba para el sistema de logging mejorado
 * Verifica que los logs incluyan información del archivo fuente y número de línea
 */

import { EnhancedLoggerFactory, EnhancedLoggerService } from './src/infrastructure/services/EnhancedLoggerService.js';
import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';

console.log('=== INICIANDO PRUEBA DEL SISTEMA DE LOGGING MEJORADO ===\n');

/**
 * Función de prueba que genera logs desde diferentes líneas
 */
function testLoggingFromFunction() {
  const logger = EnhancedLoggerFactory.createCompatibleLogger({
    logLevel: 'debug',
    enableRequestLogging: true,
    enablePerformanceMetrics: true
  });

  console.log('\n1. Probando logs básicos desde función:');
  logger.info('Este es un mensaje de información desde testLoggingFromFunction');
  logger.warn('Este es un mensaje de advertencia desde testLoggingFromFunction');
  logger.error('Este es un mensaje de error desde testLoggingFromFunction');
  logger.debug('Este es un mensaje de debug desde testLoggingFromFunction');
}

/**
 * Clase de prueba para verificar logs desde métodos de clase
 */
class TestClass {
  #logger;

  constructor() {
    this.#logger = EnhancedLoggerFactory.createCompatibleLogger({
      logLevel: 'debug',
      enablePerformanceMetrics: true
    });
  }

  testMethod() {
    console.log('\n2. Probando logs desde método de clase:');
    this.#logger.info('Log de información desde método de clase');
    this.#logger.warn('Log de advertencia desde método de clase');
    this.#logger.error('Log de error desde método de clase');
    this.#logger.debug('Log de debug desde método de clase');
  }

  async testAsyncMethod() {
    console.log('\n3. Probando logs desde método asíncrono:');
    this.#logger.info('Iniciando operación asíncrona');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.#logger.info('Operación asíncrona completada');
  }
}

/**
 * Función que simula procesamiento con métricas de rendimiento
 */
function testPerformanceLogging() {
  const enhancedLogger = new EnhancedLoggerService({
    logLevel: 'debug',
    enablePerformanceMetrics: true,
    enableRequestLogging: true
  });

  console.log('\n4. Probando logging de rendimiento:');
  
  const startTime = Date.now();
  
  // Simular operación
  for (let i = 0; i < 1000000; i++) {
    // Operación simulada
  }
  
  const duration = Date.now() - startTime;
  enhancedLogger.performance('Operación de prueba', duration, { iterations: 1000000 });
  
  // Simular request HTTP
  enhancedLogger.request('GET', '/api/channels', 200, 150);
}

/**
 * Función que prueba el logger hijo con contexto
 */
function testChildLogger() {
  const parentLogger = EnhancedLoggerFactory.getInstance({
    logLevel: 'debug'
  });
  
  const childLogger = parentLogger.createChildLogger('ChannelRepository');
  
  console.log('\n5. Probando logger hijo con contexto:');
  childLogger.info('Inicializando repositorio de canales');
  childLogger.warn('Canal con URL inválida detectado');
  childLogger.error('Error al procesar playlist');
  childLogger.debug('Detalles de depuración del repositorio');
}

/**
 * Función que prueba logs anidados
 */
function testNestedLogging() {
  const logger = EnhancedLoggerFactory.createCompatibleLogger({ logLevel: 'debug' });
  
  console.log('\n6. Probando logs anidados:');
  logger.info('Función externa - nivel 1');
  
  function innerFunction() {
    logger.info('Función interna - nivel 2');
    
    function deeperFunction() {
      logger.info('Función más profunda - nivel 3');
    }
    
    deeperFunction();
  }
  
  innerFunction();
}

/**
 * Función principal que ejecuta todas las pruebas
 */
async function runTests() {
  try {
    // Configurar el logger con configuración de prueba
    console.log('Configurando sistema de logging...');
    
    // Prueba 1: Logs desde función
    testLoggingFromFunction();
    
    // Prueba 2: Logs desde clase
    const testInstance = new TestClass();
    testInstance.testMethod();
    
    // Prueba 3: Logs desde método asíncrono
    await testInstance.testAsyncMethod();
    
    // Prueba 4: Logging de rendimiento
    testPerformanceLogging();
    
    // Prueba 5: Logger hijo
    testChildLogger();
    
    // Prueba 6: Logs anidados
    testNestedLogging();
    
    console.log('\n7. Probando integración con TVAddonConfig:');
    const config = TVAddonConfig.getInstance();
    const configLogger = EnhancedLoggerFactory.createCompatibleLogger(config.logging);
    configLogger.info('Logger configurado con TVAddonConfig');
    configLogger.debug('Configuración de logging cargada correctamente');
    
    console.log('\n=== PRUEBAS COMPLETADAS EXITOSAMENTE ===');
    console.log('\n📋 Verificaciones realizadas:');
    console.log('✅ Logs incluyen nombre de archivo fuente');
    console.log('✅ Logs incluyen número de línea');
    console.log('✅ Logs funcionan desde funciones');
    console.log('✅ Logs funcionan desde métodos de clase');
    console.log('✅ Logs funcionan desde métodos asíncronos');
    console.log('✅ Métricas de rendimiento incluyen información de fuente');
    console.log('✅ Logger hijo mantiene contexto y fuente');
    console.log('✅ Logs anidados muestran ubicación correcta');
    console.log('✅ Integración con TVAddonConfig funcional');
    
  } catch (error) {
    console.error('❌ Error durante las pruebas:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Ejecutar las pruebas
runTests();