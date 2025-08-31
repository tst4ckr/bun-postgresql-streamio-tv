/**
 * Servicio centralizado de deduplicación de canales
 * Implementa algoritmos avanzados de detección de duplicados
 * siguiendo principios SOLID y Domain-Driven Design
 */

import { StreamQuality } from '../value-objects/StreamQuality.js';
// Logger simple para el servicio
const createLogger = () => ({
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
});

/**
 * Criterios de comparación para deduplicación
 */
export const DeduplicationCriteria = {
  ID_EXACT: 'id_exact',
  NAME_SIMILARITY: 'name_similarity', 
  URL_SIMILARITY: 'url_similarity',
  COMBINED: 'combined'
};

/**
 * Estrategias de resolución de conflictos
 */
export const ConflictResolutionStrategy = {
  KEEP_FIRST: 'keep_first',           // Mantener el primer canal encontrado
  KEEP_LAST: 'keep_last',             // Mantener el último canal encontrado
  PRIORITIZE_HD: 'prioritize_hd',     // Priorizar versión HD
  PRIORITIZE_SOURCE: 'prioritize_source', // Priorizar por fuente (CSV > M3U)
  CUSTOM: 'custom'                    // Estrategia personalizada
};

/**
 * Configuración de deduplicación
 */
class DeduplicationConfig {
  constructor({
    criteria = DeduplicationCriteria.COMBINED,
    strategy = ConflictResolutionStrategy.PRIORITIZE_SOURCE,
    nameSimilarityThreshold = 0.85,
    urlSimilarityThreshold = 0.99,
    enableIntelligentDeduplication = true,
    preserveSourcePriority = true,
    sourcePriority = ['csv', 'm3u'],
    enableHdUpgrade = true,
    enableMetrics = true
  } = {}) {
    this.criteria = criteria;
    this.strategy = strategy;
    this.nameSimilarityThreshold = nameSimilarityThreshold;
    this.urlSimilarityThreshold = urlSimilarityThreshold;
    this.enableIntelligentDeduplication = enableIntelligentDeduplication;
    this.preserveSourcePriority = preserveSourcePriority;
    this.sourcePriority = sourcePriority;
    this.enableHdUpgrade = enableHdUpgrade;
    this.enableMetrics = enableMetrics;
  }

  /**
   * Crea configuración desde variables de entorno
   * @static
   * @returns {DeduplicationConfig}
   */
  static fromEnvironment() {
    return new DeduplicationConfig({
      enableIntelligentDeduplication: process.env.ENABLE_INTELLIGENT_DEDUPLICATION !== 'false',
      enableHdUpgrade: process.env.ENABLE_HD_UPGRADE !== 'false',
      nameSimilarityThreshold: parseFloat(process.env.NAME_SIMILARITY_THRESHOLD || '0.85'),
      urlSimilarityThreshold: parseFloat(process.env.URL_SIMILARITY_THRESHOLD || '0.90')
    });
  }
}

/**
 * Métricas de deduplicación
 */
class DeduplicationMetrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalChannels = 0;
    this.duplicatesFound = 0;
    this.duplicatesRemoved = 0;
    this.hdUpgrades = 0;
    this.sourceConflicts = 0;
    this.processingTimeMs = 0;
    this.duplicatesBySource = new Map();
    this.duplicatesByType = new Map();
    this.conflictResolutions = new Map();
  }

  addDuplicate(source, type, resolution) {
    this.duplicatesFound++;
    
    // Contar por fuente
    const sourceCount = this.duplicatesBySource.get(source) || 0;
    this.duplicatesBySource.set(source, sourceCount + 1);
    
    // Contar por tipo
    const typeCount = this.duplicatesByType.get(type) || 0;
    this.duplicatesByType.set(type, typeCount + 1);
    
    // Contar resoluciones
    const resolutionCount = this.conflictResolutions.get(resolution) || 0;
    this.conflictResolutions.set(resolution, resolutionCount + 1);
  }

  addHdUpgrade() {
    this.hdUpgrades++;
  }

  addSourceConflict() {
    this.sourceConflicts++;
  }

  getStats() {
    return {
      totalChannels: this.totalChannels,
      duplicatesFound: this.duplicatesFound,
      duplicatesRemoved: this.duplicatesRemoved,
      hdUpgrades: this.hdUpgrades,
      sourceConflicts: this.sourceConflicts,
      processingTimeMs: this.processingTimeMs,
      deduplicationRate: this.totalChannels > 0 ? (this.duplicatesRemoved / this.totalChannels * 100).toFixed(2) : 0,
      duplicatesBySource: Object.fromEntries(this.duplicatesBySource),
      duplicatesByType: Object.fromEntries(this.duplicatesByType),
      conflictResolutions: Object.fromEntries(this.conflictResolutions)
    };
  }
}

