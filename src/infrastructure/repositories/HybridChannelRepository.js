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
import { ChannelDeduplicationService, DeduplicationConfig } from '../../domain/services/ChannelDeduplicationService.js';
import { filterAllowedChannels } from '../../config/allowed-channels.js';
import { filterBannedChannels } from '../../config/banned-channels.js';
import fetch from 'node-fetch';
import { URL } from 'url';

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
  #isInitializing = false;
  #lastLoadTime = null;
  #deactivatedChannels = new Set();
  #validatedChannels = new Map(); // channelId -> timestamp
  #contentFilter; // Servicio de filtrado de contenido
  #httpsToHttpService; // Servicio de conversión HTTPS a HTTP
  #streamValidationService; // Servicio de validación temprana de streams
  #deduplicationService; // Servicio de deduplicación de canales
  #m3uParser; // Parser para modo automático

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
    
    // Inicializar servicio de deduplicación
    this.#deduplicationService = new ChannelDeduplicationService(DeduplicationConfig.fromEnvironment());
    
    // Inicializar parser para modo automático
    this.#m3uParser = new M3UParserService(config.filters);
    
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
   * Procesa la URL de AUTO_M3U_URL en modo automático
   * Reutiliza la lógica del modo automatic dentro del hybrid
   * @private
   * @returns {Promise<Array<Channel>>} Canales procesados desde AUTO_M3U_URL
   */
  async #processAutomaticSource() {
    const { autoM3uUrl } = this.#config.dataSources;
    
    if (!autoM3uUrl) {
      return [];
    }

    this.#logger.info(`🤖 Procesando fuente automática desde: ${autoM3uUrl}`);
    
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

      return allChannels;
      
    } catch (error) {
      this.#logger.error(`Error procesando fuente automática: ${error.message}`);
      return [];
    }
  }

  /**
   * Filtra canales que tengan URLs con /play/ y sean IPs públicas
   * @private
   * @param {Array<Channel>} channels - Canales a filtrar
   * @returns {Array<Channel>} Canales filtrados
   */
  #filterChannelsByPlayAndPublicIP(channels) {
    return channels.filter(channel => {
      if (!channel.url) return false;
      
      // Verificar si contiene /play/
      const hasPlayPath = channel.url.includes('/play/');
      
      // Verificar si es IP pública
      const isPublicIP = this.#isPublicIPUrl(channel.url);
      
      return hasPlayPath && isPublicIP;
    });
  }

  /**
   * Verifica si una URL contiene una IP pública
   * @private
   * @param {string} url - URL a verificar
   * @returns {boolean} true si es IP pública
   */
  #isPublicIPUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // Verificar si es una IP numérica (no dominio)
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(hostname)) return false;
      
      // Verificar que no sea IP privada
      const octets = hostname.split('.').map(Number);
      if (octets.length !== 4) return false;
      
      const [a, b] = octets;
      
      // IPs privadas
      if (a === 10) return false; // 10.x.x.x
      if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.x.x - 172.31.x.x
      if (a === 192 && b === 168) return false; // 192.168.x.x
      if (a === 127) return false; // 127.x.x.x (loopback)
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Genera URLs de playlist a partir de canales filtrados
   * @private
   * @param {Array<Channel>} channels - Canales con URLs válidas
   * @returns {Array<string>} URLs de playlist únicas
   */
  #generatePlaylistUrls(channels) {
    const playlistUrls = new Set();
    
    channels.forEach(channel => {
      if (channel.url) {
        // Generar URL base de playlist
        const baseUrl = channel.url.replace(/\/[^\/]*$/, '/playlist.m3u8');
        playlistUrls.add(baseUrl);
      }
    });
    
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
    const maxConcurrent = 5; // Limitar concurrencia
    
    this.#logger.info(`🔄 Procesando ${playlistUrls.length} playlists con máximo ${maxConcurrent} concurrentes...`);
    
    // Procesar en lotes
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
            throw new Error('Contenido vacío');
          }
          
          // Parsear playlist M3U
          const channels = await this.#m3uParser.parseM3U(m3uContent);
          
          // Agregar metadata sobre la fuente
          channels.forEach(channel => {
            channel.source = 'automatic';
            channel.sourceUrl = playlistUrl;
          });
          
          return channels;
          
        } catch (error) {
          this.#logger.warn(`⚠️ Error procesando playlist ${globalIndex}/${playlistUrls.length}: ${error.message}`);
          return [];
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Agregar canales válidos
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          allChannels.push(...result.value);
        }
      });
    }
    
    return allChannels;
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

    if (this.#isInitializing) {
      this.#logger.info('Inicialización en progreso, esperando...');
      // Esperar hasta que termine la inicialización
      while (this.#isInitializing && !this.#isInitialized) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    try {
      this.#isInitializing = true;
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
      
      // 5. Procesar AUTO_M3U_URL en modo automático si está configurado
      const { autoM3uUrl } = this.#config.dataSources;
      let automaticChannels = [];
      if (autoM3uUrl) {
        this.#logger.info('🤖 Procesando fuente automática (AUTO_M3U_URL)...');
        try {
          automaticChannels = await this.#processAutomaticSource();
          this.#logger.info(`📺 Canales procesados desde fuente automática: ${automaticChannels.length}`);
        } catch (error) {
          this.#logger.error(`Error procesando fuente automática: ${error.message}`);
        }
      }

      // 6. Cargar canales de URLs M3U remotas tradicionales (sin deduplicación aún)
      const allM3uChannels = [...automaticChannels];
      for (let i = 0; i < this.#m3uRepositories.length; i++) {
        const m3uRepo = this.#m3uRepositories[i];
        const m3uUrl = m3uRepo.url;
        
        // Saltar si es la misma URL que AUTO_M3U_URL ya procesada
        if (autoM3uUrl && m3uUrl === autoM3uUrl) {
          this.#logger.debug(`M3U ${i + 1}: Saltando URL duplicada con AUTO_M3U_URL`);
          continue;
        }
        
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
        const validM3uChannels = validationResult.validChannels;
        const invalidM3uChannels = validationResult.invalidChannels;
        
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
      
      // Combinar todos los canales para deduplicación centralizada
      const allChannels = [...allCsvChannels, ...validatedM3uChannels];
      
      // Aplicar deduplicación centralizada
      const deduplicationResult = await this.#deduplicationService.deduplicateChannels(allChannels);
      
      // Aplicar filtro inteligente de canales permitidos
      const beforeAllowedCount = deduplicationResult.channels.length;
      const allowedFilteredChannels = filterAllowedChannels(deduplicationResult.channels);
      const afterAllowedCount = allowedFilteredChannels.length;
      const allowedRemovedCount = beforeAllowedCount - afterAllowedCount;
      
      // Aplicar filtro de canales prohibidos
      const beforeBannedCount = allowedFilteredChannels.length;
      const finalFilteredChannels = filterBannedChannels(allowedFilteredChannels);
      const afterBannedCount = finalFilteredChannels.length;
      const bannedRemovedCount = beforeBannedCount - afterBannedCount;
      
      // Actualizar canales y mapa con resultados filtrados
      this.#channels = finalFilteredChannels;
      this.#channelMap.clear();
      this.#channels.forEach(channel => {
        this.#channelMap.set(channel.id, channel);
      });
      
      // Extraer métricas para logging
      const metrics = deduplicationResult.metrics;
      const m3uAdded = this.#channels.length - allCsvChannels.length;
      const m3uDuplicates = metrics.duplicatesRemoved;
      const hdUpgrades = metrics.hdUpgrades;
      
      this.#logger.info(
        `📊 Deduplicación completada: ${allCsvChannels.length} CSV (preservados) + ${m3uAdded} M3U (validados) = ${this.#channels.length} canales finales (${m3uDuplicates} duplicados omitidos, ${hdUpgrades} actualizados a HD${allowedRemovedCount > 0 ? `, ${allowedRemovedCount} canales no permitidos removidos` : ''}${bannedRemovedCount > 0 ? `, ${bannedRemovedCount} canales prohibidos removidos` : ''})`
      );
      
      this.#lastLoadTime = new Date();
      this.#isInitialized = true;
      this.#logger.info(`🎯 Repositorio híbrido inicializado: ${this.#channels.length} canales válidos y únicos`);
      
    } catch (error) {
      throw new RepositoryError(`Error inicializando repositorio híbrido: ${error.message}`, error);
    } finally {
      this.#isInitializing = false;
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
      
      // Procesar AUTO_M3U_URL en modo automático si está configurado
      const { autoM3uUrl } = this.#config.dataSources;
      let automaticChannels = [];
      if (autoM3uUrl) {
        this.#logger.info('🤖 Refrescando fuente automática (AUTO_M3U_URL)...');
        try {
          automaticChannels = await this.#processAutomaticSource();
          this.#logger.info(`📺 Canales refrescados desde fuente automática: ${automaticChannels.length}`);
        } catch (error) {
          this.#logger.error(`Error refrescando fuente automática: ${error.message}`);
        }
      }

      // Cargar todos los canales M3U para procesamiento
      const allM3uChannels = [...automaticChannels];
      for (let i = 0; i < this.#m3uRepositories.length; i++) {
        const m3uRepo = this.#m3uRepositories[i];
        const m3uUrl = m3uRepo.url;
        
        // Saltar si es la misma URL que AUTO_M3U_URL ya procesada
        if (autoM3uUrl && m3uUrl === autoM3uUrl) {
          this.#logger.debug(`Refresco M3U ${i + 1}: Saltando URL duplicada con AUTO_M3U_URL`);
          continue;
        }
        
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
        
        const validM3uChannels = validationResult.validChannels;
        const invalidM3uChannels = validationResult.invalidChannels;
        
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
      
      // Combinar todos los canales para deduplicación centralizada
      const allChannels = [...csvChannels, ...validatedM3uChannels];
      
      // Aplicar deduplicación centralizada
      const deduplicationResult = await this.#deduplicationService.deduplicateChannels(allChannels);
      
      // Actualizar canales y mapa con resultados deduplicados
      this.#channels = deduplicationResult.channels;
      this.#channelMap.clear();
      this.#channels.forEach(channel => {
        this.#channelMap.set(channel.id, channel);
      });
      
      // Extraer métricas para logging
      const metrics = deduplicationResult.metrics;
      const totalM3uAdded = this.#channels.length - csvChannels.length;
      const totalM3uDuplicates = metrics.duplicatesRemoved;
      const totalHdUpgrades = metrics.hdUpgrades;
      
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
    // No refrescar si está inicializando
    if (this.#isInitializing) {
      return;
    }
    
    if (!this.#isInitialized) {
      if (this.#isInitializing) {
        // Si está inicializando, esperar a que termine
        while (this.#isInitializing && !this.#isInitialized) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } else {
        await this.initialize();
      }
      return;
    }
    
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
      
      activeChannels = filteredChannels;
    }
    
    // Aplicar filtrado de canales prohibidos (BANNED_CHANNELS)
    const beforeBannedCount = activeChannels.length;
    const finalChannels = filterBannedChannels(activeChannels);
    const afterBannedCount = finalChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de canales prohibidos aplicados: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return finalChannels;
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
    let activeChannels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      activeChannels = this.#contentFilter.filterChannels(activeChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = activeChannels.length;
    activeChannels = filterBannedChannels(activeChannels);
    const afterBannedCount = activeChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de canales prohibidos aplicados: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return activeChannels;
  }

  async getChannelsByCountry(country) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.country.toLowerCase().includes(country.toLowerCase()));
    let activeChannels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      activeChannels = this.#contentFilter.filterChannels(activeChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = activeChannels.length;
    activeChannels = filterBannedChannels(activeChannels);
    const afterBannedCount = activeChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de canales prohibidos aplicados: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return activeChannels;
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
    let activeChannels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      activeChannels = this.#contentFilter.filterChannels(activeChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = activeChannels.length;
    activeChannels = filterBannedChannels(activeChannels);
    const afterBannedCount = activeChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de canales prohibidos aplicados: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return activeChannels;
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
    let activeChannels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      activeChannels = this.#contentFilter.filterChannels(activeChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = activeChannels.length;
    activeChannels = filterBannedChannels(activeChannels);
    const afterBannedCount = activeChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de canales prohibidos aplicados: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return activeChannels.slice(skip, skip + limit);
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