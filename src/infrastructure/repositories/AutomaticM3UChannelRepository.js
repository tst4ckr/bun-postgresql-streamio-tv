/**
 * @fileoverview AutomaticM3UChannelRepository - Repositorio automático para procesamiento de M3U
 * Descarga M3U desde URL, extrae URLs con '/play/' e IPs públicas, genera playlists automáticamente
 */

import { ChannelRepository, RepositoryError } from '../../domain/repositories/ChannelRepository.js';
import { M3UParserService } from '../parsers/M3UParserService.js';
import { Channel } from '../../domain/entities/Channel.js';
import { ChannelDeduplicationService, DeduplicationConfig } from '../../domain/services/ChannelDeduplicationService.js';
import ContentFilterService from '../../domain/services/ContentFilterService.js';
import { filterBannedChannels } from '../../config/banned-channels.js';

/**
 * Repositorio automático que procesa M3U desde URL configurada
 * Responsabilidad: descargar M3U, extraer URLs con '/play/' e IPs públicas, generar playlists
 * 
 * PROCESO AUTOMÁTICO:
 * 1. Descarga M3U desde AUTO_M3U_URL
 * 2. Extrae URLs que contengan '/play/' con dominio IP pública
 * 3. Genera lista única de URLs en formato http://IP:PUERTO/playlist.m3u
 * 4. Procesa estas URLs como fuentes M3U para evaluación y agrupamiento
 */
export class AutomaticM3UChannelRepository extends ChannelRepository {
  #autoM3uUrl;
  #parser;
  #config;
  #logger;
  #channels = [];
  #channelMap = new Map();
  #isInitialized = false;
  #lastLoadTime = null;
  #deactivatedChannels = new Set();
  #contentFilter;
  #deduplicationService;
  #extractedPlaylistUrls = [];

