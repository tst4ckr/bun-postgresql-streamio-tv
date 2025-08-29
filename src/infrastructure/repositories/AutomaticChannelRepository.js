/**
 * @fileoverview AutomaticChannelRepository - Repositorio para modo automático
 * Descarga M3U, extrae URLs con /play/ e IPs públicas, y las convierte al formato requerido
 */

import { ChannelRepository, RepositoryError } from '../../domain/repositories/ChannelRepository.js';
import { Channel } from '../../domain/entities/Channel.js';
import { M3UParserService } from '../parsers/M3UParserService.js';
import { HttpsToHttpConversionService } from '../services/HttpsToHttpConversionService.js';
import { StreamHealthService } from '../services/StreamHealthService.js';
import { StreamValidationService } from '../services/StreamValidationService.js';
import { filterAllowedChannels } from '../../config/allowed-channels.js';
import { filterBannedChannels } from '../../config/banned-channels.js';
import fetch from 'node-fetch';
import { URL } from 'url';

/**
 * Repositorio automático que procesa listas M3U para extraer URLs específicas
 * Responsabilidad: descargar M3U, filtrar URLs con /play/ e IPs públicas, convertir formato
 */
export class AutomaticChannelRepository extends ChannelRepository {
  #config;
  #logger;
  #channels = [];
  #channelMap = new Map();
  #isInitialized = false;
  #lastLoadTime = null;
  #m3uParser;
  #httpsToHttpService;
  #streamValidationService;

  /**
   * @param {TVAddonConfig} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(config, logger) {
    super();
    this.#config = config;
    this.#logger = logger;
    
    // Inicializar servicios
    this.#m3uParser = new M3UParserService(config.filters);
    const streamHealthService = new StreamHealthService(config, logger);
    this.#httpsToHttpService = new HttpsToHttpConversionService(config, streamHealthService, logger);
    this.#streamValidationService = new StreamValidationService(config, logger);
  }

  /**
   * Inicializa el repositorio automático
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.#isInitialized) {
      this.#logger.warn('Repositorio automático ya inicializado');
      return;
    }

    try {
      this.#logger.info('Inicializando repositorio automático...');
      
      // Descargar y procesar M3U
      await this.#downloadAndProcessM3U();
      
      this.#isInitialized = true;
      this.#lastLoadTime = new Date();
      
      this.#logger.info(`Repositorio automático inicializado con ${this.#channels.length} canales únicos`);
    } catch (error) {
      this.#logger.error('Error inicializando repositorio automático:', error);
      throw new RepositoryError(`Error inicializando repositorio automático: ${error.message}`);
    }
  }

  /**
   * Descarga y procesa la lista M3U automáticamente
   * Implementa el proceso completo: extrae URLs de playlist y las procesa como fuentes M3U
   * @private
   * @returns {Promise<void>}
   */
  async #downloadAndProcessM3U() {
    const { autoM3uUrl } = this.#config.dataSources;
    
    if (!autoM3uUrl) {
      throw new Error('AUTO_M3U_URL no configurada');
    }

    this.#logger.info(`🤖 Iniciando proceso automático desde: ${autoM3uUrl}`);
    
