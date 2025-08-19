// Addon principal TV IPTV para Stremio

import pkg from 'stremio-addon-sdk';
const { addonBuilder, serveHTTP } = pkg;

import { TVAddonConfig } from './infrastructure/config/TVAddonConfig.js';
import { M3UParserService } from './infrastructure/parsers/M3UParserService.js';
import { StreamHealthService } from './infrastructure/services/StreamHealthService.js';
import { SecurityMiddleware } from './infrastructure/middleware/SecurityMiddleware.js';
import { ErrorHandler } from './infrastructure/error/ErrorHandler.js';
import { StreamHandler } from './application/handlers/StreamHandler.js';
import { ChannelRepositoryFactory } from './infrastructure/factories/ChannelRepositoryFactory.js';

// Clase principal del addon
class TVIPTVAddon {

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


  async #initializeChannelRepository() {
    this.#logger.info(`Inicializando repositorio a través de Factory...`);
    this.#channelRepository = await ChannelRepositoryFactory.createRepository(this.#config, this.#logger);
  }


  async #initializeServices() {
    this.#logger.info('Inicializando servicios de aplicación...');


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
        const parser = new M3UParserService(this.#config.filters);
        return [];
      }
    };

    this.#logger.info('Servicios de aplicación inicializados');


    this.#healthService = new StreamHealthService(this.#config, this.#logger);
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
      cacheMaxAge: this.#config.cache.catalogCacheMaxAge
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
      cacheMaxAge: this.#config.cache.metaCacheMaxAge
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
      
      const { ok, fail, total } = await this.#healthService.checkChannels(channels, 10, true);
      const successRate = total > 0 ? ((ok / total) * 100).toFixed(1) : '0.0';
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      this.#logger.info(`Validación completada: ${ok}/${total} OK (${successRate}%) en ${duration}s`);
      
    } catch (error) {
      console.log(`Error: ${error.message}`);
      this.#logger.error('Error validando streams:', error); // ERROR: Fallo en validación
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
          this.#logger.error('Error en auto-actualización:', error); // ERROR: Fallo auto-actualización
        }
      }, intervalMs);

      this.#logger.info(`Auto-actualización programada cada ${dataSources.updateIntervalHours} horas`);
    }

    if (validation.validateStreamsIntervalHours > 0) {
      const intervalMs = validation.validateStreamsIntervalHours * 60 * 60 * 1000;
      
      setInterval(async () => {
        this.#logger.info('Ejecutando validación periódica de streams...');
        
        try {
          const sample = await this.#channelRepository.getChannelsPaginated(0, 30);
          const report = await this.#healthService.checkChannels(sample, 10, false);
          this.#logger.info(`Validación periódica: OK ${report.ok}/${report.total}, Fails ${report.fail}`);
        } catch (error) {
          this.#logger.error('Error en validación periódica:', error); // ERROR: Fallo validación periódica
        }
      }, intervalMs);

      this.#logger.info(`Validación periódica programada cada ${validation.validateStreamsIntervalHours} horas`);
    }
  }
}


async function main() {
  try {
    console.log('📦 Creando instancia del addon...');
    const addon = new TVIPTVAddon();
    console.log('🔧 Iniciando addon...');
    await addon.start();
    console.log('✅ Addon iniciado exitosamente');
  } catch (error) {
    console.error('❌ Error fatal al iniciar el addon:', error); // ERROR: Fallo crítico
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

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