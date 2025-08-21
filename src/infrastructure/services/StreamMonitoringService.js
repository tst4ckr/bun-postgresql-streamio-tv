import { StreamQualityValidator } from './StreamQualityValidator.js';
import { TVAddonConfig } from '../config/TVAddonConfig.js';
import { ErrorHandler, MonitoringError } from '../error/ErrorHandler.js';
import EventEmitter from 'events';

/**
 * Servicio de monitoreo continuo de calidad de streams
 * Detecta problemas de audio/video en tiempo real
 */
class StreamMonitoringService extends EventEmitter {
    constructor() {
        super();
        this.config = TVAddonConfig.getInstance();
        this.validator = new StreamQualityValidator();
        this.monitoredStreams = new Map();
        this.monitoringIntervals = new Map();
        this.alertThresholds = {
            consecutiveFailures: 3,
            failureRate: 0.3, // 30%
            monitoringInterval: 30000, // 30 segundos
            alertCooldown: 300000 // 5 minutos
        };
        this.lastAlerts = new Map();
    }

    /**
     * Inicia el monitoreo de un stream
     * @param {string} streamUrl - URL del stream a monitorear
     * @param {Object} options - Opciones de monitoreo
     * @returns {string} ID del monitoreo
     */
    startMonitoring(streamUrl, options = {}) {
        const {
            checkAudio = true,
            checkVideo = true,
            interval = this.alertThresholds.monitoringInterval,
            alertOnFailure = true
        } = options;

        const monitoringId = this._generateMonitoringId(streamUrl);
        
        // Si ya está siendo monitoreado, detener el anterior
        if (this.monitoringIntervals.has(monitoringId)) {
            this.stopMonitoring(monitoringId);
        }

        const monitoringData = {
            id: monitoringId,
            streamUrl,
            options: { checkAudio, checkVideo, alertOnFailure },
            startTime: Date.now(),
            lastCheck: null,
            consecutiveFailures: 0,
            totalChecks: 0,
            failedChecks: 0,
            status: 'active',
            lastValidationResult: null
        };

        this.monitoredStreams.set(monitoringId, monitoringData);

        // Configurar intervalo de monitoreo
        const intervalId = setInterval(async () => {
            await this._performMonitoringCheck(monitoringId);
        }, interval);

        this.monitoringIntervals.set(monitoringId, intervalId);

        // Realizar primera verificación inmediatamente
        setImmediate(() => this._performMonitoringCheck(monitoringId));

        this.emit('monitoringStarted', { monitoringId, streamUrl });
        
        return monitoringId;
    }

    /**
     * Detiene el monitoreo de un stream
     * @param {string} monitoringId - ID del monitoreo
     */
    stopMonitoring(monitoringId) {
        const intervalId = this.monitoringIntervals.get(monitoringId);
        if (intervalId) {
            clearInterval(intervalId);
            this.monitoringIntervals.delete(monitoringId);
        }

        const monitoringData = this.monitoredStreams.get(monitoringId);
        if (monitoringData) {
            monitoringData.status = 'stopped';
            monitoringData.endTime = Date.now();
            
            this.emit('monitoringStopped', { 
                monitoringId, 
                streamUrl: monitoringData.streamUrl,
                duration: monitoringData.endTime - monitoringData.startTime,
                stats: this._getMonitoringStats(monitoringId)
            });
        }
    }

    /**
     * Realiza una verificación de monitoreo
     * @private
     */
    async _performMonitoringCheck(monitoringId) {
        const monitoringData = this.monitoredStreams.get(monitoringId);
        if (!monitoringData || monitoringData.status !== 'active') {
            return;
        }

        try {
            const { streamUrl, options } = monitoringData;
            
            // Realizar validación de calidad
            const validationResult = await this.validator.validateStreamQuality(streamUrl, {
                checkAudio: options.checkAudio,
                checkVideo: options.checkVideo,
                sampleDuration: 5000, // 5 segundos para monitoreo
                timeout: 15000 // 15 segundos timeout
            });

            // Actualizar datos de monitoreo
            monitoringData.lastCheck = Date.now();
            monitoringData.totalChecks++;
            monitoringData.lastValidationResult = validationResult;

            if (validationResult.isValid) {
                monitoringData.consecutiveFailures = 0;
                this.emit('streamHealthy', { monitoringId, streamUrl, validationResult });
            } else {
                monitoringData.consecutiveFailures++;
                monitoringData.failedChecks++;
                
                this.emit('streamUnhealthy', { monitoringId, streamUrl, validationResult });
                
                // Verificar si se debe enviar alerta
                if (options.alertOnFailure) {
                    await this._checkAndSendAlert(monitoringId, validationResult);
                }
            }

        } catch (error) {
            ErrorHandler.logError('StreamMonitoringService', error);
            
            monitoringData.consecutiveFailures++;
            monitoringData.failedChecks++;
            monitoringData.lastCheck = Date.now();
            
            this.emit('monitoringError', { 
                monitoringId, 
                streamUrl: monitoringData.streamUrl, 
                error: error.message 
            });
        }
    }

