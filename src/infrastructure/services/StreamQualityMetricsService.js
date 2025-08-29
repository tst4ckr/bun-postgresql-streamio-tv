import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

/**
 * Servicio especializado en métricas de calidad de streaming
 * Analiza aspectos específicos de streams de video en vivo
 */
export class StreamQualityMetricsService extends EventEmitter {
  #config;
  #logger;
  #metricsHistory;
  #qualityProfiles;
  #streamAnalytics;

  constructor(config, logger) {
    super();
    this.#config = config;
    this.#logger = logger;
    this.#metricsHistory = new Map();
    this.#streamAnalytics = new Map();
    
    // Perfiles de calidad predefinidos
    this.#qualityProfiles = {
      live_tv: {
        maxAcceptableLatency: 2000,
        minBitrate: 500000, // 500 Kbps
        maxJitter: 300,
        requiredStability: 0.95,
        bufferHealthThreshold: 0.8
      },
      sports: {
        maxAcceptableLatency: 1500,
        minBitrate: 1000000, // 1 Mbps
        maxJitter: 200,
        requiredStability: 0.98,
        bufferHealthThreshold: 0.9
      },
      news: {
        maxAcceptableLatency: 3000,
        minBitrate: 300000, // 300 Kbps
        maxJitter: 500,
        requiredStability: 0.90,
        bufferHealthThreshold: 0.7
      },
      entertainment: {
        maxAcceptableLatency: 2500,
        minBitrate: 800000, // 800 Kbps
        maxJitter: 400,
        requiredStability: 0.92,
        bufferHealthThreshold: 0.8
      }
    };
  }

  /**
   * Analiza la calidad de un stream con métricas específicas de video
   * @param {string} url - URL del stream
   * @param {Object} options - Opciones de análisis
   * @returns {Promise<Object>} Métricas detalladas de calidad
   */
  async analyzeStreamQuality(url, options = {}) {
    const profile = this.#qualityProfiles[options.profile] || this.#qualityProfiles.live_tv;
    const startTime = performance.now();
    
    try {
      // Análisis multi-dimensional
      const metrics = await this.#performQualityAnalysis(url, profile, options);
      
      // Calcular puntuación de calidad
      const qualityScore = this.#calculateQualityScore(metrics, profile);
      
      // Generar recomendaciones
      const recommendations = this.#generateRecommendations(metrics, profile);
      
      // Detectar problemas potenciales
      const issues = this.#detectPotentialIssues(metrics, profile);
      
      const result = {
        url,
        timestamp: Date.now(),
        profile: options.profile || 'live_tv',
        qualityScore,
        metrics,
        recommendations,
        issues,
        isStreamable: qualityScore >= 0.7,
        bufferingRisk: this.#assessBufferingRisk(metrics, profile),
        analysisTime: performance.now() - startTime
      };
      
      // Guardar en historial
      this.#updateMetricsHistory(url, result);
      
      // Emitir evento
      this.emit('qualityAnalyzed', result);
      
      return result;
      
    } catch (error) {
      this.#logger.error(`❌ Error analizando calidad de ${url}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Realiza análisis completo de calidad
   * @private
   */
  async #performQualityAnalysis(url, profile, options) {
    const metrics = {
      connectivity: await this.#analyzeConnectivity(url, options),
      latency: await this.#analyzeLatencyPatterns(url, options),
      throughput: await this.#analyzeThroughputStability(url, options),
      streamHealth: await this.#analyzeStreamHealth(url, options),
      bufferAnalysis: await this.#analyzeBufferBehavior(url, options),
      contentDelivery: await this.#analyzeContentDelivery(url, options)
    };
    
    return metrics;
  }

  /**
   * Analiza patrones de conectividad específicos para streaming
   * @private
   */
  async #analyzeConnectivity(url, options) {
    const testDuration = options.connectivityTestDuration || 10000; // 10 segundos
    const sampleInterval = options.sampleInterval || 500; // 500ms
    const samples = [];
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < testDuration) {
      const sampleStart = performance.now();
      
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(3000)
        });
        
        samples.push({
          timestamp: Date.now(),
          success: response.ok,
          responseTime: performance.now() - sampleStart,
          statusCode: response.status
        });
        
      } catch (error) {
        samples.push({
          timestamp: Date.now(),
          success: false,
          responseTime: performance.now() - sampleStart,
          error: error.message
        });
      }
      
      await this.#delay(sampleInterval);
    }
    
    return this.#analyzeConnectivitySamples(samples);
  }

  /**
   * Analiza patrones de latencia para detectar variabilidad
   * @private
   */
  async #analyzeLatencyPatterns(url, options) {
    const measurements = options.latencyMeasurements || 20;
    const latencies = [];
    
    for (let i = 0; i < measurements; i++) {
      const startTime = performance.now();
      
      try {
        await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        });
        
        latencies.push(performance.now() - startTime);
      } catch (error) {
        latencies.push(5000); // Penalizar timeouts
      }
      
      // Esperar entre mediciones
      if (i < measurements - 1) {
        await this.#delay(200);
      }
    }
    
    return this.#analyzeLatencyDistribution(latencies);
  }

  /**
   * Analiza estabilidad del throughput
   * @private
   */
  async #analyzeThroughputStability(url, options) {
    const testSessions = options.throughputSessions || 3;
    const sessionDuration = options.sessionDuration || 5000;
    const chunkSize = options.chunkSize || 32768; // 32KB
    
    const sessions = [];
    
    for (let session = 0; session < testSessions; session++) {
      const sessionStart = performance.now();
      let totalBytes = 0;
      const throughputSamples = [];
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Range': `bytes=0-${chunkSize * 10 - 1}` // Descargar hasta 320KB
          },
          signal: AbortSignal.timeout(sessionDuration + 2000)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const reader = response.body.getReader();
        let lastSampleTime = performance.now();
        
        while (performance.now() - sessionStart < sessionDuration) {
          const { done, value } = await reader.read();
          if (done) break;
          
          totalBytes += value.length;
          
          // Muestrear throughput cada segundo
          const currentTime = performance.now();
          if (currentTime - lastSampleTime >= 1000) {
            const timeElapsed = (currentTime - sessionStart) / 1000;
            const currentThroughput = totalBytes / timeElapsed;
            
            throughputSamples.push({
              timestamp: currentTime,
              throughput: currentThroughput,
              totalBytes
            });
            
            lastSampleTime = currentTime;
          }
        }
        
        reader.cancel();
        
        sessions.push({
          session: session + 1,
          duration: performance.now() - sessionStart,
          totalBytes,
          averageThroughput: totalBytes / ((performance.now() - sessionStart) / 1000),
          throughputSamples,
          success: true
        });
        
      } catch (error) {
        sessions.push({
          session: session + 1,
          duration: performance.now() - sessionStart,
          totalBytes,
          error: error.message,
          success: false
        });
      }
      
      // Pausa entre sesiones
      if (session < testSessions - 1) {
        await this.#delay(1000);
      }
    }
    
    return this.#analyzeThroughputSessions(sessions);
  }

  /**
   * Analiza salud específica del stream
   * @private
   */
  async #analyzeStreamHealth(url, options) {
    try {
      // Análisis de headers del stream
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      
      const headers = {
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
        acceptRanges: response.headers.get('accept-ranges'),
        cacheControl: response.headers.get('cache-control'),
        server: response.headers.get('server'),
        lastModified: response.headers.get('last-modified')
      };
      
      // Análisis de contenido inicial
      const contentAnalysis = await this.#analyzeInitialContent(url);
      
      return {
        headers,
        contentAnalysis,
        streamType: this.#detectStreamType(headers, contentAnalysis),
        cacheability: this.#analyzeCacheability(headers),
        serverCapabilities: this.#analyzeServerCapabilities(headers)
      };
      
    } catch (error) {
      return {
        error: error.message,
        healthy: false
      };
    }
  }

  /**
   * Analiza comportamiento de buffering
   * @private
   */
  async #analyzeBufferBehavior(url, options) {
    const bufferTests = [];
    const testCount = options.bufferTests || 3;
    
    for (let test = 0; test < testCount; test++) {
      const bufferStart = performance.now();
      let bufferHealth = 0;
      let dataReceived = 0;
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Range': 'bytes=0-65535' // 64KB
          },
          signal: AbortSignal.timeout(8000)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const chunks = [];
        let firstByteTime = null;
        
        while (true) {
          const chunkStart = performance.now();
          const { done, value } = await reader.read();
          
          if (done) break;
          
          if (!firstByteTime) {
            firstByteTime = performance.now() - bufferStart;
          }
          
          dataReceived += value.length;
          chunks.push({
            size: value.length,
            timestamp: performance.now(),
            chunkTime: performance.now() - chunkStart
          });
          
          // Simular buffer health
          const currentRate = dataReceived / ((performance.now() - bufferStart) / 1000);
          bufferHealth = Math.min(1, currentRate / 50000); // 50KB/s como baseline
          
          if (dataReceived >= 65536) break; // 64KB recibidos
        }
        
        reader.cancel();
        
        bufferTests.push({
          test: test + 1,
          success: true,
          firstByteTime,
          totalTime: performance.now() - bufferStart,
          dataReceived,
          bufferHealth,
          chunks: chunks.length,
          averageChunkSize: dataReceived / chunks.length
        });
        
      } catch (error) {
        bufferTests.push({
          test: test + 1,
          success: false,
          error: error.message,
          totalTime: performance.now() - bufferStart
        });
      }
      
      await this.#delay(1000);
    }
    
    return this.#analyzeBufferTests(bufferTests);
  }

  /**
   * Analiza entrega de contenido
   * @private
   */
  async #analyzeContentDelivery(url, options) {
    try {
      // Test de range requests
      const rangeSupport = await this.#testRangeSupport(url);
      
      // Test de compresión
      const compressionSupport = await this.#testCompressionSupport(url);
      
      // Test de keep-alive
      const keepAliveSupport = await this.#testKeepAliveSupport(url);
      
      return {
        rangeSupport,
        compressionSupport,
        keepAliveSupport,
        deliveryScore: this.#calculateDeliveryScore({
          rangeSupport,
          compressionSupport,
          keepAliveSupport
        })
      };
      
    } catch (error) {
      return {
        error: error.message,
        deliveryScore: 0
      };
    }
  }

  /**
   * Calcula puntuación de calidad general
   * @private
   */
  #calculateQualityScore(metrics, profile) {
    let score = 0;
    let factors = 0;
    
    // Factor de conectividad (30%)
    if (metrics.connectivity?.reliability !== undefined) {
      score += metrics.connectivity.reliability * 0.3;
      factors += 0.3;
    }
    
    // Factor de latencia (25%)
    if (metrics.latency?.averageLatency !== undefined) {
      const latencyScore = Math.max(0, 1 - (metrics.latency.averageLatency / profile.maxAcceptableLatency));
      score += latencyScore * 0.25;
      factors += 0.25;
    }
    
    // Factor de throughput (20%)
    if (metrics.throughput?.averageThroughput !== undefined) {
      const throughputScore = Math.min(1, metrics.throughput.averageThroughput / profile.minBitrate);
      score += throughputScore * 0.2;
      factors += 0.2;
    }
    
    // Factor de estabilidad de buffer (15%)
    if (metrics.bufferAnalysis?.averageBufferHealth !== undefined) {
      score += metrics.bufferAnalysis.averageBufferHealth * 0.15;
      factors += 0.15;
    }
    
    // Factor de entrega de contenido (10%)
    if (metrics.contentDelivery?.deliveryScore !== undefined) {
      score += metrics.contentDelivery.deliveryScore * 0.1;
      factors += 0.1;
    }
    
    return factors > 0 ? score / factors : 0;
  }

  /**
   * Evalúa riesgo de buffering
   * @private
   */
  #assessBufferingRisk(metrics, profile) {
    let riskFactors = [];
    
    if (metrics.latency?.jitter > profile.maxJitter) {
      riskFactors.push('high_jitter');
    }
    
    if (metrics.throughput?.stability < 0.8) {
      riskFactors.push('unstable_throughput');
    }
    
    if (metrics.connectivity?.reliability < profile.requiredStability) {
      riskFactors.push('poor_connectivity');
    }
    
    if (metrics.bufferAnalysis?.averageBufferHealth < profile.bufferHealthThreshold) {
      riskFactors.push('poor_buffer_health');
    }
    
    const riskLevel = riskFactors.length === 0 ? 'low' :
                     riskFactors.length <= 2 ? 'medium' : 'high';
    
    return {
      level: riskLevel,
      factors: riskFactors,
      score: Math.max(0, 1 - (riskFactors.length * 0.25))
    };
  }

  /**
   * Genera recomendaciones específicas
   * @private
   */
  #generateRecommendations(metrics, profile) {
    const recommendations = [];
    
    if (metrics.latency?.averageLatency > profile.maxAcceptableLatency) {
      recommendations.push({
        type: 'latency',
        priority: 'high',
        message: 'Latencia alta detectada. Considerar CDN más cercano o optimizar red.',
        value: metrics.latency.averageLatency,
        threshold: profile.maxAcceptableLatency
      });
    }
    
    if (metrics.throughput?.averageThroughput < profile.minBitrate) {
      recommendations.push({
        type: 'throughput',
        priority: 'high',
        message: 'Throughput insuficiente. Verificar ancho de banda del servidor.',
        value: metrics.throughput.averageThroughput,
        threshold: profile.minBitrate
      });
    }
    
    if (metrics.connectivity?.reliability < profile.requiredStability) {
      recommendations.push({
        type: 'stability',
        priority: 'medium',
        message: 'Conexión inestable. Implementar retry automático con backoff exponencial.',
        value: metrics.connectivity.reliability,
        threshold: profile.requiredStability
      });
    }
    
    if (metrics.bufferAnalysis?.averageBufferHealth < profile.bufferHealthThreshold) {
      recommendations.push({
        type: 'buffering',
        priority: 'medium',
        message: 'Riesgo de buffering. Considerar pre-buffering o reducir calidad.',
        value: metrics.bufferAnalysis.averageBufferHealth,
        threshold: profile.bufferHealthThreshold
      });
    }
    
    return recommendations;
  }

  // Métodos privados faltantes
  #analyzeCacheability(headers) {
    const cacheControl = headers['cache-control'] || '';
    const expires = headers['expires'];
    const etag = headers['etag'];
    const lastModified = headers['last-modified'];

    return {
      hasCacheControl: !!cacheControl,
      hasExpires: !!expires,
      hasEtag: !!etag,
      hasLastModified: !!lastModified,
      maxAge: this.#extractMaxAge(cacheControl),
      isPublic: cacheControl.includes('public'),
      isPrivate: cacheControl.includes('private'),
      noCache: cacheControl.includes('no-cache')
    };
  }

  #analyzeServerCapabilities(headers) {
    const server = headers['server'] || '';
    const acceptRanges = headers['accept-ranges'] || '';
    const contentEncoding = headers['content-encoding'] || '';
    const connection = headers['connection'] || '';

    return {
      serverType: server,
      supportsRanges: acceptRanges.includes('bytes'),
      supportsCompression: !!contentEncoding,
      supportsKeepAlive: connection.toLowerCase().includes('keep-alive'),
      hasLoadBalancer: this.#detectLoadBalancer(headers)
    };
  }

  async #testRangeSupport(url) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'Range': 'bytes=0-1023' },
        signal: AbortSignal.timeout(5000)
      });
      return response.status === 206;
    } catch {
      return false;
    }
  }

  async #testCompressionSupport(url) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'Accept-Encoding': 'gzip, deflate, br' },
        signal: AbortSignal.timeout(5000)
      });
      return !!(response.headers.get('content-encoding'));
    } catch {
      return false;
    }
  }

  async #testKeepAliveSupport(url) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'Connection': 'keep-alive' },
        signal: AbortSignal.timeout(5000)
      });
      const connection = response.headers.get('connection') || '';
      return connection.toLowerCase().includes('keep-alive');
    } catch {
      return false;
    }
  }

  #calculateDeliveryScore(capabilities) {
    let score = 0.5; // Base score
    
    if (capabilities.rangeSupport) score += 0.15;
    if (capabilities.compressionSupport) score += 0.15;
    if (capabilities.keepAliveSupport) score += 0.1;
    if (capabilities.hasLoadBalancer) score += 0.1;
    
    return Math.min(1, score);
  }

  #extractMaxAge(cacheControl) {
    const match = cacheControl.match(/max-age=(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  #detectLoadBalancer(headers) {
    const indicators = [
      'x-forwarded-for',
      'x-real-ip',
      'x-load-balancer',
      'x-cluster-client-ip',
      'cf-ray' // Cloudflare
    ];
    
    return indicators.some(header => headers[header]);
  }

  async #analyzeInitialContent(url) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Range': 'bytes=0-4095' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        return { size: 0, type: 'unknown', sample: null };
      }
      
      const buffer = await response.arrayBuffer();
      const sample = new Uint8Array(buffer);
      
      return {
        size: sample.length,
        type: this.#detectContentType(sample, response.headers),
        sample: sample
      };
    } catch (error) {
      return { size: 0, type: 'unknown', sample: null, error: error.message };
    }
  }

  #detectStreamType(headers, contentAnalysis) {
    const contentType = headers.get('content-type') || '';
    
    if (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegURL')) {
      return 'hls';
    }
    
    if (contentType.includes('application/dash+xml')) {
      return 'dash';
    }
    
    if (contentType.includes('video/mp2t')) {
      return 'ts';
    }
    
    if (contentType.includes('video/mp4')) {
      return 'mp4';
    }
    
    // Análisis basado en contenido
    if (contentAnalysis && contentAnalysis.sample) {
      const sample = contentAnalysis.sample;
      
      // Detectar HLS por contenido
      if (this.#containsHLSMarkers(sample)) {
        return 'hls';
      }
      
      // Detectar TS por sync bytes
      if (this.#containsTSMarkers(sample)) {
        return 'ts';
      }
    }
    
    return 'unknown';
  }

  #detectContentType(sample, headers) {
    const contentType = headers.get('content-type') || '';
    
    if (contentType) {
      return contentType;
    }
    
    // Detectar por magic numbers
    if (sample.length >= 4) {
      // MP4 signature
      if (sample[4] === 0x66 && sample[5] === 0x74 && sample[6] === 0x79 && sample[7] === 0x70) {
        return 'video/mp4';
      }
      
      // TS signature
      if (sample[0] === 0x47) {
        return 'video/mp2t';
      }
    }
    
    // Detectar HLS por contenido de texto
    const text = new TextDecoder('utf-8', { fatal: false }).decode(sample.slice(0, 100));
    if (text.includes('#EXTM3U')) {
      return 'application/vnd.apple.mpegurl';
    }
    
    return 'application/octet-stream';
  }

  #containsHLSMarkers(sample) {
    try {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(sample.slice(0, 200));
      return text.includes('#EXTM3U') || text.includes('#EXT-X-');
    } catch {
      return false;
    }
  }

  #containsTSMarkers(sample) {
    // Buscar sync bytes de MPEG-TS (0x47)
    for (let i = 0; i < Math.min(sample.length - 188, 1000); i += 188) {
      if (sample[i] === 0x47) {
        return true;
      }
    }
    return false;
  }

  /**
   * Detecta problemas potenciales
   * @private
   */
  #detectPotentialIssues(metrics, profile) {
    const issues = [];
    
    // Detectar patrones problemáticos
    if (metrics.latency?.jitter > profile.maxJitter * 1.5) {
      issues.push({
        type: 'network_instability',
        severity: 'high',
        description: 'Jitter excesivo detectado, posible congestión de red'
      });
    }
    
    if (metrics.throughput?.variability > 0.5) {
      issues.push({
        type: 'throughput_variability',
        severity: 'medium',
        description: 'Throughput muy variable, posible limitación de ancho de banda'
      });
    }
    
    if (metrics.connectivity?.consecutiveFailures > 2) {
      issues.push({
        type: 'connection_drops',
        severity: 'high',
        description: 'Múltiples fallos consecutivos, servidor posiblemente sobrecargado'
      });
    }
    
    return issues;
  }

  /**
   * Analiza muestras de conectividad
   * @private
   */
  #analyzeConnectivitySamples(samples) {
    const successful = samples.filter(s => s.success);
    const reliability = successful.length / samples.length;
    
    const responseTimes = successful.map(s => s.responseTime);
    const avgResponseTime = responseTimes.length > 0 ? 
      responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length : 0;
    
    // Detectar fallos consecutivos
    let maxConsecutiveFailures = 0;
    let currentFailures = 0;
    
    for (const sample of samples) {
      if (!sample.success) {
        currentFailures++;
        maxConsecutiveFailures = Math.max(maxConsecutiveFailures, currentFailures);
      } else {
        currentFailures = 0;
      }
    }
    
    return {
      reliability,
      averageResponseTime: avgResponseTime,
      totalSamples: samples.length,
      successfulSamples: successful.length,
      consecutiveFailures: maxConsecutiveFailures,
      samples: samples.slice(-10) // Mantener últimas 10 muestras
    };
  }

  /**
   * Analiza distribución de latencia
   * @private
   */
  #analyzeLatencyDistribution(latencies) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    const jitter = max - min;
    
    // Calcular variabilidad
    const variance = latencies.reduce((sum, lat) => sum + Math.pow(lat - avg, 2), 0) / latencies.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avg;
    
    return {
      averageLatency: avg,
      medianLatency: median,
      p95Latency: p95,
      minLatency: min,
      maxLatency: max,
      jitter,
      standardDeviation: stdDev,
      variability: coefficientOfVariation,
      distribution: {
        low: latencies.filter(l => l < avg - stdDev).length,
        normal: latencies.filter(l => l >= avg - stdDev && l <= avg + stdDev).length,
        high: latencies.filter(l => l > avg + stdDev).length
      }
    };
  }

  /**
   * Analiza sesiones de throughput
   * @private
   */
  #analyzeThroughputSessions(sessions) {
    const successful = sessions.filter(s => s.success);
    
    if (successful.length === 0) {
      return {
        averageThroughput: 0,
        stability: 0,
        variability: 1,
        sessions: sessions
      };
    }
    
    const throughputs = successful.map(s => s.averageThroughput);
    const avgThroughput = throughputs.reduce((sum, t) => sum + t, 0) / throughputs.length;
    
    // Calcular estabilidad
    const variance = throughputs.reduce((sum, t) => sum + Math.pow(t - avgThroughput, 2), 0) / throughputs.length;
    const stdDev = Math.sqrt(variance);
    const stability = Math.max(0, 1 - (stdDev / avgThroughput));
    const variability = stdDev / avgThroughput;
    
    return {
      averageThroughput: avgThroughput,
      stability,
      variability,
      sessions: sessions.map(s => ({
        session: s.session,
        success: s.success,
        throughput: s.averageThroughput,
        duration: s.duration
      }))
    };
  }

  /**
   * Analiza tests de buffer
   * @private
   */
  #analyzeBufferTests(tests) {
    const successful = tests.filter(t => t.success);
    
    if (successful.length === 0) {
      return {
        averageBufferHealth: 0,
        firstByteLatency: 0,
        bufferStability: 0
      };
    }
    
    const avgBufferHealth = successful.reduce((sum, t) => sum + t.bufferHealth, 0) / successful.length;
    const avgFirstByte = successful.reduce((sum, t) => sum + t.firstByteTime, 0) / successful.length;
    
    const bufferHealthValues = successful.map(t => t.bufferHealth);
    const bufferVariance = bufferHealthValues.reduce((sum, bh) => sum + Math.pow(bh - avgBufferHealth, 2), 0) / bufferHealthValues.length;
    const bufferStability = Math.max(0, 1 - Math.sqrt(bufferVariance));
    
    return {
      averageBufferHealth: avgBufferHealth,
      firstByteLatency: avgFirstByte,
      bufferStability,
      tests: tests
    };
  }

  /**
   * Actualiza historial de métricas
   * @private
   */
  #updateMetricsHistory(url, result) {
    if (!this.#metricsHistory.has(url)) {
      this.#metricsHistory.set(url, []);
    }
    
    const history = this.#metricsHistory.get(url);
    history.push({
      timestamp: result.timestamp,
      qualityScore: result.qualityScore,
      bufferingRisk: result.bufferingRisk.level,
      isStreamable: result.isStreamable
    });
    
    // Mantener solo últimos 20 registros
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
    
    this.#metricsHistory.set(url, history);
  }

  /**
   * Obtiene historial de métricas
   */
  getMetricsHistory(url) {
    return this.#metricsHistory.get(url) || [];
  }

  /**
   * Obtiene tendencias de calidad
   */
  getQualityTrends(url) {
    const history = this.getMetricsHistory(url);
    if (history.length < 2) return null;
    
    const recent = history.slice(-5);
    const older = history.slice(-10, -5);
    
    const recentAvg = recent.reduce((sum, h) => sum + h.qualityScore, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((sum, h) => sum + h.qualityScore, 0) / older.length : recentAvg;
    
    const trend = recentAvg > olderAvg ? 'improving' : recentAvg < olderAvg ? 'degrading' : 'stable';
    
    return {
      trend,
      recentQuality: recentAvg,
      previousQuality: olderAvg,
      change: recentAvg - olderAvg
    };
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
      trackedStreams: this.#metricsHistory.size,
      totalAnalyses: Array.from(this.#metricsHistory.values()).reduce((sum, history) => sum + history.length, 0),
      qualityProfiles: Object.keys(this.#qualityProfiles)
    };
  }
}