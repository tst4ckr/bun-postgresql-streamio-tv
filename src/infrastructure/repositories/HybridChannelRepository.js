/**
 * @fileoverview HybridChannelRepository - Implementación híbrida para múltiples fuentes
 * Combina canales de CSV local con URLs M3U remotas, priorizando CSV local
 */

import { ChannelRepository, RepositoryError, ChannelNotFoundError } from '../../domain/repositories/ChannelRepository.js';
import { CSVChannelRepository } from './CSVChannelRepository.js';
import { RemoteM3UChannelRepository } from './RemoteM3UChannelRepository.js';
import { M3UParserService } from '../parsers/M3UParserService.js';

/**
 * Repositorio híbrido que combina múltiples fuentes de canales
 * Responsabilidad: gestionar canales desde CSV local + URLs M3U remotas
 * Prioridad: CSV local primero, luego M3U remotas (evitando duplicados)
 */
export class HybridChannelRepository extends ChannelRepository {
  #csvRepository;
  #m3uRepositories = [];
  #config;
  #logger;
  #channels = [];
  #channelMap = new Map();
  #isInitialized = false;
  #lastLoadTime = null;
  #deactivatedChannels = new Set();
  #validatedChannels = new Map(); // channelId -> timestamp

  /**
   * @param {string} csvPath - Ruta al archivo CSV local
   * @param {string[]} m3uUrls - URLs de archivos M3U remotos
   * @param {TVAddonConfig} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(csvPath, m3uUrls, config, logger) {
    super();
    this.#config = config;
    this.#logger = logger;
    
    // Crear repositorio CSV
    this.#csvRepository = new CSVChannelRepository(csvPath, config, logger);
    
    // Crear repositorios M3U para cada URL
    const m3uParser = new M3UParserService(config.filters);
    this.#m3uRepositories = m3uUrls.filter(url => url).map(url => 
      new RemoteM3UChannelRepository(url, m3uParser, config, logger)
    );
    
    this.#logger.info(`HybridChannelRepository creado: CSV + ${this.#m3uRepositories.length} fuentes M3U`);
  }

  /**
   * Inicializa el repositorio híbrido
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.#isInitialized) {
      this.#logger.warn('Repositorio híbrido ya inicializado');
      return;
    }

    try {
      this.#logger.info('Inicializando repositorio híbrido...');
      
      // 1. Cargar canales del CSV local primero
      await this.#csvRepository.initialize();
      const csvChannels = await this.#csvRepository.getAllChannelsUnfiltered();
      this.#logger.info(`Cargados ${csvChannels.length} canales desde CSV local`);
      
      // 2. Inicializar mapa con canales CSV (prioridad)
      this.#channels = [...csvChannels];
      this.#channelMap.clear();
      csvChannels.forEach(channel => this.#channelMap.set(channel.id, channel));
      
      // 3. Cargar canales de URLs M3U remotas
      for (let i = 0; i < this.#m3uRepositories.length; i++) {
        const m3uRepo = this.#m3uRepositories[i];
        try {
          await m3uRepo.initialize();
          const m3uChannels = await m3uRepo.getAllChannelsUnfiltered();
          
          // Agregar solo canales que no existan en CSV (evitar duplicados)
          let addedCount = 0;
          m3uChannels.forEach(channel => {
            if (!this.#channelMap.has(channel.id)) {
              this.#channels.push(channel);
              this.#channelMap.set(channel.id, channel);
              addedCount++;
            }
          });
          
          this.#logger.info(`M3U ${i + 1}: ${addedCount} canales nuevos agregados (${m3uChannels.length} total, ${m3uChannels.length - addedCount} duplicados omitidos)`);
          
        } catch (error) {
          this.#logger.error(`Error cargando M3U ${i + 1}:`, error);
          // Continuar con las siguientes fuentes aunque una falle
        }
      }
      
      this.#lastLoadTime = new Date();
      this.#isInitialized = true;
      this.#logger.info(`Repositorio híbrido inicializado: ${this.#channels.length} canales totales`);
      
    } catch (error) {
      throw new RepositoryError(`Error inicializando repositorio híbrido: ${error.message}`, error);
    }
  }

  /**
   * Refresca los datos desde todas las fuentes
   * @private
   * @returns {Promise<void>}
   */
  async #refreshAllSources() {
    try {
      this.#logger.info('Refrescando todas las fuentes del repositorio híbrido...');
      
      // Refrescar CSV
      await this.#csvRepository.refreshFromRemote();
      const csvChannels = await this.#csvRepository.getAllChannelsUnfiltered();
      
      // Reinicializar con canales CSV
      this.#channels = [...csvChannels];
      this.#channelMap.clear();
      csvChannels.forEach(channel => this.#channelMap.set(channel.id, channel));
      
      // Refrescar y agregar M3U
      for (const m3uRepo of this.#m3uRepositories) {
        try {
          await m3uRepo.refreshFromRemote();
          const m3uChannels = await m3uRepo.getAllChannelsUnfiltered();
          
          // Agregar solo canales nuevos
          m3uChannels.forEach(channel => {
            if (!this.#channelMap.has(channel.id)) {
              this.#channels.push(channel);
              this.#channelMap.set(channel.id, channel);
            }
          });
        } catch (error) {
          this.#logger.error('Error refrescando fuente M3U:', error);
        }
      }
      
      this.#lastLoadTime = new Date();
      this.#logger.info(`Refresco completado: ${this.#channels.length} canales totales`);
      
    } catch (error) {
      this.#logger.error('Error refrescando fuentes:', error);
      throw new RepositoryError(`Error refrescando repositorio híbrido: ${error.message}`, error);
    }
  }

