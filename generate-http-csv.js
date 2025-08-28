/**
 * Script para generar CSV con todos los canales HTTP
 * Extrae canales del repositorio híbrido y los exporta organizadamente
 */

import fs from 'fs/promises';
import path from 'path';
import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import { ChannelRepositoryFactory } from './src/infrastructure/factories/ChannelRepositoryFactory.js';
import { HttpsToHttpConversionService } from './src/infrastructure/services/HttpsToHttpConversionService.js';
import { StreamHealthService } from './src/infrastructure/services/StreamHealthService.js';

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args)
};

/**
 * Convierte un canal a formato CSV
 * @param {Object} channel - Canal a convertir
 * @returns {string} Línea CSV
 */
function channelToCSV(channel) {
  // Escapar comillas dobles en los valores
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  return [
    escape(channel.id),
    escape(channel.name),
    escape(channel.streamUrl),
    escape(channel.genre?.value || ''),
    escape(channel.country?.value || ''),
    escape(channel.language?.value || ''),
    escape(channel.quality?.value || ''),
    escape(channel.logo || ''),
    escape(channel.metadata?.source || ''),
    escape(channel.isActive ? 'true' : 'false'),
    escape(channel.isValidStream() ? 'true' : 'false')
  ].join(',');
}

/**
 * Genera el archivo CSV con canales HTTP y HTTPS (convertidos a HTTP)
 */
