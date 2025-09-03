import { EventEmitter } from 'events';
import os from 'os';

/**
 * Servicio de control de flujo para prevenir sobrecarga del proceso principal
 * Implementa throttling dinámico basado en recursos del sistema
 */
class ProcessFlowControlService extends EventEmitter {
    constructor(logger, config = {}) {
        super();
        this.logger = logger;
        this.config = {
            memoryThreshold: config.memoryThreshold || 70, // Porcentaje de memoria
            cpuThreshold: config.cpuThreshold || 80, // Porcentaje de CPU
            checkInterval: config.checkInterval || 5000, // ms
            backoffMultiplier: config.backoffMultiplier || 1.5,
            maxBackoffDelay: config.maxBackoffDelay || 30000, // ms
            minConcurrency: config.minConcurrency || 1,
            maxConcurrency: config.maxConcurrency || 10,
            ...config
        };
        
        this.currentConcurrency = this.config.maxConcurrency;
        this.backoffDelay = 0;
        this.isThrottling = false;
        this.activeOperations = 0;
        this.pendingOperations = [];
        
        this.startMonitoring();
    }

    /**
     * Inicia el monitoreo de recursos del sistema
     */
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this.checkSystemResources();
        }, this.config.checkInterval);
        
        this.logger.debug('[ProcessFlowControlService] Monitoreo de recursos iniciado');
    }

    /**
     * Detiene el monitoreo de recursos
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }

    /**
     * Verifica los recursos del sistema y ajusta la concurrencia
     */
    async checkSystemResources() {
        try {
            const memoryUsage = this.getMemoryUsagePercentage();
            const cpuUsage = await this.getCpuUsagePercentage();
            
            const shouldThrottle = memoryUsage > this.config.memoryThreshold || 
                                 cpuUsage > this.config.cpuThreshold;
            
            if (shouldThrottle && !this.isThrottling) {
                this.startThrottling(memoryUsage, cpuUsage);
            } else if (!shouldThrottle && this.isThrottling) {
                this.stopThrottling();
            }
            
            this.emit('resourceCheck', {
                memory: memoryUsage,
                cpu: cpuUsage,
                concurrency: this.currentConcurrency,
                throttling: this.isThrottling
            });
            
        } catch (error) {
            this.logger.error('[ProcessFlowControlService] Error en verificación de recursos:', error);
        }
    }

    /**
     * Inicia el throttling del sistema
     */
    startThrottling(memoryUsage, cpuUsage) {
        this.isThrottling = true;
        this.currentConcurrency = Math.max(
            Math.floor(this.currentConcurrency / 2),
            this.config.minConcurrency
        );
        
        this.backoffDelay = Math.min(
            this.backoffDelay * this.config.backoffMultiplier || 1000,
            this.config.maxBackoffDelay
        );
        
        this.logger.warn(
            `[ProcessFlowControlService] 🚨 Throttling activado - ` +
            `Memoria: ${memoryUsage.toFixed(1)}%, CPU: ${cpuUsage.toFixed(1)}% - ` +
            `Concurrencia reducida a ${this.currentConcurrency}`
        );
        
        this.emit('throttlingStarted', {
            memory: memoryUsage,
            cpu: cpuUsage,
            newConcurrency: this.currentConcurrency
        });
    }

    /**
     * Detiene el throttling del sistema
     */
    stopThrottling() {
        this.isThrottling = false;
        this.currentConcurrency = Math.min(
            this.currentConcurrency * 2,
            this.config.maxConcurrency
        );
        this.backoffDelay = 0;
        
        this.logger.info(
            `[ProcessFlowControlService] ✅ Throttling desactivado - ` +
            `Concurrencia restaurada a ${this.currentConcurrency}`
        );
        
        this.emit('throttlingStopped', {
            newConcurrency: this.currentConcurrency
        });
        
        // Procesar operaciones pendientes
        this.processPendingOperations();
    }

    /**
     * Solicita permiso para ejecutar una operación
     */
    async requestOperation(operationId = null) {
        return new Promise((resolve) => {
            if (this.activeOperations < this.currentConcurrency && !this.isThrottling) {
                this.activeOperations++;
                resolve(true);
            } else {
                // Agregar a cola de espera
                this.pendingOperations.push({ resolve, operationId });
                
                if (this.isThrottling && this.backoffDelay > 0) {
                    setTimeout(() => {
                        this.processPendingOperations();
                    }, this.backoffDelay);
                }
            }
        });
    }

    /**
     * Libera una operación completada
     */
    releaseOperation(operationId = null) {
        if (this.activeOperations > 0) {
            this.activeOperations--;
        }
        
        // Procesar siguiente operación pendiente
        this.processPendingOperations();
    }

    /**
     * Procesa operaciones pendientes en la cola
     */
    processPendingOperations() {
        while (this.pendingOperations.length > 0 && 
               this.activeOperations < this.currentConcurrency && 
               !this.isThrottling) {
            
            const { resolve } = this.pendingOperations.shift();
            this.activeOperations++;
            resolve(true);
        }
    }

    /**
     * Obtiene el porcentaje de uso de memoria
     */
    getMemoryUsagePercentage() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        return (usedMemory / totalMemory) * 100;
    }

    /**
     * Obtiene el porcentaje de uso de CPU (promedio)
     */
    async getCpuUsagePercentage() {
        return new Promise((resolve) => {
            const startMeasure = this.getCpuInfo();
            
            setTimeout(() => {
                const endMeasure = this.getCpuInfo();
                const idleDifference = endMeasure.idle - startMeasure.idle;
                const totalDifference = endMeasure.total - startMeasure.total;
                const cpuPercentage = 100 - (100 * idleDifference / totalDifference);
                resolve(Math.max(0, Math.min(100, cpuPercentage)));
            }, 100);
        });
    }

    /**
     * Obtiene información de CPU
     */
    getCpuInfo() {
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;
        
        cpus.forEach(cpu => {
            Object.keys(cpu.times).forEach(type => {
                total += cpu.times[type];
            });
            idle += cpu.times.idle;
        });
        
        return { idle, total };
    }

    /**
     * Obtiene estadísticas actuales del servicio
     */
    getStats() {
        return {
            currentConcurrency: this.currentConcurrency,
            activeOperations: this.activeOperations,
            pendingOperations: this.pendingOperations.length,
            isThrottling: this.isThrottling,
            backoffDelay: this.backoffDelay,
            memoryUsage: this.getMemoryUsagePercentage()
        };
    }

    /**
     * Limpia recursos al destruir el servicio
     */
    destroy() {
        this.stopMonitoring();
        this.removeAllListeners();
        
        // Resolver operaciones pendientes
        this.pendingOperations.forEach(({ resolve }) => {
            resolve(false);
        });
        this.pendingOperations = [];
        
        this.logger.debug('[ProcessFlowControlService] Servicio destruido');
    }
}

export default ProcessFlowControlService;