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
    urlSimilarityThreshold = 0.90,
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
      this.#metrics.duplicatesRemoved = channels.length - deduplicatedChannels.length;

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
        } else {
          this.#logger.warn(`[WARN] Canal duplicado ignorado: ${channel.id}`);
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
          this.#logger.warn(`[WARN] Canal duplicado ignorado: ${channel.id}`);
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

    // Verificación por similitud de nombre
    const nameSimilarity = this.#calculateStringSimilarity(
      this.#normalizeChannelName(channel1.name),
      this.#normalizeChannelName(channel2.name)
    );

    if (nameSimilarity >= this.#config.nameSimilarityThreshold) {
      return true;
    }

    // Verificación por similitud de URL
    const urlSimilarity = this.#calculateStringSimilarity(
      this.#normalizeUrl(channel1.streamUrl),
      this.#normalizeUrl(channel2.streamUrl)
    );

    return urlSimilarity >= this.#config.urlSimilarityThreshold;
  }

  /**
   * Resuelve conflicto priorizando versiones HD
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

    const existingQuality = existingChannel.quality?.value || 'SD';
    const newQuality = newChannel.quality?.value || 'SD';
    
    const existingIsHd = existingQuality === 'HD' || existingQuality === 'FHD' || existingQuality === '4K';
    const newIsHd = newQuality === 'HD' || newQuality === 'FHD' || newQuality === '4K';

    if (newIsHd && !existingIsHd) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'hd_upgrade'
      };
    }

    return {
      shouldReplace: false,
      selectedChannel: existingChannel,
      strategy: 'hd_keep_existing'
    };
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
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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
   * Calcula similitud entre dos strings usando algoritmo Jaro-Winkler simplificado
   * @private
   * @param {string} str1
   * @param {string} str2
   * @returns {number} Similitud entre 0 y 1
   */
  #calculateStringSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    // Algoritmo simplificado de distancia de Levenshtein normalizada
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