async function generateHttpCSV() {
  try {
    logger.info('🚀 Iniciando generación de CSV con canales HTTP y HTTPS...');
    
    // Cargar configuración
    const config = TVAddonConfig.getInstance();
    logger.info(`📋 Configuración cargada - Fuente: ${config.dataSources.channelsSource}`);
    
    // Crear repositorio
    const channelRepository = await ChannelRepositoryFactory.createRepository(config, logger);
    logger.info(`📦 Repositorio creado: ${channelRepository.constructor.name}`);
    
    // Inicializar servicios de validación
    const streamHealthService = new StreamHealthService(config.getAll(), logger);
    const httpsToHttpService = new HttpsToHttpConversionService(config.getAll(), streamHealthService, logger);
    logger.info('🔧 Servicios de validación inicializados');
    
    // Obtener todos los canales (sin filtros de contenido)
    logger.info('📡 Obteniendo todos los canales...');
    const allChannels = await channelRepository.getAllChannelsUnfiltered();
    logger.info(`📊 Total de canales obtenidos: ${allChannels.length}`);
    
    // Filtrar solo canales HTTP y HTTPS
    const webChannels = allChannels.filter(channel => {
      const url = channel.streamUrl;
      return url && (url.startsWith('http://') || url.startsWith('https://'));
    });
    
    logger.info(`🔗 Canales HTTP/HTTPS encontrados: ${webChannels.length}`);
    
    // Aplicar conversión HTTPS→HTTP y validación
    logger.info('🔄 Aplicando conversión HTTPS→HTTP y validación...');
    const conversionResult = await httpsToHttpService.processChannels(webChannels, {
      concurrency: config.getConfig('validation')?.maxValidationConcurrency || 10,
      showProgress: true,
      onlyWorkingHttp: false // Incluir todos los canales, funcionales o no
    });
    
    const processedChannels = conversionResult.processed;
    const conversionStats = conversionResult.stats;
    
    logger.info(`✅ Conversión completada: ${processedChannels.length} canales procesados`);
    logger.info(`📊 Estadísticas de conversión:`);
    logger.info(`   • Total: ${conversionStats.total}`);
    logger.info(`   • Convertidos HTTPS→HTTP: ${conversionStats.converted}`);
    logger.info(`   • HTTP funcionales: ${conversionStats.httpWorking}`);
    logger.info(`   • HTTPS originales funcionales: ${conversionStats.originalWorking}`);
    
    // Usar los canales procesados como canales HTTP finales
    const httpChannels = processedChannels;
    
    // Estadísticas finales por protocolo
    const finalHttpCount = httpChannels.filter(ch => ch.streamUrl.startsWith('http://')).length;
    const finalHttpsCount = httpChannels.filter(ch => ch.streamUrl.startsWith('https://')).length;
    
    logger.info(`📊 Canales finales por protocolo:`);
    logger.info(`   📊 HTTP: ${finalHttpCount}`);
    logger.info(`   📊 HTTPS: ${finalHttpsCount}`);
    
    // Ordenar canales por nombre para organización
    httpChannels.sort((a, b) => {
      // Primero por país, luego por género, finalmente por nombre
      const countryA = a.country?.value || 'ZZZ';
      const countryB = b.country?.value || 'ZZZ';
      
      if (countryA !== countryB) {
        return countryA.localeCompare(countryB);
      }
      
      const genreA = a.genre?.value || 'ZZZ';
      const genreB = b.genre?.value || 'ZZZ';
      
      if (genreA !== genreB) {
        return genreA.localeCompare(genreB);
      }
      
      return a.name.localeCompare(b.name);
    });
    
    // Crear contenido CSV
    const csvHeader = [
      'id',
      'name',
      'url',
      'genre',
      'country',
      'language',
      'quality',
      'logo',
      'source',
      'isActive',
      'isValidStream'
    ].join(',');
    
    const csvRows = httpChannels.map(channelToCSV);
    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    // Crear directorio data si no existe
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    
    // Escribir archivo CSV
    const csvPath = path.join(dataDir, 'http.csv');
    await fs.writeFile(csvPath, csvContent, 'utf8');
    
    logger.info(`✅ CSV generado exitosamente: ${csvPath}`);
    logger.info(`📄 Canales exportados: ${httpChannels.length}`);
    
    // Estadísticas adicionales
    const stats = {
      totalChannels: httpChannels.length,
      bySource: {},
      byCountry: {},
      byGenre: {},
      byProtocol: {
        http: finalHttpCount,
        https: finalHttpsCount
      },
      conversion: conversionStats
    };
    
    // Calcular estadísticas
    httpChannels.forEach(channel => {
      const source = channel.metadata?.source || 'unknown';
      const country = channel.country?.value || 'unknown';
      const genre = channel.genre?.value || 'unknown';
      
      stats.bySource[source] = (stats.bySource[source] || 0) + 1;
      stats.byCountry[country] = (stats.byCountry[country] || 0) + 1;
      stats.byGenre[genre] = (stats.byGenre[genre] || 0) + 1;
    });
    
    logger.info('\n📊 ESTADÍSTICAS DEL CSV GENERADO:');
    logger.info(`   📄 Total de canales: ${stats.totalChannels}`);
    logger.info(`   🔗 HTTP: ${stats.byProtocol.http} (${((stats.byProtocol.http/stats.totalChannels)*100).toFixed(1)}%)`);
    logger.info(`   🔒 HTTPS: ${stats.byProtocol.https} (${((stats.byProtocol.https/stats.totalChannels)*100).toFixed(1)}%)`);
    logger.info('\n🔄 ESTADÍSTICAS DE CONVERSIÓN:');
    logger.info(`   🔄 Canales convertidos HTTPS→HTTP: ${stats.conversion.converted}`);
    logger.info(`   ✅ HTTP funcionales: ${stats.conversion.httpWorking}`);
    logger.info(`   🔒 HTTPS originales funcionales: ${stats.conversion.originalWorking}`);
    logger.info(`   ❌ Canales fallidos: ${stats.conversion.failed}`);
    
    logger.info('\n📍 Por fuente:');
    Object.entries(stats.bySource)
      .sort(([,a], [,b]) => b - a)
      .forEach(([source, count]) => {
        logger.info(`   ${source}: ${count} canales`);
      });
    
    logger.info('\n🌍 Top 10 países:');
    Object.entries(stats.byCountry)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .forEach(([country, count]) => {
        logger.info(`   ${country}: ${count} canales`);
      });
    
    logger.info('\n🎭 Top 10 géneros:');
    Object.entries(stats.byGenre)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .forEach(([genre, count]) => {
        logger.info(`   ${genre}: ${count} canales`);
      });
    
    return true;
    
  } catch (error) {
    logger.error('💥 Error generando CSV:', error);
    return false;
  }
}

// Ejecutar generación
generateHttpCSV()
  .then(success => {
    if (success) {
      logger.info('🎉 Generación de CSV completada exitosamente');
      process.exit(0);
    } else {
      logger.error('❌ Falló la generación del CSV');
      process.exit(1);
    }
  })
  .catch(error => {
    logger.error('💥 Error fatal:', error);
    process.exit(1);
  });