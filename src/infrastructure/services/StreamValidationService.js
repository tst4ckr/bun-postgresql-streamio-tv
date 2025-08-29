/**
 * @fileoverview StreamValidationService - Servicio para validación temprana de streams
 * Valida canales antes de la deduplicación para optimizar calidad y rendimiento
 */

import { HttpsToHttpConversionService } from './HttpsToHttpConversionService.js';
import { StreamHealthService } from './StreamHealthService.js';
import { EnhancedStreamValidationService } from './EnhancedStreamValidationService.js';

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
  #enhancedValidator;
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
    
    // Inicializar servicio de validación mejorado
    this.#enhancedValidator = new EnhancedStreamValidationService(
      config, logger, this.#streamHealthService, this.#httpsToHttpService
    );
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
      useEnhancedValidation: validation.useEnhancedValidation === true,
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
      const cached = this.#getCachedResult(cacheKey, config.cacheTimeout);
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
      if (config.useEnhancedValidation) {
        // Usar validación mejorada para mejor detección de calidad
        const enhancedResult = await this.#enhancedValidator.validateStreamComprehensive(channel.streamUrl, {
          streamProfile: this.#detectChannelProfile(channel),
          cacheTTL: config.cacheTimeout
        });
        
        validationResult = {
          isValid: enhancedResult.isValid && enhancedResult.streamable,
          channel: {
            ...channel,
            qualityScore: enhancedResult.qualityScore,
            bufferingRisk: enhancedResult.bufferingRisk,
            overallRating: enhancedResult.overallRating
          },
          converted: false,
          meta: {
            enhancedValidation: true,
            confidence: enhancedResult.confidence,
            summary: enhancedResult.summary,
            recommendations: enhancedResult.recommendations
          }
        };
      } else if (config.quickCheck) {
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
      this.#setCachedResult(cacheKey, validationResult);

      // Actualizar estadísticas
      this.#updateStats(validationResult, Date.now() - startTime);

      // Crear canal con estado de validación actualizado
      const resultChannel = validationResult.isValid 
        ? (validationResult.channel || channel)
        : channel;
      
      // Actualizar estado de validación usando método disponible o creando nueva instancia
      const finalChannel = this.#updateChannelValidationStatus(resultChannel, validationResult.isValid);

      return {
        channel: finalChannel,
        isValid: validationResult.isValid,
        source: channel.source || 'unknown',
        meta: validationResult.meta || {}
      };

    } catch (error) {
      this.#logger.warn(`Error validando canal ${channel.id}: ${error.message}`);
      
      // Crear canal con estado de validación falso
      const failedChannel = this.#updateChannelValidationStatus(channel, false);
      
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
    const httpUrl = this.#httpsToHttpService.convertToHttp(url);
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
        stats: this.#getEmptyStats(channels.length)
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
    this.#resetStats();

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
          const failedChannel = this.#updateChannelValidationStatus(channel, false);
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
   * Obtiene resultado del cache
   * @private
   * @param {string} key - Clave del cache
   * @param {number} timeout - Timeout del cache en ms
   * @returns {Object|null}
   */
  #getCachedResult(key, timeout) {
    const cached = this.#validationCache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > timeout) {
      this.#validationCache.delete(key);
      return null;
    }

    return cached.result;
  }

  /**
   * Guarda resultado en cache
   * @private
   * @param {string} key - Clave del cache
   * @param {Object} result - Resultado a guardar
   */
  #setCachedResult(key, result) {
    this.#validationCache.set(key, {
      result: {
        isValid: result.isValid,
        meta: result.meta
      },
      timestamp: Date.now()
    });

    // Limpiar cache si es muy grande (mantener últimos 1000)
    if (this.#validationCache.size > 1000) {
      const entries = Array.from(this.#validationCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Eliminar los 200 más antiguos
      for (let i = 0; i < 200; i++) {
        this.#validationCache.delete(entries[i][0]);
      }
    }
  }

  /**
   * Actualiza estadísticas de validación
   * @private
   * @param {Object} result - Resultado de validación
   * @param {number} processingTime - Tiempo de procesamiento
   */
  #updateStats(result, processingTime) {
    this.#stats.totalProcessed++;
    
    if (result.isValid) {
      this.#stats.validChannels++;
    } else {
      this.#stats.invalidChannels++;
    }
    
    if (result.converted) {
      this.#stats.httpsConverted++;
    }
    
    if (result.isValid && result.converted) {
      this.#stats.httpWorking++;
    }
  }

  /**
   * Actualiza el estado de validación del canal de manera segura
   * @param {Object} channel - Canal a actualizar
   * @param {boolean} isValid - Estado de validación
   * @returns {Object} Canal con estado actualizado
   */
  #updateChannelValidationStatus(channel, isValid) {
    // Si el canal tiene el método withValidationStatus, usarlo
    if (typeof channel.withValidationStatus === 'function') {
      return channel.withValidationStatus(isValid);
    }
    
    // Si no tiene el método, crear una nueva instancia con las propiedades actualizadas
    return {
      ...channel,
      validationStatus: isValid ? 'valid' : 'invalid',
      isActive: isValid,
      lastValidated: new Date().toISOString()
    };
  }

  /**
   * Resetea estadísticas
   * @private
   */
  #resetStats() {
    this.#stats = {
      totalProcessed: 0,
      validChannels: 0,
      invalidChannels: 0,
      httpsConverted: 0,
      httpWorking: 0,
      cacheHits: 0,
      processingTime: 0
    };
  }

  /**
   * Obtiene estadísticas vacías
   * @private
   * @param {number} total - Total de canales
   * @returns {Object}
   */
  #getEmptyStats(total) {
    return {
      totalProcessed: total,
      validChannels: total,
      invalidChannels: 0,
      httpsConverted: 0,
      httpWorking: 0,
      cacheHits: 0,
      processingTime: 0
    };
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
    this.#validationCache.clear();
    this.#logger.info('🗑️ Cache de validación limpiado');
  }

  /**
   * Detecta el perfil del canal para validación mejorada
   * @private
   * @param {Object} channel - Canal a analizar
   * @returns {string}
   */
  #detectChannelProfile(channel) {
    const url = channel.streamUrl || '';
    const name = (channel.name || '').toLowerCase();
    
    // Detectar tipo de contenido por URL o nombre
    if (url.includes('sport') || name.includes('sport') || name.includes('espn') || name.includes('fox sports')) {
      return 'sports';
    }
    
    if (url.includes('news') || name.includes('news') || name.includes('cnn') || name.includes('bbc')) {
      return 'news';
    }
    
    if (url.includes('movie') || name.includes('movie') || name.includes('cinema')) {
      return 'movies';
    }
    
    if (name.includes('hd') || name.includes('4k') || url.includes('hd')) {
      return 'high_quality';
    }
    
    return 'general';
  }

  /**
   * Obtiene información del cache
   * @returns {Object}
   */
  getCacheInfo() {
    const entries = Array.from(this.#validationCache.entries());
    const now = Date.now();
    const config = this.#getValidationConfig();
    
    const valid = entries.filter(([, data]) => (now - data.timestamp) <= config.cacheTimeout);
    const expired = entries.length - valid.length;
    
    return {
      totalEntries: entries.length,
      validEntries: valid.length,
      expiredEntries: expired,
      cacheTimeout: config.cacheTimeout,
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(([, data]) => data.timestamp)) : null,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(([, data]) => data.timestamp)) : null
    };
  }
}

export default StreamValidationService;