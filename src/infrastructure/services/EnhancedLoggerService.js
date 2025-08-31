/**
 * @fileoverview Servicio de logging mejorado con información de archivo fuente y línea
 * Proporciona trazabilidad completa de los registros del sistema
 */

/**
 * Servicio de logging mejorado que incluye información del archivo fuente y número de línea
 * Aplica principio de responsabilidad única para el manejo centralizado de logs
 */
export class EnhancedLoggerService {
  #config;
  #logLevel;
  #enableRequestLogging;
  #enablePerformanceMetrics;
  #logFilePath;

  /**
   * @param {Object} config - Configuración del logger
   * @param {string} config.logLevel - Nivel de logging (debug, info, warn, error)
   * @param {boolean} config.enableRequestLogging - Habilitar logging de requests
   * @param {boolean} config.enablePerformanceMetrics - Habilitar métricas de rendimiento
   * @param {string} config.logFilePath - Ruta del archivo de logs
   */
  constructor(config = {}) {
    this.#config = config;
    this.#logLevel = config.logLevel || 'info';
    this.#enableRequestLogging = config.enableRequestLogging || false;
    this.#enablePerformanceMetrics = config.enablePerformanceMetrics || false;
    this.#logFilePath = config.logFilePath || 'logs/addon.log';
  }

  /**
   * Obtiene información del archivo fuente y línea donde se ejecuta el log
   * @private
   * @returns {Object} Información del archivo fuente
   */
  #getSourceInfo() {
    const stack = new Error().stack;
    const stackLines = stack.split('\n');
    
