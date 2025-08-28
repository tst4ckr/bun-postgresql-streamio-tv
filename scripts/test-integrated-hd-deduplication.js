/**
 * Script de prueba para verificar la integración de patrones HD
 * en el servicio principal de deduplicación
 */

import { CSVChannelRepository } from '../src/infrastructure/repositories/CSVChannelRepository.js';
import { ChannelDeduplicationService, DeduplicationConfig } from '../src/domain/services/ChannelDeduplicationService.js';
import { DeduplicationCriteria, ConflictResolutionStrategy } from '../src/domain/services/ChannelDeduplicationService.js';
import ContentFilterService from '../src/domain/services/ContentFilterService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { StreamQuality } from '../src/domain/value-objects/StreamQuality.js';

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
};

class IntegratedHDDeduplicationTester {
  constructor(logger) {
    this.logger = logger;
    this.csvRepository = new CSVChannelRepository();
    this.contentFilter = new ContentFilterService();
  }

  /**
   * Crea configuración mínima para TVAddonConfig
   * @returns {Object}
   */
  #createMinimalTVConfig() {
    return {
      filters: {
        allowedCountries: [],
        blockedCountries: [],
        defaultLanguage: 'es',
        supportedLanguages: [],
        filterReligiousContent: false,
        filterAdultContent: false,
        filterPoliticalContent: false,
        religiousKeywords: [],
        adultKeywords: [],
        politicalKeywords: []
      },
      streaming: {
        enableAdultChannels: true,
        cacheChannelsHours: 6
      },
      dataSources: {
        channelsFile: 'data/channels.csv'
      }
    };
  }

  /**
   * Crea configuración de deduplicación optimizada para HD
   * @returns {DeduplicationConfig}
   */
  #createHDOptimizedConfig() {
    return new DeduplicationConfig({
      criteria: DeduplicationCriteria.COMBINED,
      strategy: ConflictResolutionStrategy.PRIORITIZE_HD,
      enableIntelligentDeduplication: true,
      enableHdUpgrade: true,
      nameSimilarityThreshold: 0.85,
      urlSimilarityThreshold: 0.90,
      sourcePriority: ['csv', 'm3u'],
      preserveSourcePriority: true
    });
  }



  /**
   * Prueba la deduplicación integrada con canales HD
   * @returns {Promise<Object>}
   */
  async testIntegratedHDDeduplication() {
    const startTime = Date.now();
    
    this.logger.info('=== INICIANDO PRUEBA DE DEDUPLICACIÓN HD INTEGRADA ===');
    
    try {
      // Paso 1: Cargar canales desde CSV
      this.logger.info('Cargando canales desde CSV...');
      const minimalConfig = this.#createMinimalTVConfig();
      const csvRepository = new CSVChannelRepository(
        'data/channels.csv',
        minimalConfig,
        this.logger
      );
      
      await csvRepository.initialize();
      const allChannels = await csvRepository.getAllChannels();
      
      if (!allChannels || allChannels.length === 0) {
        throw new Error('No se pudieron cargar canales desde el CSV');
      }
      
      this.logger.info(`Canales cargados: ${allChannels.length}`);
      
      // Paso 2: Filtrar canales válidos
      const validChannels = this.contentFilter.filterValidChannels(allChannels);
      this.logger.info(`Canales válidos: ${validChannels.length}`);
      
      // Paso 3: Identificar canales HD
      const hdChannels = validChannels.filter(channel => 
        this.#hasHDPatterns(channel.name)
      );
      this.logger.info(`Canales HD detectados: ${hdChannels.length}`);
      
      // Paso 4: Analizar patrones HD
      const patternAnalysis = this.#analyzeHDPatterns(hdChannels);
      this.logger.info('Análisis de patrones HD:', patternAnalysis);
      
      // Paso 5: Configurar y ejecutar deduplicación
      const config = this.#createHDOptimizedConfig();
      const deduplicationService = new ChannelDeduplicationService(config, this.logger);
      
      this.logger.info('Ejecutando deduplicación con lógica HD integrada...');
      const result = await deduplicationService.deduplicateChannels(validChannels);
      
      // Paso 6: Analizar resultados
      const finalHDChannels = result.channels.filter(channel => 
        this.#hasHDPatterns(channel.name)
      );
      
      const processingTime = Date.now() - startTime;
      
      const summary = {
        originalChannels: validChannels.length,
        originalHDChannels: hdChannels.length,
        finalChannels: result.channels.length,
        finalHDChannels: finalHDChannels.length,
        duplicatesRemoved: result.metrics.duplicatesRemoved,
        hdUpgrades: result.metrics.hdUpgrades,
        deduplicationRate: result.metrics.deduplicationRate,
        processingTimeMs: processingTime,
        patternAnalysis,
        metrics: result.metrics
      };
      
      this.#logResults(summary);
      
      // Paso 7: Verificar casos específicos (ESPN)
      await this.#verifySpecificCases(result.channels);
      
      return summary;
      
    } catch (error) {
      this.logger.error('Error durante la prueba:', error.message);
      throw error;
    }
  }

  /**
   * Detecta si un canal tiene patrones HD específicos
   * @private
   * @param {string} name
   * @returns {boolean}
   */
  #hasHDPatterns(name) {
    if (!name || typeof name !== 'string') {
      return false;
    }
    
    const lowerName = name.toLowerCase();
    
    // Patrones HD específicos
    const hdPatterns = [
      /_hd\b/,           // _hd
      /\bhd\b/,          // hd como palabra completa
      /\b\d+hd\b/,       // variantes numéricas (4hd, 6hd, etc.)
      /\buhd\b/,         // uhd
      /\bfhd\b/,         // fhd
      /\b4k\b/           // 4k
    ];
    
    return hdPatterns.some(pattern => pattern.test(lowerName));
  }

  /**
   * Analiza los patrones HD encontrados
   * @private
   * @param {Array} hdChannels
   * @returns {Object}
   */
  #analyzeHDPatterns(hdChannels) {
    const patterns = {
      '_hd': [],
      'hd_word': [],
      'numbered_hd': [],
      'uhd': [],
      'fhd': [],
      '4k': [],
      'other': []
    };
    
    for (const channel of hdChannels) {
      const name = channel.name.toLowerCase();
      
      if (/_hd\b/.test(name)) {
        patterns['_hd'].push(channel.name);
      } else if (/\b\d+hd\b/.test(name)) {
        patterns['numbered_hd'].push(channel.name);
      } else if (/\buhd\b/.test(name)) {
        patterns['uhd'].push(channel.name);
      } else if (/\bfhd\b/.test(name)) {
        patterns['fhd'].push(channel.name);
      } else if (/\b4k\b/.test(name)) {
        patterns['4k'].push(channel.name);
      } else if (/\bhd\b/.test(name)) {
        patterns['hd_word'].push(channel.name);
      } else {
        patterns['other'].push(channel.name);
      }
    }
    
    // Convertir a conteos
    const patternCounts = {};
    for (const [pattern, channels] of Object.entries(patterns)) {
      patternCounts[pattern] = channels.length;
    }
    
    return {
      counts: patternCounts,
      examples: {
        numbered_hd: patterns.numbered_hd.slice(0, 5),
        _hd: patterns['_hd'].slice(0, 3),
        hd_word: patterns.hd_word.slice(0, 3)
      }
    };
  }

  /**
   * Verifica casos específicos como ESPN
   * @private
   * @param {Array} finalChannels
   */
  async #verifySpecificCases(finalChannels) {
    this.logger.info('\n=== VERIFICACIÓN DE CASOS ESPECÍFICOS ===');
    
    // Buscar canales ESPN
    const espnChannels = finalChannels.filter(channel => 
      channel.name.toLowerCase().includes('espn')
    );
    
    if (espnChannels.length > 0) {
      this.logger.info(`Canales ESPN encontrados: ${espnChannels.length}`);
      espnChannels.forEach(channel => {
        this.logger.info(`  - ${channel.name} (${channel.quality?.value || 'AUTO'})`);
      });
      
      // Verificar si se mantuvo ESPN con número más alto
      const numberedESPN = espnChannels.filter(channel => 
        /\b\d+hd\b/i.test(channel.name)
      );
      
      if (numberedESPN.length > 0) {
        this.logger.info('Canales ESPN numerados mantenidos:');
        numberedESPN.forEach(channel => {
          this.logger.info(`  - ${channel.name}`);
        });
      }
    } else {
      this.logger.warn('No se encontraron canales ESPN en el resultado final');
    }
  }

  /**
   * Registra los resultados de la prueba
   * @private
   * @param {Object} summary
   */
  #logResults(summary) {
    this.logger.info('\n=== RESULTADOS DE LA PRUEBA ===');
    this.logger.info(`📊 Canales originales: ${summary.originalChannels}`);
    this.logger.info(`📺 Canales HD originales: ${summary.originalHDChannels}`);
    this.logger.info(`✅ Canales finales: ${summary.finalChannels}`);
    this.logger.info(`🎬 Canales HD finales: ${summary.finalHDChannels}`);
    this.logger.info(`🗑️  Duplicados removidos: ${summary.duplicatesRemoved}`);
    this.logger.info(`⬆️  Actualizaciones HD: ${summary.hdUpgrades}`);
    this.logger.info(`📈 Tasa de deduplicación: ${summary.deduplicationRate}`);
    this.logger.info(`⏱️  Tiempo de procesamiento: ${summary.processingTimeMs}ms`);
    
    this.logger.info('\n📋 Análisis de patrones HD:');
    for (const [pattern, count] of Object.entries(summary.patternAnalysis.counts)) {
      if (count > 0) {
        this.logger.info(`  - ${pattern}: ${count} canales`);
      }
    }
    
    if (summary.patternAnalysis.examples.numbered_hd.length > 0) {
      this.logger.info('\n🔢 Ejemplos de canales numbered_hd:');
      summary.patternAnalysis.examples.numbered_hd.forEach(name => {
        this.logger.info(`  - ${name}`);
      });
    }
  }
}

/**
 * Función principal
 */
async function main() {
  const tester = new IntegratedHDDeduplicationTester(logger);
  
  try {
    const results = await tester.testIntegratedHDDeduplication();
    
    logger.info('\n✅ Prueba completada exitosamente');
    logger.info('📄 Los resultados han sido registrados en el log');
    
    return results;
    
  } catch (error) {
    logger.error('❌ Error durante la prueba:', error.message);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
main().catch(console.error);

export { IntegratedHDDeduplicationTester };