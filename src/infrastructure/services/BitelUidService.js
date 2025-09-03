/**
 * @fileoverview BitelUidService - Servicio para generar UIDs dinámicos para canales TV360.BITEL
 * Servicio principal que orquesta la generación de UIDs usando herramientas auxiliares
 * 
 * Flujo de datos:
 * 1. Recibe URLs de canales y las valida usando tools
 * 2. Gestiona cache de UIDs usando herramientas de cache
 * 3. Genera UIDs dinámicos usando generadores de tools
 * 4. Construye URLs finales usando builders de tools
 * 5. Delega operaciones auxiliares a BitelUidService_tools
 * 
 * Arquitectura:
 * - Lógica principal: orquestación de generación de UIDs
 * - Herramientas: funciones puras en _tools.js
 * - Dependency Injection: inyección de herramientas para testing
 */

import {
  isBitelChannel,
  generateDynamicUid,
  buildUrlWithUid,
  needsUidRegeneration,
  generateCacheStats,
  clearUidCache,
  validateBitelConfig,
  processChannelUrl,
  incrementStats,
  createUidLogMessage,
  DEFAULT_BITEL_CONFIG
} from './BitelUidService_tools.js';

/**
 * Servicio especializado en la generación de UIDs dinámicos para canales TV360.BITEL
 * Responsabilidad única: gestionar la estabilidad de streams BITEL mediante UIDs generados
 */
export class BitelUidService {
  /**
   * @private
   */
  #config;
  #logger;
  #uidCache;
  #lastGenerationTime;
  #stats;
  #tools;

  /**
   * Constructor con dependency injection para herramientas
   * @param {Object} config - Configuración del servicio
   * @param {Object} logger - Logger para trazabilidad
   * @param {Object} tools - Herramientas inyectadas (para testing)
   */
  constructor(config = {}, logger = console, tools = null) {
    // Inyección de dependencias para herramientas
    this.#tools = tools || {
      isBitelChannel,
      generateDynamicUid,
      buildUrlWithUid,
      needsUidRegeneration,
      generateCacheStats,
      clearUidCache,
      validateBitelConfig,
      processChannelUrl,
      incrementStats,
      createUidLogMessage,
      DEFAULT_BITEL_CONFIG
    };
    
    // Validación de configuración usando herramientas
    this.#config = this.#tools.validateBitelConfig(config);
    this.#logger = logger;
    this.#uidCache = new Map();
    this.#lastGenerationTime = new Map();
    this.#stats = {
      totalGenerations: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Procesa una URL de canal y genera UID dinámico si es necesario
   * @param {string} streamUrl - URL original del stream
   * @param {string} channelId - ID del canal para cache
   * @returns {string} URL procesada con UID dinámico
   */
  processStreamUrl(streamUrl, channelId) {
    try {
      const result = this.#tools.processChannelUrl(
        streamUrl,
        channelId,
        this.#uidCache,
        this.#lastGenerationTime,
        this.#config
      );
      
      if (!result.processed) {
        return streamUrl;
      }
      
      // Actualizar estadísticas
      if (result.regenerated) {
        this.#stats = this.#tools.incrementStats(this.#stats, 'totalGenerations');
        this.#stats = this.#tools.incrementStats(this.#stats, 'cacheMisses');
        
        if (this.#logger.debug) {
          const logMessage = this.#tools.createUidLogMessage(
            'Nuevo',
            channelId,
            result.uid
          );
          this.#logger.debug(logMessage);
        }
      } else {
        this.#stats = this.#tools.incrementStats(this.#stats, 'cacheHits');
      }
      
      if (this.#logger.debug) {
        this.#logger.debug(`URL BITEL procesada para ${channelId}: ${result.url}`);
      }
      
      return result.url;
    } catch (error) {
      // Manejo robusto de errores para evitar promesas rechazadas no manejadas
      this.#logger.warn(`Error procesando URL Bitel ${streamUrl}: ${error.message}. Usando URL original.`);
      
      // Incrementar contador de errores para monitoreo
      this.#stats = this.#tools.incrementStats(this.#stats, 'errors');
      
      return streamUrl; // Fallback a URL original
    }
  }

  /**
   * Limpia el cache de UIDs (útil para mantenimiento) usando herramientas
   * @param {string} channelId - ID específico del canal (opcional)
   */
  clearCache(channelId = null) {
    const result = this.#tools.clearUidCache(
      this.#uidCache,
      this.#lastGenerationTime,
      channelId
    );
    
    if (this.#logger.debug) {
      if (result.action === 'single_channel') {
        this.#logger.debug(`Cache limpiado para canal ${channelId}`);
      } else {
        this.#logger.debug(`Cache de UIDs completamente limpiado (${result.clearedCount} canales)`);
      }
    }
    
    return result;
  }

  /**
   * Obtiene estadísticas del servicio usando herramientas
   * @returns {Object} Estadísticas de uso
   */
  getStats() {
    return this.#tools.generateCacheStats(
      this.#uidCache,
      this.#lastGenerationTime,
      this.#stats
    );
  }

  /**
   * Verifica si un canal está en cache
   * @param {string} channelId - ID del canal
   * @returns {boolean}
   */
  isChannelCached(channelId) {
    return this.#uidCache.has(channelId);
  }

  /**
   * Obtiene la configuración actual del servicio
   * @returns {Object} Configuración del servicio
   */
  getConfig() {
    return { ...this.#config };
  }

  /**
   * Actualiza la configuración del servicio usando herramientas
   * @param {Object} newConfig - Nueva configuración
   */
  updateConfig(newConfig) {
    this.#config = this.#tools.validateBitelConfig({
      ...this.#config,
      ...newConfig
    });
  }

  /**
   * Fuerza la regeneración de UID para un canal específico
   * @param {string} channelId - ID del canal
   * @returns {string|null} Nuevo UID generado o null si no existe
   */
  forceRegenerateUid(channelId) {
    if (!this.#uidCache.has(channelId)) {
      return null;
    }
    
    const newUid = this.#tools.generateDynamicUid(this.#config.uidPrefix);
    this.#uidCache.set(channelId, newUid);
    this.#lastGenerationTime.set(channelId, Date.now());
    
    this.#stats = this.#tools.incrementStats(this.#stats, 'totalGenerations');
    
    if (this.#logger.debug) {
      const logMessage = this.#tools.createUidLogMessage(
        'Regenerado forzado',
        channelId,
        newUid
      );
      this.#logger.debug(logMessage);
    }
    
    return newUid;
  }
}

export default BitelUidService;