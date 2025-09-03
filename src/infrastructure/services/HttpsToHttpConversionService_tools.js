/**
 * @fileoverview HttpsToHttpConversionService Tools - Herramientas auxiliares para conversión HTTPS a HTTP
 * 
 * Flujo de datos:
 * 1. URL Input → convertToHttp() → URL HTTP convertida
 * 2. Config + URL → validateConversionEnabled() → Boolean habilitación
 * 3. Stats Object → updateProcessingStats() → Stats actualizadas
 * 4. Progress Data → formatProgressMessage() → Mensaje formateado
 * 5. Concurrency Config → calculateOptimalConcurrency() → Límite optimizado
 * 6. Results Array → filterWorkingChannels() → Canales funcionales
 * 7. Batch Config → calculateBatchDelay() → Delay entre lotes
 */

/**
 * Convierte una URL de HTTPS a HTTP
 * Función pura que transforma URLs HTTPS a HTTP sin efectos secundarios
 * 
 * @param {string} url - URL original a convertir
 * @returns {string} URL convertida a HTTP o la URL original si no es HTTPS
 * 
 * @example
 * convertToHttp('https://example.com/stream') // 'http://example.com/stream'
 * convertToHttp('http://example.com/stream')  // 'http://example.com/stream'
 * convertToHttp('')                          // ''
 * convertToHttp(null)                       // null
 */
export function convertToHttp(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  // Solo convertir si la URL es HTTPS
  if (url.startsWith('https://')) {
    return url.replace('https://', 'http://');
  }

  return url;
}

/**
 * Verifica si la conversión HTTPS a HTTP está habilitada en la configuración
 * Función pura que evalúa la configuración de validación
 * 
 * @param {Object} config - Objeto de configuración
 * @returns {boolean} true si la conversión está habilitada
 * 
 * @example
 * validateConversionEnabled({ validation: { convertHttpsToHttp: true } })  // true
 * validateConversionEnabled({ validation: { convertHttpsToHttp: false } }) // false
 * validateConversionEnabled({})                                            // false
 */
export function validateConversionEnabled(config) {
  return config?.validation?.convertHttpsToHttp === true;
}

/**
 * Actualiza las estadísticas de procesamiento con los resultados de un canal
 * Función pura que acumula estadísticas sin mutar el objeto original
 * 
 * @param {Object} currentStats - Estadísticas actuales
 * @param {Object} channelResult - Resultado del procesamiento del canal
 * @returns {Object} Nuevas estadísticas actualizadas
 * 
 * @example
 * const stats = { total: 1, converted: 0, httpWorking: 0, originalWorking: 0, failed: 0 };
 * const result = { converted: true, httpWorks: true, originalWorks: false };
 * updateProcessingStats(stats, result); // { total: 1, converted: 1, httpWorking: 1, originalWorking: 0, failed: 0 }
 */
export function updateProcessingStats(currentStats, channelResult) {
  const newStats = { ...currentStats };
  
  if (channelResult.converted) newStats.converted++;
  if (channelResult.httpWorks) newStats.httpWorking++;
  if (channelResult.originalWorks) newStats.originalWorking++;
  if (!channelResult.httpWorks && !channelResult.originalWorks) newStats.failed++;
  
  return newStats;
}

/**
 * Formatea un mensaje de progreso para el procesamiento de canales
 * Función pura que genera mensajes informativos consistentes
 * 
 * @param {number} completed - Número de canales completados
 * @param {number} total - Total de canales a procesar
 * @param {number} httpWorking - Número de canales con HTTP funcional
 * @returns {string} Mensaje de progreso formateado
 * 
 * @example
 * formatProgressMessage(50, 100, 30); // "📊 Progreso: 50/100 (50.0%) - HTTP funcional: 30 (60.0%)"
 */
export function formatProgressMessage(completed, total, httpWorking) {
  const percentage = ((completed / total) * 100).toFixed(1);
  const httpSuccessRate = httpWorking > 0 ? ((httpWorking / completed) * 100).toFixed(1) : '0.0';
  
  return `📊 Progreso: ${completed}/${total} (${percentage}%) - HTTP funcional: ${httpWorking} (${httpSuccessRate}%)`;
}

