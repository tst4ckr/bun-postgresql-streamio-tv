/**
 * @fileoverview StreamHealthService - Verificación no intrusiva de salud de streams
 */

import axios from 'axios';

export class StreamHealthService {
  #config;
  #logger;

  constructor(config, logger = console) {
    this.#config = config;
    this.#logger = logger;
  }

  /**
   * Verifica un stream por URL usando HEAD y fallback GET parcial
   * @param {string} url
   * @returns {Promise<{ok:boolean,status?:number,contentType?:string,reason?:string}>}
   */
  async checkStream(url) {
    const timeoutMs = (this.#config.validation.streamValidationTimeout || 10) * 1000;
    const headers = { 'User-Agent': 'Stremio-TV-IPTV-Addon/1.0.0' };

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
      return { ok: false, reason: error.code || error.message };
    }
  }

  /**
   * Verifica un canal
   * @param {import('../../domain/entities/Channel.js').Channel} channel
   * @returns {Promise<{id:string,name:string,ok:boolean,meta?:object}>}
   */
  async checkChannel(channel) {
    const result = await this.checkStream(channel.streamUrl);
    return {
      id: channel.id,
      name: channel.name,
      ok: result.ok,
      meta: result
    };
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
          const res = await this.checkChannel(channel);
          results.push(res);
          
          completed++;
          if (res.ok) {
            ok++;
          } else {
            fail++;
          }

          // Show progress every 100 channels or at the end
          if (showProgress && (completed % 100 === 0 || completed === total)) {            
            const percentage = ((completed / total) * 100).toFixed(1);
            const successRate = ((ok / completed) * 100).toFixed(1);
            this.#logger.info(`📊 Progreso: ${completed}/${total} (${percentage}%) - Éxito: ${ok} (${successRate}%) - Fallos: ${fail}`);
          }
          
        } catch (error) {
          completed++;
          fail++;
          results.push({ 
            id: channel.id, 
            name: channel.name, 
            ok: false, 
            meta: { reason: error.message } 
          });
          
          if (showProgress && (completed % 100 === 0 || completed === total)) {
            this.#logger.info(`❌ [${completed}/${total}] ${channel.name} - ERROR: ${error.message}`);
          }
        }
      }
    };

    const workers = Array.from({ length: limit }, () => worker());
    await Promise.all(workers);

    return { ok, fail, total: results.length, results };
  }
}
export default StreamHealthService;