  /**
   * @param {string} autoM3uUrl - URL del M3U a procesar automáticamente
   * @param {TVAddonConfig} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(autoM3uUrl, config, logger) {
    super();
    this.#autoM3uUrl = autoM3uUrl;
    this.#config = config;
    this.#logger = logger;
    
    // Inicializar servicios
    this.#parser = new M3UParserService(config.filters);
    this.#contentFilter = new ContentFilterService(config.filters);
    this.#deduplicationService = new ChannelDeduplicationService(DeduplicationConfig.fromEnvironment());
    
    this.#logger.info(`AutomaticM3UChannelRepository creado para URL: ${autoM3uUrl}`);
  }

  /**
   * Inicializa el repositorio descargando y procesando el M3U automáticamente
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.#isInitialized) {
      this.#logger.debug('Repositorio automático ya inicializado');
      return;
    }

    try {
      this.#logger.info(`🤖 Iniciando modo automático desde: ${this.#autoM3uUrl}`);
      
      // 1. Descargar M3U desde URL configurada
      const m3uContent = await this.#downloadM3U(this.#autoM3uUrl);
      
      // 2. Parsear M3U para obtener canales
      const parsedChannels = await this.#parser.parseM3UContent(m3uContent);
      this.#logger.info(`📥 M3U descargado y parseado: ${parsedChannels.length} canales encontrados`);
      
      // 3. Extraer URLs con '/play/' e IPs públicas
      const playUrls = this.#extractPlayUrls(parsedChannels);
      this.#logger.info(`🔍 URLs con '/play/' encontradas: ${playUrls.length}`);
      
      // 4. Filtrar solo IPs públicas
      const publicIpUrls = this.#filterPublicIpUrls(playUrls);
      this.#logger.info(`🌐 URLs con IPs públicas: ${publicIpUrls.length}`);
      
      // 5. Generar URLs de playlist únicas
      this.#extractedPlaylistUrls = this.#generatePlaylistUrls(publicIpUrls);
      this.#logger.info(`📋 URLs de playlist generadas: ${this.#extractedPlaylistUrls.length}`);
      
      // 6. Procesar cada URL de playlist como fuente M3U
      await this.#processPlaylistUrls(this.#extractedPlaylistUrls);
      
      this.#lastLoadTime = new Date();
      this.#isInitialized = true;
      
      this.#logger.info(`✅ Modo automático inicializado: ${this.#channels.length} canales procesados`);
      
    } catch (error) {
      throw new RepositoryError(`Error inicializando repositorio automático: ${error.message}`, error);
    }
  }

  /**
   * Descarga contenido M3U desde URL
   * @private
   * @param {string} url - URL del M3U
   * @returns {Promise<string>} Contenido del M3U
   */
  async #downloadM3U(url) {
    try {
      this.#logger.debug(`Descargando M3U desde: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 30000
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const content = await response.text();
      
      if (!content || content.trim().length === 0) {
        throw new Error('Contenido M3U vacío');
      }
      
      this.#logger.debug(`M3U descargado exitosamente: ${content.length} caracteres`);
      return content;
      
    } catch (error) {
      this.#logger.error(`Error descargando M3U desde ${url}:`, error);
      throw new Error(`Error descargando M3U: ${error.message}`);
    }
  }

  /**
   * Extrae URLs que contengan '/play/' en su ruta
   * @private
   * @param {Channel[]} channels - Canales parseados del M3U
   * @returns {string[]} URLs que contienen '/play/'
   */
  #extractPlayUrls(channels) {
    const playUrls = [];
    
    for (const channel of channels) {
      if (channel.url && channel.url.includes('/play/')) {
        playUrls.push(channel.url);
      }
    }
    
    // Eliminar duplicados
    return [...new Set(playUrls)];
  }

  /**
   * Filtra URLs que tengan dominio con IP pública
   * @private
   * @param {string[]} urls - URLs a filtrar
   * @returns {string[]} URLs con IPs públicas
   */
  #filterPublicIpUrls(urls) {
    const publicIpUrls = [];
    
    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        // Verificar si es una IP
        if (this.#isValidIpAddress(hostname)) {
          // Verificar si es IP pública
          if (this.#isPublicIp(hostname)) {
            publicIpUrls.push(url);
          }
        }
      } catch (error) {
        this.#logger.debug(`URL inválida ignorada: ${url}`);
      }
    }
    
    return publicIpUrls;
  }

  /**
   * Verifica si una cadena es una dirección IP válida
   * @private
   * @param {string} ip - Cadena a verificar
   * @returns {boolean} True si es IP válida
   */
  #isValidIpAddress(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  }

  /**
   * Verifica si una IP es pública (no privada ni reservada)
   * @private
   * @param {string} ip - Dirección IP
   * @returns {boolean} True si es IP pública
   */
  #isPublicIp(ip) {
    const parts = ip.split('.').map(Number);
    
    // Rangos de IPs privadas y reservadas
    // 10.0.0.0/8
    if (parts[0] === 10) return false;
    
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return false;
    
    // 127.0.0.0/8 (localhost)
    if (parts[0] === 127) return false;
    
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return false;
    
    // 224.0.0.0/4 (multicast)
    if (parts[0] >= 224 && parts[0] <= 239) return false;
    
    // 240.0.0.0/4 (reserved)
    if (parts[0] >= 240) return false;
    
    return true;
  }

  /**
   * Genera URLs de playlist en formato http://IP:PUERTO/playlist.m3u
   * @private
   * @param {string[]} urls - URLs con IPs públicas
   * @returns {string[]} URLs de playlist generadas
   */
  #generatePlaylistUrls(urls) {
    const playlistUrls = new Set();
    
    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        const ip = urlObj.hostname;
        const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
        
        // Generar URL de playlist en formato requerido
        const playlistUrl = `http://${ip}:${port}/playlist.m3u`;
        playlistUrls.add(playlistUrl);
        
      } catch (error) {
        this.#logger.debug(`Error procesando URL para playlist: ${url}`);
      }
    }
    
    return Array.from(playlistUrls);
  }

  /**
   * Procesa cada URL de playlist como fuente M3U
   * @private
   * @param {string[]} playlistUrls - URLs de playlist a procesar
   * @returns {Promise<void>}
   */
  async #processPlaylistUrls(playlistUrls) {
    const allChannels = [];
    
    for (let i = 0; i < playlistUrls.length; i++) {
      const playlistUrl = playlistUrls[i];
      
      try {
        this.#logger.debug(`Procesando playlist ${i + 1}/${playlistUrls.length}: ${playlistUrl}`);
        
        // Descargar y parsear cada playlist
        const m3uContent = await this.#downloadM3U(playlistUrl);
        const channels = await this.#parser.parseM3UContent(m3uContent);
        
        // Aplicar filtros de contenido
        const filteredChannels = this.#contentFilter.filterChannels(channels);
        
        allChannels.push(...filteredChannels);
        this.#logger.debug(`Playlist ${i + 1} procesada: ${filteredChannels.length} canales válidos`);
        
      } catch (error) {
        this.#logger.warn(`Error procesando playlist ${playlistUrl}: ${error.message}`);
        // Continuar con las siguientes playlists aunque una falle
      }
    }
    
    // Aplicar deduplicación a todos los canales
    if (allChannels.length > 0) {
      const deduplicationResult = await this.#deduplicationService.deduplicateChannels(allChannels);
      
      // Aplicar filtro de canales prohibidos antes de almacenar en caché
      const beforeBannedCount = deduplicationResult.channels.length;
      const filteredChannels = filterBannedChannels(deduplicationResult.channels);
      const bannedRemovedCount = beforeBannedCount - filteredChannels.length;
      
      this.#channels = filteredChannels;
      this.#channelMap.clear();
      this.#channels.forEach(channel => {
        this.#channelMap.set(channel.id, channel);
      });
      
      const metrics = deduplicationResult.metrics;
      this.#logger.info(
        `📊 Deduplicación automática completada: ${this.#channels.length} canales únicos ` +
        `(${metrics.duplicatesRemoved} duplicados eliminados, ${metrics.hdUpgrades} actualizados a HD` +
        `${bannedRemovedCount > 0 ? `, ${bannedRemovedCount} canales prohibidos removidos` : ''})`
      );
    }
  }

  /**
   * Refresca los datos desde la fuente automática
   * @returns {Promise<void>}
   */
  async refreshFromRemote() {
    this.#logger.info('Refrescando repositorio automático...');
    this.#isInitialized = false;
    this.#channels = [];
    this.#channelMap.clear();
    this.#extractedPlaylistUrls = [];
    
    await this.initialize();
  }

  /**
   * Obtiene todos los canales sin filtrar
   * @returns {Promise<Channel[]>}
   */
  async getAllChannelsUnfiltered() {
    if (!this.#isInitialized) {
      await this.initialize();
    }
    return [...this.#channels];
  }

  /**
   * Obtiene todos los canales filtrados
   * @returns {Promise<Channel[]>}
   */
  async getAllChannels() {
    const channels = await this.getAllChannelsUnfiltered();
    let filteredChannels = channels.filter(channel => !this.#deactivatedChannels.has(channel.id));
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      filteredChannels = this.#contentFilter.filterChannels(filteredChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = filteredChannels.length;
    filteredChannels = filterBannedChannels(filteredChannels);
    const afterBannedCount = filteredChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de canales prohibidos aplicados: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return filteredChannels;
  }

  /**
   * Obtiene un canal por ID
   * @param {string} channelId - ID del canal
   * @returns {Promise<Channel|null>}
   */
  async getChannelById(channelId) {
    if (!this.#isInitialized) {
      await this.initialize();
    }
    return this.#channelMap.get(channelId) || null;
  }

  /**
   * Obtiene el conteo de canales
   * @returns {Promise<number>}
   */
  async getChannelsCount() {
    const channels = await this.getAllChannels();
    return channels.length;
  }

  /**
   * Obtiene estadísticas del repositorio automático
   * @returns {Promise<Object>}
   */
  async getRepositoryStats() {
    const allChannels = await this.getAllChannelsUnfiltered();
    const activeChannels = await this.getAllChannels();
    
    return {
      type: 'automatic',
      autoM3uUrl: this.#autoM3uUrl,
      extractedPlaylistUrls: this.#extractedPlaylistUrls.length,
      totalChannels: allChannels.length,
      activeChannels: activeChannels.length,
      deactivatedChannels: this.#deactivatedChannels.size,
      lastLoadTime: this.#lastLoadTime,
      isInitialized: this.#isInitialized
    };
  }

  /**
   * Obtiene las URLs de playlist extraídas
   * @returns {string[]} URLs de playlist generadas
   */
  getExtractedPlaylistUrls() {
    return [...this.#extractedPlaylistUrls];
  }
}

export default AutomaticM3UChannelRepository;