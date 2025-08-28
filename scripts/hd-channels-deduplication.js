/**
 * Script para deduplicación específica de canales HD
 * Filtra canales que contengan 'HD' o 'hd' en el nombre y elimina duplicados
 * manteniendo solo uno de cada canal único
 */

import { CSVChannelRepository } from '../src/infrastructure/repositories/CSVChannelRepository.js';
import { ChannelDeduplicationService, DeduplicationConfig } from '../src/domain/services/ChannelDeduplicationService.js';
import ContentFilterService from '../src/domain/services/ContentFilterService.js';
import { Channel } from '../src/domain/entities/Channel.js';

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
};

class HDChannelDeduplicationService {
  constructor(logger) {
    this.logger = logger;
    this.deduplicationService = null;
  }

  /**
   * Filtra canales que contengan 'HD' o 'hd' en el nombre
   * @param {Array} channels - Lista de canales
   * @returns {Array} Canales que contienen HD en el nombre
   */
  #filterHDChannels(channels) {
    const hdChannels = channels.filter(channel => {
      const name = channel.name || '';
      return name.toLowerCase().includes('hd');
    });

    this.logger.info(`Canales HD encontrados: ${hdChannels.length} de ${channels.length} totales`);
    return hdChannels;
  }

  /**
   * Normaliza el nombre del canal removiendo indicadores HD para comparación
   * @param {string} name - Nombre del canal
   * @returns {string} Nombre normalizado
   */
  #normalizeHDChannelName(name) {
    if (!name || typeof name !== 'string') return '';
    
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
      .replace(/\s+/g, ' ')        // Normalizar espacios
      .replace(/\b(hd|sd|4k|uhd)\b/g, '') // Remover indicadores de calidad
      .trim();
  }

  /**
   * Detecta duplicados entre canales HD basándose en nombres normalizados
   * @param {Array} hdChannels - Lista de canales HD
   * @returns {Map} Mapa de grupos de duplicados
   */
  #detectHDDuplicates(hdChannels) {
    const duplicateGroups = new Map();
    const processedNames = new Set();

    for (const channel of hdChannels) {
      const normalizedName = this.#normalizeHDChannelName(channel.name);
      
      if (!normalizedName) continue;

      if (!duplicateGroups.has(normalizedName)) {
        duplicateGroups.set(normalizedName, []);
      }
      
      duplicateGroups.get(normalizedName).push(channel);
    }

    // Filtrar solo grupos con más de un canal (duplicados)
    const actualDuplicates = new Map();
    for (const [normalizedName, channels] of duplicateGroups) {
      if (channels.length > 1) {
        actualDuplicates.set(normalizedName, channels);
      }
    }

    return actualDuplicates;
  }

  /**
   * Resuelve conflictos entre canales HD duplicados
   * Prioriza por: 1) Mejor calidad (4K > UHD > HD), 2) Fuente, 3) Primer encontrado
   * @param {Array} duplicateChannels - Lista de canales duplicados
   * @returns {Object} Canal seleccionado
   */
  #resolveHDConflict(duplicateChannels) {
    if (duplicateChannels.length === 1) {
      return duplicateChannels[0];
    }

    // Prioridad por calidad
    const qualityPriority = {
      '4k': 4,
      'uhd': 3,
      'hd': 2,
      'sd': 1
    };

    // Prioridad por fuente
    const sourcePriority = {
      'csv': 2,
      'm3u': 1
    };

    let bestChannel = duplicateChannels[0];
    let bestScore = 0;

    for (const channel of duplicateChannels) {
      let score = 0;
      const name = (channel.name || '').toLowerCase();
      
      // Puntuación por calidad
      for (const [quality, points] of Object.entries(qualityPriority)) {
        if (name.includes(quality)) {
          score += points * 10; // Multiplicar por 10 para dar más peso a la calidad
          break;
        }
      }

      // Puntuación por fuente
      const source = channel.source || 'unknown';
      score += sourcePriority[source] || 0;

      // Puntuación por longitud de nombre (nombres más específicos)
      score += Math.min(name.length / 10, 5);

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
  async processHDDeduplication(channels) {
    const startTime = Date.now();
    
    this.logger.info('=== INICIANDO DEDUPLICACIÓN DE CANALES HD ===');
    
    // Paso 1: Filtrar canales HD
    const hdChannels = this.#filterHDChannels(channels);
    
    if (hdChannels.length === 0) {
      this.logger.warn('No se encontraron canales HD para procesar');
      return {
        originalCount: channels.length,
        hdChannelsFound: 0,
        duplicatesFound: 0,
        duplicatesRemoved: 0,
        finalHDChannels: [],
        processingTimeMs: Date.now() - startTime
      };
    }

    // Paso 2: Detectar duplicados
    const duplicateGroups = this.#detectHDDuplicates(hdChannels);
    
    this.logger.info(`Grupos de duplicados HD encontrados: ${duplicateGroups.size}`);
    
    // Paso 3: Resolver conflictos y crear lista final
    const finalHDChannels = [];
    const removedChannels = [];
    let duplicatesRemoved = 0;

    // Agregar canales únicos (sin duplicados)
    const allNormalizedNames = new Set();
    for (const [normalizedName] of duplicateGroups) {
      allNormalizedNames.add(normalizedName);
    }

    for (const channel of hdChannels) {
      const normalizedName = this.#normalizeHDChannelName(channel.name);
      if (!allNormalizedNames.has(normalizedName)) {
        finalHDChannels.push(channel);
      }
    }

    // Resolver duplicados
    for (const [normalizedName, duplicateChannels] of duplicateGroups) {
      const selectedChannel = this.#resolveHDConflict(duplicateChannels);
      finalHDChannels.push(selectedChannel);
      
      // Contar canales removidos
      const removed = duplicateChannels.filter(ch => ch !== selectedChannel);
      removedChannels.push(...removed);
      duplicatesRemoved += removed.length;
      
      this.logger.debug(`Grupo "${normalizedName}": ${duplicateChannels.length} canales -> 1 seleccionado (${selectedChannel.name})`);
    }

    const processingTime = Date.now() - startTime;
    
    // Estadísticas finales
    const stats = {
      originalCount: channels.length,
      hdChannelsFound: hdChannels.length,
      duplicateGroupsFound: duplicateGroups.size,
      duplicatesRemoved: duplicatesRemoved,
      finalHDChannels: finalHDChannels,
      finalHDCount: finalHDChannels.length,
      deduplicationRate: hdChannels.length > 0 ? ((duplicatesRemoved / hdChannels.length) * 100).toFixed(2) : 0,
      processingTimeMs: processingTime
    };

    this.logger.info('=== RESULTADOS DEDUPLICACIÓN HD ===');
    this.logger.info(`Canales HD originales: ${stats.hdChannelsFound}`);
    this.logger.info(`Grupos de duplicados: ${stats.duplicateGroupsFound}`);
    this.logger.info(`Duplicados removidos: ${stats.duplicatesRemoved}`);
    this.logger.info(`Canales HD finales: ${stats.finalHDCount}`);
    this.logger.info(`Tasa de deduplicación: ${stats.deduplicationRate}%`);
    this.logger.info(`Tiempo de procesamiento: ${stats.processingTimeMs}ms`);

    return stats;
  }

  /**
   * Genera reporte detallado de canales HD duplicados
   * @param {Array} channels - Lista de canales
   * @returns {Object} Reporte detallado
   */
  async generateHDDuplicatesReport(channels) {
    const hdChannels = this.#filterHDChannels(channels);
    const duplicateGroups = this.#detectHDDuplicates(hdChannels);
    
    const report = {
      summary: {
        totalChannels: channels.length,
        hdChannels: hdChannels.length,
        duplicateGroups: duplicateGroups.size,
        totalDuplicates: 0
      },
      duplicateGroups: []
    };

    for (const [normalizedName, duplicateChannels] of duplicateGroups) {
      const selectedChannel = this.#resolveHDConflict(duplicateChannels);
      
      report.duplicateGroups.push({
        normalizedName,
        channelCount: duplicateChannels.length,
        selectedChannel: {
          name: selectedChannel.name,
          source: selectedChannel.source,
          streamUrl: selectedChannel.streamUrl
        },
        allChannels: duplicateChannels.map(ch => ({
          name: ch.name,
          source: ch.source,
          streamUrl: ch.streamUrl,
          selected: ch === selectedChannel
        }))
      });
      
      report.summary.totalDuplicates += duplicateChannels.length - 1;
    }

    return report;
  }
}

