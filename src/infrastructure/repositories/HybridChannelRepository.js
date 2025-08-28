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
import { HttpsToHttpConversionService } from '../services/HttpsToHttpConversionService.js';
import { StreamHealthService } from '../services/StreamHealthService.js';
import { StreamValidationService } from '../services/StreamValidationService.js';

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
  #additionalCsvRepositories = [];
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
  #streamValidationService; // Servicio de validación temprana de streams

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
    
    // Inicializar servicio de validación temprana de streams
    this.#streamValidationService = new StreamValidationService(config, logger);
    
    // Crear repositorio CSV principal
    this.#csvRepository = new CSVChannelRepository(csvPath, config, logger);
    
    // Crear repositorios CSV adicionales si están configurados
    this.#additionalCsvRepositories = [];
    if (config.dataSources.localChannelsCsv) {
      this.#additionalCsvRepositories.push(
        new CSVChannelRepository(config.dataSources.localChannelsCsv, config, logger)
      );
      this.#logger.info(`Repositorio CSV adicional creado: ${config.dataSources.localChannelsCsv}`);
    }
    
    // Separar URLs remotas de archivos M3U locales y crear repositorios apropiados
    const m3uParser = new M3UParserService(config.filters);
    this.#m3uRepositories = [];
    
    let remoteCount = 0;
    let localCount = 0;
    
    m3uSources.filter(source => source).forEach(source => {
      // Verificar si es archivo CSV (no debe procesarse como M3U)
      if (source.toLowerCase().endsWith('.csv')) {
        this.#logger.warn(`Archivo CSV detectado en fuentes M3U, omitiendo: ${source}`);
        return;
      }
      
      if (this.#isRemoteUrl(source)) {
        // URL remota - usar RemoteM3UChannelRepository
        this.#m3uRepositories.push(
          new RemoteM3UChannelRepository(source, m3uParser, config, logger)
        );
        remoteCount++;
      } else {
        // Archivo local M3U - usar LocalM3UChannelRepository
        this.#m3uRepositories.push(
          new LocalM3UChannelRepository(source, m3uParser, config, logger)
        );
        localCount++;
      }
    });
    
    this.#logger.info(`HybridChannelRepository creado: CSV principal + ${this.#additionalCsvRepositories.length} CSV adicionales + ${remoteCount} URLs remotas + ${localCount} archivos M3U locales`);
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
      
      // 1. Cargar canales del CSV principal primero
      await this.#csvRepository.initialize();
      const csvChannels = await this.#csvRepository.getAllChannelsUnfiltered();
      this.#logger.info(`Cargados ${csvChannels.length} canales desde CSV principal`);
      
      // 2. Cargar canales de CSVs adicionales
      const additionalCsvChannels = [];
      for (let i = 0; i < this.#additionalCsvRepositories.length; i++) {
        const additionalCsvRepo = this.#additionalCsvRepositories[i];
        try {
          await additionalCsvRepo.initialize();
          const channels = await additionalCsvRepo.getAllChannelsUnfiltered();
          additionalCsvChannels.push(...channels);
          this.#logger.info(`CSV adicional ${i + 1}: ${channels.length} canales cargados`);
        } catch (error) {
          this.#logger.error(`Error cargando CSV adicional ${i + 1}:`, error);
          // Continuar con los siguientes archivos aunque uno falle
        }
      }
      
      // 3. Combinar todos los canales CSV (principal + adicionales)
      const allCsvChannels = [...csvChannels, ...additionalCsvChannels];
      this.#logger.info(`🔄 Procesando ${csvChannels.length} canales CSV principales + ${additionalCsvChannels.length} canales CSV adicionales = ${allCsvChannels.length} canales CSV totales`);
      
      // 4. Inicializar mapa con canales CSV (prioridad absoluta)
      this.#channels = [...allCsvChannels];
      this.#channelMap.clear();
      allCsvChannels.forEach(channel => this.#channelMap.set(channel.id, channel));
      
      // 5. Cargar canales de URLs M3U remotas (sin deduplicación aún)
      const allM3uChannels = [];
      for (let i = 0; i < this.#m3uRepositories.length; i++) {
        const m3uRepo = this.#m3uRepositories[i];
        try {
          await m3uRepo.initialize();
          const m3uChannels = await m3uRepo.getAllChannelsUnfiltered();
          allM3uChannels.push(...m3uChannels);
          this.#logger.info(`M3U ${i + 1}: ${m3uChannels.length} canales cargados`);
        } catch (error) {
          this.#logger.error(`Error cargando M3U ${i + 1}:`, error);
          // Continuar con las siguientes fuentes aunque una falle
        }
      }
      
      // 4. Aplicar conversión HTTPS→HTTP a todos los canales M3U ANTES de deduplicación
      let processedM3uChannels = allM3uChannels;
      
      if (this.#httpsToHttpService.isEnabled() && allM3uChannels.length > 0) {
        this.#logger.info(`🔄 Iniciando conversión HTTPS→HTTP para ${allM3uChannels.length} canales M3U con ${this.#config.validation?.maxValidationConcurrency || 10} workers`);
        
        try {
          const conversionResult = await this.#httpsToHttpService.processChannels(allM3uChannels, {
            concurrency: this.#config.validation?.maxValidationConcurrency || 10,
            showProgress: true,
            onlyWorkingHttp: true
          });
          
          // Usar solo canales que pasaron la conversión/validación
          processedM3uChannels = conversionResult.processed;
          
          this.#logger.info(
            `✅ Conversión HTTPS→HTTP completada: ${conversionResult.stats.total} procesados, ${conversionResult.stats.converted} convertidos, ${conversionResult.stats.httpWorking} (${(conversionResult.stats.httpWorking/conversionResult.stats.total*100).toFixed(1)}%) funcionales HTTP`
          );
          
          if (conversionResult.stats.failed > 0) {
            this.#logger.warn(`${conversionResult.stats.failed} canales fallaron conversión/validación`);
          }
          
        } catch (error) {
          this.#logger.error('Error durante conversión HTTPS→HTTP:', error);
          // En caso de error, continuar con canales originales
          processedM3uChannels = allM3uChannels;
        }
      } else {
        this.#logger.info('🔄 Conversión HTTPS→HTTP deshabilitada, usando canales originales');
      }
      
      // 5. Validación temprana de streams M3U procesados (CSV tiene prioridad absoluta)
      let validatedM3uChannels = processedM3uChannels;
      
      if (this.#streamValidationService.isEnabled()) {
        this.#logger.info(`🔍 Iniciando validación temprana de ${processedM3uChannels.length} canales M3U (CSV exento)...`);
        
        const validationResult = await this.#streamValidationService.validateChannelsBatch(
          processedM3uChannels,
          {
            concurrency: this.#config.validation?.earlyValidationConcurrency || 15,
            showProgress: true
          }
        );
        
        // Filtrar solo canales M3U válidos
        const validM3uChannels = validationResult.validated
          .filter(result => result.isValid)
          .map(result => result.channel);
        
        const invalidM3uChannels = validationResult.validated
          .filter(result => !result.isValid)
          .map(result => result.channel);
        
        this.#logger.info(
          `✅ Validación M3U completada: ${validM3uChannels.length} válidos, ${invalidM3uChannels.length} inválidos de ${processedM3uChannels.length} totales`
        );
        this.#logger.info(
          `📋 Canales CSV preservados: ${allCsvChannels.length} (prioridad absoluta, sin validación)`
        );
        
        // Usar solo canales M3U válidos para deduplicación
        validatedM3uChannels = validM3uChannels;
        
        // Marcar solo canales M3U inválidos como desactivados
        invalidM3uChannels.forEach(channel => {
          this.#deactivatedChannels.add(channel.id);
        });
        
      } else {
        this.#logger.info('🔄 Validación temprana deshabilitada, usando todos los canales');
      }
      
      // 5. Deduplicación inteligente con prioridad CSV absoluta
      this.#channels = [];
      this.#channelMap.clear();
      
      // Agregar TODOS los canales CSV primero (prioridad absoluta, sin validación)
      allCsvChannels.forEach(channel => {
        this.#channels.push(channel);
        this.#channelMap.set(channel.id, channel);
      });
      
      // Deduplicación inteligente con priorización HD
      let m3uAdded = 0;
      let m3uDuplicates = 0;
      let hdUpgrades = 0;
      
      validatedM3uChannels.forEach(channel => {
        if (!this.#channelMap.has(channel.id)) {
          // Canal nuevo, agregar directamente
          this.#channels.push(channel);
          this.#channelMap.set(channel.id, channel);
          m3uAdded++;
        } else {
          // Canal duplicado, verificar si el M3U es HD y el CSV no
          const existingChannel = this.#channelMap.get(channel.id);
          if (this.#shouldReplaceWithHDChannel(existingChannel, channel)) {
            // Reemplazar canal existente con versión HD
            const channelIndex = this.#channels.findIndex(ch => ch.id === channel.id);
            if (channelIndex !== -1) {
              this.#channels[channelIndex] = channel;
              this.#channelMap.set(channel.id, channel);
              hdUpgrades++;
              this.#logger.info(`🔄 Canal actualizado a HD: ${channel.name} (${existingChannel.quality.value} → ${channel.quality.value})`);
            }
          } else {
            m3uDuplicates++;
          }
        }
      });
      
      this.#logger.info(
        `📊 Deduplicación completada: ${allCsvChannels.length} CSV (preservados) + ${m3uAdded} M3U (validados) = ${this.#channels.length} canales finales (${m3uDuplicates} duplicados omitidos, ${hdUpgrades} actualizados a HD)`
      );
      
      this.#lastLoadTime = new Date();
      this.#isInitialized = true;
      this.#logger.info(`🎯 Repositorio híbrido inicializado: ${this.#channels.length} canales válidos y únicos`);
      
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
      
      // Cargar todos los canales M3U para procesamiento
      const allM3uChannels = [];
      for (let i = 0; i < this.#m3uRepositories.length; i++) {
        const m3uRepo = this.#m3uRepositories[i];
        try {
          await m3uRepo.refreshFromRemote();
          const m3uChannels = await m3uRepo.getAllChannelsUnfiltered();
          allM3uChannels.push(...m3uChannels);
          this.#logger.debug(`Refresco M3U ${i + 1}: ${m3uChannels.length} canales cargados`);
        } catch (error) {
          this.#logger.error(`Error refrescando fuente M3U ${i + 1}:`, error);
        }
      }
      
      // Aplicar conversión HTTPS→HTTP durante refresco ANTES de deduplicación
      let processedM3uChannels = allM3uChannels;
      
      if (this.#httpsToHttpService.isEnabled() && allM3uChannels.length > 0) {
        this.#logger.info(`🔄 Conversión HTTPS→HTTP durante refresco: ${allM3uChannels.length} canales M3U`);
        
        try {
          const conversionResult = await this.#httpsToHttpService.processChannels(allM3uChannels, {
            concurrency: this.#config.validation?.maxValidationConcurrency || 10,
            showProgress: false, // Menos verbose durante refresco
            onlyWorkingHttp: true
          });
          
          processedM3uChannels = conversionResult.processed;
          
          this.#logger.info(
            `✅ Conversión refresco completada: ${conversionResult.stats.total} procesados, ${conversionResult.stats.httpWorking} (${(conversionResult.stats.httpWorking/conversionResult.stats.total*100).toFixed(1)}%) funcionales`
          );
          
        } catch (error) {
          this.#logger.error('Error durante conversión HTTPS→HTTP en refresco:', error);
          processedM3uChannels = allM3uChannels;
        }
      }
      
      // Validación temprana M3U durante refresco (CSV preservado)
      let validatedM3uChannels = processedM3uChannels;
      
      if (this.#streamValidationService.isEnabled()) {
        this.#logger.info(`🔍 Validación temprana durante refresco: ${processedM3uChannels.length} canales M3U (CSV exento)`);
        
        const validationResult = await this.#streamValidationService.validateChannelsBatch(
          processedM3uChannels,
          {
            concurrency: this.#config.validation?.earlyValidationConcurrency || 15,
            showProgress: false // Menos verbose durante refresco
          }
        );
        
        const validM3uChannels = validationResult.validated
          .filter(result => result.isValid)
          .map(result => result.channel);
        
        const invalidM3uChannels = validationResult.validated
          .filter(result => !result.isValid)
          .map(result => result.channel);
        
        this.#logger.info(
          `✅ Refresco M3U validado: ${validM3uChannels.length} válidos, ${invalidM3uChannels.length} inválidos`
        );
        this.#logger.info(
          `📋 Canales CSV preservados durante refresco: ${csvChannels.length}`
        );
        
        validatedM3uChannels = validM3uChannels;
        
        // Actualizar solo canales M3U desactivados
        // Limpiar solo los IDs de M3U, preservar cualquier estado de CSV
        const csvChannelIds = new Set(csvChannels.map(ch => ch.id));
        const currentDeactivated = Array.from(this.#deactivatedChannels)
          .filter(id => csvChannelIds.has(id)); // Preservar estados CSV
        
        this.#deactivatedChannels.clear();
        currentDeactivated.forEach(id => this.#deactivatedChannels.add(id));
        
        invalidM3uChannels.forEach(channel => {
          this.#deactivatedChannels.add(channel.id);
        });
      }
      
      // Deduplicación inteligente con prioridad CSV absoluta
      this.#channels = [];
      this.#channelMap.clear();
      
      // Agregar TODOS los canales CSV primero (prioridad absoluta)
      csvChannels.forEach(channel => {
        this.#channels.push(channel);
        this.#channelMap.set(channel.id, channel);
      });
      
      // Agregar M3U validados con priorización HD
      let totalM3uAdded = 0;
      let totalM3uDuplicates = 0;
      let totalHdUpgrades = 0;
      
      validatedM3uChannels.forEach(channel => {
        if (!this.#channelMap.has(channel.id)) {
          this.#channels.push(channel);
          this.#channelMap.set(channel.id, channel);
          totalM3uAdded++;
        } else {
          // Canal duplicado, verificar si el M3U es HD y el CSV no
          const existingChannel = this.#channelMap.get(channel.id);
          if (this.#shouldReplaceWithHDChannel(existingChannel, channel)) {
            // Reemplazar canal existente con versión HD
            const channelIndex = this.#channels.findIndex(ch => ch.id === channel.id);
            if (channelIndex !== -1) {
              this.#channels[channelIndex] = channel;
              this.#channelMap.set(channel.id, channel);
              totalHdUpgrades++;
              this.#logger.info(`🔄 Canal actualizado a HD durante refresco: ${channel.name} (${existingChannel.quality.value} → ${channel.quality.value})`);
            }
          } else {
            totalM3uDuplicates++;
          }
        }
      });
      
      if (this.#m3uRepositories.length > 0) {
        this.#logger.info(`📊 Refresco completado: ${csvChannels.length} CSV + ${totalM3uAdded} M3U = ${this.#channels.length} canales (${totalM3uDuplicates} duplicados omitidos, ${totalHdUpgrades} actualizados a HD)`);
      }
      
      this.#lastLoadTime = new Date();
      this.#logger.info(`Refresco completado: ${this.#channels.length} canales totales`);
      
    } catch (error) {
      this.#logger.error('Error refrescando fuentes:', error);
      throw new RepositoryError(`Error refrescando repositorio híbrido: ${error.message}`, error);
    }
  }

  /**
   * Determina si un canal duplicado debe ser reemplazado por una versión HD
   * @private
   * @param {Channel} existingChannel - Canal existente
   * @param {Channel} newChannel - Canal candidato a reemplazo
   * @returns {boolean}
   */
  #shouldReplaceWithHDChannel(existingChannel, newChannel) {
    // Solo permitir reemplazo si la deduplicación inteligente está habilitada
    if (!this.#config.validation?.enableIntelligentDeduplication) {
      return false;
    }
    
    // No reemplazar canales CSV (tienen prioridad absoluta)
    const csvChannelIds = new Set();
    if (this.#csvRepository) {
      // Verificar si el canal existente es de CSV
      // Los canales CSV se cargan primero, por lo que si existe, probablemente sea CSV
      // Para mayor precisión, podríamos agregar metadata de fuente al canal
    }
    
    // Verificar si el nuevo canal es HD y el existente no
    const newIsHD = newChannel.isHighDefinition();
    const existingIsHD = existingChannel.isHighDefinition();
    
    // Solo reemplazar si:
    // 1. El nuevo canal es HD
    // 2. El canal existente NO es HD
    // 3. Ambos canales tienen el mismo nombre (verificación adicional)
    if (newIsHD && !existingIsHD && 
        newChannel.name.toLowerCase().trim() === existingChannel.name.toLowerCase().trim()) {
      return true;
    }
    
    // Si ambos son HD o ambos no son HD, mantener el existente (prioridad CSV)
    return false;
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
        // Separar canales CSV de canales M3U para preservar CSV
        const csvChannelIds = new Set((await this.#csvRepository.getAllChannelsUnfiltered()).map(ch => ch.id));
        const csvChannels = activeChannels.filter(ch => csvChannelIds.has(ch.id));
        const m3uChannels = activeChannels.filter(ch => !csvChannelIds.has(ch.id));
        
        this.#logger.info(`🔄 Procesando ${m3uChannels.length} canales M3U (${csvChannels.length} canales CSV preservados)`);
        
        // Procesar solo canales M3U con validación HTTP
        const conversionResult = await this.#httpsToHttpService.processChannels(m3uChannels, {
          concurrency: this.#config.validation?.maxValidationConcurrency || 10,
          showProgress: true,
          onlyWorkingHttp: true
        });
        
        // Log estadísticas de conversión
        this.#logger.info(`Conversión HTTPS a HTTP completada: ${conversionResult.stats.total} canales M3U procesados, ${conversionResult.stats.converted} convertidos, ${conversionResult.stats.httpWorking} validados`);
        
        if (conversionResult.stats.failed > 0) {
          this.#logger.warn(`${conversionResult.stats.failed} canales M3U fallaron en la conversión/validación`);
        }
        
        // Combinar canales CSV preservados + canales M3U validados
        activeChannels = [...csvChannels, ...conversionResult.processed];
        this.#logger.info(`📋 Resultado final: ${csvChannels.length} canales CSV preservados + ${conversionResult.processed.length} canales M3U validados = ${activeChannels.length} canales totales`);
        
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