/**
 * @fileoverview Enhanced Logger Service para el addon de TV
 * Servicio principal que orquesta el logging usando herramientas auxiliares
 * 
 * Flujo de datos:
 * 1. Recibe configuración y la valida usando tools
 * 2. Procesa mensajes de log usando formatters de tools
 * 3. Valida niveles de log usando validators de tools
 * 4. Delega operaciones auxiliares a EnhancedLoggerService_tools
 * 
 * Arquitectura:
 * - Lógica principal: validación de servicios y orquestación
 * - Herramientas: funciones puras en _tools.js
 * - Dependency Injection: inyección de herramientas para testing
 */

import {
  getSourceInfo,
  formatMessage,
  isLevelEnabled,
  createChildLoggerMethods,
  validateConfig,
  createPerformanceMessage,
  createRequestMessage,
  updateConfig,
  LOG_LEVELS,
  DEFAULT_CONFIG
} from './EnhancedLoggerService_tools.js';

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
  #tools;

  /**
   * Constructor con dependency injection para herramientas
   * @param {Object} config - Configuración del logger
   * @param {string} config.logLevel - Nivel de logging (debug, info, warn, error)
   * @param {boolean} config.enableRequestLogging - Habilitar logging de requests
   * @param {boolean} config.enablePerformanceMetrics - Habilitar métricas de rendimiento
   * @param {string} config.logFilePath - Ruta del archivo de logs
   * @param {Object} tools - Herramientas inyectadas (para testing)
   */
  constructor(config = {}, tools = null) {
    // Inyección de dependencias para herramientas
    this.#tools = tools || {
      getSourceInfo,
      formatMessage,
      isLevelEnabled,
      createChildLoggerMethods,
      validateConfig,
      createPerformanceMessage,
      createRequestMessage,
      updateConfig,
      LOG_LEVELS,
      DEFAULT_CONFIG
    };
    
    // Validación de configuración usando herramientas
    this.#config = this.#tools.validateConfig(config);
    this.#logLevel = this.#config.logLevel;
    this.#enableRequestLogging = this.#config.enableRequestLogging;
    this.#enablePerformanceMetrics = this.#config.enablePerformanceMetrics;
    this.#logFilePath = this.#config.logFilePath;
  }

  /**
   * Obtiene información del archivo fuente usando herramientas
   * @private
   * @returns {Object} Información del archivo fuente
   */
  #getSourceInfo() {
    const stack = new Error().stack;
    return this.#tools.getSourceInfo(stack);
  }

  /**
   * Formatea el mensaje de log usando herramientas
   * @private
   * @param {string} level - Nivel del log
   * @param {string} message - Mensaje del log
   * @returns {string} Mensaje formateado
   */
  #formatMessage(level, message) {
    const sourceInfo = this.#getSourceInfo();
    return this.#tools.formatMessage(level, message, sourceInfo);
  }

  /**
   * Verifica si el nivel de log está habilitado usando herramientas
   * @private
   * @param {string} level - Nivel a verificar
   * @returns {boolean} True si está habilitado
   */
  #isLevelEnabled(level) {
    return this.#tools.isLevelEnabled(level, this.#logLevel);
  }

  /**
   * Registra un mensaje de información
   * @param {string} message - Mensaje a registrar
   * @param {...any} args - Argumentos adicionales
   */
  info(message, ...args) {
    if (this.#isLevelEnabled('info')) {
      const formattedMessage = this.#formatMessage('INFO', message);
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
      const formattedMessage = this.#formatMessage('WARN', message);
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
      const formattedMessage = this.#formatMessage('ERROR', message);
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
      const formattedMessage = this.#formatMessage('DEBUG', message);
      console.log(formattedMessage, ...args);
    }
  }

  /**
   * Registra métricas de rendimiento si están habilitadas usando herramientas
   * @param {string} operation - Nombre de la operación
   * @param {number} duration - Duración en milisegundos
   * @param {Object} metadata - Metadatos adicionales
   */
  performance(operation, duration, metadata = {}) {
    if (this.#enablePerformanceMetrics) {
      const message = this.#tools.createPerformanceMessage(operation, duration);
      const formattedMessage = this.#formatMessage('PERF', message);
      console.log(formattedMessage, metadata);
    }
  }

  /**
   * Registra información de requests HTTP si está habilitado usando herramientas
   * @param {string} method - Método HTTP
   * @param {string} url - URL del request
   * @param {number} statusCode - Código de estado
   * @param {number} duration - Duración en milisegundos
   */
  request(method, url, statusCode, duration) {
    if (this.#enableRequestLogging) {
      const message = this.#tools.createRequestMessage(method, url, statusCode, duration);
      const formattedMessage = this.#formatMessage('REQ', message);
      console.log(formattedMessage);
    }
  }

  /**
   * Crea un logger hijo con contexto específico usando herramientas
   * @param {string} context - Contexto del logger hijo
   * @returns {Object} Logger hijo con contexto
   */
  createChildLogger(context) {
    const parentMethods = {
      info: this.info.bind(this),
      warn: this.warn.bind(this),
      error: this.error.bind(this),
      debug: this.debug.bind(this),
      performance: this.performance.bind(this),
      request: this.request.bind(this)
    };
    
    return this.#tools.createChildLoggerMethods(context, parentMethods);
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
   * Actualiza la configuración del logger usando herramientas
   * @param {Object} newConfig - Nueva configuración
   */
  updateConfig(newConfig) {
    const updatedConfig = this.#tools.updateConfig(this.#config, newConfig);
    this.#config = updatedConfig;
    this.#logLevel = updatedConfig.logLevel;
    this.#enableRequestLogging = updatedConfig.enableRequestLogging;
    this.#enablePerformanceMetrics = updatedConfig.enablePerformanceMetrics;
    this.#logFilePath = updatedConfig.logFilePath;
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