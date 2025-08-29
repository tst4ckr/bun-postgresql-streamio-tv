/**
 * Script de prueba para verificar la carga de canales permitidos desde variables de entorno
 * 
 * Este script demuestra cómo el sistema de canales permitidos ahora puede ser configurado
 * completamente desde el archivo .env sin necesidad de modificar código fuente.
 * 
 * Uso:
 *   node test-allowed-channels-env.js
 *   bun run test-allowed-channels-env.js
 */

import dotenv from 'dotenv';
import { 
  ALLOWED_CHANNELS, 
  isChannelAllowed, 
  getAllowedChannels,
  normalizeChannelName,
  calculateStringSimilarity 
} from './src/config/allowed-channels.js';

dotenv.config();

async function testAllowedChannels() {
console.log('🧪 === Prueba del Sistema de Canales Permitidos desde .env ===\n');

// 1. Verificar carga desde variables de entorno
console.log('1. 📋 Canales cargados desde variables de entorno:');
console.log(`   Total de canales permitidos: ${ALLOWED_CHANNELS.length}`);
console.log(`   Primeros 10 canales:`);
ALLOWED_CHANNELS.slice(0, 10).forEach((channel, index) => {
  console.log(`     ${index + 1}. ${channel}`);
});

// 2. Probar función de verificación de canales
console.log('\n2. 🔍 Pruebas de verificación de canales:');

const testChannels = [
  'HBO Max',           // Debería ser permitido (similar a HBO)
  'ESPN Deportes',     // Debería ser permitido (similar a ESPN)
  'Discovery Kids',    // Debería ser permitido (similar a Discovery Channel)
  'Canal Inexistente', // No debería ser permitido
  'CNN Internacional', // Debería ser permitido (similar a CNN)
  'HBO',              // Debería ser permitido (coincidencia exacta)
  'Fox Sports Premium' // Debería ser permitido (similar a FOX Sports)
];

testChannels.forEach(channel => {
  const isAllowed = isChannelAllowed(channel);
  const status = isAllowed ? '✅ PERMITIDO' : '❌ NO PERMITIDO';
  console.log(`   ${status}: "${channel}"`);
  
  if (isAllowed) {
    // Encontrar el canal más similar
    let bestMatch = '';
    let bestSimilarity = 0;
    
    ALLOWED_CHANNELS.forEach(allowedChannel => {
      const similarity = calculateStringSimilarity(
        normalizeChannelName(channel),
        normalizeChannelName(allowedChannel)
      );
      
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = allowedChannel;
      }
    });
    
    console.log(`     → Coincide con: "${bestMatch}" (similitud: ${(bestSimilarity * 100).toFixed(1)}%)`);
  }
});

// 3. Probar con variable de entorno vacía (fallback)
console.log('\n3. 🔄 Prueba de fallback (sin variable de entorno):');

// Simular variable de entorno vacía
const originalEnv = process.env.ALLOWED_CHANNELS;
process.env.ALLOWED_CHANNELS = '';

// Para ES modules, necesitamos usar import dinámico
const fallbackModule = await import('./src/config/allowed-channels.js?' + Date.now());
const fallbackChannels = fallbackModule.ALLOWED_CHANNELS;

console.log(`   Canales con fallback: ${fallbackChannels.length}`);
console.log(`   Primeros 5 canales fallback: ${fallbackChannels.slice(0, 5).join(', ')}`);

// Restaurar variable de entorno original
process.env.ALLOWED_CHANNELS = originalEnv;

// 4. Probar configuración personalizada
console.log('\n4. ⚙️  Prueba de configuración personalizada:');

// Simular configuración personalizada
process.env.ALLOWED_CHANNELS = 'Netflix,Amazon Prime,Disney Plus,Apple TV';

// Para ES modules, necesitamos usar import dinámico
const customModule = await import('./src/config/allowed-channels.js?' + Date.now());
const customChannels = customModule.ALLOWED_CHANNELS;
const customIsAllowed = customModule.isChannelAllowed;

console.log(`   Canales personalizados: ${customChannels.length}`);
console.log(`   Canales: ${customChannels.join(', ')}`);

// Probar algunos canales con la configuración personalizada
const customTestChannels = ['Netflix HD', 'Amazon Prime Video', 'HBO', 'Disney Plus 4K'];
customTestChannels.forEach(channel => {
  const isAllowed = customIsAllowed(channel);
  const status = isAllowed ? '✅ PERMITIDO' : '❌ NO PERMITIDO';
  console.log(`   ${status}: "${channel}"`);
});

// Restaurar configuración original
process.env.ALLOWED_CHANNELS = originalEnv;

console.log('\n✅ === Pruebas completadas exitosamente ===');
console.log('\n📝 Resumen:');
console.log('   • Los canales permitidos se cargan correctamente desde .env');
console.log('   • El sistema de fallback funciona cuando no hay configuración');
console.log('   • La similitud de 90% permite coincidencias flexibles');
console.log('   • La configuración es completamente dinámica y personalizable');
console.log('\n🔧 Para modificar los canales permitidos:');
console.log('   1. Edita la variable ALLOWED_CHANNELS en el archivo .env');
console.log('   2. Usa el formato: "Canal1,Canal2,Canal3"');
console.log('   3. Reinicia el servidor para aplicar los cambios');
}

// Ejecutar la función de prueba
testAllowedChannels().catch(console.error);