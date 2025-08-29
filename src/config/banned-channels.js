/**
 * Sistema de filtrado de canales prohibidos (blacklist)
 * 
 * Este módulo proporciona funcionalidades para filtrar canales basándose en
 * una lista de nombres de canal prohibidos. Se utiliza en conjunto con
 * el sistema de canales permitidos para crear un filtrado de dos etapas:
 * 1. Filtrar por canales permitidos (whitelist)
 * 2. Filtrar por canales prohibidos (blacklist) sobre el resultado anterior
 */

// Lista de canales prohibidos por defecto
const BANNED_CHANNELS = [
  'ADULT',
  'XXX',
  'PORN',
  'SEX',
  'EROTIC',
  'PLAYBOY',
  'HUSTLER',
  'VIVID',
  'BRAZZERS',
  'NAUGHTY',
  'SPICE',
  'EXTREME',
  'VIOLENCE',
  'GORE',
  'HORROR',
  'TERROR'
];

/**
 * Normaliza un nombre de canal para comparación
 * @param {string} channelName - Nombre del canal a normalizar
 * @returns {string} Nombre normalizado
 */
function normalizeChannelName(channelName) {
  if (!channelName || typeof channelName !== 'string') {
    return '';
  }
  
  return channelName
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Verifica si un canal está prohibido
 * @param {string} channelName - Nombre del canal a verificar
 * @returns {boolean} true si el canal está prohibido, false de lo contrario
 */
function isChannelBanned(channelName) {
  if (!channelName || typeof channelName !== 'string') {
    return false;
  }
  
  const normalizedName = normalizeChannelName(channelName);
  
  if (!normalizedName) {
    return false;
  }
  
  return BANNED_CHANNELS.some(bannedTerm => {
    const normalizedBanned = normalizeChannelName(bannedTerm);
    return normalizedName.includes(normalizedBanned) || normalizedBanned.includes(normalizedName);
  });
}

/**
 * Filtra una lista de canales para remover los prohibidos
 * @param {Array} channels - Array de canales a filtrar
 * @returns {Array} Array de canales filtrados (sin los prohibidos)
 */
function filterBannedChannels(channels) {
  if (!Array.isArray(channels)) {
    return [];
  }
  
  return channels.filter(channel => {
    if (!channel || typeof channel !== 'object') {
      return false;
    }
    
    const channelName = channel.name || channel.title || channel.displayName || '';
    return !isChannelBanned(channelName);
  });
}

/**
 * Obtiene todos los términos prohibidos
 * @returns {Array} Array de términos prohibidos
 */
function getBannedTerms() {
  return [...BANNED_CHANNELS];
}

/**
 * Agrega un nuevo término a la lista de prohibidos
 * @param {string} term - Término a agregar
 */
function addBannedTerm(term) {
  if (typeof term === 'string' && term.trim()) {
    const normalizedTerm = normalizeChannelName(term);
    if (!BANNED_CHANNELS.some(banned => normalizeChannelName(banned) === normalizedTerm)) {
      BANNED_CHANNELS.push(term.trim().toUpperCase());
    }
  }
}

/**
 * Remueve un término de la lista de prohibidos
 * @param {string} term - Término a remover
 */
function removeBannedTerm(term) {
  if (typeof term === 'string' && term.trim()) {
    const normalizedTerm = normalizeChannelName(term);
    const index = BANNED_CHANNELS.findIndex(banned => normalizeChannelName(banned) === normalizedTerm);
    if (index > -1) {
      BANNED_CHANNELS.splice(index, 1);
    }
  }
}

/**
 * Aplica filtrado de dos etapas: primero allowed, luego banned
 * NOTA: Los repositorios implementan esto directamente importando ambos filtros
 * @param {Array} channels - Array de canales a filtrar
 * @returns {Array} Array de canales filtrados por ambos sistemas
 * @deprecated - Usar filterAllowedChannels y filterBannedChannels directamente
 */
function applyTwoStageFiltering(channels) {
  console.warn('applyTwoStageFiltering está obsoleto. Usar filterAllowedChannels → filterBannedChannels');
  return channels;
}

export {
  BANNED_CHANNELS,
  normalizeChannelName,
  isChannelBanned,
  filterBannedChannels,
  getBannedTerms,
  addBannedTerm,
  removeBannedTerm,
  applyTwoStageFiltering
};