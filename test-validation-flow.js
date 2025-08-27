/**
 * Script de prueba para validar el flujo completo de validación temprana
 * Demuestra el nuevo flujo: carga → validación temprana → conversión HTTPS→HTTP → deduplicación
 */

const { TVAddonConfig } = require('./src/infrastructure/config/TVAddonConfig');
const { HybridChannelRepository } = require('./src/infrastructure/repositories/HybridChannelRepository');
const { StreamValidationService } = require('./src/domain/services/StreamValidationService');
const { HttpsToHttpConverter } = require('./src/domain/services/HttpsToHttpConverter');

async function testValidationFlow() {
    console.log('🧪 Iniciando prueba del flujo de validación temprana\n');
    
    try {
        // 1. Configuración
        const config = TVAddonConfig.getInstance().getConfig();
        console.log('✅ Configuración cargada');
        console.log(`   - Validación temprana: ${config.validation?.enableEarlyValidation ? 'HABILITADA' : 'DESHABILITADA'}`);
        console.log(`   - Timeout: ${config.validation?.timeout || 'N/A'}ms`);
        console.log(`   - Concurrencia: ${config.validation?.concurrency || 'N/A'}`);
        console.log(`   - Tamaño de lote: ${config.validation?.batchSize || 'N/A'}\n`);
        
        // 2. Inicialización de servicios
        const validationService = new StreamValidationService(config);
        const converter = new HttpsToHttpConverter(config);
        const repository = new HybridChannelRepository(config, validationService, converter);
        
        console.log('✅ Servicios inicializados');
        console.log(`   - StreamValidationService habilitado: ${validationService.isEnabled()}`);
        console.log(`   - HttpsToHttpConverter habilitado: ${converter.isEnabled()}\n`);
        
        // 3. Carga de canales con validación temprana
        console.log('🔄 Iniciando carga de canales con validación temprana...');
        const startTime = Date.now();
        
        const channels = await repository.getAllChannels();
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log('\n✅ Carga completada');
        console.log(`   - Canales cargados: ${channels.length}`);
        console.log(`   - Tiempo total: ${duration.toFixed(2)}s`);
        
        // 4. Análisis de resultados
        const validChannels = channels.filter(ch => ch.validationStatus === 'valid');
        const invalidChannels = channels.filter(ch => ch.validationStatus === 'invalid');
        const convertedChannels = channels.filter(ch => ch.url.startsWith('http://') && ch.originalUrl?.startsWith('https://'));
        
        console.log('\n📊 Estadísticas de validación:');
        console.log(`   - Canales válidos: ${validChannels.length} (${((validChannels.length / channels.length) * 100).toFixed(1)}%)`);
        console.log(`   - Canales inválidos: ${invalidChannels.length} (${((invalidChannels.length / channels.length) * 100).toFixed(1)}%)`);
        console.log(`   - Conversiones HTTPS→HTTP: ${convertedChannels.length}`);
        
        // 5. Estadísticas del servicio de validación
        if (validationService.isEnabled()) {
            const stats = validationService.getValidationStats();
            console.log('\n📈 Estadísticas del servicio:');
            console.log(`   - Total procesados: ${stats.totalProcessed}`);
            console.log(`   - Válidos: ${stats.validCount}`);
            console.log(`   - Inválidos: ${stats.invalidCount}`);
            console.log(`   - Errores: ${stats.errorCount}`);
            console.log(`   - Cache hits: ${stats.cacheHits}`);
            console.log(`   - Cache misses: ${stats.cacheMisses}`);
        }
        
        // 6. Muestra de canales procesados
        console.log('\n🔍 Muestra de canales procesados:');
        const sampleChannels = channels.slice(0, 5);
        sampleChannels.forEach((channel, index) => {
            console.log(`   ${index + 1}. ${channel.name}`);
            console.log(`      - URL: ${channel.url}`);
            console.log(`      - Estado: ${channel.validationStatus || 'no validado'}`);
            if (channel.originalUrl) {
                console.log(`      - URL original: ${channel.originalUrl}`);
            }
        });
        
        console.log('\n🎉 Prueba completada exitosamente');
        
    } catch (error) {
        console.error('❌ Error durante la prueba:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Ejecutar la prueba
if (require.main === module) {
    testValidationFlow()
        .then(() => {
            console.log('\n✅ Script de prueba finalizado');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Error fatal:', error);
            process.exit(1);
        });
}

module.exports = { testValidationFlow };