    try {
      // 1. Descargar contenido M3U principal
      const response = await fetch(autoM3uUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'TV-IPTV-Addon/1.0.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
      }

      const m3uContent = await response.text();
      this.#logger.info(`M3U descargado: ${m3uContent.length} caracteres`);

      // 2. Parsear contenido M3U
      const parsedChannels = await this.#m3uParser.parseM3U(m3uContent);
      this.#logger.info(`Canales parseados: ${parsedChannels.length}`);

      // 3. Filtrar URLs que cumplan criterios (con /play/ e IP pública)
      const filteredChannels = this.#filterChannelsByPlayAndPublicIP(parsedChannels);
      this.#logger.info(`Canales filtrados (con /play/ e IP pública): ${filteredChannels.length}`);

      // 4. Extraer URLs únicas de playlist
      const playlistUrls = this.#generatePlaylistUrls(filteredChannels);
      this.#logger.info(`📋 URLs de playlist generadas: ${playlistUrls.length}`);

      // 5. Procesar cada URL de playlist como fuente M3U independiente
      const allChannels = await this.#processPlaylistUrls(playlistUrls);
      this.#logger.info(`📺 Total de canales procesados desde playlists: ${allChannels.length}`);

      // 6. Aplicar deduplicación final
      const uniqueChannels = this.#removeDuplicates(allChannels);
      this.#logger.info(`Canales únicos finales: ${uniqueChannels.length}`);

      // 7. Validar conectividad antes del filtro inteligente (si está habilitado)
      let channelsToFilter = uniqueChannels;
      if (this.#shouldValidateBeforeFiltering()) {
        const validationResult = await this.#validateChannelsBeforeFiltering(uniqueChannels);
        channelsToFilter = validationResult.validChannels;
        this.#logger.info(`Validación previa al filtrado: ${validationResult.validChannels.length}/${uniqueChannels.length} canales válidos`);
      }

      // 8. Aplicar filtro inteligente de canales permitidos
      const allowedFilteredChannels = filterAllowedChannels(channelsToFilter);
      const removedByFilter = channelsToFilter.length - allowedFilteredChannels.length;
      this.#logger.info(`Filtro inteligente de canales aplicado: ${removedByFilter} canales removidos`);
      
      // 9. Validar conectividad de canales removidos por filtro (si está habilitado)
      if (this.#shouldValidateFilteredChannels() && removedByFilter > 0) {
        await this.#validateRemovedChannels(channelsToFilter, allowedFilteredChannels);
      }

      // 10. Validar conectividad de canales finales después del filtrado (si está habilitado)
      let finalChannels = allowedFilteredChannels;
      if (this.#shouldValidateAfterFiltering()) {
        const postFilterValidation = await this.#validateChannelsAfterFiltering(allowedFilteredChannels);
        finalChannels = postFilterValidation.validChannels;
        this.#logger.info(`Validación post-filtrado: ${postFilterValidation.validChannels.length}/${allowedFilteredChannels.length} canales válidos`);
      }

      this.#channels = finalChannels;
      this.#buildChannelMap();

    } catch (error) {
      this.#logger.error('Error en proceso automático:', error);
      throw error;
    }
  }

  /**
   * Filtra canales que contengan '/play/' en la URL y tengan IP pública como hostname
   * @private
   * @param {Array<Channel>} channels
   * @returns {Array<Channel>}
   */
  #filterChannelsByPlayAndPublicIP(channels) {
    return channels.filter(channel => {
      try {
        const url = new URL(channel.streamUrl);
        
        // Verificar que la URL sea válida y accesible
        if (!url.protocol || (!url.protocol.startsWith('http') && !url.protocol.startsWith('https'))) {
          return false;
        }

        // Verificar que tenga un hostname válido
        if (!url.hostname || url.hostname.trim().length === 0) {
          return false;
        }

        // Verificar que contenga '/play/' en la ruta
        if (!url.pathname.includes('/play/')) {
          return false;
        }

        // Verificar que el hostname sea una IP pública
        if (!this.#isPublicIP(url.hostname)) {
          return false;
        }

        return true;
      } catch (error) {
        this.#logger.debug(`URL inválida ignorada: ${channel.streamUrl}`);
        return false;
      }
    });
  }

  /**
   * Verifica si una dirección IP es pública
   * @private
   * @param {string} hostname
   * @returns {boolean}
   */
  #isPublicIP(hostname) {
    // Verificar que sea una IP válida
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(hostname)) {
      return false;
    }

    const parts = hostname.split('.').map(Number);
    const [a, b, c, d] = parts;

    // Verificar que NO sea IP privada
    // 10.0.0.0/8
    if (a === 10) return false;
    
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return false;
    
    // 192.168.0.0/16
    if (a === 192 && b === 168) return false;
    
    // 127.0.0.0/8 (localhost)
    if (a === 127) return false;
    
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return false;
    
    // 224.0.0.0/4 (multicast)
    if (a >= 224 && a <= 239) return false;
    
    // 240.0.0.0/4 (reserved)
    if (a >= 240) return false;

    return true;
  }

  /**
   * Genera URLs únicas de playlist en formato http://IP:PUERTO/playlist.m3u
   * @private
   * @param {Array<Channel>} channels - Canales filtrados con /play/ e IP pública
   * @returns {string[]} URLs de playlist únicas
   */
  #generatePlaylistUrls(channels) {
    const playlistUrls = new Set();
    
    for (const channel of channels) {
      try {
        const url = new URL(channel.streamUrl);
        const ip = url.hostname;
        const port = url.port || (url.protocol === 'https:' ? '443' : '80');
        
        // Generar URL de playlist en formato requerido: http://IP:PUERTO/playlist.m3u
        const playlistUrl = `http://${ip}:${port}/playlist.m3u`;
        playlistUrls.add(playlistUrl);
        
      } catch (error) {
        this.#logger.debug(`Error generando playlist URL para: ${channel.streamUrl}`);
      }
    }
    
    return Array.from(playlistUrls);
  }

  /**
   * Procesa cada URL de playlist como fuente M3U independiente
   * @private
   * @param {string[]} playlistUrls - URLs de playlist a procesar
   * @returns {Promise<Array<Channel>>} Todos los canales procesados
   */
  async #processPlaylistUrls(playlistUrls) {
    const allChannels = [];
    const maxConcurrent = 5; // Limitar concurrencia para evitar sobrecarga
    
    this.#logger.info(`🔄 Procesando ${playlistUrls.length} playlists con máximo ${maxConcurrent} concurrentes...`);
    
    // Procesar en lotes para controlar la concurrencia
    for (let i = 0; i < playlistUrls.length; i += maxConcurrent) {
      const batch = playlistUrls.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(async (playlistUrl, index) => {
        const globalIndex = i + index + 1;
        
        try {
          this.#logger.debug(`📋 Procesando playlist ${globalIndex}/${playlistUrls.length}: ${playlistUrl}`);
          
          // Descargar playlist M3U
          const response = await fetch(playlistUrl, {
            timeout: 15000,
            headers: {
              'User-Agent': 'TV-IPTV-Addon/1.0.0'
            }
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const m3uContent = await response.text();
          
          if (!m3uContent || m3uContent.trim().length === 0) {
            throw new Error('Contenido M3U vacío');
          }
          
          // Parsear contenido M3U
          const channels = await this.#m3uParser.parseM3U(m3uContent);
          
          if (channels.length > 0) {
            this.#logger.debug(`✅ Playlist ${globalIndex} procesada: ${channels.length} canales`);
            return channels;
          } else {
            this.#logger.debug(`⚠️ Playlist ${globalIndex} sin canales válidos`);
            return [];
          }
          
        } catch (error) {
          this.#logger.warn(`❌ Error procesando playlist ${globalIndex} (${playlistUrl}): ${error.message}`);
          return [];
        }
      });
      
      // Esperar que termine el lote actual
      const batchResults = await Promise.all(batchPromises);
      
      // Agregar todos los canales del lote
      for (const channels of batchResults) {
        allChannels.push(...channels);
      }
      
      // Pequeña pausa entre lotes para no sobrecargar los servidores
      if (i + maxConcurrent < playlistUrls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    this.#logger.info(`✅ Procesamiento de playlists completado: ${allChannels.length} canales totales`);
    return allChannels;
  }

  /**
   * Elimina canales duplicados basándose en el ID del canal
   * @private
   * @param {Array<Channel>} channels
   * @returns {Array<Channel>}
   */
  #removeDuplicates(channels) {
    const uniqueChannels = new Map();
    
    for (const channel of channels) {
      const key = channel.id;
      if (!uniqueChannels.has(key)) {
        uniqueChannels.set(key, channel);
      }
    }
    
    return Array.from(uniqueChannels.values());
  }

  /**
   * Determina si se debe validar conectividad antes del filtrado
   * @returns {boolean}
   */
  #shouldValidateBeforeFiltering() {
    return this.#config.getConfig('validation')?.validateBeforeFiltering || false;
  }

  /**
   * Determina si se debe validar canales removidos por filtro
   * @returns {boolean}
   */
  #shouldValidateFilteredChannels() {
    return this.#config.getConfig('validation')?.validateFilteredChannels || false;
  }

  /**
   * Determina si se debe validar canales después del filtrado
   * @returns {boolean}
   */
  #shouldValidateAfterFiltering() {
    return this.#config.getConfig('validation')?.validateAfterFiltering || false;
  }

  /**
   * Valida conectividad de canales antes del filtrado
   * @param {Channel[]} channels - Canales a validar
   * @returns {Promise<{validChannels: Channel[], invalidChannels: Channel[], stats: Object}>}
   */
  async #validateChannelsBeforeFiltering(channels) {
    this.#logger.info(`🔍 Iniciando validación previa al filtrado de ${channels.length} canales...`);
    
    const startTime = Date.now();
    const result = await this.#streamValidationService.validateChannelsBatch(channels);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    this.#logger.info(`Validación previa completada: ${result.validChannels.length}/${channels.length} OK (${(result.validChannels.length/channels.length*100).toFixed(1)}%) en ${duration}s`);
    
    return result;
  }

  /**
   * Valida conectividad de canales removidos por el filtro inteligente
   * @param {Channel[]} originalChannels - Canales antes del filtro
   * @param {Channel[]} filteredChannels - Canales después del filtro
   */
  async #validateRemovedChannels(originalChannels, filteredChannels) {
    // Obtener canales removidos por el filtro
    const filteredUrls = new Set(filteredChannels.map(ch => ch.streamUrl));
    const removedChannels = originalChannels.filter(ch => !filteredUrls.has(ch.streamUrl));
    
    if (removedChannels.length === 0) {
      return;
    }
    
    this.#logger.info(`🔍 Validando conectividad de ${removedChannels.length} canales removidos por filtro...`);
    
    const startTime = Date.now();
    const result = await this.#streamValidationService.validateChannelsBatch(removedChannels);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    const validRemovedCount = result.validChannels.length;
    const invalidRemovedCount = result.invalidChannels.length;
    
    this.#logger.info(`📊 Canales removidos por filtro - Válidos: ${validRemovedCount} (${(validRemovedCount/removedChannels.length*100).toFixed(1)}%) - Inválidos: ${invalidRemovedCount} (${(invalidRemovedCount/removedChannels.length*100).toFixed(1)}%) en ${duration}s`);
    
    if (validRemovedCount > 0) {
       this.#logger.warn(`⚠️  Se removieron ${validRemovedCount} canales válidos por el filtro inteligente`);
       
       // Log de algunos ejemplos de canales válidos removidos
       const examples = result.validChannels.slice(0, 5).map(ch => ch.name || ch.title || 'Sin nombre');
       this.#logger.warn(`Ejemplos de canales válidos removidos: ${examples.join(', ')}${result.validChannels.length > 5 ? '...' : ''}`);
     }
   }

   /**
    * Valida conectividad de canales después del filtrado
    * @param {Channel[]} channels - Canales finales a validar
    * @returns {Promise<{validChannels: Channel[], invalidChannels: Channel[], stats: Object}>}
    */
   async #validateChannelsAfterFiltering(channels) {
     this.#logger.info(`🔍 Validando conectividad de ${channels.length} canales finales después del filtrado...`);
     
     const startTime = Date.now();
     const result = await this.#streamValidationService.validateChannelsBatch(channels);
     const duration = ((Date.now() - startTime) / 1000).toFixed(1);
     
     const validCount = result.validChannels.length;
     const invalidCount = result.invalidChannels.length;
     const successRate = ((validCount / channels.length) * 100).toFixed(1);
     
     this.#logger.info(`📊 Validación post-filtrado completada: ${validCount}/${channels.length} válidos (${successRate}%) en ${duration}s`);
     
     if (invalidCount > 0) {
       this.#logger.warn(`⚠️  Se encontraron ${invalidCount} canales inválidos en el resultado final`);
       
       // Log de algunos ejemplos de canales inválidos
       const examples = result.invalidChannels.slice(0, 3).map(ch => ch.name || ch.title || 'Sin nombre');
       this.#logger.warn(`Ejemplos de canales inválidos: ${examples.join(', ')}${result.invalidChannels.length > 3 ? '...' : ''}`);
     }
     
     return result;
   }

  /**
   * Construye el mapa de canales para búsqueda rápida
   * @private
   */
  #buildChannelMap() {
    this.#channelMap.clear();
    for (const channel of this.#channels) {
      this.#channelMap.set(channel.id, channel);
    }
  }

  /**
   * Verifica si necesita refrescar los datos
   * @private
   * @returns {boolean}
   */
  #needsRefresh() {
    if (!this.#lastLoadTime) return true;
    
    const { cacheChannelsHours } = this.#config.streaming;
    const cacheAgeMs = cacheChannelsHours * 60 * 60 * 1000;
    
    return (new Date() - this.#lastLoadTime) > cacheAgeMs;
  }

  // Implementación de métodos del contrato ChannelRepository

  async getAllChannels() {
    if (!this.#isInitialized) {
      await this.initialize();
    }
    
    if (this.#needsRefresh()) {
      await this.#downloadAndProcessM3U();
      this.#lastLoadTime = new Date();
    }
    
    return [...this.#channels];
  }

  async getAllChannelsUnfiltered() {
    return this.getAllChannels();
  }

  async getChannelById(id) {
    if (!this.#isInitialized) {
      await this.initialize();
    }
    
    return this.#channelMap.get(id) || null;
  }

  async getChannelsCount() {
    if (!this.#isInitialized) {
      await this.initialize();
    }
    
    return this.#channels.length;
  }

  async getChannelsPaginated(offset = 0, limit = 50) {
    const allChannels = await this.getAllChannels();
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = allChannels.length;
    const filteredChannels = filterBannedChannels(allChannels);
    const afterBannedCount = filteredChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de canales prohibidos aplicados: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return filteredChannels.slice(offset, offset + limit);
  }

  async searchChannels(query) {
    const allChannels = await this.getAllChannels();
    const searchTerm = query.toLowerCase();
    
    let searchResults = allChannels.filter(channel => 
      channel.name.toLowerCase().includes(searchTerm) ||
      channel.group.toLowerCase().includes(searchTerm) ||
      channel.country.toLowerCase().includes(searchTerm)
    );
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = searchResults.length;
    searchResults = filterBannedChannels(searchResults);
    const afterBannedCount = searchResults.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de canales prohibidos aplicados: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return searchResults;
  }

  async getChannelsByCountry(country) {
    const allChannels = await this.getAllChannels();
    let countryChannels = allChannels.filter(channel => 
      channel.country.toLowerCase() === country.toLowerCase()
    );
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = countryChannels.length;
    countryChannels = filterBannedChannels(countryChannels);
    const afterBannedCount = countryChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de canales prohibidos aplicados: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return countryChannels;
  }

  async getChannelsByGroup(group) {
    const allChannels = await this.getAllChannels();
    return allChannels.filter(channel => 
      channel.group.toLowerCase() === group.toLowerCase()
    );
  }

  async refreshChannels() {
    this.#logger.info('Refrescando canales del repositorio automático...');
    await this.#downloadAndProcessM3U();
    this.#lastLoadTime = new Date();
    this.#logger.info('Canales refrescados exitosamente');
  }

  async refreshFromRemote() {
    this.#logger.info('Forzando refresco desde fuente automática...');
    await this.#downloadAndProcessM3U();
    this.#lastLoadTime = new Date();
  }

  getRepositoryInfo() {
    return {
      type: 'automatic',
      source: this.#config.dataSources.autoM3uUrl,
      channelsCount: this.#channels.length,
      lastUpdate: this.#lastLoadTime,
      isInitialized: this.#isInitialized
    };
  }
}

export default AutomaticChannelRepository;