  /**
   * Verifica si necesita refresco
   * @private
   * @returns {boolean}
   */
  #needsRefresh() {
    if (!this.#lastLoadTime) return true;
    
    const { cacheChannelsHours } = this.#config.streaming;
    const cacheAgeMs = cacheChannelsHours * 60 * 60 * 1000;
    
    return (new Date() - this.#lastLoadTime) > cacheAgeMs;
  }

  /**
   * Refresca si es necesario
   * @private
   * @returns {Promise<void>}
   */
  async #refreshIfNeeded() {
    if (this.#needsRefresh()) {
      await this.#refreshAllSources();
    }
  }

  /**
   * Filtra canales activos según configuración
   * @private
   * @param {Array<Channel>} channels
   * @returns {Array<Channel>}
   */
  #filterActiveChannels(channels) {
    if (!this.#config.validation.removeInvalidStreams) {
      return channels;
    }
    
    return channels.filter(channel => !this.#deactivatedChannels.has(channel.id));
  }

  // Implementación de métodos del contrato ChannelRepository

  async getAllChannels() {
    await this.#refreshIfNeeded();
    return this.#filterActiveChannels([...this.#channels]);
  }

  async getAllChannelsUnfiltered() {
    await this.#refreshIfNeeded();
    return [...this.#channels];
  }

  async getChannelById(id) {
    await this.#refreshIfNeeded();
    const channel = this.#channelMap.get(id);
    if (!channel || (this.#config.validation.removeInvalidStreams && this.#deactivatedChannels.has(id))) {
      throw new ChannelNotFoundError(id);
    }
    return channel;
  }

  async getChannelsByGenre(genre) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.genre.toLowerCase() === genre.toLowerCase());
    return this.#filterActiveChannels(channels);
  }