/**
 * Servicio principal de deduplicación de canales
 */
export class ChannelDeduplicationService {
  #config;
  #metrics;
  #logger;

  constructor(config = new DeduplicationConfig(), logger = null) {
    this.#config = config;
    this.#metrics = new DeduplicationMetrics();
    this.#logger = logger || createLogger();
  }

  /**
   * Deduplica una lista de canales
   * @param {Array<Channel>} channels - Lista de canales a deduplicar
   * @returns {Promise<{channels: Array<Channel>, metrics: Object}>}
   */
  async deduplicateChannels(channels) {
    const startTime = Date.now();
    this.#metrics.reset();
    this.#metrics.totalChannels = channels.length;

    this.#logger.info(`🔍 Iniciando deduplicación de ${channels.length} canales`);

    try {
      const deduplicatedChannels = await this.#performDeduplication(channels);
      
      this.#metrics.processingTimeMs = Math.max(1, Date.now() - startTime);
      // CORRECCIÓN: duplicatesRemoved debe ser igual a duplicatesFound
      // ya que cada duplicado encontrado resulta en la eliminación de un canal
      this.#metrics.duplicatesRemoved = this.#metrics.duplicatesFound;

      const stats = this.#metrics.getStats();
      this.#logger.info(`✅ Deduplicación completada: ${deduplicatedChannels.length} canales únicos (${stats.duplicatesRemoved} duplicados removidos)`);
      
      if (this.#config.enableMetrics) {
        this.#logDetailedStats(stats);
      }

      return {
        channels: deduplicatedChannels,
        metrics: stats
      };
    } catch (error) {
      this.#logger.error('Error durante deduplicación:', error);
      throw error;
    }
  }

  /**
   * Realiza la deduplicación según la configuración
   * @private
   * @param {Array<Channel>} channels
   * @returns {Promise<Array<Channel>>}
   */
  async #performDeduplication(channels) {
    // Para criterios de similitud, necesitamos comparar todos los canales entre sí
    if (this.#config.criteria === DeduplicationCriteria.NAME_SIMILARITY || 
        this.#config.criteria === DeduplicationCriteria.URL_SIMILARITY ||
        this.#config.criteria === DeduplicationCriteria.COMBINED) {
      return await this.#performSimilarityBasedDeduplication(channels);
    }
    
