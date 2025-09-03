/**
 * Addon principal TV IPTV para Stremio
 * Implementa una arquitectura limpia con separación de responsabilidades
 */

import pkg from 'stremio-addon-sdk';
const { addonBuilder, serveHTTP } = pkg;

// Configuración e infraestructura
import { TVAddonConfig } from './infrastructure/config/TVAddonConfig.js';
// Removed unused import M3UParserService
import { StreamHealthService } from './infrastructure/services/StreamHealthService.js';
import { SecurityMiddleware } from './infrastructure/middleware/SecurityMiddleware.js';
import { ErrorHandler } from './infrastructure/error/ErrorHandler.js';
import { EnhancedLoggerFactory } from './infrastructure/services/EnhancedLoggerService.js';

// Capa de aplicación
import { StreamHandler } from './application/handlers/StreamHandler.js';
import { ChannelRepositoryFactory } from './infrastructure/factories/ChannelRepositoryFactory.js';
import { InvalidChannelManagementService } from './application/services/InvalidChannelManagementService.js';

/**
 * Clase principal del addon TV IPTV para Stremio
 * Implementa el patrón Singleton y maneja el ciclo de vida completo del addon
 */
class TVIPTVAddon {

  #config;
  #logger;
  #channelRepository;
  #channelService;
  #healthService;
  #invalidChannelService;
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


  async initialize() {
    if (this.#isInitialized) {
      this.#logger.warn('Addon ya inicializado');
      return;
    }

    try {
      this.#logger.info('Configuración cargada:', this.#config.toJSON());

      await this.#initializeChannelRepository();
      await this.#initializeServices();
      this.#createAddonBuilder();
      this.#configureHandlers();
      if (this.#config.validation.validateStreamsOnStartup) {
        await this.#validateStreamsOnStartup();
      }

      this.#isInitialized = true;
      this.#logger.info('Addon inicializado correctamente');

    } catch (error) {
      this.#logger.error('Error inicializando addon:', error); // ERROR: Fallo en inicialización
      throw error;
    }
  }


  async start() {
    if (!this.#isInitialized) {
      await this.initialize();
    }

    const addonInterface = this.#addonBuilder.getInterface();
    const { server } = this.#config;

    this.#logger.info(`Iniciando servidor en puerto ${server.port}...`);

    const serverOptions = this.#securityMiddleware.configureServerOptions();
    serveHTTP(addonInterface, serverOptions);

    this.#logger.info(`✅ Addon iniciado en: ${this.#config.getBaseUrl()}`);
    this.#logger.info(`📺 Manifest: ${this.#config.getBaseUrl()}/manifest.json`);
    this.#logger.info(`🔗 Instalar addon: ${this.#config.getBaseUrl()}/manifest.json`);
    

    this.#scheduleMaintenanceTasks();
  }


  #createLogger() {
    const { logging } = this.#config;
    
