/**
 * Script para generar un archivo CSV con canales HD únicos
 * Aplica deduplicación específica para canales que contienen 'HD' en el nombre
 * y genera un archivo CSV con los resultados
 */

import { CSVChannelRepository } from '../src/infrastructure/repositories/CSVChannelRepository.js';
import { ChannelDeduplicationService, DeduplicationConfig } from '../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { writeFileSync } from 'fs';
import path from 'path';

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
};

class HDChannelProcessor {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Filtra canales que contengan 'HD' o 'hd' en el nombre
   * Detecta patrones como: _hd, hd, 4hd, uhd, fhd, etc.
   * @param {Array} channels - Lista de canales
   * @returns {Array} Canales que contienen HD en el nombre
   */
  #filterHDChannels(channels) {
    const hdChannels = channels.filter(channel => {
      const name = (channel.name || '').toLowerCase();
      // Patrones HD más específicos
      const hdPatterns = [
        /_hd\b/,           // _hd al final o seguido de espacio/carácter
        /\bhd\b/,          // hd como palabra completa
        /\d+hd\b/,         // números seguidos de hd (4hd, 6hd, etc.)
        /\buhd\b/,         // ultra hd
        /\bfhd\b/,         // full hd
        /\b4k\b/           // 4k también se considera HD
      ];
      
      return hdPatterns.some(pattern => pattern.test(name));
    });

