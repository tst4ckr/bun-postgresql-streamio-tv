/**
 * @fileoverview Herramientas auxiliares para EnhancedLoggerService
 * Contiene funciones puras y utilitarias para el procesamiento de logs
 * 
 * Flujo de datos:
 * 1. getSourceInfo() -> extrae información del stack trace
 * 2. formatMessage() -> formatea mensaje con timestamp y fuente
 * 3. isLevelEnabled() -> valida si el nivel de log está habilitado
 * 4. createChildLoggerMethods() -> genera métodos para logger hijo
 * 5. validateConfig() -> valida configuración del logger
 */

/**
 * Niveles de logging disponibles con sus valores numéricos
 * @constant {Object}
 */
export const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * Configuración por defecto del logger
 * @constant {Object}
 */
export const DEFAULT_CONFIG = {
  logLevel: 'info',
  enableRequestLogging: false,
  enablePerformanceMetrics: false,
  logFilePath: 'logs/addon.log'
};

/**
 * Extrae información del archivo fuente y línea desde el stack trace
 * Función pura que analiza el stack trace para obtener contexto del log
 * 
 * @param {string} stack - Stack trace completo
 * @param {string} excludeFileName - Nombre del archivo a excluir del análisis
 * @returns {Object} Información del archivo fuente
 * @returns {string} returns.fileName - Nombre del archivo
 * @returns {number} returns.lineNumber - Número de línea
 * @returns {string} returns.fullPath - Ruta completa del archivo
 */
export function getSourceInfo(stack, excludeFileName = 'EnhancedLoggerService.js') {
  if (!stack || typeof stack !== 'string') {
    return {
      fileName: 'unknown',
      lineNumber: 0,
      fullPath: 'unknown'
    };
  }

  const stackLines = stack.split('\n');
  
  // Buscar la línea que no sea del logger (saltamos las primeras líneas internas)
  for (let i = 3; i < stackLines.length; i++) {
    const line = stackLines[i];
    if (line && !line.includes(excludeFileName)) {
      const match = line.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/) || 
                   line.match(/at\s+(.*):(\d+):(\d+)/);
      
      if (match) {
        const filePath = match[2] || match[1];
        const lineNumber = match[3] || match[2];
        const fileName = filePath ? filePath.split(/[\\/]/).pop() : 'unknown';
        
        return {
          fileName,
          lineNumber: parseInt(lineNumber) || 0,
          fullPath: filePath || 'unknown'
        };
      }
    }
  }
  
  return {
    fileName: 'unknown',
    lineNumber: 0,
    fullPath: 'unknown'
  };
}

/**
 * Formatea un mensaje de log con timestamp y información de fuente
 * Función pura que genera el formato estándar de mensajes
 * 
 * @param {string} level - Nivel del log (INFO, WARN, ERROR, DEBUG, etc.)
 * @param {string} message - Mensaje original del log
 * @param {Object} sourceInfo - Información del archivo fuente
 * @param {Date} [timestamp] - Timestamp personalizado (opcional)
 * @returns {string} Mensaje formateado
 */
export function formatMessage(level, message, sourceInfo, timestamp = new Date()) {
  if (!level || !message || !sourceInfo) {
    throw new Error('formatMessage requiere level, message y sourceInfo');
  }

  const isoTimestamp = timestamp.toISOString();
  const source = `${sourceInfo.fileName}:${sourceInfo.lineNumber}`;
  return `[${level}] ${isoTimestamp} [${source}] - ${message}`;
}

/**
 * Verifica si un nivel de log específico está habilitado
 * Función pura que compara niveles de logging
 * 
 * @param {string} messageLevel - Nivel del mensaje a verificar
 * @param {string} currentLogLevel - Nivel actual configurado
 * @returns {boolean} True si el nivel está habilitado
 */
export function isLevelEnabled(messageLevel, currentLogLevel) {
  if (!messageLevel || !currentLogLevel) {
    return false;
  }

  const currentLevel = LOG_LEVELS[currentLogLevel] ?? LOG_LEVELS.info;
  const checkLevel = LOG_LEVELS[messageLevel] ?? LOG_LEVELS.info;
  
  return checkLevel >= currentLevel;
}

