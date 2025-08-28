/**
 * Generador de URLs de canales Astra Cesbo
 * Genera los primeros 150 canales basados en el patrón proporcionado
 * Dominio base: http://181.188.216.5:18000/play/
 * Patrón de canal: /a{número}/index.m3u8
 */

class AstraCesboChannelGenerator {
    constructor(baseUrl = 'http://181.188.216.5:18000/play') {
        this.baseUrl = baseUrl;
        this.channels = [];
    }

    /**
     * Genera un identificador de canal con formato a{número hexadecimal}
     * @param {number} channelNumber - Número del canal (en decimal)
     * @returns {string} Identificador formateado en hexadecimal
     */
    generateChannelId(channelNumber) {
        // Formato a001, a002, ..., a00a, a00b, etc. (3 dígitos hexadecimales con ceros a la izquierda)
        return `a${channelNumber.toString(16).padStart(3, '0')}`;
    }

    /**
     * Genera URL completa del canal
     * @param {string} channelId - Identificador del canal
     * @returns {string} URL completa del canal
     */
    generateChannelUrl(channelId) {
        return `${this.baseUrl}/${channelId}/index.m3u8`;
    }

    /**
     * Genera lista de canales
     * @param {number} count - Cantidad de canales a generar
     * @param {number} startFrom - Número inicial (por defecto 1)
     * @returns {Array} Lista de objetos con información del canal
     */
    generateChannels(count = 300, startFrom = 1) {
        this.channels = [];
        
        for (let i = startFrom; i < startFrom + count; i++) {
            const channelId = this.generateChannelId(i);
            const url = this.generateChannelUrl(channelId);
            
            this.channels.push({
                id: channelId,
                number: i,
                url: url,
                name: `Canal ${channelId.toUpperCase()}`,
                type: 'stream'
            });
        }
        
        return this.channels;
    }

    /**
     * Exporta canales en formato M3U
     * @returns {string} Contenido M3U
     */
    exportToM3U() {
        let m3uContent = '#EXTM3U\n';
        
        this.channels.forEach(channel => {
            m3uContent += `#EXTINF:-1,${channel.name}\n`;
            m3uContent += `${channel.url}\n`;
        });
        
        return m3uContent;
    }

    /**
     * Exporta canales en formato JSON
     * @returns {string} JSON formateado
     */
    exportToJSON() {
        return JSON.stringify({
            metadata: {
                baseUrl: this.baseUrl,
                totalChannels: this.channels.length,
                generatedAt: new Date().toISOString()
            },
            channels: this.channels
        }, null, 2);
    }

    /**
     * Exporta canales en formato CSV
     * @returns {string} Contenido CSV
     */
    exportToCSV() {
        const headers = 'ID,Number,Name,URL,Type\n';
        const rows = this.channels.map(channel => 
            `${channel.id},${channel.number},"${channel.name}",${channel.url},${channel.type}`
        ).join('\n');
        
        return headers + rows;
    }

    /**
     * Filtra canales por rango de números
     * @param {number} start - Número inicial
     * @param {number} end - Número final
     * @returns {Array} Canales filtrados
     */
    filterByRange(start, end) {
        return this.channels.filter(channel => 
            channel.number >= start && channel.number <= end
        );
    }

    /**
     * Obtiene estadísticas de los canales generados
     * @returns {Object} Estadísticas
     */
    getStats() {
        return {
            totalChannels: this.channels.length,
            baseUrl: this.baseUrl,
            firstChannel: this.channels[0]?.number || null,
            lastChannel: this.channels[this.channels.length - 1]?.number || null,
            sampleUrls: this.channels.slice(0, 5).map(ch => ch.url)
        };
    }
}

// Función principal para generar los canales
function generateAstraCesboChannels() {
    console.log('🚀 Generando canales Astra Cesbo (Versión Mejorada)...');
    
    const generator = new AstraCesboChannelGenerator();
    const channels = generator.generateChannels(300);
    
    console.log('📊 Estadísticas Detalladas:');
    const stats = generator.getStats();
    console.log({
        ...stats,
        formatoNumeracion: 'Hexadecimal',
        rangoCanales: `${channels[0].id} - ${channels[channels.length - 1].id}`,
        tipoArchivo: 'M3U8 Stream'
    });
    
    console.log('\n📋 Muestra de canales por rangos:');
    console.log('Primeros 5:');
    channels.slice(0, 5).forEach(channel => {
        console.log(`  ${channel.id}: ${channel.url}`);
    });
    
    console.log('\nRango medio (canales 148-152):');
    channels.slice(147, 152).forEach(channel => {
        console.log(`  ${channel.id}: ${channel.url}`);
    });
    
    console.log('\nÚltimos 5:');
    channels.slice(-5).forEach(channel => {
        console.log(`  ${channel.id}: ${channel.url}`);
    });
    
    return {
        generator,
        channels,
        m3u: generator.exportToM3U(),
        json: generator.exportToJSON(),
        csv: generator.exportToCSV()
    };
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Exportar para uso en otros módulos
export { AstraCesboChannelGenerator, generateAstraCesboChannels };

// Ejecutar automáticamente
const result = generateAstraCesboChannels();

// Guardar archivos de salida
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Guardar en diferentes formatos con validación
try {
    fs.writeFileSync(path.join(outputDir, 'astra-cesbo-channels.m3u'), result.m3u);
    fs.writeFileSync(path.join(outputDir, 'astra-cesbo-channels.json'), result.json);
    fs.writeFileSync(path.join(outputDir, 'astra-cesbo-channels.csv'), result.csv);
    
    console.log('\n✅ Archivos generados exitosamente en la carpeta output/');
    console.log('   📄 astra-cesbo-channels.m3u (Lista M3U)');
    console.log('   📄 astra-cesbo-channels.json (Datos estructurados)');
    console.log('   📄 astra-cesbo-channels.csv (Formato tabular)');
} catch (error) {
    console.error('❌ Error al generar archivos:', error.message);
}

// Resumen final mejorado
console.log(`\n🎯 Resumen: ${result.channels.length} canales generados correctamente`);
console.log(`📡 Dominio base: ${result.generator.baseUrl}`);
console.log(`🔢 Numeración: Hexadecimal (${result.channels[0].id} a ${result.channels[result.channels.length - 1].id})`);