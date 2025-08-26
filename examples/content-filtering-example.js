/**
 * Ejemplo de uso del sistema de filtros de contenido
 * Demuestra cómo configurar y usar los filtros religioso, adulto y político
 */

import ContentFilterService from '../src/domain/services/ContentFilterService.js';
import { Channel } from '../src/domain/entities/Channel.js';

// Logger simple como en el resto del proyecto
const logger = {
  info: (message) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`),
  warn: (message) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`),
  error: (message) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`),
  debug: (message) => console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`)
};

/**
 * Ejemplo de configuración de filtros
 */
const filterConfig = {
  // Habilitar filtros específicos
  filterReligiousContent: true,
  filterAdultContent: true,
  filterPoliticalContent: false,
  
  // Palabras clave religiosas (español e inglés)
  religiousKeywords: [
    'jesus', 'cristo', 'dios', 'iglesia', 'cristian', 'catolica', 'catolico',
    'evangelica', 'evangelico', 'biblia', 'gospel', 'church', 'christian',
    'catholic', 'evangelical', 'bible', 'faith', 'priest', 'pastor',
    'santo', 'santa', 'san', 'blessed', 'milagro', 'miracle',
    'salvation', 'heaven', 'cielo', 'angel', 'spirit', 'holy', 'divine'
  ],
  
  // Palabras clave para contenido adulto
  adultKeywords: [
    'xxx', 'porn', 'adult', 'sexy', 'hot', 'erotic', 'nude',
    '+18', 'adulto', 'erotico', 'sexual', 'playboy', 'penthouse'
  ],
  
  // Palabras clave políticas
  politicalKeywords: [
    'politica', 'political', 'gobierno', 'president', 'congreso',
    'senado', 'diputado', 'alcalde', 'gobernador', 'elecciones'
  ]
};

/**
 * Canales de ejemplo para demostrar el filtrado
 */
const exampleChannels = [
  new Channel({
    id: 'tv_cnn_es',
    name: 'CNN Español',
    streamUrl: 'https://cnn-stream.m3u8',
    genre: 'News'
  }),
  new Channel({
    id: 'tv_iglesia_tv',
    name: 'Iglesia TV',
    streamUrl: 'https://iglesia-stream.m3u8',
    genre: 'General'
  }),
  new Channel({
    id: 'tv_cristo_vision',
    name: 'Cristo Visión',
    streamUrl: 'https://cristo-stream.m3u8',
    genre: 'General'
  }),
  new Channel({
    id: 'tv_dios_te_ve',
    name: 'Dios Te Ve Kids',
    streamUrl: 'https://dios-stream.m3u8',
    genre: 'Kids'
  }),
  new Channel({
    id: 'tv_adult_channel',
    name: 'Adult XXX Channel',
    streamUrl: 'https://adult-stream.m3u8',
    genre: 'Entertainment'
  }),
  new Channel({
    id: 'tv_political_news',
    name: 'Canal Político Nacional',
    streamUrl: 'https://political-stream.m3u8',
    genre: 'News'
  })
];

/**
 * Función principal de demostración
 */
