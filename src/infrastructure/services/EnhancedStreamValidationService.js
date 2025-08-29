import { AdvancedStreamValidationService } from './AdvancedStreamValidationService.js';
import { StreamQualityMetricsService } from './StreamQualityMetricsService.js';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

/**
 * Servicio integrado de validación de streams que combina validación avanzada
 * con métricas de calidad para prevenir buffering y optimizar rendimiento
 */
export class EnhancedStreamValidationService extends EventEmitter {
  #config;
  #logger;
  #streamHealthService;
  #httpsToHttpService;
  #advancedValidator;
  #qualityMetrics;
  #validationCache;
  #performanceTracker;
  #adaptiveThresholds;

  constructor(config, logger, streamHealthService, httpsToHttpService) {
    super();
    this.#config = config;
    this.#logger = logger;
    this.#streamHealthService = streamHealthService;
    this.#httpsToHttpService = httpsToHttpService;
    
    // Inicializar servicios especializados
    this.#advancedValidator = new AdvancedStreamValidationService(
      config, logger, streamHealthService, httpsToHttpService
    );
    this.#qualityMetrics = new StreamQualityMetricsService(config, logger);
    
    this.#validationCache = new Map();
    this.#performanceTracker = new Map();
    
    // Umbrales adaptativos basados en historial
    this.#adaptiveThresholds = {
      qualityScore: 0.7,
      bufferingRisk: 0.3,
      latencyThreshold: 3000,
      throughputThreshold: 500000, // 500 KB/s
      stabilityThreshold: 0.85
    };
    
    this.#setupEventHandlers();
  }

  /**
   * Configura manejadores de eventos
   * @private
   */
  #setupEventHandlers() {
    this.#advancedValidator.on('validationCompleted', (data) => {
      this.emit('advancedValidationCompleted', data);
    });
    
    this.#qualityMetrics.on('qualityAnalyzed', (data) => {
      this.emit('qualityAnalyzed', data);
      this.#updateAdaptiveThresholds(data);
    });
  }

  /**
   * Validación completa de stream con análisis de calidad integrado
   * @param {string} url - URL del stream
   * @param {Object} options - Opciones de validación
   * @returns {Promise<Object>} Resultado completo de validación
   */
  async validateStreamComprehensive(url, options = {}) {
    const startTime = performance.now();
    const cacheKey = this.#generateCacheKey(url, options);
    
    // Verificar cache si no se fuerza refresh
    if (!options.forceRefresh) {
      const cached = this.#getCachedResult(cacheKey, options.cacheTTL || 300000);
      if (cached) {
        this.#logger.debug(`📋 Usando resultado cacheado para ${url}`);
        return cached;
      }
    }

    try {
      this.#logger.info(`🔍 Iniciando validación completa de ${url}`);
      
      // Fase 1: Validación avanzada básica
      const advancedResult = await this.#advancedValidator.validateStreamAdvanced(url, {
        ...options,
        cacheTTL: 60000 // Cache más corto para validación básica
      });
      
      // Fase 2: Análisis de calidad específico
      const qualityResult = await this.#qualityMetrics.analyzeStreamQuality(url, {
        profile: options.streamProfile || this.#detectStreamProfile(url),
        ...options
      });
      
      // Fase 3: Análisis predictivo
      const predictiveAnalysis = await this.#performPredictiveAnalysis(url, {
        advanced: advancedResult,
        quality: qualityResult
      });
      
      // Construir resultado integrado
      const integratedResult = this.#buildIntegratedResult({
        url,
        advanced: advancedResult,
        quality: qualityResult,
        predictive: predictiveAnalysis,
        validationTime: performance.now() - startTime
      });
      
      // Guardar en cache
      this.#setCachedResult(cacheKey, integratedResult);
      
      // Actualizar métricas de rendimiento
      this.#updatePerformanceTracking(url, integratedResult);
      
      // Emitir evento de validación completa
      this.emit('comprehensiveValidationCompleted', {
        url,
        result: integratedResult
      });
      
      this.#logger.info(`✅ Validación completa de ${url} finalizada: ${integratedResult.overallRating}`);
      
      return integratedResult;
      
    } catch (error) {
      this.#logger.error(`❌ Error en validación completa de ${url}: ${error.message}`);
      
      const errorResult = {
        url,
        isValid: false,
        overallRating: 'poor',
        confidence: 0,
        streamable: false,
        error: error.message,
        validationTime: performance.now() - startTime,
        timestamp: Date.now()
      };
      
      this.emit('validationError', { url, error: errorResult });
      return errorResult;
    }
  }

  /**
   * Validación rápida para filtrado inicial
   * @param {string} url - URL del stream
   * @param {Object} options - Opciones de validación rápida
   * @returns {Promise<Object>} Resultado de validación rápida
   */
  async validateStreamQuick(url, options = {}) {
    const startTime = performance.now();
    
    try {
      // Verificar cache primero
      const cacheKey = `quick:${url}`;
      const cached = this.#getCachedResult(cacheKey, 60000); // 1 minuto cache
      if (cached && !options.forceRefresh) {
        return cached;
      }
      
      // Validación básica de conectividad
      const connectivityTest = await this.#performQuickConnectivityTest(url, options);
      
      if (!connectivityTest.success) {
        const result = {
          url,
          isValid: false,
          quickValidation: true,
          reason: 'connectivity_failed',
          details: connectivityTest,
          validationTime: performance.now() - startTime
        };
        
        this.#setCachedResult(cacheKey, result);
        return result;
      }
      
      // Test rápido de latencia
      const latencyTest = await this.#performQuickLatencyTest(url, options);
      
      const result = {
        url,
        isValid: connectivityTest.success && latencyTest.acceptable,
        quickValidation: true,
        connectivity: connectivityTest,
        latency: latencyTest,
        recommendation: this.#getQuickRecommendation(connectivityTest, latencyTest),
        validationTime: performance.now() - startTime
      };
      
      this.#setCachedResult(cacheKey, result);
      return result;
      
    } catch (error) {
      return {
        url,
        isValid: false,
        quickValidation: true,
        error: error.message,
        validationTime: performance.now() - startTime
      };
    }
  }

  /**
   * Validación por lotes con priorización inteligente
   * @param {Array<string>} urls - URLs a validar
   * @param {Object} options - Opciones de validación
   * @returns {Promise<Object>} Resultados de validación por lotes
   */
  async validateStreamsBatch(urls, options = {}) {
    const startTime = performance.now();
    const batchSize = options.batchSize || 10;
    const concurrency = options.concurrency || 5;
    
    this.#logger.info(`🔄 Iniciando validación por lotes de ${urls.length} streams`);
    
    try {
      // Fase 1: Validación rápida para filtrado inicial
      const quickResults = await this.#performBatchQuickValidation(urls, {
        concurrency: Math.min(concurrency * 2, 20),
        timeout: options.quickTimeout || 3000
      });
      
      // Filtrar URLs prometedores
      const promisingUrls = quickResults
        .filter(result => result.isValid)
        .map(result => result.url)
        .slice(0, options.maxDetailedValidations || 50);
      
      this.#logger.info(`📊 ${promisingUrls.length} de ${urls.length} streams pasaron validación rápida`);
      
      // Fase 2: Validación detallada de streams prometedores
      const detailedResults = await this.#performBatchDetailedValidation(promisingUrls, {
        concurrency,
        batchSize,
        ...options
      });
      
      // Combinar resultados
      const finalResults = this.#combineBatchResults(quickResults, detailedResults);
      
      // Generar estadísticas
      const stats = this.#generateBatchStats(finalResults, performance.now() - startTime);
      
      const batchResult = {
        totalUrls: urls.length,
        validUrls: finalResults.filter(r => r.isValid && r.streamable !== false).length,
        highQualityUrls: finalResults.filter(r => r.overallRating === 'excellent' || r.overallRating === 'good').length,
        results: finalResults,
        stats,
        processingTime: performance.now() - startTime
      };
      
      this.emit('batchValidationCompleted', batchResult);
      
      return batchResult;
      
    } catch (error) {
      this.#logger.error(`❌ Error en validación por lotes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Análisis predictivo basado en historial
   * @private
   */
  async #performPredictiveAnalysis(url, data) {
    try {
      // Obtener historial de métricas
      const history = this.#qualityMetrics.getMetricsHistory(url);
      const trends = this.#qualityMetrics.getQualityTrends(url);
      
      // Análisis de patrones
      const patterns = this.#analyzePerformancePatterns(history, data);
      
      // Predicción de estabilidad
      const stabilityPrediction = this.#predictStability(data, patterns);
      
      // Recomendaciones de optimización
      const optimizations = this.#generateOptimizationRecommendations(data, patterns);
      
      return {
        trends,
        patterns,
        stabilityPrediction,
        optimizations,
        confidence: this.#calculatePredictionConfidence(history, patterns)
      };
      
    } catch (error) {
      this.#logger.warn(`⚠️ Error en análisis predictivo: ${error.message}`);
      return {
        error: error.message,
        confidence: 0
      };
    }
  }

  /**
   * Analiza patrones de rendimiento
   * @private
   */
  #analyzePerformancePatterns(history, data) {
    if (!history || history.length < 3) {
      return {
        trend: 'insufficient_data',
        stability: 'unknown',
        patterns: []
      };
    }
    
    // Analizar tendencias de latencia
    const latencies = history.map(h => h.latency).filter(l => l !== undefined);
    const latencyTrend = this.#calculateTrend(latencies);
    
    // Analizar estabilidad de conexión
    const successRates = history.map(h => h.successRate).filter(s => s !== undefined);
    const stabilityTrend = this.#calculateTrend(successRates);
    
    return {
      latencyTrend,
      stabilityTrend,
      patterns: this.#identifyPatterns(history),
      reliability: this.#calculateReliability(history)
    };
  }

  /**
   * Predice estabilidad futura
   * @private
   */
  #predictStability(data, patterns) {
    const { advanced, quality } = data;
    
    let stabilityScore = 0.5; // Base neutral
    
    // Factor de calidad actual
    if (quality.qualityScore) {
      stabilityScore += quality.qualityScore * 0.3;
    }
    
    // Factor de rendimiento avanzado
    if (advanced.performance) {
      stabilityScore += (advanced.performance.stability || 0.5) * 0.3;
    }
    
    // Factor de tendencias históricas
    if (patterns.stabilityTrend === 'improving') {
      stabilityScore += 0.2;
    } else if (patterns.stabilityTrend === 'degrading') {
      stabilityScore -= 0.2;
    }
    
    return {
      score: Math.max(0, Math.min(1, stabilityScore)),
      prediction: stabilityScore > 0.7 ? 'stable' : stabilityScore > 0.4 ? 'moderate' : 'unstable',
      confidence: patterns.reliability || 0.5
    };
  }

  /**
   * Genera recomendaciones de optimización
   * @private
   */
  #generateOptimizationRecommendations(data, patterns) {
    const recommendations = [];
    const { advanced, quality } = data;
    
    // Recomendaciones basadas en latencia
    if (quality.metrics && quality.metrics.latency > this.#adaptiveThresholds.latencyThreshold) {
      recommendations.push({
        type: 'latency',
        priority: 'high',
        message: 'Latencia alta detectada - considerar servidor más cercano',
        action: 'optimize_routing'
      });
    }
    
    // Recomendaciones basadas en throughput
    if (quality.metrics && quality.metrics.throughput < this.#adaptiveThresholds.throughputThreshold) {
      recommendations.push({
        type: 'throughput',
        priority: 'medium',
        message: 'Throughput bajo - verificar ancho de banda',
        action: 'check_bandwidth'
      });
    }
    
    // Recomendaciones basadas en estabilidad
    if (advanced.performance && advanced.performance.stability < this.#adaptiveThresholds.stabilityThreshold) {
      recommendations.push({
        type: 'stability',
        priority: 'high',
        message: 'Conexión inestable - implementar retry logic',
        action: 'add_resilience'
      });
    }
    
    return recommendations;
  }

  /**
   * Calcula confianza de predicción
   * @private
   */
  #calculatePredictionConfidence(history, patterns) {
    if (!history || history.length < 3) {
      return 0.3; // Baja confianza con pocos datos
    }
    
    let confidence = 0.5; // Base
    
    // Más datos = más confianza
    confidence += Math.min(0.3, history.length * 0.05);
    
    // Patrones consistentes = más confianza
    if (patterns.reliability > 0.8) {
      confidence += 0.2;
    }
    
    return Math.min(1, confidence);
  }

  /**
   * Calcula tendencia de una serie de datos
   * @private
   */
  #calculateTrend(values) {
    if (values.length < 3) return 'insufficient_data';
    
    const recent = values.slice(-3);
    const older = values.slice(0, -3);
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;
    
    const change = (recentAvg - olderAvg) / olderAvg;
    
    if (change > 0.1) return 'improving';
    if (change < -0.1) return 'degrading';
    return 'stable';
  }

  /**
   * Identifica patrones en el historial
   * @private
   */
  #identifyPatterns(history) {
    const patterns = [];
    
    // Patrón de horarios pico
    const hourlyData = this.#groupByHour(history);
    if (this.#detectPeakHours(hourlyData)) {
      patterns.push({
        type: 'peak_hours',
        description: 'Degradación durante horarios pico detectada'
      });
    }
    
    // Patrón de días de la semana
    const dailyData = this.#groupByDay(history);
    if (this.#detectWeekendEffect(dailyData)) {
      patterns.push({
        type: 'weekend_effect',
        description: 'Diferencias de rendimiento entre semana y fin de semana'
      });
    }
    
    return patterns;
  }

  /**
   * Calcula confiabilidad general
   * @private
   */
  #calculateReliability(history) {
    if (!history || history.length === 0) return 0;
    
    const successCount = history.filter(h => h.success === true).length;
    return successCount / history.length;
  }

  /**
   * Agrupa datos por hora
   * @private
   */
  #groupByHour(history) {
    const hourlyData = {};
    
    history.forEach(entry => {
      const hour = new Date(entry.timestamp).getHours();
      if (!hourlyData[hour]) hourlyData[hour] = [];
      hourlyData[hour].push(entry);
    });
    
    return hourlyData;
  }

  /**
   * Agrupa datos por día
   * @private
   */
  #groupByDay(history) {
    const dailyData = {};
    
    history.forEach(entry => {
      const day = new Date(entry.timestamp).getDay();
      if (!dailyData[day]) dailyData[day] = [];
      dailyData[day].push(entry);
    });
    
    return dailyData;
  }

  /**
   * Detecta horarios pico
   * @private
   */
  #detectPeakHours(hourlyData) {
    // Simplificado: detectar si hay diferencias significativas entre horas
    const hours = Object.keys(hourlyData);
    if (hours.length < 6) return false;
    
    const avgLatencies = hours.map(hour => {
      const entries = hourlyData[hour];
      const latencies = entries.map(e => e.latency).filter(l => l !== undefined);
      return latencies.length > 0 ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0;
    });
    
    const maxLatency = Math.max(...avgLatencies);
    const minLatency = Math.min(...avgLatencies.filter(l => l > 0));
    
    return maxLatency > minLatency * 1.5; // 50% de diferencia
  }

  /**
   * Detecta efecto de fin de semana
   * @private
   */
  #detectWeekendEffect(dailyData) {
    const weekdays = [1, 2, 3, 4, 5]; // Lunes a Viernes
    const weekends = [0, 6]; // Domingo y Sábado
    
    const weekdayEntries = weekdays.flatMap(day => dailyData[day] || []);
    const weekendEntries = weekends.flatMap(day => dailyData[day] || []);
    
    if (weekdayEntries.length < 5 || weekendEntries.length < 2) return false;
    
    const weekdayAvgLatency = this.#calculateAverageLatency(weekdayEntries);
    const weekendAvgLatency = this.#calculateAverageLatency(weekendEntries);
    
    return Math.abs(weekdayAvgLatency - weekendAvgLatency) > weekdayAvgLatency * 0.2;
  }

  /**
   * Calcula latencia promedio
   * @private
   */
  #calculateAverageLatency(entries) {
    const latencies = entries.map(e => e.latency).filter(l => l !== undefined && l > 0);
    return latencies.length > 0 ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0;
  }

  /**
   * Test rápido de conectividad
   * @private
   */
  async #performQuickConnectivityTest(url, options) {
    const timeout = options.quickTimeout || 3000;
    const startTime = performance.now();
    
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(timeout)
      });
      
      return {
        success: response.ok,
        statusCode: response.status,
        responseTime: performance.now() - startTime,
        headers: {
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length'),
          server: response.headers.get('server')
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        responseTime: performance.now() - startTime
      };
    }
  }

  /**
   * Test rápido de latencia
   * @private
   */
  async #performQuickLatencyTest(url, options) {
    const samples = options.latencySamples || 3;
    const latencies = [];
    
    for (let i = 0; i < samples; i++) {
      const startTime = performance.now();
      
      try {
        await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000)
        });
        
        latencies.push(performance.now() - startTime);
      } catch (error) {
        latencies.push(2000); // Penalizar timeouts
      }
      
      if (i < samples - 1) {
        await this.#delay(100);
      }
    }
    
    const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);
    
    return {
      averageLatency: avgLatency,
      maxLatency,
      acceptable: avgLatency < this.#adaptiveThresholds.latencyThreshold,
      samples: latencies
    };
  }

  /**
   * Validación rápida por lotes
   * @private
   */
  async #performBatchQuickValidation(urls, options) {
    const concurrency = options.concurrency || 10;
    const results = [];
    
    // Procesar en lotes concurrentes
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (url) => {
        try {
          return await this.validateStreamQuick(url, options);
        } catch (error) {
          return {
            url,
            isValid: false,
            error: error.message,
            quickValidation: true
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Pequeña pausa entre lotes para no sobrecargar
      if (i + concurrency < urls.length) {
        await this.#delay(100);
      }
    }
    
    return results;
  }

  /**
   * Validación detallada por lotes
   * @private
   */
  async #performBatchDetailedValidation(urls, options) {
    const concurrency = options.concurrency || 5;
    const results = [];
    
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (url) => {
        try {
          return await this.validateStreamComprehensive(url, {
            ...options,
            skipCache: false
          });
        } catch (error) {
          return {
            url,
            isValid: false,
            error: error.message,
            detailedValidation: true
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      this.#logger.debug(`📊 Procesado lote ${Math.floor(i / concurrency) + 1}/${Math.ceil(urls.length / concurrency)}`);
      
      // Pausa entre lotes
      if (i + concurrency < urls.length) {
        await this.#delay(500);
      }
    }
    
    return results;
  }

  /**
   * Construye resultado integrado
   * @private
   */
  #buildIntegratedResult(data) {
    const { url, advanced, quality, predictive, validationTime } = data;
    
    // Calcular rating general
    const overallRating = this.#calculateOverallRating(advanced, quality);
    
    // Determinar si es streamable
    const streamable = this.#determineStreamability(advanced, quality);
    
    // Calcular confianza
    const confidence = this.#calculateIntegratedConfidence(advanced, quality, predictive);
    
    // Generar recomendaciones integradas
    const recommendations = this.#generateIntegratedRecommendations(advanced, quality, predictive);
    
    return {
      url,
      timestamp: Date.now(),
      isValid: advanced.isValid && quality.isStreamable,
      overallRating,
      streamable,
      confidence,
      bufferingRisk: quality.bufferingRisk,
      qualityScore: quality.qualityScore,
      advanced: {
        quality: advanced.quality,
        phases: advanced.phases,
        performance: advanced.performance
      },
      quality: {
        profile: quality.profile,
        metrics: quality.metrics,
        issues: quality.issues
      },
      predictive,
      recommendations,
      validationTime,
      summary: this.#generateValidationSummary(overallRating, streamable, quality.bufferingRisk)
    };
  }

  /**
   * Calcula rating general
   * @private
   */
  #calculateOverallRating(advanced, quality) {
    const advancedScore = this.#mapQualityToScore(advanced.quality);
    const qualityScore = quality.qualityScore;
    
    // Promedio ponderado (60% calidad, 40% validación avanzada)
    const combinedScore = (qualityScore * 0.6) + (advancedScore * 0.4);
    
    if (combinedScore >= 0.9) return 'excellent';
    if (combinedScore >= 0.75) return 'good';
    if (combinedScore >= 0.6) return 'fair';
    return 'poor';
  }

  /**
   * Determina si el stream es reproducible
   * @private
   */
  #determineStreamability(advanced, quality) {
    return advanced.isValid && 
           quality.isStreamable && 
           quality.bufferingRisk.level !== 'high' &&
           quality.qualityScore >= this.#adaptiveThresholds.qualityScore;
  }

  /**
   * Mapea calidad a puntuación numérica
   * @private
   */
  #mapQualityToScore(quality) {
    const qualityMap = {
      excellent: 1.0,
      good: 0.8,
      fair: 0.6,
      poor: 0.3
    };
    return qualityMap[quality] || 0;
  }

  /**
   * Detecta perfil de stream
   * @private
   */
  #detectStreamProfile(url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('sport') || urlLower.includes('futbol') || urlLower.includes('football')) {
      return 'sports';
    }
    if (urlLower.includes('news') || urlLower.includes('noticias')) {
      return 'news';
    }
    if (urlLower.includes('movie') || urlLower.includes('pelicula') || urlLower.includes('serie')) {
      return 'entertainment';
    }
    
    return 'live_tv';
  }

  /**
   * Actualiza umbrales adaptativos
   * @private
   */
  #updateAdaptiveThresholds(qualityData) {
    // Ajustar umbrales basado en tendencias históricas
    const trends = this.#qualityMetrics.getQualityTrends(qualityData.url);
    
    if (trends && trends.trend === 'improving') {
      // Ser más estricto si la calidad está mejorando
      this.#adaptiveThresholds.qualityScore = Math.min(0.8, this.#adaptiveThresholds.qualityScore + 0.05);
    } else if (trends && trends.trend === 'degrading') {
      // Ser más permisivo si la calidad está degradándose
      this.#adaptiveThresholds.qualityScore = Math.max(0.6, this.#adaptiveThresholds.qualityScore - 0.05);
    }
  }

  /**
   * Genera clave de cache
   * @private
   */
  #generateCacheKey(url, options) {
    const keyData = {
      url,
      profile: options.streamProfile,
      detailed: options.detailed || false
    };
    return Buffer.from(JSON.stringify(keyData)).toString('base64').slice(0, 16);
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
    
    // Limpieza automática
    if (this.#validationCache.size > 1000) {
      const entries = Array.from(this.#validationCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      for (let i = 0; i < 200; i++) {
        this.#validationCache.delete(entries[i][0]);
      }
    }
  }

  /**
   * Helper para delay
   * @private
   */
  async #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtiene estadísticas del servicio
   */
  getServiceStats() {
    return {
      cacheSize: this.#validationCache.size,
      performanceTracking: this.#performanceTracker.size,
      adaptiveThresholds: this.#adaptiveThresholds,
      advancedValidator: this.#advancedValidator.getServiceStats(),
      qualityMetrics: this.#qualityMetrics.getServiceStats()
    };
  }

  /**
   * Limpia todos los caches
   */
  clearAllCaches() {
    this.#validationCache.clear();
    this.#performanceTracker.clear();
    this.#advancedValidator.clearCache();
    this.#logger.info('🧹 Todos los caches limpiados');
  }

  /**
   * Obtiene recomendación rápida
   * @private
   */
  #getQuickRecommendation(connectivity, latency) {
    if (!connectivity.success) {
      return 'Stream no accesible - verificar URL y conectividad';
    }
    
    if (!latency.acceptable) {
      return 'Latencia alta detectada - posible buffering';
    }
    
    return 'Stream parece estable para validación detallada';
  }

  /**
   * Genera resumen de validación
   * @private
   */
  #generateValidationSummary(rating, streamable, bufferingRisk) {
    if (!streamable) {
      return 'Stream no recomendado para reproducción';
    }
    
    if (rating === 'excellent') {
      return 'Stream de excelente calidad - reproducción óptima';
    }
    
    if (rating === 'good') {
      return 'Stream de buena calidad - reproducción estable';
    }
    
    if (bufferingRisk.level === 'high') {
      return 'Stream funcional pero con riesgo de buffering';
    }
    
    return 'Stream aceptable con posibles interrupciones menores';
  }

  /**
   * Calcula confianza integrada
   * @private
   */
  #calculateIntegratedConfidence(advanced, quality, predictive) {
    let confidence = 0.5; // Base
    
    // Factor de validación avanzada
    if (advanced.confidence) {
      confidence += advanced.confidence * 0.3;
    }
    
    // Factor de calidad
    if (quality.confidence) {
      confidence += quality.confidence * 0.3;
    }
    
    // Factor predictivo
    if (predictive.confidence) {
      confidence += predictive.confidence * 0.4;
    }
    
    return Math.min(1, confidence);
  }

  /**
   * Genera recomendaciones integradas
   * @private
   */
  #generateIntegratedRecommendations(advanced, quality, predictive) {
    const recommendations = [];
    
    // Recomendaciones de validación avanzada
    if (advanced.recommendations) {
      recommendations.push(...advanced.recommendations);
    }
    
    // Recomendaciones de calidad
    if (quality.recommendations) {
      recommendations.push(...quality.recommendations);
    }
    
    // Recomendaciones predictivas
    if (predictive.optimizations) {
      recommendations.push(...predictive.optimizations);
    }
    
    // Deduplicar y priorizar
    return this.#deduplicateRecommendations(recommendations);
  }

  /**
   * Deduplica recomendaciones
   * @private
   */
  #deduplicateRecommendations(recommendations) {
    const seen = new Set();
    const unique = [];
    
    for (const rec of recommendations) {
      const key = `${rec.type}-${rec.action || rec.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(rec);
      }
    }
    
    // Ordenar por prioridad
    return unique.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    });
  }

  /**
   * Combina resultados de lotes
   * @private
   */
  #combineBatchResults(quickResults, detailedResults) {
    const detailedMap = new Map(detailedResults.map(r => [r.url, r]));
    
    return quickResults.map(quickResult => {
      const detailed = detailedMap.get(quickResult.url);
      
      if (detailed) {
        // Combinar datos de validación rápida y detallada
        return {
          ...detailed,
          quickValidation: quickResult,
          combinedValidation: true
        };
      }
      
      // Solo validación rápida disponible
      return {
        ...quickResult,
        detailedValidation: false
      };
    });
  }

  /**
   * Genera estadísticas de lote
   * @private
   */
  #generateBatchStats(results, processingTime) {
    const total = results.length;
    const valid = results.filter(r => r.isValid).length;
    const highQuality = results.filter(r => r.overallRating === 'excellent' || r.overallRating === 'good').length;
    const withBufferingRisk = results.filter(r => r.bufferingRisk && r.bufferingRisk.level === 'high').length;
    
    // Calcular métricas de calidad promedio
    const qualityScores = results
      .map(r => r.qualityScore)
      .filter(score => score !== undefined);
    
    const avgQualityScore = qualityScores.length > 0 
      ? qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length 
      : 0;
    
    // Calcular distribución de ratings
    const ratingDistribution = {
      excellent: results.filter(r => r.overallRating === 'excellent').length,
      good: results.filter(r => r.overallRating === 'good').length,
      fair: results.filter(r => r.overallRating === 'fair').length,
      poor: results.filter(r => r.overallRating === 'poor').length
    };
    
    return {
      total,
      valid,
      validPercentage: (valid / total) * 100,
      highQuality,
      highQualityPercentage: (highQuality / total) * 100,
      withBufferingRisk,
      bufferingRiskPercentage: (withBufferingRisk / total) * 100,
      avgQualityScore,
      ratingDistribution,
      processingTime,
      avgProcessingTimePerUrl: processingTime / total
    };
  }

  /**
   * Actualiza seguimiento de rendimiento
   * @private
   */
  #updatePerformanceTracking(url, result) {
    const key = this.#generatePerformanceKey(url);
    
    if (!this.#performanceTracker.has(key)) {
      this.#performanceTracker.set(key, {
        url,
        history: [],
        lastUpdated: Date.now()
      });
    }
    
    const tracking = this.#performanceTracker.get(key);
    
    // Agregar nueva entrada al historial
    tracking.history.push({
      timestamp: Date.now(),
      qualityScore: result.qualityScore,
      bufferingRisk: result.bufferingRisk?.level,
      overallRating: result.overallRating,
      validationTime: result.validationTime,
      success: result.isValid && result.streamable
    });
    
    // Mantener solo las últimas 50 entradas
    if (tracking.history.length > 50) {
      tracking.history = tracking.history.slice(-50);
    }
    
    tracking.lastUpdated = Date.now();
    
    // Limpiar entradas antiguas
    this.#cleanupPerformanceTracking();
  }

  /**
   * Genera clave de rendimiento
   * @private
   */
  #generatePerformanceKey(url) {
    return Buffer.from(url).toString('base64').slice(0, 12);
  }

  /**
   * Limpia seguimiento de rendimiento antiguo
   * @private
   */
  #cleanupPerformanceTracking() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas
    
    for (const [key, tracking] of this.#performanceTracker.entries()) {
      if (now - tracking.lastUpdated > maxAge) {
        this.#performanceTracker.delete(key);
      }
    }
    
    // Limitar tamaño total
    if (this.#performanceTracker.size > 500) {
      const entries = Array.from(this.#performanceTracker.entries());
      entries.sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);
      
      for (let i = 0; i < 100; i++) {
        this.#performanceTracker.delete(entries[i][0]);
      }
    }
  }
}