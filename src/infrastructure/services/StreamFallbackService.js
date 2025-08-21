import { StreamQualityValidator } from './StreamQualityValidator.js';
import { TVAddonConfig } from '../config/TVAddonConfig.js';
import { ErrorHandler, FallbackError } from '../error/ErrorHandler.js';
import EventEmitter from 'events';

/**
 * Servicio de fallback automático para streams con problemas
 * Proporciona alternativas cuando se detectan problemas de audio/video
 */
class StreamFallbackService extends EventEmitter {
    constructor() {
        super();
        this.config = TVAddonConfig.getInstance();
        this.validator = new StreamQualityValidator();
        this.fallbackCache = new Map();
        this.fallbackAttempts = new Map();
        this.maxFallbackAttempts = 3;
        this.fallbackCooldown = 60000; // 1 minuto
    }

    /**
     * Obtiene un stream con fallback automático
     * @param {Object} channel - Canal solicitado
     * @param {Object} options - Opciones de fallback
     * @returns {Promise<Object>} Stream validado o alternativa
     */
    async getStreamWithFallback(channel, options = {}) {
        const {
            validateQuality = true,
            maxAttempts = this.maxFallbackAttempts,
            timeout = 30000,
            preferredQuality = null
        } = options;

        try {
            // Obtener streams disponibles para el canal
            const availableStreams = this._getAvailableStreams(channel, preferredQuality);
            
            if (availableStreams.length === 0) {
                throw new FallbackError(`No streams available for channel: ${channel.name}`);
            }

            let lastError = null;
            let geoBlockedCount = 0;
            let timeoutCount = 0;

            // Intentar cada stream hasta encontrar uno válido
            for (let attempt = 0; attempt < Math.min(maxAttempts, availableStreams.length); attempt++) {
                const stream = availableStreams[attempt];
                
                try {
                    // Validar calidad si está habilitado
                    if (validateQuality) {
                        // Analizar errores previos para determinar timeout adaptativo
                        const previousErrorType = lastError ? this._analyzeErrorType(lastError) : 'unknown';
                        
                        const validationResult = await this.validator.validateStreamQuality(stream.url, {
                            checkAudio: true,
                            checkVideo: true,
                            timeout: this._getAdaptiveTimeout(stream, attempt, timeout, previousErrorType)
                        });

                        if (validationResult.isValid) {
                            this._recordSuccessfulFallback(channel.id, stream, attempt);
                            return {
                                success: true,
                                stream,
                                fallbackUsed: attempt > 0,
                                attempt,
                                validationResult
                            };
                        } else {
                            // Analizar tipo de error para estrategias específicas
                            const errorType = this._analyzeErrorType(validationResult);
                            this._recordFailedAttempt(channel.id, stream, validationResult, errorType);
                            
                            if (errorType === 'geo-blocked') {
                                geoBlockedCount++;
                            } else if (errorType === 'timeout') {
                                timeoutCount++;
                            }
                            
                            lastError = validationResult;
                            continue;
                        }
                    } else {
                        // Sin validación, usar el primer stream disponible
                        return {
                            success: true,
                            stream,
                            fallbackUsed: attempt > 0,
                            attempt,
                            validationResult: null
                        };
                    }
                } catch (error) {
                    const errorType = this._analyzeErrorType({ error: error.message });
                    this._recordFailedAttempt(channel.id, stream, { error: error.message }, errorType);
                    lastError = { error: error.message };
                    continue;
                }
            }

            // Generar mensaje de error específico según el patrón de fallos
            const errorMessage = this._generateSpecificErrorMessage(channel.name, geoBlockedCount, timeoutCount, lastError);
            throw new FallbackError(errorMessage);

        } catch (error) {
            ErrorHandler.logError('StreamFallbackService', error);
            
            return {
                success: false,
                error: error.message,
                fallbackUsed: false,
                attempt: 0
            };
        }
    }

