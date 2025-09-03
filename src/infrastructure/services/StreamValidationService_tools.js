/**
 * @fileoverview StreamValidationService_tools - Herramientas de utilidad para StreamValidationService
 * Contiene funciones auxiliares extraídas para mejorar la organización del código
 */

/**
 * Obtiene un resultado de validación desde el cache
 * @param {Map} validationCache - Cache de validación
 * @param {string} key - Clave del cache
 * @param {number} cacheTimeout - Tiempo de vida del cache en ms
 * @returns {Object|null} Resultado cacheado o null si no existe/expiró
 */
export function getCachedResult(validationCache, key, cacheTimeout) {
  const cached = validationCache.get(key);
  
  if (cached && (Date.now() - cached.timestamp) < cacheTimeout) {
    return cached.result;
  }
  
  return null;
}

/**
 * Establece un resultado de validación en el cache
 * @param {Map} validationCache - Cache de validación
 * @param {string} key - Clave del cache
 * @param {Object} result - Resultado a guardar
 */
export function setCachedResult(validationCache, key, result) {
  validationCache.set(key, {
    result: {
      isValid: result.isValid,
      meta: result.meta
    },
    timestamp: Date.now()
  });

  // Limpiar cache si es muy grande (mantener últimos 1000)
  if (validationCache.size > 1000) {
    const entries = Array.from(validationCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Eliminar los 200 más antiguos
    for (let i = 0; i < 200; i++) {
      validationCache.delete(entries[i][0]);
    }
  }
}

/**
 * Actualiza estadísticas de validación
 * @param {Object} stats - Objeto de estadísticas a actualizar
 * @param {Object} result - Resultado de validación
 * @param {number} processingTime - Tiempo de procesamiento
 */
export function updateStats(stats, result, processingTime) {
  stats.totalProcessed++;
  
  if (result.isValid) {
    stats.validChannels++;
  } else {
    stats.invalidChannels++;
  }
  
  if (result.converted) {
    stats.httpsConverted++;
  }
  
  if (result.isValid && result.converted) {
    stats.httpWorking++;
  }
}

/**
 * Actualiza el estado de validación del canal de manera segura
 * @param {Object} channel - Canal a actualizar
 * @param {boolean} isValid - Estado de validación
 * @returns {Object} Canal con estado actualizado
 */
export function updateChannelValidationStatus(channel, isValid) {
  // Si el canal tiene el método withValidationStatus, usarlo
  if (typeof channel.withValidationStatus === 'function') {
    return channel.withValidationStatus(isValid);
  }
  
  // Si no tiene el método, crear una nueva instancia con las propiedades actualizadas
  return {
    ...channel,
    validationStatus: isValid ? 'valid' : 'invalid',
    isActive: isValid,
    lastValidated: new Date().toISOString()
  };
}