/**
 * Script de prueba para verificar el filtrado de BANNED_CHANNELS
 * Verifica que los canales prohibidos sean filtrados correctamente en todos los repositorios
 */

import { filterBannedChannels } from './src/config/banned-channels.js';
import { Channel } from './src/domain/entities/Channel.js';

// Configurar variables de entorno para la prueba
process.env.BANNED_CHANNELS = 'xxx,adult,porn,sex,erotic,playboy,penthouse,brazzers';

console.log('🧪 Iniciando pruebas de filtrado BANNED_CHANNELS...');
console.log('📋 Variable BANNED_CHANNELS configurada:', process.env.BANNED_CHANNELS);
console.log('');

// Crear canales de prueba
const testChannels = [
  new Channel({
    id: 'tv_cnn_news',
    name: 'CNN News',
    streamUrl: 'http://example.com/cnn',
    genre: 'News',
    country: 'USA',
    language: 'English'
  }),
  new Channel({
    id: 'tv_xxx_adult', 
    name: 'XXX Adult Channel',
    streamUrl: 'http://example.com/xxx',
    genre: 'Entertainment',
    country: 'USA',
    language: 'English'
  }),
  new Channel({
    id: 'tv_discovery',
    name: 'Discovery Channel',
    streamUrl: 'http://example.com/discovery',
    genre: 'Documentary',
    country: 'USA',
    language: 'English'
  }),
  new Channel({
    id: 'tv_playboy',
    name: 'Playboy TV',
    streamUrl: 'http://example.com/playboy',
    genre: 'Entertainment',
    country: 'USA',
    language: 'English'
  }),
  new Channel({
    id: 'tv_espn_sports',
    name: 'ESPN Sports',
    streamUrl: 'http://example.com/espn',
    genre: 'Sports',
    country: 'USA',
    language: 'English'
  }),
  new Channel({
    id: 'tv_adult_movies',
    name: 'Adult Movies HD',
    streamUrl: 'http://example.com/adult',
    genre: 'Movies',
    country: 'USA',
    language: 'English'
  }),
  new Channel({
    id: 'tv_natgeo',
    name: 'National Geographic',
    streamUrl: 'http://example.com/natgeo',
    genre: 'Documentary',
    country: 'USA',
    language: 'English'
  }),
  new Channel({
    id: 'tv_porn_channel',
    name: 'Porn Channel',
    streamUrl: 'http://example.com/porn',
    genre: 'Entertainment',
    country: 'USA',
    language: 'English'
  }),
  new Channel({
    id: 'tv_bbc_world',
    name: 'BBC World',
    streamUrl: 'http://example.com/bbc',
    genre: 'News',
    country: 'UK',
    language: 'English'
  }),
  new Channel({
    id: 'tv_erotic',
    name: 'Erotic TV',
    streamUrl: 'http://example.com/erotic',
    genre: 'Entertainment',
    country: 'USA',
    language: 'English'
  }),
  new Channel({
    id: 'tv_history',
    name: 'History Channel',
    streamUrl: 'http://example.com/history',
    genre: 'Documentary',
    country: 'USA',
    language: 'English'
  }),
  new Channel({
    id: 'tv_brazzers',
    name: 'Brazzers Network',
    streamUrl: 'http://example.com/brazzers',
    genre: 'Entertainment',
    country: 'USA',
    language: 'English'
  })
];

console.log('📺 Canales de prueba creados:', testChannels.length);
console.log('📋 Lista de canales originales:');
testChannels.forEach((channel, index) => {
  console.log(`  ${index + 1}. ${channel.name} (${channel.genre})`);
});
console.log('');

// Aplicar filtrado de canales prohibidos
console.log('🔍 Aplicando filtrado de BANNED_CHANNELS...');
const filteredChannels = filterBannedChannels(testChannels);

console.log('✅ Canales después del filtrado:', filteredChannels.length);
console.log('📋 Lista de canales permitidos:');
filteredChannels.forEach((channel, index) => {
  console.log(`  ${index + 1}. ${channel.name} (${channel.genre})`);
});
console.log('');

// Mostrar canales filtrados
const removedChannels = testChannels.filter(original => 
  !filteredChannels.some(filtered => filtered.id === original.id)
);

console.log('❌ Canales filtrados (removidos):', removedChannels.length);
console.log('📋 Lista de canales removidos:');
removedChannels.forEach((channel, index) => {
  console.log(`  ${index + 1}. ${channel.name} (${channel.genre})`);
});
console.log('');

// Verificar resultados
const expectedBannedNames = ['XXX Adult Channel', 'Playboy TV', 'Adult Movies HD', 'Porn Channel', 'Erotic TV', 'Brazzers Network'];
const actualBannedNames = removedChannels.map(ch => ch.name);

console.log('🧪 Verificación de resultados:');
console.log('📋 Canales que deberían ser filtrados:', expectedBannedNames.join(', '));
console.log('📋 Canales realmente filtrados:', actualBannedNames.join(', '));

const allExpectedBanned = expectedBannedNames.every(name => actualBannedNames.includes(name));
const noUnexpectedBanned = actualBannedNames.every(name => expectedBannedNames.includes(name));

if (allExpectedBanned && noUnexpectedBanned) {
  console.log('✅ PRUEBA EXITOSA: Todos los canales prohibidos fueron filtrados correctamente');
  console.log('✅ PRUEBA EXITOSA: No se filtraron canales que no deberían ser filtrados');
} else {
  console.log('❌ PRUEBA FALLIDA: El filtrado no funcionó como se esperaba');
  if (!allExpectedBanned) {
    const missing = expectedBannedNames.filter(name => !actualBannedNames.includes(name));
    console.log('❌ Canales que deberían haber sido filtrados pero no lo fueron:', missing.join(', '));
  }
  if (!noUnexpectedBanned) {
    const unexpected = actualBannedNames.filter(name => !expectedBannedNames.includes(name));
    console.log('❌ Canales que fueron filtrados pero no deberían:', unexpected.join(', '));
  }
}

console.log('');
console.log('📊 Resumen:');
console.log(`  - Canales originales: ${testChannels.length}`);
console.log(`  - Canales permitidos: ${filteredChannels.length}`);
console.log(`  - Canales filtrados: ${removedChannels.length}`);
console.log(`  - Eficiencia del filtro: ${((removedChannels.length / testChannels.length) * 100).toFixed(1)}% de canales adultos removidos`);

console.log('');
console.log('🎯 Prueba de filtrado BANNED_CHANNELS completada.');