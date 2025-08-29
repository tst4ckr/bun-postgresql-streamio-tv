/**
 * @fileoverview AutomaticChannelRepository - Repositorio para modo automático
 * Descarga M3U, extrae URLs con /play/ e IPs públicas, y las convierte al formato requerido
 */

import { ChannelRepository, RepositoryError } from '../../domain/repositories/ChannelRepository.js';
import { Channel } from '../../domain/entities/Channel.js';
import { M3UParserService } from '../parsers/M3UParserService.js';
import { HttpsToHttpConversionService } from '../services/HttpsToHttpConversionService.js';
import { StreamHealthService } from '../services/StreamHealthService.js';
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
   * @private
   * @returns {Promise<void>}
   */
  async #downloadAndProcessM3U() {
    const { autoM3uUrl } = this.#config.dataSources;
    
    if (!autoM3uUrl) {
      throw new Error('AUTO_M3U_URL no configurada');
    }

    this.#logger.info(`Descargando M3U desde: ${autoM3uUrl}`);
    
    try {
      // Descargar contenido M3U
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

      // Parsear contenido M3U
      const parsedChannels = await this.#m3uParser.parseM3UContent(m3uContent);
      this.#logger.info(`Canales parseados: ${parsedChannels.length}`);

      // Filtrar URLs que cumplan criterios
      const filteredChannels = this.#filterChannelsByPlayAndPublicIP(parsedChannels);
      this.#logger.info(`Canales filtrados (con /play/ e IP pública): ${filteredChannels.length}`);

      // Convertir URLs al formato requerido
      const convertedChannels = await this.#convertToRequiredFormat(filteredChannels);
      this.#logger.info(`Canales convertidos al formato requerido: ${convertedChannels.length}`);

      // Eliminar duplicados
      const uniqueChannels = this.#removeDuplicates(convertedChannels);
      this.#logger.info(`Canales únicos finales: ${uniqueChannels.length}`);

      this.#channels = uniqueChannels;
      this.#buildChannelMap();

    } catch (error) {
      this.#logger.error('Error descargando/procesando M3U:', error);
      throw error;
    }
  }

  /**
   * Filtra canales que contengan '/play/' y tengan IP pública
   * @private
   * @param {Array<Channel>} channels
   * @returns {Array<Channel>}
   */
  #filterChannelsByPlayAndPublicIP(channels) {
    return channels.filter(channel => {
      try {
        const url = new URL(channel.url);
        
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
        this.#logger.debug(`URL inválida ignorada: ${channel.url}`);
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
   * Convierte URLs al formato requerido: http://IP_PUBLICA:PUERTO/playlist.m3u
   * @private
   * @param {Array<Channel>} channels
   * @returns {Promise<Array<Channel>>}
   */
  async #convertToRequiredFormat(channels) {
    const convertedChannels = [];
    const processedBaseUrls = new Set();

    for (const channel of channels) {
      try {
        const url = new URL(channel.url);
        
        // Crear URL base en formato requerido
        const baseUrl = `http://${url.hostname}:${url.port || '80'}/playlist.m3u`;
        
        // Evitar duplicados de la misma URL base
        if (processedBaseUrls.has(baseUrl)) {
          continue;
        }
        processedBaseUrls.add(baseUrl);

        // Crear nuevo canal con URL convertida
        const convertedChannel = new Channel({
          id: `auto_${url.hostname}_${url.port || '80'}`,
          name: `Auto ${url.hostname}:${url.port || '80'}`,
          url: baseUrl,
          logo: channel.logo || null,
          group: 'Automatic',
          country: channel.country || 'Unknown',
          language: channel.language || 'Unknown',
          isNSFW: false
        });

        convertedChannels.push(convertedChannel);
        
      } catch (error) {
        this.#logger.debug(`Error convirtiendo URL ${channel.url}:`, error);
      }
    }

    return convertedChannels;
  }

  /**
   * Elimina canales duplicados basándose en la URL
   * @private
   * @param {Array<Channel>} channels
   * @returns {Array<Channel>}
   */
  #removeDuplicates(channels) {
    const uniqueChannels = new Map();
    
    for (const channel of channels) {
      const key = channel.url;
      if (!uniqueChannels.has(key)) {
        uniqueChannels.set(key, channel);
      }
    }
    
    return Array.from(uniqueChannels.values());
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
    return allChannels.slice(offset, offset + limit);
  }

  async searchChannels(query) {
    const allChannels = await this.getAllChannels();
    const searchTerm = query.toLowerCase();
    
    return allChannels.filter(channel => 
      channel.name.toLowerCase().includes(searchTerm) ||
      channel.group.toLowerCase().includes(searchTerm) ||
      channel.country.toLowerCase().includes(searchTerm)
    );
  }

  async getChannelsByCountry(country) {
    const allChannels = await this.getAllChannels();
    return allChannels.filter(channel => 
      channel.country.toLowerCase() === country.toLowerCase()
    );
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