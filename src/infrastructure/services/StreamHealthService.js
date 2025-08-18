/**
 * @fileoverview StreamHealthService - Verificación no intrusiva de salud de streams
 * Integra validación profunda de contenido M3U8/HLS
 */

import axios from 'axios';
import { M3U8ValidatorService, StreamFormat } from './M3U8ValidatorService.js';

export class StreamHealthService {
  #config;
  #logger;
  #failCounts = new Map(); // channelId -> consecutive fails
  #lastStatus = new Map(); // channelId -> { ok, at }
  #m3u8Validator;

  constructor(config, logger = console) {
    this.#config = config;
    this.#logger = logger;
    this.#m3u8Validator = new M3U8ValidatorService({
      timeout: (config.validation?.streamValidationTimeout || 10) * 1000,
      enableDeepValidation: config.validation?.enableDeepValidation ?? true,
      enableSegmentValidation: config.validation?.enableSegmentValidation ?? true,
      maxSegmentsToValidate: config.validation?.maxSegmentsToValidate || 3
    }, logger);
  }

  /**
   * Verifica un stream por URL usando validación básica y profunda
   * @param {string} url
   * @param {Object} options - Opciones de validación
   * @param {boolean} options.deepValidation - Usar validación profunda para M3U8
   * @returns {Promise<{ok:boolean,status?:number,contentType?:string,reason?:string,validation?:object}>}
   */
  async checkStream(url, options = {}) {
    const timeoutMs = (this.#config.validation?.streamValidationTimeout || 10) * 1000;
    const headers = { 'User-Agent': 'Stremio-TV-IPTV-Addon/1.0.0' };
    const useDeepValidation = options.deepValidation ?? this.#config.validation?.enableDeepValidation ?? false;

    try {
      // Validación básica primero
      const basicResult = await this.#performBasicValidation(url, timeoutMs, headers);
      
      // Si la validación básica falla, retornar resultado básico
      if (!basicResult.ok) {
        return basicResult;
      }

      // Validación profunda para streams M3U8/HLS si está habilitada
      if (useDeepValidation && this.#shouldUseDeepValidation(url, basicResult.contentType)) {
        const deepResult = await this.#performDeepValidation(url);
        return {
          ...basicResult,
          ok: deepResult.isValid,
          reason: deepResult.isValid ? undefined : deepResult.errors.join('; '),
          validation: {
            format: deepResult.format,
            hasSegments: deepResult.hasSegments,
            segmentValidityRatio: deepResult.segmentValidityRatio,
            duration: deepResult.duration,
            bandwidth: deepResult.bandwidth,
            resolution: deepResult.resolution,
            errors: deepResult.errors,
            warnings: deepResult.warnings
          }
        };
      }

      return basicResult;
    } catch (error) {
      return { ok: false, reason: error.code || error.message };
    }
  }

  /**
   * Realiza validación básica HTTP
   * @private
   * @param {string} url
   * @param {number} timeoutMs
   * @param {object} headers
   * @returns {Promise<{ok:boolean,status?:number,contentType?:string,reason?:string}>}
   */
  async #performBasicValidation(url, timeoutMs, headers) {
    try {
      // Intento HEAD primero
      const head = await axios.head(url, { timeout: timeoutMs, headers, validateStatus: () => true });
      if (head.status >= 200 && head.status < 400) {
        return { ok: true, status: head.status, contentType: head.headers['content-type'] };
      }

      // Fallback GET de un pequeño rango
      const get = await axios.get(url, {
        timeout: timeoutMs,
        headers: { ...headers, Range: 'bytes=0-1024' },
        responseType: 'arraybuffer',
        validateStatus: () => true
      });
      const ok = get.status >= 200 && get.status < 400;
      return ok
        ? { ok: true, status: get.status, contentType: get.headers['content-type'] }
        : { ok: false, status: get.status, reason: 'HTTP_NOT_OK' };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Determina si debe usar validación profunda
   * @private
   * @param {string} url
   * @param {string} contentType
   * @returns {boolean}
   */
  #shouldUseDeepValidation(url, contentType) {
    // Verificar por extensión de archivo
    if (url.includes('.m3u8') || url.includes('.m3u')) {
      return true;
    }

    // Verificar por content-type
    if (contentType) {
      return contentType.includes('mpegurl') || 
             contentType.includes('x-mpegURL') ||
             contentType.includes('vnd.apple.mpegurl');
    }

    return false;
  }

  /**
   * Realiza validación profunda usando M3U8ValidatorService
   * @private
   * @param {string} url
   * @returns {Promise<object>}
   */
  async #performDeepValidation(url) {
    return await this.#m3u8Validator.validateStream(url);
  }

  /**
   * Verifica un canal
   * @param {import('../../domain/entities/Channel.js').Channel} channel
   * @param {Object} options - Opciones de validación
   * @param {boolean} options.deepValidation - Usar validación profunda para M3U8
   * @returns {Promise<{id:string,name:string,ok:boolean,meta?:object}>}
   */
  async checkChannel(channel, options = {}) {
    const result = await this.checkStream(channel.streamUrl, options);
    const record = {
      id: channel.id,
      name: channel.name,
      ok: result.ok,
      meta: result
    };
    this.recordResult(record.id, record.ok);
    return record;
  }

  /**
   * Verifica múltiples canales con límite de concurrencia
   * @param {Array<import('../../domain/entities/Channel.js').Channel>} channels
   * @param {number} concurrency
   * @param {Object} options - Opciones de validación
   * @param {boolean} options.deepValidation - Usar validación profunda para M3U8
   * @returns {Promise<{ok:number,fail:number,total:number,results:Array}>}
   */
  async checkChannels(channels, concurrency = 10, options = {}) {
    const limit = Math.max(1, Math.min(concurrency, this.#config.streaming?.maxConcurrentStreams || 20));
    const queue = [...channels];
    const results = [];

    const worker = async () => {
      while (queue.length > 0) {
        const channel = queue.shift();
        if (channel) {
          try {
            const result = await this.checkChannel(channel, options);
            results.push(result);
          } catch (error) {
            this.#logger.error(`Error checking channel ${channel.id}:`, error);
            results.push({ id: channel.id, name: channel.name, ok: false, meta: { reason: error.message } });
          }
        }
      }
    };

    // Crear workers concurrentes
    const workers = Array.from({ length: limit }, () => worker());
    await Promise.all(workers);

    const ok = results.filter(r => r.ok).length;
    const fail = results.length - ok;

    return { ok, fail, total: results.length, results };
  }

  /**
   * Registra un resultado para contabilidad de fallos consecutivos
   * @param {string} channelId
   * @param {boolean} ok
   */
  recordResult(channelId, ok) {
    const current = this.#failCounts.get(channelId) || 0;
    const next = ok ? 0 : current + 1;
    this.#failCounts.set(channelId, next);
    this.#lastStatus.set(channelId, { ok, at: new Date() });
  }

  /**
   * Indica si un canal debe considerarse activo según fallos consecutivos
   * @param {string} channelId
   * @returns {boolean}
   */
  isChannelActive(channelId) {
    const threshold = this.#config.validation.maxConsecutiveFailures || 3;
    const fails = this.#failCounts.get(channelId) || 0;
    return fails < threshold;
  }

  /**
   * Estadísticas del tracker
   */
  getTrackerStats() {
    const threshold = this.#config.validation.maxConsecutiveFailures || 3;
    const entries = Array.from(this.#failCounts.entries()).map(([id, fails]) => ({ id, fails, deactivated: fails >= threshold }));
    const deactivated = entries.filter(e => e.deactivated).length;
    return { threshold, tracked: entries.length, deactivated, entries };
  }
}

export default StreamHealthService;


