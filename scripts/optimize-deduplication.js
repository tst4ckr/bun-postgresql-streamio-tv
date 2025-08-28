/**
 * Script para optimizar la configuración de deduplicación
 * Analiza los canales CSV y ajusta los umbrales para reducir falsos positivos
 */

import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { DeduplicationConfig, ChannelDeduplicationService } from '../src/domain/services/ChannelDeduplicationService.js';
import CSVChannelRepository from '../src/infrastructure/repositories/CSVChannelRepository.js';
import ContentFilterService from '../src/domain/services/ContentFilterService.js';
import Channel from '../src/domain/entities/Channel.js';

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args)
};

/**
 * Prueba diferentes configuraciones de deduplicación
 */
async function optimizeDeduplicationConfig() {
  try {
    console.log('🔧 OPTIMIZACIÓN DE CONFIGURACIÓN DE DEDUPLICACIÓN');
    console.log('==================================================');
    
    // Obtener configuración desde TVAddonConfig
    const tvConfig = TVAddonConfig.getInstance();
    const filterConfig = tvConfig.filters;
    
    // Crear servicio de filtros
    const contentFilter = new ContentFilterService(filterConfig);
    
    // Crear repositorio CSV
    const csvRepository = new CSVChannelRepository(
      tvConfig.dataSources.channelsFile,
      tvConfig,
      logger
    );
    
    const csvChannels = await csvRepository.getAllChannels();
    console.log(`📊 Canales CSV cargados: ${csvChannels.length}`);
    
    // Configuraciones a probar
    const testConfigs = [
      {
        name: 'Configuración Actual (Agresiva)',
        config: {
          criteria: 'combined',
          strategy: 'prioritize_source',
          nameSimilarityThreshold: 0.85,
          urlSimilarityThreshold: 0.90,
          enableIntelligentDeduplication: true,
          preserveSourcePriority: true,
          sourcePriority: ['csv', 'm3u'],
          enableHdUpgrade: true,
          enableMetrics: true
        }
      },
      {
        name: 'Configuración Conservadora',
        config: {
          criteria: 'combined',
          strategy: 'prioritize_source',
          nameSimilarityThreshold: 0.95,
          urlSimilarityThreshold: 0.98,
          enableIntelligentDeduplication: true,
          preserveSourcePriority: true,
          sourcePriority: ['csv', 'm3u'],
          enableHdUpgrade: true,
          enableMetrics: true
        }
      },
      {
        name: 'Configuración Moderada',
        config: {
          criteria: 'combined',
          strategy: 'prioritize_source',
          nameSimilarityThreshold: 0.90,
          urlSimilarityThreshold: 0.95,
          enableIntelligentDeduplication: true,
          preserveSourcePriority: true,
          sourcePriority: ['csv', 'm3u'],
          enableHdUpgrade: true,
          enableMetrics: true
        }
      },
      {
        name: 'Solo ID Exacto',
        config: {
          criteria: 'id_exact',
          strategy: 'prioritize_source',
          nameSimilarityThreshold: 0.85,
          urlSimilarityThreshold: 0.90,
          enableIntelligentDeduplication: true,
          preserveSourcePriority: true,
          sourcePriority: ['csv', 'm3u'],
          enableHdUpgrade: true,
          enableMetrics: true
        }
      },
      {
        name: 'Solo Similitud de Nombres',
        config: {
          criteria: 'name_similarity',
          strategy: 'prioritize_source',
          nameSimilarityThreshold: 0.95,
          urlSimilarityThreshold: 0.90,
          enableIntelligentDeduplication: true,
          preserveSourcePriority: true,
          sourcePriority: ['csv', 'm3u'],
          enableHdUpgrade: true,
          enableMetrics: true
        }
      }
    ];
    
    const results = [];
    
    for (const testConfig of testConfigs) {
      console.log(`\n🧪 Probando: ${testConfig.name}`);
      console.log('--------------------------------------------------');
      
      const deduplicationConfig = new DeduplicationConfig(testConfig.config);
      const deduplicationService = new ChannelDeduplicationService(deduplicationConfig, logger);
      
      // Crear una copia de los canales para la prueba, filtrando canales inválidos
      const testChannels = csvChannels
        .filter(ch => ch.streamUrl && typeof ch.streamUrl === 'string' && ch.streamUrl.trim().length > 0)
        .map(ch => new Channel({
          id: ch.id,
          name: ch.name,
          logo: ch.logo,
          streamUrl: ch.streamUrl,
          genre: ch.genre,
          country: ch.country,
          language: ch.language,
          quality: ch.quality,
          type: ch.type,
          isActive: ch.isActive,
          metadata: { ...ch.metadata, source: 'csv' }
        }));
      
      console.log(`   📊 Canales válidos para prueba: ${testChannels.length}/${csvChannels.length}`);
      
      if (testChannels.length === 0) {
        console.log('   ⚠️  No hay canales válidos para probar esta configuración');
        continue;
      }
      
      const result = await deduplicationService.deduplicateChannels(testChannels);
      
      const summary = {
        configName: testConfig.name,
        originalChannels: csvChannels.length,
        finalChannels: result.channels.length,
        duplicatesRemoved: result.metrics.duplicatesRemoved,
        deduplicationRate: result.metrics.deduplicationRate,
        processingTime: result.metrics.processingTimeMs,
        config: testConfig.config
      };
      
      results.push(summary);
      
      console.log(`   📊 Canales originales: ${summary.originalChannels}`);
      console.log(`   ✅ Canales finales: ${summary.finalChannels}`);
      console.log(`   🗑️  Duplicados removidos: ${summary.duplicatesRemoved}`);
      console.log(`   📈 Tasa de deduplicación: ${summary.deduplicationRate}%`);
      console.log(`   ⏱️  Tiempo: ${summary.processingTime}ms`);
    }
    
    // Mostrar resumen comparativo
    console.log('\n📊 RESUMEN COMPARATIVO');
    console.log('==================================================');
    
    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.configName}:`);
      console.log(`   - Canales conservados: ${result.finalChannels}/${result.originalChannels}`);
      console.log(`   - Tasa de conservación: ${(100 - parseFloat(result.deduplicationRate)).toFixed(2)}%`);
      console.log(`   - Duplicados removidos: ${result.duplicatesRemoved}`);
      console.log('');
    });
    
    // Verificar si hay resultados para analizar
    if (results.length === 0) {
      console.log('❌ No se pudieron probar configuraciones debido a falta de canales válidos.');
      console.log('💡 Verifica que los canales en el CSV tengan URLs de stream válidas.');
      return;
    }

    // Encontrar la configuración óptima
    const optimalConfig = results.reduce((best, current) => {
      // Priorizar configuraciones que conserven más canales pero aún eliminen algunos duplicados
      const currentScore = current.finalChannels + (current.duplicatesRemoved > 0 ? 10 : 0);
      const bestScore = best.finalChannels + (best.duplicatesRemoved > 0 ? 10 : 0);
      
      return currentScore > bestScore ? current : best;
    });
    
    console.log('🏆 CONFIGURACIÓN RECOMENDADA');
    console.log('==================================================');
    console.log(`Configuración: ${optimalConfig.configName}`);
    console.log(`Canales conservados: ${optimalConfig.finalChannels}/${optimalConfig.originalChannels}`);
    console.log(`Tasa de conservación: ${(100 - parseFloat(optimalConfig.deduplicationRate)).toFixed(2)}%`);
    console.log('');
    
    console.log('🔧 Variables de entorno recomendadas:');
    console.log(`DEDUPLICATION_CRITERIA=${optimalConfig.config.criteria}`);
    console.log(`DEDUPLICATION_STRATEGY=${optimalConfig.config.strategy}`);
    console.log(`NAME_SIMILARITY_THRESHOLD=${optimalConfig.config.nameSimilarityThreshold}`);
    console.log(`URL_SIMILARITY_THRESHOLD=${optimalConfig.config.urlSimilarityThreshold}`);
    console.log(`ENABLE_INTELLIGENT_DEDUPLICATION=${optimalConfig.config.enableIntelligentDeduplication}`);
    console.log(`ENABLE_HD_UPGRADE=${optimalConfig.config.enableHdUpgrade}`);
    
    console.log('\n💡 ANÁLISIS DETALLADO');
    console.log('==================================================');
    
    if (optimalConfig.finalChannels < optimalConfig.originalChannels * 0.5) {
      console.log('⚠️  ADVERTENCIA: La deduplicación está eliminando más del 50% de los canales.');
      console.log('   Esto podría indicar que los criterios son demasiado agresivos.');
      console.log('   Considera usar criterios más específicos como "id_exact" o aumentar los umbrales.');
    } else if (optimalConfig.duplicatesRemoved === 0) {
      console.log('ℹ️  INFO: No se detectaron duplicados con esta configuración.');
      console.log('   Esto podría ser correcto si los canales CSV son únicos.');
    } else {
      console.log('✅ ÓPTIMO: La configuración parece balanceada.');
      console.log(`   Conserva ${optimalConfig.finalChannels} canales y elimina ${optimalConfig.duplicatesRemoved} duplicados.`);
    }
    
  } catch (error) {
    console.error('❌ Error durante la optimización:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Ejecutar optimización
optimizeDeduplicationConfig();