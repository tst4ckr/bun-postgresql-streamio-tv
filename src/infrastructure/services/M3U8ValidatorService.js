/**
 * @fileoverview M3U8ValidatorService - Validación profunda de contenido M3U8/HLS
 * Implementa validación avanzada con análisis de contenido real y segmentos
 */

import axios from 'axios';

/**
 * Tipos de formato detectados
 */
export const StreamFormat = {
  M3U: 'M3U',
  M3U8: 'M3U8',
  HLS: 'HLS',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Resultado de validación de stream
 */
export class StreamValidationResult {
  constructor({
    isValid = false,
    format = StreamFormat.UNKNOWN,
    contentType = null,
    hasSegments = false,
    segmentCount = 0,
    validSegments = 0,
    duration = null,
    bandwidth = null,
    resolution = null,
    errors = [],
    warnings = [],
    metadata = {}
  } = {}) {
    this.isValid = isValid;
    this.format = format;
    this.contentType = contentType;
    this.hasSegments = hasSegments;
    this.segmentCount = segmentCount;
    this.validSegments = validSegments;
    this.duration = duration;
    this.bandwidth = bandwidth;
    this.resolution = resolution;
    this.errors = [...errors];
    this.warnings = [...warnings];
    this.metadata = { ...metadata };
    Object.freeze(this);
  }

  get segmentValidityRatio() {
    return this.segmentCount > 0 ? this.validSegments / this.segmentCount : 0;
  }

  get isHighQuality() {
    return this.bandwidth && this.bandwidth > 1000000; // > 1Mbps
  }
}

/**
 * Servicio para validación profunda de streams M3U8/HLS
 * Responsabilidad única: validación avanzada de contenido de streaming
 */
export class M3U8ValidatorService {
  #config;
  #logger;
  #httpClient;

  constructor(config = {}, logger = console) {
    this.#config = {
      timeout: config.timeout || 10000,
      maxSegmentsToValidate: config.maxSegmentsToValidate || 3,
      segmentValidationTimeout: config.segmentValidationTimeout || 5000,
      enableDeepValidation: config.enableDeepValidation ?? true,
      enableSegmentValidation: config.enableSegmentValidation ?? true,
      userAgent: config.userAgent || 'Stremio-TV-IPTV-Addon/1.0.0',
      ...config
    };
    this.#logger = logger;
    this.#httpClient = axios.create({
      timeout: this.#config.timeout,
      headers: {
        'User-Agent': this.#config.userAgent
      }
    });
  }

  /**
   * Valida un stream M3U8/HLS de forma profunda
   * @param {string} url - URL del stream a validar
   * @returns {Promise<StreamValidationResult>}
   */
  async validateStream(url) {
    try {
      // Validación básica de URL
      const urlValidation = this.#validateUrl(url);
      if (!urlValidation.isValid) {
        return new StreamValidationResult({
          errors: urlValidation.errors
        });
      }

      // Obtener contenido del stream
      const contentResult = await this.#fetchStreamContent(url);
      if (!contentResult.success) {
        return new StreamValidationResult({
          errors: [contentResult.error]
        });
      }

      // Detectar formato
      const format = this.#detectStreamFormat(contentResult.content, contentResult.contentType);
      
      // Validar según el formato detectado
      if (format === StreamFormat.M3U8 || format === StreamFormat.HLS) {
        return await this.#validateM3U8Content(url, contentResult.content, contentResult.headers);
      } else if (format === StreamFormat.M3U) {
        return this.#validateM3UContent(contentResult.content, contentResult.headers);
      }

      return new StreamValidationResult({
        format,
        contentType: contentResult.contentType,
        warnings: ['Formato de stream no reconocido']
      });

    } catch (error) {
      this.#logger.error('Error validando stream:', error);
      return new StreamValidationResult({
        errors: [`Error de validación: ${error.message}`]
      });
    }
  }

  /**
   * Valida URL básica
   * @private
   * @param {string} url
   * @returns {{isValid: boolean, errors: string[]}}
   */
  #validateUrl(url) {
    const errors = [];

    if (!url || typeof url !== 'string') {
      errors.push('URL inválida o vacía');
      return { isValid: false, errors };
    }

    try {
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        errors.push('Protocolo no soportado. Solo HTTP/HTTPS');
      }
    } catch {
      errors.push('Formato de URL inválido');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Obtiene el contenido del stream
   * @private
   * @param {string} url
   * @returns {Promise<{success: boolean, content?: string, contentType?: string, headers?: object, error?: string}>}
   */
  async #fetchStreamContent(url) {
    try {
      const response = await this.#httpClient.get(url, {
        responseType: 'text',
        validateStatus: (status) => status >= 200 && status < 400
      });

      return {
        success: true,
        content: response.data,
        contentType: response.headers['content-type'],
        headers: response.headers
      };
    } catch (error) {
      return {
        success: false,
        error: `Error obteniendo contenido: ${error.message}`
      };
    }
  }

  /**
   * Detecta el formato del stream
   * @private
   * @param {string} content
   * @param {string} contentType
   * @returns {string}
   */
  #detectStreamFormat(content, contentType) {
    if (!content) return StreamFormat.UNKNOWN;

    const lines = content.trim().split('\n');
    const firstLine = lines[0]?.trim();

    // Verificar headers M3U
    if (!firstLine?.startsWith('#EXTM3U')) {
      return StreamFormat.UNKNOWN;
    }

    // Detectar M3U8/HLS por contenido
    const hasHLSTags = lines.some(line => 
      line.startsWith('#EXT-X-') || 
      line.startsWith('#EXTINF:') ||
      line.includes('.ts') ||
      line.includes('.m3u8')
    );

    if (hasHLSTags) {
      return StreamFormat.M3U8;
    }

    // Detectar por content-type
    if (contentType) {
      if (contentType.includes('application/vnd.apple.mpegurl') || 
          contentType.includes('application/x-mpegURL')) {
        return StreamFormat.M3U8;
      }
      if (contentType.includes('audio/x-mpegurl') || 
          contentType.includes('audio/mpegurl')) {
        return StreamFormat.M3U;
      }
    }

    // Fallback a M3U si tiene estructura básica
    return StreamFormat.M3U;
  }

  /**
   * Valida contenido M3U8/HLS
   * @private
   * @param {string} baseUrl
   * @param {string} content
   * @param {object} headers
   * @returns {Promise<StreamValidationResult>}
   */
  async #validateM3U8Content(baseUrl, content, headers) {
    const errors = [];
    const warnings = [];
    const metadata = {};

    const lines = content.trim().split('\n').map(line => line.trim());
    
    // Validar estructura básica
    if (!lines[0]?.startsWith('#EXTM3U')) {
      errors.push('Archivo M3U8 no comienza con #EXTM3U');
    }

    // Extraer información del playlist
    const playlistInfo = this.#parseM3U8Playlist(lines);
    
    if (playlistInfo.errors.length > 0) {
      errors.push(...playlistInfo.errors);
    }

    if (playlistInfo.warnings.length > 0) {
      warnings.push(...playlistInfo.warnings);
    }

    // Validar segmentos si está habilitado
    let segmentValidation = { validSegments: 0, totalSegments: 0 };
    if (this.#config.enableSegmentValidation && playlistInfo.segments.length > 0) {
      segmentValidation = await this.#validateSegments(baseUrl, playlistInfo.segments);
    }

    return new StreamValidationResult({
      isValid: errors.length === 0 && (playlistInfo.segments.length === 0 || segmentValidation.validSegments > 0),
      format: StreamFormat.M3U8,
      contentType: headers['content-type'],
      hasSegments: playlistInfo.segments.length > 0,
      segmentCount: playlistInfo.segments.length,
      validSegments: segmentValidation.validSegments,
      duration: playlistInfo.duration,
      bandwidth: playlistInfo.bandwidth,
      resolution: playlistInfo.resolution,
      errors,
      warnings,
      metadata: {
        ...metadata,
        isLive: playlistInfo.isLive,
        version: playlistInfo.version,
        targetDuration: playlistInfo.targetDuration
      }
    });
  }

  /**
   * Valida contenido M3U básico
   * @private
   * @param {string} content
   * @param {object} headers
   * @returns {StreamValidationResult}
   */
  #validateM3UContent(content, headers) {
    const errors = [];
    const warnings = [];

    const lines = content.trim().split('\n').map(line => line.trim());
    
    if (!lines[0]?.startsWith('#EXTM3U')) {
      errors.push('Archivo M3U no comienza con #EXTM3U');
    }

    // Contar entradas válidas
    let validEntries = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line && !line.startsWith('#')) {
        try {
          new URL(line);
          validEntries++;
        } catch {
          warnings.push(`URL inválida en línea ${i + 1}: ${line}`);
        }
      }
    }

    if (validEntries === 0) {
      errors.push('No se encontraron URLs válidas en el archivo M3U');
    }

    return new StreamValidationResult({
      isValid: errors.length === 0,
      format: StreamFormat.M3U,
      contentType: headers['content-type'],
      hasSegments: false,
      segmentCount: validEntries,
      validSegments: validEntries,
      errors,
      warnings,
      metadata: {
        entryCount: validEntries
      }
    });
  }

  /**
   * Parsea información del playlist M3U8
   * @private
   * @param {string[]} lines
   * @returns {object}
   */
  #parseM3U8Playlist(lines) {
    const info = {
      segments: [],
      duration: null,
      bandwidth: null,
      resolution: null,
      isLive: false,
      version: null,
      targetDuration: null,
      errors: [],
      warnings: []
    };

    let currentSegment = null;

    for (const line of lines) {
      if (line.startsWith('#EXT-X-VERSION:')) {
        info.version = parseInt(line.split(':')[1]);
      } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        info.targetDuration = parseInt(line.split(':')[1]);
      } else if (line.startsWith('#EXT-X-PLAYLIST-TYPE:')) {
        info.isLive = !line.includes('VOD');
      } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const streamInfo = this.#parseStreamInf(line);
        info.bandwidth = streamInfo.bandwidth;
        info.resolution = streamInfo.resolution;
      } else if (line.startsWith('#EXTINF:')) {
        const duration = parseFloat(line.split(':')[1]?.split(',')[0]);
        currentSegment = { duration, url: null };
      } else if (line && !line.startsWith('#') && currentSegment) {
        currentSegment.url = line;
        info.segments.push(currentSegment);
        currentSegment = null;
      }
    }

    // Calcular duración total
    if (info.segments.length > 0) {
      info.duration = info.segments.reduce((total, seg) => total + (seg.duration || 0), 0);
    }

    return info;
  }

  /**
   * Parsea línea EXT-X-STREAM-INF
   * @private
   * @param {string} line
   * @returns {object}
   */
  #parseStreamInf(line) {
    const info = { bandwidth: null, resolution: null };
    
    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
    if (bandwidthMatch) {
      info.bandwidth = parseInt(bandwidthMatch[1]);
    }

    const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
    if (resolutionMatch) {
      info.resolution = resolutionMatch[1];
    }

    return info;
  }

  /**
   * Valida segmentos del stream
   * @private
   * @param {string} baseUrl
   * @param {Array} segments
   * @returns {Promise<{validSegments: number, totalSegments: number}>}
   */
  async #validateSegments(baseUrl, segments) {
    const maxToValidate = Math.min(segments.length, this.#config.maxSegmentsToValidate);
    const segmentsToValidate = segments.slice(0, maxToValidate);
    
    let validSegments = 0;

    for (const segment of segmentsToValidate) {
      try {
        const segmentUrl = this.#resolveSegmentUrl(baseUrl, segment.url);
        const isValid = await this.#validateSegmentUrl(segmentUrl);
        if (isValid) {
          validSegments++;
        }
      } catch (error) {
        this.#logger.warn(`Error validando segmento ${segment.url}:`, error.message);
      }
    }

    return {
      validSegments,
      totalSegments: segmentsToValidate.length
    };
  }

  /**
   * Resuelve URL de segmento relativa
   * @private
   * @param {string} baseUrl
   * @param {string} segmentUrl
   * @returns {string}
   */
  #resolveSegmentUrl(baseUrl, segmentUrl) {
    try {
      return new URL(segmentUrl, baseUrl).href;
    } catch {
      return segmentUrl;
    }
  }

  /**
   * Valida URL de segmento individual
   * @private
   * @param {string} segmentUrl
   * @returns {Promise<boolean>}
   */
  async #validateSegmentUrl(segmentUrl) {
    try {
      const response = await this.#httpClient.head(segmentUrl, {
        timeout: this.#config.segmentValidationTimeout,
        validateStatus: (status) => status >= 200 && status < 400
      });
      return true;
    } catch {
      return false;
    }
  }
}

export default M3U8ValidatorService;