    this.logger.info(`Canales HD encontrados: ${hdChannels.length} de ${channels.length} totales`);
    return hdChannels;
  }

  /**
   * Normaliza el nombre del canal removiendo indicadores HD para comparación
   * Maneja patrones específicos como _hd, números+hd, etc.
   * @param {string} name - Nombre del canal
   * @returns {string} Nombre normalizado
   */
  #normalizeChannelName(name) {
    if (!name || typeof name !== 'string') return '';
    
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
      .replace(/\s+/g, ' ')        // Normalizar espacios
      // Remover patrones HD específicos
      .replace(/_hd\b/g, '')       // _hd al final
      .replace(/\bhd\b/g, '')      // hd como palabra completa
      .replace(/\d+hd\b/g, '')     // números seguidos de hd (4hd, 6hd, etc.)
      .replace(/\buhd\b/g, '')     // ultra hd
      .replace(/\bfhd\b/g, '')     // full hd
      .replace(/\b4k\b/g, '')      // 4k
      .replace(/\bsd\b/g, '')      // standard definition
      .trim();
  }

  /**
   * Detecta duplicados entre canales HD basándose en nombres normalizados
   * @param {Array} hdChannels - Lista de canales HD
   * @returns {Map} Mapa de grupos de duplicados
   */
  #detectDuplicates(hdChannels) {
    const groups = new Map();

    for (const channel of hdChannels) {
      const normalizedName = this.#normalizeChannelName(channel.name);
      
      if (!normalizedName) continue;

      if (!groups.has(normalizedName)) {
        groups.set(normalizedName, []);
      }
      
      groups.get(normalizedName).push(channel);
    }

    return groups;
  }

  /**
   * Resuelve conflictos entre canales duplicados
   * Prioriza por: 1) Mejor calidad (4K > UHD > FHD > HD numerado > HD), 2) Especificidad
   * @param {Array} duplicateChannels - Lista de canales duplicados
   * @returns {Object} Canal seleccionado
   */
  #resolveConflict(duplicateChannels) {
    if (duplicateChannels.length === 1) {
      return duplicateChannels[0];
    }

    let bestChannel = duplicateChannels[0];
    let bestScore = 0;

    for (const channel of duplicateChannels) {
      let score = 0;
      const name = (channel.name || '').toLowerCase();
      
      // Puntuación por calidad (orden de prioridad)
      if (name.includes('4k')) {
        score += 100;
      } else if (name.includes('uhd')) {
        score += 90;
      } else if (name.includes('fhd')) {
        score += 80;
      } else if (/\d+hd\b/.test(name)) {
        // HD con números específicos (4hd, 6hd, 7hd) tienen alta prioridad
        score += 70;
        // Bonus por número específico (canales numerados suelen ser más específicos)
        const hdMatch = name.match(/(\d+)hd\b/);
        if (hdMatch) {
          score += parseInt(hdMatch[1]); // Añadir el número como bonus
        }
      } else if (name.includes('_hd') || /\bhd\b/.test(name)) {
        score += 60;
      } else if (name.includes('sd')) {
        score += 10;
      }

      // Puntuación por especificidad del nombre
      score += Math.min(name.length / 5, 15);

      // Puntuación por información adicional específica
      if (name.includes('premium') || name.includes('plus')) score += 8;
      if (name.includes('latino') || name.includes('latam')) score += 6;
      if (name.includes('este') || name.includes('oeste')) score += 4;
      if (name.includes('norte') || name.includes('sur')) score += 4;
      if (name.includes('deportes') || name.includes('sports')) score += 3;
      
      // Penalización por nombres genéricos
      if (name.includes('test') || name.includes('backup')) score -= 20;

      if (score > bestScore) {
        bestScore = score;
        bestChannel = channel;
      }
    }

    return bestChannel;
  }

  /**
   * Procesa la deduplicación de canales HD
   * @param {Array} channels - Lista completa de canales
   * @returns {Object} Resultado de la deduplicación
   */
  processHDDeduplication(channels) {
    const startTime = Date.now();
    
    this.logger.info('=== INICIANDO PROCESAMIENTO DE CANALES HD ===');
    
    // Paso 1: Filtrar canales HD
    const hdChannels = this.#filterHDChannels(channels);
    
    if (hdChannels.length === 0) {
      this.logger.warn('No se encontraron canales HD para procesar');
      return {
        originalCount: channels.length,
        hdChannelsFound: 0,
        duplicatesFound: 0,
        duplicatesRemoved: 0,
        uniqueHDChannels: [],
        processingTimeMs: Date.now() - startTime
      };
    }

    // Paso 2: Detectar duplicados
    const duplicateGroups = this.#detectDuplicates(hdChannels);
    
    this.logger.info(`Grupos de canales encontrados: ${duplicateGroups.size}`);
    
    // Paso 3: Resolver conflictos y crear lista final
    const uniqueHDChannels = [];
    let duplicatesRemoved = 0;

    for (const [normalizedName, channelGroup] of duplicateGroups) {
      const selectedChannel = this.#resolveConflict(channelGroup);
      uniqueHDChannels.push(selectedChannel);
      
      const removedCount = channelGroup.length - 1;
      duplicatesRemoved += removedCount;
      
      if (channelGroup.length > 1) {
        this.logger.debug(`Grupo "${normalizedName}": ${channelGroup.length} canales -> 1 seleccionado (${selectedChannel.name})`);
      }
    }

    const processingTime = Date.now() - startTime;
    
    // Estadísticas finales
    const stats = {
      originalCount: channels.length,
      hdChannelsFound: hdChannels.length,
      duplicateGroupsFound: duplicateGroups.size,
      duplicatesRemoved: duplicatesRemoved,
      uniqueHDChannels: uniqueHDChannels,
      finalHDCount: uniqueHDChannels.length,
      deduplicationRate: hdChannels.length > 0 ? ((duplicatesRemoved / hdChannels.length) * 100).toFixed(2) : 0,
      processingTimeMs: processingTime
    };

    this.logger.info('=== RESULTADOS PROCESAMIENTO HD ===');
    this.logger.info(`Canales HD originales: ${stats.hdChannelsFound}`);
    this.logger.info(`Grupos procesados: ${stats.duplicateGroupsFound}`);
    this.logger.info(`Duplicados removidos: ${stats.duplicatesRemoved}`);
    this.logger.info(`Canales HD únicos finales: ${stats.finalHDCount}`);
    this.logger.info(`Tasa de deduplicación: ${stats.deduplicationRate}%`);
    this.logger.info(`Tiempo de procesamiento: ${stats.processingTimeMs}ms`);

    return stats;
  }

  /**
   * Genera archivo CSV con canales HD únicos
   * @param {Array} uniqueHDChannels - Lista de canales HD únicos
   * @param {string} outputPath - Ruta del archivo de salida
   */
  generateCSV(uniqueHDChannels, outputPath) {
    this.logger.info(`Generando archivo CSV: ${outputPath}`);
    
    // Encabezados CSV
    const headers = [
      'id',
      'name', 
      'stream_url',
      'logo_url',
      'genre',
      'country',
      'language',
      'is_active',
      'type',
      'source'
    ];
    
    // Convertir canales a filas CSV
    const rows = uniqueHDChannels.map(channel => {
      return [
        channel.id || '',
        `"${(channel.name || '').replace(/"/g, '""')}"`, // Escapar comillas
        channel.streamUrl || '',
        channel.logoUrl || '',
        channel.genre || '',
        channel.country || '',
        channel.language || '',
        channel.isActive ? 'true' : 'false',
        channel.type || '',
        channel.source || 'csv'
      ].join(',');
    });
    
    // Crear contenido CSV
    const csvContent = [headers.join(','), ...rows].join('\n');
    
    // Escribir archivo
    writeFileSync(outputPath, csvContent, 'utf8');
    
    this.logger.info(`Archivo CSV generado exitosamente: ${uniqueHDChannels.length} canales HD únicos`);
  }
}

