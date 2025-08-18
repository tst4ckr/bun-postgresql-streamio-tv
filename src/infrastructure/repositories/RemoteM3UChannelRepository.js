/**
 * @fileoverview RemoteM3UChannelRepository - Implementación para listas M3U remotas
 * Implementa ChannelRepository para fuentes de datos desde una URL M3U
 */

import axios from 'axios';
import { ChannelRepository, RepositoryError, ChannelNotFoundError } from '../../domain/repositories/ChannelRepository.js';
import { Channel } from '../../domain/entities/Channel.js';
import { M3UParserService } from '../parsers/M3UParserService.js';

/**
 * Repositorio de canales basado en una URL M3U remota
 * Responsabilidad: gestionar canales desde una fuente M3U remota, incluyendo cache
 */
export class RemoteM3UChannelRepository extends ChannelRepository {
  #m3uUrl;
  #parser;
  #config;
  #logger;
  #channels = [];
  #channelMap = new Map();
  #isInitialized = false;
  #lastLoadTime = null;

  constructor(m3uUrl, parser, config, logger = console) {
    super();
    if (!m3uUrl) {
      throw new Error('La URL del M3U es requerida para RemoteM3UChannelRepository');
    }
    this.#m3uUrl = m3uUrl;
    this.#parser = parser;
    this.#config = config;
    this.#logger = logger;
  }

  async initialize() {
    if (this.#isInitialized) {
      this.#logger.warn('Repositorio M3U Remoto ya inicializado');
      return;
    }
    try {
      this.#logger.info(`Cargando canales desde M3U remoto: ${this.#m3uUrl}`);
      await this.#fetchAndParseM3U();
      this.#isInitialized = true;
      this.#logger.info(`Repositorio M3U Remoto inicializado con ${this.#channels.length} canales`);
    } catch (error) {
      throw new RepositoryError(`Error inicializando repositorio M3U remoto: ${error.message}`, error);
    }
  }

  async #fetchAndParseM3U() {
    try {
      const response = await axios.get(this.#m3uUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'Stremio-TV-IPTV-Addon/1.0.0' }
      });
      
      if (response.status !== 200) {
        throw new Error(`Respuesta HTTP inesperada: ${response.status}`);
      }

      const m3uContent = response.data;
      const parsedChannels = await this.#parser.parseM3U(m3uContent);
      
      this.#channels = parsedChannels.filter(channel => this.#passesConfigFilters(channel));
      
      this.#channelMap.clear();
      this.#channels.forEach(channel => this.#channelMap.set(channel.id, channel));
      