/**
 * Crea los métodos para un logger hijo con contexto específico
 * Función pura que genera métodos de logging con contexto
 * 
 * @param {string} context - Contexto del logger hijo
 * @param {Object} parentMethods - Métodos del logger padre
 * @returns {Object} Métodos del logger hijo
 */
export function createChildLoggerMethods(context, parentMethods) {
  if (!context || !parentMethods) {
    throw new Error('createChildLoggerMethods requiere context y parentMethods');
  }

  return {
    info: (message, ...args) => parentMethods.info(`[${context}] ${message}`, ...args),
    warn: (message, ...args) => parentMethods.warn(`[${context}] ${message}`, ...args),
    error: (message, ...args) => parentMethods.error(`[${context}] ${message}`, ...args),
    debug: (message, ...args) => parentMethods.debug(`[${context}] ${message}`, ...args),
    performance: (operation, duration, metadata) => 
      parentMethods.performance(`[${context}] ${operation}`, duration, metadata),
    request: (method, url, statusCode, duration) => 
      parentMethods.request(method, url, statusCode, duration)
  };
}

/**
 * Valida y normaliza la configuración del logger
 * Función pura que asegura configuración válida
 * 
 * @param {Object} config - Configuración a validar
 * @returns {Object} Configuración validada y normalizada
 */
export function validateConfig(config = {}) {
  const validatedConfig = { ...DEFAULT_CONFIG };

  // Validar logLevel
  if (config.logLevel && LOG_LEVELS.hasOwnProperty(config.logLevel)) {
    validatedConfig.logLevel = config.logLevel;
  }

  // Validar flags booleanos
  if (typeof config.enableRequestLogging === 'boolean') {
    validatedConfig.enableRequestLogging = config.enableRequestLogging;
  }

  if (typeof config.enablePerformanceMetrics === 'boolean') {
    validatedConfig.enablePerformanceMetrics = config.enablePerformanceMetrics;
  }

  // Validar logFilePath
  if (config.logFilePath && typeof config.logFilePath === 'string') {
    validatedConfig.logFilePath = config.logFilePath;
  }

  return validatedConfig;
}

/**
 * Crea un mensaje de performance formateado
 * Función pura para formatear métricas de rendimiento
 * 
 * @param {string} operation - Nombre de la operación
 * @param {number} duration - Duración en milisegundos
 * @returns {string} Mensaje de performance formateado
 */
export function createPerformanceMessage(operation, duration) {
  if (!operation || typeof duration !== 'number') {
    throw new Error('createPerformanceMessage requiere operation y duration válidos');
  }

  return `Performance: ${operation} completed in ${duration}ms`;
}

/**
 * Crea un mensaje de request HTTP formateado
 * Función pura para formatear información de requests
 * 
 * @param {string} method - Método HTTP
 * @param {string} url - URL del request
 * @param {number} statusCode - Código de estado HTTP
 * @param {number} duration - Duración en milisegundos
 * @returns {string} Mensaje de request formateado
 */
export function createRequestMessage(method, url, statusCode, duration) {
  if (!method || !url || typeof statusCode !== 'number' || typeof duration !== 'number') {
    throw new Error('createRequestMessage requiere todos los parámetros válidos');
  }

  return `${method} ${url} ${statusCode} - ${duration}ms`;
}

/**
 * Actualiza configuración existente con nuevos valores
 * Función pura que merge configuraciones de forma segura
 * 
 * @param {Object} currentConfig - Configuración actual
 * @param {Object} newConfig - Nueva configuración
 * @returns {Object} Configuración actualizada
 */
export function updateConfig(currentConfig, newConfig) {
  if (!currentConfig || !newConfig) {
    return currentConfig || {};
  }

  const updatedConfig = { ...currentConfig };

  if (newConfig.logLevel && LOG_LEVELS.hasOwnProperty(newConfig.logLevel)) {
    updatedConfig.logLevel = newConfig.logLevel;
  }

  if (typeof newConfig.enableRequestLogging === 'boolean') {
    updatedConfig.enableRequestLogging = newConfig.enableRequestLogging;
  }

  if (typeof newConfig.enablePerformanceMetrics === 'boolean') {
    updatedConfig.enablePerformanceMetrics = newConfig.enablePerformanceMetrics;
  }

  if (newConfig.logFilePath && typeof newConfig.logFilePath === 'string') {
    updatedConfig.logFilePath = newConfig.logFilePath;
  }

  return updatedConfig;
}