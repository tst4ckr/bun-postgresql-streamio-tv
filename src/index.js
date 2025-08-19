/**
 * @fileoverview Punto de entrada principal del addon de TV IPTV para Stremio
 * Implementa Clean Architecture con inyección de dependencias y configuración dinámica
 */

import pkg from 'stremio-addon-sdk';
const { addonBuilder, serveHTTP } = pkg;

// Configuración
import { TVAddonConfig } from './infrastructure/config/TVAddonConfig.js';

// Servicios de infraestructura
import { M3UParserService } from './infrastructure/parsers/M3UParserService.js';
import { StreamHealthService } from './infrastructure/services/StreamHealthService.js';

// Middleware y manejo de errores
import { SecurityMiddleware } from './infrastructure/middleware/SecurityMiddleware.js';
import { ErrorHandler } from './infrastructure/error/ErrorHandler.js';

// Handlers de aplicación
import { StreamHandler } from './application/handlers/StreamHandler.js';

// Repositorios (implementaciones concretas se crearán dinámicamente)
import { ChannelRepositoryFactory } from './infrastructure/factories/ChannelRepositoryFactory.js';

/**
 * Clase principal del addon
 * Orquesta la inicialización y configuración de todos los componentes
 */
class TVIPTVAddon {
  /**
   * @private
   */
  #config;
  #logger;
  #channelRepository;
  #channelService;
  #healthService;
  #addonBuilder;
  #securityMiddleware;
  #errorHandler;
  #isInitialized = false;

  constructor() {
    this.#config = TVAddonConfig.getInstance();
    this.#logger = this.#createLogger();
    this.#errorHandler = new ErrorHandler(this.#logger, this.#config);
    this.#securityMiddleware = new SecurityMiddleware(this.#config, this.#logger);
    this.#logger.info('Inicializando TV IPTV Addon...');
  }

  /**
   * Inicializa el addon
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.#isInitialized) {
      this.#logger.warn('Addon ya inicializado');
      return;
    }

    try {
      this.#logger.info('Configuración cargada:', this.#config.toJSON());

      // 1. Inicializar repositorio de canales
      await this.#initializeChannelRepository();

      // 2. Inicializar servicios de aplicación
      await this.#initializeServices();

      // 3. Crear builder del addon
      this.#createAddonBuilder();

      // 4. Configurar handlers
      this.#configureHandlers();

      // 5. Validar streams si está configurado
      if (this.#config.validation.validateStreamsOnStartup) {
        await this.#validateStreamsOnStartup();
      }

      this.#isInitialized = true;
      this.#logger.info('Addon inicializado correctamente');

    } catch (error) {
      this.#logger.error('Error inicializando addon:', error);
      throw error;
    }
  }

  /**
   * Inicia el servidor del addon
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.#isInitialized) {
      await this.initialize();
    }

    const addonInterface = this.#addonBuilder.getInterface();
    const { server } = this.#config;

    this.#logger.info(`Iniciando servidor en puerto ${server.port}...`);

    // Configurar opciones del servidor usando SecurityMiddleware
    const serverOptions = this.#securityMiddleware.configureServerOptions();

    // Iniciar servidor usando la interfaz del addon
    serveHTTP(addonInterface, serverOptions);

    this.#logger.info(`✅ Addon iniciado en: ${this.#config.getBaseUrl()}`);
    this.#logger.info(`📺 Manifest: ${this.#config.getBaseUrl()}/manifest.json`);
    this.#logger.info(`🔗 Instalar addon: ${this.#config.getBaseUrl()}/manifest.json`);
    
    // Programar tareas de mantenimiento
    this.#scheduleMaintenanceTasks();
  }

  /**
   * Crea el logger configurado
   * @private
   * @returns {Object}
   */
  #createLogger() {
    const { logging } = this.#config;
    
