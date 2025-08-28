/**
 * Script de diagnóstico para analizar la carga de channels.csv
 * Identifica exactamente qué canales se están cargando y cuáles se están filtrando
 */

import fs from 'fs';
import csv from 'csv-parser';
import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { Channel } from '../src/domain/entities/Channel.js';
import ContentFilterService from '../src/domain/services/ContentFilterService.js';

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
};

/**
 * Valida una fila del CSV (misma lógica que CSVChannelRepository)
 */
function isValidCSVRow(row) {
  const requiredFields = ['name', 'stream_url'];
  
  for (const field of requiredFields) {
    if (!row[field] || typeof row[field] !== 'string' || row[field].trim().length === 0) {
      return false;
    }
  }
  return true;
}

/**
 * Verifica si un canal pasa los filtros de configuración
 */
function passesConfigFilters(channel, config) {
  const { filters } = config;
  const channelCountry = channel.country.toUpperCase();

  // Verificar países permitidos
  if (filters.allowedCountries.length > 0) {
    const isAllowed = filters.allowedCountries.some(country => 
      channelCountry.includes(country) || country.includes(channelCountry)
    );
    if (!isAllowed) return false;
  }

  // Verificar países bloqueados
  if (filters.blockedCountries.length > 0) {
    const isBlocked = filters.blockedCountries.some(country => 
      channelCountry.includes(country) || country.includes(channelCountry)
    );
    if (isBlocked) return false;
  }

  return true;
}

/**
 * Analiza la carga del archivo channels.csv
 */
async function analyzeCSVLoading() {
  try {
    logger.info('🔍 Iniciando análisis de carga de channels.csv');
    
    // Cargar configuración
    const config = TVAddonConfig.getInstance();
    const channelsFile = config.dataSources.channelsFile;
    
    logger.info(`📁 Archivo CSV: ${channelsFile}`);
    logger.info(`🌍 Países permitidos: ${config.filters.allowedCountries.join(', ') || 'Ninguno'}`);
    logger.info(`🚫 Países bloqueados: ${config.filters.blockedCountries.join(', ') || 'Ninguno'}`);
    
    // Inicializar filtro de contenido
    const contentFilter = new ContentFilterService(config.getAll(), logger);
    
    // Estadísticas
    const stats = {
      totalRows: 0,
      invalidRows: 0,
      validRows: 0,
      duplicateIds: 0,
      filteredByConfig: 0,
      filteredByContent: 0,
      finalChannels: 0,
      uniqueIds: new Set(),
      processedIds: new Set(),
      duplicateDetails: new Map(),
      filterReasons: new Map()
    };
    
    const finalChannels = [];
    
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(channelsFile)
        .pipe(csv())
        .on('data', (row) => {
          stats.totalRows++;
          
          // Validar fila
          if (!isValidCSVRow(row)) {
            stats.invalidRows++;
            logger.debug(`❌ Fila inválida (${stats.totalRows}): ${JSON.stringify(row)}`);
            return;
          }
          
          stats.validRows++;
          
          try {
            // Crear canal desde CSV
            const channel = Channel.fromCSV(row);
            stats.uniqueIds.add(channel.id);
            
            // Verificar duplicados
            if (stats.processedIds.has(channel.id)) {
              stats.duplicateIds++;
              
              // Registrar detalles del duplicado
              if (!stats.duplicateDetails.has(channel.id)) {
                stats.duplicateDetails.set(channel.id, []);
              }
              stats.duplicateDetails.get(channel.id).push({
                name: channel.name,
                url: channel.streamUrl,
                row: stats.totalRows
              });
              
              logger.debug(`🔄 Canal duplicado ignorado (${stats.totalRows}): ${channel.id} - ${channel.name}`);
              return;
            }
            
            // Aplicar filtros de configuración
            if (!passesConfigFilters(channel, config.getAll())) {
              stats.filteredByConfig++;
              const reason = `País: ${channel.country}`;
              stats.filterReasons.set(channel.id, reason);
              logger.debug(`🌍 Canal filtrado por configuración (${stats.totalRows}): ${channel.id} - ${reason}`);
              return;
            }
            
            // Aplicar filtros de contenido usando la lógica interna del servicio
            if (contentFilter.hasActiveFilters()) {
              const filteredChannels = contentFilter.filterChannels([channel]);
              if (filteredChannels.length === 0) {
                stats.filteredByContent++;
                const reason = 'Contenido filtrado';
                stats.filterReasons.set(channel.id, reason);
                logger.debug(`🔒 Canal filtrado por contenido (${stats.totalRows}): ${channel.id} - ${channel.name}`);
                return;
              }
            }
            
            // Canal válido
            finalChannels.push(channel);
            stats.processedIds.add(channel.id);
            stats.finalChannels++;
            
            logger.debug(`✅ Canal válido (${stats.totalRows}): ${channel.id} - ${channel.name}`);
            
          } catch (error) {
            logger.error(`💥 Error procesando fila (${stats.totalRows}):`, error, row);
          }
        })
        .on('end', () => {
          // Mostrar estadísticas finales
          logger.info('\n📊 ESTADÍSTICAS DE CARGA:');
          logger.info(`   📄 Total de filas: ${stats.totalRows}`);
          logger.info(`   ❌ Filas inválidas: ${stats.invalidRows}`);
          logger.info(`   ✅ Filas válidas: ${stats.validRows}`);
          logger.info(`   🆔 IDs únicos encontrados: ${stats.uniqueIds.size}`);
          logger.info(`   🔄 Duplicados ignorados: ${stats.duplicateIds}`);
          logger.info(`   🌍 Filtrados por configuración: ${stats.filteredByConfig}`);
          logger.info(`   🔒 Filtrados por contenido: ${stats.filteredByContent}`);
          logger.info(`   🎯 Canales finales: ${stats.finalChannels}`);
          
          // Mostrar detalles de duplicados más frecuentes
          if (stats.duplicateDetails.size > 0) {
            logger.info('\n🔄 TOP 10 CANALES CON MÁS DUPLICADOS:');
            const sortedDuplicates = Array.from(stats.duplicateDetails.entries())
              .sort(([,a], [,b]) => b.length - a.length)
              .slice(0, 10);
              
            sortedDuplicates.forEach(([id, duplicates]) => {
              logger.info(`   ${id}: ${duplicates.length} duplicados`);
              duplicates.slice(0, 3).forEach(dup => {
                logger.info(`     - Fila ${dup.row}: ${dup.name}`);
              });
              if (duplicates.length > 3) {
                logger.info(`     ... y ${duplicates.length - 3} más`);
              }
            });
          }
          
          // Mostrar razones de filtrado
          if (stats.filterReasons.size > 0) {
            logger.info('\n🚫 RAZONES DE FILTRADO (primeros 10):');
            Array.from(stats.filterReasons.entries())
              .slice(0, 10)
              .forEach(([id, reason]) => {
                logger.info(`   ${id}: ${reason}`);
              });
          }
          
          // Mostrar primeros canales finales
          if (finalChannels.length > 0) {
            logger.info('\n🎯 PRIMEROS 10 CANALES FINALES:');
            finalChannels.slice(0, 10).forEach((channel, index) => {
              logger.info(`   ${index + 1}. ${channel.id} - ${channel.name} (${channel.country})`);
            });
          }
          
          resolve(stats);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
    
  } catch (error) {
    logger.error('💥 Error en análisis:', error);
    throw error;
  }
}

// Ejecutar análisis
analyzeCSVLoading()
  .then((stats) => {
    logger.info('\n✅ Análisis completado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('💥 Error en análisis:', error);
    process.exit(1);
  });