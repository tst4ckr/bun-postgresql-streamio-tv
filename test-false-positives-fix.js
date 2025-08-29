/**
 * Script de prueba para verificar que los falsos positivos han sido corregidos
 * Específicamente para los términos problemáticos reportados por el usuario
 */

import { isChannelBanned, getBannedChannels } from './src/config/banned-channels.js';

console.log('🔍 Verificando corrección de falsos positivos\n');

// Casos que DEBERÍAN ser baneados (verdaderos positivos)
const shouldBeBanned = [
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
    'Channel - Rs 1'
];

// Casos que NO deberían ser baneados (evitar falsos positivos)
const shouldNotBeBanned = [
    'Alien Channel',        // Contiene 'Al' pero como parte de 'Alien'
    'Advertisement TV',     // Contiene 'Ad' pero como parte de 'Advertisement'
    'Algeria National',     // Contiene 'Al' pero como parte de 'Algeria'
    'Adriatic TV',         // Contiene 'Ad' pero como parte de 'Adriatic'
    'Patient Care',        // Contiene 'ien' pero como parte de 'Patient'
    'Science Channel',     // Contiene 'ien' pero como parte de 'Science'
    'Ancient History',     // Contiene 'ien' pero como parte de 'Ancient'
    'Alien Discovery',     // Contiene 'Al' y 'ien' pero como partes de otras palabras
    'Gradient TV',         // Contiene 'Ad' pero como parte de 'Gradient'
    'Radiant News'         // Contiene 'Ad' pero como parte de 'Radiant'
];

console.log('📋 Términos prohibidos configurados:');
const bannedChannels = getBannedChannels();
console.log(`Total: ${bannedChannels.length} términos`);
console.log('Términos cortos (≤3 chars):', bannedChannels.filter(term => term.length <= 3).join(', '));
console.log('');

console.log('✅ Verificando canales que DEBERÍAN ser baneados:\n');
let correctBans = 0;
let totalShouldBeBanned = shouldBeBanned.length;

shouldBeBanned.forEach(channel => {
    const isBanned = isChannelBanned(channel);
    const status = isBanned ? '✅ CORRECTO' : '❌ ERROR';
    console.log(`   ${channel.padEnd(20)} -> ${isBanned ? 'BANEADO' : 'PERMITIDO'} ${status}`);
    if (isBanned) correctBans++;
});

console.log(`\n📊 Resultado: ${correctBans}/${totalShouldBeBanned} canales correctamente baneados\n`);

console.log('🚫 Verificando canales que NO deberían ser baneados (falsos positivos):\n');
let correctAllows = 0;
let totalShouldNotBeBanned = shouldNotBeBanned.length;

shouldNotBeBanned.forEach(channel => {
    const isBanned = isChannelBanned(channel);
    const status = !isBanned ? '✅ CORRECTO' : '❌ FALSO POSITIVO';
    console.log(`   ${channel.padEnd(20)} -> ${isBanned ? 'BANEADO' : 'PERMITIDO'} ${status}`);
    if (!isBanned) correctAllows++;
});

console.log(`\n📊 Resultado: ${correctAllows}/${totalShouldNotBeBanned} canales correctamente permitidos\n`);

// Resumen final
const totalCorrect = correctBans + correctAllows;
const totalTests = totalShouldBeBanned + totalShouldNotBeBanned;
const accuracy = ((totalCorrect / totalTests) * 100).toFixed(1);

console.log('📈 RESUMEN FINAL:');
console.log(`   Precisión general: ${accuracy}% (${totalCorrect}/${totalTests})`);
console.log(`   Verdaderos positivos: ${correctBans}/${totalShouldBeBanned}`);
console.log(`   Verdaderos negativos: ${correctAllows}/${totalShouldNotBeBanned}`);
console.log(`   Falsos positivos: ${totalShouldNotBeBanned - correctAllows}`);
console.log(`   Falsos negativos: ${totalShouldBeBanned - correctBans}`);

if (accuracy >= 95) {
    console.log('\n🎉 ¡Excelente! El sistema de filtrado funciona correctamente.');
} else if (accuracy >= 85) {
    console.log('\n⚠️  El sistema funciona bien pero puede necesitar ajustes menores.');
} else {
    console.log('\n❌ El sistema necesita mejoras significativas.');
}

console.log('\n🏁 Verificación de falsos positivos completada.');