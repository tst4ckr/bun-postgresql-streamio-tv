#!/usr/bin/env node
/**
 * @fileoverview Script de prueba para verificar el filtrado de BANNED_CHANNELS
 * Verifica que los canales con términos prohibidos sean filtrados correctamente
 */

import { config } from 'dotenv';
import { filterBannedChannels, isChannelBannedByAnyReason } from './src/config/banned-channels.js';
import { Channel } from './src/domain/entities/Channel.js';

// Cargar variables de entorno
config();

/**
 * Canales de prueba que incluyen términos prohibidos
 */
const testChannels = [
  // Canales que DEBEN ser filtrados (contienen términos prohibidos)
  new Channel({
    id: 'tv_adult_1',
    name: 'ADULT Channel HD',
    streamUrl: 'http://example.com/adult',
    genre: 'Entertainment',
    country: 'US'
  }),
  new Channel({
    id: 'tv_xxx_1',
    name: 'XXX Movies',
    streamUrl: 'http://example.com/xxx',
    genre: 'Entertainment',
    country: 'US'
  }),
  new Channel({
    id: 'tv_porn_1',
    name: 'PORN HD',
    streamUrl: 'http://example.com/porn',
    genre: 'Entertainment',
    country: 'US'
  }),
  new Channel({
    id: 'tv_playboy_1',
    name: 'Playboy TV',
    streamUrl: 'http://example.com/playboy',
    genre: 'Entertainment',
    country: 'US'
  }),
  new Channel({
    id: 'tv_saudi_1',
    name: 'Saudi Sports',
    streamUrl: 'http://example.com/saudi',
    genre: 'Sports',
    country: 'SA'
  }),
  new Channel({
    id: 'tv_al_jazeera',
    name: 'Al Jazeera News',
    streamUrl: 'http://example.com/aljazeera',
    genre: 'News',
    country: 'QA'
  }),
  new Channel({
    id: 'tv_extreme_1',
    name: 'EXTREME Sports',
    streamUrl: 'http://example.com/extreme',
    genre: 'Sports',
    country: 'US'
  }),
  new Channel({
    id: 'tv_violence_1',
    name: 'VIOLENCE Movies',
    streamUrl: 'http://example.com/violence',
    genre: 'Movies',
    country: 'US'
  }),
  
  // Canales que NO deben ser filtrados (nombres normales)
  new Channel({
    id: 'tv_normal_1',
    name: 'CNN International',
    streamUrl: 'http://example.com/cnn',
    genre: 'News',
    country: 'US'
  }),
  new Channel({
    id: 'tv_normal_2',
    name: 'Discovery Channel',
    streamUrl: 'http://example.com/discovery',
    genre: 'Documentary',
    country: 'US'
  }),
  new Channel({
    id: 'tv_normal_3',
    name: 'ESPN Sports',
    streamUrl: 'http://example.com/espn',
    genre: 'Sports',
    country: 'US'
  }),
  new Channel({
    id: 'tv_normal_4',
    name: 'National Geographic',
    streamUrl: 'http://example.com/natgeo',
    genre: 'Documentary',
    country: 'US'
  })
];

/**
 * Ejecuta las pruebas de filtrado
 */
