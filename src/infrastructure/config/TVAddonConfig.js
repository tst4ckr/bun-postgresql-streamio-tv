/**
 * @fileoverview TVAddonConfig - Configuración centralizada del addon
 * Implementa configuración dinámica sin hardcoding
 */

import { config } from 'dotenv';
import { Channel } from '../../domain/entities/Channel.js';

// Cargar variables de entorno
config({ path: 'config.env' });

/**
 * Configuración centralizada del addon de TV IPTV
 * Todos los valores son configurables via variables de entorno
 */
export class TVAddonConfig {
  static #instance = null;

  /**
   * @private
   */
  #config;

  /**
   * Constructor privado para implementar Singleton
   * @private
   */
  constructor() {
    this.#config = this.#loadConfiguration();
    this.#validateConfiguration();
    Object.freeze(this.#config);
  }

  /**
   * Obtiene la instancia única de configuración
   * @static
   * @returns {TVAddonConfig}
   */
  static getInstance() {
    if (!TVAddonConfig.#instance) {
      TVAddonConfig.#instance = new TVAddonConfig();
    }
    return TVAddonConfig.#instance;
  }

  /**
   * Carga la configuración desde variables de entorno
   * @private
   * @returns {Object}
   */
  #loadConfiguration() {
    return {
      // Configuración del servidor
      server: {
        port: parseInt(process.env.PORT) || 7000,
        host: process.env.HOST || '0.0.0.0',
        nodeEnv: process.env.NODE_ENV || 'development',
        enableCors: process.env.ENABLE_CORS === 'true',
        corsOrigin: process.env.CORS_ORIGIN || '*',
        enableHelmet: process.env.ENABLE_HELMET !== 'false',
        rateLimitRequestsPerMinute: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE) || 100
      },

      // Configuración del addon
      addon: {
        id: process.env.ADDON_ID || 'org.stremio.tv-iptv-addon',
        name: process.env.ADDON_NAME || 'TV IPTV Addon',
        description: process.env.ADDON_DESCRIPTION || 'Canales de TV en vivo desde fuentes IPTV (M3U/RTMP)',
        version: process.env.ADDON_VERSION || '1.0.0',
        contactEmail: process.env.CONTACT_EMAIL || null,
        enableUserConfig: process.env.ENABLE_USER_CONFIG === 'true',
        enableDeepLinks: process.env.ENABLE_DEEP_LINKS !== 'false'
      },

      // Configuración de fuentes de datos
      dataSources: {
        channelsSource: process.env.CHANNELS_SOURCE || 'csv',
        channelsFile: process.env.CHANNELS_FILE || 'data/channels.csv',
        m3uUrl: process.env.M3U_URL || null,
        backupM3uUrl: process.env.BACKUP_M3U_URL || null,
        enableAutoUpdate: process.env.ENABLE_AUTO_UPDATE === 'true',
        updateIntervalHours: parseInt(process.env.UPDATE_INTERVAL_HOURS) || 4
      },

      // Configuración de TV en vivo
      streaming: {
        defaultQuality: process.env.DEFAULT_QUALITY || 'HD',
        enableAdultChannels: process.env.ENABLE_ADULT_CHANNELS === 'true',
        cacheChannelsHours: parseInt(process.env.CACHE_CHANNELS_HOURS) || 6,
        streamTimeoutSeconds: parseInt(process.env.STREAM_TIMEOUT_SECONDS) || 30,
        maxConcurrentStreams: parseInt(process.env.MAX_CONCURRENT_STREAMS) || 100
      },

      // Configuración de assets
      assets: {
        logoCdnUrl: process.env.LOGO_CDN_URL || 'https://cdn.example.com/logos/',
        fallbackLogo: process.env.FALLBACK_LOGO || 'https://example.com/default-tv-logo.png',
        logoCacheHours: parseInt(process.env.LOGO_CACHE_HOURS) || 24,
        autoFetchLogos: process.env.AUTO_FETCH_LOGOS === 'true'
      },

      // Configuración de filtros
      filters: {
        allowedCountries: this.#parseCountryList(process.env.ALLOWED_COUNTRIES),
        blockedCountries: this.#parseCountryList(process.env.BLOCKED_COUNTRIES),
        defaultLanguage: process.env.DEFAULT_LANGUAGE || 'es',
        supportedLanguages: this.#parseLanguageList(process.env.SUPPORTED_LANGUAGES)
      },

      // Configuración de cache
      cache: {
        streamCacheMaxAge: parseInt(process.env.STREAM_CACHE_MAX_AGE) || 300,
        streamStaleRevalidate: parseInt(process.env.STREAM_STALE_REVALIDATE) || 600,
        streamStaleError: parseInt(process.env.STREAM_STALE_ERROR) || 1800,
        catalogCacheMaxAge: parseInt(process.env.CATALOG_CACHE_MAX_AGE) || 3600,
        metaCacheMaxAge: parseInt(process.env.META_CACHE_MAX_AGE) || 1800
      },

      // Configuración de validación
      validation: {
        validateStreamsOnStartup: process.env.VALIDATE_STREAMS_ON_STARTUP === 'true',
        validateStreamsIntervalHours: parseInt(process.env.VALIDATE_STREAMS_INTERVAL_HOURS) || 6,
        removeInvalidStreams: process.env.REMOVE_INVALID_STREAMS === 'true',
        streamValidationTimeout: parseInt(process.env.STREAM_VALIDATION_TIMEOUT) || 10
      },

      // Configuración de logs
      logging: {
        logLevel: process.env.LOG_LEVEL || 'info',
        enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING === 'true',
        enablePerformanceMetrics: process.env.ENABLE_PERFORMANCE_METRICS === 'true',
        logFilePath: process.env.LOG_FILE_PATH || 'logs/addon.log'
      },

      // Configuración avanzada
      advanced: {
        enableFailover: process.env.ENABLE_FAILOVER === 'true',
        maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3,
        retryDelayMs: parseInt(process.env.RETRY_DELAY_MS) || 1000
      }
    };
  }

  /**
   * Parsea lista de países desde variable de entorno
   * @private
   * @param {string} countryList 
   * @returns {string[]}
   */
  #parseCountryList(countryList) {
    if (!countryList) return [];
    return countryList.split(',').map(c => c.trim().toUpperCase()).filter(c => c.length > 0);
  }

  /**
   * Parsea lista de idiomas desde variable de entorno
   * @private
   * @param {string} languageList 
   * @returns {string[]}
   */
  #parseLanguageList(languageList) {
    if (!languageList) return ['es', 'en'];
    return languageList.split(',').map(l => l.trim().toLowerCase()).filter(l => l.length > 0);
  }

  /**
   * Valida la configuración cargada
   * @private
   * @throws {Error}
   */
  #validateConfiguration() {
    const { server, addon, dataSources } = this.#config;

    // Validar configuración del servidor
    if (server.port < 1 || server.port > 65535) {
      throw new Error('Puerto del servidor debe estar entre 1 y 65535');
    }

    // Validar configuración del addon
    if (!addon.id || !addon.name) {
      throw new Error('ID y nombre del addon son requeridos');
    }

    // Validar ID del addon
    if (!this.#isValidAddonId(addon.id)) {
      throw new Error('ID del addon debe seguir el formato: org.domain.addon-name');
    }

    // Validar fuente de datos
    const validSources = ['csv', 'm3u', 'remote_m3u', 'hybrid'];
    if (!validSources.includes(dataSources.channelsSource)) {
      throw new Error(`Fuente de canales inválida. Valores válidos: ${validSources.join(', ')}`);
    }

    // Validar URLs si son necesarias
    if (dataSources.channelsSource.includes('m3u') && !dataSources.m3uUrl) {
      throw new Error('URL de M3U es requerida para fuentes remotas');
    }
  }

  /**
   * Valida formato del ID del addon
   * @private
   * @param {string} id 
   * @returns {boolean}
   */
  #isValidAddonId(id) {
    const addonIdPattern = /^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$/;
    return addonIdPattern.test(id);
  }

  // Getters para acceso a configuración

  get server() { return { ...this.#config.server }; }
  get addon() { return { ...this.#config.addon }; }
  get dataSources() { return { ...this.#config.dataSources }; }
  get streaming() { return { ...this.#config.streaming }; }
  get assets() { return { ...this.#config.assets }; }
  get filters() { return { ...this.#config.filters }; }
  get cache() { return { ...this.#config.cache }; }
  get validation() { return { ...this.#config.validation }; }
  get logging() { return { ...this.#config.logging }; }
  get advanced() { return { ...this.#config.advanced }; }

  /**
   * Obtiene toda la configuración
   * @returns {Object}
   */
  getAll() {
    return JSON.parse(JSON.stringify(this.#config));
  }

  /**
   * Genera el manifest de Stremio optimizado para TV
   * @returns {Object}
   */
  generateManifest() {
    const { addon, streaming } = this.#config;

    return {
      id: addon.id,
      version: addon.version,
      name: addon.name,
      description: addon.description,
      
      // CRÍTICO: Usar solo tipos 'tv' y 'channel' para máxima compatibilidad
      types: ['tv', 'channel'],
      
      // Recursos esenciales para TV en vivo
      resources: ['catalog', 'meta', 'stream'],
      
      // Catálogos optimizados para TV
      catalogs: this.#generateTVCatalogs(),
      
      // Prefijos de ID específicos para canales de TV
      idPrefixes: ['tv_', 'ch_'],
      
      // Hints de comportamiento optimizados para streaming en vivo
      behaviorHints: {
        adult: false, // Mantener simple y seguro
        p2p: false,
        configurable: false, // Deshabilitado para estabilidad
        configurationRequired: false
      },
      
      // Información de contacto opcional
      contactEmail: addon.contactEmail || undefined
    };
  }

  /**
   * Genera catálogos optimizados para TV
   * @private
   * @returns {Array}
   */
  #generateTVCatalogs() {
    return [
      // Catálogo principal de canales TV
      {
        type: 'tv',
        id: 'tv_channels',
        name: 'Canales de TV',
        extra: [
          {
            name: 'genre',
            isRequired: false,
            options: ['News', 'Sports', 'Entertainment', 'Music', 'Movies', 'Kids', 'Documentary']
          },
          {
            name: 'country',
            isRequired: false,
            options: ['ES', 'MX', 'AR', 'CO', 'US', 'FR', 'DE', 'IT']
          },
          {
            name: 'search',
            isRequired: false
          },
          {
            name: 'skip',
            isRequired: false
          }
        ]
      },
      // Catálogo de canales por género
      {
        type: 'channel',
        id: 'channels_by_genre',
        name: 'Canales por Género',
        extra: [
          {
            name: 'genre',
            isRequired: true,
            options: ['News', 'Sports', 'Entertainment', 'Music', 'Movies', 'Kids', 'Documentary']
          },
          {
            name: 'skip',
            isRequired: false
          }
        ]
      }
    ];
  }

  /**
   * Genera la configuración de usuario
   * @private
   * @returns {Array}
   */
  #generateUserConfig() {
    return [
      {
        key: 'm3u_url',
        type: 'text',
        title: 'URL de lista M3U',
        required: false
      },
      {
        key: 'preferred_quality',
        type: 'select',
        title: 'Calidad preferida',
        options: ['HD', 'SD', 'Auto'],
        default: 'Auto'
      },
      {
        key: 'preferred_language',
        type: 'select',
        title: 'Idioma preferido',
        options: this.#config.filters.supportedLanguages.map(l => l.toUpperCase()),
        default: this.#config.filters.defaultLanguage.toUpperCase()
      }
    ];
  }

  /**
   * Verifica si está en modo desarrollo
   * @returns {boolean}
   */
  isDevelopment() {
    return this.#config.server.nodeEnv === 'development';
  }

  /**
   * Verifica si está en modo producción
   * @returns {boolean}
   */
  isProduction() {
    return this.#config.server.nodeEnv === 'production';
  }

  /**
   * Obtiene la URL base del addon
   * @returns {string}
   */
  getBaseUrl() {
    const { server } = this.#config;
    const protocol = server.nodeEnv === 'production' ? 'https' : 'http';
    const host = server.host === '0.0.0.0' ? 'localhost' : server.host;
    return `${protocol}://${host}:${server.port}`;
  }

  /**
   * Serializa la configuración para logs
   * @returns {Object}
   */
  toJSON() {
    const config = this.getAll();
    
    // Ocultar información sensible
    if (config.dataSources.m3uUrl) {
      config.dataSources.m3uUrl = '***HIDDEN***';
    }
    if (config.dataSources.backupM3uUrl) {
      config.dataSources.backupM3uUrl = '***HIDDEN***';
    }
    
    return config;
  }
}

export default TVAddonConfig;
