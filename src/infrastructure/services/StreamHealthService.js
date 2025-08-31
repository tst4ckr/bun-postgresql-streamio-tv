/**
 * @fileoverview StreamHealthService - Verificación no intrusiva de salud de streams
 */

import axios from 'axios';
import { BitelUidService } from './BitelUidService.js';

export class StreamHealthService {
  #config;
  #logger;
  #bitelUidService;

  constructor(config, logger = console) {
    this.#config = config;
    this.#logger = logger;
    this.#bitelUidService = new BitelUidService(config, logger);
  }

  /**
   * Verifica un stream por URL usando HEAD y fallback GET parcial con retry
   * Validación específica para streams m3u8: HTTP 200 y content-type correcto
   * @param {string} url
   * @param {string} channelId - ID del canal para procesamiento de BITEL
   * @param {number} retryCount - Número de reintentos (interno)
   * @returns {Promise<{ok:boolean,status?:number,contentType?:string,reason?:string}>}
   */
  async checkStream(url, channelId = null, retryCount = 0) {
    // Procesar URL con BitelUidService si es necesario
    const processedUrl = channelId ? this.#bitelUidService.processStreamUrl(url, channelId) : url;
    
    // Timeout progresivo: 15s, 25s, 35s según mejores prácticas Context7
    const baseTimeout = this.#config.validation.streamValidationTimeout || 15;
    const timeoutMs = (baseTimeout + (retryCount * 10)) * 1000;
    const maxRetries = this.#config.validation.maxValidationRetries || 2;
    
    const headers = { 'User-Agent': 'Stremio-TV-IPTV-Addon/1.0.0' };
    
    // Validación específica para streams de video: solo HTTP 200 es válido
    const isValidStreamStatus = status => status === 200;
    
    // Validación de content-type para streams m3u8
    const isValidM3U8ContentType = (contentType) => {
      if (!contentType) return false;
      const normalizedType = contentType.toLowerCase();
      return normalizedType.includes('application/vnd.apple.mpegurl') ||
             normalizedType.includes('application/x-mpegurl') ||
             normalizedType.includes('video/mp2t') ||
             normalizedType.includes('text/plain') || // Algunos servidores usan text/plain para m3u8
             normalizedType.includes('application/octet-stream'); // Fallback común
    };
    
    const isRetryableError = (error) => {
      const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
      return retryableCodes.includes(error.code) || 
             (error.response && [502, 503, 504, 408, 429].includes(error.response.status));
    };

    try {
      // Intento HEAD primero con validación estricta
      const head = await axios.head(processedUrl, { 
        timeout: timeoutMs, 
        headers, 
        validateStatus: () => true // Permitir todos los códigos para validación manual
      });
      
      if (isValidStreamStatus(head.status)) {
        const contentType = head.headers['content-type'];
        const isValidContent = isValidM3U8ContentType(contentType);
        
        return { 
          ok: isValidContent, 
          status: head.status, 
          contentType: contentType,
          processedUrl: processedUrl,
          attempts: retryCount + 1,
          reason: isValidContent ? undefined : `INVALID_CONTENT_TYPE: ${contentType}`
        };
      }

      // Fallback GET de un pequeño rango con validación estricta
      const get = await axios.get(processedUrl, {
        timeout: timeoutMs,
        headers: { ...headers, Range: 'bytes=0-1024' },
        responseType: 'arraybuffer',
        validateStatus: () => true // Permitir todos los códigos para validación manual
      });
      
      if (isValidStreamStatus(get.status)) {
        const contentType = get.headers['content-type'];
        const isValidContent = isValidM3U8ContentType(contentType);
        
        return { 
          ok: isValidContent, 
          status: get.status, 
          contentType: contentType,
          processedUrl: processedUrl,
          attempts: retryCount + 1,
          reason: isValidContent ? undefined : `INVALID_CONTENT_TYPE: ${contentType}`
        };
      } else {
        return { 
          ok: false, 
          status: get.status, 
          reason: `HTTP_NOT_200: ${get.status}`,
          processedUrl: processedUrl,
          attempts: retryCount + 1
        };
      }
    } catch (error) {
      // Implementar retry con backoff exponencial para errores temporales
      if (retryCount < maxRetries && isRetryableError(error)) {
        const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 5000);
        this.#logger.debug(`Reintentando validación de ${channelId || 'stream'} en ${backoffMs}ms (intento ${retryCount + 1}/${maxRetries + 1})`);
        
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return this.checkStream(url, channelId, retryCount + 1);
      }
      
      return { 
        ok: false, 
        reason: error.code || error.message,
        processedUrl: processedUrl,
        attempts: retryCount + 1,
        finalError: true
      };
    }
  }

  /**
   * Verifica un canal
   * @param {import('../../domain/entities/Channel.js').Channel} channel
   * @returns {Promise<{id:string,name:string,ok:boolean,meta?:object}>}
   */
  async checkChannel(channel) {
    try {
      const result = await this.checkStream(channel.streamUrl, channel.id);
      return {
        id: channel.id,
        name: channel.name,
        ok: result.ok,
        meta: result
      };
    } catch (error) {
      // Manejo explícito de errores para evitar promesas rechazadas no manejadas
      this.#logger.warn(`Error validando canal ${channel.id} (${channel.name}): ${error.message}`);
      return {
        id: channel.id,
        name: channel.name,
        ok: false,
        meta: { 
          reason: error.message,
          error: true,
          finalError: true
        }
      };
    }
  }

  /**
   * Verifica múltiples canales con límite de concurrencia
   * @param {Array<import('../../domain/entities/Channel.js').Channel>} channels
   * @param {number} concurrency
   * @param {boolean} showProgress - Mostrar progreso en tiempo real
   * @returns {Promise<{ok:number,fail:number,total:number,results:Array}>}
   */
  async checkChannels(channels, concurrency = 10, showProgress = true) {
    const limit = Math.max(1, Math.min(concurrency, this.#config.streaming.maxConcurrentStreams || 20));
    const queue = [...channels];
    const results = [];
    const total = channels.length;
    let completed = 0;
    let ok = 0;
    let fail = 0;

    if (showProgress) {
      this.#logger.info(`🔍 Iniciando validación de ${total} canales con ${limit} workers concurrentes...`);
    }

    const worker = async () => {
      while (queue.length > 0) {
        const channel = queue.shift();
        if (!channel) break;
        
        try {
          // checkChannel ya maneja errores internamente, pero agregamos protección adicional
          const res = await this.checkChannel(channel);
          results.push(res);
          
          completed++;
          res.ok ? ok++ : fail++;

          // Show progress every 100 channels or at the end
          if (showProgress && (completed % 100 === 0 || completed === total)) {            
            const percentage = ((completed / total) * 100).toFixed(1);
            const successRate = ((ok / completed) * 100).toFixed(1);
            this.#logger.info(`📊 Progreso: ${completed}/${total} (${percentage}%) - Éxito: ${ok} (${successRate}%) - Fallos: ${fail}`);
          }
          
        } catch (error) {
          // Doble protección: este catch no debería ejecutarse ya que checkChannel maneja errores
          this.#logger.error(`Error crítico validando canal ${channel.id}: ${error.message}`);
          completed++;
          fail++;
          results.push({ 
            id: channel.id, 
            name: channel.name, 
            ok: false, 
            meta: { 
              reason: `Error crítico: ${error.message}`, 
              error: true,
              criticalError: true
            } 
          });
          
          if (showProgress && (completed % 100 === 0 || completed === total)) {
            this.#logger.info(`❌ [${completed}/${total}] ${channel.name} - ERROR CRÍTICO: ${error.message}`);
          }
        }
      }
    };

    const workers = Array.from({ length: limit }, () => worker());
    await Promise.all(workers);

    return { ok, fail, total: results.length, results };
  }

  /**
   * Valida todos los canales disponibles procesándolos por lotes
   * @param {Function} getChannelsFunction - Función para obtener canales paginados
   * @param {Object} options - Opciones de validación
   * @param {number} options.batchSize - Tamaño del lote
   * @param {number} options.concurrency - Concurrencia por lote
   * @param {boolean} options.showProgress - Mostrar progreso
   * @returns {Promise<{ok:number,fail:number,total:number,results:Array,batches:number}>}
   */
  async validateAllChannelsBatched(getChannelsFunction, options = {}) {
    const {
      batchSize = this.#config.validation?.validationBatchSize || 50,
      concurrency = this.#config.validation?.maxValidationConcurrency || 10,
      showProgress = true
    } = options;

    let offset = 0;
    let totalProcessed = 0;
    let totalOk = 0;
    let totalFail = 0;
    let batchCount = 0;
    const allResults = [];

    if (showProgress) {
      this.#logger.info(`🔍 Iniciando validación completa por lotes (tamaño: ${batchSize}, concurrencia: ${concurrency})...`);
    }

    while (true) {
      // Obtener el siguiente lote de canales
      const channels = await getChannelsFunction(offset, batchSize);
      
      if (!channels || channels.length === 0) {
        break; // No hay más canales
      }

      batchCount++;
      
      if (showProgress) {
        this.#logger.info(`📦 Procesando lote ${batchCount}: ${channels.length} canales (offset: ${offset})`);
      }

      // Validar el lote actual
      const batchReport = await this.checkChannels(channels, concurrency, false);
      
      // Acumular resultados
      totalProcessed += batchReport.total;
      totalOk += batchReport.ok;
      totalFail += batchReport.fail;
      allResults.push(...batchReport.results);

      if (showProgress) {
        const batchSuccessRate = ((batchReport.ok / batchReport.total) * 100).toFixed(1);
        this.#logger.info(`✅ Lote ${batchCount} completado: ${batchReport.ok}/${batchReport.total} (${batchSuccessRate}%) válidos`);
      }

      // Preparar para el siguiente lote
      offset += batchSize;

      // Pausa entre lotes para no sobrecargar el sistema
      if (channels.length === batchSize) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (showProgress) {
      const overallSuccessRate = totalProcessed > 0 ? ((totalOk / totalProcessed) * 100).toFixed(1) : '0.0';
      this.#logger.info(`🎯 Validación completa finalizada: ${totalOk}/${totalProcessed} (${overallSuccessRate}%) válidos en ${batchCount} lotes`);
    }

    return {
      ok: totalOk,
      fail: totalFail,
      total: totalProcessed,
      results: allResults,
      batches: batchCount
    };
  }
}
export default StreamHealthService;