    // Para ID exacto, usar el algoritmo original más eficiente
    return await this.#performExactKeyDeduplication(channels);
  }

  /**
   * Deduplicación basada en claves exactas (más eficiente)
   * @private
   * @param {Array<Channel>} channels
   * @returns {Promise<Array<Channel>>}
   */
  async #performExactKeyDeduplication(channels) {
    const channelMap = new Map();
    const processedIds = new Set();

    for (const channel of channels) {
      const duplicateKey = this.#generateDuplicateKey(channel);
      
      if (processedIds.has(duplicateKey)) {
        // Canal duplicado encontrado
        const existingChannel = channelMap.get(duplicateKey);
        const resolution = await this.#resolveConflict(existingChannel, channel);
        
        this.#metrics.addDuplicate(
          channel.metadata?.source || 'unknown',
          this.#config.criteria,
          resolution.strategy
        );

        if (resolution.shouldReplace) {
          channelMap.set(duplicateKey, resolution.selectedChannel);
          
          if (resolution.strategy === 'hd_upgrade') {
            this.#metrics.addHdUpgrade();
            this.#logger.info(`🔄 Canal actualizado a HD: ${channel.name} (${existingChannel.quality.value} → ${channel.quality.value})`);
          }
        }
      } else {
        // Canal único, agregar directamente
        channelMap.set(duplicateKey, channel);
        processedIds.add(duplicateKey);
      }
    }

    return Array.from(channelMap.values());
  }

  /**
   * Deduplicación basada en similitud (compara todos los canales)
   * @private
   * @param {Array<Channel>} channels
   * @returns {Promise<Array<Channel>>}
   */
  async #performSimilarityBasedDeduplication(channels) {
    const uniqueChannels = [];
    const removedChannels = [];

    for (const channel of channels) {
      let isDuplicate = false;
      let duplicateIndex = -1;

      // Comparar con todos los canales únicos existentes
      for (let i = 0; i < uniqueChannels.length; i++) {
        const existingChannel = uniqueChannels[i];
        
        if (this.#areChannelsDuplicate(existingChannel, channel)) {
          isDuplicate = true;
          duplicateIndex = i;
          break;
        }
      }

      if (isDuplicate) {
        // Canal duplicado encontrado
        const existingChannel = uniqueChannels[duplicateIndex];
        const resolution = await this.#resolveConflict(existingChannel, channel);
        
        this.#metrics.addDuplicate(
          channel.metadata?.source || 'unknown',
          this.#config.criteria,
          resolution.strategy
        );

        if (resolution.shouldReplace) {
          // Reemplazar el canal existente
          uniqueChannels[duplicateIndex] = resolution.selectedChannel;
          removedChannels.push(existingChannel);
          
          if (resolution.strategy === 'hd_upgrade') {
            this.#metrics.addHdUpgrade();
            this.#logger.info(`🔄 Canal actualizado a HD: ${channel.name} (${existingChannel.quality.value} → ${channel.quality.value})`);
          }
        } else {
          // Mantener el canal existente, ignorar el nuevo
          removedChannels.push(channel);
        }
      } else {
        // Canal único, agregar a la lista
        uniqueChannels.push(channel);
      }
    }

    return uniqueChannels;
  }

  /**
   * Genera clave única para detección de duplicados
   * @private
   * @param {Channel} channel
   * @returns {string}
   */
  #generateDuplicateKey(channel) {
    switch (this.#config.criteria) {
      case DeduplicationCriteria.ID_EXACT:
        return channel.id;
      
      case DeduplicationCriteria.NAME_SIMILARITY:
        // Si el canal tiene patrones HD, usar normalización específica
        if (this.#hasHDPatterns(channel.name)) {
          return this.#normalizeChannelNameForHDPatterns(channel.name);
        }
        return this.#normalizeChannelName(channel.name);
      
      case DeduplicationCriteria.URL_SIMILARITY:
        return this.#normalizeUrl(channel.streamUrl);
      
      case DeduplicationCriteria.COMBINED:
      default:
        // Usar ID como clave principal, pero permitir comparaciones adicionales
        return channel.id;
    }
  }

  /**
   * Resuelve conflictos entre canales duplicados
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Promise<{shouldReplace: boolean, selectedChannel: Channel, strategy: string}>}
   */
  async #resolveConflict(existingChannel, newChannel) {
    // Verificar si son realmente duplicados usando criterios adicionales
    if (!this.#areChannelsDuplicate(existingChannel, newChannel)) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'not_duplicate'
      };
    }

    switch (this.#config.strategy) {
      case ConflictResolutionStrategy.KEEP_FIRST:
        return {
          shouldReplace: false,
          selectedChannel: existingChannel,
          strategy: 'keep_first'
        };

      case ConflictResolutionStrategy.KEEP_LAST:
        return {
          shouldReplace: true,
          selectedChannel: newChannel,
          strategy: 'keep_last'
        };

      case ConflictResolutionStrategy.PRIORITIZE_HD:
        return this.#resolveByHdPriority(existingChannel, newChannel);

      case ConflictResolutionStrategy.PRIORITIZE_SOURCE:
        return this.#resolveBySourcePriority(existingChannel, newChannel);

      case ConflictResolutionStrategy.CUSTOM:
      default:
        return this.#resolveByCustomLogic(existingChannel, newChannel);
    }
  }

  /**
   * Verifica si dos canales son realmente duplicados
   * Implementa estrategia de dos fases: primero URLs idénticas, luego nombres normalizados
   * @private
   * @param {Channel} channel1
   * @param {Channel} channel2
   * @returns {boolean}
   */
  #areChannelsDuplicate(channel1, channel2) {
    // Verificación por ID exacto
    if (channel1.id === channel2.id) {
      return true;
    }

    // FASE 1: Verificación por URL exacta (100% de igualdad) - PRIORIDAD MÁXIMA
    if (channel1.streamUrl && channel2.streamUrl && 
        channel1.streamUrl === channel2.streamUrl) {
      return true;
    }

    // FASE 2: Verificación por similitud de URL (si está habilitada)
    if (this.#config.criteria === DeduplicationCriteria.URL_SIMILARITY ||
        this.#config.criteria === DeduplicationCriteria.COMBINED) {
      if (channel1.streamUrl && channel2.streamUrl) {
        const urlSimilarity = this.#calculateStringSimilarity(
          this.#normalizeUrl(channel1.streamUrl),
          this.#normalizeUrl(channel2.streamUrl)
        );
        if (urlSimilarity >= this.#config.urlSimilarityThreshold) {
          return true;
        }
      }
    }

    // FASE 3: Verificación por similitud de nombre normalizado
    if (this.#config.criteria === DeduplicationCriteria.NAME_SIMILARITY ||
        this.#config.criteria === DeduplicationCriteria.COMBINED) {
      let nameSimilarity;
      
      // Si ambos canales tienen patrones de calidad, usar normalización específica
      const channel1HasQuality = this.#hasQualityPatterns(channel1.name);
      const channel2HasQuality = this.#hasQualityPatterns(channel2.name);
      
      if (channel1HasQuality && channel2HasQuality) {
        // Usar normalización que remueve patrones de calidad para comparación
        nameSimilarity = this.#calculateStringSimilarity(
          this.#normalizeChannelNameForQualityPatterns(channel1.name),
          this.#normalizeChannelNameForQualityPatterns(channel2.name)
        );
      } else {
        // Usar normalización estándar (remueve prefijos numéricos y normaliza)
        nameSimilarity = this.#calculateStringSimilarity(
          this.#normalizeChannelName(channel1.name),
          this.#normalizeChannelName(channel2.name)
        );
      }

      return nameSimilarity >= this.#config.nameSimilarityThreshold;
    }

    return false;
  }

  /**
   * Resuelve conflicto priorizando versiones de mayor calidad
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Object}
   */
  #resolveByHdPriority(existingChannel, newChannel) {
    if (!this.#config.enableHdUpgrade) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'hd_disabled'
      };
    }

    // Verificar calidad por nombre del canal
    const existingIsHighQuality = this.#isHighQuality(existingChannel.name);
    const newIsHighQuality = this.#isHighQuality(newChannel.name);
    const existingIsLowQuality = this.#isLowQuality(existingChannel.name);
    const newIsLowQuality = this.#isLowQuality(newChannel.name);
    
    // REGLA PRINCIPAL: Los canales HD nunca deben ser eliminados por canales SD
    if (existingIsHighQuality && newIsLowQuality) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'protect_hd_from_sd'
      };
    }
    
    // REGLA PRINCIPAL: Los canales SD deben ser reemplazados por canales HD
    if (existingIsLowQuality && newIsHighQuality) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'upgrade_sd_to_hd'
      };
    }
    
    // REGLA NUEVA: Canal sin patrones de calidad debe ser reemplazado por canal HD
    if (!existingIsHighQuality && !existingIsLowQuality && newIsHighQuality) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'upgrade_generic_to_hd'
      };
    }
    
    // REGLA NUEVA: Canal HD nunca debe ser reemplazado por canal sin patrones de calidad
    if (existingIsHighQuality && !newIsHighQuality && !newIsLowQuality) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'protect_hd_from_generic'
      };
    }
    
    // Si ambos tienen patrones de calidad, usar lógica avanzada
    if ((existingIsHighQuality || existingIsLowQuality) && (newIsHighQuality || newIsLowQuality)) {
      return this.#resolveQualityPatternConflict(existingChannel, newChannel);
    }

    // Verificar calidad por objeto quality (fallback)
    const existingQuality = existingChannel.quality?.value || 'SD';
    const newQuality = newChannel.quality?.value || 'SD';
    
    const existingIsHdByObject = existingQuality === 'HD' || existingQuality === 'FHD' || existingQuality === '4K';
    const newIsHdByObject = newQuality === 'HD' || newQuality === 'FHD' || newQuality === '4K';

    if (newIsHdByObject && !existingIsHdByObject) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'hd_upgrade_by_object'
      };
    }
    
    if (existingIsHdByObject && !newIsHdByObject) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'protect_hd_by_object'
      };
    }

    return {
      shouldReplace: false,
      selectedChannel: existingChannel,
      strategy: 'hd_keep_existing'
    };
  }

  /**
   * Resuelve conflictos específicos entre canales con patrones de calidad
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Object}
   */
  #resolveQualityPatternConflict(existingChannel, newChannel) {
    const existingPattern = this.#getQualityPatternType(existingChannel.name);
    const newPattern = this.#getQualityPatternType(newChannel.name);
    
    // Prioridad de patrones de calidad (mayor a menor)
    const patternPriority = {
      // Alta calidad
      '4k': 100,           // 4K - máxima prioridad
      'uhd': 95,           // UHD
      'fhd': 90,           // FHD
      'numbered_hd': 85,   // ESPN 4HD, 6HD, etc.
      '_hd': 80,           // _HD
      'hd_word': 75,       // HD como palabra
      
      // Baja calidad (siempre menor que alta calidad)
      'sd_variant': 25,    // SD_IN, SD_OUT, etc.
      '_sd': 20,           // _SD
      'numbered_sd': 15,   // 1SD, 2SD, etc.
      'sd_word': 10,       // SD como palabra
      
      'none': 0
    };
    
    const existingPriority = patternPriority[existingPattern] || 0;
    const newPriority = patternPriority[newPattern] || 0;
    
    // REGLA FUNDAMENTAL: Cualquier patrón HD (75+) tiene prioridad sobre cualquier patrón SD (25-)
    const existingIsHD = existingPriority >= 75;
    const newIsHD = newPriority >= 75;
    const existingIsSD = existingPriority > 0 && existingPriority <= 25;
    const newIsSD = newPriority > 0 && newPriority <= 25;
    
    // Proteger HD de SD
    if (existingIsHD && newIsSD) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'protect_hd_pattern_from_sd'
      };
    }
    
    // Actualizar SD a HD
    if (existingIsSD && newIsHD) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'upgrade_sd_pattern_to_hd'
      };
    }
    
    // Si el nuevo canal tiene mayor prioridad de patrón (dentro de la misma categoría)
    if (newPriority > existingPriority) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'quality_pattern_upgrade'
      };
    }
    
    // Si tienen la misma prioridad de patrón, usar criterios adicionales
    if (newPriority === existingPriority && newPriority > 0) {
      return this.#resolveQualityPatternTieBreaker(existingChannel, newChannel);
    }
    
    return {
      shouldReplace: false,
      selectedChannel: existingChannel,
      strategy: 'quality_pattern_keep_existing'
    };
  }

  /**
   * Resuelve empates entre canales con el mismo tipo de patrón de calidad
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Object}
   */
  #resolveQualityPatternTieBreaker(existingChannel, newChannel) {
    const existingPattern = this.#getQualityPatternType(existingChannel.name);
    const newPattern = this.#getQualityPatternType(newChannel.name);
    
    // Para canales numbered_hd, priorizar números más altos (ESPN 7HD > ESPN 4HD)
    if (existingPattern === 'numbered_hd' && newPattern === 'numbered_hd') {
      const existingNumber = this.#extractNumberFromHDPattern(existingChannel.name);
      const newNumber = this.#extractNumberFromHDPattern(newChannel.name);
      
      if (newNumber > existingNumber) {
        return {
          shouldReplace: true,
          selectedChannel: newChannel,
          strategy: 'numbered_hd_upgrade'
        };
      }
    }
    
    // Para canales numbered_sd, priorizar números más altos también
    if (existingPattern === 'numbered_sd' && newPattern === 'numbered_sd') {
      const existingNumber = this.#extractNumberFromSDPattern(existingChannel.name);
      const newNumber = this.#extractNumberFromSDPattern(newChannel.name);
      
      if (newNumber > existingNumber) {
        return {
          shouldReplace: true,
          selectedChannel: newChannel,
          strategy: 'numbered_sd_upgrade'
        };
      }
    }
    
    // Para variantes SD (SD_IN, SD_OUT), priorizar por especificidad
    if (existingPattern === 'sd_variant' && newPattern === 'sd_variant') {
      // Priorizar variantes más específicas o comunes
      const variantPriority = {
        'sd_in': 30,
        'sd_out': 25,
        'sd_hd': 20,  // Casos híbridos
        'sd_default': 10
      };
      
      const existingVariant = this.#extractSDVariant(existingChannel.name);
      const newVariant = this.#extractSDVariant(newChannel.name);
      
      const existingVariantPriority = variantPriority[existingVariant] || 10;
      const newVariantPriority = variantPriority[newVariant] || 10;
      
      if (newVariantPriority > existingVariantPriority) {
        return {
          shouldReplace: true,
          selectedChannel: newChannel,
          strategy: 'sd_variant_upgrade'
        };
      }
    }
    
    // Criterios adicionales: longitud del nombre (más específico)
    const existingSpecificity = existingChannel.name.length;
    const newSpecificity = newChannel.name.length;
    
    if (newSpecificity > existingSpecificity) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'quality_specificity_upgrade'
      };
    }
    
    return {
      shouldReplace: false,
      selectedChannel: existingChannel,
      strategy: 'quality_pattern_tie_keep_existing'
    };
  }

  /**
   * Extrae el número de un patrón HD numerado
   * @private
   * @param {string} name
   * @returns {number}
   */
  #extractNumberFromHDPattern(name) {
    const match = name.toLowerCase().match(/\b(\d+)hd\b/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Extrae el número de un patrón SD numerado
   * @private
   * @param {string} name
   * @returns {number}
   */
  #extractNumberFromSDPattern(name) {
    const match = name.toLowerCase().match(/\b(\d+)sd\b/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Extrae la variante específica de un patrón SD
   * @private
   * @param {string} name
   * @returns {string}
   */
  #extractSDVariant(name) {
    const lowerName = name.toLowerCase();
    
    if (/\bsd_in\b/.test(lowerName)) return 'sd_in';
    if (/\bsd_out\b/.test(lowerName)) return 'sd_out';
    if (/\bsd_hd\b/.test(lowerName)) return 'sd_hd';
    if (/\bsd_\w+\b/.test(lowerName)) {
      const match = lowerName.match(/\bsd_(\w+)\b/);
      return match ? `sd_${match[1]}` : 'sd_default';
    }
    
    return 'sd_default';
  }

  /**
   * Resuelve conflicto priorizando por fuente
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Object}
   */
  #resolveBySourcePriority(existingChannel, newChannel) {
    if (!this.#config.preserveSourcePriority) {
      return this.#resolveByHdPriority(existingChannel, newChannel);
    }

    const existingSource = existingChannel.metadata?.source || 'unknown';
    const newSource = newChannel.metadata?.source || 'unknown';

    const existingPriority = this.#config.sourcePriority.indexOf(existingSource);
    const newPriority = this.#config.sourcePriority.indexOf(newSource);

    // Prioridad más baja = mayor importancia (índice 0 es más prioritario)
    if (existingPriority !== -1 && (newPriority === -1 || existingPriority < newPriority)) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'source_priority'
      };
    }

    if (newPriority !== -1 && (existingPriority === -1 || newPriority < existingPriority)) {
      this.#metrics.addSourceConflict();
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'source_priority'
      };
    }

    // Si ambos tienen la misma prioridad de fuente, usar lógica HD
    return this.#resolveByHdPriority(existingChannel, newChannel);
  }

  /**
   * Resuelve conflicto usando lógica personalizada
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Object}
   */
  #resolveByCustomLogic(existingChannel, newChannel) {
    // Combinar estrategias: fuente > HD > calidad > fecha
    const sourceResolution = this.#resolveBySourcePriority(existingChannel, newChannel);
    
    if (sourceResolution.strategy === 'source_priority') {
      return sourceResolution;
    }

    const hdResolution = this.#resolveByHdPriority(existingChannel, newChannel);
    
    if (hdResolution.strategy === 'hd_upgrade') {
      return hdResolution;
    }

    // Si no hay diferencia clara, mantener el existente
    return {
      shouldReplace: false,
      selectedChannel: existingChannel,
      strategy: 'custom_keep_existing'
    };
  }

  /**
   * Normaliza nombre de canal para comparación
   * @private
   * @param {string} name
   * @returns {string}
   */
  #normalizeChannelName(name) {
    if (!name || typeof name !== 'string') {
      return '';
    }
    
    let normalized = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
      .replace(/\s+/g, ' ')        // Normalizar espacios
      .trim();
    
    // Remover SOLO prefijos numéricos que están claramente separados por guión
    // Preservar números que son parte del nombre del canal (ej: "Fox Sports 2")
    normalized = normalized.replace(/^\d+\s*-\s*/, '');
    
    // Remover sufijos de calidad comunes
    normalized = normalized
      .replace(/\s+(hd|sd|fhd|uhd|4k)$/g, '')
      .replace(/\s+\d+hd$/g, '') // Remover variantes como "6hd"
      .replace(/_hd$/g, '');     // Remover "_hd"
    
    // Normalizar números romanos a arábigos para mejor comparación
    const romanToArabic = {
      'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
      'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'
    };
    
    // Reemplazar números romanos al final del nombre
    normalized = normalized.replace(/\s+(i{1,3}|iv|v|vi{1,3}|ix|x)$/g, (match, roman) => {
      return ' ' + (romanToArabic[roman] || roman);
    });
    
    // Normalizar variaciones de "canal" (ej: "canal 1", "canal uno" -> "canal 1")
    const numberWords = {
      'uno': '1', 'dos': '2', 'tres': '3', 'cuatro': '4', 'cinco': '5',
      'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9', 'diez': '10',
      'once': '11', 'doce': '12', 'trece': '13', 'catorce': '14', 'quince': '15'
    };
    
    Object.entries(numberWords).forEach(([word, number]) => {
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      normalized = normalized.replace(regex, number);
    });
    
    return normalized.trim();
  }

  /**
   * Normaliza el nombre del canal removiendo patrones de calidad específicos
   * @private
   * @param {string} name
   * @returns {string}
   */
  #normalizeChannelNameForQualityPatterns(name) {
    if (!name || typeof name !== 'string') {
      return '';
    }
    
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
      .replace(/\s+/g, ' ')        // Normalizar espacios
      // Remueve patrones HD numerados
      .replace(/\b\d+hd\b/g, '')
      .replace(/\bhd\s*\d+\b/g, '')
      // Remueve patrones SD numerados
      .replace(/\b\d+sd\b/g, '')
      .replace(/\bsd\s*\d+\b/g, '')
      // Remueve indicadores de calidad HD
      .replace(/_hd\b/g, '')       // Remover _hd
      .replace(/\bhd\b/g, '')      // Remover hd como palabra completa
      .replace(/\buhd\b/g, '')     // Remover uhd
      .replace(/\bfhd\b/g, '')     // Remover fhd
      .replace(/\b4k\b/g, '')      // Remover 4k
      // Remueve indicadores de calidad SD y variantes
      .replace(/\bsd(_\w+)?\b/g, '') // Remover sd y variantes como sd_in, sd_out
      .replace(/_sd\b/g, '')       // Remover _sd
      .replace(/\s+/g, ' ')        // Normalizar espacios nuevamente
      .trim();
  }

  /**
   * Normaliza nombre de canal removiendo patrones HD específicos (compatibilidad)
   * @private
   * @param {string} name
   * @returns {string}
   */
  #normalizeChannelNameForHDPatterns(name) {
    return this.#normalizeChannelNameForQualityPatterns(name);
  }

  /**
   * Detecta si un canal tiene patrones de calidad específicos (HD, SD, etc.)
   * @private
   * @param {string} name
   * @returns {boolean}
   */
  #hasQualityPatterns(name) {
    if (!name || typeof name !== 'string') {
      return false;
    }
    
    const lowerName = name.toLowerCase();
    
    // Patrones de calidad específicos (HD y SD)
    const qualityPatterns = [
      /_hd\b/,           // _hd
      /\bhd\b/,          // hd como palabra completa
      /\b\d+hd\b/,       // variantes numéricas (4hd, 6hd, etc.)
      /\buhd\b/,         // uhd
      /\bfhd\b/,         // fhd
      /\b4k\b/,          // 4k
      /\bsd\b/,          // sd como palabra completa
      /_sd\b/,           // _sd
      /\bsd_\w+\b/,      // sd_in, sd_out, etc.
      /\b\d+sd\b/        // variantes numéricas SD (1sd, 2sd, etc.)
    ];
    
    return qualityPatterns.some(pattern => pattern.test(lowerName));
  }

  /**
   * Detecta si un canal tiene patrones HD específicos (mantener compatibilidad)
   * @private
   * @param {string} name
   * @returns {boolean}
   */
  #hasHDPatterns(name) {
    return this.#hasQualityPatterns(name) && this.#isHighQuality(name);
  }

  /**
   * Determina si un canal es de alta calidad (HD, 4K, UHD, FHD)
   * @private
   * @param {string} name
   * @returns {boolean}
   */
  #isHighQuality(name) {
    if (!name || typeof name !== 'string') {
      return false;
    }
    
    const lowerName = name.toLowerCase();
    
    // Patrones de alta calidad
    const highQualityPatterns = [
      /_hd\b/,           // _hd
      /\bhd\b/,          // hd como palabra completa
      /\b\d+hd\b/,       // variantes numéricas (4hd, 6hd, etc.)
      /\buhd\b/,         // uhd
      /\bfhd\b/,         // fhd
      /\b4k\b/           // 4k
    ];
    
    return highQualityPatterns.some(pattern => pattern.test(lowerName));
  }

  /**
   * Determina si un canal es de baja calidad (SD)
   * @private
   * @param {string} name
   * @returns {boolean}
   */
  #isLowQuality(name) {
    if (!name || typeof name !== 'string') {
      return false;
    }
    
    const lowerName = name.toLowerCase();
    
    // Patrones de baja calidad
    const lowQualityPatterns = [
      /\bsd\b/,          // sd como palabra completa
      /_sd\b/,           // _sd
      /\bsd_\w+\b/,      // sd_in, sd_out, etc.
      /\b\d+sd\b/        // variantes numéricas SD (1sd, 2sd, etc.)
    ];
    
    return lowQualityPatterns.some(pattern => pattern.test(lowerName));
  }

  /**
   * Obtiene el tipo de patrón de calidad de un canal
   * @private
   * @param {string} name
   * @returns {string}
   */
  #getQualityPatternType(name) {
    if (!name || typeof name !== 'string') {
      return 'none';
    }
    
    const lowerName = name.toLowerCase();
    
    // Patrones de alta calidad (orden de prioridad)
    if (/\b4k\b/.test(lowerName)) return '4k';
    if (/\buhd\b/.test(lowerName)) return 'uhd';
    if (/\bfhd\b/.test(lowerName)) return 'fhd';
    if (/\b\d+hd\b/.test(lowerName)) return 'numbered_hd';
    if (/_hd\b/.test(lowerName)) return '_hd';
    if (/\bhd\b/.test(lowerName)) return 'hd_word';
    
    // Patrones de baja calidad
    if (/\bsd_\w+\b/.test(lowerName)) return 'sd_variant';
    if (/_sd\b/.test(lowerName)) return '_sd';
    if (/\b\d+sd\b/.test(lowerName)) return 'numbered_sd';
    if (/\bsd\b/.test(lowerName)) return 'sd_word';
    
    return 'none';
  }

  /**
   * Obtiene el tipo de patrón HD de un canal (mantener compatibilidad)
   * @private
   * @param {string} name
   * @returns {string}
   */
  #getHDPatternType(name) {
    const qualityType = this.#getQualityPatternType(name);
    
    // Solo retornar tipos HD
    if (['4k', 'uhd', 'fhd', 'numbered_hd', '_hd', 'hd_word'].includes(qualityType)) {
      return qualityType;
    }
    
    return 'none';
  }

  /**
   * Normaliza URL para comparación
   * @private
   * @param {string} url
   * @returns {string}
   */
  #normalizeUrl(url) {
    if (!url || typeof url !== 'string') {
      return '';
    }
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}${urlObj.pathname}`.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * Calcula similitud entre dos strings usando algoritmo mejorado
   * @private
   * @param {string} str1
   * @param {string} str2
   * @returns {number} Similitud entre 0 y 1
   */
  #calculateStringSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    // Verificar si ambas cadenas contienen números al final
    const hasNumber1 = /\d+$/.test(str1.trim());
    const hasNumber2 = /\d+$/.test(str2.trim());
    
    // Si ambas tienen números al final, deben ser exactamente iguales para ser consideradas duplicadas
    if (hasNumber1 && hasNumber2) {
      return str1 === str2 ? 1.0 : 0.0;
    }

    // Verificar si uno es subcadena del otro (para casos como "CNN" vs "105-CNN")
    const shorter = str1.length < str2.length ? str1 : str2;
    const longer = str1.length < str2.length ? str2 : str1;
    
    if (longer.includes(shorter) && shorter.length >= 3) {
      // Si la cadena más corta tiene números al final, ser más estricto
      if (hasNumber1 || hasNumber2) {
        // Solo considerar duplicado si la diferencia es solo prefijos numéricos
        const withoutPrefix = longer.replace(/^\d+/, '');
        if (withoutPrefix === shorter) {
          const lengthRatio = shorter.length / longer.length;
          return Math.min(0.95, 0.7 + (lengthRatio * 0.25));
        }
        return 0.0;
      }
      
      // Bonus por subcadena, pero penalizar por diferencia de longitud
      const lengthRatio = shorter.length / longer.length;
      return Math.min(0.95, 0.7 + (lengthRatio * 0.25));
    }

    // Algoritmo de distancia de Levenshtein normalizada
    const maxLength = Math.max(str1.length, str2.length);
    const distance = this.#levenshteinDistance(str1, str2);
    
    return 1 - (distance / maxLength);
  }

  /**
   * Calcula distancia de Levenshtein entre dos strings
   * @private
   * @param {string} str1
   * @param {string} str2
   * @returns {number}
   */
  #levenshteinDistance(str1, str2) {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Registra estadísticas detalladas
   * @private
   * @param {Object} stats
   */
  #logDetailedStats(stats) {
    this.#logger.info(`📊 Estadísticas de deduplicación:`);
    this.#logger.info(`   - Canales procesados: ${stats.totalChannels}`);
    this.#logger.info(`   - Duplicados encontrados: ${stats.duplicatesFound}`);
    this.#logger.info(`   - Duplicados removidos: ${stats.duplicatesRemoved}`);
    this.#logger.info(`   - Actualizaciones HD: ${stats.hdUpgrades}`);
    this.#logger.info(`   - Conflictos de fuente: ${stats.sourceConflicts}`);
    this.#logger.info(`   - Tasa de deduplicación: ${stats.deduplicationRate}%`);
    this.#logger.info(`   - Tiempo de procesamiento: ${stats.processingTimeMs}ms`);
    
    if (Object.keys(stats.duplicatesBySource).length > 0) {
      this.#logger.debug(`   - Duplicados por fuente:`, stats.duplicatesBySource);
    }
  }

  /**
   * Obtiene configuración actual
   * @returns {DeduplicationConfig}
   */
  getConfig() {
    return this.#config;
  }

  /**
   * Actualiza configuración
   * @param {DeduplicationConfig} newConfig
   */
  updateConfig(newConfig) {
    this.#config = newConfig;
    this.#logger.info('Configuración de deduplicación actualizada');
  }

  /**
   * Obtiene métricas actuales
   * @returns {Object}
   */
  getMetrics() {
    return this.#metrics.getStats();
  }
}

export { DeduplicationConfig, DeduplicationMetrics };