      this.#lastLoadTime = new Date();
      this.#logger.info(`M3U remoto cargado: ${this.#channels.length} canales válidos`);

    } catch (error) {
      this.#logger.error(`Error al obtener o parsear M3U de ${this.#m3uUrl}`, error);
      // Failover: si falla, intentar con la URL de backup si existe
      if (this.#config.advanced.enableFailover && this.#config.dataSources.backupM3uUrl) {
        this.#logger.warn(`Intentando failover con URL de backup: ${this.#config.dataSources.backupM3uUrl}`);
        this.#m3uUrl = this.#config.dataSources.backupM3uUrl;
        await this.#fetchAndParseM3U(); // Intenta de nuevo con la URL de backup
      } else if (this.#channels.length === 0) {
        // Solo lanzar error si no hay canales cacheados
        throw new RepositoryError(`No se pudo cargar la lista M3U y no hay backup.`, error);
      } else {
        this.#logger.warn('No se pudo refrescar la lista M3U. Se usarán los datos cacheados.');
      }
    }
  }

  #passesConfigFilters(channel) {
    const { filters, streaming } = this.#config;

    // Países permitidos
    if (filters.allowedCountries.length > 0) {
      const channelCountry = (channel.country || '').toUpperCase();
      
      // Aceptar canales internacionales por defecto
      if (channelCountry === 'INTERNACIONAL' || channelCountry === 'INTERNATIONAL' || channelCountry === '') {
        console.log(`✅ Canal internacional aceptado por defecto: ${channel.name} (País: '${channelCountry}')`);
        // Continuar con otros filtros, no retornar aquí
      } else {
        // Aplicar filtro de países solo para canales con país específico
        const isAllowed = filters.allowedCountries.some(country => 
          channelCountry.includes(country) || country.includes(channelCountry)
        );
        if (!isAllowed) {
          console.log(`❌ Canal rechazado por país: ${channel.name} (País: '${channelCountry}')`);
          return false;
        }
      }
    }

    // Países bloqueados
    if (filters.blockedCountries.length > 0) {
      const channelCountry = (channel.country || '').toUpperCase();
      const isBlocked = filters.blockedCountries.some(country => 
        channelCountry.includes(country) || country.includes(channelCountry)
      );
      if (isBlocked) {
        console.log(`❌ Canal rechazado por país bloqueado: ${channel.name}`);
        return false;
      }
    }

    // Nota: no filtramos por supportedLanguages para permitir "Idioma: ninguno" en Stremio

    // Adultos
    if (!streaming.enableAdultChannels) {
      const adultGenres = ['adulto', 'adult', 'xxx', '+18'];
      if (adultGenres.some(g => channel.genre.toLowerCase().includes(g))) {
        console.log(`❌ Canal rechazado por contenido adulto: ${channel.name} (Género: '${channel.genre}')`);
        return false;
      }
    }

    console.log(`✅ Canal aceptado: ${channel.name}`);
    return true;
  }
  
  #needsRefresh() {
    if (!this.#lastLoadTime) return true;
    const { cacheChannelsHours } = this.#config.streaming;
    const cacheAgeMs = cacheChannelsHours * 60 * 60 * 1000;
    return (new Date() - this.#lastLoadTime) > cacheAgeMs;
  }

  async #refreshIfNeeded() {
    if (this.#needsRefresh()) {
      this.#logger.info('Refrescando canales desde M3U remoto...');
      await this.#fetchAndParseM3U();
    }
  }

  // Implementación de métodos del contrato ChannelRepository
  async getAllChannels() {
    await this.#refreshIfNeeded();
    return [...this.#channels];
  }

  async getChannelById(id) {
    await this.#refreshIfNeeded();
    const channel = this.#channelMap.get(id);
    if (!channel) throw new ChannelNotFoundError(id);
    return channel;
  }

  async getChannelsByGenre(genre) {
    await this.#refreshIfNeeded();
    return this.#channels.filter(ch => ch.genre.toLowerCase() === genre.toLowerCase());
  }
  
  async getChannelsByCountry(country) {
    await this.#refreshIfNeeded();
    return this.#channels.filter(ch => ch.country.toLowerCase().includes(country.toLowerCase()));
  }

  async getChannelsByLanguage(language) {
    await this.#refreshIfNeeded();
    return this.#channels.filter(ch => ch.language.toLowerCase() === language.toLowerCase());
  }

  async searchChannels(searchTerm) {
    await this.#refreshIfNeeded();
    const term = searchTerm.toLowerCase();
    return this.#channels.filter(ch => ch.name.toLowerCase().includes(term) || ch.genre.toLowerCase().includes(term));
  }
  
  async getChannelsPaginated(skip = 0, limit = 20) {
    await this.#refreshIfNeeded();
    const startIndex = Math.max(0, skip);
    const boundedLimit = Math.max(1, Math.min(200, limit));
    return this.#channels.slice(startIndex, startIndex + boundedLimit);
  }

  async getAvailableGenres() {
    await this.#refreshIfNeeded();
    const genres = new Set(this.#channels.map(ch => ch.genre));
    return Array.from(genres).sort();
  }
  
  async getChannelsCount() {
    await this.#refreshIfNeeded();
    return this.#channels.length;
  }

  async refreshFromRemote() {
    this.#logger.info('Forzando refresco desde M3U remoto...');
    await this.#fetchAndParseM3U();
  }

  // Métodos no aplicables para un repo remoto de solo lectura
  async updateChannel(channel) {
    throw new RepositoryError('El repositorio M3U remoto es de solo lectura.');
  }
}

export default RemoteM3UChannelRepository;
