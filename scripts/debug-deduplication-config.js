/**
 * Script para diagnosticar la configuración de deduplicación
 * Analiza por qué solo se procesan 3 canales CSV
 */

import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { DeduplicationConfig } from '../src/domain/services/ChannelDeduplicationService.js';
import { ChannelDeduplicationService } from '../src/domain/services/ChannelDeduplicationService.js';
import CSVChannelRepository from '../src/infrastructure/repositories/CSVChannelRepository.js';
import ContentFilterService from '../src/domain/services/ContentFilterService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logger simple para el script
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

/**
 * Función principal de diagnóstico
 */
async function debugDeduplicationConfig() {
  try {
    console.log('🔍 Iniciando diagnóstico de configuración de deduplicación\n');
    
    // 1. Analizar configuración actual
    console.log('📋 CONFIGURACIÓN ACTUAL DE DEDUPLICACIÓN');
    console.log('=' .repeat(50));
    
    const config = DeduplicationConfig.fromEnvironment();
    console.log('Configuración cargada desde variables de entorno:');
    console.log(`- Criterios: ${config.criteria}`);
    console.log(`- Estrategia: ${config.strategy}`);
    console.log(`- Umbral similitud nombre: ${config.nameSimilarityThreshold}`);
    console.log(`- Umbral similitud URL: ${config.urlSimilarityThreshold}`);
    console.log(`- Deduplicación inteligente: ${config.enableIntelligentDeduplication}`);
    console.log(`- Actualización HD: ${config.enableHdUpgrade}`);
    console.log(`- Prioridad de fuentes: ${JSON.stringify(config.sourcePriority)}`);
    console.log(`- Preservar prioridad fuente: ${config.preserveSourcePriority}`);
    console.log(`- Métricas habilitadas: ${config.enableMetrics}\n`);
    
    // 2. Cargar canales CSV
    console.log('📁 CARGANDO CANALES CSV');
    console.log('=' .repeat(50));
    
    // Obtener configuración desde TVAddonConfig
     const tvConfig = TVAddonConfig.getInstance();
     const filterConfig = tvConfig.filters;
    
    logger.info('Configuración de filtros:');
    logger.info(`- Filtro religioso: ${filterConfig.filterReligiousContent}`);
    logger.info(`- Filtro adulto: ${filterConfig.filterAdultContent}`);
    logger.info(`- Filtro político: ${filterConfig.filterPoliticalContent}`);
    logger.info(`- Palabras religiosas: ${filterConfig.religiousKeywords?.length || 0}`);
    logger.info(`- Palabras adultas: ${filterConfig.adultKeywords?.length || 0}`);
    logger.info(`- Palabras políticas: ${filterConfig.politicalKeywords?.length || 0}`);
    
    // Crear servicio de filtros de contenido
    const contentFilter = new ContentFilterService(filterConfig);
    
    // Crear repositorio CSV
     const csvRepository = new CSVChannelRepository(
       tvConfig.dataSources.channelsFile,
       tvConfig,
       logger
     );
    
    const csvChannels = await csvRepository.getAllChannels();
    console.log(`Total canales CSV cargados: ${csvChannels.length}\n`);
    
    // 3. Crear servicio de deduplicación y analizar
    console.log('🔄 ANÁLISIS DE DEDUPLICACIÓN');
    console.log('=' .repeat(50));
    
    const deduplicationService = new ChannelDeduplicationService(config, logger);
    
    // Simular algunos canales duplicados para testing
    const testChannels = [
      ...csvChannels.slice(0, 10), // Primeros 10 canales
      ...csvChannels.slice(0, 5).map(ch => ({ // Duplicar primeros 5 con fuente diferente
        ...ch,
        source: 'm3u',
        streamUrl: ch.streamUrl + '?duplicate=true'
      }))
    ];
    
    console.log(`Canales de prueba (con duplicados simulados): ${testChannels.length}`);
    
    const result = await deduplicationService.deduplicateChannels(testChannels);
    
    console.log('\n📊 RESULTADOS DE DEDUPLICACIÓN:');
    console.log(`- Canales procesados: ${result.metrics.totalChannels}`);
    console.log(`- Duplicados encontrados: ${result.metrics.duplicatesFound}`);
    console.log(`- Duplicados removidos: ${result.metrics.duplicatesRemoved}`);
    console.log(`- Actualizaciones HD: ${result.metrics.hdUpgrades}`);
    console.log(`- Conflictos de fuente: ${result.metrics.sourceConflicts}`);
    console.log(`- Tiempo de procesamiento: ${result.metrics.processingTimeMs}ms`);
    console.log(`- Tasa de deduplicación: ${result.metrics.deduplicationRate}`);
    
    if (result.metrics.duplicatesBySource && result.metrics.duplicatesBySource.size > 0) {
      console.log('\n📈 Duplicados por fuente:');
      for (const [source, count] of result.metrics.duplicatesBySource) {
        console.log(`  - ${source}: ${count}`);
      }
    }
    
    if (result.metrics.duplicatesByType && result.metrics.duplicatesByType.size > 0) {
      console.log('\n🔍 Duplicados por criterio:');
      for (const [type, count] of result.metrics.duplicatesByType) {
        console.log(`  - ${type}: ${count}`);
      }
    }
    
    console.log(`\n✅ Canales finales después de deduplicación: ${result.channels.length}`);
    
    // 4. Analizar configuración recomendada
    console.log('\n💡 RECOMENDACIONES DE CONFIGURACIÓN');
    console.log('=' .repeat(50));
    
    if (result.metrics.duplicatesRemoved === 0 && testChannels.length > csvChannels.length) {
      console.log('⚠️  No se detectaron duplicados simulados. Posibles causas:');
      console.log('   - Umbrales de similitud muy altos');
      console.log('   - Criterios de deduplicación muy estrictos');
      console.log('   - Configuración de prioridad de fuentes incorrecta');
    }
    
    if (config.nameSimilarityThreshold > 0.9) {
      console.log('⚠️  Umbral de similitud de nombre muy alto (>0.9)');
      console.log('   Recomendación: Reducir a 0.85 para mejor detección');
    }
    
    if (config.urlSimilarityThreshold > 0.95) {
      console.log('⚠️  Umbral de similitud de URL muy alto (>0.95)');
      console.log('   Recomendación: Reducir a 0.90 para mejor detección');
    }
    
    if (!config.enableIntelligentDeduplication) {
      console.log('💡 Deduplicación inteligente deshabilitada');
      console.log('   Recomendación: Habilitar para mejor precisión');
    }
    
    console.log('\n🔧 Variables de entorno recomendadas:');
    console.log('ENABLE_INTELLIGENT_DEDUPLICATION=true');
    console.log('ENABLE_HD_UPGRADE=true');
    console.log('NAME_SIMILARITY_THRESHOLD=0.85');
    console.log('URL_SIMILARITY_THRESHOLD=0.90');
    
    // 5. Probar con configuración optimizada
    console.log('\n🚀 PRUEBA CON CONFIGURACIÓN OPTIMIZADA');
    console.log('=' .repeat(50));
    
    const optimizedConfig = new DeduplicationConfig({
      enableIntelligentDeduplication: true,
      enableHdUpgrade: true,
      nameSimilarityThreshold: 0.85,
      urlSimilarityThreshold: 0.90,
      sourcePriority: ['csv', 'm3u'],
      enableMetrics: true
    });
    
    const optimizedService = new ChannelDeduplicationService(optimizedConfig, logger);
    const optimizedResult = await optimizedService.deduplicateChannels(testChannels);
    
    console.log('Resultados con configuración optimizada:');
    console.log(`- Canales procesados: ${optimizedResult.metrics.totalChannels}`);
    console.log(`- Duplicados encontrados: ${optimizedResult.metrics.duplicatesFound}`);
    console.log(`- Duplicados removidos: ${optimizedResult.metrics.duplicatesRemoved}`);
    console.log(`- Canales finales: ${optimizedResult.channels.length}`);
    console.log(`- Tasa de deduplicación: ${optimizedResult.metrics.deduplicationRate}`);
    
    const improvement = optimizedResult.metrics.duplicatesRemoved - result.metrics.duplicatesRemoved;
    if (improvement > 0) {
      console.log(`\n✅ Mejora: +${improvement} duplicados detectados con configuración optimizada`);
    } else if (improvement < 0) {
      console.log(`\n⚠️  Regresión: ${Math.abs(improvement)} duplicados menos detectados`);
    } else {
      console.log('\n➡️  Sin cambios en detección de duplicados');
    }
    
  } catch (error) {
    console.error('❌ Error durante el diagnóstico:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Ejecutar diagnóstico
debugDeduplicationConfig();