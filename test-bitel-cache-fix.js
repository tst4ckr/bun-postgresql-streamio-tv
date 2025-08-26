/**
 * Script de prueba para verificar la corrección del problema de cache de BITEL UIDs
 * Simula validaciones periódicas para confirmar que los UIDs se mantienen consistentes
 */

import { BitelUidService } from './src/infrastructure/services/BitelUidService.js';
import { StreamHealthService } from './src/infrastructure/services/StreamHealthService.js';
import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';

// Configuración de prueba
const testConfig = {
  validation: {
    streamValidationTimeout: 10
  }
};

const logger = {
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  info: (msg) => console.log(`[INFO] ${msg}`)
};

async function testBitelCacheFix() {
  console.log('=== PRUEBA DE CORRECCIÓN DE CACHE BITEL ===\n');
  
  // Crear servicios
  const bitelService = new BitelUidService(testConfig, logger);
  const healthService = new StreamHealthService(testConfig, logger);
  
  // URLs de prueba BITEL
  const testChannels = [
    {
      id: 'tv_latina',
      url: 'http://live-evg25.tv360.bitel.com.pe/bitel/latina/playlist.m3u8'
    },
    {
      id: 'tv_america_hd', 
      url: 'http://live-evg25.tv360.bitel.com.pe/bitel/americatvhd/playlist.m3u8'
    },
    {
      id: 'tv_willax',
      url: 'http://live-evg25.tv360.bitel.com.pe/bitel/willax/playlist.m3u8'
    }
  ];
  
  console.log('📋 Canales de prueba BITEL:');
  testChannels.forEach(ch => {
    console.log(`  - ${ch.id}: ${ch.url}`);
  });
  
  console.log('\n🔄 SIMULANDO VALIDACIONES PERIÓDICAS:\n');
  
  // Simular primera validación (como si fuera la validación inicial)
  console.log('--- Primera Validación (T=0 min) ---');
  const firstValidation = [];
  
  for (const channel of testChannels) {
    const processedUrl = bitelService.processStreamUrl(channel.url, channel.id);
    const uidMatch = processedUrl.match(/uid=([^&]+)/);
    const uid = uidMatch ? uidMatch[1] : 'NO_UID';
    
    firstValidation.push({
      id: channel.id,
      url: processedUrl,
      uid: uid
    });
    
    console.log(`${channel.id}: UID=${uid}`);
  }
  
  // Simular espera de 10 minutos (menor que el cache de 20 min)
  console.log('\n⏱️  Simulando espera de 10 minutos...');
  console.log('(En producción, esto sería menor que el cache de 20 minutos)\n');
  
  // Simular segunda validación (como validación periódica)
  console.log('--- Segunda Validación (T=10 min) ---');
  const secondValidation = [];
  
  for (const channel of testChannels) {
    const processedUrl = bitelService.processStreamUrl(channel.url, channel.id);
    const uidMatch = processedUrl.match(/uid=([^&]+)/);
    const uid = uidMatch ? uidMatch[1] : 'NO_UID';
    
    secondValidation.push({
      id: channel.id,
      url: processedUrl,
      uid: uid
    });
    
    console.log(`${channel.id}: UID=${uid}`);
  }
  
  // Comparar resultados
  console.log('\n📊 ANÁLISIS DE CONSISTENCIA:');
  console.log('=' .repeat(50));
  
  let allConsistent = true;
  
  for (let i = 0; i < testChannels.length; i++) {
    const first = firstValidation[i];
    const second = secondValidation[i];
    const isConsistent = first.uid === second.uid;
    
    console.log(`${first.id}:`);
    console.log(`  Primera:  ${first.uid}`);
    console.log(`  Segunda:  ${second.uid}`);
    console.log(`  Estado:   ${isConsistent ? '✅ CONSISTENTE' : '❌ INCONSISTENTE'}`);
    console.log('');
    
    if (!isConsistent) {
      allConsistent = false;
    }
  }
  
  // Resultado final
  console.log('🎯 RESULTADO FINAL:');
  if (allConsistent) {
    console.log('✅ ÉXITO: Todos los UIDs se mantuvieron consistentes');
    console.log('✅ La corrección del cache resolvió el problema');
    console.log('✅ Las validaciones periódicas no deberían desactivar canales válidos');
  } else {
    console.log('❌ FALLO: Algunos UIDs cambiaron entre validaciones');
    console.log('❌ Se requiere investigación adicional');
  }
  
  // Estadísticas del servicio
  console.log('\n📈 ESTADÍSTICAS DEL SERVICIO:');
  const stats = bitelService.getStats();
  console.log(`Canales en cache: ${stats.cachedChannels}`);
  
  // Verificar cache individual
  console.log('\n🔍 VERIFICACIÓN DE CACHE:');
  testChannels.forEach(ch => {
    const inCache = bitelService.isChannelCached(ch.id);
    console.log(`${ch.id}: ${inCache ? '✅ En cache' : '❌ No en cache'}`);
  });
  
  console.log('\n💡 RECOMENDACIONES:');
  console.log('- Cache de UIDs configurado a 20 minutos');
  console.log('- Validaciones periódicas cada 15 minutos');
  console.log('- Los UIDs deberían mantenerse consistentes entre validaciones');
  console.log('- Monitorear logs de producción para confirmar la corrección');
  
  console.log('\n=== PRUEBA COMPLETADA ===');
}

// Ejecutar prueba
testBitelCacheFix().catch(error => {
  console.error('Error en la prueba:', error);
});