/**
 * Calcula la concurrencia óptima basada en la configuración y límites
 * Función pura que determina el número ideal de workers concurrentes
 * 
 * @param {number} requestedConcurrency - Concurrencia solicitada
 * @param {number} maxLimit - Límite máximo permitido (default: 20)
 * @returns {number} Concurrencia optimizada
 * 
 * @example
 * calculateOptimalConcurrency(5, 20);  // 5
 * calculateOptimalConcurrency(25, 20); // 20
 * calculateOptimalConcurrency(0, 20);  // 1
 */
export function calculateOptimalConcurrency(requestedConcurrency, maxLimit = 20) {
  return Math.max(1, Math.min(requestedConcurrency, maxLimit));
}

/**
 * Filtra canales que tienen HTTP funcional de un array de resultados
 * Función pura que extrae solo los canales con HTTP operativo
 * 
 * @param {Array} results - Array de resultados de procesamiento
 * @param {boolean} onlyWorkingHttp - Si filtrar solo HTTP funcionales
 * @returns {Array} Array de canales filtrados
 * 
 * @example
 * const results = [
 *   { channel: 'ch1', httpWorks: true },
 *   { channel: 'ch2', httpWorks: false }
 * ];
 * filterWorkingChannels(results, true);  // ['ch1']
 * filterWorkingChannels(results, false); // ['ch1', 'ch2']
 */
export function filterWorkingChannels(results, onlyWorkingHttp = true) {
  return onlyWorkingHttp
    ? results.filter(r => r.httpWorks).map(r => r.channel)
    : results.map(r => r.channel);
}

/**
 * Calcula el delay apropiado entre lotes basado en el tamaño del lote
 * Función pura que determina pausas optimizadas para el procesamiento por lotes
 * 
 * @param {number} batchSize - Tamaño del lote procesado
 * @param {number} channelsProcessed - Número de canales procesados en el lote
 * @param {number} baseDelay - Delay base en milisegundos (default: 100)
 * @returns {number} Delay calculado en milisegundos
 * 
 * @example
 * calculateBatchDelay(25, 25, 100); // 100 (lote completo)
 * calculateBatchDelay(25, 10, 100); // 0 (lote incompleto, no delay)
 */
export function calculateBatchDelay(batchSize, channelsProcessed, baseDelay = 100) {
  return channelsProcessed === batchSize ? baseDelay : 0;
}

/**
 * Crea un objeto de estadísticas inicial para el procesamiento
 * Función pura que genera la estructura base de estadísticas
 * 
 * @param {number} total - Total de elementos a procesar
 * @returns {Object} Objeto de estadísticas inicializado
 * 
 * @example
 * createInitialStats(100); // { total: 100, converted: 0, httpWorking: 0, originalWorking: 0, failed: 0 }
 */
export function createInitialStats(total) {
  return {
    total,
    converted: 0,
    httpWorking: 0,
    originalWorking: 0,
    failed: 0
  };
}

/**
 * Calcula la tasa de éxito HTTP como porcentaje formateado
 * Función pura que genera porcentajes de éxito consistentes
 * 
 * @param {number} httpWorking - Número de URLs HTTP funcionales
 * @param {number} total - Total de URLs procesadas
 * @returns {string} Porcentaje formateado con un decimal
 * 
 * @example
 * calculateSuccessRate(75, 100); // "75.0"
 * calculateSuccessRate(0, 100);  // "0.0"
 * calculateSuccessRate(33, 100); // "33.0"
 */
export function calculateSuccessRate(httpWorking, total) {
  return total > 0 ? ((httpWorking / total) * 100).toFixed(1) : '0.0';
}

export default {
  convertToHttp,
  validateConversionEnabled,
  updateProcessingStats,
  formatProgressMessage,
  calculateOptimalConcurrency,
  filterWorkingChannels,
  calculateBatchDelay,
  createInitialStats,
  calculateSuccessRate
};