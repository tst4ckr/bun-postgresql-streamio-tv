/**
 * @fileoverview StreamHealthService - Verificación no intrusiva de salud de streams
 */

import axios from 'axios';

export class StreamHealthService {
  #config;
  #logger;
  #failCounts = new Map(); // channelId -> consecutive fails
  #lastStatus = new Map(); // channelId -> { ok, at }

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
   * @returns {Promise<{ok:number,fail:number,total:number,results:Array}>}
   */
  async checkChannels(channels, concurrency = 10) {
    const limit = Math.max(1, Math.min(concurrency, this.#config.streaming.maxConcurrentStreams || 20));
    const queue = [...channels];
    const results = [];

    const worker = async () => {
      while (queue.length > 0) {
        const channel = queue.shift();
        try {
          const res = await this.checkChannel(channel);
          results.push(res);
        } catch (error) {
          results.push({ id: channel.id, name: channel.name, ok: false, meta: { reason: error.message } });
        }
      }
    };

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