  async getChannelsByCountry(country) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.country.toLowerCase().includes(country.toLowerCase()));
    return this.#filterActiveChannels(channels);
  }

  async getChannelsByLanguage(language) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.language.toLowerCase() === language.toLowerCase());
    return this.#filterActiveChannels(channels);
  }

  async searchChannels(searchTerm) {
    await this.#refreshIfNeeded();
    const term = searchTerm.toLowerCase();
    const channels = this.#channels.filter(ch => 
      ch.name.toLowerCase().includes(term) || 
      ch.genre.toLowerCase().includes(term)
    );
    return this.#filterActiveChannels(channels);
  }

  async getChannelsByFilter(filter) {
    await this.#refreshIfNeeded();
    let channels = [...this.#channels];

    if (filter.genre) {
      channels = channels.filter(ch => ch.genre.toLowerCase() === filter.genre.toLowerCase());
    }
    if (filter.country) {
      channels = channels.filter(ch => ch.country.toLowerCase().includes(filter.country.toLowerCase()));
    }
    if (filter.language) {
      channels = channels.filter(ch => ch.language.toLowerCase() === filter.language.toLowerCase());
    }
    if (filter.quality) {
      channels = channels.filter(ch => ch.quality === filter.quality);
    }

    return this.#filterActiveChannels(channels);
  }

  async getChannelsPaginated(skip = 0, limit = 50) {
    await this.#refreshIfNeeded();
    const activeChannels = this.#filterActiveChannels([...this.#channels]);
    return activeChannels.slice(skip, skip + limit);
  }

  async getChannelsPaginatedUnfiltered(skip = 0, limit = 50) {
    await this.#refreshIfNeeded();
    return this.#channels.slice(skip, skip + limit);
  }

  async getChannelsCount() {
    await this.#refreshIfNeeded();
    const activeChannels = this.#filterActiveChannels([...this.#channels]);
    return activeChannels.length;
  }

  async refreshFromRemote() {
    this.#logger.info('Forzando refresco de repositorio híbrido...');
    await this.#refreshAllSources();
  }

  async getChannelsNeedingValidation(hoursThreshold = 6) {
    await this.#refreshIfNeeded();
    
    const sampleSize = Math.min(30, this.#channels.length);
    const shuffled = [...this.#channels].sort(() => 0.5 - Math.random());
    
    return shuffled.slice(0, sampleSize);
  }

  async getRepositoryStats() {
    await this.#refreshIfNeeded();
    
    const csvChannels = await this.#csvRepository.getAllChannelsUnfiltered();
    let m3uChannelsTotal = 0;
    
    for (const m3uRepo of this.#m3uRepositories) {
      try {
        const m3uChannels = await m3uRepo.getAllChannelsUnfiltered();
        m3uChannelsTotal += m3uChannels.length;
      } catch (error) {
        this.#logger.error('Error obteniendo stats de M3U:', error);
      }
    }
    
    return {
      totalChannels: this.#channels.length,
      activeChannels: this.#filterActiveChannels([...this.#channels]).length,
      deactivatedChannels: this.#deactivatedChannels.size,
      csvChannels: csvChannels.length,
      m3uChannelsTotal,
      duplicatesOmitted: (csvChannels.length + m3uChannelsTotal) - this.#channels.length,
      sources: {
        csv: 1,
        m3u: this.#m3uRepositories.length
      },
      lastRefresh: this.#lastLoadTime
    };
  }

  // Métodos de gestión de canales inválidos

  async markChannelAsValidated(channelId) {
    this.#validatedChannels.set(channelId, new Date());
    this.#deactivatedChannels.delete(channelId);
    this.#logger.debug(`Canal híbrido ${channelId} marcado como validado`);
  }

  async deactivateChannel(channelId, reason) {
    this.#deactivatedChannels.add(channelId);
    this.#logger.info(`Canal híbrido ${channelId} desactivado: ${reason}`);
  }

  async getDeactivationStats() {
    return {
      deactivatedCount: this.#deactivatedChannels.size,
      validatedCount: this.#validatedChannels.size,
      deactivatedChannels: Array.from(this.#deactivatedChannels),
      lastValidationTimes: Object.fromEntries(this.#validatedChannels)
    };
  }

  // Métodos no aplicables para repositorio híbrido
  async updateChannel(channel) {
    throw new RepositoryError('El repositorio híbrido es de solo lectura.');
  }
}

export default HybridChannelRepository;