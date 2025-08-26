import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import ContentFilterService from './src/domain/services/ContentFilterService.js';
import { Channel } from './src/domain/entities/Channel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logger simple
const logger = {
  info: (message) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`),
  error: (message) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`),
  warn: (message) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`)
};

async function debugReligiousFiltering() {
  try {
    logger.info('🔍 Iniciando análisis de filtrado religioso...');
    
    // Configuración mock para testing
    const mockConfig = {
      filters: {
        filterReligiousContent: true,
        filterAdultContent: true,
        filterPoliticalContent: true,
        religiousKeywords: [
          'jesus', 'cristo', 'dios', 'iglesia', 'cristian', 'catolica', 'catolico',
          'evangelica', 'evangelico', 'biblia', 'gospel', 'cristiano', 'cristiana',
          'fe', 'amen', 'aleluya', 'hallelujah', 'pastor', 'padre', 'sacerdote',
          'misa', 'culto', 'oracion', 'prayer', 'church', 'christian', 'catholic',
          'evangelical', 'bible', 'faith', 'priest', 'mass', 'worship', 'religious',
          'religioso', 'religiosa', 'santo', 'santa', 'san', 'blessed', 'bendito',
          'bendita', 'milagro', 'miracle', 'salvation', 'salvacion', 'heaven',
          'cielo', 'paradise', 'paraiso', 'angel', 'angeles', 'angels', 'spirit',
          'espiritu', 'holy', 'sagrado', 'sagrada', 'divine', 'divino', 'divina'
        ],
        adultKeywords: ['xxx', 'porn', 'adult', 'sexy', 'hot'],
        politicalKeywords: ['politica', 'political', 'gobierno', 'president']
      }
    };
    
    const filterService = new ContentFilterService(mockConfig.filters, logger);
    
    // Cargar canales directamente desde M3U
     logger.info('📡 Cargando canales desde M3U...');
     const allChannels = await loadChannelsFromM3U();
    logger.info(`📊 Total de canales obtenidos: ${allChannels.length}`);
    
    // Mostrar algunos canales para debug
    logger.info('🔍 Primeros 5 canales:');
    allChannels.slice(0, 5).forEach((channel, index) => {
      logger.info(`${index + 1}. ${channel.name} - ${channel.url || 'Sin URL'}`);
    });
    
    // Analizar canales religiosos
    const religiousChannels = [];
    
    // Mostrar palabras clave religiosas configuradas
    console.log(`[DEBUG] ${new Date().toISOString()} - Palabras clave religiosas configuradas:`, mockConfig.filters.religiousKeywords.slice(0, 10));
    
    // Aplicar filtros usando el servicio
    const filteredChannels = filterService.filterChannels(allChannels);
    const filteredIds = new Set(filteredChannels.map(ch => ch.id || ch.name));
    
    console.log(`[DEBUG] ${new Date().toISOString()} - Canales después del filtrado: ${filteredChannels.length}`);
    
    for (const channel of allChannels) {
        // Verificar si contiene contenido religioso
        const channelText = getChannelText(channel);
        const religiousCheck = checkReligiousContent(channel, channelText);
        
        // Debug para los primeros 3 canales
        if (allChannels.indexOf(channel) < 3) {
          console.log(`[DEBUG] ${new Date().toISOString()} - Canal: ${channel.name}`);
          console.log(`[DEBUG] ${new Date().toISOString()} - Texto: ${channelText}`);
          console.log(`[DEBUG] ${new Date().toISOString()} - Religioso detectado: ${religiousCheck.detected}`);
          if (religiousCheck.detected) {
            console.log(`[DEBUG] ${new Date().toISOString()} - Palabras encontradas: ${religiousCheck.keywords.join(', ')}`);
          }
        }
        
        if (religiousCheck.detected) {
          religiousChannels.push({
            channel,
            keywords: religiousCheck.keywords,
            filtered: !filteredIds.has(channel.id || channel.name)
          });
        }
      }
    
    logger.info(`\n🔍 ANÁLISIS DE CANALES RELIGIOSOS:`);
    logger.info(`Total detectados: ${religiousChannels.length}`);
    
    const filtered = religiousChannels.filter(r => r.filtered);
    const notFiltered = religiousChannels.filter(r => !r.filtered);
    
    logger.info(`Filtrados (removidos): ${filtered.length}`);
    logger.info(`No filtrados (mantenidos): ${notFiltered.length}`);
    
    if (notFiltered.length > 0) {
      logger.info(`\n📋 CANALES RELIGIOSOS NO FILTRADOS:`);
      notFiltered.forEach((item, index) => {
        const channel = item.channel;
        logger.info(`${index + 1}. ${channel.name || 'Sin nombre'}`);
        logger.info(`   Keywords: ${item.keywords.join(', ')}`);
        logger.info(`   URL: ${channel.url || 'N/A'}`);
        logger.info(`   Categoría: ${channel.category || 'N/A'}`);
        logger.info('');
      });
    }
    
    if (filtered.length > 0) {
      logger.info(`\n🚫 CANALES RELIGIOSOS FILTRADOS:`);
      filtered.forEach((item, index) => {
        const channel = item.channel;
        logger.info(`${index + 1}. ${channel.name || 'Sin nombre'}`);
        logger.info(`   Keywords: ${item.keywords.join(', ')}`);
        logger.info(`   URL: ${channel.url || 'N/A'}`);
        logger.info(`   Categoría: ${channel.category || 'N/A'}`);
        logger.info('');
      });
    }
    
    logger.info('✅ Análisis completado');
    
  } catch (error) {
    logger.error(`Error durante el análisis: ${error.message}`);
    logger.error(error.stack);
  }
}

function getChannelText(channel) {
  const textParts = [];
  
  if (channel.name) textParts.push(channel.name);
  if (channel.title) textParts.push(channel.title);
  if (channel.description) textParts.push(channel.description);
  if (channel.category) textParts.push(channel.category);
  if (channel.group) textParts.push(channel.group);
  if (channel.genres && Array.isArray(channel.genres)) {
    textParts.push(...channel.genres);
  }
  
  return textParts.join(' ').toLowerCase();
}

function checkReligiousContent(channel, text) {
  const religiousKeywords = [
    'jesus', 'cristo', 'dios', 'iglesia', 'cristian', 'catolica', 'catolico',
    'evangelica', 'evangelico', 'biblia', 'gospel', 'cristiano', 'cristiana',
    'fe', 'amen', 'aleluya', 'hallelujah', 'pastor', 'padre', 'sacerdote',
    'misa', 'culto', 'oracion', 'prayer', 'church', 'christian', 'catholic',
    'evangelical', 'bible', 'faith', 'priest', 'mass', 'worship', 'religious',
    'religioso', 'religiosa', 'santo', 'santa', 'san ', 'blessed', 'bendito',
    'bendita', 'milagro', 'miracle', 'salvation', 'salvacion', 'heaven',
    'cielo', 'paradise', 'paraiso', 'angel', 'angeles', 'angels', 'spirit',
    'espiritu', 'holy', 'sagrado', 'sagrada', 'divine', 'divino', 'divina'
  ];
  
  const foundKeywords = [];
  
  for (const keyword of religiousKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      foundKeywords.push(keyword);
    }
  }
  
  return {
    detected: foundKeywords.length > 0,
    keywords: foundKeywords
  };
}

// Función para cargar canales desde M3U
  async function loadChannelsFromM3U() {
    const channels = [];
    const filePath = path.join(process.cwd(), 'data', 'latam1.m3u8');
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    let currentChannel = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        // Extraer información del canal
        const nameMatch = line.match(/,(.+)$/);
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const groupMatch = line.match(/group-title="([^"]+)"/);
        
        currentChannel = {
          name: nameMatch ? nameMatch[1] : 'Unknown',
          logo: logoMatch ? logoMatch[1] : '',
          group: groupMatch ? groupMatch[1] : 'Undefined'
        };
      } else if (line.startsWith('http') && currentChannel) {
        // URL del stream
        const channelId = `tv_${currentChannel.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const channel = new Channel({
          id: channelId,
          name: currentChannel.name,
          streamUrl: line,
          logo: currentChannel.logo,
          genre: 'General',
          country: 'Unknown',
          language: 'es',
          quality: 'HD',
          isActive: true
        });
        channels.push(channel);
        currentChannel = null;
      }
    }
    
    return channels;
  } catch (error) {
    console.error('Error loading M3U file:', error);
    return [];
  }
}

// Ejecutar análisis
debugReligiousFiltering();