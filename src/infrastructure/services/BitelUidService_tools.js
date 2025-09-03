/**
 * @fileoverview BitelUidService Tools - Funciones auxiliares para generación de UIDs dinámicos
 * Contiene herramientas puras y utilitarias para el manejo de canales TV360.BITEL
 * 
 * Responsabilidades:
 * - Validación de URLs BITEL
 * - Generación de UIDs dinámicos
 * - Construcción de URLs con parámetros
 * - Gestión de cache y estadísticas
 * - Validación de configuración
 */

/**
 * Configuración por defecto para el servicio BITEL
 */
export const DEFAULT_BITEL_CONFIG = {
  cacheExpiry: 20 * 60 * 1000, // 20 minutos
  uidPrefix: '10',
  uidLength: 8,
  domain: 'tv360.bitel.com.pe'
};

/**
 * Verifica si una URL pertenece a TV360.BITEL
 * @param {string} streamUrl - URL a verificar
 * @param {string} domain - Dominio BITEL (opcional)
 * @returns {boolean} True si es canal BITEL
 */
export function isBitelChannel(streamUrl, domain = DEFAULT_BITEL_CONFIG.domain) {
  return streamUrl && typeof streamUrl === 'string' && streamUrl.includes(domain);
}

/**
 * Genera un UID dinámico que empieza con '10' seguido de 6 números aleatorios
 * @param {string} prefix - Prefijo del UID (por defecto '10')
 * @returns {string} UID generado (formato: 10XXXXXX)
 */
export function generateDynamicUid(prefix = DEFAULT_BITEL_CONFIG.uidPrefix) {
  // Generar 6 números aleatorios (000000-999999)
  const randomPart = Math.floor(Math.random() * 1000000); // 0-999999
  
  // Formatear con padding para asegurar 6 dígitos
  const paddedRandom = randomPart.toString().padStart(6, '0');
  
  // Combinar prefijo + 6 números aleatorios = 8 dígitos total
  return `${prefix}${paddedRandom}`;
}

/**
 * Construye la URL final con el UID generado
 * @param {string} originalUrl - URL original
 * @param {string} uid - UID generado
 * @returns {string} URL final con parámetro uid
 */
export function buildUrlWithUid(originalUrl, uid) {
  if (!originalUrl || !uid) {
    throw new Error('URL original y UID son requeridos');
  }

  // Verificar si la URL ya tiene parámetro uid
  if (originalUrl.includes('?uid=')) {
    // Reemplazar el valor existente
    return originalUrl.replace(/\?uid=[^&]*/, `?uid=${uid}`);
  } else if (originalUrl.includes('?')) {
    // Agregar uid como parámetro adicional
    return `${originalUrl}&uid=${uid}`;
  } else {
    // Agregar uid como primer parámetro
    return `${originalUrl}?uid=${uid}`;
  }
}

/**
 * Verifica si un UID necesita ser regenerado basado en el tiempo de cache
 * @param {number} lastGenerationTime - Timestamp de la última generación
 * @param {number} cacheExpiry - Tiempo de expiración en milisegundos
 * @returns {boolean} True si necesita regeneración
 */
export function needsUidRegeneration(lastGenerationTime, cacheExpiry = DEFAULT_BITEL_CONFIG.cacheExpiry) {
  const now = Date.now();
  return (now - lastGenerationTime) > cacheExpiry;
}

/**
 * Genera estadísticas del cache de UIDs
 * @param {Map} uidCache - Cache de UIDs
 * @param {Map} lastGenerationTime - Timestamps de generación
 * @param {Object} stats - Estadísticas adicionales
 * @returns {Object} Estadísticas completas
 */
export function generateCacheStats(uidCache, lastGenerationTime, stats = {}) {
  const timestamps = Array.from(lastGenerationTime.values());
  
  return {
    cachedChannels: uidCache.size,
    oldestCacheEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
    newestCacheEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
    errors: stats.errors || 0,
    totalGenerations: stats.totalGenerations || 0
  };
}

/**
 * Limpia el cache de UIDs para un canal específico o todos
 * @param {Map} uidCache - Cache de UIDs
 * @param {Map} lastGenerationTime - Timestamps de generación
 * @param {string|null} channelId - ID del canal específico o null para todos
 * @returns {Object} Resultado de la operación
 */