    // Logger básico - en producción se podría usar winston o similar
    return {
      info: (message, ...args) => {
        if (['info', 'debug'].includes(logging.logLevel)) {
          console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
        }
      },
      warn: (message, ...args) => {
        if (['info', 'warn', 'debug'].includes(logging.logLevel)) {
          console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
        }
      },
      error: (message, ...args) => {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
      },
      debug: (message, ...args) => {
        if (logging.logLevel === 'debug') {
          console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
        }
      }
    };
  }

  /**
   * Inicializa el repositorio de canales según la configuración
   * @private
   * @returns {Promise<void>}
   */
  async #initializeChannelRepository() {
    this.#logger.info(`Inicializando repositorio a través de Factory...`);
    this.#channelRepository = await ChannelRepositoryFactory.createRepository(this.#config, this.#logger);
  }

  /**
   * Inicializa los servicios de aplicación
   * @private
   * @returns {Promise<void>}
   */
  async #initializeServices() {
    this.#logger.info('Inicializando servicios de aplicación...');

    // Crear servicio de canales (se implementaría en application/services/)
    this.#channelService = {
      getChannelById: async (id) => {
        return await this.#channelRepository.getChannelById(id);
      },

      getAllChannels: async () => {
        return await this.#channelRepository.getAllChannels();
      },

      getChannelsByGenre: async (genre) => {
        return await this.#channelRepository.getChannelsByGenre(genre);
      },

      getChannelsByCountry: async (country) => {
        return await this.#channelRepository.getChannelsByCountry(country);
      },

      searchChannels: async (searchTerm) => {
        return await this.#channelRepository.searchChannels(searchTerm);
      },

      getChannelsPaginated: async (skip, limit) => {
        return await this.#channelRepository.getChannelsPaginated(skip, limit);
      },

      getChannelsFromCustomM3U: async (m3uUrl) => {
        // Implementar lógica para parsear M3U personalizado del usuario
        const parser = new M3UParserService(this.#config.filters);
        // Aquí se haría fetch del M3U y se parsearía
        return [];
      }
    };

    this.#logger.info('Servicios de aplicación inicializados');

    // Servicio de salud de streams
    this.#healthService = new StreamHealthService(this.#config, this.#logger);
  }

  /**
   * Crea el builder del addon de Stremio
   * @private
   */
  #createAddonBuilder() {
    this.#logger.info('Creando builder del addon...');

    const manifest = this.#config.generateManifest();
    this.#logger.debug('Manifest generado:', manifest);

    this.#addonBuilder = new addonBuilder(manifest);
    
    this.#logger.info(`Addon builder creado: ${manifest.name} v${manifest.version}`);
  }

  /**
   * Configura los handlers del addon
   * @private
   */
  #configureHandlers() {
    this.#logger.info('Configurando handlers...');

    // Handler de catálogos usando ErrorHandler
    this.#addonBuilder.defineCatalogHandler(
      this.#errorHandler.wrapAddonHandler(
        this.#handleCatalogRequest.bind(this),
        'catalog'
      )
    );

    // Handler de metadatos usando ErrorHandler
    this.#addonBuilder.defineMetaHandler(
      this.#errorHandler.wrapAddonHandler(
        this.#handleMetaRequest.bind(this),
        'meta'
      )
    );

    // Handler de streams
    const streamHandler = new StreamHandler(
      this.#channelService,
      this.#config,
      this.#logger
    );
    
    this.#addonBuilder.defineStreamHandler(streamHandler.createAddonHandler());

    this.#logger.info('Handlers configurados correctamente');
  }

  /**
   * Maneja peticiones de catálogo
   * @private
   * @param {Object} args 
   * @returns {Promise<Object>}
   */
  async #handleCatalogRequest(args) {
    const { type, id, extra = {} } = args;

    // Validar tipo soportado
    if (type !== 'tv') {
      return { metas: [] };
    }

    let channels = [];

    // Manejar búsqueda
    if (extra.search) {
      channels = await this.#channelService.searchChannels(extra.search);
    }
    // Manejar filtro por género
    else if (extra.genre) {
      channels = await this.#channelService.getChannelsByGenre(extra.genre);
    }
    // Manejar filtro por país
    else if (extra.country) {
      channels = await this.#channelService.getChannelsByCountry(extra.country);
    }
    // Catálogo general
    else {
      const skip = parseInt(extra.skip) || 0;
      const limit = 20;
      channels = await this.#channelService.getChannelsPaginated(skip, limit);
    }

    // Filtrar por tipo
    channels = channels.filter(channel => channel.type === type);

    // Convertir a meta previews
    const metas = channels.map(channel => channel.toMetaPreview());

    return {
      metas,
      cacheMaxAge: this.#config.cache.catalogCacheMaxAge
    };
  }

  /**
   * Maneja peticiones de metadatos
   * @private
   * @param {Object} args 
   * @returns {Promise<Object>}
   */
  async #handleMetaRequest(args) {
    const { type, id } = args;

    // Validar tipo soportado
    if (type !== 'tv') {
      return { meta: null };
    }

    const channel = await this.#channelService.getChannelById(id);
    
    if (!channel) {
      return { meta: null };
    }

    return {
      meta: channel.toMetaDetail(),
      cacheMaxAge: this.#config.cache.metaCacheMaxAge
    };
  }

  /**
   * Valida streams al inicio si está configurado
   * @private
   * @returns {Promise<void>}
   */
  async #validateStreamsOnStartup() {
    this.#logger.info('Validando streams al inicio...');
    
    try {
      const channels = await this.#channelRepository.getChannelsPaginated(0, 50);
      const report = await this.#healthService.checkChannels(channels, 10);
      this.#logger.info(`Streams OK: ${report.ok}/${report.total}, Fails: ${report.fail}`);
      
    } catch (error) {
      this.#logger.error('Error validando streams:', error);
    }
  }

  /**
   * Programa tareas de mantenimiento
   * @private
   */
  #scheduleMaintenanceTasks() {
    const { dataSources, validation } = this.#config;

    // Auto-actualización de datos
    if (dataSources.enableAutoUpdate && dataSources.updateIntervalHours > 0) {
      const intervalMs = dataSources.updateIntervalHours * 60 * 60 * 1000;
      
      setInterval(async () => {
        this.#logger.info('Ejecutando auto-actualización de canales...');
        
        try {
          await this.#channelRepository.refreshFromRemote?.();
          this.#logger.info('Auto-actualización completada');
        } catch (error) {
          this.#logger.error('Error en auto-actualización:', error);
        }
      }, intervalMs);

      this.#logger.info(`Auto-actualización programada cada ${dataSources.updateIntervalHours} horas`);
    }

    // Validación periódica de streams
    if (validation.validateStreamsIntervalHours > 0) {
      const intervalMs = validation.validateStreamsIntervalHours * 60 * 60 * 1000;
      
      setInterval(async () => {
        this.#logger.info('Ejecutando validación periódica de streams...');
        
        try {
          const sample = await this.#channelRepository.getChannelsPaginated(0, 30);
          const report = await this.#healthService.checkChannels(sample, 10);
          this.#logger.info(`Validación periódica: OK ${report.ok}/${report.total}, Fails ${report.fail}`);
        } catch (error) {
          this.#logger.error('Error en validación periódica:', error);
        }
      }, intervalMs);

      this.#logger.info(`Validación periódica programada cada ${validation.validateStreamsIntervalHours} horas`);
    }
  }
}

/**
 * Punto de entrada principal
 */
async function main() {
  try {
    console.log('📦 Creando instancia del addon...');
    const addon = new TVIPTVAddon();
    console.log('🔧 Iniciando addon...');
    await addon.start();
    console.log('✅ Addon iniciado exitosamente');
  } catch (error) {
    console.error('❌ Error fatal al iniciar el addon:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Los manejadores globales de errores están centralizados en ErrorHandler

// Ejecutar si es el módulo principal
console.log('🔍 Verificando si es módulo principal...');
console.log('import.meta.url:', import.meta.url);
console.log('process.argv[1]:', process.argv[1]);
console.log('file://' + process.argv[1] + ':', `file://${process.argv[1]}`);

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('✅ Es módulo principal, ejecutando main...');
  main();
} else {
  console.log('⚠️ No es módulo principal, ejecutando main de todas formas...');
  main();
}

export { TVIPTVAddon };
export default main;
