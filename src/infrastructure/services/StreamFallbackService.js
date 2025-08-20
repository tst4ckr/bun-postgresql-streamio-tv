const { StreamQualityValidator } = require('./StreamQualityValidator');
const { TVAddonConfig } = require('../config/TVAddonConfig');
const { ErrorHandler, FallbackError } = require('../error/ErrorHandler');
const EventEmitter = require('events');

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

            // Intentar cada stream hasta encontrar uno válido
            for (let attempt = 0; attempt < Math.min(maxAttempts, availableStreams.length); attempt++) {
                const stream = availableStreams[attempt];
                
                try {
                    // Validar calidad si está habilitado
                    if (validateQuality) {
                        const validationResult = await this.validator.validateStreamQuality(stream.url, {
                            checkAudio: true,
                            checkVideo: true,
                            timeout: timeout / 2
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
                            this._recordFailedAttempt(channel.id, stream, validationResult);
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
                    this._recordFailedAttempt(channel.id, stream, { error: error.message });
                    continue;
                }
            }

            // Si llegamos aquí, todos los streams fallaron
            throw new FallbackError(`All fallback attempts failed for channel: ${channel.name}`);

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
        if (channel.url) {
            streams.push({
                url: channel.url,
                quality: channel.quality || 'unknown',
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
     * Registra un intento fallido
     * @private
     */
    _recordFailedAttempt(channelId, stream, validationResult) {
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
        cached.failures++;
        cached.lastFailure = Date.now();
        
        this.fallbackCache.set(cacheKey, cached);
        
        this.emit('fallbackFailure', {
            channelId,
            stream,
            validationResult,
            successRate: cached.successes / cached.attempts
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

module.exports = { StreamFallbackService };