// Función principal
async function main() {
  try {
    logger.info('Iniciando generación de canales HD únicos...');
    
    // Configurar objeto config con la estructura esperada
    const config = {
      filters: {
        filterReligiousContent: false,
        filterAdultContent: false,
        filterPoliticalContent: false,
        religiousKeywords: [],
        adultKeywords: [],
        politicalKeywords: [],
        allowedCountries: [],
        blockedCountries: []
      },
      streaming: {
        enableAdultChannels: true,
        cacheChannelsHours: 24
      },
      validation: {
        removeInvalidStreams: false
      }
    };
    
    // Cargar canales desde CSV
    const csvRepository = new CSVChannelRepository(
      './data/channels.csv',
      config,
      logger
    );
    
    const allChannels = await csvRepository.getAllChannels();
    logger.info(`Canales cargados: ${allChannels.length}`);
    
    // Crear procesador de canales HD
    const hdProcessor = new HDChannelProcessor(logger);
    
    // Procesar deduplicación HD
    const result = hdProcessor.processHDDeduplication(allChannels);
    
    // Generar archivo CSV con canales HD únicos
    const outputPath = path.join('./data', 'hd-channels-unique.csv');
    hdProcessor.generateCSV(result.uniqueHDChannels, outputPath);
    
    // Mostrar resumen final
    console.log('\n=== RESUMEN FINAL ===');
    console.log(`📊 Total de canales procesados: ${result.originalCount}`);
    console.log(`🔍 Canales HD encontrados: ${result.hdChannelsFound}`);
    console.log(`🗂️ Grupos de duplicados: ${result.duplicateGroupsFound}`);
    console.log(`🗑️ Duplicados removidos: ${result.duplicatesRemoved}`);
    console.log(`✅ Canales HD únicos finales: ${result.finalHDCount}`);
    console.log(`📈 Tasa de deduplicación: ${result.deduplicationRate}%`);
    console.log(`📁 Archivo generado: ${outputPath}`);
    console.log(`⏱️ Tiempo de procesamiento: ${result.processingTimeMs}ms`);
    
    logger.info('Generación de canales HD únicos completada exitosamente');
    
  } catch (error) {
    logger.error('Error durante la generación de canales HD únicos:', error);
    process.exit(1);
  }
}

// Ejecutar función principal
main().catch(console.error);

export { HDChannelProcessor };