/**
 * Script de depuración para verificar el filtrado de canales con 'Dubai'
 * Este script ayuda a identificar por qué los canales con Dubai siguen apareciendo
 */

import { filterBannedChannels, isChannelBanned, normalizeChannelName, getBannedChannels } from './src/config/banned-channels.js';
import { Channel } from './src/domain/entities/Channel.js';

// Configurar variable de entorno para prueba
process.env.BANNED_CHANNELS = 'Rs,Al,Saudi,Sama,Asharq,Arryadia,Bahrain,Dubai,Ad,Rotana,ksa,libya,tunisia,ien';

console.log('🔍 DEPURACIÓN DEL FILTRADO DE CANALES DUBAI');
console.log('=' .repeat(60));

// Mostrar configuración actual
console.log('\n📋 CONFIGURACIÓN ACTUAL:');
const bannedChannels = getBannedChannels();
console.log('BANNED_CHANNELS:', bannedChannels);
console.log('¿Incluye Dubai?:', bannedChannels.includes('Dubai'));

// Crear canales de prueba basados en los nombres que aparecen en la imagen
const testChannels = [
  // Canales que deberían ser filtrados (contienen Dubai)
  new Channel({
    id: 'ch_dubai_racing_1',
    name: 'DUBAI RACING 1 HD',
    logo: 'http://example.com/logo1.png',
    streamUrl: 'http://example.com/dubai1',
    genre: 'Sports'
  }),
  new Channel({
    id: 'ch_dubai_racing_2',
    name: 'DUBAI RACING 2 HD',
    logo: 'http://example.com/logo2.png',
    streamUrl: 'http://example.com/dubai2',
    genre: 'Sports'
  }),
  new Channel({
    id: 'ch_dubai_sports_1',
    name: 'DUBAI SPORTS 1 HD',
    logo: 'http://example.com/logo3.png',
    streamUrl: 'http://example.com/dubaisports1',
    genre: 'Sports'
  }),
  new Channel({
    id: 'ch_dubai_sports_2',
    name: 'DUBAI SPORTS 2 HD',
    logo: 'http://example.com/logo4.png',
    streamUrl: 'http://example.com/dubaisports2',
    genre: 'Sports'
  }),
  new Channel({
    id: 'ch_dubai_tv',
    name: 'Dubai TV HD',
    logo: 'http://example.com/logo5.png',
    streamUrl: 'http://example.com/dubaitv',
    genre: 'Entertainment'
  }),
  
  // Canales que NO deberían ser filtrados
  new Channel({
    id: 'ch_cnn',
    name: 'CNN International',
    logo: 'http://example.com/logo6.png',
    streamUrl: 'http://example.com/cnn',
    genre: 'News'
  }),
  new Channel({
    id: 'ch_bbc',
    name: 'BBC World News',
    logo: 'http://example.com/logo7.png',
    streamUrl: 'http://example.com/bbc',
    genre: 'News'
  }),
  new Channel({
    id: 'ch_espn',
    name: 'ESPN HD',
    logo: 'http://example.com/logo8.png',
    streamUrl: 'http://example.com/espn',
    genre: 'Sports'
  })
];

console.log('\n🧪 PRUEBAS INDIVIDUALES DE CANALES:');
console.log('-'.repeat(60));

testChannels.forEach(channel => {
  const normalizedName = normalizeChannelName(channel.name);
  const isBanned = isChannelBanned(channel.name);
  
  console.log(`\n📺 Canal: "${channel.name}"`);
  console.log(`   Normalizado: "${normalizedName}"`);
  console.log(`   ¿Está prohibido?: ${isBanned ? '❌ SÍ' : '✅ NO'}`);
  
  // Verificar coincidencias específicas con 'Dubai'
  if (channel.name.toLowerCase().includes('dubai')) {
    console.log(`   🔍 Contiene 'dubai': SÍ`);
    console.log(`   🔍 Verificación manual con 'Dubai': ${isChannelBanned('Dubai')}`);
    console.log(`   🔍 Verificación manual con 'dubai': ${isChannelBanned('dubai')}`);
  }
});

console.log('\n🔄 APLICANDO FILTRO A TODOS LOS CANALES:');
console.log('-'.repeat(60));

const originalCount = testChannels.length;
const filteredChannels = filterBannedChannels(testChannels);
const filteredCount = filteredChannels.length;
const removedCount = originalCount - filteredCount;

console.log(`\n📊 RESULTADOS DEL FILTRADO:`);
console.log(`   Canales originales: ${originalCount}`);
console.log(`   Canales después del filtro: ${filteredCount}`);
console.log(`   Canales removidos: ${removedCount}`);

console.log('\n📺 CANALES QUE PASARON EL FILTRO:');
filteredChannels.forEach((channel, index) => {
  console.log(`   ${index + 1}. ${channel.name}`);
});

console.log('\n📺 CANALES QUE FUERON FILTRADOS:');
const removedChannels = testChannels.filter(original => 
  !filteredChannels.some(filtered => filtered.id === original.id)
);
removedChannels.forEach((channel, index) => {
  console.log(`   ${index + 1}. ${channel.name}`);
});

// Verificación específica del término 'Dubai'
console.log('\n🔍 VERIFICACIÓN ESPECÍFICA DEL TÉRMINO "Dubai":');
console.log('-'.repeat(60));

const dubaiTests = ['Dubai', 'dubai', 'DUBAI', 'Dubai TV', 'DUBAI RACING'];
dubaiTests.forEach(test => {
  const result = isChannelBanned(test);
  console.log(`   "${test}" -> ${result ? '❌ PROHIBIDO' : '✅ PERMITIDO'}`);
});

console.log('\n✅ DEPURACIÓN COMPLETADA');
console.log('=' .repeat(60));

if (removedCount === 0) {
  console.log('\n⚠️  PROBLEMA DETECTADO: Ningún canal fue filtrado');
  console.log('   Esto indica que el filtrado no está funcionando correctamente.');
} else if (removedChannels.some(ch => ch.name.toLowerCase().includes('dubai'))) {
  console.log('\n✅ FILTRADO FUNCIONANDO: Los canales con Dubai fueron removidos');
} else {
  console.log('\n⚠️  PROBLEMA PARCIAL: Algunos canales fueron filtrados pero no los de Dubai');
}