// Función principal
async function main() {
  
  try {
    logger.info('Iniciando análisis de deduplicación de canales HD...');
    
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
    
    // Crear servicio de deduplicación HD
    const hdDeduplicationService = new HDChannelDeduplicationService(logger);
    
    // Procesar deduplicación HD
    const result = await hdDeduplicationService.processHDDeduplication(allChannels);
    
    // Generar reporte detallado
    const report = await hdDeduplicationService.generateHDDuplicatesReport(allChannels);
    
    console.log('\n=== REPORTE DETALLADO DE DUPLICADOS HD ===');
    console.log(`Total de canales: ${report.summary.totalChannels}`);
    console.log(`Canales HD encontrados: ${report.summary.hdChannels}`);
    console.log(`Grupos de duplicados: ${report.summary.duplicateGroups}`);
    console.log(`Total de duplicados: ${report.summary.totalDuplicates}`);
    
    if (report.duplicateGroups.length > 0) {
      console.log('\n=== GRUPOS DE DUPLICADOS ===');
      report.duplicateGroups.forEach((group, index) => {
        console.log(`\n${index + 1}. Grupo: "${group.normalizedName}"`);
        console.log(`   Canales en grupo: ${group.channelCount}`);
        console.log(`   Canal seleccionado: ${group.selectedChannel.name} (${group.selectedChannel.source})`);
        console.log('   Todos los canales:');
        group.allChannels.forEach(ch => {
          console.log(`     ${ch.selected ? '✓' : '✗'} ${ch.name} (${ch.source})`);
        });
      });
    }
    
    // Mostrar lista final de canales HD únicos
    console.log('\n=== CANALES HD FINALES (SIN DUPLICADOS) ===');
    result.finalHDChannels.forEach((channel, index) => {
      console.log(`${index + 1}. ${channel.name} (${channel.source})`);
    });
    
    logger.info('Análisis de deduplicación HD completado exitosamente');
    
  } catch (error) {
    logger.error('Error durante el análisis de deduplicación HD:', error);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (import.meta.main) {
  main();
}

export { HDChannelDeduplicationService };