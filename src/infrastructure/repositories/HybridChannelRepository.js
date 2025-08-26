/**
 * @fileoverview HybridChannelRepository - Implementación híbrida para múltiples fuentes
 * Combina canales de CSV local con URLs M3U remotas, priorizando CSV local
 */

import { ChannelRepository, RepositoryError, ChannelNotFoundError } from '../../domain/repositories/ChannelRepository.js';
import { CSVChannelRepository } from './CSVChannelRepository.js';
import { RemoteM3UChannelRepository } from './RemoteM3UChannelRepository.js';
import { LocalM3UChannelRepository } from './LocalM3UChannelRepository.js';
import { M3UParserService } from '../parsers/M3UParserService.js';
import ContentFilterService from '../../domain/services/ContentFilterService.js';
import { HttpsToHttpConversionService } from '../../domain/services/HttpsToHttpConversionService.js';
import { StreamHealthService } from '../services/StreamHealthService.js';

/**
 * Repositorio híbrido que combina múltiples fuentes de canales
 * Responsabilidad: gestionar canales desde CSV local + URLs M3U remotas
 * 
 * PRIORIZACIÓN ESTRICTA:
 * 1. CSV local tiene prioridad ABSOLUTA sobre todas las demás fuentes
 * 2. Canales M3U remotos/locales solo se agregan si NO existen en CSV
 * 3. Duplicados de fuentes M3U se omiten automáticamente
 * 4. Durante refrescos, la prioridad CSV se mantiene intacta
 * 
 * Orden de carga: CSV local → M3U remotas → M3U locales
 * Deduplicación: Por ID de canal, CSV siempre gana
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
  #contentFilter; // Servicio de filtrado de contenido
  #httpsToHttpService; // Servicio de conversión HTTPS a HTTP

  /**
   * @param {string} csvPath - Ruta al archivo CSV local
   * @param {string[]} m3uSources - URLs remotas y rutas de archivos M3U locales
   * @param {TVAddonConfig} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(csvPath, m3uSources, config, logger) {
    super();
    this.#config = config;
    this.#logger = logger;
    
    // Inicializar servicio de filtrado de contenido
    this.#contentFilter = new ContentFilterService(config.filters);
    
    // Inicializar servicio de salud de streams
    const streamHealthService = new StreamHealthService(config, logger);
    
    // Inicializar servicio de conversión HTTPS a HTTP
    this.#httpsToHttpService = new HttpsToHttpConversionService(config, streamHealthService, logger);
    
    // Crear repositorio CSV
    this.#csvRepository = new CSVChannelRepository(csvPath, config, logger);
    
    // Separar URLs remotas de archivos locales y crear repositorios apropiados
    const m3uParser = new M3UParserService(config.filters);
    this.#m3uRepositories = [];
    
    let remoteCount = 0;
    let localCount = 0;
    
    m3uSources.filter(source => source).forEach(source => {
      if (this.#isRemoteUrl(source)) {
        // URL remota - usar RemoteM3UChannelRepository
        this.#m3uRepositories.push(
          new RemoteM3UChannelRepository(source, m3uParser, config, logger)
        );
        remoteCount++;
      } else {
        // Archivo local - usar LocalM3UChannelRepository
        this.#m3uRepositories.push(
          new LocalM3UChannelRepository(source, m3uParser, config, logger)
        );
        localCount++;
      }
    });
    
    this.#logger.info(`HybridChannelRepository creado: CSV + ${remoteCount} URLs remotas + ${localCount} archivos locales`);
  }

  /**
   * Determina si una fuente es una URL remota o un archivo local
   * @private
   * @param {string} source - Fuente a evaluar
   * @returns {boolean} true si es URL remota, false si es archivo local
   */
  #isRemoteUrl(source) {
    return source.startsWith('http://') || source.startsWith('https://');
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
          
          // Agregar solo canales que no existan en CSV (CSV tiene prioridad absoluta)
          let addedCount = 0;
          let duplicatesOmitted = 0;
          const duplicateChannels = [];
          
          m3uChannels.forEach(channel => {
            if (!this.#channelMap.has(channel.id)) {
              this.#channels.push(channel);
              this.#channelMap.set(channel.id, channel);
              addedCount++;
            } else {
              duplicatesOmitted++;
              duplicateChannels.push(channel.name);
            }
          });
          
          this.#logger.info(`M3U ${i + 1}: ${addedCount} canales nuevos agregados (${m3uChannels.length} total, ${duplicatesOmitted} duplicados omitidos por prioridad CSV)`);
          
          if (duplicatesOmitted > 0 && duplicateChannels.length <= 10) {
            this.#logger.debug(`Canales duplicados omitidos de M3U ${i + 1}: ${duplicateChannels.join(', ')}`);
          } else if (duplicatesOmitted > 10) {
            this.#logger.debug(`Canales duplicados omitidos de M3U ${i + 1}: ${duplicateChannels.slice(0, 10).join(', ')} y ${duplicatesOmitted - 10} más...`);
          }
          
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
      
      // Refrescar y agregar M3U (manteniendo prioridad CSV)
      let totalM3uAdded = 0;
      let totalM3uDuplicates = 0;
      
      for (let i = 0; i < this.#m3uRepositories.length; i++) {
        const m3uRepo = this.#m3uRepositories[i];
        try {
          await m3uRepo.refreshFromRemote();
          const m3uChannels = await m3uRepo.getAllChannelsUnfiltered();
          
          // Agregar solo canales que no existan en CSV (CSV mantiene prioridad)
          let addedCount = 0;
          let duplicatesCount = 0;
          
          m3uChannels.forEach(channel => {
            if (!this.#channelMap.has(channel.id)) {
              this.#channels.push(channel);
              this.#channelMap.set(channel.id, channel);
              addedCount++;
            } else {
              duplicatesCount++;
            }
          });
          
          totalM3uAdded += addedCount;
          totalM3uDuplicates += duplicatesCount;
          
          this.#logger.debug(`Refresco M3U ${i + 1}: ${addedCount} nuevos, ${duplicatesCount} duplicados omitidos por prioridad CSV`);
          
        } catch (error) {
          this.#logger.error(`Error refrescando fuente M3U ${i + 1}:`, error);
        }
      }
      
      if (this.#m3uRepositories.length > 0) {
        this.#logger.info(`Refresco M3U completado: ${totalM3uAdded} canales agregados, ${totalM3uDuplicates} duplicados omitidos por prioridad CSV`);
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
    let activeChannels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar conversión HTTPS a HTTP si está habilitada
    if (this.#httpsToHttpService.isEnabled()) {
      this.#logger.info('Aplicando conversión HTTPS a HTTP y validación de streams...');
      
      try {
        const conversionResult = await this.#httpsToHttpService.processChannels(activeChannels, {
          concurrency: this.#config.validation?.maxValidationConcurrency || 10,
          showProgress: true,
          onlyWorkingHttp: true
        });
        
        // Log estadísticas de conversión
        this.#logger.info(`Conversión HTTPS a HTTP completada: ${conversionResult.stats.total} canales procesados, ${conversionResult.stats.converted} convertidos, ${conversionResult.stats.httpWorking} validados`);
        
        if (conversionResult.stats.failed > 0) {
          this.#logger.warn(`${conversionResult.stats.failed} canales fallaron en la conversión/validación`);
        }
        
        // Usar los canales procesados (ya filtrados por onlyWorkingHttp: true)
        activeChannels = conversionResult.processed;
        
      } catch (error) {
        this.#logger.error('Error durante conversión HTTPS a HTTP:', error);
        // En caso de error, continuar con canales originales
      }
    }
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      const filteredChannels = this.#contentFilter.filterChannels(activeChannels);
      
      // Log estadísticas de filtrado
      const stats = this.#contentFilter.getFilterStats(activeChannels, filteredChannels);
      this.#logger.info(`Filtros de contenido aplicados: ${stats.removedChannels} canales removidos (${stats.removalPercentage}%)`);
      
      if (stats.removedChannels > 0) {
        this.#logger.debug(`Canales removidos por categoría: religioso=${stats.removedByCategory.religious}, adulto=${stats.removedByCategory.adult}, político=${stats.removedByCategory.political}`);
      }
      
      return filteredChannels;
    }
    
    return activeChannels;
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
    const activeChannels = this.#filterActiveChannels(channels);
    return this.#contentFilter.hasActiveFilters() ? this.#contentFilter.filterChannels(activeChannels) : activeChannels;
  }

  async getChannelsByCountry(country) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.country.toLowerCase().includes(country.toLowerCase()));
    const activeChannels = this.#filterActiveChannels(channels);
    return this.#contentFilter.hasActiveFilters() ? this.#contentFilter.filterChannels(activeChannels) : activeChannels;
  }

  async getChannelsByLanguage(language) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.language.toLowerCase() === language.toLowerCase());
    const activeChannels = this.#filterActiveChannels(channels);
    return this.#contentFilter.hasActiveFilters() ? this.#contentFilter.filterChannels(activeChannels) : activeChannels;
  }

  async searchChannels(searchTerm) {
    await this.#refreshIfNeeded();
    const term = searchTerm.toLowerCase();
    const channels = this.#channels.filter(ch => 
      ch.name.toLowerCase().includes(term) || 
      ch.genre.toLowerCase().includes(term)
    );
    const activeChannels = this.#filterActiveChannels(channels);
    return this.#contentFilter.hasActiveFilters() ? this.#contentFilter.filterChannels(activeChannels) : activeChannels;
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

    const activeChannels = this.#filterActiveChannels(channels);
    return this.#contentFilter.hasActiveFilters() ? this.#contentFilter.filterChannels(activeChannels) : activeChannels;
  }

  async getChannelsPaginated(skip = 0, limit = 50) {
    await this.#refreshIfNeeded();
    const activeChannels = this.#filterActiveChannels([...this.#channels]);
    const filteredChannels = this.#contentFilter.hasActiveFilters() ? this.#contentFilter.filterChannels(activeChannels) : activeChannels;
    return filteredChannels.slice(skip, skip + limit);
  }

  async getChannelsPaginatedUnfiltered(skip = 0, limit = 50) {
    await this.#refreshIfNeeded();
    return this.#channels.slice(skip, skip + limit);
  }

  async getChannelsCount() {
    await this.#refreshIfNeeded();
    const activeChannels = this.#filterActiveChannels([...this.#channels]);
    const filteredChannels = this.#contentFilter.hasActiveFilters() ? this.#contentFilter.filterChannels(activeChannels) : activeChannels;
    return filteredChannels.length;
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
    let remoteM3uChannelsTotal = 0;
    let localM3uChannelsTotal = 0;
    let remoteSourcesCount = 0;
    let localSourcesCount = 0;
    let totalM3uChannelsBeforeDedup = 0;
    
    for (const m3uRepo of this.#m3uRepositories) {
      try {
        const m3uChannels = await m3uRepo.getAllChannelsUnfiltered();
        totalM3uChannelsBeforeDedup += m3uChannels.length;
        
        // Determinar si es repositorio remoto o local
        if (m3uRepo instanceof RemoteM3UChannelRepository) {
          remoteM3uChannelsTotal += m3uChannels.length;
          remoteSourcesCount++;
        } else if (m3uRepo instanceof LocalM3UChannelRepository) {
          localM3uChannelsTotal += m3uChannels.length;
          localSourcesCount++;
        }
      } catch (error) {
        this.#logger.error('Error obteniendo stats de M3U:', error);
      }
    }
    
    const totalM3uChannels = remoteM3uChannelsTotal + localM3uChannelsTotal;
    const csvPriorityDuplicates = (csvChannels.length + totalM3uChannels) - this.#channels.length;
    const m3uChannelsAdded = this.#channels.length - csvChannels.length;
    const activeChannels = this.#filterActiveChannels([...this.#channels]);
    const filteredChannels = this.#contentFilter.hasActiveFilters() ? this.#contentFilter.filterChannels(activeChannels) : activeChannels;
    
    // Obtener estadísticas de filtrado de contenido
    const contentFilterStats = this.#contentFilter.hasActiveFilters() 
      ? this.#contentFilter.getFilterStats(activeChannels, filteredChannels)
      : null;
    
    const stats = {
      totalChannels: this.#channels.length,
      activeChannels: activeChannels.length,
      filteredChannels: filteredChannels.length,
      deactivatedChannels: this.#deactivatedChannels.size,
      csvChannels: csvChannels.length,
      remoteM3uChannels: remoteM3uChannelsTotal,
      localM3uChannels: localM3uChannelsTotal,
      m3uChannelsTotal: totalM3uChannels,
      duplicatesOmitted: csvPriorityDuplicates,
      m3uChannelsAdded: m3uChannelsAdded,
      csvPriorityApplied: csvPriorityDuplicates > 0,
      sources: {
        csv: 1,
        remoteM3u: remoteSourcesCount,
        localM3u: localSourcesCount,
        totalM3u: this.#m3uRepositories.length
      },
      lastRefresh: this.#lastLoadTime
    };
    
    // Agregar estadísticas de filtrado de contenido si están activas
    if (contentFilterStats) {
      stats.contentFiltering = {
        enabled: true,
        removedChannels: contentFilterStats.removedChannels,
        removalPercentage: contentFilterStats.removalPercentage,
        removedByCategory: contentFilterStats.removedByCategory,
        filtersActive: contentFilterStats.filtersActive,
        filterConfiguration: this.#contentFilter.getFilterConfiguration()
      };
    } else {
      stats.contentFiltering = {
        enabled: false,
        filterConfiguration: this.#contentFilter.getFilterConfiguration()
      };
    }
    
    return stats;
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