function runBannedChannelsTest() {
  console.log('🧪 Iniciando pruebas de filtrado de BANNED_CHANNELS\n');
  
  // Verificar que la variable de entorno esté configurada
  const bannedChannelsEnv = process.env.BANNED_CHANNELS;
  if (!bannedChannelsEnv) {
    console.error('❌ ERROR: Variable de entorno BANNED_CHANNELS no está configurada');
    console.log('💡 Asegúrate de que el archivo .env contenga: BANNED_CHANNELS=ADULT,XXX,PORN,SEX,EROTIC,PLAYBOY,HUSTLER,VIVID,BRAZZERS,NAUGHTY,Rs,Al,Saudi,Sama,Asharq,Arryadia,Bahrain,Dubai,Ad,Rotana,ksa,libya,tunisia,ien,EXTREME,VIOLENCE,GORE,HORROR,TERROR');
    process.exit(1);
  }
  
  console.log(`✅ Variable BANNED_CHANNELS configurada: ${bannedChannelsEnv}\n`);
  
  // Probar filtrado individual
  console.log('🔍 Probando filtrado individual de canales:');
  testChannels.forEach(channel => {
    const isBanned = isChannelBannedByAnyReason(channel);
    const shouldBeBanned = [
      'tv_adult_1', 'tv_xxx_1', 'tv_porn_1', 'tv_playboy_1', 
      'tv_saudi_1', 'tv_al_jazeera', 'tv_extreme_1', 'tv_violence_1'
    ].includes(channel.id);
    
    const status = isBanned === shouldBeBanned ? '✅' : '❌';
    const action = isBanned ? 'FILTRADO' : 'PERMITIDO';
    
    console.log(`  ${status} ${channel.name} (${channel.id}) - ${action}`);
    
    if (isBanned !== shouldBeBanned) {
      console.log(`    ⚠️  Esperado: ${shouldBeBanned ? 'FILTRADO' : 'PERMITIDO'}, Obtenido: ${action}`);
    }
  });
  
  // Probar filtrado masivo
  console.log('\n🔍 Probando filtrado masivo:');
  const originalCount = testChannels.length;
  const filteredChannels = filterBannedChannels(testChannels);
  const finalCount = filteredChannels.length;
  const removedCount = originalCount - finalCount;
  
  console.log(`  📊 Canales originales: ${originalCount}`);
  console.log(`  📊 Canales filtrados: ${finalCount}`);
  console.log(`  📊 Canales removidos: ${removedCount}`);
  
  // Verificar que se removieron los canales correctos
  const expectedRemovedCount = 8; // tv_adult_1, tv_xxx_1, tv_porn_1, tv_playboy_1, tv_saudi_1, tv_al_jazeera, tv_extreme_1, tv_violence_1
  const expectedFinalCount = 4; // tv_normal_1, tv_normal_2, tv_normal_3, tv_normal_4
  
  if (removedCount === expectedRemovedCount && finalCount === expectedFinalCount) {
    console.log('  ✅ Filtrado masivo correcto');
  } else {
    console.log(`  ❌ Filtrado masivo incorrecto - Esperado: ${expectedRemovedCount} removidos, ${expectedFinalCount} finales`);
  }
  
  // Mostrar canales que pasaron el filtro
  console.log('\n📋 Canales que pasaron el filtro:');
  filteredChannels.forEach(channel => {
    console.log(`  ✅ ${channel.name} (${channel.id})`);
  });
  
  // Mostrar canales que fueron filtrados
  const removedChannels = testChannels.filter(channel => 
    !filteredChannels.some(filtered => filtered.id === channel.id)
  );
  
  console.log('\n🚫 Canales que fueron filtrados:');
  removedChannels.forEach(channel => {
    console.log(`  ❌ ${channel.name} (${channel.id})`);
  });
  
  // Resumen final
  console.log('\n📈 Resumen de la prueba:');
  const allTestsPassed = removedCount === expectedRemovedCount && finalCount === expectedFinalCount;
  
  if (allTestsPassed) {
    console.log('  🎉 ¡Todas las pruebas pasaron exitosamente!');
    console.log('  ✅ El filtrado de BANNED_CHANNELS funciona correctamente');
  } else {
    console.log('  ⚠️  Algunas pruebas fallaron');
    console.log('  ❌ Revisar la configuración de BANNED_CHANNELS');
  }
  
  return allTestsPassed;
}

// Ejecutar las pruebas si el script se ejecuta directamente
if (process.argv[1] && process.argv[1].endsWith('test-banned-channels-filtering.js')) {
  try {
    const success = runBannedChannelsTest();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Error durante las pruebas:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

export { runBannedChannelsTest };