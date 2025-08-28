/**
 * Script para analizar patrones HD específicos en los canales
 * Identifica y categoriza diferentes tipos de canales HD
 */

import { CSVChannelRepository } from '../src/infrastructure/repositories/CSVChannelRepository.js';
import { writeFileSync } from 'fs';

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
};

class HDPatternAnalyzer {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Analiza patrones HD en los canales
   * @param {Array} channels - Lista de canales
   * @returns {Object} Análisis de patrones HD
   */
  analyzeHDPatterns(channels) {
    const patterns = {
      '_hd': [],           // Canales con _hd
      'hd_word': [],       // Canales con hd como palabra completa
      'numbered_hd': [],   // Canales con números+hd (4hd, 6hd, etc.)
      'uhd': [],           // Ultra HD
      'fhd': [],           // Full HD
      '4k': [],            // 4K
      'other_hd': []       // Otros patrones HD
    };

    const stats = {
      total_channels: channels.length,
      hd_channels: 0,
      pattern_counts: {},
      duplicates_by_pattern: {}
    };

    for (const channel of channels) {
      const name = (channel.name || '').toLowerCase();
      let isHD = false;
      
      // Verificar patrón _hd
      if (/_hd\b/.test(name)) {
        patterns['_hd'].push({
          name: channel.name,
          id: channel.id,
          normalized: this.#normalizeForComparison(name)
        });
        isHD = true;
      }
      // Verificar números+hd (4hd, 6hd, etc.)
      else if (/\d+hd\b/.test(name)) {
        const match = name.match(/(\d+)hd\b/);
        patterns['numbered_hd'].push({
          name: channel.name,
          id: channel.id,
          number: match ? match[1] : 'unknown',
          normalized: this.#normalizeForComparison(name)
        });
        isHD = true;
      }
      // Verificar UHD
      else if (/\buhd\b/.test(name)) {
        patterns['uhd'].push({
          name: channel.name,
          id: channel.id,
          normalized: this.#normalizeForComparison(name)
        });
        isHD = true;
      }
      // Verificar FHD
      else if (/\bfhd\b/.test(name)) {
        patterns['fhd'].push({
          name: channel.name,
          id: channel.id,
          normalized: this.#normalizeForComparison(name)
        });
        isHD = true;
      }
      // Verificar 4K
      else if (/\b4k\b/.test(name)) {
        patterns['4k'].push({
          name: channel.name,
          id: channel.id,
          normalized: this.#normalizeForComparison(name)
        });
        isHD = true;
      }
      // Verificar HD como palabra completa
      else if (/\bhd\b/.test(name)) {
        patterns['hd_word'].push({
          name: channel.name,
          id: channel.id,
          normalized: this.#normalizeForComparison(name)
        });
        isHD = true;
      }
      // Otros patrones que contengan hd
      else if (name.includes('hd')) {
        patterns['other_hd'].push({
          name: channel.name,
          id: channel.id,
          normalized: this.#normalizeForComparison(name)
        });
        isHD = true;
      }

      if (isHD) {
        stats.hd_channels++;
      }
    }

    // Calcular estadísticas por patrón
    for (const [pattern, channels] of Object.entries(patterns)) {
      stats.pattern_counts[pattern] = channels.length;
      
      // Detectar duplicados por patrón
      const duplicates = this.#findDuplicatesInPattern(channels);
      stats.duplicates_by_pattern[pattern] = duplicates;
    }

    return { patterns, stats };
  }

