/**
 * @fileoverview BitelUidService - Servicio para generar UIDs dinámicos para canales TV360.BITEL
 * Implementa la generación automática de UIDs para estabilizar streams de BITEL
 */

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

  /**
   * @param {Object} config - Configuración del servicio
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(config, logger = console) {
    this.#config = config;
    this.#logger = logger;
    this.#uidCache = new Map();
    this.#lastGenerationTime = new Map();
  }

  /**
   * Procesa una URL de canal y genera UID dinámico si es necesario
   * @param {string} streamUrl - URL original del stream
   * @param {string} channelId - ID del canal para cache
   * @returns {string} URL procesada con UID dinámico
   */
  processStreamUrl(streamUrl, channelId) {
    if (!this.#isBitelChannel(streamUrl)) {
      return streamUrl;
    }

    try {
      const processedUrl = this.#generateBitelUrlWithUid(streamUrl, channelId);
      if (this.#logger.debug) {
        this.#logger.debug(`URL BITEL procesada para ${channelId}: ${processedUrl}`);
      }
      return processedUrl;
    } catch (error) {
      this.#logger.warn(`Error procesando URL BITEL para ${channelId}: ${error.message}`);
      return streamUrl; // Fallback a URL original
    }
  }

  /**
   * Verifica si una URL pertenece a TV360.BITEL
   * @private
   * @param {string} streamUrl
   * @returns {boolean}
   */
  #isBitelChannel(streamUrl) {
    return streamUrl && streamUrl.includes('tv360.bitel.com.pe');
  }

  /**
   * Genera URL con UID dinámico para canales BITEL
   * @private
   * @param {string} streamUrl - URL original
   * @param {string} channelId - ID del canal
   * @returns {string} URL con UID generado
   */
  #generateBitelUrlWithUid(streamUrl, channelId) {
    // Verificar si necesita regenerar UID (cache de 20 minutos para evitar conflictos con validación periódica)
    const now = Date.now();
    const lastGeneration = this.#lastGenerationTime.get(channelId) || 0;
    const cacheExpiry = 20 * 60 * 1000; // 20 minutos - mayor que el intervalo de validación (15 min)

    let uid;
    if (now - lastGeneration > cacheExpiry) {
      uid = this.#generateDynamicUid();
      this.#uidCache.set(channelId, uid);
      this.#lastGenerationTime.set(channelId, now);
      if (this.#logger.debug) {
        this.#logger.debug(`Nuevo UID generado para ${channelId}: ${uid}`);
      }
    } else {
      uid = this.#uidCache.get(channelId) || this.#generateDynamicUid();
    }

    return this.#buildUrlWithUid(streamUrl, uid);
  }

  /**
   * Genera un UID dinámico que empieza con '10' seguido de 6 números aleatorios
   * @private
   * @returns {string} UID generado (formato: 10XXXXXX)
   */
  #generateDynamicUid() {
    // Generar 6 números aleatorios (000000-999999)
    const randomPart = Math.floor(Math.random() * 1000000); // 0-999999
    
    // Formatear con padding para asegurar 6 dígitos
    const paddedRandom = randomPart.toString().padStart(6, '0');
    
    // Combinar '10' + 6 números aleatorios = 8 dígitos total
    return `10${paddedRandom}`;
  }

  /**
   * Construye la URL final con el UID generado
   * @private
   * @param {string} originalUrl - URL original
   * @param {string} uid - UID generado
   * @returns {string} URL final
   */
  #buildUrlWithUid(originalUrl, uid) {
    // Verificar si la URL ya tiene parámetro uid
    if (originalUrl.includes('?uid=')) {
      // Reemplazar el valor existente
      return originalUrl.replace(/\?uid=[^&]*/, `?uid=${uid}`);
    } else if (originalUrl.includes('?')) {
      // Agregar uid como parámetro adicional
      return `${originalUrl}&uid=${uid}`;
    } else {
      // Agregar uid como primer parámetro
      return `${originalUrl}?uid=${uid}`;
    }
  }

  /**
   * Limpia el cache de UIDs (útil para mantenimiento)
   * @param {string} channelId - ID específico del canal (opcional)
   */
  clearCache(channelId = null) {
    if (channelId) {
      this.#uidCache.delete(channelId);
      this.#lastGenerationTime.delete(channelId);
      if (this.#logger.debug) {
        this.#logger.debug(`Cache limpiado para canal ${channelId}`);
      }
    } else {
      this.#uidCache.clear();
      this.#lastGenerationTime.clear();
      if (this.#logger.debug) {
        this.#logger.debug('Cache de UIDs completamente limpiado');
      }
    }
  }

  /**
   * Obtiene estadísticas del servicio
   * @returns {Object} Estadísticas de uso
   */
  getStats() {
    return {
      cachedChannels: this.#uidCache.size,
      oldestCacheEntry: Math.min(...Array.from(this.#lastGenerationTime.values())),
      newestCacheEntry: Math.max(...Array.from(this.#lastGenerationTime.values()))
    };
  }

  /**
   * Verifica si un canal está en cache
   * @param {string} channelId - ID del canal
   * @returns {boolean}
   */
  isChannelCached(channelId) {
    return this.#uidCache.has(channelId);
  }
}

export default BitelUidService;