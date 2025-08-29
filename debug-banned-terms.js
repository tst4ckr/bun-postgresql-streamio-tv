/**
 * Script de depuración para verificar el filtrado de términos específicos
 * Analiza por qué ciertos términos no están siendo filtrados correctamente
 */

import { 
    isChannelBanned, 
    isChannelBannedWithThreshold,
    getBannedChannels,
    calculateStringSimilarity,
    setSimilarityThreshold
} from './src/config/banned-channels.js';

console.log('🔍 Iniciando depuración de términos prohibidos específicos\n');

// Términos que deberían estar siendo filtrados
const problematicTerms = [
    '- Rs', 'Al', 'Saudi', 'Sama', 'Asharq', 'Arryadia', 
    'Bahrain', 'Dubai', 'Ad', 'Rotana', 'ksa', 'libya', 
    'tunisia', 'ien'
];

// Ejemplos de nombres de canales que podrían contener estos términos
const testChannels = [
    'Al Jazeera',
    'Al Arabiya', 
    'Saudi TV',
    'Dubai Sports',
    'Rotana Cinema',
    'Bahrain TV',
    'Asharq News',
    'Sama TV',
    'Ad Sports',
    'KSA Sports',
    'Libya TV',
    'Tunisia National',
    'Alien Channel', // Contiene 'Al' pero no debería ser filtrado
    'Advertisement Channel', // Contiene 'Ad' pero no debería ser filtrado
    'Algeria TV', // Contiene 'Al' pero no debería ser filtrado
    'Adult Channel', // Contiene 'Ad' pero SÍ debería ser filtrado por 'ADULT'
];

console.log('📋 Términos prohibidos configurados:');
const bannedChannels = getBannedChannels();
console.log(bannedChannels.join(', '));
console.log(`\n📊 Total de términos prohibidos: ${bannedChannels.length}\n`);

console.log('🧪 Probando filtrado con términos específicos:\n');

// Probar cada término problemático
problematicTerms.forEach(term => {
    console.log(`\n🔍 Analizando término: "${term}"`);
    
    // Verificar si el término está en la lista
    const isInList = bannedChannels.includes(term);
    console.log(`   ✓ Está en lista prohibida: ${isInList}`);
    
    // Probar canales que contienen este término
    const matchingChannels = testChannels.filter(channel => 
        channel.toLowerCase().includes(term.toLowerCase())
    );
    
    if (matchingChannels.length > 0) {
        console.log(`   📺 Canales que contienen "${term}":`);
        matchingChannels.forEach(channel => {
            const isBanned = isChannelBanned(channel);
            const similarity = calculateStringSimilarity(channel.toLowerCase(), term.toLowerCase());
            console.log(`      - "${channel}" -> Baneado: ${isBanned}, Similitud: ${similarity.toFixed(3)}`);
        });
    }
});

console.log('\n\n🔬 Análisis detallado de casos específicos:\n');

// Casos específicos para analizar
const specificCases = [
    { channel: 'Al Jazeera', expectedBanned: true, reason: 'Contiene "Al"' },
    { channel: 'Saudi TV', expectedBanned: true, reason: 'Contiene "Saudi"' },
    { channel: 'Dubai Sports', expectedBanned: true, reason: 'Contiene "Dubai"' },
    { channel: 'Alien Channel', expectedBanned: false, reason: 'Contiene "Al" pero como parte de "Alien"' },
    { channel: 'Advertisement', expectedBanned: false, reason: 'Contiene "Ad" pero como parte de "Advertisement"' },
];

specificCases.forEach(testCase => {
    console.log(`\n📺 Canal: "${testCase.channel}"`);
    console.log(`   📝 Razón: ${testCase.reason}`);
    console.log(`   🎯 Esperado baneado: ${testCase.expectedBanned}`);
    
    const actualBanned = isChannelBanned(testCase.channel);
    console.log(`   ✅ Resultado actual: ${actualBanned}`);
    
    const status = actualBanned === testCase.expectedBanned ? '✅ CORRECTO' : '❌ INCORRECTO';
    console.log(`   ${status}`);
    
    // Análisis detallado de por qué fue o no fue baneado
    console.log(`   🔍 Análisis detallado:`);
    
    bannedChannels.forEach(bannedTerm => {
        const channelLower = testCase.channel.toLowerCase();
        const termLower = bannedTerm.toLowerCase();
        
        // Coincidencia exacta
        const exactMatch = channelLower === termLower;
        if (exactMatch) {
            console.log(`      - Coincidencia exacta con "${bannedTerm}"`);
            return;
        }
        
        // Similitud
        const similarity = calculateStringSimilarity(channelLower, termLower);
        if (similarity >= 0.9) {
            console.log(`      - Similitud alta (${similarity.toFixed(3)}) con "${bannedTerm}"`);
        }
        
        // Contención
        if (bannedTerm.length <= 2) {
            // Para términos cortos, usar coincidencia de palabra completa
            const regex = new RegExp(`\\b${bannedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(testCase.channel)) {
                console.log(`      - Coincidencia de palabra completa con "${bannedTerm}"`);
            }
        } else {
            // Para términos largos, usar contención normal
            if (channelLower.includes(termLower)) {
                console.log(`      - Contiene el término "${bannedTerm}"`);
            }
        }
    });
});

console.log('\n\n🎯 Recomendaciones:\n');
console.log('1. Verificar que los términos cortos como "Al" y "Ad" usen coincidencia de palabra completa');
console.log('2. Confirmar que el umbral de similitud (0.9) es apropiado');
console.log('3. Revisar la lógica de contención para términos específicos');
console.log('4. Considerar usar expresiones regulares más específicas para términos ambiguos');

console.log('\n🏁 Depuración completada.');