/**
 * @fileoverview Manejo centralizado de errores para el addon
 * Implementa patrones robustos de manejo de errores
 */

/**
 * Tipos de errores personalizados
 */
export class AddonError extends Error {
  constructor(message, code = 'ADDON_ERROR', statusCode = 500) {
    super(message);
    this.name = 'AddonError';
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
  }
}

export class ConfigurationError extends AddonError {
  constructor(message, field = null) {
    super(message, 'CONFIGURATION_ERROR', 500);
    this.name = 'ConfigurationError';
    this.field = field;
  }
}

export class StreamError extends AddonError {
  constructor(message, streamId = null) {
    super(message, 'STREAM_ERROR', 404);
    this.name = 'StreamError';
    this.streamId = streamId;
  }
}

export class ValidationError extends AddonError {
  constructor(message, validationErrors = []) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
  }
}

/**
 * Clase responsable del manejo centralizado de errores
 */
export class ErrorHandler {
  #logger;
  #config;
  #errorStats;

  constructor(logger, config) {
    this.#logger = logger;
    this.#config = config;
    this.#errorStats = new Map();
    this.#setupGlobalHandlers();
  }

  /**
   * Configura manejadores globales de errores
   * @private
   */
  #setupGlobalHandlers() {
    // Manejar promesas rechazadas no capturadas
    process.on('unhandledRejection', (reason, promise) => {
      this.handleUnhandledRejection(reason, promise);
    });

    // Manejar excepciones no capturadas
    process.on('uncaughtException', (error) => {
      this.handleUncaughtException(error);
    });

    // Manejar señales de terminación
    process.on('SIGTERM', () => this.handleGracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.handleGracefulShutdown('SIGINT'));
  }

  /**
   * Maneja errores de promesas no capturadas
   * @param {*} reason - Razón del rechazo
   * @param {Promise} promise - Promesa rechazada
   */
  handleUnhandledRejection(reason, promise) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    
    this.#logger.error('Promesa rechazada no manejada:', {
      error: error.message,
      stack: error.stack,
      promise: promise.toString()
    });

    this.#trackError('unhandledRejection', error);

    // En producción, no terminar el proceso inmediatamente
    if (this.#config.isProduction()) {
      this.#logger.warn('Continuando ejecución en producción después de promesa rechazada');
    } else {
      this.#logger.error('Terminando proceso debido a promesa rechazada en desarrollo');
      process.exit(1);
    }
  }

  /**
   * Maneja excepciones no capturadas
   * @param {Error} error - Error no capturado
   */
  handleUncaughtException(error) {
    this.#logger.error('Excepción no capturada:', {
      error: error.message,
      stack: error.stack,
      type: error.constructor.name
    });

    this.#trackError('uncaughtException', error);

    // Intentar cerrar gracefully
    this.#logger.error('Terminando proceso debido a excepción no capturada');
    process.exit(1);
  }

  /**
   * Maneja cierre graceful del proceso
   * @param {string} signal - Señal recibida
   */
  handleGracefulShutdown(signal) {
    this.#logger.info(`Señal ${signal} recibida. Cerrando addon...`);
    
    // Dar tiempo para que las operaciones en curso terminen
    setTimeout(() => {
      this.#logger.info('Addon cerrado correctamente');
      process.exit(0);
    }, 5000);
  }

  /**
   * Maneja errores de operaciones asíncronas
   * @param {Error} error - Error a manejar
   * @param {string} context - Contexto donde ocurrió el error
   * @param {Object} metadata - Metadatos adicionales
   * @returns {Object} Respuesta de error formateada
   */
  handleAsyncError(error, context = 'unknown', metadata = {}) {
    const errorInfo = this.#formatError(error, context, metadata);
    
    this.#logger.error(`Error en ${context}:`, errorInfo);
    this.#trackError(context, error);

    return this.#createErrorResponse(error, context);
  }

  /**
   * Maneja errores de validación
   * @param {ValidationError} error - Error de validación
   * @returns {Object} Respuesta de error de validación
   */
  handleValidationError(error) {
    this.#logger.warn('Error de validación:', {
      message: error.message,
      validationErrors: error.validationErrors,
      timestamp: error.timestamp
    });

    return {
      error: 'Validation Error',
      message: error.message,
      details: error.validationErrors,
      code: error.code,
      timestamp: error.timestamp
    };
  }

  /**
   * Maneja errores de configuración
   * @param {ConfigurationError} error - Error de configuración
   * @returns {Object} Respuesta de error de configuración
   */
  handleConfigurationError(error) {
    this.#logger.error('Error de configuración:', {
      message: error.message,
      field: error.field,
      timestamp: error.timestamp
    });

    return {
      error: 'Configuration Error',
      message: error.message,
      field: error.field,
      code: error.code,
      timestamp: error.timestamp
    };
  }

  /**
   * Obtiene estadísticas de errores
   * @returns {Object} Estadísticas de errores
   */
  getErrorStats() {
    const stats = {};
    for (const [context, count] of this.#errorStats.entries()) {
      stats[context] = count;
    }
    return stats;
  }

  /**
   * Formatea información del error
   * @private
   * @param {Error} error - Error a formatear
   * @param {string} context - Contexto del error
   * @param {Object} metadata - Metadatos adicionales
   * @returns {Object} Información formateada del error
   */
  #formatError(error, context, metadata) {
    return {
      message: error.message,
      name: error.name,
      code: error.code || 'UNKNOWN_ERROR',
      stack: this.#config.isDevelopment() ? error.stack : undefined,
      context,
      metadata,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Crea respuesta de error estandarizada
   * @private
   * @param {Error} error - Error original
   * @param {string} context - Contexto del error
   * @returns {Object} Respuesta de error
   */
  #createErrorResponse(error, context) {
    const isAddonError = error instanceof AddonError;
    
    return {
      error: isAddonError ? error.name : 'Internal Server Error',
      message: isAddonError ? error.message : 'Ha ocurrido un error interno',
      code: error.code || 'INTERNAL_ERROR',
      context,
      timestamp: new Date().toISOString(),
      ...(this.#config.isDevelopment() && { stack: error.stack })
    };
  }

  /**
   * Rastrea estadísticas de errores
   * @private
   * @param {string} context - Contexto del error
   * @param {Error} error - Error ocurrido
   */
  #trackError(context, error) {
    const key = `${context}:${error.name || 'Unknown'}`;
    const current = this.#errorStats.get(key) || 0;
    this.#errorStats.set(key, current + 1);
  }
}