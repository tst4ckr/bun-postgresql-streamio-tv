/**
 * @fileoverview StreamValidationService - Servicio para validación temprana de streams
 * Valida canales antes de la deduplicación para optimizar calidad y rendimiento
 */

import { HttpsToHttpConversionService } from './HttpsToHttpConversionService.js';
import { StreamHealthService } from './StreamHealthService.js';
import { convertToHttp } from './HttpsToHttpConversionService_tools.js';
import { getCachedResult, setCachedResult, updateStats, updateChannelValidationStatus, resetStats, getEmptyStats, getCacheInfo, clearCache } from './StreamValidationService_tools.js';

/**
 * Servicio de validación temprana de streams
 * Responsabilidad: Validar funcionamiento de canales antes de deduplicación
 * 
 * Características:
 * - Validación concurrente con límites configurables
 * - Integración con conversión HTTPS→HTTP
 * - Timeouts optimizados para validación rápida
 * - Métricas detalladas de rendimiento
 * - Soporte para validación por lotes
 */
export class StreamValidationService {
  #config;
  #logger;
  #httpsToHttpService;
  #streamHealthService;
  #validationCache = new Map(); // URL -> {result, timestamp}
  #stats = {
    totalProcessed: 0,
    validChannels: 0,
    invalidChannels: 0,
    httpsConverted: 0,
    httpWorking: 0,
    cacheHits: 0,
    processingTime: 0
  };

  /**
   * @param {TVAddonConfig} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(config, logger = console) {
    this.#config = config;
    this.#logger = logger;
    
    // Inicializar servicios dependientes
    this.#streamHealthService = new StreamHealthService(config, logger);
    this.#httpsToHttpService = new HttpsToHttpConversionService(config, this.#streamHealthService, logger);
  }

  /**
   * Verifica si la validación temprana está habilitada
   * @returns {boolean}
   */
  isEnabled() {
    return this.#config.validation?.enableEarlyValidation === true;
  }

  /**
   * Obtiene configuración de validación temprana
   * @private
   * @returns {Object}
   */
  #getValidationConfig() {
    const validation = this.#config.validation || {};
    
    return {
      concurrency: validation.earlyValidationConcurrency || 15,
      timeout: validation.earlyValidationTimeout || 5000,
      batchSize: validation.earlyValidationBatchSize || 100,
      quickCheck: validation.validationQuickCheck !== false,
      skipHttpsIfHttpWorks: validation.validationSkipHttpsIfHttpWorks !== false,
      cacheTimeout: validation.validationCacheTimeout || 3600000, // 1 hora
      maxRetries: validation.validationMaxRetries || 1
    };
  }

  /**
   * Valida un canal individual
   * @param {import('../entities/Channel.js').Channel} channel - Canal a validar
   * @returns {Promise<{channel: Channel, isValid: boolean, source: string, meta: Object}>}
   */
  async validateChannel(channel) {
    const startTime = Date.now();
    const config = this.#getValidationConfig();
    
    try {
      // Verificar cache primero
      const cacheKey = channel.streamUrl;
      const cached = getCachedResult(this.#validationCache, cacheKey, config.cacheTimeout);
      if (cached) {
        this.#stats.cacheHits++;
        return {
          channel: cached.isValid ? channel.withValidationStatus(true) : channel.withValidationStatus(false),
          isValid: cached.isValid,
          source: channel.source || 'unknown',
          meta: { ...cached.meta, fromCache: true }
        };
      }

      // Validación rápida con HEAD request si está habilitada
      let validationResult;
      if (config.quickCheck) {
        validationResult = await this.#quickValidation(channel.streamUrl, config);
      } else {
        // Usar conversión HTTPS→HTTP completa
        const conversionResult = await this.#httpsToHttpService.processChannel(channel);
        validationResult = {
          isValid: conversionResult.httpWorks || conversionResult.originalWorks,
          channel: conversionResult.channel,
          converted: conversionResult.converted,
          meta: conversionResult.meta
        };
      }

      // Guardar en cache
      setCachedResult(this.#validationCache, cacheKey, validationResult);

      // Actualizar estadísticas
      updateStats(this.#stats, validationResult, Date.now() - startTime);

      // Crear canal con estado de validación actualizado
      const resultChannel = validationResult.isValid 
        ? (validationResult.channel || channel)
        : channel;
      
      // Actualizar estado de validación usando método disponible o creando nueva instancia
      const finalChannel = updateChannelValidationStatus(resultChannel, validationResult.isValid);

      return {
        channel: finalChannel,
        isValid: validationResult.isValid,
        source: channel.source || 'unknown',
        meta: validationResult.meta || {}
      };

    } catch (error) {
      this.#logger.warn(`Error validando canal ${channel.id}: ${error.message}`);
      
      // Crear canal con estado de validación falso
      const failedChannel = updateChannelValidationStatus(channel, false);
      
      return {
        channel: failedChannel,
        isValid: false,
        source: channel.source || 'unknown',
        meta: { error: error.message, processingTime: Date.now() - startTime }
      };
    }
  }

  /**
   * Validación rápida usando HEAD request
   * @private
   * @param {string} url - URL a validar
   * @param {Object} config - Configuración de validación
   * @returns {Promise<{isValid: boolean, channel?: Channel, converted?: boolean, meta: Object}>}
   */
  async #quickValidation(url, config) {
    const originalUrl = url;
    const httpUrl = convertToHttp(url);
    const converted = originalUrl !== httpUrl;

    try {
      // Si no se convirtió, validar URL original
      if (!converted) {
        const result = await this.#streamHealthService.checkStream(url, {
          method: 'HEAD',
          timeout: config.timeout,
          maxRetries: config.maxRetries
        });
        
        return {
          isValid: result.ok,
          converted: false,
          meta: { originalValidation: result, quickCheck: true }
        };
      }

      // Si se convirtió, probar HTTP primero (más rápido)
      const httpResult = await this.#streamHealthService.checkStream(httpUrl, {
        method: 'HEAD',
        timeout: config.timeout,
        maxRetries: config.maxRetries
      });

      if (httpResult.ok) {
        return {
          isValid: true,
          converted: true,
          meta: { 
            httpValidation: httpResult, 
            quickCheck: true,
            preferredUrl: httpUrl
          }
        };
      }

      // Si HTTP falló y está configurado para no probar HTTPS, fallar
      if (config.skipHttpsIfHttpWorks) {
        return {
          isValid: false,
          converted: true,
          meta: { 
            httpValidation: httpResult, 
            quickCheck: true,
            httpsSkipped: true
          }
        };
      }

      // Probar HTTPS original como fallback
      const httpsResult = await this.#streamHealthService.checkStream(originalUrl, {
        method: 'HEAD',
        timeout: config.timeout,
        maxRetries: config.maxRetries
      });

      return {
        isValid: httpsResult.ok,
        converted: false, // Usar original si HTTP no funciona
        meta: { 
          httpValidation: httpResult,
          httpsValidation: httpsResult,
          quickCheck: true
        }
      };

    } catch (error) {
      return {
        isValid: false,
        converted: false,
        meta: { error: error.message, quickCheck: true }
      };
    }
  }

  /**
   * Valida un lote de canales con concurrencia controlada
   * @param {Array<import('../entities/Channel.js').Channel>} channels - Canales a validar
   * @param {Object} options - Opciones de validación
   * @returns {Promise<{validChannels: Array, invalidChannels: Array, stats: Object}>}
   */
  async validateChannelsBatch(channels, options = {}) {
    if (!this.isEnabled()) {
      this.#logger.info('🔄 Validación temprana deshabilitada, retornando canales sin validar');
      return {
        validChannels: channels,
        invalidChannels: [],
        stats: getEmptyStats(channels.length)
      };
    }

    const config = this.#getValidationConfig();
    const {
      concurrency = config.concurrency,
      showProgress = true,
      batchSize = config.batchSize
    } = options;

    const startTime = Date.now();
    const total = channels.length;
    
    if (showProgress) {
      this.#logger.info(`🔍 Iniciando validación temprana de ${total} canales con ${concurrency} workers...`);
    }

    // Resetear estadísticas para este lote
    resetStats(this.#stats);

    // Procesar en lotes para optimizar memoria
    const results = [];
    let processed = 0;

    for (let i = 0; i < channels.length; i += batchSize) {
      const batch = channels.slice(i, i + batchSize);
      const batchResults = await this.#processBatch(batch, concurrency);
      
      results.push(...batchResults);
      processed += batch.length;

      if (showProgress && (processed % (batchSize * 2) === 0 || processed === total)) {
        const percentage = ((processed / total) * 100).toFixed(1);
        const validRate = this.#stats.totalProcessed > 0 
          ? ((this.#stats.validChannels / this.#stats.totalProcessed) * 100).toFixed(1)
          : '0.0';
        
        this.#logger.info(
          `📊 Progreso validación: ${processed}/${total} (${percentage}%) - Válidos: ${this.#stats.validChannels} (${validRate}%)`
        );
      }

      // Pausa entre lotes para evitar sobrecarga
      if (i + batchSize < channels.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const totalTime = Date.now() - startTime;
    this.#stats.processingTime = totalTime;

    if (showProgress) {
      const validRate = total > 0 ? ((this.#stats.validChannels / total) * 100).toFixed(1) : '0.0';
      const avgTime = total > 0 ? (totalTime / total).toFixed(0) : '0';
      
      this.#logger.info(
        `✅ Validación completada: ${this.#stats.validChannels}/${total} (${validRate}%) válidos en ${(totalTime/1000).toFixed(1)}s (${avgTime}ms/canal)`
      );
      
      if (this.#stats.cacheHits > 0) {
        const cacheRate = ((this.#stats.cacheHits / total) * 100).toFixed(1);
        this.#logger.info(`💾 Cache hits: ${this.#stats.cacheHits} (${cacheRate}%)`);
      }
    }

    // Separar canales válidos e inválidos
    const validChannels = results.filter(result => result.isValid).map(result => result.channel);
    const invalidChannels = results.filter(result => !result.isValid).map(result => result.channel);

    return {
      validChannels,
      invalidChannels,
      stats: { ...this.#stats }
    };
  }

  /**
   * Procesa un lote de canales con workers concurrentes
   * @private
   * @param {Array} batch - Lote de canales
   * @param {number} concurrency - Número de workers
   * @returns {Promise<Array>}
   */
  async #processBatch(batch, concurrency) {
    const limit = Math.max(1, Math.min(concurrency, 20));
    const queue = [...batch];
    const results = [];

    const worker = async () => {
      while (queue.length > 0) {
        const channel = queue.shift();
        if (!channel) break;

        try {
          const result = await this.validateChannel(channel);
          results.push(result);
        } catch (error) {
          this.#logger.warn(`Error en worker validando canal ${channel.id}: ${error.message}`);
          const failedChannel = updateChannelValidationStatus(channel, false);
          results.push({
            channel: failedChannel,
            isValid: false,
            source: channel.source || 'unknown',
            meta: { error: error.message }
          });
        }
      }
    };

    // Ejecutar workers en paralelo
    const workers = Array.from({ length: limit }, () => worker());
    await Promise.all(workers);

    return results;
  }











  /**
   * Obtiene estadísticas actuales de validación
   * @returns {Object}
   */
  getValidationStats() {
    return {
      ...this.#stats,
      cacheSize: this.#validationCache.size,
      isEnabled: this.isEnabled(),
      config: this.#getValidationConfig()
    };
  }

  /**
   * Limpia el cache de validación
   */
  clearCache() {
    clearCache(this.#validationCache, this.#logger);
  }

  /**
   * Obtiene información del cache
   * @returns {Object}
   */
  getCacheInfo() {
    const config = this.#getValidationConfig();
    return getCacheInfo(this.#validationCache, config.cacheTimeout);
  }
}

export default StreamValidationService;