    // Crear logger mejorado con información de archivo fuente y línea
    return EnhancedLoggerFactory.createCompatibleLogger({
      logLevel: logging.logLevel,
      enableRequestLogging: logging.enableRequestLogging,
      enablePerformanceMetrics: logging.enablePerformanceMetrics,
      logFilePath: logging.logFilePath
    });
  }


  async #initializeChannelRepository() {
    this.#logger.info(`Inicializando repositorio a través de Factory...`);
    this.#channelRepository = await ChannelRepositoryFactory.createRepository(this.#config, this.#logger);
  }


  async #initializeServices() {
    this.#logger.info('Inicializando servicios de aplicación...');

    // Usar directamente el repositorio como servicio de canales
    this.#channelService = this.#channelRepository;

    this.#healthService = new StreamHealthService(this.#config, this.#logger);
    this.#invalidChannelService = new InvalidChannelManagementService(
      this.#channelRepository,
      this.#config,
      this.#logger
    );

    this.#logger.info('Servicios de aplicación inicializados');
  }


  #createAddonBuilder() {
    this.#logger.info('Creando builder del addon...');

    const manifest = this.#config.generateManifest();
    this.#logger.debug('Manifest generado:', manifest);

    this.#addonBuilder = new addonBuilder(manifest);
    
    this.#logger.info(`Addon builder creado: ${manifest.name} v${manifest.version}`);
  }

  #configureHandlers() {
    this.#logger.info('Configurando handlers...');

    this.#addonBuilder.defineCatalogHandler(
      this.#errorHandler.wrapAddonHandler(
        this.#handleCatalogRequest.bind(this),
        'catalog'
      )
    );

    this.#addonBuilder.defineMetaHandler(
      this.#errorHandler.wrapAddonHandler(
        this.#handleMetaRequest.bind(this),
        'meta'
      )
    );

    const streamHandler = new StreamHandler(
      this.#channelService,
      this.#config,
      this.#logger
    );
    
    this.#addonBuilder.defineStreamHandler(streamHandler.createAddonHandler());

    this.#logger.info('Handlers configurados correctamente');
  }


  async #handleCatalogRequest(args) {
    const { type, id, extra = {} } = args;


    if (type !== 'tv') {
      return { metas: [] };
    }

    let channels = [];

    if (extra.search) {
      channels = await this.#channelService.searchChannels(extra.search);
    }

    else if (extra.genre) {
      channels = await this.#channelService.getChannelsByGenre(extra.genre);
    }

    else if (extra.country) {
      channels = await this.#channelService.getChannelsByCountry(extra.country);
    }

    else {
      const skip = parseInt(extra.skip) || 0;
      const limit = 20;
      channels = await this.#channelService.getChannelsPaginated(skip, limit);
    }

    channels = channels.filter(channel => channel.type === type);

    const metas = channels.map(channel => channel.toMetaPreview());

    return {
      metas,
      cacheMaxAge: this.#config.cache.catalogCacheMaxAge,
      staleRevalidate: this.#config.cache.catalogCacheMaxAge * 2,
      staleError: this.#config.cache.catalogCacheMaxAge * 4
    };
  }

  async #handleMetaRequest(args) {
    const { type, id } = args;

    if (type !== 'tv') {
      return { meta: null };
    }

    const channel = await this.#channelService.getChannelById(id);
    
    if (!channel) {
      return { meta: null };
    }

    return {
      meta: channel.toMetaDetail(),
      cacheMaxAge: this.#config.cache.metaCacheMaxAge,
      staleRevalidate: this.#config.cache.metaCacheMaxAge * 2,
      staleError: this.#config.cache.metaCacheMaxAge * 4
    };
  }

  async #validateStreamsOnStartup() {
    const startTime = Date.now();
    try {
      const channels = await this.#channelRepository.getAllChannels();
      
      if (!channels?.length) {
        this.#logger.warn('No se encontraron canales para validar');
        return;
      }
      
      const results = await this.#healthService.checkChannels(channels);
      const ok = results.filter(r => r.ok).length;
      const fail = results.filter(r => !r.ok).length;
      const total = results.length;
      const successRate = total > 0 ? ((ok / total) * 100).toFixed(1) : '0.0';
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      this.#logger.info(`Validación completada: ${ok}/${total} OK (${successRate}%) en ${duration}s`);
      
    } catch (error) {
      this.#logger.error('Error validando streams:', error);
    }
  }

  #scheduleMaintenanceTasks() {
    const { dataSources, validation } = this.#config;

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

    // Validación periódica automática removida por solicitud del usuario
    // La validación manual sigue disponible a través de validateStreamsOnStartup
  }


}


/**
 * Función principal de inicialización del addon
 * Maneja la creación e inicio del addon con manejo robusto de errores
 */
async function main() {
  try {
    const addon = new TVIPTVAddon();
    await addon.start();
  } catch (error) {
    console.error('❌ Error fatal al iniciar el addon:', error.message || error);
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Ejecutar si es módulo principal o directamente importado
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.js')) {
  main();
}

// Exports principales
export { TVIPTVAddon };
export default main;