    /**
     * Verifica y envía alertas si es necesario
     * @private
     */
    async _checkAndSendAlert(monitoringId, validationResult) {
        const monitoringData = this.monitoredStreams.get(monitoringId);
        if (!monitoringData) return;

        const { streamUrl, consecutiveFailures, totalChecks, failedChecks } = monitoringData;
        const failureRate = totalChecks > 0 ? failedChecks / totalChecks : 0;
        
        // Verificar umbrales de alerta
        const shouldAlert = 
            consecutiveFailures >= this.alertThresholds.consecutiveFailures ||
            (totalChecks >= 10 && failureRate >= this.alertThresholds.failureRate);

        if (!shouldAlert) return;

        // Verificar cooldown de alertas
        const lastAlert = this.lastAlerts.get(monitoringId);
        const now = Date.now();
        
        if (lastAlert && (now - lastAlert) < this.alertThresholds.alertCooldown) {
            return;
        }

        // Enviar alerta
        const alertData = {
            monitoringId,
            streamUrl,
            alertType: consecutiveFailures >= this.alertThresholds.consecutiveFailures ? 
                'consecutive_failures' : 'high_failure_rate',
            consecutiveFailures,
            failureRate,
            validationResult,
            timestamp: now
        };

        this.lastAlerts.set(monitoringId, now);
        this.emit('streamAlert', alertData);
        
        // Log crítico
        ErrorHandler.logError('StreamMonitoringService', 
            new MonitoringError(`Stream quality alert: ${streamUrl} - ${alertData.alertType}`)
        );
    }

    /**
     * Obtiene estadísticas de monitoreo
     * @param {string} monitoringId - ID del monitoreo
     * @returns {Object} Estadísticas del monitoreo
     */
    _getMonitoringStats(monitoringId) {
        const monitoringData = this.monitoredStreams.get(monitoringId);
        if (!monitoringData) return null;

        const { totalChecks, failedChecks, startTime, endTime, lastCheck } = monitoringData;
        const duration = (endTime || Date.now()) - startTime;
        const successRate = totalChecks > 0 ? ((totalChecks - failedChecks) / totalChecks) : 0;

        return {
            totalChecks,
            failedChecks,
            successRate,
            duration,
            averageInterval: totalChecks > 1 ? duration / (totalChecks - 1) : 0,
            lastCheck
        };
    }

    /**
     * Obtiene el estado actual de un monitoreo
     * @param {string} monitoringId - ID del monitoreo
     * @returns {Object|null} Estado del monitoreo
     */
    getMonitoringStatus(monitoringId) {
        const monitoringData = this.monitoredStreams.get(monitoringId);
        if (!monitoringData) return null;

        return {
            ...monitoringData,
            stats: this._getMonitoringStats(monitoringId)
        };
    }

    /**
     * Obtiene todos los monitoreos activos
     * @returns {Array} Lista de monitoreos activos
     */
    getActiveMonitorings() {
        const activeMonitorings = [];
        
        for (const [id, data] of this.monitoredStreams.entries()) {
            if (data.status === 'active') {
                activeMonitorings.push({
                    ...data,
                    stats: this._getMonitoringStats(id)
                });
            }
        }
        
        return activeMonitorings;
    }

    /**
     * Detiene todos los monitoreos activos
     */
    stopAllMonitorings() {
        const activeIds = Array.from(this.monitoringIntervals.keys());
        
        for (const id of activeIds) {
            this.stopMonitoring(id);
        }
        
        this.emit('allMonitoringsStopped', { count: activeIds.length });
    }

    /**
     * Configura los umbrales de alerta
     * @param {Object} thresholds - Nuevos umbrales
     */
    setAlertThresholds(thresholds) {
        this.alertThresholds = {
            ...this.alertThresholds,
            ...thresholds
        };
        
        this.emit('thresholdsUpdated', this.alertThresholds);
    }

    /**
     * Genera un ID único para el monitoreo
     * @private
     */
    _generateMonitoringId(streamUrl) {
        return `monitor_${Buffer.from(streamUrl).toString('base64').slice(0, 12)}_${Date.now()}`;
    }

    /**
     * Limpia datos de monitoreos antiguos
     * @param {number} maxAge - Edad máxima en milisegundos (default: 1 hora)
     */
    cleanupOldMonitorings(maxAge = 3600000) {
        const now = Date.now();
        const toDelete = [];
        
        for (const [id, data] of this.monitoredStreams.entries()) {
            if (data.status !== 'active' && data.endTime && (now - data.endTime) > maxAge) {
                toDelete.push(id);
            }
        }
        
        for (const id of toDelete) {
            this.monitoredStreams.delete(id);
            this.lastAlerts.delete(id);
        }
        
        // Limpiar también resultados del validador
        this.validator.cleanupOldResults(maxAge);
        
        if (toDelete.length > 0) {
            this.emit('oldMonitoringsCleanedUp', { count: toDelete.length });
        }
    }

    /**
     * Obtiene un resumen del estado general del servicio
     * @returns {Object} Resumen del estado
     */
    getServiceSummary() {
        const activeMonitorings = this.getActiveMonitorings();
        const totalMonitorings = this.monitoredStreams.size;
        
        let totalChecks = 0;
        let totalFailures = 0;
        let healthyStreams = 0;
        
        for (const monitoring of activeMonitorings) {
            totalChecks += monitoring.totalChecks;
            totalFailures += monitoring.failedChecks;
            
            if (monitoring.consecutiveFailures === 0) {
                healthyStreams++;
            }
        }
        
        return {
            activeMonitorings: activeMonitorings.length,
            totalMonitorings,
            healthyStreams,
            unhealthyStreams: activeMonitorings.length - healthyStreams,
            overallSuccessRate: totalChecks > 0 ? ((totalChecks - totalFailures) / totalChecks) : 0,
            alertThresholds: this.alertThresholds
        };
    }
}

export { StreamMonitoringService };