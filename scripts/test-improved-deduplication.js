#!/usr/bin/env bun

/**
 * Script para probar las mejoras en el algoritmo de deduplicación
 * con datos reales de las listas M3U proporcionadas
 */

import { ChannelDeduplicationService, DeduplicationConfig } from '../src/domain/services/ChannelDeduplicationService.js';

class ImprovedDeduplicationTester {
  constructor() {
    this.logger = {
      info: (msg, ...args) => console.log(`ℹ️  ${msg}`, ...args),
      debug: (msg, ...args) => console.log(`🔍 ${msg}`, ...args),
      error: (msg, ...args) => console.error(`❌ ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`⚠️  ${msg}`, ...args)
    };
  }

  /**
   * Casos de prueba basados en los datos reales encontrados
   */
  getTestCases() {
    return [
      // Casos con prefijos numéricos
      {
        name: 'Prefijos numéricos',
        channels: [
          { id: '1', name: 'CNN', url: 'http://example1.com/cnn' },
          { id: '2', name: '105-CNN', url: 'http://example2.com/cnn' },
          { id: '3', name: '98-TNT', url: 'http://example1.com/tnt' },
          { id: '4', name: 'TNT', url: 'http://example2.com/tnt' }
        ]
      },
      // Casos con variaciones HD
      {
        name: 'Variaciones HD',
        channels: [
          { id: '1', name: 'AMC', url: 'http://example1.com/amc' },
          { id: '2', name: 'AMC HD', url: 'http://example2.com/amc' },
          { id: '3', name: 'A&E', url: 'http://example1.com/ae' },
          { id: '4', name: '67-A&E HD', url: 'http://example2.com/ae' },
          { id: '5', name: 'ZXA&E HD IN', url: 'http://example3.com/ae' }
        ]
      },
      // Casos con números romanos y palabras
      {
        name: 'Números romanos y palabras',
        channels: [
          { id: '1', name: 'Canal 1', url: 'http://example1.com/canal1' },
          { id: '2', name: 'Canal Uno', url: 'http://example2.com/canal1' },
          { id: '3', name: 'Canal I', url: 'http://example3.com/canal1' },
          { id: '4', name: 'Canal 2', url: 'http://example1.com/canal2' },
          { id: '5', name: 'Canal Dos', url: 'http://example2.com/canal2' }
        ]
      },
      // Casos complejos encontrados en las listas
      {
        name: 'Casos complejos reales',
        channels: [
          { id: '1', name: 'DISCOVERY', url: 'http://example1.com/discovery' },
          { id: '2', name: 'DISCOVERY HD', url: 'http://example2.com/discovery' },
          { id: '3', name: 'DISCOVERY H&H', url: 'http://example3.com/discovery' },
          { id: '4', name: 'ANIMAL PLANET', url: 'http://example1.com/animal' },
          { id: '5', name: 'ANIMAL PLANET HD', url: 'http://example2.com/animal' }
        ]
      }
    ];
  }

  /**
   * Prueba la configuración anterior (umbral 95%)
   */
  async testOldConfiguration() {
    this.logger.info('🔍 Probando configuración anterior (umbral 95%)');
    
    const oldConfig = new DeduplicationConfig({
      nameSimilarityThreshold: 0.95,
      urlSimilarityThreshold: 0.90
    });
    
    const service = new ChannelDeduplicationService(oldConfig, this.logger);
    const testCases = this.getTestCases();
    
    for (const testCase of testCases) {
      this.logger.info(`\n📋 Caso: ${testCase.name}`);
      this.logger.info(`   Canales originales: ${testCase.channels.length}`);
      
      const result = await service.deduplicateChannels(testCase.channels);
      
      this.logger.info(`   Canales después: ${result.channels.length}`);
      this.logger.info(`   Duplicados removidos: ${result.metrics.duplicatesRemoved}`);
      
      // Mostrar qué canales quedaron
      result.channels.forEach(channel => {
        this.logger.debug(`     - ${channel.name}`);
      });
    }
  }

  /**
   * Prueba la configuración mejorada (umbral 85%)
   */
  async testImprovedConfiguration() {
    this.logger.info('\n🚀 Probando configuración mejorada (umbral 85%)');
    
    const improvedConfig = new DeduplicationConfig({
      nameSimilarityThreshold: 0.85,
      urlSimilarityThreshold: 0.90
    });
    
    const service = new ChannelDeduplicationService(improvedConfig, this.logger);
    const testCases = this.getTestCases();
    
    for (const testCase of testCases) {
      this.logger.info(`\n📋 Caso: ${testCase.name}`);
      this.logger.info(`   Canales originales: ${testCase.channels.length}`);
      
      const result = await service.deduplicateChannels(testCase.channels);
      
      this.logger.info(`   Canales después: ${result.channels.length}`);
      this.logger.info(`   Duplicados removidos: ${result.metrics.duplicatesRemoved}`);
      
      // Mostrar qué canales quedaron
      result.channels.forEach(channel => {
        this.logger.debug(`     - ${channel.name}`);
      });
    }
  }

  /**
   * Prueba específica de normalización de nombres
   */
  testNameNormalization() {
    this.logger.info('\n🔧 Probando normalización de nombres mejorada');
    
    const config = new DeduplicationConfig({ nameSimilarityThreshold: 0.85 });
    const service = new ChannelDeduplicationService(config, this.logger);
    
    const testNames = [
      '105-CNN',
      'CNN',
      'AMC HD',
      'AMC',
      '67-A&E HD',
      'A&E',
      'Canal Uno',
      'Canal 1',
      'Canal I',
      'DISCOVERY H&H',
      'DISCOVERY'
    ];
    
    this.logger.info('\n📝 Nombres normalizados:');
    testNames.forEach(name => {
      // Para testing, vamos a crear una instancia temporal y usar el método público
      try {
        // Simular la normalización usando el algoritmo mejorado
        let normalized = name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        // Aplicar las mejoras implementadas
        normalized = normalized.replace(/^\d+\s*-?\s*/, ''); // Prefijos numéricos
        normalized = normalized
          .replace(/\s+(hd|sd|fhd|uhd|4k)$/g, '')
          .replace(/\s+\d+hd$/g, '')
          .replace(/_hd$/g, '');
        
        this.logger.info(`   "${name}" -> "${normalized}"`);
      } catch (error) {
         this.logger.error(`Error normalizando "${name}": ${error.message}`);
       }
     });
  }

  /**
   * Ejecuta todas las pruebas
   */
  async runAllTests() {
    this.logger.info('🧪 Iniciando pruebas de deduplicación mejorada\n');
    
    try {
      // Prueba normalización
      this.testNameNormalization();
      
      // Prueba configuración anterior
      await this.testOldConfiguration();
      
      // Prueba configuración mejorada
      await this.testImprovedConfiguration();
      
      this.logger.info('\n✅ Todas las pruebas completadas');
      
    } catch (error) {
      this.logger.error('❌ Error durante las pruebas:', error);
      throw error;
    }
  }
}

// Ejecutar si es llamado directamente
if (import.meta.main) {
  const tester = new ImprovedDeduplicationTester();
  await tester.runAllTests();
}

export { ImprovedDeduplicationTester };