    // Buscar la línea que no sea del logger (saltamos las primeras líneas internas)
    for (let i = 3; i < stackLines.length; i++) {
      const line = stackLines[i];
      if (line && !line.includes('EnhancedLoggerService.js')) {
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
   * Formatea el mensaje de log con información del archivo fuente
   * @private
   * @param {string} level - Nivel del log
   * @param {string} message - Mensaje del log
   * @param {Object} sourceInfo - Información del archivo fuente
   * @returns {string} Mensaje formateado
   */
  #formatMessage(level, message, sourceInfo) {
    const timestamp = new Date().toISOString();
    const source = `${sourceInfo.fileName}:${sourceInfo.lineNumber}`;
    return `[${level}] ${timestamp} [${source}] - ${message}`;
  }

  /**
   * Verifica si el nivel de log está habilitado
   * @private
   * @param {string} level - Nivel a verificar
   * @returns {boolean} True si está habilitado
   */
  #isLevelEnabled(level) {
    const levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    
    const currentLevel = levels[this.#logLevel] || 1;
    const messageLevel = levels[level] || 1;
    
    return messageLevel >= currentLevel;
  }

  /**
   * Registra un mensaje de información
   * @param {string} message - Mensaje a registrar
   * @param {...any} args - Argumentos adicionales
   */
  info(message, ...args) {
    if (this.#isLevelEnabled('info')) {
      const sourceInfo = this.#getSourceInfo();
      const formattedMessage = this.#formatMessage('INFO', message, sourceInfo);
      console.log(formattedMessage, ...args);
    }
  }

  /**
   * Registra un mensaje de advertencia
   * @param {string} message - Mensaje a registrar
   * @param {...any} args - Argumentos adicionales
   */
  warn(message, ...args) {
    if (this.#isLevelEnabled('warn')) {
      const sourceInfo = this.#getSourceInfo();
      const formattedMessage = this.#formatMessage('WARN', message, sourceInfo);
      console.warn(formattedMessage, ...args);
    }
  }

  /**
   * Registra un mensaje de error
   * @param {string} message - Mensaje a registrar
   * @param {...any} args - Argumentos adicionales
   */
  error(message, ...args) {
    if (this.#isLevelEnabled('error')) {
      const sourceInfo = this.#getSourceInfo();
      const formattedMessage = this.#formatMessage('ERROR', message, sourceInfo);
      console.error(formattedMessage, ...args);
    }
  }

  /**
   * Registra un mensaje de debug
   * @param {string} message - Mensaje a registrar
   * @param {...any} args - Argumentos adicionales
   */
  debug(message, ...args) {
    if (this.#isLevelEnabled('debug')) {
      const sourceInfo = this.#getSourceInfo();
      const formattedMessage = this.#formatMessage('DEBUG', message, sourceInfo);
      console.log(formattedMessage, ...args);
    }
  }

  /**
   * Registra métricas de rendimiento si están habilitadas
   * @param {string} operation - Nombre de la operación
   * @param {number} duration - Duración en milisegundos
   * @param {Object} metadata - Metadatos adicionales
   */
  performance(operation, duration, metadata = {}) {
    if (this.#enablePerformanceMetrics) {
      const sourceInfo = this.#getSourceInfo();
      const message = `Performance: ${operation} completed in ${duration}ms`;
      const formattedMessage = this.#formatMessage('PERF', message, sourceInfo);
      console.log(formattedMessage, metadata);
    }
  }

  /**
   * Registra información de requests HTTP si está habilitado
   * @param {string} method - Método HTTP
   * @param {string} url - URL del request
   * @param {number} statusCode - Código de estado
   * @param {number} duration - Duración en milisegundos
   */
  request(method, url, statusCode, duration) {
    if (this.#enableRequestLogging) {
      const sourceInfo = this.#getSourceInfo();
      const message = `${method} ${url} ${statusCode} - ${duration}ms`;
      const formattedMessage = this.#formatMessage('REQ', message, sourceInfo);
      console.log(formattedMessage);
    }
  }

  /**
   * Crea un logger hijo con contexto específico
   * @param {string} context - Contexto del logger hijo
   * @returns {Object} Logger hijo con contexto
   */
  createChildLogger(context) {
    return {
      info: (message, ...args) => this.info(`[${context}] ${message}`, ...args),
      warn: (message, ...args) => this.warn(`[${context}] ${message}`, ...args),
      error: (message, ...args) => this.error(`[${context}] ${message}`, ...args),
      debug: (message, ...args) => this.debug(`[${context}] ${message}`, ...args),
      performance: (operation, duration, metadata) => this.performance(`[${context}] ${operation}`, duration, metadata),
      request: (method, url, statusCode, duration) => this.request(method, url, statusCode, duration)
    };
  }

  /**
   * Obtiene la configuración actual del logger
   * @returns {Object} Configuración del logger
   */
  getConfig() {
    return {
      logLevel: this.#logLevel,
      enableRequestLogging: this.#enableRequestLogging,
      enablePerformanceMetrics: this.#enablePerformanceMetrics,
      logFilePath: this.#logFilePath
    };
  }

  /**
   * Actualiza la configuración del logger
   * @param {Object} newConfig - Nueva configuración
   */
  updateConfig(newConfig) {
    if (newConfig.logLevel) this.#logLevel = newConfig.logLevel;
    if (typeof newConfig.enableRequestLogging === 'boolean') {
      this.#enableRequestLogging = newConfig.enableRequestLogging;
    }
    if (typeof newConfig.enablePerformanceMetrics === 'boolean') {
      this.#enablePerformanceMetrics = newConfig.enablePerformanceMetrics;
    }
    if (newConfig.logFilePath) this.#logFilePath = newConfig.logFilePath;
  }
}

/**
 * Factory para crear instancias del logger mejorado
 */
export class EnhancedLoggerFactory {
  static #instance = null;

  /**
   * Crea o retorna la instancia singleton del logger
   * @param {Object} config - Configuración del logger
   * @returns {EnhancedLoggerService} Instancia del logger
   */
  static getInstance(config = {}) {
    if (!EnhancedLoggerFactory.#instance) {
      EnhancedLoggerFactory.#instance = new EnhancedLoggerService(config);
    }
    return EnhancedLoggerFactory.#instance;
  }

  /**
   * Reinicia la instancia del logger con nueva configuración
   * @param {Object} config - Nueva configuración
   * @returns {EnhancedLoggerService} Nueva instancia del logger
   */
  static resetInstance(config = {}) {
    EnhancedLoggerFactory.#instance = new EnhancedLoggerService(config);
    return EnhancedLoggerFactory.#instance;
  }

  /**
   * Crea un logger simple compatible con el formato anterior
   * @param {Object} config - Configuración del logger
   * @returns {Object} Logger compatible
   */
  static createCompatibleLogger(config = {}) {
    const enhancedLogger = new EnhancedLoggerService(config);
    
    return {
      info: (message, ...args) => enhancedLogger.info(message, ...args),
      warn: (message, ...args) => enhancedLogger.warn(message, ...args),
      error: (message, ...args) => enhancedLogger.error(message, ...args),
      debug: (message, ...args) => enhancedLogger.debug(message, ...args)
    };
  }
}