  /**
   * Normaliza nombre para comparación de duplicados
   * @param {string} name - Nombre del canal
   * @returns {string} Nombre normalizado
   */
  #normalizeForComparison(name) {
    return name
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/_hd\b/g, '')
      .replace(/\bhd\b/g, '')
      .replace(/\d+hd\b/g, '')
      .replace(/\buhd\b/g, '')
      .replace(/\bfhd\b/g, '')
      .replace(/\b4k\b/g, '')
      .trim();
  }

  /**
   * Encuentra duplicados dentro de un patrón específico
   * @param {Array} channels - Canales del patrón
   * @returns {Object} Grupos de duplicados
   */
  #findDuplicatesInPattern(channels) {
    const groups = {};
    
    for (const channel of channels) {
      const normalized = channel.normalized;
      if (!groups[normalized]) {
        groups[normalized] = [];
      }
      groups[normalized].push(channel);
    }

    // Filtrar solo grupos con más de un canal
    const duplicates = {};
    for (const [normalized, group] of Object.entries(groups)) {
      if (group.length > 1) {
        duplicates[normalized] = group;
      }
    }

    return duplicates;
  }

  /**
   * Genera reporte detallado de patrones HD
   * @param {Object} analysis - Resultado del análisis
   */
  generateReport(analysis) {
    const { patterns, stats } = analysis;
    
    console.log('\n=== ANÁLISIS DE PATRONES HD ===');
    console.log(`📊 Total de canales: ${stats.total_channels}`);
    console.log(`🔍 Canales HD encontrados: ${stats.hd_channels}`);
    console.log(`📈 Porcentaje HD: ${((stats.hd_channels / stats.total_channels) * 100).toFixed(2)}%`);
    
    console.log('\n=== DISTRIBUCIÓN POR PATRONES ===');
    for (const [pattern, count] of Object.entries(stats.pattern_counts)) {
      if (count > 0) {
        console.log(`${pattern.padEnd(15)}: ${count} canales`);
      }
    }

    console.log('\n=== EJEMPLOS POR PATRÓN ===');
    for (const [pattern, channels] of Object.entries(patterns)) {
      if (channels.length > 0) {
        console.log(`\n${pattern.toUpperCase()}:`);
        const examples = channels.slice(0, 5); // Mostrar primeros 5 ejemplos
        for (const channel of examples) {
          if (channel.number) {
            console.log(`  - ${channel.name} (número: ${channel.number})`);
          } else {
            console.log(`  - ${channel.name}`);
          }
        }
        if (channels.length > 5) {
          console.log(`  ... y ${channels.length - 5} más`);
        }
      }
    }

    console.log('\n=== DUPLICADOS DETECTADOS ===');
    let totalDuplicates = 0;
    for (const [pattern, duplicates] of Object.entries(stats.duplicates_by_pattern)) {
      const duplicateCount = Object.keys(duplicates).length;
      if (duplicateCount > 0) {
        console.log(`\n${pattern.toUpperCase()} - ${duplicateCount} grupos de duplicados:`);
        for (const [normalized, group] of Object.entries(duplicates)) {
          console.log(`  Grupo "${normalized}" (${group.length} canales):`);
          for (const channel of group) {
            console.log(`    - ${channel.name}`);
          }
          totalDuplicates += group.length - 1; // -1 porque uno se mantiene
        }
      }
    }
    
    console.log(`\n📋 Total de duplicados que se pueden remover: ${totalDuplicates}`);
    console.log(`✅ Canales HD únicos estimados: ${stats.hd_channels - totalDuplicates}`);
  }

  /**
   * Exporta análisis a archivo JSON
   * @param {Object} analysis - Resultado del análisis
   * @param {string} outputPath - Ruta del archivo
   */
  exportAnalysis(analysis, outputPath) {
    const exportData = {
      timestamp: new Date().toISOString(),
      analysis: analysis,
      summary: {
        total_channels: analysis.stats.total_channels,
        hd_channels: analysis.stats.hd_channels,
        hd_percentage: ((analysis.stats.hd_channels / analysis.stats.total_channels) * 100).toFixed(2),
        pattern_distribution: analysis.stats.pattern_counts,
        total_duplicates: Object.values(analysis.stats.duplicates_by_pattern)
          .reduce((total, duplicates) => {
            return total + Object.values(duplicates)
              .reduce((sum, group) => sum + (group.length - 1), 0);
          }, 0)
      }
    };

    writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf8');
    this.logger.info(`Análisis exportado a: ${outputPath}`);
  }
}

// Función principal
async function main() {
  try {
    logger.info('Iniciando análisis de patrones HD...');
    
    // Configurar objeto config
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
    
    // Crear analizador de patrones HD
    const analyzer = new HDPatternAnalyzer(logger);
    
    // Analizar patrones
    const analysis = analyzer.analyzeHDPatterns(allChannels);
    
    // Generar reporte
    analyzer.generateReport(analysis);
    
    // Exportar análisis
    const outputPath = './data/hd-patterns-analysis.json';
    analyzer.exportAnalysis(analysis, outputPath);
    
    logger.info('Análisis de patrones HD completado exitosamente');
    
  } catch (error) {
    logger.error('Error durante el análisis de patrones HD:', error);
    process.exit(1);
  }
}

// Ejecutar función principal
main().catch(console.error);

export { HDPatternAnalyzer };