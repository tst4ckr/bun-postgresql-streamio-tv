import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

/**
 * Servicio avanzado de validación de streams con métricas de rendimiento
 * y análisis de calidad para prevenir buffering y congelamiento
 */
export class AdvancedStreamValidationService extends EventEmitter {
  #config;
  #logger;
  #streamHealthService;
  #httpsToHttpService;
  #validationCache;
  #performanceMetrics;
  #qualityThresholds;

  constructor(config, logger, streamHealthService, httpsToHttpService) {
    super();
    this.#config = config;
    this.#logger = logger;
    this.#streamHealthService = streamHealthService;
    this.#httpsToHttpService = httpsToHttpService;
    this.#validationCache = new Map();
    this.#performanceMetrics = new Map();
    
    // Umbrales de calidad configurables
    this.#qualityThresholds = {
      maxLatency: config.validation?.maxLatency || 3000, // 3 segundos
      minThroughput: config.validation?.minThroughput || 1024, // 1KB/s mínimo
      maxJitter: config.validation?.maxJitter || 500, // 500ms variación máxima
      connectionStability: config.validation?.connectionStability || 0.95, // 95% estabilidad
      responseTimeConsistency: config.validation?.responseTimeConsistency || 0.8, // 80% consistencia
      maxConsecutiveFailures: config.validation?.maxConsecutiveFailures || 2
    };
  }

  /**
   * Validación avanzada con análisis de rendimiento y calidad
   * @param {string} url - URL del stream
   * @param {Object} options - Opciones de validación
   * @returns {Promise<Object>} Resultado detallado de validación
   */
  async validateStreamAdvanced(url, options = {}) {
    const startTime = performance.now();
    const cacheKey = this.#generateCacheKey(url, options);
    
    // Verificar cache con TTL
    const cachedResult = this.#getCachedResult(cacheKey, options.cacheTTL || 300000); // 5 min
    if (cachedResult && !options.forceRefresh) {
      this.#logger.debug(`📋 Cache hit para ${url}`);
      return cachedResult;
    }

    try {
      // Análisis multi-fase
      const validationResult = await this.#performMultiPhaseValidation(url, options);
      
      // Calcular métricas de rendimiento
      const totalTime = performance.now() - startTime;
      validationResult.performance = {
        totalValidationTime: totalTime,
        timestamp: Date.now()
      };

      // Guardar en cache
      this.#setCachedResult(cacheKey, validationResult);
      
      // Actualizar métricas históricas
      this.#updatePerformanceMetrics(url, validationResult);
      
      // Emitir evento para monitoreo
      this.emit('validationCompleted', { url, result: validationResult });
      
      return validationResult;
      
    } catch (error) {
      this.#logger.error(`❌ Error en validación avanzada de ${url}: ${error.message}`);
      const errorResult = {
        isValid: false,
        quality: 'poor',
        confidence: 0,
        error: error.message,
        performance: { totalValidationTime: performance.now() - startTime }
      };
      
      this.emit('validationError', { url, error: errorResult });
      return errorResult;
    }
  }

  /**
   * Validación multi-fase: conectividad, latencia, throughput y estabilidad
   * @private
   */
  async #performMultiPhaseValidation(url, options) {
    const phases = {
      connectivity: null,
      latency: null,
      throughput: null,
      stability: null,
      contentAnalysis: null
    };

    // Fase 1: Conectividad básica
    phases.connectivity = await this.#testConnectivity(url, options);
    if (!phases.connectivity.success) {
      return this.#buildFailureResult('connectivity', phases);
    }

    // Fase 2: Análisis de latencia
    phases.latency = await this.#analyzeLatency(url, options);
    if (phases.latency.averageLatency > this.#qualityThresholds.maxLatency) {
      return this.#buildFailureResult('latency', phases);
    }

    // Fase 3: Análisis de throughput
    phases.throughput = await this.#analyzeThroughput(url, options);
    if (phases.throughput.bytesPerSecond < this.#qualityThresholds.minThroughput) {
      return this.#buildFailureResult('throughput', phases);
    }

    // Fase 4: Análisis de estabilidad
    phases.stability = await this.#analyzeStability(url, options);
    if (phases.stability.stabilityScore < this.#qualityThresholds.connectionStability) {
      return this.#buildFailureResult('stability', phases);
    }

    // Fase 5: Análisis básico de contenido (opcional)
    if (options.analyzeContent) {
      phases.contentAnalysis = await this.#analyzeContent(url, options);
    }

    return this.#buildSuccessResult(phases);
  }

  /**
   * Test de conectividad con múltiples intentos
   * @private
   */
  async #testConnectivity(url, options) {
    const attempts = options.connectivityAttempts || 3;
    const results = [];
    
    for (let i = 0; i < attempts; i++) {
      const startTime = performance.now();
      try {
        const response = await this.#streamHealthService.checkStream(url, {
          method: 'HEAD',
          timeout: options.timeout || 5000,
          maxRetries: 1
        });
        
        const responseTime = performance.now() - startTime;
        results.push({
          success: response.ok,
          responseTime,
          statusCode: response.status,
          attempt: i + 1
        });
        
        if (!response.ok) {
          await this.#delay(options.retryDelay || 1000);
        }
      } catch (error) {
        results.push({
          success: false,
          responseTime: performance.now() - startTime,
          error: error.message,
          attempt: i + 1
        });
        await this.#delay(options.retryDelay || 1000);
      }
    }

    const successfulAttempts = results.filter(r => r.success).length;
    const averageResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    
    return {
      success: successfulAttempts > 0,
      successRate: successfulAttempts / attempts,
      averageResponseTime,
      attempts: results,
      recommendation: successfulAttempts / attempts >= 0.7 ? 'reliable' : 'unstable'
    };
  }

  /**
   * Análisis de latencia con múltiples muestras
   * @private
   */
  async #analyzeLatency(url, options) {
    const samples = options.latencySamples || 5;
    const latencies = [];
    
    for (let i = 0; i < samples; i++) {
      const startTime = performance.now();
      try {
        await this.#streamHealthService.checkStream(url, {
          method: 'HEAD',
          timeout: options.timeout || 3000
        });
        latencies.push(performance.now() - startTime);
      } catch (error) {
        latencies.push(options.timeout || 3000); // Penalizar timeouts
      }
      
      if (i < samples - 1) {
        await this.#delay(options.latencyInterval || 500);
      }
    }

    const averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const jitter = maxLatency - minLatency;
    
    return {
      averageLatency,
      minLatency,
      maxLatency,
      jitter,
      samples: latencies,
      quality: this.#assessLatencyQuality(averageLatency, jitter)
    };
  }

  /**
   * Análisis de throughput con descarga parcial
   * @private
   */
  async #analyzeThroughput(url, options) {
    const downloadSize = options.downloadSize || 8192; // 8KB por defecto
    const startTime = performance.now();
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Range': `bytes=0-${downloadSize - 1}`
        },
        signal: AbortSignal.timeout(options.timeout || 10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      let bytesReceived = 0;
      const chunks = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        bytesReceived += value.length;
        chunks.push(value);
        
        // Limitar descarga
        if (bytesReceived >= downloadSize) {
          reader.cancel();
          break;
        }
      }

      const downloadTime = performance.now() - startTime;
      const bytesPerSecond = (bytesReceived / downloadTime) * 1000;
      
      return {
        bytesReceived,
        downloadTime,
        bytesPerSecond,
        quality: this.#assessThroughputQuality(bytesPerSecond),
        efficiency: bytesReceived / downloadSize
      };
      
    } catch (error) {
      return {
        bytesReceived: 0,
        downloadTime: performance.now() - startTime,
        bytesPerSecond: 0,
        quality: 'poor',
        error: error.message
      };
    }
  }

  /**
   * Análisis de estabilidad de conexión
   * @private
   */
  async #analyzeStability(url, options) {
    const stabilityChecks = options.stabilityChecks || 10;
    const checkInterval = options.stabilityInterval || 200;
    const results = [];
    
    for (let i = 0; i < stabilityChecks; i++) {
      const startTime = performance.now();
      try {
        const response = await this.#streamHealthService.checkStream(url, {
          method: 'HEAD',
          timeout: 2000
        });
        
        results.push({
          success: response.ok,
          responseTime: performance.now() - startTime,
          check: i + 1
        });
      } catch (error) {
        results.push({
          success: false,
          responseTime: performance.now() - startTime,
          error: error.message,
          check: i + 1
        });
      }
      
      if (i < stabilityChecks - 1) {
        await this.#delay(checkInterval);
      }
    }

    const successfulChecks = results.filter(r => r.success).length;
    const stabilityScore = successfulChecks / stabilityChecks;
    const responseTimes = results.filter(r => r.success).map(r => r.responseTime);
    const avgResponseTime = responseTimes.length > 0 ? 
      responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length : 0;
    
    return {
      stabilityScore,
      successfulChecks,
      totalChecks: stabilityChecks,
      averageResponseTime: avgResponseTime,
      consistency: this.#calculateConsistency(responseTimes),
      recommendation: this.#getStabilityRecommendation(stabilityScore)
    };
  }

  /**
   * Análisis básico de contenido del stream
   * @private
   */
  async #analyzeContent(url, options) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Range': 'bytes=0-1023' // Primeros 1KB
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const contentLength = response.headers.get('content-length');
      
      // Leer una pequeña muestra
      const buffer = await response.arrayBuffer();
      const sample = new Uint8Array(buffer);
      
      return {
        contentType,
        contentLength: contentLength ? parseInt(contentLength) : null,
        sampleSize: sample.length,
        isStreamingContent: this.#detectStreamingContent(contentType, sample),
        quality: this.#assessContentQuality(contentType, sample)
      };
      
    } catch (error) {
      return {
        error: error.message,
        quality: 'unknown'
      };
    }
  }

  /**
   * Construye resultado de fallo con diagnóstico
   * @private
   */
  #buildFailureResult(failedPhase, phases) {
    return {
      isValid: false,
      quality: 'poor',
      confidence: 0.1,
      failedPhase,
      phases,
      recommendation: this.#getFailureRecommendation(failedPhase, phases),
      issues: this.#identifyIssues(phases)
    };
  }

  /**
   * Construye resultado exitoso con métricas
   * @private
   */
  #buildSuccessResult(phases) {
    const overallQuality = this.#calculateOverallQuality(phases);
    const confidence = this.#calculateConfidence(phases);
    
    return {
      isValid: true,
      quality: overallQuality,
      confidence,
      phases,
      recommendation: this.#getSuccessRecommendation(overallQuality, phases),
      optimizations: this.#suggestOptimizations(phases)
    };
  }

  /**
   * Evalúa calidad de latencia
   * @private
   */
  #assessLatencyQuality(avgLatency, jitter) {
    if (avgLatency < 1000 && jitter < 200) return 'excellent';
    if (avgLatency < 2000 && jitter < 400) return 'good';
    if (avgLatency < 3000 && jitter < 600) return 'fair';
    return 'poor';
  }

  /**
   * Evalúa calidad de throughput
   * @private
   */
  #assessThroughputQuality(bytesPerSecond) {
    if (bytesPerSecond > 100000) return 'excellent'; // >100KB/s
    if (bytesPerSecond > 50000) return 'good';       // >50KB/s
    if (bytesPerSecond > 10000) return 'fair';       // >10KB/s
    return 'poor';
  }

  /**
   * Calcula consistencia de tiempos de respuesta
   * @private
   */
  #calculateConsistency(responseTimes) {
    if (responseTimes.length < 2) return 1;
    
    const avg = responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length;
    const variance = responseTimes.reduce((sum, rt) => sum + Math.pow(rt - avg, 2), 0) / responseTimes.length;
    const stdDev = Math.sqrt(variance);
    
    // Consistencia basada en coeficiente de variación
    const coefficientOfVariation = stdDev / avg;
    return Math.max(0, 1 - coefficientOfVariation);
  }

  /**
   * Detecta si el contenido es streaming
   * @private
   */
  #detectStreamingContent(contentType, sample) {
    const streamingTypes = [
      'application/vnd.apple.mpegurl',
      'application/x-mpegURL',
      'video/mp2t',
      'video/MP2T',
      'application/octet-stream'
    ];
    
    return streamingTypes.some(type => contentType.includes(type)) ||
           this.#detectM3U8Pattern(sample);
  }

  /**
   * Detecta patrones M3U8 en el contenido
   * @private
   */
  #detectM3U8Pattern(sample) {
    const text = new TextDecoder().decode(sample.slice(0, 100));
    return text.includes('#EXTM3U') || text.includes('#EXT-X-');
  }

  /**
   * Calcula calidad general
   * @private
   */
  #calculateOverallQuality(phases) {
    const qualities = [];
    
    if (phases.latency?.quality) qualities.push(phases.latency.quality);
    if (phases.throughput?.quality) qualities.push(phases.throughput.quality);
    if (phases.stability?.stabilityScore > 0.9) qualities.push('excellent');
    else if (phases.stability?.stabilityScore > 0.8) qualities.push('good');
    else if (phases.stability?.stabilityScore > 0.6) qualities.push('fair');
    else qualities.push('poor');
    
    // Determinar calidad predominante
    const qualityScores = {
      excellent: 4,
      good: 3,
      fair: 2,
      poor: 1
    };
    
    const avgScore = qualities.reduce((sum, q) => sum + qualityScores[q], 0) / qualities.length;
    
    if (avgScore >= 3.5) return 'excellent';
    if (avgScore >= 2.5) return 'good';
    if (avgScore >= 1.5) return 'fair';
    return 'poor';
  }

  /**
   * Calcula nivel de confianza
   * @private
   */
  #calculateConfidence(phases) {
    let confidence = 0.5; // Base
    
    if (phases.connectivity?.successRate >= 0.8) confidence += 0.2;
    if (phases.latency?.jitter < this.#qualityThresholds.maxJitter) confidence += 0.1;
    if (phases.throughput?.bytesPerSecond > this.#qualityThresholds.minThroughput) confidence += 0.1;
    if (phases.stability?.stabilityScore >= this.#qualityThresholds.connectionStability) confidence += 0.1;
    
    return Math.min(1, confidence);
  }

  /**
   * Genera clave de cache
   * @private
   */
  #generateCacheKey(url, options) {
    const optionsHash = JSON.stringify({
      timeout: options.timeout,
      samples: options.latencySamples,
      checks: options.stabilityChecks
    });
    return `${url}:${Buffer.from(optionsHash).toString('base64').slice(0, 8)}`;
  }

  /**
   * Obtiene resultado del cache
   * @private
   */
  #getCachedResult(key, ttl) {
    const cached = this.#validationCache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > ttl) {
      this.#validationCache.delete(key);
      return null;
    }
    
    return cached.result;
  }

  /**
   * Guarda resultado en cache
   * @private
   */
  #setCachedResult(key, result) {
    this.#validationCache.set(key, {
      result,
      timestamp: Date.now()
    });
    
    // Limpieza automática del cache
    if (this.#validationCache.size > 500) {
      const entries = Array.from(this.#validationCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      for (let i = 0; i < 100; i++) {
        this.#validationCache.delete(entries[i][0]);
      }
    }
  }

  /**
   * Actualiza métricas de rendimiento históricas
   * @private
   */
  #updatePerformanceMetrics(url, result) {
    if (!this.#performanceMetrics.has(url)) {
      this.#performanceMetrics.set(url, {
        validations: [],
        averageQuality: 0,
        reliability: 0
      });
    }
    
    const metrics = this.#performanceMetrics.get(url);
    metrics.validations.push({
      timestamp: Date.now(),
      quality: result.quality,
      confidence: result.confidence,
      isValid: result.isValid
    });
    
    // Mantener solo últimas 10 validaciones
    if (metrics.validations.length > 10) {
      metrics.validations = metrics.validations.slice(-10);
    }
    
    // Recalcular métricas
    const recent = metrics.validations.slice(-5);
    metrics.reliability = recent.filter(v => v.isValid).length / recent.length;
    
    this.#performanceMetrics.set(url, metrics);
  }

  /**
   * Obtiene métricas históricas de un URL
   */
  getPerformanceMetrics(url) {
    return this.#performanceMetrics.get(url) || null;
  }

  /**
   * Obtiene recomendaciones de optimización
   * @private
   */
  #suggestOptimizations(phases) {
    const optimizations = [];
    
    if (phases.latency?.averageLatency > 2000) {
      optimizations.push('Considerar usar CDN más cercano');
    }
    
    if (phases.throughput?.bytesPerSecond < 50000) {
      optimizations.push('Verificar ancho de banda del servidor');
    }
    
    if (phases.stability?.stabilityScore < 0.9) {
      optimizations.push('Implementar retry automático con backoff');
    }
    
    return optimizations;
  }

  /**
   * Delay helper
   * @private
   */
  async #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtiene estadísticas generales del servicio
   */
  getServiceStats() {
    return {
      cacheSize: this.#validationCache.size,
      metricsTracked: this.#performanceMetrics.size,
      qualityThresholds: this.#qualityThresholds
    };
  }

  /**
   * Limpia cache y métricas
   */
  clearCache() {
    this.#validationCache.clear();
    this.#performanceMetrics.clear();
    this.#logger.info('🧹 Cache y métricas limpiadas');
  }

  /**
   * Obtiene recomendación de estabilidad
   * @private
   */
  #getStabilityRecommendation(stabilityScore) {
    if (stabilityScore < 0.5) {
      return 'Conexión muy inestable. Considere usar un servidor alternativo.';
    } else if (stabilityScore < 0.7) {
      return 'Conexión moderadamente estable. Monitoree el rendimiento.';
    }
    return 'Conexión estable y confiable.';
  }

  /**
   * Obtiene recomendación de fallo
   * @private
   */
  #getFailureRecommendation(failedPhase, phases) {
    switch (failedPhase) {
      case 'connectivity':
        return 'Servidor no responde. Verifique la URL y conectividad de red.';
      case 'latency':
        return 'Latencia alta detectada. Considere usar un servidor más cercano.';
      case 'throughput':
        return 'Ancho de banda insuficiente. Verifique la capacidad del servidor.';
      case 'stability':
        return 'Conexión inestable. El servidor puede estar sobrecargado.';
      default:
        return 'Error en validación. Revise la configuración del stream.';
    }
  }

  /**
   * Obtiene recomendación de éxito
   * @private
   */
  #getSuccessRecommendation(overallQuality, phases) {
    if (overallQuality === 'excellent') {
      return 'Excelente calidad de stream. Óptimo para transmisión.';
    } else if (overallQuality === 'good') {
      return 'Buena calidad de stream. Adecuado para la mayoría de usos.';
    }
    return 'Calidad aceptable. Monitoree el rendimiento durante la transmisión.';
  }

  /**
   * Evalúa calidad de contenido
   * @private
   */
  #assessContentQuality(contentType, sample) {
    if (!sample || sample.length === 0) {
      return 'unknown';
    }

    if (contentType && (contentType.includes('video') || contentType.includes('mpegurl'))) {
      return 'good';
    }

    return 'fair';
  }

  /**
   * Identifica problemas en las fases
   * @private
   */
  #identifyIssues(phases) {
    const issues = [];
    
    Object.entries(phases).forEach(([phase, result]) => {
      if (result && !result.success) {
        issues.push(`${phase}: ${result.error || 'Error desconocido'}`);
      } else if (result && result.quality && result.quality === 'poor') {
        issues.push(`${phase}: Calidad por debajo del umbral recomendado`);
      }
    });

    return issues;
  }
}