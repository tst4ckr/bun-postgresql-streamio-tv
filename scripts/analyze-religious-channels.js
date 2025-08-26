/**
 * Script para analizar canales religiosos y mejorar la detección
 * Identifica canales que podrían ser religiosos pero no están siendo filtrados
 */

import { HybridChannelRepository } from '../src/infrastructure/repositories/HybridChannelRepository.js';
import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import ContentFilterService from '../src/domain/services/ContentFilterService.js';

const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.log(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.log(`[ERROR] ${new Date().toISOString()} - ${msg}`)
};

/**
 * Analiza canales para detectar posibles canales religiosos no filtrados
 */
async function analyzeReligiousChannels() {
  try {
    logger.info('🔍 Iniciando análisis de canales religiosos...');
    
    // Obtener configuración
    const config = TVAddonConfig.getInstance();
    
    // Obtener todos los canales SIN filtros
    logger.info('📡 Obteniendo canales sin filtros...');
    
    // Crear una configuración temporal sin filtros
    const originalConfig = config.getAll();
    const configWithoutFilters = {
      ...originalConfig,
      filters: {
        ...originalConfig.filters,
        filterReligiousContent: false,
        filterAdultContent: false,
        filterPoliticalContent: false
      }
    };
    
    // Crear mock de TVAddonConfig sin filtros
    const mockConfigWithoutFilters = {
      getAll: () => configWithoutFilters,
      filters: configWithoutFilters.filters,
      dataSources: configWithoutFilters.dataSources,
      streaming: configWithoutFilters.streaming,
      validation: configWithoutFilters.validation,
      logging: configWithoutFilters.logging
    };
    
    // Preparar parámetros para HybridChannelRepository
    const csvPath = originalConfig.dataSources.channelsFile;
    const m3uSources = [
      originalConfig.dataSources.m3uUrl,
      originalConfig.dataSources.backupM3uUrl,
      originalConfig.dataSources.m3uUrl1,
      originalConfig.dataSources.m3uUrl2,
      originalConfig.dataSources.m3uUrl3,
      originalConfig.dataSources.localM3uLatam1,
      originalConfig.dataSources.localM3uLatam2,
      originalConfig.dataSources.localM3uLatam3,
      originalConfig.dataSources.localM3uLatam4,
      originalConfig.dataSources.localM3uIndex
    ].filter(source => source && source.trim() !== '');
    
    const repositoryWithoutFilters = new HybridChannelRepository(csvPath, m3uSources, mockConfigWithoutFilters, logger);
    
    const allChannels = await repositoryWithoutFilters.getAllChannels();
    logger.info(`📊 Total de canales obtenidos: ${allChannels.length}`);
    
    // Crear filtro de contenido
    const contentFilter = new ContentFilterService(config.filters);
    
    // Analizar canales que podrían ser religiosos
    const potentialReligiousChannels = [];
    const religiousKeywords = [
      // Palabras clave actuales
      'religion', 'religioso', 'iglesia', 'church', 'dios', 'god', 'jesus', 'cristo', 'christ',
      'biblia', 'bible', 'catolico', 'catholic', 'cristiano', 'christian', 'evangelico', 'evangelical',
      'pastor', 'sacerdote', 'priest', 'misa', 'mass', 'oracion', 'prayer', 'santo', 'saint',
      'virgen', 'virgin', 'maria', 'mary', 'fe', 'faith', 'bendicion', 'blessing', 'sermon',
      'predicacion', 'preaching', 'templo', 'temple', 'capilla', 'chapel', 'diocesis', 'diocese',
      'parroquia', 'parish',
      // Palabras adicionales para detectar en URLs/dominios
      'gospel', 'ministry', 'ministries', 'salvation', 'heaven', 'holy', 'spirit', 'trinity',
      'apostolic', 'pentecostal', 'baptist', 'methodist', 'presbyterian', 'lutheran', 'anglican',
      'orthodox', 'episcopal', 'adventist', 'mormon', 'jehovah', 'witness', 'testimony',
      'miracle', 'healing', 'worship', 'praise', 'hallelujah', 'amen', 'biblical', 'scripture',
      'verse', 'psalm', 'prophet', 'apostle', 'disciple', 'missionary', 'evangelism',
      'resurrection', 'crucifixion', 'salvation', 'redemption', 'grace', 'mercy', 'divine'
    ];
    
    // Función para extraer texto completo del canal incluyendo URL
    function getCompleteChannelText(channel) {
      const textParts = [];
      
      // Texto básico del canal
      if (channel.name) textParts.push(channel.name);
      if (channel.title) textParts.push(channel.title);
      if (channel.description) textParts.push(channel.description);
      if (channel.category) textParts.push(channel.category);
      if (channel.group) textParts.push(channel.group);
      if (Array.isArray(channel.genres)) textParts.push(...channel.genres);
      
      // NUEVO: Analizar URL/dominio
      if (channel.stream_url || channel.url) {
        const url = channel.stream_url || channel.url;
        try {
          const urlObj = new URL(url);
          // Extraer dominio y path
          textParts.push(urlObj.hostname);
          textParts.push(urlObj.pathname);
          // Extraer parámetros de query que podrían contener información
          urlObj.searchParams.forEach((value, key) => {
            textParts.push(key);
            textParts.push(value);
          });
        } catch (e) {
          // Si no es una URL válida, agregar como texto
          textParts.push(url);
        }
      }
      
      return textParts.join(' ').toLowerCase();
    }
    
    // Analizar cada canal
    for (const channel of allChannels) {
      const completeText = getCompleteChannelText(channel);
      
      // Buscar palabras clave religiosas
      const foundKeywords = religiousKeywords.filter(keyword => 
        completeText.includes(keyword.toLowerCase())
      );
      
      if (foundKeywords.length > 0) {
        potentialReligiousChannels.push({
          channel,
          foundKeywords,
          completeText: completeText.substring(0, 200) + '...'
        });
      }
    }
    
    logger.info(`🔍 Canales potencialmente religiosos encontrados: ${potentialReligiousChannels.length}`);
    
    // Mostrar primeros 20 canales encontrados
    logger.info('\n📋 CANALES RELIGIOSOS DETECTADOS:');
    potentialReligiousChannels.slice(0, 20).forEach((item, index) => {
      const { channel, foundKeywords } = item;
      logger.info(`${index + 1}. ${channel.name || 'Sin nombre'}`);
      logger.info(`   URL: ${(channel.stream_url || channel.url || 'N/A').substring(0, 80)}...`);
      logger.info(`   Palabras clave: ${foundKeywords.join(', ')}`);
      logger.info(`   Categoría: ${channel.category || channel.group || 'N/A'}`);
      logger.info('');
    });
    
    // Probar filtro actual
    const filteredChannels = contentFilter.filterChannels(allChannels);
    const removedCount = allChannels.length - filteredChannels.length;
    
    logger.info(`\n📊 ESTADÍSTICAS DE FILTRADO ACTUAL:`);
    logger.info(`Total de canales: ${allChannels.length}`);
    logger.info(`Canales filtrados: ${filteredChannels.length}`);
    logger.info(`Canales removidos: ${removedCount}`);
    logger.info(`Porcentaje removido: ${((removedCount / allChannels.length) * 100).toFixed(2)}%`);
    
    // Mostrar estadísticas del filtro
    const stats = contentFilter.getFilterStats(allChannels, filteredChannels);
    logger.info(`\n🔍 ESTADÍSTICAS DETALLADAS:`);
    logger.info(`Canales religiosos removidos: ${stats.removedByCategory?.religious || 0}`);
    logger.info(`Canales adultos removidos: ${stats.removedByCategory?.adult || 0}`);
    logger.info(`Canales políticos removidos: ${stats.removedByCategory?.political || 0}`);
    
    logger.info('\n✅ Análisis completado');
    
  } catch (error) {
    logger.error(`Error durante el análisis: ${error.message}`);
    console.error(error);
  }
}

// Ejecutar análisis
analyzeReligiousChannels().catch(console.error);