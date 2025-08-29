/**
 * Sistema inteligente de filtrado de canales con similitud de 90%
 * Permite canales basados en patrones y similitud de nombres
 * Si incluyes "HBO", permitirá todo lo que contenga HBO con 90% de similitud
 */

const ALLOWED_CHANNELS = [
  // Lista base de canales permitidos - modificar según necesidad
  'HBO',
  'ESPN',
  'CNN',
  'FOX',
  'Discovery',
  'National Geographic',
  'History',
  'TLC',
  'MTV',
  'Comedy Central'
];

/**
 * Normaliza el nombre de un canal para comparación
 * @param {string} channelName - Nombre del canal
 * @returns {string} - Nombre normalizado
 */
function normalizeChannelName(channelName) {
  if (!channelName || typeof channelName !== 'string') {
    return '';
  }
  
  return channelName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
    .replace(/\s+/g, ' ') // Normalizar espacios
    .trim();
}

/**
 * Calcula la distancia de Levenshtein entre dos strings
 * @private
 * @param {string} str1
 * @param {string} str2
 * @returns {number}
 */
function levenshteinDistance(str1, str2) {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Calcula similitud entre dos strings usando algoritmo mejorado
 * @param {string} str1
 * @param {string} str2
 * @returns {number} Similitud entre 0 y 1
 */
function calculateStringSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  // Verificar si una es subcadena de la otra
  const shorter = str1.length < str2.length ? str1 : str2;
  const longer = str1.length < str2.length ? str2 : str1;
  
  if (longer.includes(shorter) && shorter.length >= 2) {
    const lengthRatio = shorter.length / longer.length;
    return Math.min(0.95, 0.7 + (lengthRatio * 0.25));
  }

  // Algoritmo de distancia de Levenshtein normalizada
  const maxLength = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(str1, str2);
  
  return 1 - (distance / maxLength);
}

/**
 * Verifica si un canal está permitido usando similitud de 90%
 * @param {string} channelName - Nombre del canal a verificar
 * @returns {boolean} - true si el canal está permitido
 */
function isChannelAllowed(channelName) {
  if (!channelName) {
    return false;
  }
  
  const normalizedInput = normalizeChannelName(channelName);
  
  // Primero verificar coincidencia exacta
  const exactMatch = ALLOWED_CHANNELS.some(allowedChannel => {
    const normalizedAllowed = normalizeChannelName(allowedChannel);
    return normalizedInput === normalizedAllowed;
  });
  
  if (exactMatch) {
    return true;
  }
  
  // Luego verificar similitud de 90%
  return ALLOWED_CHANNELS.some(allowedChannel => {
    const normalizedAllowed = normalizeChannelName(allowedChannel);
    const similarity = calculateStringSimilarity(normalizedInput, normalizedAllowed);
    
    // Verificar si el canal permitido está contenido en el nombre
    const isContained = normalizedInput.includes(normalizedAllowed) || normalizedAllowed.includes(normalizedInput);
    
    return similarity >= 0.9 || (isContained && normalizedAllowed.length >= 2);
  });
}

/**
 * Filtra una lista de canales manteniendo solo los permitidos
 * @param {Array} channels - Lista de canales
 * @param {number} [threshold=0.9] - Umbral de similitud (0-1)
 * @returns {Array} - Lista filtrada solo con canales permitidos
 */
function filterAllowedChannels(channels, threshold = 0.9) {
  if (!Array.isArray(channels)) {
    return [];
  }
  
  return channels.filter(channel => {
    const channelName = channel?.name || channel?.title || '';
    const isAllowed = isChannelAllowed(channelName, threshold);
    
    if (!isAllowed) {
      console.log(`[FILTRO] Canal no permitido removido: ${channelName}`);
    }
    
    return isAllowed;
  });
}

/**
 * Obtiene la lista completa de canales permitidos
 * @returns {Array} - Lista de canales permitidos
 */
function getAllowedChannels() {
  return [...ALLOWED_CHANNELS];
}

/**
 * Configura el umbral de similitud para el filtrado
 * @param {number} threshold - Umbral entre 0 y 1 (por defecto 0.9)
 * @returns {number} - Umbral configurado
 */
function setSimilarityThreshold(threshold) {
  if (typeof threshold === 'number' && threshold >= 0 && threshold <= 1) {
    return threshold;
  }
  return 0.9;
}

/**
 * Verifica si un canal está permitido con umbral personalizable
 * @param {string} channelName - Nombre del canal a verificar
 * @param {number} [threshold=0.9] - Umbral de similitud
 * @returns {boolean} - true si el canal está permitido
 */
function isChannelAllowedWithThreshold(channelName, threshold = 0.9) {
  if (!channelName) {
    return false;
  }
  
  const normalizedInput = normalizeChannelName(channelName);
  
  // Primero verificar coincidencia exacta
  const exactMatch = ALLOWED_CHANNELS.some(allowedChannel => {
    const normalizedAllowed = normalizeChannelName(allowedChannel);
    return normalizedInput === normalizedAllowed;
  });
  
  if (exactMatch) {
    return true;
  }
  
  // Luego verificar similitud con umbral personalizable
  return ALLOWED_CHANNELS.some(allowedChannel => {
    const normalizedAllowed = normalizeChannelName(allowedChannel);
    const similarity = calculateStringSimilarity(normalizedInput, normalizedAllowed);
    
    // Verificar si el canal permitido está contenido en el nombre
    const isContained = normalizedInput.includes(normalizedAllowed) || normalizedAllowed.includes(normalizedInput);
    
    return similarity >= threshold || (isContained && normalizedAllowed.length >= 2);
  });
}

/**
 * Agrega un canal a la lista de permitidos
 * @param {string} channelName - Nombre del canal a agregar
 */
function addAllowedChannel(channelName) {
  if (channelName && typeof channelName === 'string') {
    const normalizedNew = normalizeChannelName(channelName);
    const exists = ALLOWED_CHANNELS.some(allowed => 
      normalizeChannelName(allowed) === normalizedNew
    );
    
    if (!exists) {
      ALLOWED_CHANNELS.push(channelName.trim());
    }
  }
}

/**
 * Remueve un canal de la lista de permitidos
 * @param {string} channelName - Nombre del canal a remover
 */
function removeAllowedChannel(channelName) {
  if (channelName && typeof channelName === 'string') {
    const normalizedToRemove = normalizeChannelName(channelName);
    const index = ALLOWED_CHANNELS.findIndex(allowed => 
      normalizeChannelName(allowed) === normalizedToRemove
    );
    
    if (index > -1) {
      ALLOWED_CHANNELS.splice(index, 1);
    }
  }
}

// Mantener compatibilidad hacia atrás
function isChannelAllowed(channelName) {
  return isChannelAllowedWithThreshold(channelName, 0.9);
}

export {
  ALLOWED_CHANNELS,
  isChannelAllowed,
  isChannelAllowedWithThreshold,
  filterAllowedChannels,
  normalizeChannelName,
  calculateStringSimilarity,
  getAllowedChannels,
  addAllowedChannel,
  removeAllowedChannel,
  setSimilarityThreshold
};