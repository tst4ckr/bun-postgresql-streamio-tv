/**
 * Script de prueba para verificar el filtrado de canales con Dubai usando la configuración real del .env
 * Este script NO sobrescribe las variables de entorno, usa las del archivo .env
 */

import { filterBannedChannels, getBannedChannels, isChannelBanned } from './src/config/banned-channels.js';
import { Channel } from './src/domain/entities/Channel.js';

console.log('🔍 PRUEBA DE FILTRADO DUBAI CON CONFIGURACIÓN REAL');
console.log('=' .repeat(60));

// Mostrar configuración actual del .env (sin sobrescribir)
console.log('\n📋 CONFIGURACIÓN ACTUAL DEL .env:');
const bannedChannels = getBannedChannels();
console.log('BANNED_CHANNELS:', bannedChannels);
console.log('¿Incluye Dubai?:', bannedChannels.includes('Dubai'));
console.log('Cantidad de términos prohibidos:', bannedChannels.length);

// Crear canales de prueba basados en los nombres reales que aparecen en la aplicación
const testChannels = [
  // Canales con Dubai que deberían ser filtrados
  new Channel({
    id: 'tv_dubai_racing_1_hd',
    name: 'DUBAI RACING 1 HD',
    logo: 'http://example.com/logo1.png',
    streamUrl: 'http://example.com/dubai-racing-1',
    genre: 'Sports'
  }),
  new Channel({
    id: 'tv_dubai_racing_2_hd',
    name: 'DUBAI RACING 2 HD',
    logo: 'http://example.com/logo2.png',
    streamUrl: 'http://example.com/dubai-racing-2',
    genre: 'Sports'
  }),
  new Channel({
    id: 'tv_dubai_sports_1_hd',
    name: 'DUBAI SPORTS 1 HD',
    logo: 'http://example.com/logo3.png',
    streamUrl: 'http://example.com/dubai-sports-1',
    genre: 'Sports'
  }),
  new Channel({
    id: 'tv_dubai_sports_2_hd',
    name: 'DUBAI SPORTS 2 HD',
    logo: 'http://example.com/logo4.png',
    streamUrl: 'http://example.com/dubai-sports-2',
    genre: 'Sports'
  }),
  new Channel({
    id: 'tv_dubai_tv_hd',
    name: 'Dubai TV HD',
    logo: 'http://example.com/logo5.png',
    streamUrl: 'http://example.com/dubai-tv',
    genre: 'Entertainment'
  }),
  
  // Canales que NO deberían ser filtrados
  new Channel({
    id: 'tv_cnn_international',
    name: 'CNN International',
    logo: 'http://example.com/logo6.png',
    streamUrl: 'http://example.com/cnn',
    genre: 'News'
  }),
  new Channel({
    id: 'tv_bbc_world_news',
    name: 'BBC World News',
    logo: 'http://example.com/logo7.png',
    streamUrl: 'http://example.com/bbc',
    genre: 'News'
  }),
  new Channel({
    id: 'tv_espn_hd',
    name: 'ESPN HD',
    logo: 'http://example.com/logo8.png',
    streamUrl: 'http://example.com/espn',
    genre: 'Sports'
  }),
  new Channel({
    id: 'tv_discovery_channel',
    name: 'Discovery Channel',
    logo: 'http://example.com/logo9.png',
    streamUrl: 'http://example.com/discovery',
    genre: 'Documentary'
  })
];

console.log('\n🧪 PRUEBAS INDIVIDUALES:');
console.log('-'.repeat(60));

testChannels.forEach(channel => {
  const isBanned = isChannelBanned(channel.name);
  const shouldBeBanned = channel.name.toLowerCase().includes('dubai');
  const status = isBanned ? '❌ PROHIBIDO' : '✅ PERMITIDO';
  const expected = shouldBeBanned ? '(debería estar prohibido)' : '(debería estar permitido)';
  const result = (isBanned === shouldBeBanned) ? '✅' : '❌';
  
  console.log(`${result} ${channel.name} -> ${status} ${expected}`);
});

console.log('\n🔄 APLICANDO FILTRO COMPLETO:');
console.log('-'.repeat(60));

const originalCount = testChannels.length;
const filteredChannels = filterBannedChannels(testChannels);
const filteredCount = filteredChannels.length;
const removedCount = originalCount - filteredCount;

console.log(`\n📊 RESULTADOS:`);
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

// Análisis de resultados
console.log('\n🎯 ANÁLISIS DE RESULTADOS:');
console.log('-'.repeat(60));

const dubaiChannelsOriginal = testChannels.filter(ch => ch.name.toLowerCase().includes('dubai'));
const dubaiChannelsFiltered = filteredChannels.filter(ch => ch.name.toLowerCase().includes('dubai'));
const dubaiChannelsRemoved = dubaiChannelsOriginal.length - dubaiChannelsFiltered.length;

console.log(`Canales con Dubai originales: ${dubaiChannelsOriginal.length}`);
console.log(`Canales con Dubai que pasaron el filtro: ${dubaiChannelsFiltered.length}`);
console.log(`Canales con Dubai removidos: ${dubaiChannelsRemoved}`);

if (dubaiChannelsFiltered.length === 0) {
  console.log('\n✅ ÉXITO: Todos los canales con Dubai fueron filtrados correctamente');
} else {
  console.log('\n❌ PROBLEMA: Algunos canales con Dubai NO fueron filtrados:');
  dubaiChannelsFiltered.forEach(ch => {
    console.log(`   - ${ch.name}`);
  });
}

console.log('\n✅ PRUEBA COMPLETADA');
console.log('=' .repeat(60));