async function demonstrateContentFiltering() {
  try {
    logger.info('🔍 Iniciando demostración de filtros de contenido...');
    
    // Crear instancia del servicio de filtros
    const filterService = new ContentFilterService(filterConfig);
    
    logger.info(`📊 Total de canales de ejemplo: ${exampleChannels.length}`);
    
    // Mostrar canales originales
    logger.info('\n📺 CANALES ORIGINALES:');
    exampleChannels.forEach((channel, index) => {
      logger.info(`${index + 1}. ${channel.name} (${channel.genre})`);
    });
    
    // Aplicar filtros
    logger.info('\n🔄 Aplicando filtros de contenido...');
    const filteredChannels = filterService.filterChannels(exampleChannels);
    
    // Mostrar resultados
    logger.info(`\n✅ CANALES DESPUÉS DEL FILTRADO: ${filteredChannels.length}`);
    filteredChannels.forEach((channel, index) => {
      logger.info(`${index + 1}. ${channel.name} (${channel.genre})`);
    });
    
    // Análisis detallado
    const removedChannels = exampleChannels.filter(
      original => !filteredChannels.some(filtered => filtered.id === original.id)
    );
    
    logger.info(`\n🚫 CANALES FILTRADOS (REMOVIDOS): ${removedChannels.length}`);
    removedChannels.forEach((channel, index) => {
      const reason = analyzeFilterReason(channel, filterConfig);
      logger.info(`${index + 1}. ${channel.name} - Razón: ${reason}`);
    });
    
    // Obtener estadísticas del filtro
    const stats = filterService.getFilterStats(exampleChannels, filteredChannels);
    logger.info('\n📈 ESTADÍSTICAS DE FILTRADO:');
    logger.info(`- Canales originales: ${stats.originalChannels}`);
    logger.info(`- Canales filtrados: ${stats.filteredChannels}`);
    logger.info(`- Canales removidos: ${stats.removedChannels}`);
    logger.info(`- Porcentaje removido: ${stats.removalPercentage}%`);
    logger.info(`- Religiosos removidos: ${stats.removedByCategory.religious}`);
    logger.info(`- Adultos removidos: ${stats.removedByCategory.adult}`);
    logger.info(`- Políticos removidos: ${stats.removedByCategory.political}`);
    
    // Mostrar configuración de filtros
    const currentFilterConfig = filterService.getFilterConfiguration();
    logger.info('\n⚙️ CONFIGURACIÓN DE FILTROS:');
    logger.info(`- Filtro religioso: ${currentFilterConfig.religious.enabled ? 'ACTIVO' : 'INACTIVO'} (${currentFilterConfig.religious.keywordCount} palabras clave)`);
    logger.info(`- Filtro adulto: ${currentFilterConfig.adult.enabled ? 'ACTIVO' : 'INACTIVO'} (${currentFilterConfig.adult.keywordCount} palabras clave)`);
    logger.info(`- Filtro político: ${currentFilterConfig.political.enabled ? 'ACTIVO' : 'INACTIVO'} (${currentFilterConfig.political.keywordCount} palabras clave)`);
    
    logger.info('\n✅ Demostración completada exitosamente');
    
  } catch (error) {
    logger.error(`❌ Error durante la demostración: ${error.message}`);
    logger.error(error.stack);
  }
}

/**
 * Analiza por qué un canal fue filtrado
 */
function analyzeFilterReason(channel, config) {
  const channelText = channel.name.toLowerCase();
  
  if (config.filterReligiousContent) {
    for (const keyword of config.religiousKeywords) {
      if (channelText.includes(keyword.toLowerCase())) {
        return `Contenido religioso (palabra: "${keyword}")`;
      }
    }
  }
  
  if (config.filterAdultContent) {
    for (const keyword of config.adultKeywords) {
      if (channelText.includes(keyword.toLowerCase())) {
        return `Contenido adulto (palabra: "${keyword}")`;
      }
    }
  }
  
  if (config.filterPoliticalContent) {
    for (const keyword of config.politicalKeywords) {
      if (channelText.includes(keyword.toLowerCase())) {
        return `Contenido político (palabra: "${keyword}")`;
      }
    }
  }
  
  return 'Razón desconocida';
}

/**
 * Ejemplo de configuración personalizada
 */
function demonstrateCustomConfiguration() {
  logger.info('\n🔧 EJEMPLO DE CONFIGURACIÓN PERSONALIZADA:');
  
  // Configuración solo para contenido adulto
  const adultOnlyConfig = {
    filterReligiousContent: false,
    filterAdultContent: true,
    filterPoliticalContent: false,
    religiousKeywords: [],
    adultKeywords: ['xxx', 'adult', 'porn', '+18'],
    politicalKeywords: []
  };
  
  logger.info('Configuración: Solo filtrar contenido adulto');
  logger.info('Variables de entorno equivalentes:');
  logger.info('FILTER_RELIGIOUS_CONTENT=false');
  logger.info('FILTER_ADULT_CONTENT=true');
  logger.info('FILTER_POLITICAL_CONTENT=false');
  logger.info('ADULT_KEYWORDS=xxx,adult,porn,+18');
  
  // Configuración estricta (todos los filtros)
  const strictConfig = {
    filterReligiousContent: true,
    filterAdultContent: true,
    filterPoliticalContent: true,
    religiousKeywords: filterConfig.religiousKeywords,
    adultKeywords: filterConfig.adultKeywords,
    politicalKeywords: filterConfig.politicalKeywords
  };
  
  logger.info('\nConfiguración estricta: Filtrar todo tipo de contenido');
  logger.info('Variables de entorno equivalentes:');
  logger.info('FILTER_RELIGIOUS_CONTENT=true');
  logger.info('FILTER_ADULT_CONTENT=true');
  logger.info('FILTER_POLITICAL_CONTENT=true');
}

/**
 * Ejecutar demostración
 */
if (import.meta.main) {
  demonstrateContentFiltering();
  demonstrateCustomConfiguration();
}

export {
  demonstrateContentFiltering,
  demonstrateCustomConfiguration,
  filterConfig,
  exampleChannels
};