/**
 * @fileoverview StreamValidationService_tools - Herramientas de utilidad para StreamValidationService
 * Contiene funciones auxiliares extraídas para mejorar la organización del código
 */

/**
 * Obtiene resultado del cache de validación
 * @param {Map} validationCache - Cache de validación
 * @param {string} key - Clave del cache
 * @param {number} timeout - Timeout del cache en ms
 * @returns {Object|null} Resultado del cache o null si no existe o expiró
 */
export function getCachedResult(validationCache, key, timeout) {
  const cached = validationCache.get(key);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > timeout) {
    validationCache.delete(key);
    return null;
  }

  return cached.result;
}