export function clearUidCache(uidCache, lastGenerationTime, channelId = null) {
  if (channelId) {
    const hadChannel = uidCache.has(channelId);
    uidCache.delete(channelId);
    lastGenerationTime.delete(channelId);
    
    return {
      success: true,
      action: 'single_channel',
      channelId,
      wasPresent: hadChannel
    };
  } else {
    const channelCount = uidCache.size;
    uidCache.clear();
    lastGenerationTime.clear();
    
    return {
      success: true,
      action: 'all_channels',
      clearedCount: channelCount
    };
  }
}

/**
 * Valida la configuración del servicio BITEL
 * @param {Object} config - Configuración a validar
 * @returns {Object} Configuración validada y normalizada
 */
export function validateBitelConfig(config = {}) {
  const validatedConfig = { ...DEFAULT_BITEL_CONFIG };
  
  // Validar y asignar cacheExpiry
  if (config.cacheExpiry !== undefined) {
    if (typeof config.cacheExpiry === 'number' && config.cacheExpiry > 0) {
      validatedConfig.cacheExpiry = config.cacheExpiry;
    } else {
      throw new Error('cacheExpiry debe ser un número positivo');
    }
  }
  
  // Validar y asignar uidPrefix
  if (config.uidPrefix !== undefined) {
    if (typeof config.uidPrefix === 'string' && config.uidPrefix.length > 0) {
      validatedConfig.uidPrefix = config.uidPrefix;
    } else {
      throw new Error('uidPrefix debe ser una cadena no vacía');
    }
  }
  
  // Validar y asignar domain
  if (config.domain !== undefined) {
    if (typeof config.domain === 'string' && config.domain.length > 0) {
      validatedConfig.domain = config.domain;
    } else {
      throw new Error('domain debe ser una cadena no vacía');
    }
  }
  
  return validatedConfig;
}

/**
 * Procesa una URL de canal y determina si necesita UID
 * @param {string} streamUrl - URL original del stream
 * @param {string} channelId - ID del canal para cache
 * @param {Map} uidCache - Cache de UIDs
 * @param {Map} lastGenerationTime - Timestamps de generación
 * @param {Object} config - Configuración del servicio
 * @returns {Object} Resultado del procesamiento
 */
export function processChannelUrl(streamUrl, channelId, uidCache, lastGenerationTime, config = DEFAULT_BITEL_CONFIG) {
  // Verificar si es canal BITEL
  if (!isBitelChannel(streamUrl, config.domain)) {
    return {
      processed: false,
      url: streamUrl,
      reason: 'not_bitel_channel'
    };
  }
  
  try {
    // Verificar si necesita regenerar UID
    const lastGeneration = lastGenerationTime.get(channelId) || 0;
    let uid;
    let regenerated = false;
    
    if (needsUidRegeneration(lastGeneration, config.cacheExpiry)) {
      uid = generateDynamicUid(config.uidPrefix);
      uidCache.set(channelId, uid);
      lastGenerationTime.set(channelId, Date.now());
      regenerated = true;
    } else {
      uid = uidCache.get(channelId) || generateDynamicUid(config.uidPrefix);
      if (!uidCache.has(channelId)) {
        uidCache.set(channelId, uid);
        lastGenerationTime.set(channelId, Date.now());
        regenerated = true;
      }
    }
    
    const processedUrl = buildUrlWithUid(streamUrl, uid);
    
    return {
      processed: true,
      url: processedUrl,
      uid,
      regenerated,
      channelId
    };
  } catch (error) {
    return {
      processed: false,
      url: streamUrl,
      error: error.message,
      reason: 'processing_error'
    };
  }
}

/**
 * Incrementa contadores de estadísticas
 * @param {Object} stats - Objeto de estadísticas
 * @param {string} counter - Nombre del contador
 * @param {number} increment - Cantidad a incrementar
 * @returns {Object} Estadísticas actualizadas
 */
export function incrementStats(stats, counter, increment = 1) {
  const updatedStats = { ...stats };
  updatedStats[counter] = (updatedStats[counter] || 0) + increment;
  return updatedStats;
}

/**
 * Crea un mensaje de log para operaciones de UID
 * @param {string} operation - Tipo de operación
 * @param {string} channelId - ID del canal
 * @param {string} uid - UID generado
 * @param {Object} metadata - Metadatos adicionales
 * @returns {string} Mensaje formateado
 */
export function createUidLogMessage(operation, channelId, uid, metadata = {}) {
  const baseMessage = `${operation} UID para ${channelId}: ${uid}`;
  
  if (Object.keys(metadata).length > 0) {
    const metadataStr = Object.entries(metadata)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    return `${baseMessage} (${metadataStr})`;
  }
  
  return baseMessage;
}