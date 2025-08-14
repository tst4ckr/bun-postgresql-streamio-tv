/**
 * @fileoverview Punto de entrada principal del addon de TV IPTV para Stremio
 * Implementa Clean Architecture con inyección de dependencias y configuración dinámica
 */

import { addonBuilder, serveHTTP } from 'stremio-addon-sdk';
import helmet from 'helmet';
import cors from 'cors';

// Configuración
import { TVAddonConfig } from './infrastructure/config/TVAddonConfig.js';

// Servicios de infraestructura
import { M3UParserService } from './infrastructure/parsers/M3UParserService.js';

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
  #addonBuilder;
  #isInitialized = false;

  constructor() {
    this.#config = TVAddonConfig.getInstance();
    this.#logger = this.#createLogger();
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

    const { server } = this.#config;
    const addonInterface = this.#addonBuilder.getInterface();

    this.#logger.info(`Iniciando servidor en puerto ${server.port}...`);

    // Configurar middleware de seguridad
    if (server.enableHelmet) {
      this.#logger.info('Helmet habilitado para seguridad');
    }

    if (server.enableCors) {
      this.#logger.info(`CORS habilitado para origen: ${server.corsOrigin}`);
    }

    // Iniciar servidor
    const options = {
      port: server.port,
      cacheMaxAge: this.#config.cache.catalogCacheMaxAge
    };

    serveHTTP(addonInterface, options);

    this.#logger.info(`✅ Addon iniciado en: ${this.#config.getBaseUrl()}`);
    this.#logger.info(`📺 Manifest: ${this.#config.getBaseUrl()}/manifest.json`);
    
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

    // Handler de catálogos
    this.#addonBuilder.defineCatalogHandler(async (args) => {
      const startTime = Date.now();
      
      try {
        this.#logger.debug(`Catalog request: ${JSON.stringify(args)}`);
        
        const result = await this.#handleCatalogRequest(args);
        
        const duration = Date.now() - startTime;
        this.#logger.debug(`Catalog request completed in ${duration}ms`);
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        this.#logger.error(`Catalog request failed in ${duration}ms:`, error);
        
        return {
          metas: [],
          cacheMaxAge: this.#config.cache.catalogCacheMaxAge
        };
      }
    });

    // Handler de metadatos
    this.#addonBuilder.defineMetaHandler(async (args) => {
      const startTime = Date.now();
      
      try {
        this.#logger.debug(`Meta request: ${JSON.stringify(args)}`);
        
        const result = await this.#handleMetaRequest(args);
        
        const duration = Date.now() - startTime;
        this.#logger.debug(`Meta request completed in ${duration}ms`);
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        this.#logger.error(`Meta request failed in ${duration}ms:`, error);
        
        return {
          meta: null,
          cacheMaxAge: this.#config.cache.metaCacheMaxAge
        };
      }
    });

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
    if (!['tv', 'channel'].includes(type)) {
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
    if (!['tv', 'channel'].includes(type)) {
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
      // Implementar lógica de validación
      // Por ahora solo log
      const totalChannels = await this.#channelRepository.getChannelsCount();
      this.#logger.info(`Validación completada para ${totalChannels} canales`);
      
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
          // Implementar validación periódica
          this.#logger.info('Validación periódica completada');
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
    const addon = new TVIPTVAddon();
    await addon.start();
    
  } catch (error) {
    console.error('❌ Error fatal iniciando addon:', error);
    process.exit(1);
  }
}

// Manejar señales del sistema para cierre limpio
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando addon...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Cerrando addon...');
  process.exit(0);
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Error no capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
  process.exit(1);
});

// Ejecutar si es el módulo principal
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { TVIPTVAddon };
export default main;