    /**
     * Obtiene streams disponibles para un canal
     * @private
     */
    _getAvailableStreams(channel, preferredQuality = null) {
        const streams = [];
        
        // Stream principal
        if (channel.streamUrl) {
            streams.push({
                url: channel.streamUrl,
                quality: channel.quality?.value || 'unknown',
                type: 'primary',
                priority: 1
            });
        }

        // Streams alternativos si están disponibles
        if (channel.alternativeUrls && Array.isArray(channel.alternativeUrls)) {
            channel.alternativeUrls.forEach((altUrl, index) => {
                streams.push({
                    url: altUrl,
                    quality: 'unknown',
                    type: 'alternative',
                    priority: 2 + index
                });
            });
        }

        // Ordenar por prioridad y calidad preferida
        return this._sortStreamsByPreference(streams, preferredQuality);
    }

    /**
     * Ordena streams por preferencia
     * @private
     */
    _sortStreamsByPreference(streams, preferredQuality) {
        return streams.sort((a, b) => {
            // Prioridad por calidad preferida
            if (preferredQuality) {
                const aMatchesPreferred = a.quality === preferredQuality ? 0 : 1;
                const bMatchesPreferred = b.quality === preferredQuality ? 0 : 1;
                
                if (aMatchesPreferred !== bMatchesPreferred) {
                    return aMatchesPreferred - bMatchesPreferred;
                }
            }

            // Prioridad por tipo (primario antes que alternativo)
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }

            // Prioridad por historial de éxito
            const aSuccessRate = this._getStreamSuccessRate(a.url);
            const bSuccessRate = this._getStreamSuccessRate(b.url);
            
            return bSuccessRate - aSuccessRate;
        });
    }

    /**
     * Obtiene la tasa de éxito de un stream
     * @private
     */
    _getStreamSuccessRate(streamUrl) {
        const cacheKey = this._generateCacheKey(streamUrl);
        const cached = this.fallbackCache.get(cacheKey);
        
        if (!cached || cached.attempts === 0) {
            return 0.5; // Valor neutral para streams sin historial
        }
        
        return cached.successes / cached.attempts;
    }

    /**
     * Registra un fallback exitoso
     * @private
     */
    _recordSuccessfulFallback(channelId, stream, attempt) {
        const cacheKey = this._generateCacheKey(stream.url);
        const cached = this.fallbackCache.get(cacheKey) || {
            url: stream.url,
            attempts: 0,
            successes: 0,
            failures: 0,
            lastSuccess: null,
            lastFailure: null
        };

        cached.attempts++;
        cached.successes++;
        cached.lastSuccess = Date.now();
        
        this.fallbackCache.set(cacheKey, cached);
        
        this.emit('fallbackSuccess', {
            channelId,
            stream,
            attempt,
            successRate: cached.successes / cached.attempts
        });
    }

    /**
     * Analiza el tipo de error para aplicar estrategias específicas
     * @private
     */
    _analyzeErrorType(validationResult) {
        if (!validationResult) return 'unknown';
        
        const issues = validationResult.issues || [];
        const errorMessage = validationResult.error || '';
        const audioStatus = validationResult.audioStatus;
        const videoStatus = validationResult.videoStatus;
        
        // Detectar problemas de contenido multimedia específicos
        if (audioStatus && videoStatus) {
            const noAudioMarkers = audioStatus.issues?.some(issue => 
                issue.includes('No audio markers detected')
            );
            const noVideoMarkers = videoStatus.issues?.some(issue => 
                issue.includes('No video markers detected')
            );
            const inconsistentAudio = audioStatus.issues?.some(issue => 
                issue.includes('Inconsistent audio data pattern')
            );
            const inconsistentVideo = videoStatus.issues?.some(issue => 
                issue.includes('Inconsistent video data pattern')
            );
            
            // Si no hay marcadores de audio/video pero el stream responde, es un problema de contenido
            if ((noAudioMarkers || noVideoMarkers) && validationResult.metadata?.contentType) {
                return 'content-invalid';
            }
            
            // Si hay inconsistencias en los datos
            if (inconsistentAudio || inconsistentVideo) {
                return 'content-corrupted';
            }
        }
        
        // Detectar errores de geo-bloqueo con mayor precisión
        if (issues.some(issue => 
            issue.includes('403') || 
            issue.includes('Forbidden') ||
            issue.includes('geo') ||
            issue.includes('blocked') ||
            issue.includes('region') ||
            issue.includes('country') ||
            issue.includes('location') ||
            issue.includes('territory')
        ) || errorMessage.includes('403')) {
            // Verificar si es específicamente geo-blocking
            if (issues.some(issue => 
                issue.includes('geo') || 
                issue.includes('blocked') ||
                issue.includes('region') ||
                issue.includes('country') ||
                issue.includes('location') ||
                issue.includes('territory')
            ) || this.config.fallback?.enableGeoBlockDetection) {
                return 'geo-blocked';
            }
            return 'access-denied';
        }
        
        // Detectar timeouts específicos
        if (issues.some(issue => 
            issue.includes('timeout') ||
            issue.includes('timed out') ||
            issue.includes('ECONNRESET') ||
            issue.includes('ETIMEDOUT') ||
            issue.includes('exceeded') ||
            issue.includes('slow response')
        ) || errorMessage.includes('timeout')) {
            return 'timeout';
        }
        
        // Detectar errores de red específicos
        if (issues.some(issue => 
            issue.includes('ENOTFOUND') ||
            issue.includes('ECONNREFUSED') ||
            issue.includes('network') ||
            issue.includes('connection') ||
            issue.includes('unreachable') ||
            issue.includes('refused') ||
            issue.includes('reset') ||
            issue.includes('aborted')
        )) {
            return 'network';
        }
        
        // Detectar errores de servidor
        if (issues.some(issue => 
            issue.includes('500') ||
            issue.includes('502') ||
            issue.includes('503') ||
            issue.includes('504') ||
            issue.includes('internal server error')
        )) {
            return 'server-error';
        }
        
        return 'unknown';
    }

    /**
     * Calcula timeout adaptativo basado en el historial del stream
     * @private
     * @param {Object} stream
     * @param {number} attempt
     * @param {number} baseTimeout
     * @param {string} errorType
     * @returns {number}
     */
    _getAdaptiveTimeout(stream, attempt, baseTimeout, errorType = 'unknown') {
         // Timeout específico por tipo de error usando configuración
         let specificTimeout = baseTimeout;
         
         switch (errorType) {
              case 'geo-blocked':
                  specificTimeout = this.config.fallback?.geoBlockedTimeout || 8000;
                  break;
              case 'access-denied':
                  specificTimeout = this.config.fallback?.accessDeniedTimeout || 6000;
                  break;
              case 'timeout':
                  specificTimeout = this.config.fallback?.networkErrorTimeout || 12000;
                  break;
              case 'network':
                  specificTimeout = this.config.fallback?.networkErrorTimeout || 12000;
                  break;
              case 'server-error':
                  specificTimeout = this.config.fallback?.serverErrorTimeout || 10000;
                  break;
              case 'content-invalid':
                  specificTimeout = this.config.fallback?.contentInvalidTimeout || 5000;
                  break;
              case 'content-corrupted':
                  specificTimeout = this.config.fallback?.contentCorruptedTimeout || 7000;
                  break;
              default:
                  specificTimeout = baseTimeout;
          }
         
         // Ajustar basado en tasa de éxito
         const successRate = this._getStreamSuccessRate(stream.url);
         const successMultiplier = successRate > 0.7 ? 1.2 : (successRate < 0.3 ? 0.8 : 1.0);
         
         // Incrementar timeout con cada intento
         const attemptMultiplier = 1 + (attempt * 0.3);
         
         return Math.round(specificTimeout * successMultiplier * attemptMultiplier);
     }

    /**
     * Genera mensaje de error específico según patrones de fallo
     * @private
     * @param {string} channelName
     * @param {number} geoBlockedCount
     * @param {number} timeoutCount
     * @param {Object} lastError
     * @returns {string}
     */
    _generateSpecificErrorMessage(channelName, geoBlockedCount, timeoutCount, lastError) {
        // Analizar el último error para obtener más contexto
        const lastErrorType = lastError ? this._analyzeErrorType(lastError) : 'unknown';
        
        if (geoBlockedCount > 0 || lastErrorType === 'geo-blocked') {
            return `Stream geo-bloqueado para canal: ${channelName}. Este contenido no está disponible en tu región.`;
        }
        
        if (lastErrorType === 'access-denied') {
            return `Acceso denegado para canal: ${channelName}. El servidor rechazó la conexión.`;
        }
        
        if (lastErrorType === 'content-invalid') {
            return `Contenido inválido para canal: ${channelName}. El stream no contiene datos de audio/video válidos.`;
        }
        
        if (lastErrorType === 'content-corrupted') {
            return `Contenido corrupto para canal: ${channelName}. Los datos de audio/video están dañados o incompletos.`;
        }
        
        if (timeoutCount > 0 || lastErrorType === 'timeout') {
            return `Timeout en streams para canal: ${channelName}. Los servidores están respondiendo lentamente.`;
        }
        
        if (lastErrorType === 'network') {
            return `Error de red para canal: ${channelName}. Problemas de conectividad con el servidor.`;
        }
        
        if (lastErrorType === 'server-error') {
            return `Error del servidor para canal: ${channelName}. El servidor está experimentando problemas técnicos.`;
        }
        
        if (lastError && lastError.issues) {
            const mainIssue = lastError.issues[0] || 'Unknown error';
            return `All streams failed for channel "${channelName}": ${mainIssue}`;
        }
        
        return `All fallback attempts failed for channel: ${channelName}`;
    }

    /**
     * Registra un intento fallido
     * @private
     */
    _recordFailedAttempt(channelId, stream, validationResult, errorType = 'unknown') {
        const cacheKey = this._generateCacheKey(stream.url);
        const cached = this.fallbackCache.get(cacheKey) || {
            url: stream.url,
            attempts: 0,
            successes: 0,
            failures: 0,
            lastSuccess: null,
            lastFailure: null,
            errorTypes: {}
        };

        cached.attempts++;
        cached.failures++;
        cached.lastFailure = Date.now();
        
        // Registrar tipo de error para estadísticas
        if (!cached.errorTypes[errorType]) {
            cached.errorTypes[errorType] = 0;
        }
        cached.errorTypes[errorType]++;
        
        this.fallbackCache.set(cacheKey, cached);
        
        this.emit('fallbackFailure', {
            channelId,
            stream,
            validationResult,
            errorType,
            attempt: cached.attempts
        });
    }

    /**
     * Verifica si un stream está en cooldown
     * @param {string} streamUrl - URL del stream
     * @returns {boolean} True si está en cooldown
     */
    isStreamInCooldown(streamUrl) {
        const cacheKey = this._generateCacheKey(streamUrl);
        const cached = this.fallbackCache.get(cacheKey);
        
        if (!cached || !cached.lastFailure) {
            return false;
        }
        
        return (Date.now() - cached.lastFailure) < this.fallbackCooldown;
    }

    /**
     * Obtiene estadísticas de fallback para un canal
     * @param {string} channelId - ID del canal
     * @returns {Object} Estadísticas de fallback
     */
    getChannelFallbackStats(channelId) {
        const attempts = this.fallbackAttempts.get(channelId) || [];
        
        if (attempts.length === 0) {
            return {
                totalAttempts: 0,
                successfulFallbacks: 0,
                failedFallbacks: 0,
                averageAttempts: 0,
                lastAttempt: null
            };
        }
        
        const successful = attempts.filter(a => a.success).length;
        const failed = attempts.length - successful;
        const avgAttempts = attempts.reduce((sum, a) => sum + a.attempt, 0) / attempts.length;
        
        return {
            totalAttempts: attempts.length,
            successfulFallbacks: successful,
            failedFallbacks: failed,
            averageAttempts: avgAttempts,
            lastAttempt: attempts[attempts.length - 1]
        };
    }

    /**
     * Obtiene estadísticas globales del servicio
     * @returns {Object} Estadísticas globales
     */
    getGlobalStats() {
        const allStreams = Array.from(this.fallbackCache.values());
        
        if (allStreams.length === 0) {
            return {
                totalStreams: 0,
                totalAttempts: 0,
                totalSuccesses: 0,
                totalFailures: 0,
                overallSuccessRate: 0,
                healthyStreams: 0,
                unhealthyStreams: 0
            };
        }
        
        const totalAttempts = allStreams.reduce((sum, s) => sum + s.attempts, 0);
        const totalSuccesses = allStreams.reduce((sum, s) => sum + s.successes, 0);
        const totalFailures = allStreams.reduce((sum, s) => sum + s.failures, 0);
        
        const healthyStreams = allStreams.filter(s => {
            const successRate = s.attempts > 0 ? s.successes / s.attempts : 0;
            return successRate >= 0.7; // 70% o más de éxito
        }).length;
        
        return {
            totalStreams: allStreams.length,
            totalAttempts,
            totalSuccesses,
            totalFailures,
            overallSuccessRate: totalAttempts > 0 ? totalSuccesses / totalAttempts : 0,
            healthyStreams,
            unhealthyStreams: allStreams.length - healthyStreams
        };
    }

    /**
     * Limpia el caché de fallbacks antiguos
     * @param {number} maxAge - Edad máxima en milisegundos (default: 24 horas)
     */
    cleanupOldCache(maxAge = 86400000) {
        const now = Date.now();
        const toDelete = [];
        
        for (const [key, cached] of this.fallbackCache.entries()) {
            const lastActivity = Math.max(cached.lastSuccess || 0, cached.lastFailure || 0);
            
            if (lastActivity && (now - lastActivity) > maxAge) {
                toDelete.push(key);
            }
        }
        
        for (const key of toDelete) {
            this.fallbackCache.delete(key);
        }
        
        if (toDelete.length > 0) {
            this.emit('cacheCleanedUp', { removedEntries: toDelete.length });
        }
    }

    /**
     * Configura parámetros del servicio
     * @param {Object} config - Nueva configuración
     */
    configure(config) {
        if (config.maxFallbackAttempts !== undefined) {
            this.maxFallbackAttempts = config.maxFallbackAttempts;
        }
        
        if (config.fallbackCooldown !== undefined) {
            this.fallbackCooldown = config.fallbackCooldown;
        }
        
        this.emit('configurationUpdated', {
            maxFallbackAttempts: this.maxFallbackAttempts,
            fallbackCooldown: this.fallbackCooldown
        });
    }

    /**
     * Genera una clave de caché para un stream
     * @private
     */
    _generateCacheKey(streamUrl) {
        return Buffer.from(streamUrl).toString('base64').slice(0, 16);
    }

    /**
     * Fuerza la limpieza de un stream específico del caché
     * @param {string} streamUrl - URL del stream
     */
    clearStreamCache(streamUrl) {
        const cacheKey = this._generateCacheKey(streamUrl);
        const existed = this.fallbackCache.has(cacheKey);
        
        this.fallbackCache.delete(cacheKey);
        
        if (existed) {
            this.emit('streamCacheCleared', { streamUrl });
        }
    }

    /**
     * Obtiene información detallada de un stream
     * @param {string} streamUrl - URL del stream
     * @returns {Object|null} Información del stream
     */
    getStreamInfo(streamUrl) {
        const cacheKey = this._generateCacheKey(streamUrl);
        return this.fallbackCache.get(cacheKey) || null;
    }
}

export { StreamFallbackService };