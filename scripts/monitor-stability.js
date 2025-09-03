#!/usr/bin/env node

/**
 * Script de monitoreo de estabilidad del sistema
 * Verifica que no ocurran reinicios inesperados durante la carga
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class StabilityMonitor {
    constructor() {
        this.startTime = Date.now();
        this.restartCount = 0;
        this.lastPid = null;
        this.logFile = path.join(__dirname, '..', 'logs', 'stability-monitor.log');
        this.isMonitoring = false;
        
        // Crear directorio de logs si no existe
        const logsDir = path.dirname(this.logFile);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    }

    /**
     * Inicia el monitoreo de estabilidad
     */
    async startMonitoring() {
        this.isMonitoring = true;
        this.log('🔍 Iniciando monitoreo de estabilidad del sistema');
        
        // Iniciar la aplicación
        await this.startApplication();
        
        // Monitorear cada 5 segundos
        this.monitorInterval = setInterval(() => {
            this.checkApplicationStatus();
        }, 5000);
        
        // Monitorear recursos del sistema cada 10 segundos
        this.resourceInterval = setInterval(() => {
            this.checkSystemResources();
        }, 10000);
        
        // Configurar manejo de señales
        process.on('SIGINT', () => this.stopMonitoring());
        process.on('SIGTERM', () => this.stopMonitoring());
        
        this.log('✅ Monitoreo iniciado correctamente');
    }

    /**
     * Inicia la aplicación principal
     */
    async startApplication() {
        return new Promise((resolve, reject) => {
            this.log('🚀 Iniciando aplicación principal...');
            
            const appPath = path.join(__dirname, '..', 'index.js');
            this.appProcess = spawn('node', [appPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: path.join(__dirname, '..')
            });
            
            this.lastPid = this.appProcess.pid;
            this.log(`📋 Aplicación iniciada con PID: ${this.lastPid}`);
            
            // Capturar salida de la aplicación
            this.appProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output.includes('🔄 Iniciando conversión HTTPS→HTTP') ||
                    output.includes('📊 Progreso validación') ||
                    output.includes('🚨 Throttling activado') ||
                    output.includes('✅ Throttling desactivado')) {
                    this.log(`[APP] ${output}`);
                }
            });
            
            this.appProcess.stderr.on('data', (data) => {
                const error = data.toString().trim();
                this.log(`[ERROR] ${error}`);
            });
            
            this.appProcess.on('exit', (code, signal) => {
                this.handleApplicationExit(code, signal);
            });
            
            this.appProcess.on('error', (error) => {
                this.log(`❌ Error en aplicación: ${error.message}`);
                reject(error);
            });
            
            // Esperar un momento para que la aplicación se inicie
            setTimeout(() => resolve(), 2000);
        });
    }

    /**
     * Maneja la salida de la aplicación
     */
    handleApplicationExit(code, signal) {
        const uptime = Date.now() - this.startTime;
        const uptimeMinutes = Math.floor(uptime / 60000);
        
        if (code === 0) {
            this.log(`✅ Aplicación terminó normalmente después de ${uptimeMinutes} minutos`);
        } else {
            this.restartCount++;
            this.log(`🚨 REINICIO DETECTADO #${this.restartCount} - Código: ${code}, Señal: ${signal}, Uptime: ${uptimeMinutes} minutos`);
            
            if (this.isMonitoring && this.restartCount < 5) {
                this.log('🔄 Reiniciando aplicación automáticamente...');
                setTimeout(() => {
                    this.startApplication();
                }, 5000);
            } else {
                this.log('❌ Demasiados reinicios detectados. Deteniendo monitoreo.');
                this.stopMonitoring();
            }
        }
    }

    /**
     * Verifica el estado de la aplicación
     */
    checkApplicationStatus() {
        if (!this.appProcess || this.appProcess.killed) {
            this.log('⚠️ Proceso de aplicación no encontrado');
            return;
        }
        
        try {
            // Verificar si el proceso sigue vivo
            process.kill(this.appProcess.pid, 0);
            
            // Si llegamos aquí, el proceso está vivo
            const uptime = Date.now() - this.startTime;
            const uptimeMinutes = Math.floor(uptime / 60000);
            
            if (uptimeMinutes > 0 && uptimeMinutes % 5 === 0) {
                this.log(`💚 Sistema estable - Uptime: ${uptimeMinutes} minutos, Reinicios: ${this.restartCount}`);
            }
        } catch (error) {
            this.log(`⚠️ Proceso no responde: ${error.message}`);
        }
    }

    /**
     * Verifica recursos del sistema
     */
    checkSystemResources() {
        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.rss / 1024 / 1024);
        
        // Obtener uso de CPU (aproximado)
        const cpuUsage = process.cpuUsage();
        
        this.log(`📊 Recursos - Memoria: ${memoryMB}MB, CPU User: ${Math.round(cpuUsage.user / 1000)}ms`);
        
        // Alertar si el uso de memoria es muy alto
        if (memoryMB > 1000) {
            this.log(`⚠️ Alto uso de memoria detectado: ${memoryMB}MB`);
        }
    }

    /**
     * Detiene el monitoreo
     */
    stopMonitoring() {
        this.isMonitoring = false;
        
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }
        
        if (this.resourceInterval) {
            clearInterval(this.resourceInterval);
        }
        
        if (this.appProcess && !this.appProcess.killed) {
            this.log('🛑 Deteniendo aplicación...');
            this.appProcess.kill('SIGTERM');
            
            setTimeout(() => {
                if (!this.appProcess.killed) {
                    this.appProcess.kill('SIGKILL');
                }
            }, 5000);
        }
        
        const totalUptime = Date.now() - this.startTime;
        const totalMinutes = Math.floor(totalUptime / 60000);
        
        this.log(`📋 Resumen del monitoreo:`);
        this.log(`   - Tiempo total: ${totalMinutes} minutos`);
        this.log(`   - Reinicios detectados: ${this.restartCount}`);
        this.log(`   - Estado: ${this.restartCount === 0 ? '✅ ESTABLE' : '⚠️ INESTABLE'}`);
        
        process.exit(0);
    }

    /**
     * Registra un mensaje en el log
     */
    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        
        console.log(logMessage);
        
        // Escribir al archivo de log
        try {
            fs.appendFileSync(this.logFile, logMessage + '\n');
        } catch (error) {
            console.error('Error escribiendo al log:', error.message);
        }
    }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    const monitor = new StabilityMonitor();
    
    console.log('🔍 Monitor de Estabilidad del Sistema');
    console.log('=====================================');
    console.log('Este script monitoreará la aplicación para detectar reinicios inesperados.');
    console.log('Presiona Ctrl+C para detener el monitoreo.\n');
    
    monitor.startMonitoring().catch(error => {
        console.error('Error iniciando monitoreo:', error);
        process.exit(1);
    });
}

export default StabilityMonitor;