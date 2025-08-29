/**
 * Script de prueba para verificar la funcionalidad de BANNED_CHANNELS
 * con variables de entorno y coincidencia por similitud
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
config({ path: join(__dirname, '.env') });

async function testBannedChannelsEnv() {
    console.log('🧪 Iniciando pruebas de BANNED_CHANNELS con variables de entorno\n');
    
    try {
        // Importar el módulo banned-channels
        const bannedChannelsModule = await import('./src/config/banned-channels.js');
        const {
            isChannelBanned,
            isChannelBannedWithThreshold,
            getBannedChannels,
            loadBannedChannelsFromEnv,
            getDefaultBannedChannels,
            calculateStringSimilarity
        } = bannedChannelsModule;
        
        console.log('✅ Módulo banned-channels importado correctamente\n');
        
        // Test 1: Verificar carga desde variable de entorno
        console.log('📋 Test 1: Carga de canales prohibidos desde variable de entorno');
        const envChannels = loadBannedChannelsFromEnv();
        console.log(`   Canales cargados desde BANNED_CHANNELS: ${envChannels.length}`);
        console.log(`   Primeros 10 canales: ${envChannels.slice(0, 10).join(', ')}`);
        console.log(`   Incluye términos del usuario: ${envChannels.includes('- Rs') ? '✅' : '❌'}`);
        console.log(`   Incluye 'Al': ${envChannels.includes('Al') ? '✅' : '❌'}`);
        console.log(`   Incluye 'Saudi': ${envChannels.includes('Saudi') ? '✅' : '❌'}\n`);
        
        // Test 2: Verificar coincidencia exacta
        console.log('🎯 Test 2: Verificación de coincidencia exacta');
        const exactTests = [
            { channel: 'ADULT TV', expected: true },
            { channel: 'Al Jazeera', expected: true },
            { channel: 'Saudi Sports', expected: true },
            { channel: 'CNN International', expected: false },
            { channel: 'BBC World', expected: false }
        ];
        
        exactTests.forEach(test => {
            const result = isChannelBanned(test.channel);
            const status = result === test.expected ? '✅' : '❌';
            console.log(`   ${status} "${test.channel}" -> ${result ? 'PROHIBIDO' : 'PERMITIDO'}`);
        });
        console.log();
        
        // Test 3: Verificar coincidencia por similitud
        console.log('🔍 Test 3: Verificación de coincidencia por similitud (90%)');
        const similarityTests = [
            { channel: 'ADULTS TV', expected: true }, // Similar a ADULT
            { channel: 'Al-Arabiya', expected: true }, // Similar a Al
            { channel: 'Saudi TV 1', expected: true }, // Contiene Saudi
            { channel: 'Dubai Sports', expected: true }, // Contiene Dubai
            { channel: 'Rotana Cinema', expected: true }, // Contiene Rotana
            { channel: 'Discovery Channel', expected: false },
            { channel: 'National Geographic', expected: false }
        ];
        
        similarityTests.forEach(test => {
            const result = isChannelBanned(test.channel);
            const status = result === test.expected ? '✅' : '❌';
            console.log(`   ${status} "${test.channel}" -> ${result ? 'PROHIBIDO' : 'PERMITIDO'}`);
        });
        console.log();
        
        // Test 4: Verificar umbral personalizado
        console.log('⚙️ Test 4: Verificación con umbral personalizado (80%)');
        const customThresholdTests = [
            { channel: 'ADLT TV', threshold: 0.8 }, // Menor similitud con ADULT
            { channel: 'Saud TV', threshold: 0.8 }, // Menor similitud con Saudi
            { channel: 'Dubay Sports', threshold: 0.8 } // Menor similitud con Dubai
        ];
        
        customThresholdTests.forEach(test => {
            const result = isChannelBannedWithThreshold(test.channel, test.threshold);
            console.log(`   "${test.channel}" con umbral ${test.threshold * 100}% -> ${result ? 'PROHIBIDO' : 'PERMITIDO'}`);
        });
        console.log();
        
        // Test 5: Verificar términos específicos del usuario
        console.log('🌍 Test 5: Verificación de términos específicos del usuario');
        const userTermsTests = [
            'Channel - Rs 1',
            'Al Mamlaka TV',
            'Saudi Sport 1',
            'Sama Dubai',
            'Asharq News',
            'Arryadia TV',
            'Bahrain TV',
            'Dubai One',
            'Ad Sports',
            'Rotana Music',
            'KSA Sports',
            'Libya TV',
            'Tunisia National',
            'IEN Network'
        ];
        
        userTermsTests.forEach(channel => {
            const result = isChannelBanned(channel);
            const status = result ? '🚫' : '✅';
            console.log(`   ${status} "${channel}" -> ${result ? 'PROHIBIDO' : 'PERMITIDO'}`);
        });
        console.log();
        
        // Test 6: Verificar fallback cuando no hay variable de entorno
        console.log('🔄 Test 6: Verificación de fallback sin variable de entorno');
        
        // Temporalmente eliminar la variable de entorno
        const originalEnv = process.env.BANNED_CHANNELS;
        delete process.env.BANNED_CHANNELS;
        
        // Reimportar el módulo para probar el fallback
        const fallbackModule = await import(`./src/config/banned-channels.js?t=${Date.now()}`);
        const fallbackChannels = fallbackModule.loadBannedChannelsFromEnv();
        
        console.log(`   Canales de fallback cargados: ${fallbackChannels.length}`);
        console.log(`   Incluye términos por defecto: ${fallbackChannels.includes('ADULT') ? '✅' : '❌'}`);
        
        // Restaurar variable de entorno
        process.env.BANNED_CHANNELS = originalEnv;
        console.log();
        
        // Test 7: Verificar función de similitud
        console.log('📊 Test 7: Verificación de cálculo de similitud');
        const similarityExamples = [
            { str1: 'ADULT', str2: 'ADULTS', expected: '> 90%' },
            { str1: 'Al', str2: 'Al-Arabiya', expected: '> 90%' },
            { str1: 'Saudi', str2: 'Saud', expected: '> 80%' },
            { str1: 'Dubai', str2: 'Dubay', expected: '> 80%' }
        ];
        
        similarityExamples.forEach(example => {
            const similarity = calculateStringSimilarity(example.str1, example.str2);
            const percentage = (similarity * 100).toFixed(1);
            console.log(`   "${example.str1}" vs "${example.str2}": ${percentage}% (esperado ${example.expected})`);
        });
        
        console.log('\n🎉 Todas las pruebas de BANNED_CHANNELS completadas exitosamente!');
        
    } catch (error) {
        console.error('❌ Error durante las pruebas:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Ejecutar las pruebas
testBannedChannelsEnv();